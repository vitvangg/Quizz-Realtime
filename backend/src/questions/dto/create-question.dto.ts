import { IsString, IsInt, IsUUID, IsOptional } from 'class-validator';

export class CreateQuestionDto {
  @IsUUID()
  quizId: string;

  @IsString()
  content: string;

  @IsInt()
  timeLimit: number;

  @IsInt()
  orderIndex: number;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  imageId?: string;
}