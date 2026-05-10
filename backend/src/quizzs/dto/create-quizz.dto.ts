import { IsString, IsNotEmpty } from 'class-validator';
export class CreateQuizzDto {
  @IsString()
  @IsNotEmpty()
  title: string;
}
