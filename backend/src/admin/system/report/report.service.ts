import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type ReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(status?: ReportStatus) {
    const reports = await this.prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Enrich với user info của reporter
    const enriched = await Promise.all(
      reports.map(async (r) => {
        let reporterEmail = r.reporterId;
        let targetName = r.entityId;
        try {
          const reporter = await this.prisma.user.findUnique({
            where: { id: r.reporterId },
            select: { email: true, fullName: true },
          });
          if (reporter) reporterEmail = reporter.email || reporter.fullName || r.reporterId;

          // Nếu entity là Quiz, lấy tên quiz
          if (r.entityType === 'Quiz') {
            const quiz = await this.prisma.quiz.findUnique({
              where: { id: r.entityId },
              select: { title: true },
            });
            if (quiz) targetName = quiz.title;
          }
          // Nếu entity là User, lấy email
          if (r.entityType === 'User') {
            const user = await this.prisma.user.findUnique({
              where: { id: r.entityId },
              select: { email: true, fullName: true },
            });
            if (user) targetName = user.email || user.fullName || r.entityId;
          }
        } catch { }

        return {
          id: r.id,
          type: r.entityType.toLowerCase() as 'quiz' | 'user',
          reason: r.reason,
          targetId: r.entityId,
          targetName,
          reportedBy: reporterEmail,
          status: r.status as ReportStatus,
          createdAt: r.createdAt.toISOString(),
        };
      })
    );

    return enriched;
  }

  async create(reporterId: string, entityType: string, entityId: string, reason: string) {
    const report = await this.prisma.report.create({
      data: { reporterId, entityType, entityId, reason, status: 'PENDING' },
    });
    this.logger.log(`[Report] New report: ${entityType}/${entityId} by ${reporterId} — ${reason}`);
    return report;
  }

  async updateStatus(id: string, status: ReportStatus) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException(`Report ${id} not found`);

    return this.prisma.report.update({
      where: { id },
      data: { status },
    });
  }
}
