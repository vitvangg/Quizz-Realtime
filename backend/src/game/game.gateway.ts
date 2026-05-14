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
import { Logger } from '@nestjs/common';
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
    const identity = this.socketMap.get(client.id);
    this.logger.log(
      `[GameGateway] Client disconnected: ${client.id} | identity: ${
        identity
          ? JSON.stringify({ playerId: identity.playerId, isHost: identity.isHost, sessionId: identity.sessionId })
          : 'none'
      }`,
    );

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

  // ============================================================================
  // SOCKET MANAGEMENT HELPERS
  // ============================================================================

  /** Đăng ký socket vào session, thêm vào sessionSockets map */
  private registerSocketToSession(client: Socket, sessionId: string, identity: PlayerIdentity) {
    identity.sessionId = sessionId;
    this.socketMap.set(client.id, identity);

    const sessionSockets = this.sessionSockets.get(sessionId) || new Set();
    sessionSockets.add(client.id);
    this.sessionSockets.set(sessionId, sessionSockets);
  }

  /** Build response cho reload (dùng chung cho host và player) */
  private buildReloadResponse(fullState: any) {
    // For QUESTION_RESULT, set remainingTime to 0 so client knows question ended
    let remainingTime = fullState?.remainingTime ?? null;
    if (fullState?.status === GameState.QUESTION_RESULT) {
      remainingTime = 0;
    }

    const response = {
      status: fullState?.status || GameState.WAITING,
      currentQuestion: fullState?.currentQuestion || null,
      questionIndex: fullState?.currentQuestionIndex ?? 0,
      totalQuestions: fullState?.totalQuestions ?? 0,
      leaderboard: fullState?.leaderboard || [],
      remainingTime,
    };
    this.logger.log(`[GameGateway] buildReloadResponse: status=${response.status}, questionIndex=${response.questionIndex}, total=${response.totalQuestions}, currentQuestion=${!!response.currentQuestion}`);
    return response;
  }

  /** Verify host identity */
  private verifyHost(client: Socket): PlayerIdentity | null {
    const identity = this.socketMap.get(client.id);
    if (!identity?.isHost) return null;
    return identity;
  }

  /** Ensure socket is in the session room */
  private ensureSocketInSession(client: Socket, sessionId: string, identity: PlayerIdentity) {
    identity.sessionId = sessionId;
    client.join(sessionId);
    this.registerSocketToSession(client, sessionId, identity);
    this.logger.log(`[GameGateway] Ensured socket ${client.id} in session ${sessionId}`);
  }

  /** Verify game not finished */
  private async checkGameNotFinished(sessionId: string): Promise<boolean> {
    const state = await this.gameSessionService.getSessionState(sessionId);
    return state.status !== GameState.FINISHED;
  }

  /** Kiểm tra và xử lý câu hỏi cuối cùng - end game thay vì lỗi */
  private async handleLastQuestionOrAdvance(sessionId: string): Promise<{ isLastQuestion: boolean; result?: any }> {
    const cached = await this.gameSessionService.getSessionState(sessionId);

    this.logger.log(`[GameGateway] handleLastQuestionOrAdvance: currentIndex=${cached.currentQuestionIndex}, total=${cached.totalQuestions}, status=${cached.status}`);

    if (cached.currentQuestionIndex >= cached.totalQuestions - 1) {
      this.logger.log(`[GameGateway] Last question reached, ending game`);
      await this.gameSessionService.endGame(
        sessionId,
        (endData) => this.emitToSession(sessionId, 'game_ended', endData),
      );
      return { isLastQuestion: true };
    }

    this.logger.log(`[GameGateway] Advancing to next question`);
    // Gọi nextQuestion KHÔNG qua callback - emit trực tiếp trong handler
    const result = await this.gameSessionService.nextQuestion(sessionId, () => {});

    // Đợi 1 tick để đảm bảo socket đã join room thực sự
    await new Promise(resolve => setImmediate(resolve));

    // Emit question_start TRỰC TIẾP sau khi nextQuestion hoàn tất
    // Đảm bảo socket đã join room trước khi emit
    this.server.to(sessionId).emit('question_start', {
      ...result,
      serverTime: Date.now(),
    });
    this.logger.log(`[GameGateway] Emitted question_start for index=${result.questionIndex}`);

    // Schedule timer cho câu tiếp theo
    const nextCallback = (data: any) => this.handleQuestionEnd(sessionId, data);
    this.sessionCallbacks.set(sessionId, nextCallback);
    this.gameSessionService.scheduleQuestionEnd(sessionId, result.question.timeLimit, nextCallback);

    return { isLastQuestion: false, result };
  }

  // ============================================================================
  // GAME EVENTS - HOST JOIN
  // ============================================================================

  @SubscribeMessage('host_join_game')
  async handleHostJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; jwt?: string; userId?: string },
  ) {
    try {
      // 1. Verify host identity
      let hostId: string = 'unknown';
      let isActualHost = false;

      if (payload.jwt) {
        try {
          const decoded = this.jwtService.verify(payload.jwt);
          hostId = decoded.sub || decoded.id;
        } catch {
          if (payload.userId) hostId = payload.userId;
        }
      } else if (payload.userId) {
        hostId = payload.userId;
      }

      // 2. Get session state
      const fullState = await this.gameSessionService.getFullSessionState(payload.sessionId);

      // 3. Verify against DB
      if (fullState?.room?.hostId && hostId === fullState.room.hostId) {
        isActualHost = true;
      }

      // 4. Register socket
      client.join(payload.sessionId);
      const identity: PlayerIdentity = {
        userId: hostId,
        playerId: isActualHost ? `host_${hostId}` : `user_${hostId}`,
        roomId: fullState?.roomId,
        sessionId: payload.sessionId,
        nickname: isActualHost ? 'Host' : `Player(${hostId})`,
        isHost: isActualHost,
      };
      this.registerSocketToSession(client, payload.sessionId, identity);

      this.logger.log(`[GameGateway] Registered socket ${client.id} as isHost=${isActualHost}, session=${payload.sessionId}`);

      return {
        success: true,
        isActualHost,
        state: this.buildReloadResponse(fullState),
      };
    } catch (error) {
      this.logger.error(`Error in host_join_game: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // GAME EVENTS - HOST ACTIONS
  // ============================================================================

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
        const identity = this.verifyHost(client);
        if (!identity) return { success: false, error: 'Only host can start game' };
        hostId = identity.userId || identity.playerId;
      }

      // Start game
      const result = await this.gameSessionService.startGame(payload.roomId, hostId);

      // Register socket
      client.join(result.session.id);
      const identity: PlayerIdentity = {
        userId: hostId,
        playerId: `host_${hostId}`,
        roomId: payload.roomId,
        sessionId: result.session.id,
        nickname: 'Host',
        isHost: true,
      };
      this.registerSocketToSession(client, result.session.id, identity);

      // Countdown
      this.server.to(result.session.id).emit('game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });
      for (let i = 5; i > 0; i--) {
        await this.delay(1000);
        this.server.to(result.session.id).emit('countdown_tick', { remaining: i - 1 });
      }

      // Update timer
      await this.gameSessionService.updateQuestionStartTime(result.session.id, Date.now());

      // Redirect to game page
      this.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });
      this.roomGateway.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });

      // Question start
      this.server.to(payload.roomId).emit('question_start', {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        serverTime: Date.now(),
      });

      // Schedule timer
      const questionEndCallback = (data: any) => this.handleQuestionEnd(result.session.id, data);
      this.sessionCallbacks.set(result.session.id, questionEndCallback);
      this.gameSessionService.scheduleQuestionEnd(result.session.id, result.firstQuestion.timeLimit, questionEndCallback);

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
      const identity = this.verifyHost(client);
      if (!identity) return { success: false, error: 'Only host can advance question' };

      if (identity.sessionId !== payload.sessionId) {
        identity.sessionId = payload.sessionId;
        client.join(payload.sessionId);
        this.registerSocketToSession(client, payload.sessionId, identity);
      }

      // Check game finished
      if (!await this.checkGameNotFinished(payload.sessionId)) {
        return { success: false, error: 'Game already finished' };
      }

      this.gameSessionService.cancelTimer(payload.sessionId);

      // Handle last question or advance
      const { isLastQuestion } = await this.handleLastQuestionOrAdvance(payload.sessionId);

      return { success: true, gameEnded: isLastQuestion };
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
      const identity = this.verifyHost(client);
      if (!identity) return { success: false, error: 'Only host can end game' };

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

  @SubscribeMessage('host_close_room')
  async handleHostCloseRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; roomId: string },
  ) {
    try {
      const identity = this.verifyHost(client);
      if (!identity) return { success: false, error: 'Only host can close room' };

      this.gameSessionService.cancelTimer(payload.sessionId);

      // Notify all sockets in session
      const sessionSockets = this.sessionSockets.get(payload.sessionId);
      if (sessionSockets) {
        for (const socketId of sessionSockets) {
          const socket = this.server.sockets.sockets.get(socketId);
          socket?.emit('room_closed', { reason: 'Host da roi phong' });
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Error closing room: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('host_play_again')
  async handleHostPlayAgain(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; roomId: string },
  ) {
    try {
      const identity = this.verifyHost(client);
      if (!identity) return { success: false, error: 'Only host can restart game' };

      // Reset and start new game
      await this.roomService.updateStatus(payload.roomId, 'WAITING' as any);
      const hostId = identity.userId || identity.playerId;
      const result = await this.gameSessionService.startGame(payload.roomId, hostId);

      // Register to new session
      identity.sessionId = result.session.id;
      client.join(result.session.id);
      this.registerSocketToSession(client, result.session.id, identity);

      // Countdown
      this.server.to(payload.roomId).emit('game_starting', { sessionId: result.session.id, countdown: 5 });
      for (let i = 5; i > 0; i--) {
        await this.delay(1000);
        this.server.to(payload.roomId).emit('countdown_tick', { remaining: i - 1 });
      }

      // Redirect
      this.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });
      this.server.to(result.session.id).emit('question_start', {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        serverTime: Date.now(),
      });

      // Timer
      this.gameSessionService.scheduleQuestionEnd(
        result.session.id,
        result.firstQuestion.timeLimit,
        (data) => this.handleQuestionEnd(result.session.id, data),
      );

      return { success: true, sessionId: result.session.id };
    } catch (error) {
      this.logger.error(`Error restarting game: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // GAME EVENTS - PLAYER ACTIONS
  // ============================================================================

  @SubscribeMessage('join_game')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; playerId: string; nickname: string },
  ) {
    try {
      const fullState = await this.gameSessionService.getFullSessionState(payload.sessionId);

      const identity: PlayerIdentity = {
        playerId: payload.playerId,
        roomId: fullState?.roomId,
        sessionId: payload.sessionId,
        nickname: payload.nickname,
        isHost: false,
      };

      client.join(payload.sessionId);
      this.registerSocketToSession(client, payload.sessionId, identity);

      return {
        success: true,
        state: this.buildReloadResponse(fullState),
      };
    } catch (error) {
      this.logger.error(`[GameGateway] join_game error: ${error.message}`);
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
      this.logger.error(`[GameGateway] submit_answer error: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  // ============================================================================
  // QUERY EVENTS
  // ============================================================================

  @SubscribeMessage('get_game_state')
  async handleGetGameState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ) {
    try {
      const state = await this.gameSessionService.getSessionState(payload.sessionId);
      const leaderboard = await this.gameSessionService.getLeaderboard(payload.sessionId);
      return { success: true, state, leaderboard };
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

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async handleQuestionEnd(sessionId: string, data: any) {
    this.server.to(sessionId).emit('question_result', { ...data, serverTime: Date.now() });

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
