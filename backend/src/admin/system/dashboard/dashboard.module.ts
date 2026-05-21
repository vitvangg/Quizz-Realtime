import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../../auth/auth.module';

import { DashboardGateway } from './dashboard.gateway';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { IncidentController } from './incident.controller';
import { DashboardService } from './dashboard.service';
import { RedisModule } from '../../../redis/redis.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationModule } from '../notification/notification.module';
import { GameModule } from '../../../game/game.module';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [
    RedisModule,
    AuditLogModule,
    NotificationModule,
    PrismaModule,
    forwardRef(() => GameModule),
    AuthModule,
  ],
  providers: [DashboardGateway, DashboardMetricsService, DashboardService],
  controllers: [IncidentController],
  exports: [DashboardGateway, DashboardService],
})
export class DashboardModule { }
