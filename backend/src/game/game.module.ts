import { Module } from '@nestjs/common';
import { GameSessionService } from './game-session.service';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';
import { PlayerCacheService } from './player-cache.service';
import { AnswerQueueService } from './answer-queue.service';
import { AnswerBatchService } from './answer-batch.service';
import { RoomModule } from '../room/room.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RoomModule, PrismaModule, RedisModule, AuthModule],
  controllers: [GameController],
  providers: [
    GameSessionService,
    GameGateway,
    PlayerCacheService,
    AnswerQueueService,
    AnswerBatchService,
  ],
  exports: [
    GameSessionService,
    GameGateway,
    PlayerCacheService,
    AnswerQueueService,
    AnswerBatchService,
  ],
})
export class GameModule {}
