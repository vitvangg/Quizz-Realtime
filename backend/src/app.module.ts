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
import { RoleModule } from './admin/it/role/role.module';
import { PermissionModule } from './admin/it/permission/permission.module';
import { UserModule as AdminUserModule } from './admin/it/user/user.module';
import { QuizModule } from './admin/it/quiz/quiz.module';
import { AuditLogModule } from './admin/system/audit-log/audit-log.module';
import { GameSessionModule } from './admin/system/game-session/game-session.module';
import { ReportModule } from './admin/system/report/report.module';
import { NotificationModule } from './admin/system/notification/notification.module';
import { SettingModule } from './admin/system/setting/setting.module';
import { AnalyticsModule } from './admin/system/analytics/analytics.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { QuizzsModule } from './quizzs/quizzs.module';
import { QuestionsModule } from './questions/questions.module';
import { GameModule } from './game/game.module';
import { AnswersModule } from './answers/answers.module';
import { RedisModule } from './redis/redis.module';
import { DashboardModule } from './admin/system/dashboard/dashboard.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RedisModule,
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    ClientUserModule,
    SessionModule,
    RoomModule,
    GameModule,
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
    GameModule,
    RedisModule,
    DashboardModule,
    CloudinaryModule,
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
