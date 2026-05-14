import { Controller, Get, Param, Query } from '@nestjs/common';
import { GameSessionService } from './game-session.service';

@Controller('games')
export class GameController {
  constructor(private readonly gameSessionService: GameSessionService) {}

  /**
   * Authoritative game state endpoint — used by GamePage as fallback when socket
   * events are missed after navigation. Returns full state including current
   * question data and computed remaining time.
   */
  @Get(':sessionId/state')
  async getGameState(@Param('sessionId') sessionId: string) {
    return this.gameSessionService.getFullGameState(sessionId);
  }

  /**
   * Lấy danh sách questionIds mà player đã trả lời trong session
   * Dùng để khôi phục trạng thái hasAnswered khi reload
   */
  @Get(':sessionId/answered-questions')
  async getPlayerAnsweredQuestions(
    @Param('sessionId') sessionId: string,
    @Query('playerId') playerId: string,
  ) {
    const answeredQuestions = await this.gameSessionService.getPlayerAnsweredQuestions(sessionId, playerId);
    return { answeredQuestions };
  }
}
