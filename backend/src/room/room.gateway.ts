import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { OnModuleDestroy, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RoomService } from './room.service';
import { RedisService } from '../redis/redis.service';
import { PlayerPresenceService } from '../game/player-presence.service';
import { setupRedisAdapter, teardownRedisAdapter } from '../game/redis-adapter.setup';
import {
  JoinRoomPayload,
  LeaveRoomPayload,
  JoinByIdPayload,
} from './dto/websocket-payload.dto';
import {
  PlayerJoinedEvent,
  PlayerLeftEvent,
  RoomJoinedEvent,
} from '../common/socket/socket-events.interface';

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
  namespace: '/lobby',
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomGateway.name);

  // Minimal socket storage - just maps socketId -> identity
  // This is NOT authoritative - only used for disconnect handling
  private socketMap = new Map<string, PlayerIdentity>();

  constructor(
    private readonly roomService: RoomService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly presenceService: PlayerPresenceService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('[RoomGateway] Initialized (Stateless Socket Architecture with Redis Presence)');

    setupRedisAdapter(server, {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    }).catch((err) => {
      this.logger.error('[RoomGateway] Failed to setup Redis Adapter:', err);
    });
  }

  async onModuleDestroy() {
    await teardownRedisAdapter();
  }

  async handleConnection(client: Socket) {
    const ip = client.handshake.address;

    const isBanned = await this.redisService.isIpBanned(ip);
    if (isBanned) {
      this.logger.warn(`[RoomGateway] Rejected BANNED IP: ${ip} (socket: ${client.id})`);
      client.disconnect(true);
      return;
    }

    this.logger.log(`[RoomGateway] Client connected: ${client.id} (IP: ${ip})`);
  }

  async handleDisconnect(client: Socket) {
    const identity = this.socketMap.get(client.id);
    this.logger.log(
      `[RoomGateway] Client disconnected: ${client.id} | identity: ${
        identity
          ? JSON.stringify({ playerId: identity.playerId, isHost: identity.isHost, roomId: identity.roomId })
          : 'none'
      }`,
    );

    if (!identity) return;

    const { roomId, isHost, playerId, nickname } = identity;

    // Remove from socket map
    this.socketMap.delete(client.id);

    if (!roomId || !playerId) return;

    // MARK DISCONNECTED in Redis
    // NO host termination - lobby continues with remaining players
    await this.presenceService.detachPlayerFromLobby(roomId, playerId);

    // Emit connection status update
    this.server.to(roomId).emit('player_status', {
      playerId,
      nickname,
      connection: 'DISCONNECTED',
      isHost,
      timestamp: Date.now(),
    });

    if (isHost) {
      // For hosts, emit host_left so players can detect host departure.
      this.server.to(roomId).emit('host_left', { roomId });
    } else {
      // Broadcast player_left event
      const presence = await this.presenceService.getLobbyPresence(roomId);
      const leftEvent: PlayerLeftEvent = {
        playerId,
        nickname,
        playerCount: presence.players.size,
        isHost,
        timestamp: Date.now(),
      };
      this.server.to(roomId).emit('player_left', leftEvent);
    }

    this.logger.log(`[RoomGateway] Player ${nickname} marked disconnected (lobby continues)`);
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

      // Check if this is a reconnect (player already in Redis)
      const isReconnect = await this.presenceService.isPlayerInLobby(room.id, player.id);

      // Attach to Redis presence
      await this.presenceService.attachPlayerToLobby({
        roomId: room.id,
        playerId: player.id,
        nickname: player.nickname,
        socketId: client.id,
        isHost: identity.isHost,
      });

      this.socketMap.set(client.id, identity);
      client.join(room.id);

      // Get current players from Redis
      const presence = await this.presenceService.getLobbyPresence(room.id);

      // Find host identity
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
        isReconnect,
      });

      if (!identity.isHost) {
        // Emit with unified PlayerJoinedEvent format
        const joinedEvent: PlayerJoinedEvent = {
          playerId: player.id,
          nickname: player.nickname,
          playerCount: room.players.length + 1,
          joinedBy: hostIdentity?.nickname || 'Host',
          timestamp: Date.now(),
          isHost: false,
        };
        client.to(room.id).emit('player_joined', joinedEvent);

        // Emit player_status for connection tracking
        this.server.to(room.id).emit('player_status', {
          playerId: player.id,
          nickname: player.nickname,
          connection: 'CONNECTED',
          isHost: false,
          timestamp: Date.now(),
        });
      } else {
        // Emit host_reconnected for hosts
        this.server.to(room.id).emit('host_reconnected', { roomId: room.id });
      }

      return { success: true, isReconnect };
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
          // Check if this is a reconnect
          const isReconnect = await this.presenceService.isPlayerInLobby(roomId, existingPlayer.id);

          if (isReconnect) {
            // Reconnect: update socket ID in Redis
            await this.presenceService.updateLobbySocketId(roomId, existingPlayer.id, client.id);

            const identity: PlayerIdentity = {
              playerId: existingPlayer.id,
              roomId: room.id,
              nickname: existingPlayer.nickname,
              isHost: false,
            };

            this.socketMap.set(client.id, identity);
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
                id: existingPlayer.id,
                nickname: existingPlayer.nickname,
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
              isReconnect: true,
            });

            // Emit reconnected status
            this.server.to(roomId).emit('player_status', {
              playerId: existingPlayer.id,
              nickname: existingPlayer.nickname,
              connection: 'CONNECTED',
              isHost: false,
              timestamp: Date.now(),
            });

            return { success: true, isReconnect: true };
          }

          throw new WsException('Nickname already taken');
        }

        const player = await this.roomService.addPlayerToRoom(roomId, nickname);

        // Attach to Redis presence
        await this.presenceService.attachPlayerToLobby({
          roomId: room.id,
          playerId: player.id,
          nickname: player.nickname,
          socketId: client.id,
          isHost: false,
        });

        const identity: PlayerIdentity = {
          playerId: player.id,
          roomId: room.id,
          nickname: player.nickname,
          isHost: false,
        };

        this.socketMap.set(client.id, identity);
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
          isReconnect: false,
        });

        // Broadcast to ALL sockets in room (including host if connected)
        const joinedEvent: PlayerJoinedEvent = {
          playerId: player.id,
          nickname: player.nickname,
          playerCount: updatedRoom.players.length,
          timestamp: Date.now(),
          isHost: false,
        };
        this.server.to(room.id).emit('player_joined', joinedEvent);

        // Emit player_status for connection tracking
        this.server.to(room.id).emit('player_status', {
          playerId: player.id,
          nickname: player.nickname,
          connection: 'CONNECTED',
          isHost: false,
          timestamp: Date.now(),
        });

        // Return playerId so frontend can persist it (for game session recovery after redirect)
        return { success: true, playerId: player.id, isReconnect: false };
      } else {
        // Host joining - check if reconnect
        const isReconnect = await this.presenceService.isPlayerInLobby(roomId, playerId!);

        // Attach host to Redis presence
        await this.presenceService.attachPlayerToLobby({
          roomId: room.id,
          playerId: playerId!,
          nickname: nickname || 'Host',
          socketId: client.id,
          isHost: true,
        });

        const identity: PlayerIdentity = {
          playerId: playerId!,
          roomId: room.id,
          nickname: nickname || 'Host',
          isHost: true,
          userId: userId!,
        };

        this.socketMap.set(client.id, identity);
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
          isReconnect,
        });

        // Emit host_reconnected for hosts
        if (isReconnect) {
          this.server.to(room.id).emit('host_reconnected', { roomId: room.id });
        }

        return { success: true, isReconnect };
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
        this.logger.log('[RoomGateway] Player already removed or error:', dbError.message);
        // Continue - player might already be removed
      }

      // Detach from Redis presence
      await this.presenceService.detachPlayerFromLobby(roomId, identity.playerId);

      client.leave(roomId);
      this.socketMap.delete(client.id);

      client.emit('room_left', {
        roomId,
        message: 'You left the room',
        isHost: identity.isHost,
      });

      // Broadcast player_left event with connection tracking
      const presence = await this.presenceService.getLobbyPresence(roomId);
      const leftEvent: PlayerLeftEvent = {
        playerId: leftPlayerId,
        nickname: identity.nickname,
        playerCount: presence.players.size,
        isHost: identity.isHost,
        timestamp: Date.now(),
      };
      this.server.to(roomId).emit('player_left', leftEvent);

      // Emit player_status for connection tracking
      this.server.to(roomId).emit('player_status', {
        playerId: leftPlayerId,
        nickname: identity.nickname,
        connection: 'LEFT',
        isHost: identity.isHost,
        timestamp: Date.now(),
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

  /**
   * Get player count from Redis presence
   */
  async getRoomPlayerCount(roomId: string): Promise<number> {
    const presence = await this.presenceService.getLobbyPresence(roomId);
    return presence.players.size;
  }

  /**
   * Get all connected players in a room
   */
  async getConnectedPlayers(roomId: string): Promise<string[]> {
    const presence = await this.presenceService.getLobbyPresence(roomId);
    const connected: string[] = [];
    for (const [playerId, data] of presence.players) {
      if (data.socketId) {
        connected.push(playerId);
      }
    }
    return connected;
  }

  getSocketIdentity(socketId: string): PlayerIdentity | undefined {
    return this.socketMap.get(socketId);
  }
}
