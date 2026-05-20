import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { PlayerCacheService } from './player-cache.service';
import { PlayerPresenceService } from './player-presence.service';
import { AnswerQueueService, QueuedAnswer } from './answer-queue.service';
import { GAME_CONSTANTS } from 'src/common/constants';

export enum GameState {
  WAITING = 'WAITING',
  STARTING = 'STARTING',
  QUESTION_ACTIVE = 'QUESTION_ACTIVE',
  QUESTION_RESULT = 'QUESTION_RESULT',
  LEADERBOARD = 'LEADERBOARD',
  FINISHED = 'FINISHED',
}

interface GameCache {
  sessionId: string;
  roomId: string;
  status: GameState;
  currentQuestionIndex: number;
  totalQuestions: number;
  questionStartedAt: number | null;
  timeLimit: number;
  questionIds: string[];
  /** Timer version - incremented each time a new timer is scheduled */
  timerVersion: number;
  /** Question version - incremented each time question changes (start/end) */
  questionVersion: number;
}

interface QuestionTimer {
  sessionId: string;
  timeout: NodeJS.Timeout;
  questionIndex: number;
  scheduledAt: number;
  totalMs: number;
  /** Timer version at schedule time - used to detect stale callbacks */
  timerVersion: number;
}

/**
 * Source of truth mapping for game session state:
 * - Redis Cache (game:{sessionId}): Real-time runtime state (status, questionIndex, timerVersion)
 * - Prisma DB (GameSession): Persistent state for recovery and audit
 * - Redis Leaderboard (leaderboard:{sessionId}): Sorted set of scores
 * 
 * Write order policy:
 * - For status changes: Update Redis FIRST, then DB (Redis is authoritative for runtime)
 * - For question transitions: Update cache atomically with version increment
 * - For score changes: Write to Redis leaderboard and DB in same logical operation
 */

@Injectable()
export class GameSessionService {
  private readonly logger = new Logger(GameSessionService.name);

  private activeTimers = new Map<string, QuestionTimer>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly playerCache: PlayerCacheService,
    private readonly presenceService: PlayerPresenceService,
    private readonly answerQueue: AnswerQueueService,
  ) {}

  async startGame(roomId: string, hostId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        players: true,
        quiz: {
          include: {
            questions: {
              where: { deletedAt: null },
              include: { answers: { where: { deletedAt: null } } },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only host can start the game');
    }

    if (room.status !== 'WAITING') {
      throw new BadRequestException('Game already started or finished');
    }

    if (room.players.length === 0) {
      throw new BadRequestException('No players in room');
    }

    if (!room.quiz.questions || room.quiz.questions.length === 0) {
      throw new BadRequestException('Quiz has no questions');
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const gameSession = await tx.gameSession.create({
        data: {
          roomId,
          status: 'WAITING' as any,
          currentQuestionIndex: 0,
          questionStartedAt: new Date(),
        },
      });

      await tx.playerSession.createMany({
        data: room.players.map((p) => ({
          playerId: p.id,
          sessionId: gameSession.id,
          score: 0,
        })),
      });

      await tx.room.update({
        where: { id: roomId },
        data: { status: 'PLAYING' as any },
      });

      return gameSession;
    });

    const questionIds = room.quiz.questions.map((q) => q.id);
    const firstQuestion = room.quiz.questions[0];

    const gameCache: GameCache = {
      sessionId: session.id,
      roomId,
      status: GameState.QUESTION_ACTIVE,
      currentQuestionIndex: 0,
      totalQuestions: room.quiz.questions.length,
      questionStartedAt: Date.now(),
      timeLimit: firstQuestion.timeLimit || 20,
      questionIds,
      timerVersion: 1,
      questionVersion: 1,
    };

    await this.redis.set(
      `game:${session.id}`,
      JSON.stringify(gameCache),
      'EX',
      GAME_CONSTANTS.GAME_CACHE_TTL,
    );

    // Add regular players to leaderboard (their player.id values)
    await this.initLeaderboard(session.id, room.players.map((p) => p.id));

    // Warm up player name cache in BACKGROUND - don't block game start!
    this.playerCache.warmupSessionCache(session.id).catch((e) =>
      this.logger.warn(`Cache warmup failed (non-critical): ${e.message}`),
    );

    this.logger.log(
      `Game session ${session.id} started for room ${roomId} | ${room.players.length} players`,
    );

    return {
      session,
      questionIds,
      totalQuestions: room.quiz.questions.length,
      firstQuestion: {
        id: firstQuestion.id,
        content: firstQuestion.content,
        answers: firstQuestion.answers.map((a) => ({
          id: a.id,
          content: a.content,
        })),
        timeLimit: firstQuestion.timeLimit || 20,
      },
    };
  }

  async getCurrentQuestion(sessionId: string) {
    const room = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        room: {
          include: {
            quiz: {
              include: {
                questions: {
                  where: { deletedAt: null },
                  include: { answers: { where: { deletedAt: null } } },
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Session not found');
    }

    const currentIndex = room.currentQuestionIndex;
    const question = room.room.quiz.questions[currentIndex];

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return {
      questionIndex: currentIndex,
      question: {
        id: question.id,
        content: question.content,
        answers: question.answers.map((a) => ({
          id: a.id,
          content: a.content,
        })),
        timeLimit: question.timeLimit || 20,
      },
      totalQuestions: room.room.quiz.questions.length,
    };
  }

  async handleQuestionEnd(sessionId: string, callback: (data: any) => void): Promise<{ questionIndex: number; isLastQuestion: boolean }> {
    // STEP 1: Read current state (Redis cache is authoritative for runtime state)
    const cached = await this.getGameCache(sessionId);
    if (!cached) {
      throw new NotFoundException('Game not found in cache');
    }

    // CRITICAL: Validate we're in QUESTION_ACTIVE state
    // If status changed (e.g., host ended game), skip processing
    if (cached.status !== GameState.QUESTION_ACTIVE) {
      this.logger.warn(`[handleQuestionEnd:${sessionId}] Skipping - game status is ${cached.status}, not QUESTION_ACTIVE`);
      return { questionIndex: cached.currentQuestionIndex, isLastQuestion: cached.currentQuestionIndex >= cached.totalQuestions - 1 };
    }

    // STEP 2: Fetch full session data from DB for question details
    const room = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        room: {
          include: {
            quiz: {
              include: {
                questions: {
                  where: { deletedAt: null },
                  include: { answers: { where: { deletedAt: null } } },
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
            players: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Session not found');
    }

    const currentQuestion = room.room.quiz.questions[cached.currentQuestionIndex];
    const correctAnswer = currentQuestion.answers.find((a) => a.isCorrect);
    const isLastQuestion = cached.currentQuestionIndex >= cached.totalQuestions - 1;

    const resultData = {
      questionIndex: cached.currentQuestionIndex,
      correctAnswer: correctAnswer
        ? { id: correctAnswer.id, content: correctAnswer.content }
        : null,
      isLastQuestion,
      question: {
        id: currentQuestion.id,
        content: currentQuestion.content,
      },
    };

    // STEP 3: Update cache status FIRST (Redis authoritative for runtime)
    // Increment questionVersion to invalidate any pending timer callbacks
    await this.updateGameCache(sessionId, {
      status: GameState.QUESTION_RESULT,
      questionStartedAt: null,
      timerVersion: (cached.timerVersion || 0) + 1,
    }, 'handleQuestionEnd');

    // STEP 4: Update DB SECOND (for persistence/recovery)
    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { currentQuestionIndex: cached.currentQuestionIndex },
    });

    // STEP 5: Get leaderboard AFTER cache update
    const leaderboard = await this.getLeaderboard(sessionId);
    resultData['leaderboard'] = leaderboard.slice(0, 10);

    // STEP 6: Invoke callback with complete data
    callback(resultData);

    // STEP 7: Auto-end game if last question
    if (isLastQuestion) {
      await this.endGame(sessionId, callback);
    }

    return { questionIndex: cached.currentQuestionIndex, isLastQuestion };
  }

  async nextQuestion(sessionId: string, callback: (data: any) => void): Promise<{ questionIndex: number; question: any; totalQuestions: number }> {
    // STEP 1: Read current cache state
    const cached = await this.getGameCache(sessionId);
    if (!cached) {
      throw new NotFoundException('Game not found in cache');
    }

    // STEP 2: Validate state - must be in QUESTION_RESULT to advance
    if (cached.status !== GameState.QUESTION_RESULT) {
      throw new BadRequestException(`Cannot advance question - game status is ${cached.status}, expected QUESTION_RESULT`);
    }

    const nextIndex = cached.currentQuestionIndex + 1;
    if (nextIndex >= cached.totalQuestions) {
      throw new BadRequestException('No more questions');
    }

    // STEP 3: Fetch full session data from DB
    const room = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        room: {
          include: {
            quiz: {
              include: {
                questions: {
                  where: { deletedAt: null },
                  include: { answers: { where: { deletedAt: null } } },
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Session not found');
    }

    // STEP 4: Re-validate state after DB read (detect race with handleQuestionEnd)
    const recheckCache = await this.getGameCache(sessionId);
    if (!recheckCache || recheckCache.status !== GameState.QUESTION_RESULT) {
      throw new ConflictException('Game state changed during transition');
    }
    if (recheckCache.currentQuestionIndex !== cached.currentQuestionIndex) {
      throw new ConflictException('Question already advanced');
    }

    // STEP 5: Update DB first (for consistency with other services)
    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        currentQuestionIndex: nextIndex,
        questionStartedAt: new Date(),
      },
    });

    const nextQuestion = room.room.quiz.questions[nextIndex];
    this.logger.log(`[GameSessionService] nextQuestion: nextIndex=${nextIndex}, questionId=${nextQuestion.id}, questionContent="${nextQuestion.content}"`);

    // STEP 6: Update Redis cache SECOND with atomic increment
    const newQuestionVersion = (cached.questionVersion || 0) + 1;
    const newTimerVersion = (cached.timerVersion || 0) + 1;
    const newCache: GameCache = {
      ...cached,
      currentQuestionIndex: nextIndex,
      status: GameState.QUESTION_ACTIVE,
      questionStartedAt: Date.now(),
      timeLimit: nextQuestion.timeLimit || 20,
      questionVersion: newQuestionVersion,
      timerVersion: newTimerVersion,
    };

    await this.redis.set(
      `game:${sessionId}`,
      JSON.stringify(newCache),
      'EX',
      GAME_CONSTANTS.GAME_CACHE_TTL,
    );

    const questionData = {
      questionIndex: nextIndex,
      question: {
        id: nextQuestion.id,
        content: nextQuestion.content,
        answers: nextQuestion.answers.map((a) => ({
          id: a.id,
          content: a.content,
        })),
        timeLimit: nextQuestion.timeLimit || 20,
      },
      totalQuestions: cached.totalQuestions,
    };

    callback(questionData);

    return questionData;
  }

  async endGame(sessionId: string, callback: (data: any) => void) {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      select: { roomId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.gameSession.update({
        where: { id: sessionId },
        data: {
          status: 'FINISHED' as any,
          endedAt: new Date(),
        },
      });

      if (session?.roomId) {
        await tx.room.update({
          where: { id: session.roomId },
          data: { status: 'FINISHED' as any },
        });
      }
    });

    const cached = await this.getGameCache(sessionId);
    const finalLeaderboard = await this.getLeaderboard(sessionId);

    console.log(`[endGame] sessionId=${sessionId} totalQuestions=${cached?.totalQuestions} currentQuestionIndex=${cached?.currentQuestionIndex}`);
    
    await this.updateGameCache(sessionId, {
      status: GameState.FINISHED,
    }, 'endGame');

    const finalResults = {
      leaderboard: finalLeaderboard,
      totalQuestions: cached?.totalQuestions || 0,
    };

    callback(finalResults);

    this.logger.log(`Game session ${sessionId} ended`);

    return finalResults;
  }

  /**
   * Cleanup session - xóa cache và timer (không xóa DB)
   */
  async cleanupSession(sessionId: string): Promise<void> {
    this.logger.log(`[GameSessionService] Cleaning up session ${sessionId}`);

    // Cancel timer
    this.cancelTimer(sessionId);

    // Delete Redis cache - NOTE: key is `game:{sessionId}` (see getGameCache)
    await this.redis.del(`game:${sessionId}`);

    // Delete timer metadata
    await this.redis.del(`game:timer_meta:${sessionId}`);
    await this.redis.del(`game:timer_pause:${sessionId}`);

    // Delete leaderboard
    await this.redis.del(`leaderboard:${sessionId}`);

    // Delete player in-game tracking keys
    // Note: We don't delete player names cache as it's shared across sessions

    this.logger.log(`[GameSessionService] Session ${sessionId} cleaned up`);
  }

  /**
   * Close session - cập nhật DB status
   */
  async closeSession(sessionId: string): Promise<void> {
    this.logger.log(`[GameSessionService] Closing session ${sessionId}`);

    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      select: { roomId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Update session status
      await tx.gameSession.update({
        where: { id: sessionId },
        data: {
          status: 'FINISHED',
          endedAt: new Date(),
        },
      });

      // Update room status to FINISHED
      if (session?.roomId) {
        await tx.room.update({
          where: { id: session.roomId },
          data: { status: 'FINISHED' },
        });
      }
    });

    this.logger.log(`[GameSessionService] Session ${sessionId} closed in DB`);
  }

  async getSessionState(sessionId: string) {
    const cached = await this.getGameCache(sessionId);
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        room: {
          include: {
            quiz: {
              include: {
                questions: {
                  where: { deletedAt: null },
                },
              },
            },
          },
        },
        players: {
          include: { player: true },
          orderBy: { score: 'desc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      sessionId: session.id,
      roomId: session.roomId,
      status: cached?.status || GameState.WAITING,
      currentQuestionIndex: cached?.currentQuestionIndex ?? session.currentQuestionIndex,
      totalQuestions: cached?.totalQuestions ?? session.room.quiz.questions.length,
      cachedStatus: cached?.status,
    };
  }

  /**
   * Returns the full authoritative game state — used as HTTP fallback when socket
   * events are missed after navigation. Includes current question data and
   * computed remaining time so the frontend can render immediately without
   * waiting for a socket event.
   */
  async getFullGameState(sessionId: string) {
    const cacheKey = `game:${sessionId}`;
    const cachedRaw = await this.redis.get(cacheKey);
    const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
    
    console.log(`[getFullGameState] sessionId=${sessionId} cacheKey=${cacheKey}`);
    console.log(`[getFullGameState] cachedRaw=${cachedRaw ? 'EXISTS' : 'NULL'}`);
    if (cached) {
      console.log(`[getFullGameState] cached.status=${cached.status} cached.sessionId=${cached.sessionId}`);
    }
    
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        room: {
          include: {
            quiz: {
              include: {
                questions: {
                  where: { deletedAt: null },
                  include: { answers: { where: { deletedAt: null } } },
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
        },
        players: {
          include: { player: true },
          orderBy: { score: 'desc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Compute remaining time based on server clock
    // For backward compatibility, also compute questionEndTime
    let remainingTime: number | null = null;
    let questionEndTime: number | null = null;
    let currentQuestion: any = null;
    let correctAnswerId: string | null = null;

    if (cached && cached.status === GameState.QUESTION_ACTIVE && cached.questionStartedAt) {
      const elapsed = (Date.now() - cached.questionStartedAt) / 1000;
      remainingTime = Math.max(0, cached.timeLimit - Math.floor(elapsed));
      // questionEndTime for client timer sync (absolute server timestamp)
      questionEndTime = cached.questionStartedAt + (cached.timeLimit * 1000);
      const questionData = session.room.quiz.questions[cached.currentQuestionIndex];
      if (questionData) {
        currentQuestion = {
          id: questionData.id,
          content: questionData.content,
          answers: questionData.answers.map((a: any) => ({ id: a.id, content: a.content })),
          timeLimit: questionData.timeLimit,
        };
      }
    } else if (cached && cached.status === GameState.QUESTION_RESULT) {
      // Restore current question and correct answer for QUESTION_RESULT state
      const questionData = session.room.quiz.questions[cached.currentQuestionIndex];
      if (questionData) {
        currentQuestion = {
          id: questionData.id,
          content: questionData.content,
          answers: questionData.answers.map((a: any) => ({ id: a.id, content: a.content })),
          timeLimit: questionData.timeLimit,
        };
        // Find correct answer
        const correctAnswer = questionData.answers.find((a: any) => a.isCorrect);
        correctAnswerId = correctAnswer?.id || null;
      }
    }

    const leaderboard = await this.getLeaderboard(sessionId);

    // Check if we need to redirect to a newer session
    let currentSessionId: string | undefined;
    if (cached?.status === GameState.FINISHED) {
      // Get the current session ID from room
      const room = await this.prisma.room.findUnique({
        where: { id: session.roomId },
        select: { currentSessionId: true },
      });
      if (room?.currentSessionId && room.currentSessionId !== sessionId) {
        currentSessionId = room.currentSessionId;
      }
    }

    return {
      sessionId: session.id,
      roomId: session.roomId,
      room: {
        hostId: session.room.hostId,
      },
      status: cached?.status || GameState.WAITING,
      currentQuestionIndex: cached?.currentQuestionIndex ?? 0,
      totalQuestions: cached?.totalQuestions ?? session.room.quiz.questions.length,
      remainingTime,
      questionEndTime, // Absolute end time for client timer sync
      currentQuestion,
      correctAnswerId,
      leaderboard,
      serverTime: Date.now(),
      questionStartedAt: cached?.questionStartedAt || null,
      currentSessionId, // Include for redirect if session is finished
    };
  }

  /**
   * Alias for getFullGameState - used by GameGateway for socket-based state recovery
   */
  async getFullSessionState(sessionId: string) {
    return this.getFullGameState(sessionId);
  }

  async getSessionWithQuiz(sessionId: string) {
    return this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        room: {
          include: {
            quiz: {
              include: {
                questions: {
                  where: { deletedAt: null },
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
        },
      },
    });
  }

  async scheduleQuestionEnd(
    sessionId: string,
    timeLimit: number,
    onEnd: (data: any) => void,
  ): Promise<number> {
    this.cancelTimer(sessionId);

    const totalMs = timeLimit * 1000;
    const scheduledAt = Date.now();

    // Get current cache to extract timerVersion
    const cached = await this.getGameCache(sessionId);
    const timerVersion = (cached?.timerVersion || 0) + 1;

    // CRITICAL: Create timer with version check to prevent stale callbacks
    // The callback captures current timerVersion - will be validated before execution
    const timeout = setTimeout(async () => {
      // STALE CHECK: Validate timer version before executing
      // If version mismatch, this callback is stale and should not run
      const currentCache = await this.getGameCache(sessionId);
      if (!currentCache) {
        // Session was cleaned up - ignore callback
        this.logger.warn(`[Timer:${sessionId}] Stale callback ignored - session cleaned up`);
        this.activeTimers.delete(sessionId);
        return;
      }

      // Check if timer version has changed (means new timer was scheduled)
      if (currentCache.timerVersion !== timerVersion) {
        this.logger.warn(`[Timer:${sessionId}] Stale callback ignored - version mismatch (expected ${timerVersion}, got ${currentCache.timerVersion})`);
        this.activeTimers.delete(sessionId);
        return;
      }

      // Check if game is in valid state for question end
      if (currentCache.status !== GameState.QUESTION_ACTIVE) {
        this.logger.warn(`[Timer:${sessionId}] Stale callback ignored - game not in QUESTION_ACTIVE (status=${currentCache.status})`);
        this.activeTimers.delete(sessionId);
        return;
      }

      // STALE CHECK PASSED: Proceed with question end
      this.activeTimers.delete(sessionId);
      await this.redis.del(`game:timer_pause:${sessionId}`);
      await this.handleQuestionEnd(sessionId, onEnd);
    }, totalMs);

    const timer: QuestionTimer = {
      sessionId,
      timeout,
      questionIndex: cached?.currentQuestionIndex || 0,
      scheduledAt,
      totalMs,
      timerVersion,
    };

    this.activeTimers.set(sessionId, timer);

    // Update cache with new timerVersion - THIS IS THE AUTHORITATIVE SOURCE
    await this.updateGameCache(sessionId, {
      questionStartedAt: scheduledAt,
      timerVersion,
    }, 'scheduleQuestionEnd');

    // Save metadata to Redis for freeze/unfreeze recovery
    await this.redis.set(
      `game:timer_meta:${sessionId}`,
      JSON.stringify({ totalMs, scheduledAt, timerVersion }),
      'EX',
      GAME_CONSTANTS.GAME_CACHE_TTL,
    );

    this.logger.log(`Timer scheduled for session ${sessionId}: ${timeLimit}s (version=${timerVersion})`);
    return timerVersion;
  }

  /**
   * Pause tất cả timer đang chạy (khi Freeze bật).
   * Lưu thời gian còn lại vào Redis key game:timer_pause:<sessionId>
   */
  async pauseAllTimers(): Promise<Map<string, number>> {
    const pausedRemaining = new Map<string, number>();

    for (const [sessionId, timer] of this.activeTimers.entries()) {
      const elapsed = Date.now() - timer.scheduledAt;
      const remaining = Math.max(0, timer.totalMs - elapsed);

      clearTimeout(timer.timeout);
      pausedRemaining.set(sessionId, remaining);

      // Lưu vào Redis để resume được ngay cả khi server restart
      await this.redis.set(
        `game:timer_pause:${sessionId}`,
        String(remaining),
        'EX',
        GAME_CONSTANTS.PLAYER_PRESENCE_TTL,
      );

      this.logger.warn(`[FREEZE] Timer paused for ${sessionId}, remaining: ${(remaining / 1000).toFixed(1)}s`);
    }

    this.activeTimers.clear();
    return pausedRemaining;
  }

  cancelTimer(sessionId: string) {
    const existing = this.activeTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing.timeout);
      this.activeTimers.delete(sessionId);
      this.logger.log(`Timer cancelled for session ${sessionId}`);
    }
  }

  /**
   * Trả về callback map để GameGateway có thể resume đúng callback
   * (callback được lưu trong closure ở GameGateway)
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.activeTimers.keys());
  }

  async getTimerRemainingMs(sessionId: string): Promise<number | null> {
    const val = await this.redis.get(`game:timer_pause:${sessionId}`);
    return val ? parseInt(val) : null;
  }

  private async getGameCache(sessionId: string): Promise<GameCache | null> {
    const cached = await this.redis.get(`game:${sessionId}`);
    return cached ? JSON.parse(cached) : null;
  }

  private async updateGameCache(
    sessionId: string,
    updates: Partial<GameCache>,
    caller?: string,
  ) {
    const current = await this.getGameCache(sessionId);
    if (current) {
      const updated = { ...current, ...updates };
      console.log(`[updateGameCache] sessionId=${sessionId} caller=${caller || 'unknown'} status=${current.status} -> ${updated.status}`);
      await this.redis.set(
        `game:${sessionId}`,
        JSON.stringify(updated),
        'EX',
        GAME_CONSTANTS.GAME_CACHE_TTL,
      );
    }
  }

  /**
   * Updates the questionStartedAt timestamp in cache.
   * Used after countdown ends to reset the timer for the actual question.
   */
  async updateQuestionStartTime(sessionId: string, startTime: number) {
    await this.updateGameCache(sessionId, {
      questionStartedAt: startTime,
    }, 'updateQuestionStartTime');
  }

  private async initLeaderboard(sessionId: string, playerIds: string[]) {
    if (playerIds.length === 0) return;

    const key = `leaderboard:${sessionId}`;
    const pipeline = this.redis.pipeline();

    for (const playerId of playerIds) {
      pipeline.zadd(key, 0, playerId);
    }

    await pipeline.exec();
  }

  async updateScore(sessionId: string, playerId: string, scoreDelta: number) {
    const key = `leaderboard:${sessionId}`;
    await this.redis.zincrby(key, scoreDelta, playerId);
  }

  /**
   * Ensure player is in leaderboard with score 0 (used when player joins game)
   */
  async ensurePlayerInLeaderboard(sessionId: string, playerId: string, nickname: string) {
    const key = `leaderboard:${sessionId}`;
    const currentScore = await this.redis.zscore(key, playerId);
    if (currentScore === null) {
      // Player not in leaderboard yet - add with score 0
      await this.redis.zadd(key, 0, playerId);
      // Also cache the nickname for lookups
      await this.playerCache.setPlayerName(playerId, nickname);
      this.logger.debug(`[ensurePlayerInLeaderboard] Added player ${playerId} to leaderboard with score 0`);
    }
  }

  /**
   * Remove player from leaderboard (when they disconnect)
   * NOTE: Prefer markPlayerLeft() for explicit leave - player stays in leaderboard
   */
  async removePlayerFromLeaderboard(sessionId: string, playerId: string) {
    const key = `leaderboard:${sessionId}`;
    await this.redis.zrem(key, playerId);
    this.logger.debug(`[removePlayerFromLeaderboard] Removed player ${playerId} from session ${sessionId}`);
  }

  /**
   * Mark player as LEFT (explicit leave) - player stays in leaderboard
   * Uses Redis SET to track LEFT players per session
   */
  async markPlayerLeft(sessionId: string, playerId: string) {
    const key = `left:players:${sessionId}`;
    await this.redis.sadd(key, playerId);
    this.logger.debug(`[markPlayerLeft] Player ${playerId} marked as LEFT in session ${sessionId}`);
  }

  /**
   * Get all LEFT players for a session
   */
  async getLeftPlayers(sessionId: string): Promise<string[]> {
    const key = `left:players:${sessionId}`;
    return await this.redis.smembers(key);
  }

  /**
   * Mark player as having answered current question
   */
  async markPlayerAnswered(sessionId: string, playerId: string) {
    const key = `answered:${sessionId}`;
    await this.redis.sadd(key, playerId);
  }

  /**
   * Get all players who answered current question
   */
  async getAnsweredPlayers(sessionId: string): Promise<string[]> {
    const key = `answered:${sessionId}`;
    return await this.redis.smembers(key);
  }

  /**
   * Clear answered status for new question
   */
  async clearAnsweredPlayers(sessionId: string) {
    const key = `answered:${sessionId}`;
    await this.redis.del(key);
  }

  async getLeaderboard(sessionId: string, limit = 100) {
    const key = `leaderboard:${sessionId}`;
    const results = await this.redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

    const leaderboard: { playerId: string; score: number }[] = [];
    for (let i = 0; i < results.length; i += 2) {
      leaderboard.push({
        playerId: results[i],
        score: parseInt(results[i + 1], 10),
      });
    }

    const playerIds = leaderboard.map((l) => l.playerId);

    // Use PlayerCacheService for efficient name lookups
    const names = await this.playerCache.getPlayerNames(playerIds);

    // Get LEFT players for this session
    const leftPlayers = await this.getLeftPlayers(sessionId);
    const leftSet = new Set(leftPlayers);

    // Get online players from presence
    const sessionPlayers = await this.presenceService.getSessionPlayers(sessionId);
    const presenceMap = new Map(sessionPlayers.map(p => [p.playerId, p.connection]));

    // Get answered players for current question
    const answeredPlayers = await this.getAnsweredPlayers(sessionId);
    const answeredSet = new Set(answeredPlayers);

    return leaderboard.map((l, index) => {
      const isLeft = leftSet.has(l.playerId);
      const connection = isLeft ? 'LEFT' : (presenceMap.get(l.playerId) || 'DISCONNECTED');

      return {
        rank: index + 1,
        playerId: l.playerId,
        nickname: names.get(l.playerId) || 'Unknown',
        score: l.score,
        connection,
        hasAnswered: answeredSet.has(l.playerId),
      };
    });
  }

  async getPlayerScore(sessionId: string, playerId: string) {
    const key = `leaderboard:${sessionId}`;
    const score = await this.redis.zscore(key, playerId);
    const rank = await this.redis.zrevrank(key, playerId);

    return {
      score: parseInt(score || '0', 10),
      rank: rank !== null ? rank + 1 : null,
    };
  }

  /**
   * Lấy danh sách questionIds mà player đã trả lời trong session
   * Dùng để khôi phục trạng thái hasAnswered khi reload
   */
  async getPlayerAnsweredQuestions(sessionId: string, playerId: string): Promise<string[]> {
    const playerSession = await this.prisma.playerSession.findFirst({
      where: { sessionId, playerId },
      include: { answers: true },
    });

    return playerSession?.answers.map((pa) => pa.questionId) || [];
  }

  async submitAnswer(
    sessionId: string,
    playerId: string,
    questionId: string,
    answerId: string,
    clientTimestamp: number,
  ): Promise<{ success: boolean; isCorrect: boolean; scoreEarned: number; correctAnswerId?: string; leaderboard: any[] }> {
    // CRITICAL: Check game cache state FIRST
    const cached = await this.getGameCache(sessionId);
    if (!cached) {
      throw new NotFoundException('Game not found');
    }

    if (cached.status !== GameState.QUESTION_ACTIVE) {
      throw new BadRequestException(`Cannot submit answer now - game status is ${cached.status}`);
    }

    // CRITICAL: Validate questionId is the CURRENT question in session
    const currentQuestionId = cached.questionIds[cached.currentQuestionIndex];
    if (questionId !== currentQuestionId) {
      this.logger.warn(`[submitAnswer:${sessionId}] Invalid questionId ${questionId}, expected ${currentQuestionId}`);
      throw new BadRequestException('Invalid question - this question is not currently active');
    }

    // CRITICAL: Idempotency check using Redis distributed lock
    // This prevents race condition when player spam-clicks submit
    const idempotencyKey = `answer:lock:${sessionId}:${playerId}:${questionId}`;
    const lockAcquired = await this.redis.set(idempotencyKey, '1', 'EX', 30, 'NX');

    if (!lockAcquired) {
      // Player already submitted for this question - return idempotent response
      this.logger.warn(`[submitAnswer:${sessionId}] Duplicate submission blocked for player ${playerId}, question ${questionId}`);
      throw new ConflictException('Already submitted for this question');
    }

    try {
      // Verify player session exists
      const playerSession = await this.prisma.playerSession.findFirst({
        where: { sessionId, playerId },
      });

      if (!playerSession) {
        throw new ForbiddenException('Player is not part of this game session');
      }

      // Fetch question with answers
      const question = await this.prisma.question.findUnique({
        where: { id: questionId },
        include: { answers: { where: { deletedAt: null } } },
      });

      if (!question) {
        throw new NotFoundException('Question not found');
      }

      // CRITICAL: Validate answerId belongs to this question
      const validAnswerIds = question.answers.map((a) => a.id);
      if (!validAnswerIds.includes(answerId)) {
        this.logger.warn(`[submitAnswer:${sessionId}] Invalid answerId ${answerId} for question ${questionId}`);
        throw new BadRequestException('Invalid answer - answer does not belong to this question');
      }

      // Calculate score using server authoritative timestamp
      const selectedAnswer = question.answers.find((a) => a.id === answerId);
      const correctAnswer = question.answers.find((a) => a.isCorrect);
      const isCorrect = selectedAnswer?.isCorrect || false;

      let scoreEarned = 0;
      let timeTaken = 0;
      if (isCorrect && cached.questionStartedAt) {
        timeTaken = Date.now() - cached.questionStartedAt;
        const maxTime = (question.timeLimit || 20) * 1000;

        // CRITICAL: Cap timeTaken to prevent negative bonus from network issues
        const cappedTimeTaken = Math.min(timeTaken, maxTime);
        const timeBonus = Math.max(0, Math.floor((maxTime - cappedTimeTaken) / GAME_CONSTANTS.TIME_BONUS_DIVISOR));
        scoreEarned = GAME_CONSTANTS.BASE_SCORE + timeBonus;

        // Update Redis leaderboard immediately (fast path)
        await this.updateScore(sessionId, playerId, scoreEarned);
      }

      // Queue answer for batch processing (FAST - no DB write)
      // The batch processor will INSERT to DB and update playerSession score
      const queuedAnswer: QueuedAnswer = {
        playerSessionId: playerSession.id,
        playerId,
        questionId,
        answerId,
        isCorrect,
        scoreEarned,
        timeTaken,
        submittedAt: Date.now(),
        sessionId,
      };
      await this.answerQueue.queueAnswer(queuedAnswer);

      // Mark player as answered for this question
      await this.markPlayerAnswered(sessionId, playerId);

      // Get leaderboard AFTER all writes complete
      const leaderboard = await this.getLeaderboard(sessionId);

      this.logger.log(
        `Player ${playerId} answered question ${questionId}: ${isCorrect ? 'correct' : 'wrong'}, earned ${scoreEarned} points (queued for batch)`,
      );

      return {
        success: true,
        isCorrect,
        scoreEarned,
        correctAnswerId: correctAnswer?.id,
        leaderboard,
      };
    } catch (error) {
      // Release lock on error so player can retry
      await this.redis.del(idempotencyKey);
      throw error;
    }
  }
}
