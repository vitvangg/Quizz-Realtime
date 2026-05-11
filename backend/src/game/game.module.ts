import { Module } from '@nestjs/common';
import { GameSessionService } from './game-session.service';
import { GameGateway } from './game.gateway';
import { RoomModule } from '../room/room.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RoomModule, PrismaModule, AuthModule],
  providers: [GameSessionService, GameGateway],
  exports: [GameSessionService, GameGateway],
})
export class GameModule {}
