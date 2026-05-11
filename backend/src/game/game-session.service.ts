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
              include: { answers: true },
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

    await this.initLeaderboard(session.id, room.players.map((p) => p.id));

    this.logger.log(`Game session ${session.id} started for room ${roomId}`);

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
                  include: { answers: true },
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
                  include: { answers: true },
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
    };

    await this.updateGameCache(sessionId, {
      status: GameState.QUESTION_RESULT,
      questionStartedAt: null,
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
                  include: { answers: true },
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

  async getSessionState(sessionId: string) {
    const cached = await this.getGameCache(sessionId);
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
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
      currentQuestionIndex: session.currentQuestionIndex,
      cachedStatus: cached?.status,
    };
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

    const timer: QuestionTimer = {
      sessionId,
      timeout: setTimeout(async () => {
        this.activeTimers.delete(sessionId);
        await this.handleQuestionEnd(sessionId, onEnd);
      }, timeLimit * 1000),
      questionIndex: (await this.getGameCache(sessionId))?.currentQuestionIndex || 0,
    };

    this.activeTimers.set(sessionId, timer);
    this.logger.log(
      `Timer scheduled for session ${sessionId}: ${timeLimit}s`,
    );
  }

  cancelTimer(sessionId: string) {
    const existing = this.activeTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing.timeout);
      this.activeTimers.delete(sessionId);
      this.logger.log(`Timer cancelled for session ${sessionId}`);
    }
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
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, nickname: true },
    });

    const playerMap = new Map(players.map((p) => [p.id, p.nickname]));

    return leaderboard.map((l, index) => ({
      rank: index + 1,
      playerId: l.playerId,
      nickname: playerMap.get(l.playerId) || 'Unknown',
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
