import { PartialType } from '@nestjs/mapped-types';
import { CreateRoomDto } from './create-room.dto';
import { RoomStatus } from 'generated/prisma/enums';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateRoomDto extends PartialType(CreateRoomDto) {
    @IsEnum(RoomStatus)
    @IsOptional()
    status?: RoomStatus;

    @IsString()
    @IsOptional()
    quizId?: string;
}
