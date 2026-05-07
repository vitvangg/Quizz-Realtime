import { RoomStatus } from "generated/prisma/enums";
import { IsEnum, IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateRoomDto {
    @IsString()
    @IsNotEmpty()
    quizId: string;
}
