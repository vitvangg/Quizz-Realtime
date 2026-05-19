import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { GAME_CONSTANTS } from 'src/common/constants';

/**
 * Player name caching with TTL support
 * 
 * Cache structure:
 * - player:names         → Hash<playerId, nickname>
 * - player:names:ttl      → Hash<playerId, expiresAt (timestamp)>
 * - player:names:session → Hash<playerId, sessionId> (for cleanup)
 */

@Injectable()
export class PlayerCacheService {
  private readonly logger = new Logger(PlayerCacheService.name);
  
  /** Default TTL: Use centralized constants */
  private readonly DEFAULT_TTL_MS = GAME_CONSTANTS.PLAYER_NAME_CACHE_TTL_MS;
  
  /** Keys for Redis */
  private readonly NAMES_KEY = 'player:names';
  private readonly TTL_KEY = 'player:names:ttl';
  private readonly SESSION_KEY = 'player:names:session';

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get player name from cache or database
   * Supports both Player (nickname) and User (fullName) for hosts
   * Caches result in Redis Hash with TTL for automatic cleanup
   */
  async getPlayerName(playerId: string): Promise<string> {
    // Check if TTL expired before returning cached value
    const ttlExpired = await this.isTtlExpired(playerId);
    if (!ttlExpired) {
      const cached = await this.redis.hget(this.NAMES_KEY, playerId);
      if (cached) {
        return cached;
      }
    }

    // Try Player table first (regular players)
    if (!playerId.startsWith('host_')) {
      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
        select: { nickname: true },
      });

      if (player) {
        await this.cachePlayerName(playerId, player.nickname);
        return player.nickname;
      }
    }

    // Try User table (hosts with host_<userId> format)
    const userId = playerId.replace('host_', '');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });

    if (user) {
      const name = user.fullName || 'Host';
      await this.cachePlayerName(playerId, name);
      return name;
    }

    return 'Unknown';
  }

  /**
   * Check if TTL has expired for a cached player name
   */
  private async isTtlExpired(playerId: string): Promise<boolean> {
    const expiresAt = await this.redis.hget(this.TTL_KEY, playerId);
    if (!expiresAt) {
      // No TTL set, treat as expired to force refresh
      return true;
    }
    return Date.now() > parseInt(expiresAt, 10);
  }

  /**
   * Cache player name with TTL
   */
  private async cachePlayerName(playerId: string, nickname: string, sessionId?: string): Promise<void> {
    const expiresAt = Date.now() + this.DEFAULT_TTL_MS;
    
    // Store name, TTL, and optional sessionId in separate hashes
    await this.redis.hset(this.NAMES_KEY, playerId, nickname);
    await this.redis.hset(this.TTL_KEY, playerId, String(expiresAt));
    
    if (sessionId) {
      await this.redis.hset(this.SESSION_KEY, playerId, sessionId);
    }
  }

  /**
   * Get multiple player names efficiently with batch caching
   * Supports both Player (nickname) and User (fullName) for hosts
   * Returns a Map of playerId -> nickname
   */
  async getPlayerNames(playerIds: string[]): Promise<Map<string, string>> {
    if (playerIds.length === 0) {
      return new Map();
    }

    const result = new Map<string, string>();
    const uncachedPlayerIds: string[] = [];
    const uncachedHostIds: string[] = [];
    const expiredIds: string[] = [];

    // Batch fetch from Redis Hash
    const cached = await this.redis.hmget(this.NAMES_KEY, ...playerIds);

    // Check TTL for each cached entry
    const ttls = await this.redis.hmget(this.TTL_KEY, ...playerIds);

    playerIds.forEach((id, index) => {
      if (cached[index] && ttls[index]) {
        const expiresAt = parseInt(ttls[index], 10);
        if (Date.now() <= expiresAt) {
          result.set(id, cached[index]);
        } else {
          expiredIds.push(id);
          uncachedPlayerIds.push(id);
        }
      } else if (!cached[index]) {
        // Not cached at all
        if (id.startsWith('host_')) {
          uncachedHostIds.push(id.replace('host_', ''));
        } else {
          uncachedPlayerIds.push(id);
        }
      }
    });

    // Fetch uncached Players from database
    if (uncachedPlayerIds.length > 0) {
      const players = await this.prisma.player.findMany({
        where: { id: { in: uncachedPlayerIds } },
        select: { id: true, nickname: true },
      });

      for (const player of players) {
        result.set(player.id, player.nickname);
        await this.cachePlayerName(player.id, player.nickname);
      }
    }

    // Fetch uncached Hosts (Users) from database
    if (uncachedHostIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: uncachedHostIds } },
        select: { id: true, fullName: true },
      });

      for (const user of users) {
        const name = user.fullName || 'Host';
        result.set(`host_${user.id}`, name);
        await this.cachePlayerName(`host_${user.id}`, name);
      }
    }

    return result;
  }

  /**
   * Warm up cache for all players in a session
   * Call this when game starts to pre-load player names
   */
  async warmupSessionCache(sessionId: string): Promise<void> {
    const playerSessions = await this.prisma.playerSession.findMany({
      where: { sessionId },
      select: { playerId: true },
    });

    if (playerSessions.length === 0) {
      return;
    }

    const playerIds = playerSessions.map(ps => ps.playerId);
    await this.getPlayerNames(playerIds);

    this.logger.log(`Warmed up cache for ${playerIds.length} players in session ${sessionId}`);
  }

  /**
   * Invalidate cached player name when nickname changes
   * Call when player updates their nickname
   */
  async invalidatePlayerName(playerId: string): Promise<void> {
    await this.redis.hdel(this.NAMES_KEY, playerId);
    await this.redis.hdel(this.TTL_KEY, playerId);
    await this.redis.hdel(this.SESSION_KEY, playerId);
    this.logger.debug(`Invalidated cache for player ${playerId}`);
  }

  /**
   * Invalidate cached player names for all players in a session
   * Call when session ends or when refreshing player list
   */
  async invalidateSessionCache(sessionId: string): Promise<void> {
    const playerIds = await this.redis.hkeys(this.SESSION_KEY);
    
    let invalidated = 0;
    for (const playerId of playerIds) {
      const cachedSession = await this.redis.hget(this.SESSION_KEY, playerId);
      if (cachedSession === sessionId) {
        await this.invalidatePlayerName(playerId);
        invalidated++;
      }
    }
    
    this.logger.debug(`Invalidated ${invalidated} player caches for session ${sessionId}`);
  }

  /**
   * Invalidate all cached player names
   * Use sparingly - only when necessary
   */
  async invalidateAll(): Promise<void> {
    await this.redis.del(this.NAMES_KEY);
    await this.redis.del(this.TTL_KEY);
    await this.redis.del(this.SESSION_KEY);
    this.logger.warn('Invalidated all player name caches');
  }

  /**
   * Cleanup expired entries from cache
   * Call periodically or when cache size is large
   */
  async cleanupExpiredCache(): Promise<number> {
    const playerIds = await this.redis.hkeys(this.TTL_KEY);
    let cleaned = 0;

    for (const playerId of playerIds) {
      const expiresAt = await this.redis.hget(this.TTL_KEY, playerId);
      if (expiresAt && Date.now() > parseInt(expiresAt, 10)) {
        await this.redis.hdel(this.NAMES_KEY, playerId);
        await this.redis.hdel(this.TTL_KEY, playerId);
        await this.redis.hdel(this.SESSION_KEY, playerId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired player cache entries`);
    }
    return cleaned;
  }
}
