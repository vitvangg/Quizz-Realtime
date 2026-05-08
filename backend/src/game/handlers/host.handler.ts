import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { GameService } from '../game.service';
import { RedisService } from '../../redis/redis.service';
import { SocketStateService, SocketInfo } from '../services/socket-state.service';
import { HostJoinPayload, KickPlayerPayload, StartGamePayload } from '../interfaces/event-payloads.interface';

@Injectable()
export class HostHandler {
  private readonly logger = new Logger(HostHandler.name);

  constructor(
    private readonly gameService: GameService,
    private readonly redis: RedisService,
    private readonly socketState: SocketStateService,
  ) {}

  async handleJoinRoom(client: Socket, payload: HostJoinPayload, server: Server) {
    this.logger.log(`Host joining room: ${payload.roomId}`);

    const result = await this.gameService.verifyAndGetHostRoom(payload.roomId);

    if (!result.success) {
      throw new WsException({
        code: result.error?.code || 'HOST_JOIN_ERROR',
        message: result.error?.message || 'Cannot join room',
      });
    }

    this.socketState.registerHost(client.id, payload.roomId, result.room!.hostId);
    client.join(`room:${payload.roomId}`);

    return {
      event: 'host:joined-room',
      data: {
        success: true,
        room: result.room,
        players: result.room?.players || [],
      },
    };
  }

  async handleKickPlayer(
    client: Socket,
    payload: KickPlayerPayload,
    server: Server,
  ) {
    this.logger.log(`[KICK] Client ${client.id} trying to kick player ${payload.playerId}`);

    const hostInfo = this.socketState.verifyHost(client.id);
    if (!hostInfo) {
      this.logger.error(`[KICK] Unauthorized kick attempt from socket ${client.id}`);
      throw new WsException({
        code: 'UNAUTHORIZED',
        message: 'Only host can kick players',
      });
    }

    this.logger.log(`[KICK] Host ${hostInfo.userId} kicking player ${payload.playerId} from room ${hostInfo.roomId}`);

    const result = await this.gameService.kickPlayer(
      payload.playerId,
      hostInfo.roomId,
      hostInfo.userId!,
    );

    if (!result.success) {
      this.logger.error(`[KICK] Failed: ${result.error?.message}`);
      throw new WsException({
        code: result.error?.code || 'KICK_ERROR',
        message: result.error?.message || 'Cannot kick player',
      });
    }

    const playerSocketId = this.socketState.getPlayerSocketId(payload.playerId);
    this.logger.log(`[KICK] Player socket ID: ${playerSocketId}`);

    // Remove from socket state FIRST (before disconnecting)
    if (playerSocketId) {
      this.socketState.unregisterPlayer(payload.playerId);
    }

    // Broadcast to ALL in room (including the kicked player)
    // Frontend will check if kicked playerId matches their own and redirect
    server.to(`room:${hostInfo.roomId}`).emit('player:left', {
      playerId: payload.playerId,
      nickname: result.player?.nickname,
      kicked: true,
      reason: 'Bạn đã bị host đá khỏi phòng',
    });

    // Force disconnect the player's socket after a small delay
    if (playerSocketId) {
      setTimeout(() => {
        try {
          const adapter = (server as any).adapter;
          if (adapter && typeof adapter.disconnect === 'function') {
            adapter.disconnect(playerSocketId, true);
          } else {
            this.logger.warn(`[KICK] Adapter disconnect not available`);
          }
        } catch (err: any) {
          this.logger.error(`[KICK] Error disconnecting socket: ${err.message}`);
        }
      }, 100);
    }

    this.logger.log(`[KICK] Successfully kicked player ${payload.playerId}`);

    return {
      event: 'host:player-kicked',
      data: {
        success: true,
        playerId: payload.playerId,
      },
    };
  }

  async handleStartGame(client: Socket, payload: StartGamePayload, server: Server) {
    const hostInfo = this.socketState.verifyHost(client.id);
    if (!hostInfo) {
      throw new WsException({
        code: 'UNAUTHORIZED',
        message: 'Only host can start the game',
      });
    }

    this.logger.log(`Host starting game in room: ${hostInfo.roomId}`);

    const result = await this.gameService.startGame(hostInfo.roomId, hostInfo.userId!);

    if (!result.success) {
      throw new WsException({
        code: result.error?.code || 'START_ERROR',
        message: result.error?.message || 'Cannot start game',
      });
    }

    const session = result.session!;
    const questions = session.room?.quiz?.questions || [];
    const totalQuestions = questions.length;

    server.to(`room:${hostInfo.roomId}`).emit('game:starting', {
      sessionId: session.id,
      countdown: 3,
      totalQuestions,
    });

    if (questions.length > 0) {
      setTimeout(() => {
        // Set active question
        const durationMs = (questions[0].timeLimit || 20) * 1000;
        this.gameService.setActiveQuestion(
          hostInfo.roomId,
          session.id,
          questions[0].id,
          0,
          durationMs,
        );

        server.to(`room:${hostInfo.roomId}`).emit('question:start', {
          sessionId: session.id,
          questionIndex: 0,
          question: questions[0],
          timeLimit: questions[0].timeLimit || 20,
          startedAt: Date.now(),
        });
      }, 3000);
    }

    return {
      event: 'host:game-started',
      data: {
        success: true,
        session,
      },
    };
  }

  async handleCloseRoom(client: Socket, server: Server) {
    const hostInfo = this.socketState.verifyHost(client.id);
    if (!hostInfo) {
      throw new WsException({
        code: 'UNAUTHORIZED',
        message: 'Only host can close the room',
      });
    }

    this.logger.log(`Host closing room: ${hostInfo.roomId}`);

    const playersInRoom = this.socketState.getPlayersInRoom(hostInfo.roomId);

    for (const { playerId, socketId } of playersInRoom) {
      server.to(socketId).emit('room:closed', {
        reason: 'Room has been closed by host',
      });

      const playerSocket = server.sockets.sockets.get(socketId);
      if (playerSocket) {
        playerSocket.leave(`room:${hostInfo.roomId}`);
      }

      this.socketState.unregisterPlayer(playerId);
    }

    this.socketState.unregisterSocket(client.id);

    return {
      event: 'host:room-closed',
      data: {
        success: true,
      },
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private notifyPlayerKicked(
    playerSocketId: string,
    playerId: string,
    roomId: string,
    server: Server,
  ) {
    const playerSocket = server.sockets.sockets.get(playerSocketId);

    if (playerSocket) {
      playerSocket.emit('player:kicked', {
        playerId,
        reason: 'Bạn đã bị host đá khỏi phòng',
      });
      playerSocket.emit('room:closed', {
        reason: 'You have been removed from the room',
      });
      playerSocket.leave(`room:${roomId}`);
    } else {
      server.to(playerSocketId).emit('player:kicked', {
        playerId,
        reason: 'Bạn đã bị host đá khỏi phòng',
      });
      server.to(playerSocketId).emit('room:closed', {
        reason: 'You have been removed from the room',
      });
    }
  }

  notifyHostDisconnected(hostInfo: SocketInfo, server: Server) {
    const playersInRoom = this.socketState.getPlayersInRoom(hostInfo.roomId);

    for (const { playerId, socketId } of playersInRoom) {
      server.to(socketId).emit('room-closed', {
        reason: 'Host has left the room',
      });
      this.socketState.unregisterPlayer(playerId);
    }
  }
}
