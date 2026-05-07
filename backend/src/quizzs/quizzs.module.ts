import { Module } from '@nestjs/common';
import { QuizzsService } from './quizzs.service';
import { QuizzsController } from './quizzs.controller';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';

@Module({
  imports: [JwtModule],
  controllers: [QuizzsController],
  providers: [QuizzsService],
})
export class QuizzsModule {}
