import { Module } from '@nestjs/common';
import { PlayerPresenceService } from '../game/player-presence.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [PlayerPresenceService],
  exports: [PlayerPresenceService],
})
export class PresenceModule {}
