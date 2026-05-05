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
import { QuizzsService } from './quizzs.service';
import { CreateQuizzDto } from './dto/create-quizz.dto';
import { UpdateQuizzDto } from './dto/update-quizz.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { CurrentUser } from 'src/user/decorators/user.decorator';

@Controller('quizzs')
@UseGuards(AuthGuard)
export class QuizzsController {
  constructor(private readonly quizzsService: QuizzsService) {}
  @Post()
  create(@Body() createQuizzDto: CreateQuizzDto, @CurrentUser() user) {
    return this.quizzsService.create(createQuizzDto, user.id);
  }

  @Get('')
  findAll() {
    return this.quizzsService.findAll();
  }
 @Get('user')
  findByUserId(@CurrentUser() user) {
    return this.quizzsService.findByUserId(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quizzsService.findOne(id);
  }
 
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateQuizzDto: UpdateQuizzDto,
    @CurrentUser() user,
  ) {
    return this.quizzsService.update(id, updateQuizzDto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.quizzsService.remove(id, user.id);
  }
}
