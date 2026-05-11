import { Module } from '@nestjs/common';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { IncidentController } from './incident.controller';
import { DashboardService } from './dashboard.service';

@Module({
  providers: [DashboardGateway, DashboardMetricsService, DashboardService],
  controllers: [IncidentController],
  exports: [DashboardGateway, DashboardService],
})
export class DashboardModule {}
