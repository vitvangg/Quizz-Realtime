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
  constructor(private readonly prismaService: PrismaService) {}

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
      where: { createdBy: userId },
      include: {
        questions: {
          include: { answers: true },
        },
      },
    });
  }

  findOne(id: string) {
    return this.prismaService.quiz.findUnique({
      where: { id },
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
      throw new ForbiddenException('not alowed');
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
    // No need to fetch questions here as cascade handles their deletion.
    const quiz = await this.prismaService.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.createdBy !== userId) {
      throw new ForbiddenException('not allowed');
    }

    // The cascade delete will handle questions and answers.
    // Transaction is still good practice for atomicity of the final quiz delete.
    return this.prismaService.$transaction(async (tx) => {
      return tx.quiz.delete({
        where: { id },
      });
    });
  }
}
