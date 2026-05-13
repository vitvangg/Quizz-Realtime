import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { DashboardGateway } from './dashboard.gateway';
import { RedisService } from '../../../redis/redis.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly dashboardGateway: DashboardGateway,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationService: NotificationService,
  ) { }

  // ============================================================================
  // KILL SWITCH
  // ============================================================================

  async activateKillSwitch(adminId: string, pin?: string) {
    const isTargeted = !!pin;
    this.logger.warn(`KILL SWITCH by admin ${adminId}${isTargeted ? ` for room [${pin}]` : ' GLOBALLY'}`);

    this.dashboardGateway.broadcastEvent({
      type: 'CRITICAL',
      message: isTargeted
        ? `🚨 KILL SWITCH: Ngắt kết nối Room [${pin}]`
        : '🚨 KILL SWITCH TOÀN BỘ: Toàn bộ session bị ngắt!',
      timestamp: new Date(),
      user: adminId,
    });

    this.eventEmitter.emit('system.incident.kill_switch', { pin });

    await this.auditLogService.logSecurityEvent({
      action: 'KILL_SWITCH',
      entity: 'SECURITY',
      userId: adminId,
      details: isTargeted ? `Targeted kill: room ${pin}` : 'Global kill switch activated',
    });

    return { success: true, message: `Kill switch activated${isTargeted ? ` for room ${pin}` : ''}` };
  }

  // ============================================================================
  // LOCKDOWN (HARD FREEZE)
  // ============================================================================

  async setLockdown(adminId: string, enable: boolean) {
    this.logger.warn(`LOCKDOWN ${enable ? 'ENABLED' : 'DISABLED'} by admin ${adminId}`);

    // Lưu vào Redis để tất cả services đọc được
    await this.redisService.setSystemLockdown(enable);

    this.dashboardGateway.broadcastEvent({
      type: 'WARNING',
      message: enable
        ? 'HARD FREEZE: Server đã bị đóng băng. Tất cả game đang tạm dừng.'
        : 'FREEZE CLEARED: Server đã hoạt động trở lại bình thường.',
      timestamp: new Date(),
      user: adminId,
    });

    // Phát sự kiện → GameGateway sẽ broadcast system:freeze tới toàn bộ người chơi
    this.eventEmitter.emit('system.incident.lockdown', {
      enable,
      message: enable
        ? 'HỆ THỐNG TẠM DỪNG: Phát hiện truy cập bất thường. Đang truy vết kẻ tấn công. Vui lòng giữ nguyên màn hình...'
        : 'Hệ thống đã hoạt động trở lại. Trận đấu tiếp tục!',
    });

    await this.auditLogService.logSecurityEvent({
      action: enable ? 'LOCKDOWN_ENABLE' : 'LOCKDOWN_DISABLE',
      entity: 'SECURITY',
      userId: adminId,
      details: `Hard Freeze ${enable ? 'activated' : 'deactivated'} by admin`,
    });

    return { success: true, lockdown: enable };
  }

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

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

  // ============================================================================
  // IP BLACKLIST MANAGEMENT
  // ============================================================================

  async getBlacklist() {
    const bannedIps = await this.redisService.getBannedIps();
    return { success: true, bannedIps };
  }

  async manualBanIp(ip: string, reason: string, adminId: string) {
    await this.redisService.banIp(ip, `[Manual] ${reason}`);

    this.dashboardGateway.broadcastEvent({
      type: 'WARNING',
      message: `🛑 Manual Ban: IP ${ip} — ${reason}`,
      timestamp: new Date(),
      user: adminId,
    });

    await this.auditLogService.logSecurityEvent({
      action: 'MANUAL_IP_BAN',
      entity: 'SECURITY',
      userId: adminId,
      ipAddress: ip,
      details: `Manual ban by admin: ${reason}`,
    });

    return { success: true };
  }

  async unbanIp(ip: string, adminId?: string) {
    await this.redisService.unbanIp(ip);

    this.dashboardGateway.broadcastEvent({
      type: 'INFO',
      message: `✅ Đã gỡ chặn IP: ${ip}`,
      timestamp: new Date(),
      user: adminId,
    });

    await this.auditLogService.logSecurityEvent({
      action: 'IP_UNBAN',
      entity: 'SECURITY',
      userId: adminId,
      ipAddress: ip,
      details: `IP unbanned${adminId ? ' by admin' : ' automatically'}`,
    });

    return { success: true };
  }

  // ============================================================================
  // AUTO-BAN LISTENER (được gọi từ GameGateway via EventEmitter)
  // ============================================================================

  @OnEvent('system.incident.auto_ban')
  async handleAutoBan(payload: { ip: string; reason: string; requestCount: number }) {
    const { ip, reason, requestCount } = payload;
    this.logger.warn(`🤖 AUTO-BAN triggered: IP=${ip}, count=${requestCount}`);

    this.dashboardGateway.broadcastEvent({
      type: 'CRITICAL',
      message: `🤖 AUTO-BAN: IP ${ip} (${requestCount} req/s) — ${reason}`,
      timestamp: new Date(),
    });

    await this.auditLogService.logSecurityEvent({
      action: 'AUTO_IP_BAN',
      entity: 'SECURITY',
      ipAddress: ip,
      details: `Auto-banned: ${requestCount} req/s. Reason: ${reason}`,
    });

    await this.notificationService.sendSecurityAlert(
      `Auto-Ban IP: ${ip}`,
      `IP Address: ${ip}\nTốc độ tấn công: ${requestCount} request/giây\nLý do: ${reason}\nThời gian: ${new Date().toISOString()}\n\nKiểm tra OPS Dashboard để quản lý.`,
    );
  }
}
