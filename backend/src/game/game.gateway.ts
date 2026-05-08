import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RoomHandler } from './handlers/room.handler';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(private readonly roomHandler: RoomHandler) {}

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  async afterInit(server: Server) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn('Redis not configured - running without Redis adapter');
      return;
    }

    const redisConfig = this.parseRedisUrl(redisUrl);

    try {
      const Redis = require('ioredis');
      const { createAdapter } = require('socket.io-redis-adapter');

      const pubClient = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        tls: redisConfig.tls ? {} : undefined,
      });

      const subClient = pubClient.duplicate();

      await pubClient.ping();
      this.logger.log('Redis adapter connected');

      server.adapter(createAdapter(pubClient, subClient));
    } catch (error) {
      this.logger.error('Failed to connect Redis adapter:', error.message);
    }
  }

  private parseRedisUrl(url: string) {
    const match = url.match(/^rediss?:\/\/(?::([^@]+)@|([^:]+):([^@]+)@)?([^:/]+)(?::(\d+))?$/);
    if (!match) {
      return { host: 'localhost', port: 6379, password: '', tls: false };
    }
    const password = match[1] || (match[2] && match[3] ? match[3] : '');
    return {
      password: password || '',
      host: match[4],
      port: parseInt(match[5] || '6379', 10),
      tls: url.startsWith('rediss://'),
    };
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    await this.roomHandler.handleDisconnect(client, this.server);
  }

  // ============================================================================
  // ROOM EVENTS (unified)
  // ============================================================================

  @SubscribeMessage('room:host_join')
  handleHostJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    return this.roomHandler.handleHostJoin(client, payload, this.server);
  }

  @SubscribeMessage('room:player_join')
  handlePlayerJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { pin: string; nickname: string },
  ) {
    return this.roomHandler.handlePlayerJoin(client, payload, this.server);
  }

  @SubscribeMessage('room:kick')
  handleKick(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { playerId: string },
  ) {
    return this.roomHandler.handleKickPlayer(client, payload, this.server);
  }

  @SubscribeMessage('room:leave')
  handleLeave(@ConnectedSocket() client: Socket) {
    return this.roomHandler.handlePlayerLeave(client, this.server);
  }

  @SubscribeMessage('room:close')
  handleClose(@ConnectedSocket() client: Socket) {
    return this.roomHandler.handleCloseRoom(client, this.server);
  }

  // ============================================================================
  // GAME EVENTS (simplified)
  // ============================================================================

  @SubscribeMessage('game:start')
  handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    return this.roomHandler.handleStartGame(client, payload, this.server);
  }
}
