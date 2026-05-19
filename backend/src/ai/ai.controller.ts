import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { UseGuards } from '@nestjs/common';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
    constructor(private readonly aiService: AiService) { }

    @Post('generate-quiz')
    async generateQuiz(
        @Body() body: { topic: string; amount?: number; requirements?: string },
    ) {
        return this.aiService.generateQuiz(body.topic, body.amount, body.requirements);
    }
}