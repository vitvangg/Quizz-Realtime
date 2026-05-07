import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { CurrentUser } from 'src/user/decorators/user.decorator';

@Controller('questions')
@UseGuards(AuthGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  create(@Body() createQuestionDto: CreateQuestionDto, @CurrentUser() user) {
    return this.questionsService.create(createQuestionDto, user.id );
  }

  @Get()
  findAll() {
    return this.questionsService.findAll();
  }

  @Get('quiz/:quizId')
  findByQuizId(@Param('quizId') quizId: string) {
    return this.questionsService.findByQuizId(quizId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateQuestionDto: UpdateQuestionDto,
    @CurrentUser() user,
  ) {
    return this.questionsService.update(id, updateQuestionDto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.questionsService.remove(id, user.id);
  }
}
