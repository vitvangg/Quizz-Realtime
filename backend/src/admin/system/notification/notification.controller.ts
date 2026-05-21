import { Controller, Get, Query } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('admin/system/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('history')
  async getHistory(@Query('limit') limit?: string) {
    const items = await this.notificationService.getAlertHistory(limit ? Number(limit) : 50);
    return { notifications: items, total: items.length };
  }
}
