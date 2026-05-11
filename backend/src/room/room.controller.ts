import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JoinRoomDto, GetRoomByPinDto } from './dto/join-room.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { CurrentUser } from 'src/user/decorators/user.decorator';

@Controller('room')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  @UseGuards(AuthGuard)
  create(@Body() createRoomDto: CreateRoomDto, @CurrentUser() user: any) {
    return this.roomService.create(createRoomDto, user.id);
  }

  @Get()
  findAll() {
    return this.roomService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomService.findOne(id);
  }

  @Get('pin/:pin')
  findByPin(@Param('pin') pin: string) {
    return this.roomService.findByPin(pin);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  joinRoom(@Body() joinRoomDto: JoinRoomDto) {
    return this.roomService.joinRoom(joinRoomDto);
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  leaveRoom(@Body() body: { roomId: string; playerId: string }) {
    return this.roomService.leaveRoom(body.roomId, body.playerId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateRoomDto: UpdateRoomDto,
    @CurrentUser() user: any,
  ) {
    return this.roomService.update(id, updateRoomDto, user.id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.roomService.remove(id, user.id);
  }
}
