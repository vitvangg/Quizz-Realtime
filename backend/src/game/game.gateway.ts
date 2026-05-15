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

  // Host disconnect tracking - sessionId -> { hostSocketId, timeout }
  private hostDisconnectTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly HOST_RECONNECT_GRACE_MS = 10000; // 10 seconds grace period

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

    // Nếu là host, bắt đầu grace period trước khi terminate session
    if (identity.isHost && identity.sessionId) {
      this.handleHostDisconnect(client, identity);
    } else {
      // Non-host: simply remove from session
      this.removeSocketFromSession(client, identity);
    }

    this.socketMap.delete(client.id);
  }

  /**
   * Xử lý khi host disconnect - bắt đầu grace period
   */
  private async handleHostDisconnect(client: Socket, identity: PlayerIdentity) {
    const { sessionId } = identity;
    
    if (!sessionId) {
      this.removeSocketFromSession(client, identity);
      return;
    }

    // Hủy timeout cũ nếu có (trong trường hợp host reconnect rồi disconnect lại)
    this.cancelHostGraceTimeout(sessionId);

    this.logger.log(`[GameGateway] Host disconnected, starting ${this.HOST_RECONNECT_GRACE_MS}ms grace period for session ${sessionId}`);

    // Đánh dấu host đang offline
    this.hostDisconnectTimeouts.set(sessionId, setTimeout(async () => {
      this.logger.log(`[GameGateway] Host grace period expired for session ${sessionId}, terminating`);
      await this.terminateSession(sessionId, 'HOST_DISCONNECTED');
    }, this.HOST_RECONNECT_GRACE_MS));

    // Notify players that host is temporarily disconnected
    this.server.to(sessionId).emit('host_disconnected', {
      sessionId,
      gracePeriod: this.HOST_RECONNECT_GRACE_MS,
    });
  }

  /**
   * Xử lý khi host reconnect - hủy grace period
   */
  private handleHostReconnect(sessionId: string) {
    const existingTimeout = this.hostDisconnectTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.hostDisconnectTimeouts.delete(sessionId);
      this.logger.log(`[GameGateway] Host reconnected within grace period, session ${sessionId} continues`);
      
      // Notify players that host is back
      this.server.to(sessionId).emit('host_reconnected', { sessionId });
    }
  }

  /**
   * Hủy host grace timeout
   */
  private cancelHostGraceTimeout(sessionId: string) {
    const existingTimeout = this.hostDisconnectTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.hostDisconnectTimeouts.delete(sessionId);
    }
  }

  /**
   * Xóa socket khỏi session
   */
  private removeSocketFromSession(client: Socket, identity: PlayerIdentity) {
    if (identity.sessionId) {
      const sockets = this.sessionSockets.get(identity.sessionId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.sessionSockets.delete(identity.sessionId);
        }
      }
    }
  }

  /**
   * Terminate session và cleanup toàn bộ
   */
  private async terminateSession(sessionId: string, reason: 'HOST_EXITED' | 'GAME_FINISHED' | 'HOST_DISCONNECTED') {
    this.logger.log(`[GameGateway] Terminating session ${sessionId} with reason: ${reason}`);

    // 1. Cancel any pending timer
    this.gameSessionService.cancelTimer(sessionId);

    // 2. Cancel host grace timeout nếu có
    this.cancelHostGraceTimeout(sessionId);

    // 3. Emit session_closed to all players BEFORE cleanup
    this.server.to(sessionId).emit('session_closed', {
      sessionId,
      reason,
    });

    // 4. Cleanup server state
    await this.gameSessionService.cleanupSession(sessionId);

    // 5. Update DB status to CLOSED
    await this.gameSessionService.closeSession(sessionId);

    // 6. Remove all sockets from session room
    // Use in().socketsLeave() instead of accessing internal sockets map (Socket.io v4 API)
    if (this.sessionSockets.has(sessionId)) {
      await this.server.in(sessionId).socketsLeave(sessionId);
      this.sessionSockets.delete(sessionId);
    }

    // 7. Clear callbacks
    this.sessionCallbacks.delete(sessionId);

    this.logger.log(`[GameGateway] Session ${sessionId} terminated successfully`);
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
      // Include correctAnswerId for QUESTION_RESULT state restoration
      correctAnswerId: fullState?.correctAnswerId || null,
    };
    this.logger.log(`[GameGateway] buildReloadResponse: status=${response.status}, questionIndex=${response.questionIndex}, correctAnswerId=${response.correctAnswerId}`);
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
    @MessageBody() payload: { sessionId: string; jwt: string },
  ) {
    try {
      // JWT là source of truth DUY NHẤT cho user identity
      // KHÔNG bao giờ trust payload.userId, sessionStorage, hay query params
      let hostId: string;

      if (!payload.jwt) {
        this.logger.warn(`[GameGateway] host_join_game rejected: no JWT provided`);
        return { success: false, error: 'Authentication required' };
      }

      try {
        const decoded = this.jwtService.verify(payload.jwt);
        hostId = decoded.sub || decoded.id;
      } catch (jwtError) {
        this.logger.warn(`[GameGateway] host_join_game rejected: invalid JWT`);
        return { success: false, error: 'Invalid or expired token' };
      }

      if (!hostId) {
        this.logger.warn(`[GameGateway] host_join_game rejected: could not extract user ID from JWT`);
        return { success: false, error: 'Invalid token: missing user ID' };
      }

      // Get session state to verify host status
      const fullState = await this.gameSessionService.getFullSessionState(payload.sessionId);

      // Verify against DB - only room.hostId determines actual host
      const isActualHost = !!(fullState?.room?.hostId && hostId === fullState.room.hostId);

      // Register socket with identity
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

      // If this is a host reconnect, cancel the grace timeout
      if (isActualHost) {
        this.handleHostReconnect(payload.sessionId);
      }

      this.logger.log(`[GameGateway] Registered socket ${client.id} as isHost=${isActualHost}, session=${payload.sessionId}, userId=${hostId}`);

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
    @MessageBody() payload: { roomId: string; jwt: string },
  ) {
    try {
      // JWT là source of truth DUY NHẤT
      if (!payload.jwt) {
        this.logger.warn(`[GameGateway] host_start_game rejected: no JWT`);
        return { success: false, error: 'Authentication required' };
      }

      let hostId: string;
      try {
        const decoded = this.jwtService.verify(payload.jwt);
        hostId = decoded.sub || decoded.id;
      } catch (jwtError) {
        this.logger.warn(`[GameGateway] host_start_game rejected: invalid JWT`);
        return { success: false, error: 'Invalid or expired token' };
      }

      if (!hostId) {
        return { success: false, error: 'Invalid token: missing user ID' };
      }

      // Start game
      const result = await this.gameSessionService.startGame(payload.roomId, hostId);

      // Register socket with verified host identity
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

      // Countdown (non-blocking - questions start after countdown)
      this.server.to(result.session.id).emit('game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });
      for (let i = 5; i > 0; i--) {
        await this.delay(1000);
        this.server.to(result.session.id).emit('countdown_tick', { remaining: i - 1 });
      }

      // Update timer (AFTER countdown)
      await this.gameSessionService.updateQuestionStartTime(result.session.id, Date.now());

      // Redirect to game page
      this.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });
      this.roomGateway.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });

      // Schedule timer
      const questionEndCallback = (data: any) => this.handleQuestionEnd(result.session.id, data);
      this.sessionCallbacks.set(result.session.id, questionEndCallback);
      this.gameSessionService.scheduleQuestionEnd(result.session.id, result.firstQuestion.timeLimit, questionEndCallback);

      // Question start - emit to BOTH sessionId (for connected players) AND roomId (for players still transitioning)
      const questionStartPayload = {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        timeRemaining: result.firstQuestion.timeLimit,
        serverTime: Date.now(),
      };
      
      // Emit to new session room
      this.server.to(result.session.id).emit('question_start', questionStartPayload);
      
      // Also emit to room for players transitioning
      this.server.to(payload.roomId).emit('question_start', questionStartPayload);

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

      // Terminate session with HOST_EXITED reason
      await this.terminateSession(payload.sessionId, 'HOST_EXITED');

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

      // Countdown (non-blocking - questions start after countdown)
      this.server.to(payload.roomId).emit('game_starting', { sessionId: result.session.id, countdown: 5 });
      for (let i = 5; i > 0; i--) {
        await this.delay(1000);
        this.server.to(payload.roomId).emit('countdown_tick', { remaining: i - 1 });
      }

      // Redirect
      this.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });
      
      // Schedule timer - question timer starts AFTER countdown
      const questionEndCallback = (data: any) => this.handleQuestionEnd(result.session.id, data);
      this.sessionCallbacks.set(result.session.id, questionEndCallback);
      this.gameSessionService.scheduleQuestionEnd(
        result.session.id,
        result.firstQuestion.timeLimit,
        questionEndCallback,
      );

      // Update questionStartedAt AFTER countdown, BEFORE question_start
      await this.gameSessionService.updateQuestionStartTime(result.session.id, Date.now());

      // Question start - emit to BOTH roomId (for players still connecting) AND sessionId
      // This ensures players receive question_start even if they haven't fully joined the new session
      const questionStartPayload = {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        timeRemaining: result.firstQuestion.timeLimit,
        serverTime: Date.now(),
      };
      
      // Emit to new session room
      this.server.to(result.session.id).emit('question_start', questionStartPayload);
      
      // Also emit to old room for players transitioning between sessions
      this.server.to(payload.roomId).emit('question_start', questionStartPayload);

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
