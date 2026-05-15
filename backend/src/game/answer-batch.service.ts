import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnswerQueueService, QueuedAnswer } from './answer-queue.service';

@Injectable()
export class AnswerBatchService implements OnModuleInit {
  private readonly logger = new Logger(AnswerBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly answerQueue: AnswerQueueService,
  ) {}

  onModuleInit() {
    // Register the batch processor callback
    this.answerQueue.processBatchCallback = this.processBatchAnswers.bind(this);
    this.logger.log('Answer batch processor registered');
  }

  /**
   * Process batch of answers - called by AnswerQueueService
   */
  private async processBatchAnswers(answers: QueuedAnswer[]): Promise<void> {
    if (answers.length === 0) return;

    const startTime = Date.now();

    // Use transaction for batch operations
    await this.prisma.$transaction(async (tx) => {
      // 1. Batch INSERT answers
      await tx.playerAnswer.createMany({
        data: answers.map((answer) => ({
          playerSessionId: answer.playerSessionId,
          questionId: answer.questionId,
          answerId: answer.answerId,
          questionContent: '',
          answerContent: '',
          isCorrect: answer.isCorrect,
          scoreEarned: answer.scoreEarned,
          timeAnswered: new Date(answer.submittedAt),
        })),
        skipDuplicates: true,
      });

      // 2. Batch update player session scores
      // Group by playerSessionId to avoid duplicate updates
      const playerScores = new Map<string, number>();
      for (const answer of answers) {
        const current = playerScores.get(answer.playerSessionId) || 0;
        playerScores.set(answer.playerSessionId, current + answer.scoreEarned);
      }

      // Execute batch updates
      const updatePromises: Promise<unknown>[] = [];
      for (const [playerSessionId, scoreDelta] of playerScores) {
        if (scoreDelta > 0) {
          updatePromises.push(
            tx.playerSession.update({
              where: { id: playerSessionId },
              data: { score: { increment: scoreDelta } },
            }),
          );
        }
      }

      // Wait for all updates to complete
      await Promise.all(updatePromises);
    });

    const duration = Date.now() - startTime;
    this.logger.debug(`Batch processed: ${answers.length} answers in ${duration}ms`);
  }
}
