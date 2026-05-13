import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRoomDto, RoomStatus } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';

@Injectable()
export class RoomService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createRoomDto: CreateRoomDto, userId: string) {
    const { quizId, pin: providedPin } = createRoomDto;

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { include: { answers: true } } },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (quiz.deletedAt) {
      throw new BadRequestException('Quiz has been deleted');
    }

    if (quiz.createdBy !== userId) {
      throw new ForbiddenException('You do not own this quiz');
    }

    if (!quiz.questions || quiz.questions.length === 0) {
      throw new BadRequestException('Quiz has no questions');
    }

    const pin = providedPin || (await this.generateUniquePin());

    const room = await this.prisma.room.create({
      data: {
        pin,
        quizId,
        hostId: userId,
        status: RoomStatus.WAITING,
      },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            questions: {
              select: {
                id: true,
                content: true,
                timeLimit: true,
                orderIndex: true,
              },
            },
          },
        },
        host: {
          select: {
            id: true,
            email: true,
          },
        },
        players: {
          select: {
            id: true,
            nickname: true,
            joinedAt: true,
          },
        },
      },
    });

    return room;
  }

  async findAll() {
    return this.prisma.room.findMany({
      where: { status: RoomStatus.WAITING },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
          },
        },
        players: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        quiz: {
          include: {
            questions: {
              include: { answers: true },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        host: {
          select: {
            id: true,
            email: true,
          },
        },
        players: {
          select: {
            id: true,
            nickname: true,
            joinedAt: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async findByPin(pin: string) {
    const room = await this.prisma.room.findUnique({
      where: { pin },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            questions: {
              select: {
                id: true,
                content: true,
                timeLimit: true,
                orderIndex: true,
                answers: {
                  select: {
                    id: true,
                    content: true,
                  },
                },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        host: {
          select: {
            id: true,
            email: true,
          },
        },
        players: {
          select: {
            id: true,
            nickname: true,
            joinedAt: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async joinRoom(joinRoomDto: JoinRoomDto) {
    const { pin, nickname } = joinRoomDto;

    const room = await this.prisma.room.findUnique({
      where: { pin },
      include: { players: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException('Game already started or finished');
    }

    const existingPlayer = room.players.find(
      (p) => p.nickname.toLowerCase() === nickname.toLowerCase(),
    );
    if (existingPlayer) {
      throw new ConflictException('Nickname already taken');
    }

    const player = await this.prisma.player.create({
      data: {
        roomId: room.id,
        nickname,
      },
      select: {
        id: true,
        nickname: true,
        joinedAt: true,
      },
    });

    const updatedRoom = await this.findOne(room.id);

    return {
      room: updatedRoom,
      player,
    };
  }

  async leaveRoom(roomId: string, playerId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { players: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      throw new NotFoundException('Player not in this room');
    }

    if (room.hostId === playerId) {
      if (room.status === RoomStatus.WAITING && room.players.length > 1) {
        const newHost = room.players.find((p) => p.id !== playerId);
        if (newHost) {
          await this.prisma.room.update({
            where: { id: roomId },
            data: { hostId: newHost.id },
          });
        }
      } else {
        await this.prisma.room.update({
          where: { id: roomId },
          data: { status: RoomStatus.FINISHED },
        });
      }
    }

    await this.prisma.player.delete({
      where: { id: playerId },
    });

    const updatedRoom = await this.findOne(roomId);

    return {
      room: updatedRoom,
      leftPlayerId: playerId,
    };
  }

  async updateHost(roomId: string, newHostId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const player = await this.prisma.player.findFirst({
      where: { id: newHostId, roomId },
    });

    if (!player) {
      throw new NotFoundException('Player not in this room');
    }

    return this.prisma.room.update({
      where: { id: roomId },
      data: { hostId: newHostId },
    });
  }

  async updateStatus(roomId: string, status: RoomStatus) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return this.prisma.room.update({
      where: { id: roomId },
      data: { status },
    });
  }

  async getPlayers(roomId: string) {
    return this.prisma.player.findMany({
      where: { roomId },
      select: {
        id: true,
        nickname: true,
        joinedAt: true,
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addPlayerToRoom(roomId: string, nickname: string) {
    return this.prisma.player.create({
      data: {
        roomId,
        nickname,
      },
      select: {
        id: true,
        nickname: true,
        joinedAt: true,
      },
    });
  }

  async update(
    id: string,
    updateRoomDto: UpdateRoomDto,
    userId: string,
  ) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.hostId !== userId) {
      throw new ForbiddenException('Only host can update room');
    }
    return this.prisma.room.update({
      where: { id },
      data: updateRoomDto as any,
    });
  }

  async remove(id: string, userId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.hostId !== userId) {
      throw new ForbiddenException('Only host can delete room');
    }

    return this.prisma.room.delete({
      where: { id },
    });
  }

  private async generateUniquePin(): Promise<string> {
    let pin: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      pin = Math.random().toString().slice(2, 8).padStart(6, '0');
      const exists = await this.prisma.room.findUnique({ where: { pin } });
      if (!exists) return pin;
      attempts++;
    } while (attempts < maxAttempts);

    throw new Error('Failed to generate unique PIN');
  }
}
