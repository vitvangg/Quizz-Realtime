import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { QuestionsController } from './questions.controller';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { CloudinaryModule } from 'src/common/cloudinary/cloudinary.module';

@Module({
  imports: [JwtModule, CloudinaryModule],
  controllers: [QuestionsController],
  providers: [QuestionsService],
})
export class QuestionsModule {}
