import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums/role.enum';
import { AuthGuard } from '../../../auth/guards/auth.guard';

@Controller('admin/system/incident')
// @UseGuards(AuthGuard, RolesGuard)
export class IncidentController {
  constructor(private readonly systemService: DashboardService) { }

  @Post('kill-switch')
  // @Roles([Role.SUPER_ADMIN])
  async triggerKillSwitch(@Req() req: any) {
    const adminId = req.user?.id || 'SYSTEM_UNKNOWN';
    return this.systemService.activateKillSwitch(adminId);
  }

  @Post('lockdown')
  @Roles([Role.SUPER_ADMIN, Role.OPS_ADMIN])
  async triggerLockdown(@Req() req: any, @Body() body: { enable: boolean }) {
    const adminId = req.user?.id || 'SYSTEM_UNKNOWN';
    return this.systemService.setLockdown(adminId, body.enable);
  }

  @Post('maintenance')
  @Roles([Role.SUPER_ADMIN])
  async triggerMaintenance(@Req() req: any, @Body() body: { enable: boolean }) {
    const adminId = req.user?.id || 'SYSTEM_UNKNOWN';
    return this.systemService.setMaintenance(adminId, body.enable);
  }
}
