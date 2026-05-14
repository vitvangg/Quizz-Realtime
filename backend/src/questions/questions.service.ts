import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class QuestionsService {
  constructor(private readonly prismaService: PrismaService) { }

  async checkQuestionOwner(questionId: string, userId: string) {
    const question = await this.prismaService.question.findFirst({
      where: {
        id: questionId,
        deletedAt: null,
      },
      select: {
        quiz: {
          select: {
            createdBy: true,
          },
        },
      },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (question.quiz.createdBy !== userId) {
      throw new ForbiddenException('Not allowed');
    }
  }

  async create(createQuestionDto: CreateQuestionDto, userId: string) {
    const quiz = await this.prismaService.quiz.findFirst({
      where: {
        id: createQuestionDto.quizId,
        deletedAt: null,
      },
      select: {
        createdBy: true,
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (quiz.createdBy !== userId) {
      throw new ForbiddenException('Not allowed');
    }

    return this.prismaService.question.create({
      data: {
        quizId: createQuestionDto.quizId,
        content: createQuestionDto.content,
        timeLimit: createQuestionDto.timeLimit,
        orderIndex: createQuestionDto.orderIndex,
      },
    });
  }

  findAll() {
    return this.prismaService.question.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        orderIndex: 'asc',
      },
      include: {
        answers: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            content: 'asc',
          },
        },
      },
    });
  }

  findByQuizId(quizId: string) {
    return this.prismaService.question.findMany({
      where: {
        quizId,
        deletedAt: null,
      },
      orderBy: {
        orderIndex: 'asc',
      },
      include: {
        answers: {
          where: {
            deletedAt: null,
          },
        },
      },
    });
  }

  findOne(id: string) {
    return this.prismaService.question.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        answers: {
          where: {
            deletedAt: null,
          },
        },
      },
    });
  }

  async update(
    id: string,
    updateQuestionDto: UpdateQuestionDto,
    userId: string,
  ) {
    await this.checkQuestionOwner(id, userId);

    const question = await this.findOne(id);

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return this.prismaService.question.update({
      where: {
        id,
      },
      data: {
        ...updateQuestionDto,
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.checkQuestionOwner(id, userId);

    // Soft delete all answers
    await this.prismaService.answer.updateMany({
      where: {
        questionId: id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // Soft delete question
    return this.prismaService.question.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}