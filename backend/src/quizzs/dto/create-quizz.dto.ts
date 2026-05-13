import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { QuizCategory } from '../../../generated/prisma/client';

export class CreateQuizzDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(QuizCategory)
  @IsNotEmpty()
  category: QuizCategory;
}
