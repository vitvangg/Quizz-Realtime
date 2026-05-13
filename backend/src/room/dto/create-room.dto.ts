import { IsString, IsNotEmpty, IsUUID, IsOptional, IsEnum } from 'class-validator';

export enum RoomStatus {
  WAITING = 'WAITING',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED',
}

export class CreateRoomDto {
  @IsUUID()
  @IsNotEmpty()
  quizId: string;

  @IsOptional()
  @IsString()
  pin?: string;
}
