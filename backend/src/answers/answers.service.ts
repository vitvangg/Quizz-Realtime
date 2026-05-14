import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateAnswerDto } from './dto/create-answer.dto';
import { UpdateAnswerDto } from './dto/update-answer.dto';

import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AnswersService {
  constructor(private readonly prismaService: PrismaService) { }

  async checkAnswerOwner(answerId: string, userId: string) {
    const answer = await this.prismaService.answer.findFirst({
      where: {
        id: answerId,
        deletedAt: null,
      },
      select: {
        question: {
          select: {
            quiz: {
              select: {
                createdBy: true,
              },
            },
          },
        },
      },
    });

    if (!answer) {
      throw new NotFoundException('Answer not found');
    }

    if (answer.question.quiz.createdBy !== userId) {
      throw new ForbiddenException('Not allowed');
    }
  }

  // CHECK OWNER QUA QUESTION
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

  async create(createAnswerDto: CreateAnswerDto, userId: string) {
    await this.checkQuestionOwner(
      createAnswerDto.questionId,
      userId,
    );

    return this.prismaService.answer.create({
      data: {
        questionId: createAnswerDto.questionId,
        content: createAnswerDto.content,
        isCorrect: createAnswerDto.isCorrect,
      },
    });
  }

  async findByQuestionId(questionId: string, userId: string) {
    await this.checkQuestionOwner(questionId, userId);

    return this.prismaService.answer.findMany({
      where: {
        questionId,
        deletedAt: null,
      },
    });
  }

  findOne(id: string) {
    return this.prismaService.answer.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  async update(
    id: string,
    updateAnswerDto: UpdateAnswerDto,
    userId: string,
  ) {
    await this.checkAnswerOwner(id, userId);

    const answer = await this.findOne(id);

    if (!answer) {
      throw new NotFoundException('Answer not found');
    }

    return this.prismaService.answer.update({
      where: {
        id,
      },
      data: {
        ...updateAnswerDto,
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.checkAnswerOwner(id, userId);

    const answer = await this.findOne(id);

    if (!answer) {
      throw new NotFoundException('Answer not found');
    }

    // SOFT DELETE
    return this.prismaService.answer.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}