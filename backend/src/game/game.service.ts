import { Injectable } from '@nestjs/common';
import { RoomService } from '../room/room.service';
import { GameSessionService } from '../admin/game-session/game-session.service';

@Injectable()
export class GameService {
  constructor(
    private readonly roomService: RoomService,
    private readonly gameSessionService: GameSessionService,
  ) {}

  // Handle player joining room via WebSocket
  async handleJoinRoom(pin: string, nickname: string) {
    try {
      const player = await this.roomService.joinRoom(pin, nickname);
      const room = await this.roomService.findByPin(pin);
      return {
        success: true,
        player,
        room,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Handle player leaving room
  async handleLeaveRoom(playerId: string) {
    try {
      const player = await this.roomService.leaveRoom(playerId);
      return {
        success: true,
        playerId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Handle host kicking player
  async handleKickPlayer(playerId: string, hostId: string) {
    try {
      await this.roomService.kickPlayer(playerId, hostId);
      return {
        success: true,
        playerId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Handle host starting game
  async handleStartGame(roomId: string, userId: string) {
    try {
      const session = await this.gameSessionService.create({ roomId });
      return {
        success: true,
        session,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Get room info for socket room
  async getRoomInfo(pin: string) {
    try {
      const room = await this.roomService.findByPin(pin);
      return {
        success: true,
        room,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
