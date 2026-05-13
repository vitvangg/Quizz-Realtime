import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameSessionService, GameState } from './game-session.service';
import { RoomService } from '../room/room.service';
import { RoomGateway } from '../room/room.gateway';
import { RedisService } from '../redis/redis.service';

interface PlayerIdentity {
  userId?: string;
  playerId: string;
  roomId: string;
  sessionId?: string;
  nickname: string;
  isHost: boolean;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  private socketMap = new Map<string, PlayerIdentity>();
  private sessionSockets = new Map<string, Set<string>>();

  // Lưu callback để có thể resume timer khi unfreeze
  private sessionCallbacks = new Map<string, (data: any) => void>();

  constructor(
    private readonly gameSessionService: GameSessionService,
    private readonly roomService: RoomService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => RoomGateway))
    private readonly roomGateway: RoomGateway,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  afterInit(server: Server) {
    this.logger.log('[GameGateway] Initialized');
  }

  /** Dùng bởi DashboardMetricsService để đếm kết nối hiện tại */
  getConnectionCount(): number {
    return this.socketMap.size;
  }

  // ============================================================================
  // CONNECTION HANDLING (với IP Ban check)
  // ============================================================================

  async handleConnection(client: Socket) {
    const ip = client.handshake.address;

    // 🛡️ Lớp 1: Block IP bị blacklist ngay tại handshake
    const isBanned = await this.redisService.isIpBanned(ip);
    if (isBanned) {
      this.logger.warn(`🛑 Rejected BANNED IP: ${ip} (socket: ${client.id})`);
      client.disconnect(true);
      return;
    }

    this.logger.log(`[GameGateway] Client connected: ${client.id} (IP: ${ip})`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`[GameGateway] Client disconnected: ${client.id}`);

    const identity = this.socketMap.get(client.id);
    if (!identity) return;

    if (identity.sessionId) {
      const sockets = this.sessionSockets.get(identity.sessionId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.sessionSockets.delete(identity.sessionId);
        }
      }
    }

    this.socketMap.delete(client.id);
  }

  // ============================================================================
  // SYSTEM INCIDENT EVENTS (từ DashboardService via EventEmitter)
  // ============================================================================

  @OnEvent('system.incident.lockdown')
  async handleLockdown(payload: { enable: boolean; message: string }) {
    this.logger.warn(`[SYSTEM FREEZE] broadcast freeze=${payload.enable}`);

    if (this.server) {
      this.server.emit('system:freeze', {
        freeze: payload.enable,
        message: payload.message,
        timestamp: new Date().toISOString(),
      });
    }

    if (payload.enable) {
      // FREEZE: Dừng tất cả question timer
      const paused = await this.gameSessionService.pauseAllTimers();
      this.logger.warn(`[FREEZE] Paused ${paused.size} session timers`);
    } else {
      // UNFREEZE: Resume timer với thời gian còn lại
      for (const [sessionId, callback] of this.sessionCallbacks.entries()) {
        const remainingMs = await this.gameSessionService.getTimerRemainingMs(sessionId);
        if (remainingMs !== null && remainingMs > 0) {
          const remainingSec = Math.ceil(remainingMs / 1000);
          this.logger.log(`[UNFREEZE] Resuming session ${sessionId} with ${remainingSec}s remaining`);

          // Thông báo frontend thời gian còn lại
          this.server.to(sessionId).emit('timer_resume', {
            remainingSeconds: remainingSec,
          });

          // Lên lịch lại timer với thời gian còn lại
          await this.gameSessionService.scheduleQuestionEnd(
            sessionId,
            remainingSec,
            callback,
          );
        }
      }
    }
  }

  @OnEvent('system.incident.kill_switch')
  handleKillSwitch(payload?: { pin?: string }) {
    if (payload?.pin) {
      this.logger.error(`🚨 TARGETED KILL SWITCH: Room [${payload.pin}]`);
      if (this.server) this.server.in(payload.pin).disconnectSockets(true);
    } else {
      this.logger.error('🚨 GLOBAL KILL SWITCH: Disconnecting ALL game sockets!');
      if (this.server) this.server.disconnectSockets(true);
    }
  }

  @OnEvent('system.incident.maintenance')
  handleMaintenance(payload: { enable: boolean; message?: string; scheduledFrom?: string; scheduledUntil?: string }) {
    this.logger.warn(`[MAINTENANCE] ${payload.enable ? 'ON' : 'OFF'}`);
    if (this.server) {
      this.server.emit('system:maintenance', {
        maintenance: payload.enable,
        message: payload.message || '',
        scheduledFrom: payload.scheduledFrom || null,
        scheduledUntil: payload.scheduledUntil || null,
        timestamp: new Date().toISOString(),
      });
    }
    // Không kick người dùng — đây chỉ là thông báo
  }

  // ============================================================================
  // GAME EVENTS
  // ============================================================================

  @SubscribeMessage('host_join_game')
  async handleHostJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; jwt?: string },
  ) {
    try {
      let hostId: string = 'unknown';

      if (payload.jwt) {
        const decoded = this.jwtService.verify(payload.jwt);
        hostId = decoded.sub || decoded.id;
      }

      const sessionState = await this.gameSessionService.getSessionState(payload.sessionId);
      const session = await this.gameSessionService.getSessionWithQuiz(payload.sessionId);
      const totalQuestions = session?.room?.quiz?.questions?.length || 0;

      client.join(payload.sessionId);

      const identity = {
        userId: hostId,
        playerId: `host_${hostId}`,
        roomId: sessionState?.roomId,
        sessionId: payload.sessionId,
        nickname: 'Host',
        isHost: true,
      };

      this.socketMap.set(client.id, identity);

      const sessionSockets = this.sessionSockets.get(payload.sessionId) || new Set();
      sessionSockets.add(client.id);
      this.sessionSockets.set(payload.sessionId, sessionSockets);

      return {
        success: true,
        state: {
          status: sessionState?.status || GameState.WAITING,
          currentQuestion: null,
          questionIndex: sessionState?.currentQuestionIndex || 0,
          totalQuestions,
          leaderboard: [],
        }
      };
    } catch (error) {
      this.logger.error(`Error in host_join_game: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('host_start_game')
  async handleHostStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; jwt?: string },
  ) {
    try {
      let hostId: string;

      if (payload.jwt) {
        const decoded = this.jwtService.verify(payload.jwt);
        hostId = decoded.sub || decoded.id;
      } else {
        const identity = this.socketMap.get(client.id);
        if (!identity?.isHost) {
          return { success: false, error: 'Only host can start game' };
        }
        hostId = identity.userId || identity.playerId;
      }

      const result = await this.gameSessionService.startGame(
        payload.roomId,
        hostId,
      );

      const identity = this.socketMap.get(client.id) || {
        userId: hostId,
        playerId: `host_${hostId}`,
        roomId: payload.roomId,
        sessionId: result.session.id,
        nickname: 'Host',
        isHost: true,
      };

      identity.sessionId = result.session.id;
      this.socketMap.set(client.id, identity);

      const sessionSockets = this.sessionSockets.get(result.session.id) || new Set();
      sessionSockets.add(client.id);
      this.sessionSockets.set(result.session.id, sessionSockets);

      client.join(result.session.id);

      this.roomGateway.emitToRoom(payload.roomId, 'game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });

      this.server.to(result.session.id).emit('game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });

      for (let i = 5; i > 0; i--) {
        await this.delay(1000);
        this.server.to(result.session.id).emit('countdown_tick', {
          remaining: i - 1,
        });
      }

      this.server.to(result.session.id).emit('question_start', {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        serverTime: Date.now(),
      });

      const questionEndCallback = (data: any) => this.handleQuestionEnd(result.session.id, data);
      this.sessionCallbacks.set(result.session.id, questionEndCallback);
      this.gameSessionService.scheduleQuestionEnd(
        result.session.id,
        result.firstQuestion.timeLimit,
        questionEndCallback,
      );

      return { success: true, sessionId: result.session.id };
    } catch (error) {
      this.logger.error(`Error starting game: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('host_next_question')
  async handleHostNextQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    try {
      const identity = this.socketMap.get(client.id);
      if (!identity?.isHost) {
        return { success: false, error: 'Only host can advance question' };
      }

      const cached = await this.gameSessionService.getSessionState(payload.sessionId);
      if (cached.status !== GameState.QUESTION_RESULT &&
        cached.status !== GameState.LEADERBOARD &&
        cached.status !== GameState.QUESTION_ACTIVE) {
        return { success: false, error: 'Cannot advance question in current state' };
      }

      this.gameSessionService.cancelTimer(payload.sessionId);

      const result = await this.gameSessionService.nextQuestion(
        payload.sessionId,
        (data) => this.emitToSession(payload.sessionId, 'question_start', data),
      );

      this.server.to(payload.sessionId).emit('question_start', {
        ...result,
        serverTime: Date.now(),
      });

      const nextCallback = (data: any) => this.handleQuestionEnd(payload.sessionId, data);
      this.sessionCallbacks.set(payload.sessionId, nextCallback);
      this.gameSessionService.scheduleQuestionEnd(
        payload.sessionId,
        result.question.timeLimit,
        nextCallback,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Error advancing question: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('host_end_game')
  async handleHostEndGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    try {
      const identity = this.socketMap.get(client.id);
      if (!identity?.isHost) {
        return { success: false, error: 'Only host can end game' };
      }

      this.gameSessionService.cancelTimer(payload.sessionId);

      const result = await this.gameSessionService.endGame(
        payload.sessionId,
        (data) => this.emitToSession(payload.sessionId, 'game_ended', data),
      );

      return { success: true, ...result };
    } catch (error) {
      this.logger.error(`Error ending game: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('get_game_state')
  async handleGetGameState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    try {
      const state = await this.gameSessionService.getSessionState(payload.sessionId);
      const leaderboard = await this.gameSessionService.getLeaderboard(payload.sessionId);

      return {
        success: true,
        state,
        leaderboard,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('get_leaderboard')
  async handleGetLeaderboard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    try {
      const leaderboard = await this.gameSessionService.getLeaderboard(payload.sessionId);
      return { success: true, leaderboard };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('join_game')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; playerId: string; nickname: string },
  ) {
    try {
      // 🛡️ Lớp 2: Rate limit theo IP tại điểm join_game
      const ip = client.handshake.address;
      const rateCheck = await this.redisService.checkRateLimit(`join:${ip}`, 10, 5000);
      if (!rateCheck.allowed) {
        this.logger.warn(`⚠️ RATE LIMIT exceeded on join_game from IP: ${ip} (${rateCheck.count} req/5s)`);

        // Auto-ban nếu vượt ngưỡng nghiêm trọng (50+ lần)
        if (rateCheck.count >= 50) {
          await this.redisService.banIp(ip, 'Auto-banned: DDoS join_game attack');
          // Emit event để DashboardService log + email
          this.eventEmitter.emit('system.incident.auto_ban', {
            ip,
            reason: 'Auto-banned: DDoS join_game attack',
            requestCount: rateCheck.count,
          });
          client.disconnect(true);
        }

        return { success: false, error: 'Too many requests. Please wait.' };
      }

      const session = await this.gameSessionService.getSessionState(payload.sessionId);

      const identity: PlayerIdentity = {
        playerId: payload.playerId,
        roomId: session.roomId,
        sessionId: payload.sessionId,
        nickname: payload.nickname,
        isHost: false,
      };

      this.socketMap.set(client.id, identity);

      const sessionSockets = this.sessionSockets.get(payload.sessionId) || new Set();
      sessionSockets.add(client.id);
      this.sessionSockets.set(payload.sessionId, sessionSockets);

      client.join(payload.sessionId);

      return {
        success: true,
        state: session,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('submit_answer')
  async handleSubmitAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      sessionId: string;
      playerId: string;
      questionId: string;
      answerId: string;
      clientTimestamp: number;
    },
  ) {
    try {
      // 🛡️ Lớp 3: Rate limit tại submit_answer — chặn spam đáp án
      const ip = client.handshake.address;
      const rateCheck = await this.redisService.checkRateLimit(`answer:${ip}`, 5, 1000);
      if (!rateCheck.allowed) {
        this.logger.warn(`⚠️ RATE LIMIT submit_answer from IP: ${ip} (${rateCheck.count} req/s)`);

        if (rateCheck.count >= 30) {
          await this.redisService.banIp(ip, 'Auto-banned: Answer spam attack');
          this.eventEmitter.emit('system.incident.auto_ban', {
            ip,
            reason: 'Auto-banned: Answer spam attack',
            requestCount: rateCheck.count,
          });
          client.disconnect(true);
        }

        return { success: false, message: 'Too many answer submissions.' };
      }

      const result = await this.gameSessionService.submitAnswer(
        payload.sessionId,
        payload.playerId,
        payload.questionId,
        payload.answerId,
        payload.clientTimestamp,
      );

      this.server.to(payload.sessionId).emit('score_update', {
        playerId: payload.playerId,
        score: result.scoreEarned,
        leaderboard: result.leaderboard,
      });

      return {
        success: true,
        isCorrect: result.isCorrect,
        scoreEarned: result.scoreEarned,
        leaderboard: result.leaderboard,
      };
    } catch (error) {
      this.logger.error(`Error submitting answer: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  private async handleQuestionEnd(sessionId: string, data: any) {
    this.server.to(sessionId).emit('question_result', {
      ...data,
      serverTime: Date.now(),
    });

    if (data.isLastQuestion) {
      await this.delay(3000);
      await this.gameSessionService.endGame(
        sessionId,
        (endData) => this.emitToSession(sessionId, 'game_ended', endData),
      );
    }
  }

  private emitToSession(sessionId: string, event: string, data: any) {
    this.server.to(sessionId).emit(event, data);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
