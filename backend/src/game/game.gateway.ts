import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GameSessionService, GameState } from './game-session.service';
import { RoomService } from '../room/room.service';
import { RoomGateway } from '../room/room.gateway';

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
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  private socketMap = new Map<string, PlayerIdentity>();
  private sessionSockets = new Map<string, Set<string>>();

  constructor(
    private readonly gameSessionService: GameSessionService,
    private readonly roomService: RoomService,
    private readonly jwtService: JwtService,
    private readonly roomGateway: RoomGateway,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`[GameGateway] Client connected: ${client.id}`);
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

  @SubscribeMessage('host_join_game')
  async handleHostJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; jwt?: string },
  ) {
    try {
      let hostId: string = 'unknown';
      let isActualHost = false;

      if (payload.jwt) {
        const decoded = this.jwtService.verify(payload.jwt);
        hostId = decoded.sub || decoded.id;
      }

      this.logger.log(
        `[GameGateway] host_join_game: hostId=${hostId}, clientId=${client.id}, sessionId=${payload.sessionId}`,
      );

      const sessionState = await this.gameSessionService.getSessionState(payload.sessionId);
      const session = await this.gameSessionService.getSessionWithQuiz(payload.sessionId);
      const totalQuestions = session?.room?.quiz?.questions?.length || 0;

      // Verify the caller is the actual room host — prevents players from
      // impersonating the host after joining the same URL path.
      if (session?.room && hostId === session.room.hostId) {
        isActualHost = true;
        this.logger.log(`[GameGateway] Verified host: JWT hostId=${hostId} matches room.hostId=${session.room.hostId}`);
      } else {
        this.logger.warn(
          `[GameGateway] Host verification failed: JWT hostId=${hostId} vs room.hostId=${session?.room?.hostId} — joining as player`,
        );
      }

      client.join(payload.sessionId);

      const identity: PlayerIdentity = {
        userId: hostId,
        playerId: isActualHost ? `host_${hostId}` : `user_${hostId}`,
        roomId: sessionState?.roomId,
        sessionId: payload.sessionId,
        nickname: isActualHost ? 'Host' : `Player(${hostId})`,
        isHost: isActualHost,
      };

      this.socketMap.set(client.id, identity);

      const sessionSockets = this.sessionSockets.get(payload.sessionId) || new Set();
      sessionSockets.add(client.id);
      this.sessionSockets.set(payload.sessionId, sessionSockets);

      this.logger.log(
        `[GameGateway] Client ${client.id} joined session ${payload.sessionId} as isHost=${isActualHost}. Total in session: ${sessionSockets.size}`,
      );

      return {
        success: true,
        isActualHost,
        state: {
          status: sessionState?.status || GameState.WAITING,
          currentQuestion: null,
          questionIndex: sessionState?.currentQuestionIndex || 0,
          totalQuestions,
          leaderboard: [],
        },
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

      this.logger.log(
        `[GameGateway] Game session created: ${result.session.id} for room ${payload.roomId}. DB room status is now PLAYING.`,
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
      this.logger.log(
        `[GameGateway] Host socket ${client.id} joined session room ${result.session.id}. Total sockets in session: ${sessionSockets.size}`,
      );

      // ── Step 1: Emit game_starting ─────────────────────────────────────────────
      this.server.to(result.session.id).emit('game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });
      this.logger.log(`[GameGateway] Emitted game_starting to session ${result.session.id}`);

      // ── Step 2: Countdown ticks ────────────────────────────────────────────────
      for (let i = 5; i > 0; i--) {
        await this.delay(1000);
        this.server.to(result.session.id).emit('countdown_tick', {
          remaining: i - 1,
        });
      }

      // ── Step 3: game_redirect — SOLE source of truth for navigation ───────────
      // Emit to BOTH namespaces so players on the /room page receive the event.
      // - this.server (game namespace) → host's game socket
      // - roomGateway.server (room namespace) → players' room sockets
      this.logger.log(
        `[GameGateway] Emitting game_redirect to roomId=${payload.roomId} | host socket.id=${client.id} | sessionId=${result.session.id}`,
      );
      this.server.to(payload.roomId).emit('game_redirect', {
        url: `/game/${result.session.id}`,
        sessionId: result.session.id,
      });
      this.roomGateway.server.to(payload.roomId).emit('game_redirect', {
        url: `/game/${result.session.id}`,
        sessionId: result.session.id,
      });

      // ── Step 4: question_start — sent to BOTH room AND session ─────────────────
      // After window.location.href, the old socket disconnects and a NEW socket
      // connects on the new page. The new socket is in NEITHER the room nor the
      // session yet — it joins via host_join_game / join_game.
      // Emitting to BOTH channels ensures:
      //   - Old socket (still in room) receives question_start BEFORE navigation,
      //     sets game store state immediately (pre-countdown).
      //   - New socket (after navigation, joins session) receives question_start
      //     via sessionId, recovers game state.
      this.logger.log(
        `[GameGateway] Emitting question_start to BOTH roomId=${payload.roomId} AND sessionId=${result.session.id}`,
      );
      this.server.to(payload.roomId).emit('question_start', {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        serverTime: Date.now(),
      });
      this.server.to(result.session.id).emit('question_start', {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        serverTime: Date.now(),
      });

      this.gameSessionService.scheduleQuestionEnd(
        result.session.id,
        result.firstQuestion.timeLimit,
        (data) => this.handleQuestionEnd(result.session.id, data),
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

      this.gameSessionService.scheduleQuestionEnd(
        payload.sessionId,
        result.question.timeLimit,
        (data) => this.handleQuestionEnd(payload.sessionId, data),
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

  @SubscribeMessage('host_close_room')
  async handleHostCloseRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; roomId: string },
  ) {
    try {
      const identity = this.socketMap.get(client.id);
      if (!identity?.isHost) {
        return { success: false, error: 'Only host can close room' };
      }

      // Cancel any pending timers
      this.gameSessionService.cancelTimer(payload.sessionId);

      // Emit room_closed to ALL sockets in this session (including host)
      // Clients will handle redirection
      const sessionSockets = this.sessionSockets.get(payload.sessionId);
      if (sessionSockets) {
        for (const socketId of sessionSockets) {
          const socket = this.server.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('room_closed', { reason: 'Host da roi phong' });
          }
        }
      }

      // Host redirects to /quiz after successful emit
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
      const identity = this.socketMap.get(client.id);
      if (!identity?.isHost) {
        return { success: false, error: 'Only host can restart game' };
      }

      const oldSessionId = payload.sessionId;

      // Reset room to WAITING so players can rejoin
      await this.roomService.updateStatus(payload.roomId, 'WAITING' as any);

      // Start a fresh game session
      const hostId = identity.userId || identity.playerId;
      const result = await this.gameSessionService.startGame(payload.roomId, hostId);

      // Update host's socket identity with new sessionId
      identity.sessionId = result.session.id;
      this.socketMap.set(client.id, identity);

      const sessionSockets = this.sessionSockets.get(result.session.id) || new Set();
      sessionSockets.add(client.id);
      this.sessionSockets.set(result.session.id, sessionSockets);

      client.join(result.session.id);

      // game_starting + countdown_tick for UI in the room (both host and players are in the room).
      this.server.to(payload.roomId).emit('game_starting', {
        sessionId: result.session.id,
        countdown: 5,
      });

      // Run countdown and emit countdown_tick to room
      for (let i = 5; i > 0; i--) {
        await this.delay(1000);
        this.server.to(payload.roomId).emit('countdown_tick', {
          remaining: i - 1,
        });
      }

      // game_redirect is the SOLE source of truth for navigation on play again.
      // Emit to the ROOM ID so all clients still in the room receive it.
      this.server.to(payload.roomId).emit('game_redirect', {
        url: `/game/${result.session.id}`,
        sessionId: result.session.id,
      });

      // Host who just joined the new session also gets question_start.
      this.server.to(result.session.id).emit('question_start', {
        sessionId: result.session.id,
        questionIndex: 0,
        question: result.firstQuestion,
        totalQuestions: result.totalQuestions,
        serverTime: Date.now(),
      });

      this.gameSessionService.scheduleQuestionEnd(
        result.session.id,
        result.firstQuestion.timeLimit,
        (data) => this.handleQuestionEnd(result.session.id, data),
      );

      this.logger.log(`Game restarted for room ${payload.roomId}: ${oldSessionId} → ${result.session.id}`);

      return { success: true, sessionId: result.session.id };
    } catch (error) {
      this.logger.error(`Error restarting game: ${error.message}`);
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
      this.logger.log(
        `[GameGateway] join_game: playerId=${payload.playerId}, nickname=${payload.nickname}, sessionId=${payload.sessionId}, client.id=${client.id}`,
      );

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
      this.logger.log(
        `[GameGateway] Player socket ${client.id} (playerId=${payload.playerId}) joined game session ${payload.sessionId}. Total in session: ${sessionSockets.size}`,
      );

      return {
        success: true,
        state: session,
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
      this.logger.log(
        `[GameGateway] submit_answer: playerId=${payload.playerId}, sessionId=${payload.sessionId}, questionId=${payload.questionId}, client.id=${client.id}`,
      );

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
      this.logger.error(
        `[GameGateway] submit_answer error: playerId=${payload.playerId}, sessionId=${payload.sessionId} — ${error.message}`,
      );
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
