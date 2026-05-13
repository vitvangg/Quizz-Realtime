import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateQuizzDto } from './dto/create-quizz.dto';
import { UpdateQuizzDto } from './dto/update-quizz.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class QuizzsService {
  constructor(private readonly prismaService: PrismaService) { }

  create(createQuizzDto: CreateQuizzDto, userId: string) {
    return this.prismaService.quiz.create({
      data: {
        title: createQuizzDto.title,
        createdBy: userId,
      },
    });
  }

  findAll() {
    return this.prismaService.quiz.findMany({
      where: { deletedAt: null },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        questions: {
          include: { answers: true },
        },
      },
    });
  }

  findByUserId(userId: string) {
    return this.prismaService.quiz.findMany({
      where: { createdBy: userId, deletedAt: null },
      include: {
        questions: {
          include: { answers: true },
        },
      },
    });
  }

  search(q: string, userId: string) {
    return this.prismaService.quiz.findMany({
      where: {
        createdBy: userId,
        deletedAt: null,

        OR: [
          {
            title: {
              contains: q,
              mode: "insensitive",
            },
          },

          {
            questions: {
              some: {
                content: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            },
          },
        ],
      },

      include: {
        questions: {
          include: {
            answers: true,
          },
        },
      },
    });
  }

  findOne(id: string) {
    return this.prismaService.quiz.findFirst({
      where: { id, deletedAt: null },
      include: {
        questions: {
          include: {
            answers: true
          }
        }
      }
    });
  }

  async update(id: string, updateQuizzDto: UpdateQuizzDto, userId: string) {
    const quiz = await this.findOne(id);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.createdBy !== userId) {
      throw new ForbiddenException('not allowed');
    }

    return this.prismaService.quiz.update({
      where: { id },
      data: {
        ...updateQuizzDto,
      },
    });
  }

  async remove(id: string, userId: string) {
    // Fetch quiz to check ownership and existence.
    const quiz = await this.prismaService.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.createdBy !== userId) {
      throw new ForbiddenException('not allowed');
    }

    // Use soft delete instead of hard delete to avoid foreign key constraint violations
    // and preserve game history (rooms, player answers).
    return this.prismaService.quiz.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
