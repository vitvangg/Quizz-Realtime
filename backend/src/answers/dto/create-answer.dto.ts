import { IsString, IsUUID, IsBoolean } from 'class-validator';

export class CreateAnswerDto {
  @IsUUID()
  questionId: string;

  @IsString()
  content: string;

  @IsBoolean()
  isCorrect: boolean;
}
