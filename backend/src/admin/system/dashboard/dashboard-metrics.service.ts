import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DashboardGateway } from './dashboard.gateway';
import pidusage = require('pidusage');
import * as os from 'os';

@Injectable()
export class DashboardMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DashboardMetricsService.name);
  private intervalId: NodeJS.Timeout;

  constructor(private readonly systemGateway: DashboardGateway) {}

  onModuleInit() {
    // Đẩy metrics mỗi 3 giây
    this.intervalId = setInterval(() => this.collectAndEmitMetrics(), 3000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async collectAndEmitMetrics() {
    try {
      const stats = await pidusage(process.pid);
      
      const metrics = {
        cpu: stats.cpu,
        memory: stats.memory,
        uptime: process.uptime(),
        freeMem: os.freemem(),
        totalMem: os.totalmem(),
        timestamp: new Date().toISOString(),
      };

      this.logger.log(
        `[Metrics] CPU: ${metrics.cpu.toFixed(2)}% | RAM: ${(metrics.memory / 1024 / 1024).toFixed(1)}MB | System: ${(metrics.freeMem / 1024 / 1024 / 1024).toFixed(2)}GB free`,
      );

      this.systemGateway.broadcastMetrics(metrics);
    } catch (err) {
      this.logger.error(`Failed to collect metrics: ${err.message}`);
    }
  }
}
