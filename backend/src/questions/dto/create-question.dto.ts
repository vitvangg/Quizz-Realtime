import { IsString, IsInt, IsUUID } from 'class-validator';

export class CreateQuestionDto {
  @IsUUID()
  quizId: string;

  @IsString()
  content: string;

  @IsInt()
  timeLimit: number;

  @IsInt()
  orderIndex: number;
}