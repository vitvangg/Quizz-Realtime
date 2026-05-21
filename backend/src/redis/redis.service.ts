import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private subClient: Redis;

  constructor(private readonly eventEmitter: EventEmitter2) {
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

    // Initialize subscriber client for cross-instance communication
    this.subClient = new Redis({ host, port, password });

    // Subscribe to all incident events
    this.subClient.psubscribe('system.incident.*', (err) => {
      if (err) console.error('Failed to subscribe to system incidents', err);
    });

    this.subClient.on('pmessage', (pattern, channel, message) => {
      try {
        const payload = JSON.parse(message);
        // Relay to local EventEmitter
        this.eventEmitter.emit(channel, payload);
      } catch (e) {
        console.error(`Failed to parse pub/sub message from ${channel}`);
      }
    });
  }

  onModuleDestroy() {
    if (this.subClient) this.subClient.quit();
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

  async setMaintenanceMode(enable: boolean): Promise<void> {
    await this.set('system:config:maintenance', enable ? 'true' : 'false');
  }

  async isMaintenanceMode(): Promise<boolean> {
    const val = await this.get('system:config:maintenance');
    return val === 'true';
  }

  // ============================================================================
  // IP BLACKLIST
  // ============================================================================

  async banIp(ip: string, reason: string = 'Spam detected', ttlSeconds = 86400): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const data = JSON.stringify({ reason, timestamp: Date.now(), expiresAt });
    await this.hset('blacklist:ips', ip, data);
    // Lưu TTL riêng để tự unban
    await this.set(`blacklist:ttl:${ip}`, '1', 'EX', ttlSeconds);
  }

  async unbanIp(ip: string): Promise<void> {
    await this.hdel('blacklist:ips', ip);
    await this.del(`blacklist:ttl:${ip}`);
  }

  async getBannedIps(): Promise<Array<{ ip: string; reason: string; timestamp: number; expiresAt?: number }>> {
    const data = await this.hgetall('blacklist:ips');
    if (!data) return [];
    const now = Date.now();
    const result: Array<{ ip: string; reason: string; timestamp: number; expiresAt?: number }> = [];
    for (const [ip, infoStr] of Object.entries(data)) {
      const info = JSON.parse(infoStr as string);
      // Tự động dọn IP đã hết TTL (Redis TTL key đã xóa nhưng hash vẫn còn)
      if (info.expiresAt && info.expiresAt < now) {
        await this.hdel('blacklist:ips', ip);
        continue;
      }
      result.push({ ip, ...info });
    }
    return result;
  }

  async isIpBanned(ip: string): Promise<boolean> {
    const isBanned = await this.hexists('blacklist:ips', ip);
    if (isBanned !== 1) return false;
    // Kiểm tra TTL — nếu đã hết hạn thì tự unban
    const ttlAlive = await this.exists(`blacklist:ttl:${ip}`);
    if (ttlAlive === 0) {
      await this.hdel('blacklist:ips', ip);
      return false;
    }
    return true;
  }

  // ============================================================================
  // ACTIVE ROOMS TRACKING
  // ============================================================================

  async setActiveRoom(sessionId: string, data: any): Promise<void> {
    await this.hset('admin:active_rooms', sessionId, JSON.stringify(data));
    // TTL sentinel key — nếu key này hết hạn (server crash, không cleanup), room được coi là ghost
    await this.set(`admin:room_ttl:${sessionId}`, '1', 'EX', 300); // 1 phút (test)
  }

  async updateActiveRoom(sessionId: string, updates: Partial<any>): Promise<void> {
    const infoStr = await this.hget('admin:active_rooms', sessionId);
    if (infoStr) {
      try {
        const info = JSON.parse(infoStr);
        await this.hset('admin:active_rooms', sessionId, JSON.stringify({ ...info, ...updates }));
        // Refresh TTL sentinel so active games don't get cleaned as ghost sessions
        await this.set(`admin:room_ttl:${sessionId}`, '1', 'EX', 60); // 1 phút (test)
      } catch (e) {
        console.error(`Error updating active room ${sessionId}`, e);
      }
    }
  }

  async removeActiveRoom(sessionId: string): Promise<void> {
    await this.hdel('admin:active_rooms', sessionId);
    await this.del(`admin:room_players:${sessionId}`);
    await this.del(`admin:room_ttl:${sessionId}`);
  }

  async getActiveRooms(): Promise<Record<string, any>> {
    const data = await this.hgetall('admin:active_rooms');
    const rooms: Record<string, any> = {};
    if (data) {
      for (const [sessionId, infoStr] of Object.entries(data)) {
        try {
          // Check 1: TTL sentinel — nếu hết hạn là ghost room (server crash không cleanup)
          const alive = await this.exists(`admin:room_ttl:${sessionId}`);
          if (alive === 0) {
            await this.hdel('admin:active_rooms', sessionId);
            await this.del(`admin:room_players:${sessionId}`);
            console.log(`[Redis] Auto-cleaned ghost room (TTL expired): ${sessionId}`);
            continue;
          }

          // Check 2: Game cache — nếu game cache không còn, session đã kết thúc (đóng tab, crash)
          const info = JSON.parse(infoStr as string);
          // Chỉ kiểm tra game cache nếu session không phải FINISHED (FINISHED sessions được cleanup ngay)
          if (info.status !== 'FINISHED') {
            const gameCacheAlive = await this.exists(`game:${sessionId}`);
            if (gameCacheAlive === 0) {
              await this.hdel('admin:active_rooms', sessionId);
              await this.del(`admin:room_players:${sessionId}`);
              await this.del(`admin:room_ttl:${sessionId}`);
              console.log(`[Redis] Auto-cleaned ghost room (game cache gone): ${sessionId}`);
              continue;
            }
          }

          const playersCount = await this.getRoomPlayerCount(sessionId);
          rooms[sessionId] = { ...info, playersCount };
        } catch (e) {
          console.error(`Error parsing room data for ${sessionId}`, e);
        }
      }
    }
    return rooms;
  }

  async incrementRoomPlayer(sessionId: string, amount: number): Promise<void> {
    await this.incrby(`admin:room_players:${sessionId}`, amount);
  }

  async getRoomPlayerCount(sessionId: string): Promise<number> {
    const val = await this.get(`admin:room_players:${sessionId}`);
    return val ? parseInt(val, 10) : 0;
  }

  // ============================================================================
  // RATE LIMITING (Sliding Window via Lua)
  // ============================================================================

  // Đọc số request hiện tại của một IP trong sliding window
  async getIpRequestCount(ip: string): Promise<number> {
    try {
      const key = `ratelimit:${ip}`;
      const now = Date.now();
      // Xóa các entry cũ hơn 1 giây trước
      await this.zremrangebyscore(key, '-inf', now - 1000);
      const count = await this.zcard(key);
      return count || 0;
    } catch {
      return 0;
    }
  }

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
      redis.call('ZADD', key, now, now .. ':' .. math.random())
      redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
      if count < limit then
        return {1, count + 1}
      end
      return {0, count + 1}
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
