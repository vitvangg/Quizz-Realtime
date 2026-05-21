import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuthModule } from '../../../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
