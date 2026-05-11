import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { GameService } from '../game.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SocketStateService, SocketInfo } from '../services/socket-state.service';
import { PlayerJoinPayload, LeaveRoomPayload } from '../interfaces/event-payloads.interface';

@Injectable()
export class PlayerHandler {
  private readonly logger = new Logger(PlayerHandler.name);

  constructor(
    private readonly gameService: GameService,
    private readonly prismaService: PrismaService,
    private readonly socketState: SocketStateService,
  ) {}

  async handleJoinRoom(client: Socket, payload: PlayerJoinPayload, server: Server) {
    this.logger.log(`[PLAYER JOIN] Client: ${client.id}, PIN: ${payload.pin}, Nickname: ${payload.nickname}`);

    if (!payload.nickname || payload.nickname.length < 2 || payload.nickname.length > 20) {
      this.logger.warn(`[PLAYER JOIN] Invalid nickname: ${payload.nickname}`);
      throw new WsException({
        code: 'INVALID_NICKNAME',
        message: 'Nickname must be between 2 and 20 characters',
      });
    }

    const result = await this.gameService.joinRoom(payload.pin, payload.nickname);

    if (!result.success) {
      this.logger.warn(`[PLAYER JOIN] Failed to join room: ${result.error?.message}`);
      throw new WsException({
        code: result.error?.code || 'JOIN_ERROR',
        message: result.error?.message || 'Cannot join room',
      });
    }

    const player = result.player!;
    const room = result.room!;

    // Get active session if exists
    const activeSession = await this.prismaService.gameSession.findFirst({
      where: { roomId: room.id, status: { in: ['PLAYING', 'WAITING'] } },
      orderBy: { startedAt: 'desc' },
    });

    this.socketState.registerPlayer(client.id, room.id, player.id, activeSession?.id);
    client.join(`room:${room.id}`);

    this.logger.log(`[PLAYER JOIN] Success: ${player.nickname} (${player.id}) joined room ${room.id}`);

    // Send confirmation to the player who joined
    client.emit('player:joined-room', { player, room, sessionId: activeSession?.id });

    // Notify others
    server.to(`room:${room.id}`).emit('player:joined', { player });

    return {
      event: 'player:join-success',
      data: {
        success: true,
        player,
        room,
        sessionId: activeSession?.id,
      },
    };
  }

  async handleLeaveRoom(client: Socket, payload: LeaveRoomPayload, server: Server) {
    const info = this.socketState.getSocketInfo(client.id);

    if (!info || info.isHost) {
      throw new WsException({
        code: 'INVALID_REQUEST',
        message: 'Invalid leave request',
      });
    }

    this.logger.log(`Player leaving room: ${payload.playerId}`);

    const result = await this.gameService.leaveRoom(payload.playerId, info.roomId);

    if (!result.success) {
      throw new WsException({
        code: result.error?.code || 'LEAVE_ERROR',
        message: result.error?.message || 'Cannot leave room',
      });
    }

    this.socketState.unregisterPlayer(payload.playerId);
    client.leave(`room:${info.roomId}`);

    server.to(`room:${info.roomId}`).emit('player:left', {
      playerId: payload.playerId,
      nickname: result.player?.nickname,
      kicked: false,
    });

    return {
      event: 'player:left-room',
      data: {
        success: true,
      },
    };
  }

  async handleDisconnect(client: Socket, server: Server) {
    const info = this.socketState.getSocketInfo(client.id);
    if (!info || !info.playerId) return;

    this.logger.log(`Player ${info.playerId} disconnected from room ${info.roomId}`);

    try {
      await this.gameService.leaveRoom(info.playerId, info.roomId);
    } catch (error) {
      this.logger.warn(`Failed to remove player ${info.playerId} from database: ${error.message}`);
    }

    this.socketState.unregisterPlayer(info.playerId);

    server.to(`room:${info.roomId}`).emit('player:left', {
      playerId: info.playerId,
      nickname: undefined,
      kicked: false,
      disconnected: true,
    });
  }
}
