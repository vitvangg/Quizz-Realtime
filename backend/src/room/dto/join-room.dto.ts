import { IsString, IsNotEmpty, IsUUID, MinLength, MaxLength } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(6)
  pin: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(20)
  nickname: string;
}

export class LeaveRoomDto {
  @IsUUID()
  @IsNotEmpty()
  roomId: string;
}

export class GetRoomByPinDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(6)
  pin: string;
}
