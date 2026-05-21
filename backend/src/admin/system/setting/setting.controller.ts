import { Controller, Get, Patch, Body } from '@nestjs/common';
import { SettingService, SystemSettings } from './setting.service';

@Controller('admin/system/settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Get()
  async getAll() {
    return this.settingService.getAll();
  }

  @Patch()
  async updateAll(@Body() body: Partial<SystemSettings>) {
    return this.settingService.updateAll(body);
  }
}
