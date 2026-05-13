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

  // ============================================================================
  // SYSTEM CONFIG (INCIDENT CONTROLS)
  // ============================================================================

  async setSystemLockdown(enable: boolean): Promise<void> {
    await this.set('system:config:lockdown', enable ? 'true' : 'false');
  }

  async isSystemLockdown(): Promise<boolean> {
    const val = await this.get('system:config:lockdown');
    return val === 'true';
  }

  // ============================================================================
  // IP BLACKLIST
  // ============================================================================

  async banIp(ip: string, reason: string = 'Spam detected'): Promise<void> {
    const data = JSON.stringify({ reason, timestamp: Date.now() });
    await this.hset('blacklist:ips', ip, data);
  }

  async unbanIp(ip: string): Promise<void> {
    await this.hdel('blacklist:ips', ip);
  }

  async getBannedIps(): Promise<Array<{ ip: string; reason: string; timestamp: number }>> {
    const data = await this.hgetall('blacklist:ips');
    if (!data) return [];
    return Object.entries(data).map(([ip, infoStr]) => {
      const info = JSON.parse(infoStr as string);
      return { ip, ...info };
    });
  }

  async isIpBanned(ip: string): Promise<boolean> {
    const isBanned = await this.hexists('blacklist:ips', ip);
    return isBanned === 1;
  }

  // ============================================================================
  // RATE LIMITING (Sliding Window via Lua)
  // ============================================================================

  async checkRateLimit(
    key: string,
    limit = 20,
    windowMs = 1000,
  ): Promise<{ allowed: boolean; count: number }> {
    const redisKey = `ratelimit:${key}`;
    const now = Date.now();

    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
      local count = redis.call('ZCARD', key)
      if count < limit then
        redis.call('ZADD', key, now, now .. ':' .. math.random())
        redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
        return {1, count + 1}
      end
      return {0, count}
    `;

    try {
      const result = await this.eval(
        script,
        1,
        redisKey,
        now.toString(),
        windowMs.toString(),
        limit.toString(),
      ) as [number, number];
      return { allowed: result[0] === 1, count: result[1] };
    } catch {
      // Fail open: nếu Redis lỗi, cho phép qua để không block user hợp lệ
      return { allowed: true, count: 0 };
    }
  }
}
