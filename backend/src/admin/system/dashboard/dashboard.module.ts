import { Module, forwardRef } from '@nestjs/common';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { IncidentController } from './incident.controller';
import { DashboardService } from './dashboard.service';
import { RedisModule } from '../../../redis/redis.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationModule } from '../notification/notification.module';
import { GameModule } from '../../../game/game.module';

@Module({
  imports: [
    RedisModule,
    AuditLogModule,
    NotificationModule,
    forwardRef(() => GameModule),
  ],
  providers: [DashboardGateway, DashboardMetricsService, DashboardService],
  controllers: [IncidentController],
  exports: [DashboardGateway, DashboardService],
})
export class DashboardModule {}
