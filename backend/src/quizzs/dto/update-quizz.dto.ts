import { PartialType } from '@nestjs/mapped-types';
import { CreateQuizzDto } from './create-quizz.dto';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { QuizCategory } from '../../../generated/prisma/client';

export class UpdateQuizzDto extends PartialType(CreateQuizzDto) {

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsEnum(QuizCategory)
    category: QuizCategory;
}
