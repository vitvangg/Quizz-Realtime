import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { REFRESH_TOKEN_TTL } from 'src/config/config';
import { SessionService } from 'src/session/session.service';
import ms from 'ms';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly sessionService: SessionService
    ) {}

    async register(data: RegisterDto) {
        // Check email đã tồn tại chưa
        const duplicateUser = await this.userService.findByEmail(data.email);
        if (duplicateUser) {
            throw new ConflictException('Email đã tồn tại trong hệ thống');
        }

        // mã hóa password
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // tạo user mới
        const newUser = await this.userService.create({
            email: data.email,
            passwordHash: hashedPassword
        });

        // trả về user mới tạo
        return newUser;
    }

    async login(data: LoginDto) {
        // Tìm user theo email
        const user = await this.userService.findByEmail(data.email);
        if (!user) {
            throw new UnauthorizedException("User not found");
        }
        const { passwordHash, ...safeUser } = user;
        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Kiểm tra password
        const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid password');
        }

        // Tạo JWT token
        const payload = {
            id: user.id,
            email: user.email,
        };
        const accessToken = await this.jwtService.signAsync(payload);

        // tao refresh token ngẫu nhiên
        const refreshToken = crypto.randomBytes(64).toString("hex");

        // Lưu refresh token vào database
        const expiresAt = new Date(Date.now() + ms(REFRESH_TOKEN_TTL));

        console.log('expiresAt: ', expiresAt);
        await this.sessionService.createSession(user.id, refreshToken, expiresAt);

        return {
            accessToken,
            refreshToken,
            user: safeUser
        };
    }

    async logout(refreshToken: string) {
        if (!refreshToken) {
            throw new UnauthorizedException('No refresh token provided');
        }
        await this.sessionService.deleteSession(refreshToken);
    }

    // TODO: refresh token
    async refreshToken(oldRefreshToken: string) {
        if (!oldRefreshToken) {
            throw new UnauthorizedException('No refresh token provided');
        }

        // So sánh refresh token trong db
        const session = await this.sessionService.findSessionByToken(oldRefreshToken);
        if (!session) {
            throw new UnauthorizedException('Invalid refresh token');
        }
        // Kiểm tra refresh token đã hết hạn chưa
        if (session.expiresAt < new Date()) {
            throw new UnauthorizedException('Refresh token expired');
        }
        const user = await this.userService.findById(session.userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const payload = {
            id: user.id,
            email: user.email,
        };

        const accessToken = await this.jwtService.signAsync(payload);

        const newRefreshToken = crypto.randomBytes(64).toString("hex");
        await this.sessionService.updateSessionToken(
            session.id,
            newRefreshToken
        );
        return {
            accessToken,
            refreshToken: newRefreshToken
        };
    }
}
