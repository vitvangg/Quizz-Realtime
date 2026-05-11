import { Injectable, Logger } from '@nestjs/common';
import { GameService } from '../game.service';
import { GetRoomInfoPayload } from '../interfaces/event-payloads.interface';

@Injectable()
export class UtilityHandler {
  private readonly logger = new Logger(UtilityHandler.name);

  constructor(private readonly gameService: GameService) {}

  async handleGetRoomInfo(payload: GetRoomInfoPayload) {
    const result = await this.gameService.getRoomInfo(payload.pin, payload.roomId);

    if (!result.success) {
      return {
        event: 'room:info',
        data: result,
        error: true,
      };
    }

    return {
      event: 'room:info',
      data: result,
    };
  }
}
