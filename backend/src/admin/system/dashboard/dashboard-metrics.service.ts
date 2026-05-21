import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DashboardGateway } from './dashboard.gateway';
import { GameGateway } from '../../../game/game.gateway';
import { RedisService } from '../../../redis/redis.service';
import pidusage = require('pidusage');
import * as os from 'os';

@Injectable()
export class DashboardMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DashboardMetricsService.name);
  private intervalId: NodeJS.Timeout;
  private cpuAlertSent = false;

  constructor(
    private readonly systemGateway: DashboardGateway,
    private readonly gameGateway: GameGateway,
    private readonly redisService: RedisService,
  ) { }

  onModuleInit() {
    this.intervalId = setInterval(() => this.collectAndEmitMetrics(), 3000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async collectAndEmitMetrics() {
    try {
      const stats = await pidusage(process.pid);
      const connectionCount = this.gameGateway.getConnectionCount();

      const metrics = {
        cpu: stats.cpu,
        memory: stats.memory,
        uptime: process.uptime(),
        freeMem: os.freemem(),
        totalMem: os.totalmem(),
        connections: connectionCount,
        timestamp: new Date().toISOString(),
      };

      // this.logger.log(
      //   `[Metrics] CPU: ${metrics.cpu.toFixed(2)}% | RAM: ${(metrics.memory / 1024 / 1024).toFixed(1)}MB | Connections: ${connectionCount} | System: ${(metrics.freeMem / 1024 / 1024 / 1024).toFixed(2)}GB free`,
      // );

      // Auto-alert khi CPU > 80%
      if (metrics.cpu > 80 && !this.cpuAlertSent) {
        this.cpuAlertSent = true;
        this.systemGateway.broadcastEvent({
          type: 'CRITICAL',
          message: `CPU ALERT: ${metrics.cpu.toFixed(1)}% — Hệ thống đang quá tải!`,
          timestamp: new Date(),
        });
        this.logger.error(`HIGH CPU ALERT: ${metrics.cpu.toFixed(2)}%`);
      } else if (metrics.cpu <= 60) {
        this.cpuAlertSent = false; // Reset khi CPU về bình thường
      }

      this.systemGateway.broadcastMetrics(metrics);

      // Phát sự kiện cập nhật danh sách phòng
      const activeRooms = await this.redisService.getActiveRooms();
      const sessions = Object.entries(activeRooms).map(([sessionId, info]) => ({
        sessionId,
        roomId: info.roomId,
        hostId: info.hostId,
        status: info.status,
        playersCount: info.playersCount || 0,
        startedAt: info.startedAt,
      }));
      
      if (this.systemGateway.server) {
        this.systemGateway.server.emit('admin:rooms_update', { sessions, timestamp: new Date().toISOString() });
      }

    } catch (err) {
      this.logger.error(`Failed to collect metrics: ${err.message}`);
    }
  }
}
