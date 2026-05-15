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
import { OnModuleDestroy, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameSessionService, GameState } from './game-session.service';
import { RoomService } from '../room/room.service';
import { RoomGateway } from '../room/room.gateway';
import { RedisService } from '../redis/redis.service';
import { setupRedisAdapter, teardownRedisAdapter } from './redis-adapter.setup';

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
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  private socketMap = new Map<string, PlayerIdentity>();
  private sessionSockets = new Map<string, Set<string>>();

  // Lưu callback để có thể resume timer khi unfreeze
  private sessionCallbacks = new Map<string, (data: any) => void>();

  // Host disconnect tracking - sessionId -> { hostSocketId, timeout }
  // CRITICAL: This is now backed by Redis for server restart resilience
  private hostDisconnectTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly HOST_RECONNECT_GRACE_MS = 10000; // 10 seconds grace period

  // Player disconnect tracking - playerId -> { sessionId, timeout, identity }
  // Used for delayed player removal (grace period for reconnect)
  private playerDisconnectTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly PLAYER_RECONNECT_GRACE_MS = 5000; // 5 seconds grace period for players

  // Track players who are in "disconnecting" state (grace period)
  // This prevents emitting player_left until grace period expires
  private playersPendingDisconnect = new Set<string>();

  // Redis key prefix for host disconnect tracking
  private readonly HOST_DISCONNECT_KEY_PREFIX = 'host:disconnect:';

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

    // Setup Redis adapter for cross-instance communication
    setupRedisAdapter(server, {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    }).catch((err) => {
      this.logger.error('[GameGateway] Failed to setup Redis Adapter:', err);
    });

    // RECOVERY: Check for orphaned host disconnect sessions on startup
    // This handles the case where server crashed during grace period
    this.recoverOrphanedSessions().catch((err) => {
      this.logger.error('[GameGateway] Error recovering orphaned sessions:', err);
    });
  }

  /**
   * Cleanup Redis adapter connections on shutdown
   */
  async onModuleDestroy() {
    await teardownRedisAdapter();
  }

  /**
   * RECOVERY: Check Redis for host disconnect records and cleanup orphaned sessions
   * This runs on gateway initialization to handle server restart scenarios
   */
  private async recoverOrphanedSessions(): Promise<void> {
    this.logger.log('[GameGateway] Checking for orphaned sessions...');

    // Scan for host disconnect keys
    const pattern = `${this.HOST_DISCONNECT_KEY_PREFIX}*`;
    const keys = await this.redisService.keys(pattern);

    for (const key of keys) {
      try {
        const data = await this.redisService.get(key);
        if (!data) continue;

        const disconnectInfo = JSON.parse(data);
        const sessionId = key.replace(this.HOST_DISCONNECT_KEY_PREFIX, '');

        // Check if grace period has expired
        if (disconnectInfo.graceEndsAt && Date.now() > disconnectInfo.graceEndsAt) {
          this.logger.log(`[GameGateway] Found expired grace period for session ${sessionId}, cleaning up`);
          await this.terminateSession(sessionId, 'HOST_DISCONNECTED');
        } else {
          // Grace period still active - restart the timeout
          const remainingMs = disconnectInfo.graceEndsAt - Date.now();
          if (remainingMs > 0) {
            this.logger.log(`[GameGateway] Restarting grace period for session ${sessionId}, ${remainingMs}ms remaining`);
            this.hostDisconnectTimeouts.set(sessionId, setTimeout(async () => {
              this.logger.log(`[GameGateway] Grace period expired for recovered session ${sessionId}`);
              await this.terminateSession(sessionId, 'HOST_DISCONNECTED');
            }, remainingMs));
          }
        }
      } catch (err) {
        this.logger.warn(`[GameGateway] Error processing orphaned session ${key}:`, err);
      }
    }

    this.logger.log(`[GameGateway] Recovered ${keys.length} orphaned sessions`);
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

    const { sessionId, playerId, nickname, isHost } = identity;

    // Nếu là host, bắt đầu grace period trước khi terminate session
    if (isHost && sessionId) {
      this.handleHostDisconnect(client, identity);
    } else {
      // Non-host: Start delayed disconnect process
      // This gives player time to reconnect without being removed from leaderboard
      this.startPlayerDisconnectGracePeriod(client, identity);
    }

    this.socketMap.delete(client.id);
  }

  /**
   * Start a grace period for player disconnect - delays removal from leaderboard
   * If player reconnects within grace period, cancellation prevents removal
   */
  private startPlayerDisconnectGracePeriod(client: Socket, identity: PlayerIdentity) {
    const { sessionId, playerId, nickname } = identity;

    if (!sessionId || !playerId) {
      // No session or playerId, just remove from session
      this.removeSocketFromSession(client, identity);
      return;
    }

    // Check if there's already a pending disconnect for this player
    // If so, cancel it (this is a re-disconnect after grace period expired)
    const existingTimeout = this.playerDisconnectTimeouts.get(playerId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.playerDisconnectTimeouts.delete(playerId);
      this.playersPendingDisconnect.delete(playerId);
    }

    this.logger.log(`[GameGateway] Player ${nickname} disconnected, starting ${this.PLAYER_RECONNECT_GRACE_MS}ms grace period`);

    // Add to pending disconnect set
    this.playersPendingDisconnect.add(playerId);

    // Remove socket from sessionSockets immediately (so new socket can rejoin)
    const sockets = this.sessionSockets.get(sessionId);
    if (sockets) {
      sockets.delete(client.id);
      // Don't delete sessionId from sessionSockets if empty - wait for grace period
    }

    // Emit "reconnecting" status to host (optional - for UI indicator)
    this.server.to(sessionId).emit('player_reconnecting', {
      playerId,
      nickname,
      gracePeriodMs: this.PLAYER_RECONNECT_GRACE_MS,
    });

    // Set timeout to actually remove player from leaderboard
    const timeout = setTimeout(async () => {
      this.logger.log(`[GameGateway] Player ${nickname} grace period expired, removing from leaderboard`);
      
      // Remove from pending set
      this.playersPendingDisconnect.delete(playerId);
      this.playerDisconnectTimeouts.delete(playerId);

      // Actually remove from leaderboard and notify
      await this.removePlayerFromLeaderboard(sessionId, playerId, nickname);
    }, this.PLAYER_RECONNECT_GRACE_MS);

    this.playerDisconnectTimeouts.set(playerId, timeout);
  }

  /**
   * Cancel pending disconnect for a player (called when player reconnects)
   */
  private cancelPlayerDisconnectGracePeriod(playerId: string, sessionId: string, nickname: string) {
    const existingTimeout = this.playerDisconnectTimeouts.get(playerId);
    
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.playerDisconnectTimeouts.delete(playerId);
      this.playersPendingDisconnect.delete(playerId);
      
      this.logger.log(`[GameGateway] Cancelled pending disconnect for player ${nickname}`);
      
      // Notify that player reconnected
      this.server.to(sessionId).emit('player_reconnected', {
        playerId,
        nickname,
        timestamp: Date.now(),
      });
      
      return true; // Was pending, now cancelled
    }
    
    return false; // No pending disconnect
  }

  /**
   * Actually remove player from leaderboard and notify
   */
  private async removePlayerFromLeaderboard(sessionId: string, playerId: string, nickname: string) {
    // Remove from game session leaderboard
    if (sessionId && playerId) {
      await this.gameSessionService.removePlayerFromLeaderboard(sessionId, playerId);

      // Broadcast updated leaderboard
      const leaderboard = await this.gameSessionService.getLeaderboard(sessionId);
      this.server.to(sessionId).emit('leaderboard_update', { leaderboard });

      // Notify that player actually left
      this.notifyPlayerLeft(sessionId, playerId, nickname);
    }
  }

  /**
   * Xử lý khi host disconnect - bắt đầu grace period
   * FIXED: Now uses Redis for persistent tracking across server restarts
   */
  private async handleHostDisconnect(client: Socket, identity: PlayerIdentity) {
    const { sessionId } = identity;
    
    if (!sessionId) {
      this.removeSocketFromSession(client, identity);
      return;
    }

    // Hủy timeout cũ nếu có (trong trường hợp host reconnect rồi disconnect lại)
    await this.cancelHostGraceTimeout(sessionId);

    this.logger.log(`[GameGateway] Host disconnected, starting ${this.HOST_RECONNECT_GRACE_MS}ms grace period for session ${sessionId}`);

    // CRITICAL: Persist to Redis so server restart doesn't lose the grace period
    const disconnectKey = `${this.HOST_DISCONNECT_KEY_PREFIX}${sessionId}`;
    const disconnectData = JSON.stringify({
      hostUserId: identity.userId,
      disconnectedAt: Date.now(),
      graceEndsAt: Date.now() + this.HOST_RECONNECT_GRACE_MS,
    });
    await this.redisService.set(disconnectKey, disconnectData, 'EX', Math.ceil(this.HOST_RECONNECT_GRACE_MS / 1000) + 5);

    // Set in-memory timeout as backup
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
   * FIXED: Now clears both in-memory and Redis state
   */
  private async handleHostReconnect(sessionId: string) {
    // Cancel in-memory timeout
    const existingTimeout = this.hostDisconnectTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.hostDisconnectTimeouts.delete(sessionId);
    }

    // CRITICAL: Also clear Redis state to prevent stale recovery
    const disconnectKey = `${this.HOST_DISCONNECT_KEY_PREFIX}${sessionId}`;
    await this.redisService.del(disconnectKey);

    this.logger.log(`[GameGateway] Host reconnected within grace period, session ${sessionId} continues`);
    
    // Notify players that host is back
    this.server.to(sessionId).emit('host_reconnected', { sessionId });
  }

  /**
   * Hủy host grace timeout
   * FIXED: Now clears both in-memory and Redis state
   */
  private async cancelHostGraceTimeout(sessionId: string) {
    // Cancel in-memory timeout
    const existingTimeout = this.hostDisconnectTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.hostDisconnectTimeouts.delete(sessionId);
    }

    // CRITICAL: Also clear Redis state
    const disconnectKey = `${this.HOST_DISCONNECT_KEY_PREFIX}${sessionId}`;
    await this.redisService.del(disconnectKey);
  }

  /**
   * Xóa socket khỏi session
   */
  private async removeSocketFromSession(client: Socket, identity: PlayerIdentity) {
    const { sessionId, playerId, nickname, roomId } = identity;

    if (sessionId) {
      const sockets = this.sessionSockets.get(sessionId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.sessionSockets.delete(sessionId);
        }
      }

      // Notify host and other players that this player left
      this.notifyPlayerLeft(sessionId, playerId, nickname);
    }
  }

  /**
   * Notify host and other players that a player left
   */
  private notifyPlayerLeft(sessionId: string, playerId: string, nickname: string) {
    // Emit to all players in the session (including host)
    this.server.to(sessionId).emit('player_left', {
      playerId,
      nickname,
      timestamp: Date.now(),
    });
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
    // questionVersion = questionIndex + 1 provides idempotent version for clients
    this.server.to(sessionId).emit('question_start', {
      ...result,
      serverTime: Date.now(),
      questionVersion: result.questionIndex + 1,
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

      // Question start - emit to sessionId ONLY
      // Players must join session room BEFORE receiving question_start
      // The game_redirect ensures players navigate to /game/{sessionId} and join
      // 
      // FIX: Removed dual-emit to roomId. Players in old room will:
      // 1. Receive game_redirect with new sessionId
      // 2. Navigate to new session page
      // 3. Join session room via join_game / host_join_game
      // 4. Receive question_start from session room only
      //
      // This prevents duplicate events for players who are already in the session
      const questionStartPayload = {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        timeRemaining: result.firstQuestion.timeLimit,
        serverTime: Date.now(),
        /** Version marker for idempotent client handling */
        questionVersion: 1,
      };

      this.server.to(result.session.id).emit('question_start', questionStartPayload);

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

      const hostId = identity.userId || identity.playerId;

      // FIX: Use PREPARING status to avoid leaving room in invalid state
      // If startGame fails, room remains in PLAYING (from previous game) so it can't be reused
      // This prevents stuck WAITING state if startGame() throws
      await this.roomService.updateStatus(payload.roomId, 'WAITING' as any);

      let result: any;
      try {
        result = await this.gameSessionService.startGame(payload.roomId, hostId);
      } catch (startError) {
        // ROLLBACK: Restore room to previous state if startGame fails
        this.logger.error(`[host_play_again] startGame failed, rolling back room status: ${startError.message}`);
        await this.roomService.updateStatus(payload.roomId, 'PLAYING' as any);
        throw startError;
      }

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

      // Question start - emit to sessionId ONLY (same fix as host_start_game)
      const questionStartPayload = {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        timeRemaining: result.firstQuestion.timeLimit,
        serverTime: Date.now(),
        questionVersion: 1,
      };

      this.server.to(result.session.id).emit('question_start', questionStartPayload);

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

      // Check if this is a reconnection within grace period
      const isReconnect = this.playersPendingDisconnect.has(payload.playerId);
      
      // If player was in grace period, cancel the pending disconnect
      if (isReconnect) {
        this.cancelPlayerDisconnectGracePeriod(payload.playerId, payload.sessionId, payload.nickname);
      }

      const identity: PlayerIdentity = {
        playerId: payload.playerId,
        roomId: fullState?.roomId,
        sessionId: payload.sessionId,
        nickname: payload.nickname,
        isHost: false,
      };

      client.join(payload.sessionId);
      this.registerSocketToSession(client, payload.sessionId, identity);

      // If this is a fresh join (not reconnect), emit player_joined
      if (!isReconnect) {
        this.server.to(payload.sessionId).emit('player_joined', {
          playerId: payload.playerId,
          nickname: payload.nickname,
          timestamp: Date.now(),
        });
      }

      return {
        success: true,
        isReconnect,
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

      // CRITICAL: Anti-cheat - only emit score_update to the submitting player during QUESTION_ACTIVE
      // This prevents other players from inferring correct answer from score patterns
      // The response is sent back to the player regardless of game state
      const cached = await this.gameSessionService.getSessionState(payload.sessionId);
      if (cached?.status === GameState.QUESTION_ACTIVE) {
        // During answering: Only send to the player who submitted
        // This confirms their answer was received but doesn't reveal score yet
        client.emit('answer_received', {
          success: true,
          isCorrect: result.isCorrect, // Can reveal if correct, but not score
          scoreEarned: result.scoreEarned,
        });
        // Don't emit score_update to whole session during QUESTION_ACTIVE
        this.logger.log(`[submit_answer:${payload.sessionId}] Answer from ${payload.playerId} received, score hidden during QUESTION_ACTIVE`);
      } else {
        // After question ends: Safe to emit full leaderboard
        this.server.to(payload.sessionId).emit('score_update', {
          playerId: payload.playerId,
          score: result.scoreEarned,
          leaderboard: result.leaderboard,
        });
      }

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
  // PLAYER LEAVE EVENT
  // ============================================================================

  @SubscribeMessage('player_leave_game')
  async handlePlayerLeaveGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; playerId: string; nickname: string },
  ) {
    this.logger.log(`[GameGateway] player_leave_game: ${payload.nickname} (${payload.playerId}) from session ${payload.sessionId}`);

    // Remove player from leaderboard
    await this.gameSessionService.removePlayerFromLeaderboard(payload.sessionId, payload.playerId);

    // Remove from socket tracking
    const sockets = this.sessionSockets.get(payload.sessionId);
    if (sockets) {
      sockets.delete(client.id);
    }

    // Notify all remaining players
    this.server.to(payload.sessionId).emit('player_left', {
      playerId: payload.playerId,
      nickname: payload.nickname,
      timestamp: Date.now(),
    });

    // Broadcast updated leaderboard
    const leaderboard = await this.gameSessionService.getLeaderboard(payload.sessionId);
    this.server.to(payload.sessionId).emit('leaderboard_update', { leaderboard });

    return { success: true };
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
