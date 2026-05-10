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
    const quiz = await this.findOne(id);
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.createdBy !== userId) {
      throw new ForbiddenException('not alowed');
    }

    // Xóa thủ công theo thứ tự: Answers -> Questions -> Quiz
    // 1. Lấy danh sách ID câu hỏi
    const questions = await this.prismaService.question.findMany({
      where: { quizId: id },
      select: { id: true }
    });
    const questionIds = questions.map(q => q.id);

    // 2. Xóa tất cả câu trả lời của các câu hỏi đó
    await this.prismaService.answer.deleteMany({
      where: { questionId: { in: questionIds } }
    });

    // 3. Xóa các câu hỏi
    await this.prismaService.question.deleteMany({
      where: { quizId: id }
    });

    // 4. Cuối cùng mới xóa Quiz
    return this.prismaService.quiz.delete({
      where: { id },
    });
  }
}
