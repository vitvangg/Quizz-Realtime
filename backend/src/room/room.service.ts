import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { RoomStatus } from '../../generated/prisma/enums';

@Injectable()
export class RoomService {
  constructor(private readonly prisma: PrismaService) { }

  private generatePin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Tạo phòng mới
  async create(createRoomDto: CreateRoomDto, userId: string) {
    let pin: string;
    do {
      pin = this.generatePin();
    } while (await this.prisma.room.findUnique({ where: { pin } }));

    return this.prisma.room.create({
      data: {
        pin,
        quizId: createRoomDto.quizId,
        hostId: userId,
        status: RoomStatus.WAITING,
      },
      include: {
        quiz: true,
        players: true,
      },
    });
  }

  // Lấy phòng theo PIN (public)
  async findByPin(pin: string) {
    const room = await this.prisma.room.findUnique({
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

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  // Lấy phòng theo ID
  async findById(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        quiz: true,
        players: true,
        host: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  // Lấy tất cả phòng của một user (host)
  async findByHostId(hostId: string) {
    return this.prisma.room.findMany({
      where: { hostId },
      include: {
        quiz: true,
        players: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Tham gia phòng (Player không cần auth)
  async joinRoom(pin: string, nickname: string) {
    const room = await this.prisma.room.findUnique({
      where: { pin },
      include: { players: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException('Room is not accepting players');
    }

    // Check if nickname already exists in room
    const existingPlayer = room.players.find(
      (p) => p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (existingPlayer) {
      throw new BadRequestException('Nickname already taken in this room');
    }

    // Check if room is full (default max 50)
    const maxPlayers = 50;
    if (room.players.length >= maxPlayers) {
      throw new BadRequestException('Room is full');
    }

    return this.prisma.player.create({
      data: {
        roomId: room.id,
        nickname,
      },
    });
  }

  // Rời phòng
  async leaveRoom(playerId: string) {
    return this.prisma.player.delete({
      where: { id: playerId },
    });
  }

  // Đá player khỏi phòng (Host only)
  async kickPlayer(playerId: string, hostId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { room: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    if (player.room.hostId !== hostId) {
      throw new ForbiddenException('Only host can kick players');
    }

    return this.prisma.player.delete({
      where: { id: playerId },
    });
  }

  // Lấy players trong phòng
  async getPlayers(roomId: string) {
    return this.prisma.player.findMany({
      where: { roomId },
      orderBy: { joinedAt: 'asc' },
    });
  }

  // Cập nhật trạng thái phòng
  async updateStatus(id: string, status: RoomStatus, userId?: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // If userId provided, verify host
    if (userId && room.hostId !== userId) {
      throw new ForbiddenException('Only host can update room');
    }

    return this.prisma.room.update({
      where: { id },
      data: { status },
      include: {
        players: true,
        quiz: true,
      },
    });
  }

  async remove(id: string, userId?: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Verify host if userId provided
    if (userId && room.hostId !== userId) {
      throw new ForbiddenException('Only host can delete room');
    }

    // Delete all players first
    await this.prisma.player.deleteMany({ where: { roomId: id } });

    // Delete all game sessions in this room
    const sessions = await this.prisma.gameSession.findMany({
      where: { roomId: id },
      select: { id: true },
    });

    for (const session of sessions) {
      await this.prisma.playerSession.deleteMany({
        where: { sessionId: session.id },
      });
    }

    await this.prisma.gameSession.deleteMany({ where: { roomId: id } });

    return this.prisma.room.delete({
      where: { id },
    });
  }

  async update(id: string, updateRoomDto: UpdateRoomDto) {
    return this.prisma.room.update({
      where: { id },
      data: updateRoomDto,
    });
  }
}
