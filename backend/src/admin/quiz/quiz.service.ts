import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) { }

  async create(createQuizDto: CreateQuizDto) {
    const { title, createdBy, questions } = createQuizDto;

    return this.prisma.quiz.create({
      data: {
        title,
        createdBy,
        questions: {
          create: questions.map(q => ({
            content: q.content,
            timeLimit: q.timeLimit,
            orderIndex: q.orderIndex,
            answers: {
              create: q.answers.map(a => ({
                content: a.content,
                isCorrect: a.isCorrect
              }))
            }
          }))
        }
      },
      include: {
        questions: {
          include: { answers: true }
        }
      }
    });
  }

  async findAll() {
    return this.prisma.quiz.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: { questions: true }
        },
        user: {
          select: { email: true }
        }
      }
    });
  }

  async findOne(id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id, deletedAt: null },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { answers: true }
        }
      }
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    return quiz;
  }

  async update(id: string, updateQuizDto: UpdateQuizDto) {
    const { title, questions } = updateQuizDto;

    // For a real production app, updating nested questions/answers requires careful sync 
    // (upsert, delete missing, etc.). For simplicity here, we can delete old ones and recreate, 
    // or just update title if questions are not provided.

    if (questions) {
      // Simplistic approach: delete all existing questions and recreate
      await this.prisma.question.deleteMany({ where: { quizId: id } });

      return this.prisma.quiz.update({
        where: { id },
        data: {
          title,
          questions: {
            create: questions.map(q => ({
              content: q.content,
              timeLimit: q.timeLimit,
              orderIndex: q.orderIndex,
              answers: {
                create: q.answers.map(a => ({
                  content: a.content,
                  isCorrect: a.isCorrect
                }))
              }
            }))
          }
        },
        include: {
          questions: { include: { answers: true } }
        }
      });
    }

    return this.prisma.quiz.update({
      where: { id },
      data: { title }
    });
  }

  async remove(id: string) {
    // Soft delete
    return this.prisma.quiz.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }
}

