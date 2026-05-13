import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface SecurityEventPayload {
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  ipAddress?: string;
  details?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logSecurityEvent(payload: SecurityEventPayload): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: payload.action,
          entity: payload.entity,
          entityId: payload.entityId,
          userId: payload.userId,
          ipAddress: payload.ipAddress,
          details: payload.details,
        },
      });
      this.logger.log(`[AUDIT] ${payload.action} | IP: ${payload.ipAddress} | ${payload.details}`);
    } catch (error) {
      this.logger.error(`Failed to write audit log: ${error.message}`);
    }
  }

  async getSecurityLogs(limit = 50) {
    return this.prisma.auditLog.findMany({
      where: {
        entity: 'SECURITY',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
