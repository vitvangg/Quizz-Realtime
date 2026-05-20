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
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { GameSessionService, GameState } from './game-session.service';
import { PlayerPresenceService, ConnectionStatus } from './player-presence.service';
import { RoomService } from '../room/room.service';
import { RoomGateway } from '../room/room.gateway';
import { RedisService } from '../redis/redis.service';
import { setupRedisAdapter } from './redis-adapter.setup';
import {
  PlayerJoinedEvent,
  PlayerLeftEvent,
  PlayerAnsweredEvent,
} from '../common/socket/socket-events.interface';
import { GAME_CONSTANTS } from '../common/constants';

/**
 * Simplified Player Identity - socket only stores minimal data
 * All authoritative state is in Redis via PlayerPresenceService
 */
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

  // Minimal socket storage - just maps socketId -> identity
  // This is NOT authoritative - only used for disconnect handling
  private socketMap = new Map<string, PlayerIdentity>();

  // Session callbacks for timer handling
  private sessionCallbacks = new Map<string, (data: any) => void>();

  constructor(
    private readonly gameSessionService: GameSessionService,
    private readonly presenceService: PlayerPresenceService,
    private readonly roomService: RoomService,
    private readonly jwtService: JwtService,
    private readonly roomGateway: RoomGateway,
    private readonly redisService: RedisService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('[GameGateway] Initialized (Stateless Socket Architecture)');

    // Setup Redis Adapter once (idempotent - safe to call from multiple gateways)
    setupRedisAdapter(server, {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    }).catch((err) => {
      this.logger.error('[GameGateway] Failed to setup Redis Adapter:', err);
    });
  }

  // NOTE: onModuleDestroy intentionally removed
  // Redis Adapter teardown is handled at app-level shutdown if needed
  // This ensures no gateway prematurely closes connections used by others

  getConnectionCount(): number {
    return this.socketMap.size;
  }

  // ============================================================================
  // CONNECTION HANDLING
  // ============================================================================

  async handleConnection(client: Socket) {
    const ip = client.handshake.address;

    const isBanned = await this.redisService.isIpBanned(ip);
    if (isBanned) {
      this.logger.warn(`[GameGateway] Rejected BANNED IP: ${ip} (socket: ${client.id})`);
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

    // Remove from socket map
    this.socketMap.delete(client.id);

    if (!sessionId || !playerId) return;

    // MARK DISCONNECTED in Redis (simple timestamp update)
    // NO grace period, NO removal from leaderboard
    // NO host termination - game continues with remaining players
    await this.presenceService.markDisconnected(sessionId, playerId);

    // Emit connection status update
    this.server.to(sessionId).emit('player_status', {
      playerId,
      nickname,
      connection: 'DISCONNECTED',
      isHost,
      timestamp: Date.now(),
    });

    this.logger.log(`[GameGateway] Player ${nickname} marked disconnected (session continues)`);
  }

  // ============================================================================
  // SYSTEM INCIDENT EVENTS
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
      const paused = await this.gameSessionService.pauseAllTimers();
      this.logger.warn(`[FREEZE] Paused ${paused.size} session timers`);
    } else {
      for (const [sessionId, callback] of this.sessionCallbacks.entries()) {
        const remainingMs = await this.gameSessionService.getTimerRemainingMs(sessionId);
        if (remainingMs !== null && remainingMs > 0) {
          const remainingSec = Math.ceil(remainingMs / 1000);
          this.logger.log(`[UNFREEZE] Resuming session ${sessionId} with ${remainingSec}s remaining`);

          this.server.to(sessionId).emit('timer_resume', {
            remainingSeconds: remainingSec,
          });

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
      this.logger.error(`[KILL SWITCH] Targeted room [${payload.pin}]`);
      if (this.server) this.server.in(payload.pin).disconnectSockets(true);
    } else {
      this.logger.error('[KILL SWITCH] Global disconnect');
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
  }

  // ============================================================================
  // SOCKET MANAGEMENT HELPERS
  // ============================================================================

  private registerSocket(client: Socket, identity: PlayerIdentity) {
    this.socketMap.set(client.id, identity);
    if (identity.sessionId) {
      client.join(identity.sessionId);
    }
  }

  private buildReloadResponse(fullState: any, leaderboard: any[] = []) {
    let remainingTime = fullState?.remainingTime ?? null;
    
    // Recalculate remainingTime for QUESTION_ACTIVE state
    // to account for time elapsed since the state was cached
    if (fullState?.status === GameState.QUESTION_ACTIVE && fullState?.questionStartedAt) {
      const elapsed = (Date.now() - fullState.questionStartedAt) / 1000;
      const timeLimit = fullState.currentQuestion?.timeLimit || 20;
      remainingTime = Math.max(0, Math.floor(timeLimit - elapsed));
    }
    
    if (fullState?.status === GameState.QUESTION_RESULT) {
      remainingTime = 0;
    }

    // Check if we need to redirect to a newer session (play_again case)
    // Include currentSessionId so frontend can redirect to the new session
    let redirectToSessionId: string | undefined;
    if (fullState?.status === GameState.FINISHED && fullState?.roomId) {
      // Note: The actual currentSessionId lookup is done in the calling function
      // Here we just pass through what was already computed
      redirectToSessionId = fullState.currentSessionId;
    }

    return {
      status: fullState?.status || GameState.WAITING,
      currentQuestion: fullState?.currentQuestion || null,
      questionIndex: fullState?.currentQuestionIndex ?? 0,
      totalQuestions: fullState?.totalQuestions ?? 0,
      leaderboard: leaderboard.length > 0 ? leaderboard : (fullState?.leaderboard || []),
      remainingTime,
      correctAnswerId: fullState?.correctAnswerId || null,
      questionStartedAt: fullState?.questionStartedAt || null,
      // FIX: Use questionStartedAt as serverTime to match question_start event behavior
      // This ensures consistent timer calculation between real-time events and HTTP recovery
      // client calculates: elapsedMs = Date.now() - serverTime
      // When serverTime = questionStartedAt, elapsedMs = time since question started
      // When serverTime = Date.now(), elapsedMs ≈ 0 → remaining always = timeLimit (20s)
      serverTime: fullState?.status === GameState.QUESTION_ACTIVE && fullState?.questionStartedAt
        ? fullState.questionStartedAt
        : Date.now(),
      // Include redirect info for FINISHED sessions (play_again case)
      currentSessionId: redirectToSessionId,
    };
  }

  /**
   * Verify if the client is the actual host for the session.
   * Checks BOTH socketMap (for isHost flag) AND Redis (authoritative state).
   *
   * This prevents:
   * - Socket replay attacks where someone reuses old socket data
   * - Cases where socketMap was cleared/restored incorrectly
   * - Multi-instance race conditions
   */
  private async verifyHost(client: Socket, sessionId: string): Promise<PlayerIdentity | null> {
    const identity = this.socketMap.get(client.id);
    
    this.logger.log(`[verifyHost] Checking host for session=${sessionId}, socket=${client.id}, identity=${JSON.stringify(identity)}`);
    
    if (!identity?.isHost) {
      this.logger.warn(`[verifyHost] No host identity found for socket ${client.id}`);
      return null;
    }

    // Verify against Redis authoritative state
    const hostId = await this.presenceService.getHostId(sessionId);
    this.logger.log(`[verifyHost] Redis hostId for session=${sessionId}: ${hostId}`);
    
    if (!hostId) {
      this.logger.warn(`[verifyHost] No host found in Redis for session ${sessionId}`);
      return null;
    }

    // Compare playerId (which is in format host_{userId}) with Redis hostId
    // NOTE: identity.playerId is "host_{userId}" format, identity.userId is just userId
    const clientPlayerId = identity.playerId;
    
    this.logger.log(`[verifyHost] Comparing clientPlayerId=${clientPlayerId} with hostId=${hostId}`);
    
    if (clientPlayerId !== hostId) {
      this.logger.warn(`[verifyHost] Player ${clientPlayerId} is not the host (actual host: ${hostId})`);
      return null;
    }

    this.logger.log(`[verifyHost] Host verification passed for ${clientPlayerId}`);
    return identity;
  }

  private async checkGameNotFinished(sessionId: string): Promise<boolean> {
    const state = await this.gameSessionService.getSessionState(sessionId);
    return state.status !== GameState.FINISHED;
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
      if (!payload.jwt) {
        return { success: false, error: 'Authentication required' };
      }

      let hostId: string;
      try {
        const decoded = this.jwtService.verify(payload.jwt);
        hostId = decoded.sub || decoded.id;
      } catch {
        return { success: false, error: 'Invalid or expired token' };
      }

      if (!hostId) {
        return { success: false, error: 'Invalid token: missing user ID' };
      }

      const fullState = await this.gameSessionService.getFullSessionState(payload.sessionId);
      if (!fullState) {
        return { success: false, error: 'Game session not found' };
      }

      const isActualHost = !!(fullState.room?.hostId && hostId === fullState.room.hostId);

      // === DEBUG LOGGING FOR HOST JOIN GAME ===
      console.log(`[HostJoinGame] sessionId=${payload.sessionId} jwtUserId=${hostId} roomHostId=${fullState.room?.hostId} isActualHost=${isActualHost}`);
      console.log(`[HostJoinGame] returned status=${fullState.status} source=${'tbd'}`);

      if (!isActualHost) {
        return { success: false, error: 'Only the host can join as host' };
      }

      // Check if session is finished and needs redirect (play_again case)
      // Use currentSessionId from fullState (already computed by getFullSessionState)
      let currentSessionId: string | undefined;
      console.log(`[HostJoinGame] Checking FINISHED redirect: status=${fullState.status}, roomId=${fullState.roomId}`);
      console.log(`[HostJoinGame] fullState.currentSessionId=${fullState.currentSessionId}, payload.sessionId=${payload.sessionId}`);
      
      if (fullState.status === GameState.FINISHED && fullState.roomId) {
        // currentSessionId is already computed in getFullSessionState
        if (fullState.currentSessionId && fullState.currentSessionId !== payload.sessionId) {
          currentSessionId = fullState.currentSessionId;
          console.log(`[HostJoinGame] FINISHED session redirect: ${payload.sessionId} → ${currentSessionId}`);
        } else {
          // Fallback: query room directly
          const newSessionId = await this.roomService.getCurrentSessionId(fullState.roomId);
          console.log(`[HostJoinGame] FINISHED session redirect fallback: roomId=${fullState.roomId}, getCurrentSessionId=${newSessionId}`);
          if (newSessionId && newSessionId !== payload.sessionId) {
            currentSessionId = newSessionId;
            console.log(`[HostJoinGame] Using fallback redirect: ${payload.sessionId} → ${currentSessionId}`);
          } else {
            console.log(`[HostJoinGame] NO redirect needed: newSessionId=${newSessionId} === payload.sessionId=${payload.sessionId}`);
          }
        }
      } else {
        console.log(`[HostJoinGame] No FINISHED redirect: status=${fullState.status}, roomId=${fullState.roomId}`);
      }

      const hostPlayerId = `host_${hostId}`;
      
      // Check if host already exists in session (reconnect/refresh case)
      // This happens after host_play_again where host was already attached
      const existingPresence = await this.presenceService.getPlayerPresence(payload.sessionId, hostPlayerId);
      const isRejoin = !!existingPresence;
      
      let rejoinReason: string | undefined;
      let isRefresh = false;

      if (isRejoin) {
        if (existingPresence.socketId === client.id) {
          // Same socket - this is a session refresh (e.g., page re-render after play_again)
          isRefresh = true;
          rejoinReason = 'session_refresh';
          this.logger.log(`[GameGateway] Host session refresh (same socket) for session=${payload.sessionId}`);
        } else {
          // Different socket - this is a reconnect (host disconnected and reconnected)
          rejoinReason = 'reconnect';
          this.logger.log(`[GameGateway] Host reconnect detected, updating socketId: ${existingPresence.socketId} -> ${client.id}`);
          await this.presenceService.updateSocketId(payload.sessionId, hostPlayerId, client.id);
        }
      } else {
        // First time joining - attach as new host
        this.logger.log(`[GameGateway] Host first join, attaching to session=${payload.sessionId}`);
        
        await this.presenceService.attachPlayer({
          sessionId: payload.sessionId,
          playerId: hostPlayerId,
          nickname: 'Host',
          socketId: client.id,
          isHost: true,
        });
      }

      const identity: PlayerIdentity = {
        userId: hostId,
        playerId: hostPlayerId,
        roomId: fullState.roomId,
        sessionId: payload.sessionId,
        nickname: 'Host',
        isHost: true,
      };
      this.registerSocket(client, identity);

      // NOTE: Do NOT emit host_reconnected here!
      // host_join_game is called during game redirect (first join), NOT during actual host reconnect.
      // Real host reconnect detection happens in handleDisconnect/handleConnection lifecycle.
      
      this.logger.log(`[GameGateway] Host registered for session=${payload.sessionId}, userId=${hostId}, isRejoin=${isRejoin}, reason=${rejoinReason}`);

      return {
        success: true,
        isActualHost,
        isReconnect: isRejoin && !isRefresh,
        rejoinReason,
        currentSessionId,
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
      if (!payload.jwt) {
        return { success: false, error: 'Authentication required' };
      }

      let hostId: string;
      try {
        const decoded = this.jwtService.verify(payload.jwt);
        hostId = decoded.sub || decoded.id;
      } catch {
        return { success: false, error: 'Invalid or expired token' };
      }

      if (!hostId) {
        return { success: false, error: 'Invalid token: missing user ID' };
      }

      const result = await this.gameSessionService.startGame(payload.roomId, hostId);

      await this.roomService.updateCurrentSessionId(payload.roomId, result.session.id);

      // Attach host to new session
      await this.presenceService.attachPlayer({
        sessionId: result.session.id,
        playerId: `host_${hostId}`,
        nickname: 'Host',
        socketId: client.id,
        isHost: true,
      });

      const identity: PlayerIdentity = {
        userId: hostId,
        playerId: `host_${hostId}`,
        roomId: payload.roomId,
        sessionId: result.session.id,
        nickname: 'Host',
        isHost: true,
      };
      this.registerSocket(client, identity);

      // Countdown + question start
      // Emit to both sessionId (for players already in game) and roomId (for players still in lobby)
      this.server.to(result.session.id).emit('game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });
      this.roomGateway.server.to(payload.roomId).emit('game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });

      for (let i = 5; i > 0; i--) {
        await this.delay(1000);
        this.server.to(result.session.id).emit('countdown_tick', { remaining: i - 1 });
        this.roomGateway.server.to(payload.roomId).emit('countdown_tick', { remaining: i - 1 });
      }

      // Emit redirect to players in room
      // NOTE: GameGateway is on /game namespace, RoomGateway is on /lobby namespace
      // Emit on both namespaces so redirect works during lobby phase
      this.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });
      this.roomGateway.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });

      // Buffer time for players to navigate from lobby to game and join socket
      await this.delay(GAME_CONSTANTS.GAME_REDIRECT_BUFFER_MS);

      // Create questionStartTime at the EXACT moment question begins (server is source of truth)
      const questionStartTime = Date.now();
      const timeLimit = result.firstQuestion.timeLimit || 20;
      const questionEndTime = questionStartTime + (timeLimit * 1000);

      // Clear answered status for new question
      await this.gameSessionService.clearAnsweredPlayers(result.session.id);

      const questionStartPayload = {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        questionStartTime,
        questionEndTime, // Absolute end time for client timer sync
        serverTime: questionStartTime,
        timeLimit,
        questionVersion: 1,
      };

      // Emit question_start BEFORE updating questionStartTime in cache
      // This ensures the server and client have the same reference point
      this.server.to(result.session.id).emit('question_start', questionStartPayload);

      // Update questionStartTime in cache AFTER emitting (for scoring calculations)
      await this.gameSessionService.updateQuestionStartTime(result.session.id, questionStartTime);

      // Schedule question end timer (server-driven)
      const questionEndCallback = (data: any) => this.handleQuestionEnd(result.session.id, data);
      this.sessionCallbacks.set(result.session.id, questionEndCallback);
      this.gameSessionService.scheduleQuestionEnd(result.session.id, timeLimit, questionEndCallback);

      // Emit leaderboard_update for host to populate player list
      const leaderboard = await this.gameSessionService.getLeaderboard(result.session.id);
      this.server.to(result.session.id).emit('leaderboard_update', { sessionId: result.session.id, leaderboard });

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
      const identity = await this.verifyHost(client, payload.sessionId);
      if (!identity) return { success: false, error: 'Only host can advance question' };

      if (identity.sessionId !== payload.sessionId) {
        identity.sessionId = payload.sessionId;
        client.join(payload.sessionId);
        this.registerSocket(client, identity);
      }

      if (!await this.checkGameNotFinished(payload.sessionId)) {
        return { success: false, error: 'Game already finished' };
      }

      this.gameSessionService.cancelTimer(payload.sessionId);

      const cached = await this.gameSessionService.getSessionState(payload.sessionId);

      if (cached.currentQuestionIndex >= cached.totalQuestions - 1) {
        this.logger.log(`[GameGateway] Last question reached, ending game`);
        await this.gameSessionService.endGame(
          payload.sessionId,
          (endData) => this.emitToSession(payload.sessionId, 'game_ended', endData),
        );
        return { success: true, gameEnded: true };
      }

      const result = await this.gameSessionService.nextQuestion(payload.sessionId, () => {});

      await new Promise(resolve => setImmediate(resolve));

      // Create questionStartTime at the EXACT moment question begins (server is source of truth)
      const questionStartTime = Date.now();
      const timeLimit = result.question.timeLimit || 20;
      const questionEndTime = questionStartTime + (timeLimit * 1000);

      // Clear answered status for new question
      await this.gameSessionService.clearAnsweredPlayers(payload.sessionId);

      const questionStartPayload = {
        sessionId: payload.sessionId,
        questionIndex: result.questionIndex,
        question: result.question,
        totalQuestions: result.totalQuestions,
        questionStartTime,
        questionEndTime, // Absolute end time for client timer sync
        serverTime: questionStartTime,
        timeLimit,
        questionVersion: result.questionIndex + 1,
      };

      // Emit question_start BEFORE updating questionStartTime in cache
      // This ensures the server and client have the same reference point
      this.server.to(payload.sessionId).emit('question_start', questionStartPayload);

      // Update questionStartTime in cache AFTER emitting (for scoring calculations)
      await this.gameSessionService.updateQuestionStartTime(payload.sessionId, questionStartTime);

      // Emit leaderboard_update for host to update player list
      const leaderboard = await this.gameSessionService.getLeaderboard(payload.sessionId);
      this.server.to(payload.sessionId).emit('leaderboard_update', { sessionId: payload.sessionId, leaderboard });

      // Schedule question end timer (server-driven)
      const nextCallback = (data: any) => this.handleQuestionEnd(payload.sessionId, data);
      this.sessionCallbacks.set(payload.sessionId, nextCallback);
      this.gameSessionService.scheduleQuestionEnd(payload.sessionId, timeLimit, nextCallback);

      return { success: true, gameEnded: false };
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
      const identity = await this.verifyHost(client, payload.sessionId);
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
      const identity = await this.verifyHost(client, payload.sessionId);
      if (!identity) return { success: false, error: 'Only host can close room' };

      await this.cleanupSession(payload.sessionId, 'HOST_EXITED');
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
      const identity = await this.verifyHost(client, payload.sessionId);
      if (!identity) return { success: false, error: 'Only host can restart game' };

      const hostId = identity.userId || identity.playerId;

      await this.roomService.updateStatus(payload.roomId, 'WAITING' as any);

      let result: any;
      try {
        result = await this.gameSessionService.startGame(payload.roomId, hostId);
      } catch (startError) {
        this.logger.error(`[host_play_again] startGame failed: ${startError.message}`);
        await this.roomService.updateStatus(payload.roomId, 'PLAYING' as any);
        throw startError;
      }

      const oldSessionId = payload.sessionId;

      await this.roomService.updateCurrentSessionId(payload.roomId, result.session.id);
      this.logger.log(`[GameGateway] host_play_again: ${oldSessionId} → ${result.session.id}`);

      // Update host's presence to new session BEFORE emitting session_switched
      // This ensures players see the host is already in the new session
      await this.presenceService.detachPlayer(oldSessionId, `host_${identity.userId}`);
      await this.presenceService.attachPlayer({
        sessionId: result.session.id,
        playerId: `host_${identity.userId}`,
        nickname: 'Host',
        socketId: client.id,
        isHost: true,
      });

      identity.sessionId = result.session.id;
      client.leave(oldSessionId);
      client.join(result.session.id);
      this.registerSocket(client, identity);

      // Emit session_switched to OLD session room.
      // BOTH host and players are still in the old room at this point,
      // so a single event to oldSessionId covers everyone.
      // Hosts receive it too (their socket hasn't left yet), but since
      // session_switched sets gameStatus=STARTING in sessionStorage and
      // the remount useEffect skips HTTP fetch when playAgainState is valid,
      // the host ends up in the correct STARTING state on the new session URL.
      this.server.to(oldSessionId).emit('session_switched', {
        oldSessionId,
        newSessionId: result.session.id,
        url: `/game/${result.session.id}`,
        timestamp: Date.now(),
        state: {
          status: 'STARTING',
          currentQuestion: null,
          questionIndex: 0,
          totalQuestions: result.totalQuestions,
          leaderboard: [],
          remainingTime: result.firstQuestion.timeLimit,
          correctAnswerId: null,
          countdown: 5,
        },
      });

      // Countdown
      this.server.to(result.session.id).emit('game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });
      // Also emit to lobby namespace in case some players are still there
      this.roomGateway.server.to(payload.roomId).emit('game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });

      for (let i = 5; i > 0; i--) {
        await this.delay(1000);
        this.server.to(result.session.id).emit('countdown_tick', { remaining: i - 1 });
        this.roomGateway.server.to(payload.roomId).emit('countdown_tick', { remaining: i - 1 });
      }

      // Emit redirect to players in room
      this.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });
      this.roomGateway.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });

      // Buffer time for players to navigate and join the new game session
      await this.delay(GAME_CONSTANTS.GAME_REDIRECT_BUFFER_MS);

      // Create questionStartTime at the EXACT moment question begins (server is source of truth)
      const questionStartTime = Date.now();
      const timeLimit = result.firstQuestion.timeLimit || 20;
      const questionEndTime = questionStartTime + (timeLimit * 1000);

      // Clear answered status for new question
      await this.gameSessionService.clearAnsweredPlayers(result.session.id);

      const questionStartPayload = {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        questionStartTime,
        questionEndTime, // Absolute end time for client timer sync
        serverTime: questionStartTime,
        timeLimit,
        questionVersion: 1,
      };

      // Emit question_start BEFORE updating questionStartTime in cache
      // This ensures the server and client have the same reference point
      this.server.to(result.session.id).emit('question_start', questionStartPayload);

      // Update questionStartTime in cache AFTER emitting (for scoring calculations)
      await this.gameSessionService.updateQuestionStartTime(result.session.id, questionStartTime);

      // Schedule question end timer (server-driven)
      const questionEndCallback = (data: any) => this.handleQuestionEnd(result.session.id, data);
      this.sessionCallbacks.set(result.session.id, questionEndCallback);
      this.gameSessionService.scheduleQuestionEnd(result.session.id, timeLimit, questionEndCallback);

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

      if (!fullState) {
        return { success: false, error: 'Game session not found' };
      }

      // Check if game is finished - redirect to newer session if available
      if (fullState.status === GameState.FINISHED) {
        const currentSessionId = await this.roomService.getCurrentSessionId(fullState.roomId);

        if (currentSessionId && currentSessionId !== payload.sessionId) {
          this.logger.log(`[GameGateway] Player ${payload.playerId} in finished session ${payload.sessionId}, redirecting to ${currentSessionId}`);
          return {
            success: true,
            needsRedirect: true,
            redirectToSession: currentSessionId,
            sessionId: payload.sessionId,
            state: this.buildReloadResponse(fullState),
          };
        }
      }

      // RECONNECT: Check if player was previously connected (disconnected but still in session)
      const existingPresence = await this.presenceService.getPlayerPresence(payload.sessionId, payload.playerId);
      const isReconnect = !!existingPresence;

      if (isReconnect) {
        // Reconnect: update socket ID in Redis
        await this.presenceService.reconnectPlayer({
          sessionId: payload.sessionId,
          playerId: payload.playerId,
          newSocketId: client.id,
        });

        // Emit reconnected status
        this.server.to(payload.sessionId).emit('player_status', {
          playerId: payload.playerId,
          nickname: payload.nickname,
          connection: 'CONNECTED',
          isHost: false,
          timestamp: Date.now(),
        });

        this.logger.log(`[GameGateway] Player ${payload.nickname} reconnected to session ${payload.sessionId}`);
      } else {
        // Fresh join: attach player to session
        await this.presenceService.attachPlayer({
          sessionId: payload.sessionId,
          playerId: payload.playerId,
          nickname: payload.nickname,
          socketId: client.id,
          isHost: false,
        });

        // Ensure player is in leaderboard with score 0
        await this.gameSessionService.ensurePlayerInLeaderboard(
          payload.sessionId,
          payload.playerId,
          payload.nickname,
        );

        const joinedEvent: PlayerJoinedEvent = {
          playerId: payload.playerId,
          nickname: payload.nickname,
          playerCount: fullState.leaderboard?.length || 0,
          timestamp: Date.now(),
          isHost: false,
        };
        this.server.to(payload.sessionId).emit('player_joined', joinedEvent);
      }

      // Build player identity and register socket
      const identity: PlayerIdentity = {
        playerId: payload.playerId,
        roomId: fullState.roomId,
        sessionId: payload.sessionId,
        nickname: payload.nickname,
        isHost: false,
      };
      client.join(payload.sessionId);
      this.socketMap.set(client.id, identity);

      return {
        success: true,
        isReconnect,
        needsRedirect: false,
        redirectToSession: null,
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
      // [T2] Backend received submit_answer
      this.logger.debug(`[T2] submit_answer received player=${payload.playerId} ts=${payload.clientTimestamp}`);

      const result = await this.gameSessionService.submitAnswer(
        payload.sessionId,
        payload.playerId,
        payload.questionId,
        payload.answerId,
        payload.clientTimestamp,
      );

      // [T3] submitAnswer success - immediately emit player_answered for host to see
      // This is the key fix: host sees "Đã trả lời" before leaderboard update
      const answeredEvent: PlayerAnsweredEvent = {
        sessionId: payload.sessionId,
        playerId: payload.playerId,
        questionId: payload.questionId,
        hasAnswered: true,
        answeredAt: Date.now(),
      };
      this.server.to(payload.sessionId).emit('player_answered', answeredEvent);

      // Emit answer_received to the submitting player
      client.emit('answer_received', {
        success: true,
        isCorrect: result.isCorrect,
        scoreEarned: result.scoreEarned,
      });

      // [T4] Emit leaderboard_update using leaderboard from submitAnswer (already fetched)
      // No need to call getLeaderboard again - result.leaderboard already contains it
      this.server.to(payload.sessionId).emit('leaderboard_update', { sessionId: payload.sessionId, leaderboard: result.leaderboard });

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

  @SubscribeMessage('player_leave_game')
  async handlePlayerLeaveGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; playerId: string; nickname: string },
  ) {
    this.logger.log(`[GameGateway] player_leave_game: ${payload.nickname} (${payload.playerId}) from session ${payload.sessionId}`);

    // Mark player as LEFT (don't remove from leaderboard)
    await this.gameSessionService.markPlayerLeft(payload.sessionId, payload.playerId);

    // Detach player from session
    await this.presenceService.detachPlayer(payload.sessionId, payload.playerId);

    // Remove from socket map
    this.socketMap.delete(client.id);
    client.leave(payload.sessionId);

    // Notify remaining players
    const leftEvent: PlayerLeftEvent = {
      playerId: payload.playerId,
      nickname: payload.nickname,
      timestamp: Date.now(),
    };
    this.server.to(payload.sessionId).emit('player_left', leftEvent);

    // Broadcast updated leaderboard with LEFT status
    const leaderboard = await this.gameSessionService.getLeaderboard(payload.sessionId);
    this.server.to(payload.sessionId).emit('leaderboard_update', { sessionId: payload.sessionId, leaderboard });

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
  // PUBLIC METHODS FOR OTHER GATEWAYS
  // ============================================================================

  /**
   * Check if player is currently in any game session
   * Uses presenceService instead of redundant player:in_game:* keys
   */
  async isPlayerInGame(playerId: string): Promise<boolean> {
    const sessions = await this.presenceService.getPlayerSessions(playerId);
    return sessions.length > 0;
  }

  /**
   * Clear player from all game sessions
   * Uses presenceService for cross-instance cleanup
   */
  async clearPlayerFromGame(playerId: string): Promise<void> {
    const sessions = await this.presenceService.getPlayerSessions(playerId);
    for (const sessionId of sessions) {
      await this.presenceService.detachPlayer(sessionId, playerId);
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async cleanupSession(sessionId: string, reason: 'HOST_EXITED' | 'GAME_FINISHED' | 'HOST_DISCONNECTED') {
    this.logger.log(`[GameGateway] Cleaning up session ${sessionId} with reason: ${reason}`);

    this.gameSessionService.cancelTimer(sessionId);
    this.sessionCallbacks.delete(sessionId);

    // Emit session_closed to all players
    this.server.to(sessionId).emit('session_closed', {
      sessionId,
      reason,
    });

    // Cleanup presence data from Redis
    await this.presenceService.cleanupSession(sessionId);

    // Cleanup game session
    await this.gameSessionService.cleanupSession(sessionId);
    await this.gameSessionService.closeSession(sessionId);

    this.server.to(sessionId).emit('room_closed', { reason });
  }

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
