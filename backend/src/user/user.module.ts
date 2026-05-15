import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AuthModule } from 'src/auth/auth.module';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { CloudinaryModule } from 'src/common/cloudinary/cloudinary.module';

@Module({
  imports: [JwtModule, CloudinaryModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
