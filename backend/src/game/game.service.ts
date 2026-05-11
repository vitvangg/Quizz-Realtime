import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RoomStatus } from '../../generated/prisma/enums';
import { AnswerPayload } from '../redis/interfaces';
import { ActiveQuestion } from './interfaces/event-payloads.interface';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  // In-memory cache for active questions (per instance)
  // Key: roomId, Value: ActiveQuestion
  private activeQuestions = new Map<string, ActiveQuestion>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============================================================================
  // ROOM VERIFICATION
  // ============================================================================

  /**
   * Xác thực host và lấy thông tin room
   */
  async verifyAndGetHostRoom(roomId: string, userId?: string) {
    try {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        include: {
          quiz: {
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
          players: {
            orderBy: { joinedAt: 'asc' },
          },
          host: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (!room) {
        return {
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found',
          },
        };
      }

      // Nếu có userId, verify host
      if (userId && room.hostId !== userId) {
        return {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You are not the host of this room',
          },
        };
      }

      return {
        success: true,
        room,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        },
      };
    }
  }

  // ============================================================================
  // PLAYER JOIN/LEAVE
  // ============================================================================

  /**
   * Player tham gia phòng qua PIN
   */
  async joinRoom(pin: string, nickname: string) {
    try {
      const room = await this.prisma.room.findUnique({
        where: { pin },
        include: { players: true },
      });

      if (!room) {
        return {
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: 'No room found with this PIN',
          },
        };
      }

      if (room.status !== RoomStatus.WAITING) {
        return {
          success: false,
          error: {
            code: 'ROOM_NOT_WAITING',
            message: 'Room is not accepting players',
          },
        };
      }

      // Check nickname uniqueness (case-insensitive)
      const existingPlayer = room.players.find(
        (p) => p.nickname.toLowerCase() === nickname.toLowerCase(),
      );
      if (existingPlayer) {
        return {
          success: false,
          error: {
            code: 'NICKNAME_TAKEN',
            message: 'This nickname is already taken in this room',
          },
        };
      }

      // Check room capacity
      const maxPlayers = 50;
      if (room.players.length >= maxPlayers) {
        return {
          success: false,
          error: {
            code: 'ROOM_FULL',
            message: 'Room is full',
          },
        };
      }

      // Create player
      const player = await this.prisma.player.create({
        data: {
          roomId: room.id,
          nickname,
        },
      });

      // Get updated room with players
      const updatedRoom = await this.prisma.room.findUnique({
        where: { id: room.id },
        include: {
          quiz: {
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
          players: {
            orderBy: { joinedAt: 'asc' },
          },
          host: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      return {
        success: true,
        player,
        room: updatedRoom,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'JOIN_ERROR',
          message: error.message,
        },
      };
    }
  }

  /**
   * Player rời phòng
   */
  async leaveRoom(playerId: string, roomId?: string) {
    try {
      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
      });

      if (!player) {
        return {
          success: false,
          error: {
            code: 'PLAYER_NOT_FOUND',
            message: 'Player not found',
          },
        };
      }

      // Verify roomId if provided
      if (roomId && player.roomId !== roomId) {
        return {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Player is not in this room',
          },
        };
      }

      await this.prisma.player.delete({
        where: { id: playerId },
      });

      return {
        success: true,
        player,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'LEAVE_ERROR',
          message: error.message,
        },
      };
    }
  }

  /**
   * Host kick player khỏi phòng
   */
  async kickPlayer(playerId: string, roomId: string, hostId?: string) {
    try {
      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
        include: { room: true },
      });

      if (!player) {
        return {
          success: false,
          error: {
            code: 'PLAYER_NOT_FOUND',
            message: 'Player not found',
          },
        };
      }

      if (player.roomId !== roomId) {
        return {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Player is not in this room',
          },
        };
      }

      // Nếu có hostId, verify
      if (hostId && player.room.hostId !== hostId) {
        return {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Only host can kick players',
          },
        };
      }

      await this.prisma.player.delete({
        where: { id: playerId },
      });

      return {
        success: true,
        player,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'KICK_ERROR',
          message: error.message,
        },
      };
    }
  }

  // ============================================================================
  // GAME START/END
  // ============================================================================

  /**
   * Host bắt đầu game
   */
  async startGame(roomId: string, hostId: string) {
    try {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        include: {
          quiz: {
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
          players: true,
        },
      });

      if (!room) {
        return {
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found',
          },
        };
      }

      if (room.hostId !== hostId) {
        return {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Only host can start the game',
          },
        };
      }

      if (room.status !== RoomStatus.WAITING) {
        return {
          success: false,
          error: {
            code: 'ROOM_NOT_WAITING',
            message: 'Room is not in waiting status',
          },
        };
      }

      if (room.players.length === 0) {
        return {
          success: false,
          error: {
            code: 'NO_PLAYERS',
            message: 'Need at least one player to start',
          },
        };
      }

      // Update room status to PLAYING
      const updatedRoom = await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.PLAYING },
      });

      // Create game session
      const session = await this.prisma.gameSession.create({
        data: {
          roomId,
          status: RoomStatus.PLAYING,
        },
        include: {
          room: {
            include: {
              quiz: {
                include: {
                  questions: {
                    orderBy: { orderIndex: 'asc' },
                  },
                },
              },
              players: {
                orderBy: { joinedAt: 'asc' },
              },
              host: {
                select: {
                  id: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      return {
        success: true,
        session,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'START_ERROR',
          message: error.message,
        },
      };
    }
  }

  /**
   * Host kết thúc game
   */
  async endGame(roomId: string, hostId: string) {
    try {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!room) {
        return {
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found',
          },
        };
      }

      if (room.hostId !== hostId) {
        return {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Only host can end the game',
          },
        };
      }

      // Update room status
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.FINISHED },
      });

      // Update any active session
      await this.prisma.gameSession.updateMany({
        where: { roomId, endedAt: null },
        data: {
          status: RoomStatus.FINISHED,
          endedAt: new Date(),
        },
      });

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'END_ERROR',
          message: error.message,
        },
      };
    }
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  /**
   * Lấy thông tin room theo PIN hoặc roomId
   */
  async getRoomInfo(pin?: string, roomId?: string) {
    try {
      let room;

      if (roomId) {
        room = await this.prisma.room.findUnique({
          where: { id: roomId },
          include: {
            quiz: {
              include: {
                questions: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
            players: {
              orderBy: { joinedAt: 'asc' },
            },
            host: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });
      } else if (pin) {
        room = await this.prisma.room.findUnique({
          where: { pin },
          include: {
            quiz: {
              include: {
                questions: {
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
            players: {
              orderBy: { joinedAt: 'asc' },
            },
            host: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });
      } else {
        return {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Must provide pin or roomId',
          },
        };
      }

      if (!room) {
        return {
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found',
          },
        };
      }

      return {
        success: true,
        room,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        },
      };
    }
  }

  // ============================================================================
  // ACTIVE QUESTION MANAGEMENT (for real-time game)
  // ============================================================================

  /**
   * Set active question cho một room
   */
  async setActiveQuestion(
    roomId: string,
    sessionId: string,
    questionId: string,
    questionIndex: number,
    durationMs: number,
  ): Promise<void> {
    this.activeQuestions.set(roomId, {
      sessionId,
      questionId,
      questionIndex,
      startedAt: Date.now(),
      durationMs,
    });

    // Initialize player scores in Redis leaderboard
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { players: true },
    });

    if (room) {
      for (const player of room.players) {
        await this.redis.initPlayerScore(sessionId, player.id, 0);
      }
    }
  }

  /**
   * Get active question của một room
   */
  async getActiveQuestion(roomId: string): Promise<ActiveQuestion | null> {
    return this.activeQuestions.get(roomId) || null;
  }

  /**
   * Clear active question
   */
  clearActiveQuestion(roomId: string): void {
    this.activeQuestions.delete(roomId);
  }

  // ============================================================================
  // ANSWER PROCESSING
  // ============================================================================

  /**
   * Flush buffered answers và tính điểm
   */
  async flushAnswersAndCalculateScores(
    sessionId: string,
    questionId: string,
    correctAnswerId: string,
    bufferedAnswers: AnswerPayload[],
  ): Promise<Array<{ playerId: string; score: number; isCorrect: boolean; responseTimeMs: number }>> {
    const results: Array<{ playerId: string; score: number; isCorrect: boolean; responseTimeMs: number }> = [];

    for (const answer of bufferedAnswers) {
      const isCorrect = answer.answerId === correctAnswerId;
      
      // Score formula: BASE_SCORE - (elapsedMs / 10), min 100
      const scoreEarned = isCorrect
        ? Math.max(100, 1000 - Math.floor(answer.responseTimeMs / 10))
        : 0;

      results.push({
        playerId: answer.playerId,
        score: scoreEarned,
        isCorrect,
        responseTimeMs: answer.responseTimeMs,
      });

      // Update Redis leaderboard
      if (isCorrect) {
        await this.redis.updateScore(sessionId, answer.playerId, scoreEarned);
      }
    }

    this.logger.log(
      `Processed ${results.length} answers for question ${questionId}: ` +
      `${results.filter((r) => r.isCorrect).length} correct, ` +
      `${results.filter((r) => !r.isCorrect).length} wrong`,
    );

    return results;
  }

  /**
   * Enrich leaderboard với player info
   */
  async enrichLeaderboard(
    topScores: Array<{ playerId: string; score: number }>,
  ): Promise<Array<{ playerId: string; nickname: string; score: number; rank: number }>> {
    if (topScores.length === 0) return [];

    const playerIds = topScores.map((s) => s.playerId);
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, nickname: true },
    });

    const playerMap = new Map(players.map((p) => [p.id, p.nickname]));

    return topScores.map((score, index) => ({
      playerId: score.playerId,
      nickname: playerMap.get(score.playerId) || 'Unknown',
      score: score.score,
      rank: index + 1,
    }));
  }

  /**
   * Lấy kết quả cuối cùng của game
   */
  async getGameResults(sessionId: string): Promise<{
    leaderboard: Array<{ playerId: string; nickname: string; score: number; rank: number }>;
    totalPlayers: number;
    totalQuestions: number;
  }> {
    // Get top 100 from Redis
    const topScores = await this.redis.getTopScores(sessionId, 100);
    const enriched = await this.enrichLeaderboard(topScores);

    // Get session info
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        room: {
          include: { 
            players: true,
            quiz: { include: { questions: true } } 
          },
        },
      },
    });

    return {
      leaderboard: enriched,
      totalPlayers: session?.room?.players?.length || 0,
      totalQuestions: session?.room?.quiz?.questions?.length || 0,
    };
  }
}
