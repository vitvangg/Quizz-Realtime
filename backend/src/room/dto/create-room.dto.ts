import { RoomStatus } from "generated/prisma/enums";

export class CreateRoomDto {
    pin: string;
    quizId: string;
    hostId: string;
    status: RoomStatus; 
    currentQuestionIndex: number;
}
