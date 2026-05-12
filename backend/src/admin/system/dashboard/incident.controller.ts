import { Controller, Post, Get, Body, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('admin/system/incident')
// @UseGuards(AuthGuard, RolesGuard) -- Re-enable in production
export class IncidentController {
  constructor(private readonly systemService: DashboardService) {}

  @Post('kill-switch')
  async triggerKillSwitch(@Req() req: any, @Body() body: { pin?: string }) {
    const adminId = req.user?.id || 'SYSTEM_UNKNOWN';
    return this.systemService.activateKillSwitch(adminId, body?.pin);
  }

  @Post('lockdown')
  async triggerLockdown(@Req() req: any, @Body() body: { enable: boolean }) {
    const adminId = req.user?.id || 'SYSTEM_UNKNOWN';
    return this.systemService.setLockdown(adminId, body.enable);
  }

  @Post('maintenance')
  async triggerMaintenance(@Req() req: any, @Body() body: { enable: boolean }) {
    const adminId = req.user?.id || 'SYSTEM_UNKNOWN';
    return this.systemService.setMaintenance(adminId, body.enable);
  }

  @Get('blacklist')
  async getBlacklist() {
    return this.systemService.getBlacklist();
  }

  @Post('ban-ip')
  async banIp(@Req() req: any, @Body() body: { ip: string; reason: string }) {
    const adminId = req.user?.id || 'SYSTEM_UNKNOWN';
    return this.systemService.manualBanIp(body.ip, body.reason || 'Manual ban', adminId);
  }

  @Post('unban-ip')
  async unbanIp(@Req() req: any, @Body() body: { ip: string }) {
    const adminId = req.user?.id || 'SYSTEM_UNKNOWN';
    return this.systemService.unbanIp(body.ip, adminId);
  }
}
