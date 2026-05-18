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
import { GameSessionService, GameState } from './game-session.service';
import { PlayerPresenceService, ConnectionStatus } from './player-presence.service';
import { RoomService } from '../room/room.service';
import { RoomGateway } from '../room/room.gateway';
import { RedisService } from '../redis/redis.service';
import { setupRedisAdapter, teardownRedisAdapter } from './redis-adapter.setup';
import {
  PlayerJoinedEvent,
  PlayerLeftEvent,
} from '../common/socket/socket-events.interface';

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
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
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

    setupRedisAdapter(server, {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    }).catch((err) => {
      this.logger.error('[GameGateway] Failed to setup Redis Adapter:', err);
    });
  }

  async onModuleDestroy() {
    await teardownRedisAdapter();
  }

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

  private buildReloadResponse(fullState: any) {
    let remainingTime = fullState?.remainingTime ?? null;
    if (fullState?.status === GameState.QUESTION_RESULT) {
      remainingTime = 0;
    }

    return {
      status: fullState?.status || GameState.WAITING,
      currentQuestion: fullState?.currentQuestion || null,
      questionIndex: fullState?.currentQuestionIndex ?? 0,
      totalQuestions: fullState?.totalQuestions ?? 0,
      leaderboard: fullState?.leaderboard || [],
      remainingTime,
      correctAnswerId: fullState?.correctAnswerId || null,
    };
  }

  private verifyHost(client: Socket): PlayerIdentity | null {
    const identity = this.socketMap.get(client.id);
    if (!identity?.isHost) return null;
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
      if (!isActualHost) {
        return { success: false, error: 'Only the host can join as host' };
      }

      // Attach to session via Redis (stateless approach)
      await this.presenceService.attachPlayer({
        sessionId: payload.sessionId,
        playerId: `host_${hostId}`,
        nickname: 'Host',
        socketId: client.id,
        isHost: true,
      });

      const identity: PlayerIdentity = {
        userId: hostId,
        playerId: `host_${hostId}`,
        roomId: fullState.roomId,
        sessionId: payload.sessionId,
        nickname: 'Host',
        isHost: true,
      };
      this.registerSocket(client, identity);

      // Notify players that host is back (if was disconnected)
      this.server.to(payload.sessionId).emit('host_reconnected', { sessionId: payload.sessionId });

      this.logger.log(`[GameGateway] Host registered for session=${payload.sessionId}, userId=${hostId}`);

      return {
        success: true,
        isActualHost,
        isReconnect: false,
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

      await this.gameSessionService.updateQuestionStartTime(result.session.id, Date.now());

      // Emit redirect to players in room
      // NOTE: GameGateway is on /game namespace, RoomGateway is on /lobby namespace
      // Emit on both namespaces so redirect works during lobby phase
      this.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });
      this.roomGateway.server.to(payload.roomId).emit('game_redirect', { url: `/game/${result.session.id}`, sessionId: result.session.id });

      const questionEndCallback = (data: any) => this.handleQuestionEnd(result.session.id, data);
      this.sessionCallbacks.set(result.session.id, questionEndCallback);
      this.gameSessionService.scheduleQuestionEnd(result.session.id, result.firstQuestion.timeLimit, questionEndCallback);

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
      // Also emit to lobby namespace in case redirect hasn't completed yet
      this.roomGateway.server.to(payload.roomId).emit('question_start', questionStartPayload);

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

      this.server.to(payload.sessionId).emit('question_start', {
        ...result,
        serverTime: Date.now(),
        questionVersion: result.questionIndex + 1,
      });

      const nextCallback = (data: any) => this.handleQuestionEnd(payload.sessionId, data);
      this.sessionCallbacks.set(payload.sessionId, nextCallback);
      this.gameSessionService.scheduleQuestionEnd(payload.sessionId, result.question.timeLimit, nextCallback);

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
      const identity = this.verifyHost(client);
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
      // CRITICAL: Leave old session room BEFORE emitting session_switched
      // This prevents the host's own socket from receiving session_switched
      // which would cause a redundant navigation in the host's browser
      client.leave(oldSessionId);
      client.join(result.session.id);
      this.registerSocket(client, identity);

      // NOW emit session_switched to old session (players only - host has already left)
      // Include full game state so players can update UI immediately without HTTP fetch
      // This is critical: players need this state BEFORE they join the new socket room
      // so they don't miss the countdown/question_start events
      this.server.to(oldSessionId).emit('session_switched', {
        oldSessionId,
        newSessionId: result.session.id,
        url: `/game/${result.session.id}`,
        timestamp: Date.now(),
        // Include full game state to avoid HTTP fetch delay
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

      // Also emit to new session for players who joined directly
      this.server.to(result.session.id).emit('session_started', {
        sessionId: result.session.id,
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

      const questionEndCallback = (data: any) => this.handleQuestionEnd(result.session.id, data);
      this.sessionCallbacks.set(result.session.id, questionEndCallback);
      this.gameSessionService.scheduleQuestionEnd(result.session.id, result.firstQuestion.timeLimit, questionEndCallback);

      await this.gameSessionService.updateQuestionStartTime(result.session.id, Date.now());

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
      // Also emit to lobby namespace in case redirect hasn't completed yet
      this.roomGateway.server.to(payload.roomId).emit('question_start', questionStartPayload);

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
      const result = await this.gameSessionService.submitAnswer(
        payload.sessionId,
        payload.playerId,
        payload.questionId,
        payload.answerId,
        payload.clientTimestamp,
      );

      const cached = await this.gameSessionService.getSessionState(payload.sessionId);
      if (cached?.status === GameState.QUESTION_ACTIVE) {
        client.emit('answer_received', {
          success: true,
          isCorrect: result.isCorrect,
          scoreEarned: result.scoreEarned,
        });
      } else {
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

  @SubscribeMessage('player_leave_game')
  async handlePlayerLeaveGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; playerId: string; nickname: string },
  ) {
    this.logger.log(`[GameGateway] player_leave_game: ${payload.nickname} (${payload.playerId}) from session ${payload.sessionId}`);

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
