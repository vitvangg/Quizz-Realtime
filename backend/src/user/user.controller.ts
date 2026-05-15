import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { CurrentUser } from './decorators/user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get()
  @UseGuards(AuthGuard)
  getAllUser() {
    return this.userService.getAll();
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  updateProfile(@CurrentUser() user: any, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(user.id, updateUserDto);
  }

  @Post('upload-avatar')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('fileAvatar'))
  uploadAvatar(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    console.log(file);
    return this.userService.uploadAvatar(user.id, file);
  }

  @Get('test')
  @UseGuards(AuthGuard)
  test() {
    return "API is working and you are authenticated!";
  }
}
