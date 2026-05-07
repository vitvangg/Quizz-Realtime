import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { CurrentUser } from 'src/user/decorators/user.decorator';
import { AuthGuard } from 'src/auth/guards/auth.guard';

@Controller('room')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  // Tạo phòng mới (cần đăng nhập)
  @Post()
  @UseGuards(AuthGuard)
  create(@Body() createRoomDto: CreateRoomDto, @CurrentUser() user) {
    return this.roomService.create(createRoomDto, user.id);
  }

  // Lấy phòng theo PIN (public - cho Player join)
  @Get('pin/:pin')
  findByPin(@Param('pin') pin: string) {
    return this.roomService.findByPin(pin);
  }

  // Lấy phòng theo ID
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.roomService.findById(id);
  }

  // Lấy danh sách phòng của host
  @Get()
  @UseGuards(AuthGuard)
  findMyRooms(@CurrentUser() user) {
    return this.roomService.findByHostId(user.id);
  }

  // Tham gia phòng (Player không cần auth)
  @Post('join')
  joinRoom(@Body() joinRoomDto: JoinRoomDto) {
    return this.roomService.joinRoom(joinRoomDto.pin, joinRoomDto.nickname);
  }

  // Rời phòng
  @Post('leave/:playerId')
  leaveRoom(@Param('playerId') playerId: string) {
    return this.roomService.leaveRoom(playerId);
  }

  // Đá player khỏi phòng (host only)
  @Delete(':roomId/players/:playerId')
  @UseGuards(AuthGuard)
  kickPlayer(
    @Param('roomId') roomId: string,
    @Param('playerId') playerId: string,
    @CurrentUser() user,
  ) {
    return this.roomService.kickPlayer(playerId, user.id);
  }

  // Lấy danh sách player trong phòng
  @Get(':id/players')
  getPlayers(@Param('id') id: string) {
    return this.roomService.getPlayers(id);
  }

  // Cập nhật trạng thái phòng (host only)
  @Patch(':id/status')
  @UseGuards(AuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user,
  ) {
    return this.roomService.updateStatus(id, status as any, user.id);
  }

  // Xóa phòng (host only)
  @Delete(':id')
  @UseGuards(AuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.roomService.remove(id, user.id);
  }

  // Cập nhật phòng (host only)
  @Patch(':id')
  @UseGuards(AuthGuard)
  update(@Param('id') id: string, @Body() updateRoomDto: UpdateRoomDto) {
    return this.roomService.update(id, updateRoomDto);
  }
}
