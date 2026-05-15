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
}

interface QuestionTimer {
  sessionId: string;
  timeout: NodeJS.Timeout;
  questionIndex: number;
  scheduledAt: number;     // thời điểm lên lịch
  totalMs: number;         // tổng thời gian (ms)
}

@Injectable()
export class GameSessionService {
  private readonly logger = new Logger(GameSessionService.name);

  private activeTimers = new Map<string, QuestionTimer>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
    };

    await this.redis.set(
      `game:${session.id}`,
      JSON.stringify(gameCache),
      'EX',
      7200,
    );

    // Add regular players to leaderboard (their player.id values)
    await this.initLeaderboard(session.id, room.players.map((p) => p.id));

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

  async handleQuestionEnd(sessionId: string, callback: (data: any) => void) {
    const cached = await this.getGameCache(sessionId);
    if (!cached) {
      throw new NotFoundException('Game not found in cache');
    }

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

    const currentQuestion =
      room.room.quiz.questions[cached.currentQuestionIndex];
    const correctAnswer = currentQuestion.answers.find((a) => a.isCorrect);

    const leaderboard = await this.getLeaderboard(sessionId);

    const resultData = {
      questionIndex: cached.currentQuestionIndex,
      correctAnswer: correctAnswer
        ? { id: correctAnswer.id, content: correctAnswer.content }
        : null,
      leaderboard: leaderboard.slice(0, 10),
      isLastQuestion:
        cached.currentQuestionIndex >= cached.totalQuestions - 1,
      // Include question data so frontend can verify question match
      question: {
        id: currentQuestion.id,
        content: currentQuestion.content,
      },
    };

    await this.updateGameCache(sessionId, {
      status: GameState.QUESTION_RESULT,
      questionStartedAt: null,
    });

    // Update DB so reload reads correct state
    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { currentQuestionIndex: cached.currentQuestionIndex },
    });

    callback(resultData);

    if (cached.currentQuestionIndex >= cached.totalQuestions - 1) {
      await this.endGame(sessionId, callback);
    }

    return resultData;
  }

  async nextQuestion(sessionId: string, callback: (data: any) => void) {
    const cached = await this.getGameCache(sessionId);
    if (!cached) {
      throw new NotFoundException('Game not found in cache');
    }

    const nextIndex = cached.currentQuestionIndex + 1;
    if (nextIndex >= cached.totalQuestions) {
      throw new BadRequestException('No more questions');
    }

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

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        currentQuestionIndex: nextIndex,
        questionStartedAt: new Date(),
      },
    });

    const nextQuestion = room.room.quiz.questions[nextIndex];

    this.logger.log(`[GameSessionService] nextQuestion: nextIndex=${nextIndex}, questionId=${nextQuestion.id}, questionContent="${nextQuestion.content}"`);

    const newCache: GameCache = {
      ...cached,
      currentQuestionIndex: nextIndex,
      status: GameState.QUESTION_ACTIVE,
      questionStartedAt: Date.now(),
      timeLimit: nextQuestion.timeLimit || 20,
    };

    await this.redis.set(
      `game:${sessionId}`,
      JSON.stringify(newCache),
      'EX',
      7200,
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

    await this.updateGameCache(sessionId, {
      status: GameState.FINISHED,
    });

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

    // Delete Redis cache
    await this.redis.del(`game:cache:${sessionId}`);
    await this.redis.del(`game:timer:${sessionId}`);
    await this.redis.del(`game:timer_meta:${sessionId}`);
    await this.redis.del(`game:timer_pause:${sessionId}`);

    // Delete leaderboard
    await this.redis.del(`game:leaderboard:${sessionId}`);

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
    let remainingTime: number | null = null;
    let currentQuestion: any = null;
    let correctAnswerId: string | null = null;

    if (cached && cached.status === GameState.QUESTION_ACTIVE && cached.questionStartedAt) {
      const elapsed = (Date.now() - cached.questionStartedAt) / 1000;
      remainingTime = Math.max(0, cached.timeLimit - Math.floor(elapsed));
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
      currentQuestion,
      correctAnswerId,
      leaderboard,
      serverTime: Date.now(), // Thời điểm server trả response
      questionStartedAt: cached?.questionStartedAt || null, // Thời điểm câu hỏi bắt đầu (server time)
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
  ) {
    this.cancelTimer(sessionId);

    const totalMs = timeLimit * 1000;
    const scheduledAt = Date.now();

    // Lưu callback ref qua closure — Redis chỉ lưu metadata
    const timeout = setTimeout(async () => {
      this.activeTimers.delete(sessionId);
      await this.redis.del(`game:timer_pause:${sessionId}`);
      await this.handleQuestionEnd(sessionId, onEnd);
    }, totalMs);

    const timer: QuestionTimer = {
      sessionId,
      timeout,
      questionIndex: (await this.getGameCache(sessionId))?.currentQuestionIndex || 0,
      scheduledAt,
      totalMs,
    };

    this.activeTimers.set(sessionId, timer);

    // Lưu metadata vào Redis để resumeAllTimers có thể lên lịch lại
    await this.redis.set(
      `game:timer_meta:${sessionId}`,
      JSON.stringify({ totalMs, scheduledAt, onEndRef: 'pending' }),
      'EX',
      7200,
    );

    this.logger.log(`Timer scheduled for session ${sessionId}: ${timeLimit}s`);
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
        86400,
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
  ) {
    const current = await this.getGameCache(sessionId);
    if (current) {
      const updated = { ...current, ...updates };
      await this.redis.set(
        `game:${sessionId}`,
        JSON.stringify(updated),
        'EX',
        7200,
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
    });
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

    // Separate player IDs (actual players) from host IDs (format: host_<userId>)
    const actualPlayerIds = playerIds.filter((id) => !id.startsWith('host_'));
    const hostUserIds = playerIds
      .filter((id) => id.startsWith('host_'))
      .map((id) => id.replace('host_', ''));

    // Query players table for regular players
    const players = await this.prisma.player.findMany({
      where: { id: { in: actualPlayerIds } },
      select: { id: true, nickname: true },
    });
    const playerMap = new Map(players.map((p) => [p.id, p.nickname]));

    // Query users table for hosts
    const hostUsers = await this.prisma.user.findMany({
      where: { id: { in: hostUserIds } },
      select: { id: true, fullName: true },
    });
    const hostMap = new Map(hostUsers.map((u) => [`host_${u.id}`, u.fullName || 'Host']));

    return leaderboard.map((l, index) => ({
      rank: index + 1,
      playerId: l.playerId,
      nickname: playerMap.get(l.playerId) || hostMap.get(l.playerId) || 'Unknown',
      score: l.score,
    }));
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
  ) {
    const cached = await this.getGameCache(sessionId);
    if (!cached) {
      throw new NotFoundException('Game not found');
    }

    if (cached.status !== GameState.QUESTION_ACTIVE) {
      throw new BadRequestException('Cannot submit answer now');
    }

    const playerSession = await this.prisma.playerSession.findFirst({
      where: {
        sessionId,
        playerId,
      },
    });

    if (!playerSession) {
      throw new NotFoundException('Player session not found');
    }

    const existingAnswer = await this.prisma.playerAnswer.findFirst({
      where: {
        playerSessionId: playerSession.id,
        questionId,
      },
    });

    if (existingAnswer) {
      throw new ConflictException('Already answered this question');
    }

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { answers: true },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const selectedAnswer = question.answers.find((a) => a.id === answerId);
    const correctAnswer = question.answers.find((a) => a.isCorrect);
    const isCorrect = selectedAnswer?.isCorrect || false;

    let scoreEarned = 0;
    if (isCorrect && cached.questionStartedAt) {
      const timeTaken = Date.now() - cached.questionStartedAt;
      const maxTime = (question.timeLimit || 20) * 1000;

      const timeBonus = Math.max(0, Math.floor((maxTime - timeTaken) / 10));
      scoreEarned = 1000 + timeBonus;

      await this.updateScore(sessionId, playerId, scoreEarned);
    }

    await this.prisma.playerAnswer.create({
      data: {
        playerSessionId: playerSession.id,
        questionId,
        answerId,
        questionContent: question.content,
        answerContent: selectedAnswer?.content || '',
        isCorrect,
        scoreEarned,
      },
    });

    await this.prisma.playerSession.update({
      where: { id: playerSession.id },
      data: { score: { increment: scoreEarned } },
    });

    const leaderboard = await this.getLeaderboard(sessionId);

    this.logger.log(
      `Player ${playerId} answered question ${questionId}: ${isCorrect ? 'correct' : 'wrong'}, earned ${scoreEarned} points`,
    );

    return {
      success: true,
      isCorrect,
      scoreEarned,
      correctAnswerId: correctAnswer?.id,
      leaderboard,
    };
  }
}
