import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { AnswerPayload, LeaderboardEntry } from './interfaces';

/**
 * Redis Cloud Service (IORedis)
 * 
 * Dùng cho:
 * - Answer Buffer (LPUSH/RPOP)
 * - Leaderboard (ZADD/ZREVRANGE)
 * - Rate Limiting (Lua scripts)
 * - Session State
 * - Pub/Sub cho multi-instance
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private subscriber: Redis; // cho pub/sub cross-instance
  private isConnected = false;

  // Redis key prefixes
  private readonly PREFIX = {
    BUFFER: 'buffer',           // buffer:{sessionId}:{questionId}
    LEADERBOARD: 'lb',          // lb:{sessionId}
    ANSWERED: 'answered',        // answered:{sessionId}:{questionId}:{playerId}
    SESSION: 'session',          // session:{sessionId}
    RATE: 'ratelimit',           // ratelimit:{playerId}
    ROOM: 'room',                // room:{pin}
    ROOM_PLAYERS: 'room:players', // room:{pin}:players
    SOCKET_ROOM: 'socket',       // socket:{socketId} -> {pin}
  };

  onModuleInit() {
    this.initializeRedis();
  }

  private initializeRedis() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn('Redis not configured. Set REDIS_URL in .env');
      return;
    }

    // Parse URL: redis://user:pass@host:port
    const redisConfig = this.parseRedisUrl(redisUrl);

    // Main client cho general operations
    this.client = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      tls: redisConfig.tls ? {} : undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    // Subscriber client cho pub/sub (phải tách riêng)
    this.subscriber = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      tls: redisConfig.tls ? {} : undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log('Redis connected successfully');
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });

    this.subscriber.on('error', (err) => {
      this.logger.error(`Redis subscriber error: ${err.message}`);
    });
  }

  private parseRedisUrl(url: string): {
    host: string;
    port: number;
    password: string;
    tls: boolean;
  } {
    // Format: redis[s]://[:password@]host[:port] or redis[s]://user:password@host[:port]
    // Redis Cloud: redis://:password@host:port
    const match = url.match(/^rediss?:\/\/(?::([^@]+)@|([^:]+):([^@]+)@)?([^:/]+)(?::(\d+))?$/);

    if (!match) {
      this.logger.error('Invalid Redis URL format');
      return { host: 'localhost', port: 6379, password: '', tls: false };
    }

    // Handle both formats: :password@ or user:password@
    const password = match[1] || (match[2] && match[3] ? match[3] : '');
    const host = match[4];
    const port = match[5];

    return {
      password: password || '',
      host: host,
      port: parseInt(port || '6379', 10),
      tls: url.startsWith('rediss://'),
    };
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    this.logger.log('Redis connections closed');
  }

  // ============================================================================
  // GETTER cho adapter (multi-instance)
  // ============================================================================

  getClient(): Redis {
    return this.client;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }

  // ============================================================================
  // RATE LIMITING (Lua script for atomicity)
  // ============================================================================

  /**
   * Rate limit check: 5 requests per second per player
   */
  async checkRateLimit(playerId: string): Promise<{ allowed: boolean; remaining: number; reset: number }> {
    if (!this.isConnected) {
      return { allowed: true, remaining: 5, reset: 0 };
    }

    const key = `${this.PREFIX.RATE}:${playerId}`;
    const now = Date.now();
    const windowMs = 1000;
    const limit = 5;

    // Lua script: sliding window rate limiter
    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      
      -- Remove old entries outside window
      redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
      
      -- Count current entries
      local count = redis.call('ZCARD', key)
      
      if count < limit then
        -- Add new entry
        redis.call('ZADD', key, now, now .. ':' .. math.random())
        redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
        return {1, limit - count - 1, now + window}
      else
        -- Get oldest entry timestamp
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local reset = oldest[2] and (tonumber(oldest[2]) + window) or now + window
        return {0, 0, reset}
      end
    `;

    try {
      const result = await this.client.eval(
        script,
        1,
        key,
        now.toString(),
        windowMs.toString(),
        limit.toString(),
      ) as [number, number, number];

      return {
        allowed: result[0] === 1,
        remaining: result[1],
        reset: result[2],
      };
    } catch (error) {
      this.logger.error(`Rate limit error: ${error.message}`);
      return { allowed: true, remaining: 5, reset: 0 };
    }
  }

  // ============================================================================
  // ANSWER BUFFER
  // ============================================================================

  /**
   * Push answer vào buffer (LPUSH)
   */
  async bufferAnswer(sessionId: string, questionId: string, payload: AnswerPayload): Promise<boolean> {
    if (!this.isConnected) return false;

    const key = `${this.PREFIX.BUFFER}:${sessionId}:${questionId}`;

    try {
      await this.client.lpush(key, JSON.stringify(payload));
      await this.client.expire(key, 600); // 10 minutes
      return true;
    } catch (error) {
      this.logger.error(`Failed to buffer answer: ${error.message}`);
      return false;
    }
  }

  /**
   * Get tất cả answers từ buffer và xóa buffer
   */
  async flushAnswerBuffer(sessionId: string, questionId: string): Promise<AnswerPayload[]> {
    if (!this.isConnected) return [];

    const key = `${this.PREFIX.BUFFER}:${sessionId}:${questionId}`;

    try {
      // Use LRANGE + DEL in transaction
      const raw = await this.client.lrange(key, 0, -1);

      if (raw && raw.length > 0) {
        await this.client.del(key);
        return raw.map((r: string) => JSON.parse(r));
      }

      return [];
    } catch (error) {
      this.logger.error(`Failed to flush buffer: ${error.message}`);
      return [];
    }
  }

  /**
   * Get buffer size
   */
  async getBufferSize(sessionId: string, questionId: string): Promise<number> {
    if (!this.isConnected) return 0;

    const key = `${this.PREFIX.BUFFER}:${sessionId}:${questionId}`;
    const size = await this.client.llen(key);
    return size || 0;
  }

  // ============================================================================
  // ANSWER DEDUPLICATION (SETNX)
  // ============================================================================

  /**
   * Check and set answered - atomic using SETNX
   */
  async checkAndSetAnswered(
    sessionId: string,
    questionId: string,
    playerId: string,
    payload: AnswerPayload,
  ): Promise<{ isFirst: boolean; existingAnswer?: AnswerPayload }> {
    if (!this.isConnected) {
      return { isFirst: true };
    }

    const key = `${this.PREFIX.ANSWERED}:${sessionId}:${questionId}:${playerId}`;

    try {
      // SETNX - chỉ set nếu chưa tồn tại
      const wasSet = await this.client.setnx(key, JSON.stringify(payload));

      if (wasSet === 1) {
        await this.client.expire(key, 120); // 2 minutes
        return { isFirst: true };
      } else {
        const existing = await this.client.get(key);
        return {
          isFirst: false,
          existingAnswer: existing ? JSON.parse(existing) : undefined,
        };
      }
    } catch (error) {
      this.logger.error(`Failed to check/set answered: ${error.message}`);
      return { isFirst: true };
    }
  }

  // ============================================================================
  // LEADERBOARD
  // ============================================================================

  /**
   * Khởi tạo player score trong leaderboard
   */
  async initPlayerScore(sessionId: string, playerId: string, score: number = 0): Promise<void> {
    if (!this.isConnected) return;

    const key = `${this.PREFIX.LEADERBOARD}:${sessionId}`;
    await this.client.zadd(key, score, playerId);
  }

  /**
   * Cập nhật điểm player (ZINCRBY)
   */
  async updateScore(sessionId: string, playerId: string, deltaScore: number): Promise<number> {
    if (!this.isConnected) return 0;

    const key = `${this.PREFIX.LEADERBOARD}:${sessionId}`;

    try {
      const newScore = await this.client.zincrby(key, deltaScore, playerId);
      return parseFloat(newScore);
    } catch (error) {
      this.logger.error(`Failed to update score: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get top N players từ leaderboard
   */
  async getTopScores(sessionId: string, count: number = 10): Promise<LeaderboardEntry[]> {
    if (!this.isConnected) return [];

    const key = `${this.PREFIX.LEADERBOARD}:${sessionId}`;

    try {
      // ZREVRANGE WITHSCORES - get top scores descending
      const result = await this.client.zrevrange(key, 0, count - 1, 'WITHSCORES');

      if (!result || result.length === 0) return [];

      const entries: LeaderboardEntry[] = [];
      for (let i = 0; i < result.length; i += 2) {
        entries.push({
          playerId: result[i],
          score: parseFloat(result[i + 1]),
        });
      }

      return entries;
    } catch (error) {
      this.logger.error(`Failed to get top scores: ${error.message}`);
      return [];
    }
  }

  /**
   * Get player rank (1-indexed)
   */
  async getPlayerRank(sessionId: string, playerId: string): Promise<number | null> {
    if (!this.isConnected) return null;

    const key = `${this.PREFIX.LEADERBOARD}:${sessionId}`;

    try {
      const rank = await this.client.zrevrank(key, playerId);
      return rank !== null ? rank + 1 : null;
    } catch (error) {
      this.logger.error(`Failed to get player rank: ${error.message}`);
      return null;
    }
  }

  /**
   * Get player score
   */
  async getPlayerScore(sessionId: string, playerId: string): Promise<number> {
    if (!this.isConnected) return 0;

    const key = `${this.PREFIX.LEADERBOARD}:${sessionId}`;

    try {
      const score = await this.client.zscore(key, playerId);
      return score !== null ? parseFloat(score) : 0;
    } catch (error) {
      this.logger.error(`Failed to get player score: ${error.message}`);
      return 0;
    }
  }

  /**
   * Xóa leaderboard
   */
  async clearLeaderboard(sessionId: string): Promise<void> {
    if (!this.isConnected) return;

    const key = `${this.PREFIX.LEADERBOARD}:${sessionId}`;
    await this.client.del(key);
  }

  // ============================================================================
  // SESSION STATE
  // ============================================================================

  /**
   * Lưu session state
   */
  async setSessionState(sessionId: string, state: Record<string, any>): Promise<void> {
    if (!this.isConnected) return;

    const key = `${this.PREFIX.SESSION}:${sessionId}`;
    await this.client.hset(key, state);
    await this.client.expire(key, 3600); // 1 hour
  }

  /**
   * Lấy session state
   */
  async getSessionState(sessionId: string): Promise<Record<string, any> | null> {
    if (!this.isConnected) return null;

    const key = `${this.PREFIX.SESSION}:${sessionId}`;
    const state = await this.client.hgetall(key);
    return state && Object.keys(state).length > 0 ? state : null;
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    if (!this.isConnected) {
      return { healthy: false, latencyMs: -1 };
    }

    const start = Date.now();
    try {
      await this.client.ping();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: -1 };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ROOM MANAGEMENT (for WebSocket state synchronization)
  // ══════════════════════════════════════════════════════════════════════════════

  async createRoom(pin: string, hostSocketId: string): Promise<void> {
    if (!this.isConnected) return;
    await this.client.hset(`${this.PREFIX.ROOM}:${pin}`, {
      hostSocketId,
      status: 'waiting',
      createdAt: Date.now().toString(),
    });
  }

  async getRoom(pin: string): Promise<Record<string, string> | null> {
    if (!this.isConnected) return null;
    const room = await this.client.hgetall(`${this.PREFIX.ROOM}:${pin}`);
    return Object.keys(room).length > 0 ? room : null;
  }

  async setRoomStatus(pin: string, status: 'waiting' | 'playing'): Promise<void> {
    if (!this.isConnected) return;
    await this.client.hset(`${this.PREFIX.ROOM}:${pin}`, 'status', status);
  }

  async deleteRoom(pin: string): Promise<void> {
    if (!this.isConnected) return;
    const pipeline = this.client.pipeline();
    pipeline.del(`${this.PREFIX.ROOM}:${pin}`);
    pipeline.del(`${this.PREFIX.ROOM_PLAYERS}:${pin}`);
    await pipeline.exec();
  }

  async addPlayerToRoom(pin: string, socketId: string, playerData: {
    playerId: string;
    nickname: string;
    isHost?: boolean;
  }): Promise<void> {
    if (!this.isConnected) return;
    const pipeline = this.client.pipeline();
    pipeline.hset(`${this.PREFIX.ROOM_PLAYERS}:${pin}`, socketId, JSON.stringify(playerData));
    pipeline.set(`${this.PREFIX.SOCKET_ROOM}:${socketId}`, pin);
    await pipeline.exec();
  }

  async getPlayersInRoom(pin: string): Promise<Array<{ socketId: string; playerId: string; nickname: string }>> {
    if (!this.isConnected) return [];
    const players = await this.client.hgetall(`${this.PREFIX.ROOM_PLAYERS}:${pin}`);
    return Object.entries(players).map(([socketId, data]) => ({
      socketId,
      ...JSON.parse(data),
    }));
  }

  async removePlayerFromRoom(pin: string, socketId: string): Promise<void> {
    if (!this.isConnected) return;
    const pipeline = this.client.pipeline();
    pipeline.hdel(`${this.PREFIX.ROOM_PLAYERS}:${pin}`, socketId);
    pipeline.del(`${this.PREFIX.SOCKET_ROOM}:${socketId}`);
    await pipeline.exec();
  }

  async getPlayerBySocket(socketId: string): Promise<{ pin: string; playerId: string; nickname: string } | null> {
    if (!this.isConnected) return null;
    const pin = await this.client.get(`${this.PREFIX.SOCKET_ROOM}:${socketId}`);
    if (!pin) return null;
    const playerData = await this.client.hget(`${this.PREFIX.ROOM_PLAYERS}:${pin}`, socketId);
    if (!playerData) return null;
    return { pin, ...JSON.parse(playerData) };
  }

  async getSocketRoom(socketId: string): Promise<string | null> {
    if (!this.isConnected) return null;
    return this.client.get(`${this.PREFIX.SOCKET_ROOM}:${socketId}`);
  }

  async isHostSocket(socketId: string, pin: string): Promise<boolean> {
    if (!this.isConnected) return false;
    const hostSocketId = await this.client.hget(`${this.PREFIX.ROOM}:${pin}`, 'hostSocketId');
    return hostSocketId === socketId;
  }

  async getHostSocketId(pin: string): Promise<string | null> {
    if (!this.isConnected) return null;
    return this.client.hget(`${this.PREFIX.ROOM}:${pin}`, 'hostSocketId');
  }
}
