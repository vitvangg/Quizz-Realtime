import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DashboardGateway } from './dashboard.gateway';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly dashboardGateway: DashboardGateway,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async activateKillSwitch(adminId: string) {
    this.logger.warn(`KILL SWITCH activated by admin ${adminId}`);

    // 1. Gửi event ra /admin-ops để các admin khác thấy trên Event Stream
    this.dashboardGateway.broadcastEvent({
      type: 'CRITICAL',
      message: '🚨 KILL SWITCH THỰC THI: Toàn bộ session bị ngắt kết nối!',
      timestamp: new Date(),
      user: adminId,
    });

    // 2. Kích hoạt logic nội bộ để đẩy event sang GameGateway (vì GameGateway giữ connection của player)
    // GameGateway sẽ lắng nghe event này và gọi server.disconnectSockets()
    this.eventEmitter.emit('system.incident.kill_switch');

    // (Tuỳ chọn: Lưu AuditLog, ở đây có AuditLogInterceptor xử lý ở level Controller)
    return { success: true, message: 'Kill switch activated' };
  }

  async setLockdown(adminId: string, enable: boolean) {
    this.logger.warn(`LOCKDOWN ${enable ? 'activated' : 'deactivated'} by admin ${adminId}`);

    this.dashboardGateway.broadcastEvent({
      type: 'WARNING',
      message: `Tình trạng Lockdown ${enable ? 'đã BẬT (không thể tạo game mới)' : 'đã TẮT'}.`,
      timestamp: new Date(),
      user: adminId,
    });

    // Cập nhật Redis cấu hình hệ thống (SettingService)
    this.eventEmitter.emit('system.incident.lockdown', { enable });

    return { success: true, lockdown: enable };
  }

  async setMaintenance(adminId: string, enable: boolean) {
    this.logger.warn(`MAINTENANCE ${enable ? 'activated' : 'deactivated'} by admin ${adminId}`);

    this.dashboardGateway.broadcastEvent({
      type: 'CRITICAL',
      message: `Chế độ Bảo trì ${enable ? 'đã BẬT (toàn bộ user bị kick)' : 'đã TẮT'}.`,
      timestamp: new Date(),
      user: adminId,
    });

    this.eventEmitter.emit('system.incident.maintenance', { enable });

    return { success: true, maintenance: enable };
  }
}
