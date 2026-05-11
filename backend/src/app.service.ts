import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from './redis/redis.service';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private redis: RedisService) {}

  async onModuleInit() {
    try {
      const pong = await this.redis.ping();
      console.log('✅ Redis connected! Ping:', pong);
    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
    }
  }

  getHello(): string {
    return 'Hello World!';
  }
}
