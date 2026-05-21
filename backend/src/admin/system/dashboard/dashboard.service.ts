import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { DashboardGateway } from './dashboard.gateway';
import { RedisService } from '../../../redis/redis.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly dashboardGateway: DashboardGateway,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
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

    this.redisService.publish('system.incident.kill_switch', JSON.stringify({ pin })).catch(e => this.logger.error(e));

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

    this.redisService.publish('system.incident.lockdown', JSON.stringify({
      enable,
      message: enable
        ? 'HỆ THỐNG TẠM DỪNG: Phát hiện truy cập bất thường. Đang truy vết kẻ tấn công. Vui lòng giữ nguyên màn hình...'
        : 'Hệ thống đã hoạt động trở lại. Trận đấu tiếp tục!',
    })).catch(e => this.logger.error(e));

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

  async setMaintenance(
    adminId: string,
    enable: boolean,
    options?: { message?: string; scheduledFrom?: string; scheduledUntil?: string },
  ) {
    this.logger.warn(`MAINTENANCE ${enable ? 'activated' : 'deactivated'} by admin ${adminId}`);

    await this.redisService.setMaintenanceMode(enable);

    if (enable && options) {
      await this.redisService.set(
        'system:config:maintenance_meta',
        JSON.stringify({
          message: options.message || 'Hệ thống sẽ bảo trì định kỳ.',
          scheduledFrom: options.scheduledFrom || null,
          scheduledUntil: options.scheduledUntil || null,
          setAt: new Date().toISOString(),
          setBy: adminId,
        }),
        'EX',
        86400 * 7,
      );
    } else {
      await this.redisService.del('system:config:maintenance_meta');
    }

    const label = options?.scheduledFrom
      ? `từ ${options.scheduledFrom}${options.scheduledUntil ? ` đến ${options.scheduledUntil}` : ''}`
      : '';

    this.dashboardGateway.broadcastEvent({
      type: 'CRITICAL',
      message: `🔧 Maintenance ${enable ? `BẬT ${label}` : 'TẮT'}: ${options?.message || ''}`,
      timestamp: new Date(),
      user: adminId,
    });

    this.redisService.publish('system.incident.maintenance', JSON.stringify({
      enable,
      message: options?.message,
      scheduledFrom: options?.scheduledFrom,
      scheduledUntil: options?.scheduledUntil,
    })).catch(e => this.logger.error(e));

    await this.auditLogService.logSecurityEvent({
      action: enable ? 'MAINTENANCE_ENABLE' : 'MAINTENANCE_DISABLE',
      entity: 'SECURITY',
      userId: adminId,
      details: `Maintenance ${enable ? 'activated' : 'deactivated'} | ${label} | ${options?.message || ''}`,
    });

    return { success: true, maintenance: enable };
  }

  async getActiveSessions() {
    const roomsMap = await this.redisService.getActiveRooms();
    const sessions = Object.entries(roomsMap).map(([sessionId, info]) => ({
      sessionId,
      roomId: info.roomId,
      hostId: info.hostId,
      status: info.status,
      playersCount: info.playersCount || 0,
      startedAt: info.startedAt,
      currentQuestionIndex: info.currentQuestionIndex ?? 0,
      totalQuestions: info.totalQuestions ?? 0,
      timeLimit: info.timeLimit ?? 20,
      questionStartedAt: info.questionStartedAt ?? null,
    }));

    return { success: true, sessions };
  }

  async getSessionPlayers(sessionId: string) {
    const data = await this.redisService.hgetall(`presence:session:${sessionId}`);
    if (!data) return { success: true, players: [] };

    const players = await Promise.all(
      Object.values(data).map(async (str) => {
        try {
          const player = JSON.parse(str as string);
          // Thêm requestCount từ Redis sliding window counter
          if (player.ipAddress) {
            player.requestCount = await this.redisService.getIpRequestCount(player.ipAddress);
          } else {
            player.requestCount = 0;
          }
          return player;
        } catch {
          return null;
        }
      })
    );

    return { success: true, players: players.filter(Boolean) };
  }

  // ============================================================================
  // IP BLACKLIST MANAGEMENT
  // ============================================================================

  async getBlacklist() {
    const bannedIps = await this.redisService.getBannedIps();
    return { success: true, bannedIps };
  }

  async manualBanIp(ip: string, reason: string, adminId: string, ttlHours = 24) {
    const ttlSeconds = ttlHours * 3600;
    await this.redisService.banIp(ip, `[Manual] ${reason}`, ttlSeconds);

    this.dashboardGateway.broadcastEvent({
      type: 'WARNING',
      message: `🛑 Manual Ban: IP ${ip} — ${reason} (TTL: ${ttlHours}h)`,
      timestamp: new Date(),
      user: adminId,
    });

    await this.auditLogService.logSecurityEvent({
      action: 'MANUAL_IP_BAN',
      entity: 'SECURITY',
      userId: adminId,
      ipAddress: ip,
      details: `Manual ban by admin: ${reason} | TTL: ${ttlHours}h`,
    });

    // Kick tất cả socket của IP đó ngay lập tức (không cần chờ reconnect) thông qua Redis
    this.redisService.publish('system.incident.ban_ip', JSON.stringify({ ip })).catch(e => this.logger.error(e));

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

    // Kick socket ngay lập tức thông qua Redis
    this.redisService.publish('system.incident.ban_ip', JSON.stringify({ ip })).catch(e => this.logger.error(e));
  }

  // ============================================================================
  // SYSTEM OVERVIEW
  // ============================================================================


  async getSystemOverview() {
    const [totalUsers, totalQuizzes, activeRooms, bannedIps] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.quiz.count({ where: { deletedAt: null } }),
      this.redisService.getActiveRooms(),
      this.redisService.getBannedIps(),
    ]);

    const activeSessions = Object.keys(activeRooms).length;
    const totalPlayersOnline = Object.values(activeRooms).reduce(
      (sum: number, room: any) => sum + (room.playersCount || 0), 0
    );

    return {
      totalUsers,
      totalQuizzes,
      activeSessions,
      totalPlayersOnline,
      bannedIpsCount: bannedIps.length,
      connectedAdmins: this.dashboardGateway.getConnectedAdminsCount(),
    };
  }
}

