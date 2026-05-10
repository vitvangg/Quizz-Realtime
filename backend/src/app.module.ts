import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule as ClientUserModule } from './user/user.module';
import { SessionModule } from './session/session.module';
import { RoomModule } from './room/room.module';
import { RoleModule } from './admin/role/role.module';
import { PermissionModule } from './admin/permission/permission.module';
import { UserModule as AdminUserModule } from './admin/user/user.module';
import { QuizModule } from './admin/quiz/quiz.module';
import { AuditLogModule } from './admin/audit-log/audit-log.module';
import { GameSessionModule } from './admin/game-session/game-session.module';
import { ReportModule } from './admin/report/report.module';
import { NotificationModule } from './admin/notification/notification.module';
import { SettingModule } from './admin/setting/setting.module';
import { AnalyticsModule } from './admin/analytics/analytics.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { QuizzsModule } from './quizzs/quizzs.module';
import { QuestionsModule } from './questions/questions.module';
import { AnswersModule } from './answers/answers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    ClientUserModule,
    SessionModule,
    RoomModule,
    RoleModule,
    PermissionModule,
    AdminUserModule,
    QuizModule,
    AuditLogModule,
    GameSessionModule,
    ReportModule,
    NotificationModule,
    SettingModule,
    AnalyticsModule,
    QuizzsModule,
    QuestionsModule,
    AnswersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService, 
    PrismaService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    }
  ],
})
export class AppModule {}
