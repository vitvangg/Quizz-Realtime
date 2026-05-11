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
import { Logger, UseGuards, Inject, forwardRef } from '@nestjs/common';
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
    @Inject(forwardRef(() => RoomGateway))
    private readonly roomGateway: RoomGateway,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`[GameGateway] Client connected: ${client.id}`);
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
