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
import { OnEvent } from '@nestjs/event-emitter';
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

// Track host disconnections with grace period timers
// Key: roomId, Value: { playerId, timer }
const hostDisconnectTimers = new Map<string, NodeJS.Timeout>();
const HOST_DISCONNECT_GRACE_PERIOD_MS = 30000; // 30 seconds grace period for host reconnect

function clearHostDisconnectTimer(roomId: string) {
  const timer = hostDisconnectTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    hostDisconnectTimers.delete(roomId);
    return true;
  }
  return false;
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

  // Track IP to socket for instant banning
  private ipSocketMap = new Map<string, Set<string>>();

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

    if (!this.ipSocketMap.has(ip)) this.ipSocketMap.set(ip, new Set());
    this.ipSocketMap.get(ip)!.add(client.id);

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

    const ip = client.handshake.address;
    if (this.ipSocketMap.has(ip)) {
      this.ipSocketMap.get(ip)?.delete(client.id);
      if (this.ipSocketMap.get(ip)?.size === 0) this.ipSocketMap.delete(ip);
    }

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

    if (isHost) {
      // For host disconnect, start grace period timer
      // If host doesn't reconnect within grace period, emit host_left
      this.logger.log(`[RoomGateway] Host ${nickname} disconnected - starting grace period timer`);
      
      // Clear any existing timer for this room
      clearHostDisconnectTimer(roomId);
      
      const timer = setTimeout(async () => {
        // Host didn't reconnect - emit host_left and room_closed
        this.logger.log(`[RoomGateway] Host grace period expired - emitting host_left for room ${roomId}`);
        
        // Check if host actually reconnected (presence might have been updated)
        const hostPresence = await this.presenceService.getPlayerLobbyPresence(roomId, playerId);
        if (hostPresence && hostPresence.connection === 'CONNECTED') {
          this.logger.log(`[RoomGateway] Host ${nickname} reconnected during grace period - skipping host_left`);
          return;
        }
        
        // Detach host from Redis presence
        await this.presenceService.detachPlayerFromLobby(roomId, playerId);
        
        // Emit host_left and room_closed to all players
        this.server.to(roomId).emit('host_left', {
          roomId,
          hostId: playerId,
          nickname,
          timestamp: Date.now(),
        });
        
        this.server.to(roomId).emit('room_closed', {
          roomId,
          reason: 'host_disconnect_timeout',
          message: 'Host đã mất kết nối. Phòng sẽ bị đóng.',
          timestamp: Date.now(),
        });
        
        this.logger.log(`[RoomGateway] Room ${roomId} closed due to host disconnect timeout`);
      }, HOST_DISCONNECT_GRACE_PERIOD_MS);
      
      hostDisconnectTimers.set(roomId, timer);
      
      this.logger.log(`[RoomGateway] Host disconnect timer set for ${HOST_DISCONNECT_GRACE_PERIOD_MS}ms`);
    } else {
      // For regular players, just mark disconnected (no timer needed)
      this.logger.log(`[RoomGateway] Player ${nickname} marked disconnected (no grace period)`);
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

        // Clear any pending host disconnect timer (host is reconnecting)
        if (clearHostDisconnectTimer(roomId)) {
          this.logger.log(`[RoomGateway] Cleared host disconnect timer for room ${roomId} - host reconnected`);
        }
        
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

      // Broadcast based on whether host is leaving or player is leaving
      const presence = await this.presenceService.getLobbyPresence(roomId);
      
      if (identity.isHost) {
        // Host is leaving - emit host_left and room_closed for all players
        this.logger.log(`[RoomGateway] Host ${identity.nickname} left room ${roomId} - emitting host_left`);
        
        this.server.to(roomId).emit('host_left', {
          roomId,
          hostId: leftPlayerId,
          nickname: identity.nickname,
          timestamp: Date.now(),
        });
        
        this.server.to(roomId).emit('room_closed', {
          roomId,
          reason: 'host_left',
          message: 'Host đã rời phòng. Phòng sẽ bị đóng.',
          timestamp: Date.now(),
        });

        // Emit player_status for connection tracking
        this.server.to(roomId).emit('player_status', {
          playerId: leftPlayerId,
          nickname: identity.nickname,
          connection: 'LEFT',
          isHost: true,
          timestamp: Date.now(),
        });
      } else {
        // Regular player is leaving - emit player_left
        const leftEvent: PlayerLeftEvent = {
          playerId: leftPlayerId,
          nickname: identity.nickname,
          playerCount: presence.players.size,
          isHost: false,
          timestamp: Date.now(),
        };
        
        this.logger.log(`[RoomGateway] EMIT player_left to room ${roomId}: ${JSON.stringify(leftEvent)}`);
        this.server.to(roomId).emit('player_left', leftEvent);

        // Emit player_status for connection tracking
        this.server.to(roomId).emit('player_status', {
          playerId: leftPlayerId,
          nickname: identity.nickname,
          connection: 'LEFT',
          isHost: false,
          timestamp: Date.now(),
        });
      }

      return { success: true };
    } catch (error) {
      const message =
        error.response?.message || error.message || 'Failed to leave room';
      throw new WsException(message);
    }
  }

  @SubscribeMessage('host_leave_room')
  async handleHostLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveRoomPayload,
  ) {
    try {
      const { roomId } = payload;
      const identity = this.socketMap.get(client.id);

      if (!identity || identity.roomId !== roomId) {
        throw new WsException('Not in this room');
      }

      // Verify this is actually the host
      if (!identity.isHost) {
        throw new WsException('Only host can close the room');
      }

      this.logger.log(`[RoomGateway] host_leave_room received from ${identity.nickname} (${identity.playerId}) for room ${roomId}`);

      // Detach host from Redis presence
      await this.presenceService.detachPlayerFromLobby(roomId, identity.playerId);

      client.leave(roomId);
      this.socketMap.delete(client.id);

      // Emit room_closed to all players (including host for confirmation)
      this.server.to(roomId).emit('room_closed', {
        roomId,
        reason: 'host_left',
        message: 'Host đã rời phòng. Phòng sẽ bị đóng.',
        timestamp: Date.now(),
      });

      // Also emit host_left for consistency
      this.server.to(roomId).emit('host_left', {
        roomId,
        hostId: identity.playerId,
        nickname: identity.nickname,
        timestamp: Date.now(),
      });

      this.logger.log(`[RoomGateway] Room ${roomId} closed by host ${identity.nickname}`);

      return { success: true, roomClosed: true };
    } catch (error) {
      const message =
        error.response?.message || error.message || 'Failed to close room';
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

  @OnEvent('system.incident.ban_ip')
  handleBanIpEvent(payload: { ip: string }) {
    const sockets = this.ipSocketMap.get(payload.ip);
    if (!sockets || sockets.size === 0) return;
    let count = 0;
    for (const socketId of sockets) {
      const lobbySocket = this.server?.sockets?.sockets?.get(socketId);
      if (lobbySocket) {
        lobbySocket.emit('banned', { reason: 'Your IP has been banned by admin.' });
        lobbySocket.disconnect(true);
        count++;
      }
    }
    if (count > 0) {
      this.logger.warn(`[RoomGateway] Kicked ${count} socket(s) for banned IP: ${payload.ip}`);
    }
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
