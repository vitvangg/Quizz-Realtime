import { Injectable } from '@nestjs/common';
import { CreateSessionDto } from './dto/create-session.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SessionService {
  constructor(private readonly prismaService: PrismaService) {}

  async createSession(userId: string, refreshToken: string, expiresAt: Date) {
    return this.prismaService.authSession.create({
      data: {
        userId,
        refreshToken,
        expiresAt,
      },
    });
  }

  async findSessionByToken(refreshToken: string) {
    return this.prismaService.authSession.findFirst({
      where: { refreshToken },
    });
  }

  async deleteSession(refreshToken: string) {
    return this.prismaService.authSession.deleteMany({
      where: { refreshToken },
    });
  }

  async updateSessionToken(sessionId: string, refreshToken: string) {
    return this.prismaService.authSession.update({
      where: { id: sessionId },
      data: { refreshToken },
    });
  }
}
