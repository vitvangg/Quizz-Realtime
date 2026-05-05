import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { AnswersService } from './answers.service';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { UpdateAnswerDto } from './dto/update-answer.dto';
import { CurrentUser } from 'src/user/decorators/user.decorator';

@Controller('answers')
export class AnswersController {
  constructor(private readonly answersService: AnswersService) {}

  @Post()
  create(@Body() createAnswerDto: CreateAnswerDto, @CurrentUser() user) {
    return this.answersService.create(createAnswerDto, user.id);
  }

  @Get(':id')
  findByQuestionId(@Param('id') id: string) {
    return this.answersService.findByQuestionId(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateAnswerDto: UpdateAnswerDto,
    @CurrentUser() user,
  ) {
    return this.answersService.update(id, updateAnswerDto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.answersService.remove(id, user.id);
  }
}
