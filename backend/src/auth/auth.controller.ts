import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { REFRESH_TOKEN_TTL } from 'src/config/config';
import ms from 'ms';
import { AuthGuard } from './guards/auth.guard';
import { CurrentUser } from 'src/user/decorators/user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() data: RegisterDto) {
    return this.authService.register(data);
  }

  @Post('login')
  async login(@Body() data: LoginDto, @Res({ passthrough: true }) res) {
    const { accessToken, refreshToken, user } = await this.authService.login(data);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: ms(REFRESH_TOKEN_TTL),
    });
    return { accessToken, data: user };
  }

  @Post('logout')
  async logout(@Req() req, @Res({ passthrough: true }) res) {
    const token = req.cookies?.refreshToken;
    await this.authService.logout(token);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });
    return { message: 'Logged out successfully' };
  }

  @Post('refresh-token')
  async refreshToken(@Req() req, @Res({ passthrough: true }) res) {
    const token = req.cookies?.refreshToken;
    const { accessToken, refreshToken } = await this.authService.refreshToken(token);
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: ms(REFRESH_TOKEN_TTL),
    });
    return { accessToken };
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  async getProfile(@CurrentUser() user) {
    return user;
  }
}
