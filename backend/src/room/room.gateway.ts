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
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RoomService } from './room.service';
import { RedisService } from '../redis/redis.service';
import { PlayerPresenceService } from '../game/player-presence.service';
import { setupRedisAdapter } from '../game/redis-adapter.setup';
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
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
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

    // Setup Redis Adapter once (idempotent - safe to call from multiple gateways)
    setupRedisAdapter(server, {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    }).catch((err) => {
      this.logger.error('[RoomGateway] Failed to setup Redis Adapter:', err);
    });
  }

  // NOTE: onModuleDestroy intentionally removed
  // Redis Adapter teardown is handled at app-level shutdown if needed
  // This ensures no gateway prematurely closes connections used by others

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

    // MARK DISCONNECTED in Redis - keep player in room for reconnect grace period
    // This prevents host from seeing player_left on page reload
    await this.presenceService.markDisconnectedInLobby(roomId, playerId);

    // Emit connection status update
    this.server.to(roomId).emit('player_status', {
      playerId,
      nickname,
      connection: 'DISCONNECTED',
      isHost,
      timestamp: Date.now(),
    });

    // NOTE: DO NOT emit host_left on disconnect - host may reconnect
    // host_left is only emitted on explicit leave_room or room close

    this.logger.log(`[RoomGateway] Player ${nickname} marked disconnected (grace period started)`);
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

      // Update presence: use update if reconnecting, attach if first join
      if (isReconnect) {
        await this.presenceService.updateLobbySocketId(room.id, player.id, client.id);
      } else {
        await this.presenceService.attachPlayerToLobby({
          roomId: room.id,
          playerId: player.id,
          nickname: player.nickname,
          socketId: client.id,
          isHost: identity.isHost,
        });
      }

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

      // Broadcast events based on isReconnect flag
      if (!identity.isHost) {
        if (isReconnect) {
          // Reconnect: only emit player_status CONNECTED
          this.server.to(room.id).emit('player_status', {
            playerId: player.id,
            nickname: player.nickname,
            connection: 'CONNECTED',
            isHost: false,
            timestamp: Date.now(),
          });
        } else {
          // First join: emit player_joined for others
          const joinedEvent: PlayerJoinedEvent = {
            playerId: player.id,
            nickname: player.nickname,
            playerCount: room.players.length + 1,
            joinedBy: hostIdentity?.nickname || 'Host',
            timestamp: Date.now(),
            isHost: false,
          };
          client.to(room.id).emit('player_joined', joinedEvent);

          // Also emit player_status CONNECTED
          this.server.to(room.id).emit('player_status', {
            playerId: player.id,
            nickname: player.nickname,
            connection: 'CONNECTED',
            isHost: false,
            timestamp: Date.now(),
          });
        }
      } else {
        // Host reconnect: emit player_status CONNECTED
        this.server.to(room.id).emit('player_status', {
          playerId: player.id,
          nickname: player.nickname,
          connection: 'CONNECTED',
          isHost: true,
          timestamp: Date.now(),
        });
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
      const { roomId, nickname, jwt, playerId: providedPlayerId } = payload;

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

      // ============================================================
      // HOST PATH: JWT valid and userId matches room.hostId
      // This must be checked FIRST and return immediately
      // ============================================================
      const isHostJwt = userId && room.hostId === userId;
      
      if (isHostJwt) {
        this.logger.log(`[RoomGateway] HOST PATH: userId=${userId}, room.hostId=${room.hostId}`);
        
        const hostPlayerId = `host_${userId}`;
        
        // Check if reconnecting
        const isReconnect = await this.presenceService.isPlayerInLobby(roomId, hostPlayerId);

        // Update presence
        if (isReconnect) {
          await this.presenceService.updateLobbySocketId(roomId, hostPlayerId, client.id);
          this.logger.log(`[RoomGateway] Host reconnect: ${hostPlayerId}`);
        } else {
          await this.presenceService.attachPlayerToLobby({
            roomId: room.id,
            playerId: hostPlayerId,
            nickname: nickname || 'Host',
            socketId: client.id,
            isHost: true,
          });
        }

        const identity: PlayerIdentity = {
          playerId: hostPlayerId,
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
            id: hostPlayerId,
            nickname: nickname || 'Host',
            isHost: true,
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

        // Only emit player_status CONNECTED - NEVER emit player_joined
        this.server.to(room.id).emit('player_status', {
          playerId: hostPlayerId,
          nickname: nickname || 'Host',
          connection: 'CONNECTED',
          isHost: true,
          timestamp: Date.now(),
        });

        this.logger.log(`[RoomGateway] Host joined room: ${room.id}, isReconnect: ${isReconnect}`);
        return { success: true, isReconnect };
      }

      // ============================================================
      // GUEST PATH: No valid JWT for host
      // ============================================================
      this.logger.log(`[RoomGateway] GUEST PATH: userId=${userId}, isHostJwt=${isHostJwt}`);

      // Check if reconnecting guest with provided playerId
      if (providedPlayerId) {
        const existingPlayer = room.players.find((p) => p.id === providedPlayerId);

        if (existingPlayer) {
          const isReconnect = await this.presenceService.isPlayerInLobby(roomId, providedPlayerId);

          await this.presenceService.updateLobbySocketId(roomId, providedPlayerId, client.id);
          this.logger.log(`[RoomGateway] Guest reconnect: ${providedPlayerId}, isReconnect: ${isReconnect}`);

          const identity: PlayerIdentity = {
            playerId: existingPlayer.id,
            roomId: room.id,
            nickname: existingPlayer.nickname,
            isHost: false,
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
              id: existingPlayer.id,
              nickname: existingPlayer.nickname,
              isHost: false,
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

          // Emit player_status CONNECTED - NEVER emit player_joined on reconnect
          this.server.to(roomId).emit('player_status', {
            playerId: existingPlayer.id,
            nickname: existingPlayer.nickname,
            connection: 'CONNECTED',
            isHost: false,
            timestamp: Date.now(),
          });

          return { success: true, isReconnect };
        }
      }

      // Guest: find by nickname or create new
      const existingPlayer = room.players.find(
        (p) => p.nickname.toLowerCase() === nickname.toLowerCase(),
      );

      if (existingPlayer) {
        const isReconnect = await this.presenceService.isPlayerInLobby(roomId, existingPlayer.id);

        if (isReconnect) {
          await this.presenceService.updateLobbySocketId(roomId, existingPlayer.id, client.id);

          const identity: PlayerIdentity = {
            playerId: existingPlayer.id,
            roomId: room.id,
            nickname: existingPlayer.nickname,
            isHost: false,
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
              id: existingPlayer.id,
              nickname: existingPlayer.nickname,
              isHost: false,
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
            isReconnect: true,
          });

          // Emit player_status CONNECTED - NEVER emit player_joined on reconnect
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

      // Create new player
      const player = await this.roomService.addPlayerToRoom(roomId, nickname);

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
          isHost: p.id === room.hostId,
        })),
        quiz: {
          id: room.quiz.id,
          title: room.quiz.title,
          questionCount: room.quiz.questions?.length || 0,
        },
        isReconnect: false,
      });

      // ONLY emit player_joined for NEW guest joins - not for reconnects
      const joinedEvent: PlayerJoinedEvent = {
        playerId: player.id,
        nickname: player.nickname,
        playerCount: updatedRoom.players.length,
        timestamp: Date.now(),
        isHost: false,
      };
      
      this.logger.log(`[RoomGateway] EMIT player_joined for NEW guest: ${JSON.stringify(joinedEvent)}`);
      this.server.to(room.id).emit('player_joined', joinedEvent);

      this.server.to(room.id).emit('player_status', {
        playerId: player.id,
        nickname: player.nickname,
        connection: 'CONNECTED',
        isHost: false,
        timestamp: Date.now(),
      });

      this.logger.log(`[RoomGateway] New guest joined: ${player.nickname}`);
      return { success: true, playerId: player.id, isReconnect: false };
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
      
      this.logger.log(`[RoomGateway] EMIT player_left to room ${roomId}: ${JSON.stringify(leftEvent)}`);
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

  // REMOVED: get_room_state - Use HTTP API /rooms/:id instead
  // This socket event was redundant as frontend uses HTTP API for room state

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
