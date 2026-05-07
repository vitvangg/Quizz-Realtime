import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { Logger } from '@nestjs/common';

interface JoinRoomPayload {
  pin: string;
  nickname: string;
  userId?: string; // If logged in user joins
}

interface KickPlayerPayload {
  playerId: string;
  hostId: string;
}

interface StartGamePayload {
  roomId: string;
  hostId: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('GameGateway');
  private socketRoomMap = new Map<string, string>(); // socketId -> roomPin
  private roomSocketsMap = new Map<string, Set<string>>(); // roomPin -> Set<socketId>

  constructor(private readonly gameService: GameService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Remove from room tracking
    const pin = this.socketRoomMap.get(client.id);
    if (pin) {
      this.socketRoomMap.delete(client.id);
      const sockets = this.roomSocketsMap.get(pin);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.roomSocketsMap.delete(pin);
        }
      }
    }
  }

  // Join room via PIN (Player flow)
  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    this.logger.log(`Join room: ${payload.pin}, nickname: ${payload.nickname}`);

    const result = await this.gameService.handleJoinRoom(
      payload.pin,
      payload.nickname,
    );

    if (!result.success) {
      client.emit('error', {
        code: 'JOIN_ERROR',
        message: result.error,
      });
      return;
    }

    // Track socket in room
    this.socketRoomMap.set(client.id, payload.pin);
    if (!this.roomSocketsMap.has(payload.pin)) {
      this.roomSocketsMap.set(payload.pin, new Set());
    }
    this.roomSocketsMap.get(payload.pin)?.add(client.id);

    // Join socket.io room
    client.join(`room:${payload.pin}`);

    // Send success to joining player
    client.emit('joined-room', {
      player: result.player,
      room: result.room,
    });

    // Broadcast to room that player joined
    client.to(`room:${payload.pin}`).emit('player-joined', {
      player: result.player,
    });

    // Get updated room info
    const roomResult = await this.gameService.getRoomInfo(payload.pin);
    if (roomResult.success && roomResult.room) {
      this.server.to(`room:${payload.pin}`).emit('room-updated', {
        room: roomResult.room,
        players: roomResult.room.players,
      });
    }
  }

  // Leave room
  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { playerId: string },
  ) {
    const pin = this.socketRoomMap.get(client.id);

    const result = await this.gameService.handleLeaveRoom(payload.playerId);

    if (pin) {
      // Broadcast player left
      this.server.to(`room:${pin}`).emit('player-left', {
        playerId: payload.playerId,
      });

      // Leave socket room
      client.leave(`room:${pin}`);
      this.socketRoomMap.delete(client.id);

      const sockets = this.roomSocketsMap.get(pin);
      if (sockets) {
        sockets.delete(client.id);
      }
    }

    return result;
  }

  // Kick player (Host only)
  @SubscribeMessage('kick-player')
  async handleKickPlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: KickPlayerPayload,
  ) {
    this.logger.log(`Kick player: ${payload.playerId} by host: ${payload.hostId}`);

    const result = await this.gameService.handleKickPlayer(
      payload.playerId,
      payload.hostId,
    );

    if (!result.success) {
      client.emit('error', {
        code: 'KICK_ERROR',
        message: result.error,
      });
      return;
    }

    // Find socket of kicked player and emit event
    this.roomSocketsMap.forEach((sockets, roomPin) => {
      sockets.forEach((socketId) => {
        // We'll emit to all - in real implementation, track player->socket mapping
      });
    });

    // Broadcast player was kicked
    this.server.to(`room:${this.socketRoomMap.get(client.id) || ''}`).emit('player-kicked', {
      playerId: payload.playerId,
      reason: 'Removed by host',
    });

    return result;
  }

  // Start game (Host only)
  @SubscribeMessage('start-game')
  async handleStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StartGamePayload,
  ) {
    this.logger.log(`Start game: room ${payload.roomId} by host ${payload.hostId}`);

    const result = await this.gameService.handleStartGame(
      payload.roomId,
      payload.hostId,
    );

    if (!result.success) {
      client.emit('error', {
        code: 'START_ERROR',
        message: result.error,
      });
      return;
    }

    const pin = this.socketRoomMap.get(client.id);

    // Emit countdown
    if (result.session) {
      const session = result.session as any;
      const questions = session.room?.quiz?.questions || [];
      
      this.server.to(`room:${pin}`).emit('game-starting', {
        sessionId: session.id,
        countdown: 3,
        totalQuestions: questions.length,
      });

      // After countdown, emit first question
      const firstQuestion = questions[0];
      setTimeout(() => {
        if (firstQuestion) {
          this.server.to(`room:${pin}`).emit('question-start', {
            sessionId: session.id,
            questionIndex: 0,
            question: firstQuestion,
            timeLimit: firstQuestion.timeLimit || 20,
          });
        }
      }, 3000);
    }

    return {
      success: true,
      session: result.session,
    };
  }

  // Get room info
  @SubscribeMessage('get-room')
  async handleGetRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { pin: string },
  ) {
    const result = await this.gameService.getRoomInfo(payload.pin);
    return result;
  }

  // Ping/pong for heartbeat
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: Date.now() });
  }
}
