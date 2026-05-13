import { PartialType } from '@nestjs/mapped-types';
import { CreateRoomDto, RoomStatus } from './create-room.dto';
import { IsOptional, IsEnum } from 'class-validator';

export class UpdateRoomDto extends PartialType(CreateRoomDto) {
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;
}
