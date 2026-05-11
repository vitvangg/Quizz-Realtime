import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    const host = process.env.REDIS_HOST;
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD;

    if (!host || !password) {
      throw new Error('REDIS_HOST and REDIS_PASSWORD environment variables must be set');
    }

    super({
      host,
      port,
      password,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      retryStrategy: (times) => {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    this.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });

    this.on('connect', () => {
      console.log('Redis connected successfully');
    });
  }

  onModuleDestroy() {
    this.disconnect();
  }
}
