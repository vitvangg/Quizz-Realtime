import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class JoinRoomDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    @MaxLength(6)
    pin: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(20)
    nickname: string;
}
