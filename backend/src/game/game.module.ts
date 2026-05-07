import { Module, forwardRef } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { RoomService } from '../room/room.service';
import { GameSessionService } from '../admin/game-session/game-session.service';

@Module({
  providers: [GameGateway, GameService, RoomService, GameSessionService],
  exports: [GameGateway, GameService],
})
export class GameModule {}
