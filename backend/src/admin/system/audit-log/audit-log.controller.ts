import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

@Controller('admin/system/audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('security')
  async getSecurityLogs(@Query('limit') limit?: string) {
    return this.auditLogService.getSecurityLogs(limit ? parseInt(limit) : 50);
  }
}
