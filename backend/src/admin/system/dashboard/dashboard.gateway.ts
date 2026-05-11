import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
// Chú ý: Ở thực tế, bạn cần implement logic verify JWT token ở middleware WebSocket
// vì Guards của NestJS không chạy mặc định lúc handshake connection socket.io

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/admin-ops',
})
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DashboardGateway.name);

  // Broadcast metrics định kỳ
  broadcastMetrics(metrics: any) {
    this.server.emit('system:metrics', metrics);
  }

  // Broadcast sự kiện dạng log (Event Stream)
  broadcastEvent(event: { type: string; message: string; timestamp: Date; user?: string }) {
    this.server.emit('system:event', event);
  }

  // Yêu cầu ngắt kết nối toàn bộ người chơi (Kill Switch)
  broadcastKillSwitch() {
    this.server.emit('system:action', { action: 'KILL_SWITCH', timestamp: new Date() });
    // Note: Gateway này nằm ở /admin-ops, để đá user đang chơi, 
    // chúng ta sẽ cần inject GameGateway hoặc dùng Redis Pub/Sub / Adapter
    // để gửi lệnh qua namespace /game.
  }

  handleConnection(client: Socket) {
    // TODO: Verify JWT token & Role (chỉ cho phép OPS_ADMIN, SUPER_ADMIN)
    // Nếu sai -> client.disconnect()
    this.logger.log(`OPS Admin connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`OPS Admin disconnected: ${client.id}`);
  }
}
