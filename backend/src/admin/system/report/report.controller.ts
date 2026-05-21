import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { ReportService, ReportStatus } from './report.service';

@Controller('admin/system/reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  async findAll(@Query('status') status?: string) {
    const reports = await this.reportService.findAll(status as any);
    return { reports, total: reports.length };
  }

  @Post()
  async create(@Req() req: any, @Body() body: { entityType: string; entityId: string; reason: string }) {
    return this.reportService.create(req.user?.id || 'admin', body.entityType, body.entityId, body.reason);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.reportService.updateStatus(id, body.status as any);
  }
}
