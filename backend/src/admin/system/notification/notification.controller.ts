import { Controller } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('admin/system/notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}
  // Email alerts are sent programmatically via NotificationService.sendSecurityAlert()
  // No REST endpoints needed — managed by DashboardService
}
