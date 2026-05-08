import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { RoomHandler } from './handlers/room.handler';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [
    GameGateway,
    GameService,
    RoomHandler,
  ],
  exports: [GameGateway, GameService],
})
export class GameModule {}
