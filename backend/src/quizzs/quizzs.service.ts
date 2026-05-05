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
    });
  }

  findOne(id: string) {
    return this.prismaService.quiz.findUnique({
      where: { id },
    });
  }

  async update(id: string, updateQuizzDto: UpdateQuizzDto, userId: string) {
    const quiz = await this.findOne(id);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.createdBy !== userId) {
      throw new ForbiddenException();
    }

    return this.prismaService.quiz.update({
      where: { id },
      data: {
        ...updateQuizzDto,
      },
    });
  }

  async remove(id: string, userId: string) {
    const quiz = await this.findOne(id);
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.createdBy !== userId) {
      throw new ForbiddenException();
    }

    return this.prismaService.quiz.delete({
      where: { id },
    });
  }
}
