import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RoomService } from './room.service';
import { RedisService } from '../redis/redis.service';
import {
  JoinRoomPayload,
  LeaveRoomPayload,
  JoinByIdPayload,
} from './dto/websocket-payload.dto';

interface PlayerIdentity {
  userId?: string;  // For hosts
  playerId: string;
  roomId: string;
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
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private socketMap = new Map<string, PlayerIdentity>();
  private roomSockets = new Map<string, Set<string>>();

  // Redis key prefix for tracking players in game sessions (must match GameGateway)
  private readonly PLAYER_IN_GAME_KEY_PREFIX = 'player:in_game:';

  constructor(
    private readonly roomService: RoomService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    console.log(`[RoomGateway] Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    console.log(`[RoomGateway] Client disconnected: ${client.id}`);

    const identity = this.socketMap.get(client.id);
    if (!identity) {
      console.log(`[RoomGateway] No identity for disconnected client ${client.id}`);
      return;
    }

    const { roomId, isHost, playerId, nickname } = identity;

    try {
      // Always clean up socket from in-memory maps.
      client.leave(roomId);
      this.socketMap.delete(client.id);

      const roomSockets = this.roomSockets.get(roomId);
      if (roomSockets) {
        roomSockets.delete(client.id);
        if (roomSockets.size === 0) {
          this.roomSockets.delete(roomId);
        }
      }

      // CRITICAL: Check if player is in a game session BEFORE emitting player_left
      // GameGateway manages player lifecycle during games with grace period support.
      // If player is in game, GameGateway will handle player_reconnecting/player_left.
      if (!isHost && playerId) {
        const isInGame = await this.redisService.get(`${this.PLAYER_IN_GAME_KEY_PREFIX}${playerId}`);
        if (isInGame) {
          console.log(`[RoomGateway] Player ${nickname} is in game session, GameGateway will handle disconnect`);
          // DO NOT call handleLeaveRoom - let GameGateway manage during games
          return;
        }
      }

      // Hosts that disconnect during game navigation will also call this —
      // but the frontend's handleHostLeft does NOT redirect during
      // game (gameStatus === STARTING). game_redirect is the authoritative redirect.
      if (!isHost) {
        await this.handleLeaveRoom(client, { roomId });
      } else {
        // For hosts, emit host_left so players can detect host departure.
        // Players handle this via handleHostLeft which checks gameStatus.
        this.server.to(roomId).emit('host_left', { roomId });
      }
    } catch (error) {
      console.error('[RoomGateway] Error on disconnect:', error);
    }
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    try {
      const { pin, nickname } = payload;

      const result = await this.roomService.joinRoom({ pin, nickname });
      const { room, player } = result;

      const identity: PlayerIdentity = {
        playerId: player.id,
        roomId: room.id,
        nickname: player.nickname,
        isHost: room.hostId === player.id,
      };

      this.socketMap.set(client.id, identity);

      const roomSockets = this.roomSockets.get(room.id) || new Set();
      roomSockets.add(client.id);
      this.roomSockets.set(room.id, roomSockets);

      client.join(room.id);

      const hostIdentity = Array.from(this.socketMap.values()).find(
        (i) => i.roomId === room.id && i.isHost,
      );

      client.emit('room_joined', {
        room: {
          id: room.id,
          pin: room.pin,
          status: room.status,
          hostId: room.hostId,
        },
        player: {
          id: player.id,
          nickname: player.nickname,
          isHost: identity.isHost,
        },
        players: room.players.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          isHost: p.id === room.hostId,
        })),
        quiz: {
          id: room.quiz.id,
          title: room.quiz.title,
          questionCount: room.quiz.questions?.length || 0,
        },
      });

      if (!identity.isHost) {
        client.to(room.id).emit('player_joined', {
          player: {
            id: player.id,
            nickname: player.nickname,
          },
          playerCount: room.players.length + 1,
          joinedBy: hostIdentity?.nickname || 'Host',
        });
      }

      return { success: true };
    } catch (error) {
      const message =
        error.response?.message || error.message || 'Failed to join room';
      throw new WsException(message);
    }
  }

  @SubscribeMessage('join_by_id')
  async handleJoinById(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinByIdPayload,
  ) {
    try {
      const { roomId, nickname, jwt } = payload;

      // Verify JWT if provided (for host reconnection)
      let userId: string | null = null;
      if (jwt) {
        try {
          const decoded = this.jwtService.verify(jwt);
          userId = decoded.sub || decoded.id;
        } catch {
          // Invalid JWT, continue without userId
        }
      }

      const room = await this.roomService.findOne(roomId);

      if (room.status !== 'WAITING') {
        throw new WsException('Game already started or finished');
      }

      // If user is host (JWT matches room hostId), they are host
      const isHost = userId && room.hostId === userId;
      const playerId = isHost ? `host_${userId}` : null;

      // For guests: add as player
      if (!isHost) {
        const existingPlayer = room.players.find(
          (p) => p.nickname.toLowerCase() === nickname.toLowerCase(),
        );

        if (existingPlayer) {
          throw new WsException('Nickname already taken');
        }

        const player = await this.roomService.addPlayerToRoom(roomId, nickname);

        const identity: PlayerIdentity = {
          playerId: player.id,
          roomId: room.id,
          nickname: player.nickname,
          isHost: false,
        };

        this.socketMap.set(client.id, identity);

        const roomSockets = this.roomSockets.get(room.id) || new Set();
        roomSockets.add(client.id);
        this.roomSockets.set(room.id, roomSockets);

        client.join(room.id);

        const updatedRoom = await this.roomService.findOne(roomId);

        client.emit('room_joined', {
          room: {
            id: room.id,
            pin: room.pin,
            status: room.status,
            hostId: room.hostId,
          },
          player: {
            id: player.id,
            nickname: player.nickname,
            isHost: false,
          },
          players: updatedRoom.players.map((p) => ({
            id: p.id,
            nickname: p.nickname,
            isHost: false,
          })),
          quiz: {
            id: room.quiz.id,
            title: room.quiz.title,
            questionCount: room.quiz.questions?.length || 0,
          },
        });

        // Broadcast to ALL sockets in room (including host if connected)
        this.server.to(room.id).emit('player_joined', {
          player: {
            id: player.id,
            nickname: player.nickname,
          },
          playerCount: updatedRoom.players.length,
        });

        // Return playerId so frontend can persist it (for game session recovery after redirect)
        return { success: true, playerId: player.id };
      } else {
        // Host joining - no player record needed
        const identity: PlayerIdentity = {
          playerId: playerId!,
          roomId: room.id,
          nickname: nickname || 'Host',
          isHost: true,
          userId: userId!,
        };

        this.socketMap.set(client.id, identity);

        const roomSockets = this.roomSockets.get(room.id) || new Set();
        roomSockets.add(client.id);
        this.roomSockets.set(room.id, roomSockets);

        client.join(room.id);

        client.emit('room_joined', {
          room: {
            id: room.id,
            pin: room.pin,
            status: room.status,
            hostId: room.hostId,
          },
          player: {
            id: playerId,
            nickname: nickname || 'Host',
            isHost: true,
          },
          players: room.players.map((p) => ({
            id: p.id,
            nickname: p.nickname,
            isHost: false,
          })),
          quiz: {
            id: room.quiz.id,
            title: room.quiz.title,
            questionCount: room.quiz.questions?.length || 0,
          },
        });

        return { success: true };
      }
    } catch (error) {
      const message =
        error.response?.message || error.message || 'Failed to join room';
      throw new WsException(message);
    }
  }

  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveRoomPayload,
  ) {
    try {
      const { roomId } = payload;
      const identity = this.socketMap.get(client.id);

      if (!identity || identity.roomId !== roomId) {
        throw new WsException('Not in this room');
      }

      // Try to remove player from room (may fail if already removed)
      let leftPlayerId = identity.playerId;
      try {
        const result = await this.roomService.leaveRoom(roomId, identity.playerId);
        leftPlayerId = result.leftPlayerId;
      } catch (dbError) {
        console.log('[RoomGateway] Player already removed or error:', dbError.message);
        // Continue - player might already be removed
      }

      client.leave(roomId);
      this.socketMap.delete(client.id);

      const socketsInRoom = this.roomSockets.get(roomId);
      if (socketsInRoom) {
        socketsInRoom.delete(client.id);
        if (socketsInRoom.size === 0) {
          this.roomSockets.delete(roomId);
        }
      }

      client.emit('room_left', {
        roomId,
        message: 'You left the room',
        isHost: identity.isHost,
      });

      this.server.to(roomId).emit('player_left', {
        playerId: leftPlayerId,
        nickname: identity.nickname,
        playerCount: socketsInRoom?.size || 0,
        isHost: identity.isHost,
      });

      return { success: true };
    } catch (error) {
      const message =
        error.response?.message || error.message || 'Failed to leave room';
      throw new WsException(message);
    }
  }

  @SubscribeMessage('get_room_state')
  async handleGetRoomState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    try {
      const identity = this.socketMap.get(client.id);
      const room = await this.roomService.findOne(payload.roomId);

      return {
        room: {
          id: room.id,
          pin: room.pin,
          status: room.status,
          hostId: room.hostId,
        },
        players: room.players.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          isHost: p.id === room.hostId,
        })),
        quiz: {
          id: room.quiz.id,
          title: room.quiz.title,
          questionCount: room.quiz.questions?.length || 0,
        },
        yourIdentity: identity || null,
      };
    } catch (error) {
      const message =
        error.response?.message || error.message || 'Failed to get room state';
      throw new WsException(message);
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { event: 'pong', timestamp: Date.now() };
  }

  @SubscribeMessage('game_starting')
  handleGameStarting(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; countdown: number },
  ) {
    const identity = this.socketMap.get(client.id);
    if (!identity) return;

    // Only relay game_starting for UI/UX purposes (countdown, loading overlay).
    // Navigation is ONLY triggered by game_redirect from the game gateway.
    this.server.to(identity.roomId).emit('game_starting', {
      sessionId: payload.sessionId,
      countdown: payload.countdown,
    });

    return { success: true };
  }

  emitToRoom(roomId: string, event: string, data: any) {
    this.server.to(roomId).emit(event, data);
  }

  getRoomPlayerCount(roomId: string): number {
    return this.roomSockets.get(roomId)?.size || 0;
  }

  getSocketIdentity(socketId: string): PlayerIdentity | undefined {
    return this.socketMap.get(socketId);
  }
}
