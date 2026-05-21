import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/admin-ops',
})
export class DashboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private connectedAdmins = new Set<string>();

  constructor(private readonly jwtService: JwtService) {}

  // Broadcast metrics định kỳ
  broadcastMetrics(metrics: any) {
    if (!this.server) {
      this.logger.warn(
        '[DashboardGateway] Server not initialized for metrics broadcast',
      );
      return;
    }
    this.server.emit('system:metrics', metrics);
  }

  // Broadcast sự kiện dạng log (Event Stream)
  broadcastEvent(event: {
    type: string;
    message: string;
    timestamp: Date;
    user?: string;
  }) {
    if (!this.server) {
      this.logger.warn(
        '[DashboardGateway] Server not initialized for event broadcast',
      );
      return;
    }
    this.logger.log(
      `[DashboardGateway] Broadcasting event: ${event.type} - ${event.message}`,
    );
    this.server.emit('system:event', event);
    this.logger.log(
      `[DashboardGateway] Event broadcasted to ${this.connectedAdmins.size} admin(s)`,
    );
  }

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(
          `[DashboardGateway] Connection attempt without token from ${client.id}`,
        );
        client.disconnect(true);
        return;
      }

      // Verify JWT token
      const decoded = this.jwtService.verify(token);
      const email = decoded?.email;

      this.connectedAdmins.add(client.id);
      this.logger.log(
        `[DashboardGateway] OPS Admin connected: ${client.id} (email: ${email}, total: ${this.connectedAdmins.size})`,
      );

      // Send confirmation
      client.emit('connection:confirmed', {
        status: 'connected',
        timestamp: new Date(),
      });
    } catch (err) {
      this.logger.error(`[DashboardGateway] Connection error: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedAdmins.delete(client.id);
    this.logger.log(
      `[DashboardGateway] OPS Admin disconnected: ${client.id} (remaining: ${this.connectedAdmins.size})`,
    );
  }

  getConnectedAdminsCount(): number {
    return this.connectedAdmins.size;
  }
}
