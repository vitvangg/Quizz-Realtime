import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { GameService } from '../game.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RoomHandler {
  private readonly logger = new Logger(RoomHandler.name);

  constructor(
    private readonly gameService: GameService,
    private readonly redisService: RedisService,
  ) { }

  // ══════════════════════════════════════════════════════════════════════════════
  // HOST EVENTS
  // ══════════════════════════════════════════════════════════════════════════════

  async handleHostJoin(client: Socket, payload: { roomId: string }, server: Server) {
    const result = await this.gameService.verifyAndGetHostRoom(payload.roomId);

    if (!result.success) {
      throw new WsException({
        code: result.error?.code || 'ROOM_NOT_FOUND',
        message: result.error?.message || 'Room not found',
      });
    }

    const room = result.room!;

    // Create room in Redis for state sync
    await this.redisService.createRoom(room.pin, client.id);

    // Join socket to room channel
    client.join(`room:${room.id}`);

    // Get players from Redis (may already have some from previous sessions)
    const redisPlayers = await this.redisService.getPlayersInRoom(room.pin);

    return {
      event: 'room:joined',
      data: {
        success: true,
        room: result.room,
        players: redisPlayers.map(p => ({
          id: p.playerId,
          nickname: p.nickname,
          socketId: p.socketId,
        })),
        isHost: true,
      },
    };
  }

  async handleKickPlayer(client: Socket, payload: { playerId: string }, server: Server) {
    const pin = await this.redisService.getSocketRoom(client.id);

    if (!pin) {
      throw new WsException({ code: 'UNAUTHORIZED', message: 'Not in a room' });
    }

    const isHost = await this.redisService.isHostSocket(client.id, pin);
    if (!isHost) {
      throw new WsException({ code: 'UNAUTHORIZED', message: 'Only host can kick players' });
    }

    this.logger.log(`[HOST] Kick player ${payload.playerId} from room ${pin}`);

    // Kick from database
    const result = await this.gameService.kickPlayer(payload.playerId, pin);
    if (!result.success) {
      throw new WsException({ code: result.error?.code || 'KICK_ERROR', message: result.error?.message });
    }

    // Find the socket of the player to kick by iterating Redis players
    const players = await this.redisService.getPlayersInRoom(pin);
    const playerToKick = players.find(p => p.playerId === payload.playerId);

    if (playerToKick) {
      // FIRST: Send room:removed to the kicked player
      server.to(playerToKick.socketId).emit('room:removed', {
        reason: 'kicked',
        message: 'Bạn đã bị host đá khỏi phòng',
      });

      // Remove from Redis
      await this.redisService.removePlayerFromRoom(pin, playerToKick.socketId);

      // SECOND: Force disconnect the kicked socket
      const kickedSocket = server.sockets.sockets.get(playerToKick.socketId);
      if (kickedSocket) {
        kickedSocket.disconnect(true);
      }
    }

    // THIRD: Broadcast player_removed to remaining clients (host sees update)
    server.to(`room:${pin}`).emit('room:updated', {
      action: 'player_removed',
      playerId: payload.playerId,
    });

    return { event: 'room:kicked', data: { success: true } };
  }

  async handleCloseRoom(client: Socket, server: Server) {
    const pin = await this.redisService.getSocketRoom(client.id);

    if (!pin) {
      throw new WsException({ code: 'UNAUTHORIZED', message: 'Not in a room' });
    }

    const isHost = await this.redisService.isHostSocket(client.id, pin);
    if (!isHost) {
      throw new WsException({ code: 'UNAUTHORIZED', message: 'Only host can close room' });
    }

    this.logger.log(`[HOST] Close room ${pin}`);

    // Get all players before closing
    const players = await this.redisService.getPlayersInRoom(pin);

    // Notify all players
    server.to(`room:${pin}`).emit('room:removed', {
      reason: 'closed',
      message: 'Phòng đã đóng bởi host',
    });

    // Disconnect all player sockets
    for (const player of players) {
      const playerSocket = server.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        playerSocket.disconnect(true);
      }
      await this.redisService.removePlayerFromRoom(pin, player.socketId);
    }

    // Delete room from Redis
    await this.redisService.deleteRoom(pin);

    return { event: 'room:closed', data: { success: true } };
  }

  async handleStartGame(client: Socket, payload: { roomId: string }, server: Server) {
    const pin = await this.redisService.getSocketRoom(client.id);

    if (!pin) {
      throw new WsException({ code: 'UNAUTHORIZED', message: 'Not in a room' });
    }

    const isHost = await this.redisService.isHostSocket(client.id, pin);
    if (!isHost) {
      throw new WsException({ code: 'UNAUTHORIZED', message: 'Only host can start game' });
    }

    this.logger.log(`[HOST] Starting game in room ${pin}`);

    const result = await this.gameService.startGame(payload.roomId, '');
    if (!result.success) {
      throw new WsException({ code: result.error?.code || 'START_ERROR', message: result.error?.message });
    }

    // Update room status in Redis
    await this.redisService.setRoomStatus(pin, 'playing');

    const session = result.session!;
    const questions = session.room?.quiz?.questions || [];

    // Notify all players
    server.to(`room:${payload.roomId}`).emit('game:starting', {
      sessionId: session.id,
      totalQuestions: questions.length,
    });

    return { event: 'game:started', data: { success: true, session } };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PLAYER EVENTS
  // ══════════════════════════════════════════════════════════════════════════════

  async handlePlayerJoin(client: Socket, payload: { pin: string; nickname: string }, server: Server) {
    const nickname = payload.nickname?.trim();
    if (!nickname || nickname.length < 2 || nickname.length > 20) {
      throw new WsException({ code: 'INVALID_NICKNAME', message: 'Nickname must be 2-20 characters' });
    }

    // Join via game service (creates player in DB)
    const result = await this.gameService.joinRoom(payload.pin, nickname);
    if (!result.success) {
      throw new WsException({ code: result.error?.code || 'JOIN_ERROR', message: result.error?.message });
    }

    const { player, room } = result;

    // Add to Redis for real-time state sync
    await this.redisService.addPlayerToRoom(room!.pin, client.id, {
      playerId: player!.id,
      nickname: player!.nickname,
    });

    // Join socket to room channel
    client.join(`room:${room!.id}`);

    // Confirm to player
    client.emit('room:joined', {
      success: true,
      room: room,
      player: player,
      isHost: false,
    });

    // Notify others in room (excluding the new player)
    client.to(`room:${room!.id}`).emit('room:updated', {
      action: 'player_joined',
      player: player,
    });

    return { event: 'room:join_success', data: { success: true } };
  }

  async handlePlayerLeave(client: Socket, server: Server) {
    const playerData = await this.redisService.getPlayerBySocket(client.id);

    if (!playerData) {
      throw new WsException({ code: 'INVALID_REQUEST', message: 'Not in a room' });
    }

    this.logger.log(`[PLAYER] ${playerData.nickname} left room ${playerData.pin}`);

    // Remove from DB
    await this.gameService.leaveRoom(playerData.playerId);

    // Remove from Redis
    await this.redisService.removePlayerFromRoom(playerData.pin, client.id);

    // Notify room
    server.to(`room:${playerData.pin}`).emit('room:updated', {
      action: 'player_left',
      playerId: playerData.playerId,
      nickname: playerData.nickname,
    });

    // Leave socket channel
    client.leave(`room:${playerData.pin}`);

    return { event: 'room:left', data: { success: true } };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DISCONNECT
  // ══════════════════════════════════════════════════════════════════════════════

  async handleDisconnect(client: Socket, server: Server) {
    const playerData = await this.redisService.getPlayerBySocket(client.id);

    if (!playerData) {
      // Check if it's a host disconnect
      const pin = await this.redisService.getSocketRoom(client.id);
      if (pin) {
        const isHost = await this.redisService.isHostSocket(client.id, pin);
        if (isHost) {
          this.logger.log(`[HOST] Host disconnected from room ${pin}`);
          // Notify all players
          server.to(`room:${pin}`).emit('room:removed', {
            reason: 'host_disconnected',
            message: 'Host đã rời phòng',
          });
          await this.redisService.deleteRoom(pin);
        }
      }
      return;
    }

    this.logger.log(`[DISCONNECT] ${playerData.nickname} disconnected from room ${playerData.pin}`);

    // Remove from DB
    await this.gameService.leaveRoom(playerData.playerId);

    // Remove from Redis
    await this.redisService.removePlayerFromRoom(playerData.pin, client.id);

    // Notify room about player leaving
    server.to(`room:${playerData.pin}`).emit('room:updated', {
      action: 'player_left',
      playerId: playerData.playerId,
      nickname: playerData.nickname,
    });
  }
}
