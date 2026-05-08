import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { GameService } from '../game.service';
import { RedisService } from '../../redis/redis.service';
import { SocketStateService } from '../services/socket-state.service';
import { SubmitAnswerPayload } from '../interfaces/event-payloads.interface';

@Injectable()
export class AnswerHandler {
  private readonly logger = new Logger(AnswerHandler.name);

  constructor(
    private readonly gameService: GameService,
    private readonly redis: RedisService,
    private readonly socketState: SocketStateService,
  ) {}

  /**
   * Xử lý submit câu trả lời từ player
   * Luồng:
   * 1. Rate limit check
   * 2. Validate player đang trong game
   * 3. Check đã trả lời chưa (Redis SETNX)
   * 4. Buffer answer vào Redis
   * 5. Update leaderboard score
   * 6. ACK về client
   */
  async handleSubmitAnswer(
    client: Socket,
    payload: SubmitAnswerPayload,
    server: Server,
  ) {
    const playerInfo = this.socketState.verifyPlayer(client.id);
    if (!playerInfo) {
      throw new WsException({
        code: 'UNAUTHORIZED',
        message: 'You are not a player in this room',
      });
    }

    const { questionId, answerId } = payload;
    const playerId = playerInfo.playerId;
    const sessionId = playerInfo.sessionId;
    const { roomId } = playerInfo;

    // Validate required fields
    if (!playerId) {
      throw new WsException({
        code: 'INVALID_PLAYER',
        message: 'Player ID not found',
      });
    }

    if (!sessionId) {
      throw new WsException({
        code: 'NO_ACTIVE_SESSION',
        message: 'No active game session',
      });
    }

    // 1. Rate limit check
    const rateLimit = await this.redis.checkRateLimit(playerId);
    if (!rateLimit.allowed) {
      throw new WsException({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
        remaining: rateLimit.remaining,
        reset: rateLimit.reset,
      });
    }

    // 2. Get active question from GameService
    const activeQuestion = await this.gameService.getActiveQuestion(roomId);
    if (!activeQuestion) {
      throw new WsException({
        code: 'NO_ACTIVE_QUESTION',
        message: 'No active question',
      });
    }

    // 3. Validate question
    if (activeQuestion.questionId !== questionId) {
      throw new WsException({
        code: 'INVALID_QUESTION',
        message: 'Question ID does not match current question',
      });
    }

    // 4. Calculate response time
    const elapsedMs = Date.now() - activeQuestion.startedAt;
    if (elapsedMs > activeQuestion.durationMs) {
      throw new WsException({
        code: 'TIME_EXPIRED',
        message: 'Time has expired for this question',
      });
    }

    // 5. Check if already answered (Redis SETNX)
    const answerPayload = {
      playerId,
      playerSessionId: sessionId,
      sessionId: activeQuestion.sessionId,
      questionId,
      answerId,
      responseTimeMs: elapsedMs,
      timestamp: Date.now(),
    };

    const { isFirst } = await this.redis.checkAndSetAnswered(
      activeQuestion.sessionId,
      questionId,
      playerId,
      answerPayload,
    );

    if (!isFirst) {
      throw new WsException({
        code: 'ALREADY_ANSWERED',
        message: 'You have already answered this question',
      });
    }

    // 6. Buffer answer vào Redis
    await this.redis.bufferAnswer(activeQuestion.sessionId, questionId, answerPayload);

    // 7. Calculate estimated score
    const estimatedScore = Math.max(0, 1000 - Math.floor(elapsedMs / 10));

    // 8. ACK ngay về client (ultra-low latency)
    this.logger.debug(
      `Answer received from ${playerId}: question=${questionId}, answer=${answerId}, time=${elapsedMs}ms`,
    );

    return {
      event: 'answer:received',
      data: {
        success: true,
        questionId,
        responseTimeMs: elapsedMs,
        estimatedScore,
        remaining: rateLimit.remaining,
      },
    };
  }

  /**
   * Xử lý kết thúc câu hỏi - flush buffer vào DB
   * Được gọi bởi host handler hoặc timer
   */
  async handleQuestionEnd(
    roomId: string,
    sessionId: string,
    questionId: string,
    correctAnswerId: string,
    server: Server,
  ) {
    this.logger.log(`Question ended: session=${sessionId}, question=${questionId}`);

    // 1. Flush buffer từ Redis
    const bufferedAnswers = await this.redis.flushAnswerBuffer(sessionId, questionId);

    if (bufferedAnswers.length === 0) {
      this.logger.log('No answers to flush');
      return { flushedCount: 0 };
    }

    // 2. Tính điểm và lưu vào DB
    const results = await this.gameService.flushAnswersAndCalculateScores(
      sessionId,
      questionId,
      correctAnswerId,
      bufferedAnswers,
    );

    // 3. Broadcast kết quả cho tất cả players
    server.to(`room:${roomId}`).emit('question:end', {
      questionId,
      correctAnswerId,
      totalAnswers: bufferedAnswers.length,
      results: results.slice(0, 10), // Top 10 for leaderboard preview
    });

    this.logger.log(`Flushed ${results.length} answers for question ${questionId}`);

    return { flushedCount: results.length };
  }

  /**
   * Lấy leaderboard hiện tại từ Redis
   */
  async handleGetLeaderboard(client: Socket, sessionId: string) {
    const topScores = await this.redis.getTopScores(sessionId, 10);

    // Enrich với player info từ DB
    const enriched = await this.gameService.enrichLeaderboard(topScores);

    return {
      event: 'leaderboard:update',
      data: {
        sessionId,
        leaderboard: enriched,
        updatedAt: Date.now(),
      },
    };
  }
}
