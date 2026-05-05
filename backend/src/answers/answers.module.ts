import { Module } from '@nestjs/common';
import { AnswersService } from './answers.service';
import { AnswersController } from './answers.controller';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';

@Module({
  imports: [JwtModule],
  controllers: [AnswersController],
  providers: [AnswersService],
})
export class AnswersModule {}
