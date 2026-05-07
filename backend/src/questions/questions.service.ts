import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class QuestionsService {
  constructor(private readonly prismaService: PrismaService) {}

  async checkQuestionOwner(questionId: string, userId: string) {
    const question = await this.prismaService.question.findUnique({
      where: { id: questionId },
      select: {
        quiz: {
          select: {
            createdBy: true,
          },
        },
      },
    });

    if (!question) throw new NotFoundException('khong ton tai quétion');

    if (question.quiz.createdBy !== userId) {
      throw new ForbiddenException('not alloewd');
    }
  }

  async create(createQuestionDto: CreateQuestionDto, userId: string) {
    const quiz = await this.prismaService.quiz.findUnique({
      where: { id: createQuestionDto.quizId },
      select: { createdBy: true },
    });

    if (!quiz) throw new NotFoundException('Quiz not found');

    if (quiz.createdBy !== userId) {
      throw new ForbiddenException('not allowed');
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
      orderBy: { orderIndex: 'desc' },
      include: { answers: true },
    });
  }

  findByQuizId(quizId: string) {
    return this.prismaService.question.findMany({
      where: { quizId },
      orderBy: { orderIndex: 'desc' },
      include: { answers: true },
    });
  }

  findOne(id: string) {
    return this.prismaService.question.findUnique({
      where: { id },
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
      where: { id },
      data: {
        ...updateQuestionDto,
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.checkQuestionOwner(id, userId);
    
    // 1. Xóa tất cả Answers của câu hỏi này trước
    await this.prismaService.answer.deleteMany({
      where: { questionId: id }
    });

    // 2. Sau đó mới xóa Question
    return this.prismaService.question.delete({
      where: { id },
    });
  }
}
