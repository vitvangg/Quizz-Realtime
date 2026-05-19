import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface QueuedAnswer {
  playerSessionId: string;
  playerId: string;
  questionId: string;
  answerId: string;
  isCorrect: boolean;
  scoreEarned: number;
  timeTaken: number;
  submittedAt: number;
  sessionId: string;
}

@Injectable()
export class AnswerQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnswerQueueService.name);
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_INTERVAL_MS = 100;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;

  // Callback for batch processing - set by AnswerBatchService
  public processBatchCallback: ((answers: QueuedAnswer[]) => Promise<void>) | null = null;

  constructor(private readonly redis: RedisService) {}

  onModuleInit() {
    // Start batch processor
    this.intervalId = setInterval(() => {
      this.processBatches().catch((err) => {
        this.logger.error('Batch processor error:', err);
      });
    }, this.BATCH_INTERVAL_MS);

    this.logger.log('Answer batch processor started');
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.logger.log('Answer batch processor stopped');
  }

  /**
   * Queue an answer for batch processing
   * Returns immediately after queueing (fast)
   */
  async queueAnswer(answer: QueuedAnswer): Promise<void> {
    const queueKey = `answers:queue:${answer.sessionId}`;
    await this.redis.rpush(queueKey, JSON.stringify(answer));
  }

  /**
   * Get queue length for monitoring
   */
  async getQueueLength(sessionId: string): Promise<number> {
    const queueKey = `answers:queue:${sessionId}`;
    return await this.redis.llen(queueKey);
  }

  /**
   * Get all session queues for processing
   */
  async getAllQueueKeys(): Promise<string[]> {
    return await this.redis.keys('answers:queue:*');
  }

  /**
   * Pop batch of answers from queue
   */
  async popBatch(queueKey: string, batchSize: number): Promise<QueuedAnswer[]> {
    const answers: QueuedAnswer[] = [];

    for (let i = 0; i < batchSize; i++) {
      const data = await this.redis.lpop(queueKey);
      if (!data) break;
      answers.push(JSON.parse(data));
    }

    return answers;
  }

  /**
   * Process all queues - called every BATCH_INTERVAL_MS
   */
  private async processBatches(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.processBatchCallback) return;

    this.isProcessing = true;

    try {
      const queueKeys = await this.getAllQueueKeys();

      for (const queueKey of queueKeys) {
        const answers = await this.popBatch(queueKey, this.BATCH_SIZE);

        if (answers.length === 0) continue;

        try {
          await this.processBatchCallback(answers);
          this.logger.debug(`Processed ${answers.length} answers from ${queueKey}`);
        } catch (error) {
          this.logger.error(`Failed to process batch from ${queueKey}:`, error);
          // Re-queue failed answers
          await this.requeueAnswers(queueKey, answers);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Re-queue answers that failed to process
   */
  private async requeueAnswers(queueKey: string, answers: QueuedAnswer[]): Promise<void> {
    for (const answer of answers) {
      await this.redis.lpush(queueKey, JSON.stringify(answer));
    }
  }
}
