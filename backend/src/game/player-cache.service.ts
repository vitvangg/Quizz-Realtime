import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlayerCacheService {
  private readonly logger = new Logger(PlayerCacheService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get player name from cache or database
   * Supports both Player (nickname) and User (fullName) for hosts
   * Caches result in Redis Hash for future lookups
   */
  async getPlayerName(playerId: string): Promise<string> {
    // Check cache first
    const cached = await this.redis.hget('player:names', playerId);
    if (cached) {
      return cached;
    }

    // Try Player table first (regular players)
    if (!playerId.startsWith('host_')) {
      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
        select: { nickname: true },
      });

      if (player) {
        await this.redis.hset('player:names', playerId, player.nickname);
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
      await this.redis.hset('player:names', playerId, name);
      return name;
    }

    return 'Unknown';
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

    // Batch fetch from Redis Hash
    const cached = await this.redis.hmget('player:names', ...playerIds);

    playerIds.forEach((id, index) => {
      if (cached[index]) {
        result.set(id, cached[index]);
      } else if (id.startsWith('host_')) {
        uncachedHostIds.push(id.replace('host_', ''));
      } else {
        uncachedPlayerIds.push(id);
      }
    });

    // Fetch uncached Players from database
    if (uncachedPlayerIds.length > 0) {
      const players = await this.prisma.player.findMany({
        where: { id: { in: uncachedPlayerIds } },
        select: { id: true, nickname: true },
      });

      const cacheData: string[] = [];
      players.forEach(player => {
        result.set(player.id, player.nickname);
        cacheData.push(player.id, player.nickname);
      });

      // Batch cache update
      if (cacheData.length > 0) {
        await this.redis.hset('player:names', ...cacheData);
      }
    }

    // Fetch uncached Hosts (Users) from database
    if (uncachedHostIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: uncachedHostIds } },
        select: { id: true, fullName: true },
      });

      const cacheData: string[] = [];
      users.forEach(user => {
        const name = user.fullName || 'Host';
        result.set(`host_${user.id}`, name);
        cacheData.push(`host_${user.id}`, name);
      });

      // Batch cache update
      if (cacheData.length > 0) {
        await this.redis.hset('player:names', ...cacheData);
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
   * Invalidate cached player name
   * Call when player updates their nickname
   */
  async invalidatePlayerName(playerId: string): Promise<void> {
    await this.redis.hdel('player:names', playerId);
  }

  /**
   * Invalidate all cached player names
   * Use sparingly - only when necessary
   */
  async invalidateAll(): Promise<void> {
    await this.redis.del('player:names');
  }
}
