import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) { }

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
        imageUrl: createQuestionDto.imageUrl,
        imageId: createQuestionDto.imageId,
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

  async uploadImage(id: string, userId: string, file: Express.Multer.File) {
    await this.checkQuestionOwner(id, userId);

    const question = await this.prismaService.question.findFirst({
      where: { id },
    });

    if (!question) {
        throw new NotFoundException('Question not found');
    }

    // Upload to Cloudinary
    const result = await this.cloudinaryService.uploadFile(file, 'questions');

    // Delete old image if exists
    if (question.imageId) {
      await this.cloudinaryService.deleteFile(question.imageId);
    }

    // Update question in DB
    return this.prismaService.question.update({
      where: { id },
      data: {
        imageUrl: result.secure_url,
        imageId: result.public_id,
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.checkQuestionOwner(id, userId);

    const question = await this.prismaService.question.findFirst({
      where: { id },
    });

    if (!question) {
        throw new NotFoundException('Question not found');
    }

    // Delete image from Cloudinary if exists
    if (question.imageId) {
      await this.cloudinaryService.deleteFile(question.imageId);
    }

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
        imageUrl: null,
        imageId: null,
      },
    });
  }
}
