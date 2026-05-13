import { IsString, IsArray, ValidateNested, IsInt, IsBoolean, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAnswerDto {
  @IsString()
  content: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class CreateQuestionDto {
  @IsString()
  content: string;

  @IsInt()
  timeLimit: number;

  @IsInt()
  orderIndex: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAnswerDto)
  answers: CreateAnswerDto[];
}

export class CreateQuizDto {
  @IsString()
  title: string;

  @IsUUID('4')
  createdBy: string; // Trong thực tế lấy từ user token, nhưng cho admin có thể gán.

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}

