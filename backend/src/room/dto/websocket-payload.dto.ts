import { IsString, IsNotEmpty, IsUUID, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class JoinRoomPayload {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(6)
  @Transform(({ value }) => value?.trim())
  pin: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(20)
  @Transform(({ value }) => value?.trim())
  nickname: string;
}

export class LeaveRoomPayload {
  @IsUUID()
  @IsNotEmpty()
  roomId: string;
}

export class JoinByIdPayload {
  @IsUUID()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(20)
  @Transform(({ value }) => value?.trim())
  nickname: string;

  @IsString()
  jwt?: string;
}

export class StartGamePayload {
  @IsUUID()
  @IsNotEmpty()
  roomId: string;
}
