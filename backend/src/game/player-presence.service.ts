import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { GAME_CONSTANTS } from 'src/common/constants';

/**
 * Player Presence Service - Redis-authoritative player connection state
 * 
 * Replaces in-memory Maps (socketMap, sessionSockets, playerRoomMapping)
 * with Redis Hash for cross-instance support.
 * 
 * Redis Keys:
 * - presence:session:{sessionId} → Hash<playerId, PlayerPresenceJSON>
 * - presence:player:{playerId}   → Hash<sessionId, socketId> (for reverse lookup)
 * - presence:host:{sessionId}   → String (hostPlayerId)
 * 
 * PlayerPresence:
 * {
 *   playerId: string,
 *   nickname: string,
 *   socketId: string,
 *   isHost: boolean,
 *   connection: 'CONNECTED' | 'DISCONNECTED',
 *   lastSeen: number (timestamp),
 *   joinedAt: number (timestamp),
 * }
 */

export enum ConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
}

export interface PlayerPresence {
  playerId: string;
  nickname: string;
  socketId: string;
  isHost: boolean;
  connection: ConnectionStatus;
  lastSeen: number;
  joinedAt: number;
}

export interface SessionPresence {
  sessionId: string;
  players: PlayerPresence[];
  hostId: string | null;
}

@Injectable()
export class PlayerPresenceService {
  private readonly logger = new Logger(PlayerPresenceService.name);

  // TTL: Use centralized constants
  private readonly PRESENCE_TTL_SECONDS = GAME_CONSTANTS.PLAYER_PRESENCE_TTL;

  // Key prefixes
  private sessionKey(sessionId: string) { return `presence:session:${sessionId}`; }
  private playerKey(playerId: string) { return `presence:player:${playerId}`; }
  private hostKey(sessionId: string) { return `presence:host:${sessionId}`; }

  constructor(private readonly redis: RedisService) {}

  /**
   * Attach a player to a session with socket info
   * Call when player joins game or host starts game
   */
  async attachPlayer(params: {
    sessionId: string;
    playerId: string;
    nickname: string;
    socketId: string;
    isHost: boolean;
  }): Promise<PlayerPresence> {
    const { sessionId, playerId, nickname, socketId, isHost } = params;
    const now = Date.now();

    const presence: PlayerPresence = {
      playerId,
      nickname,
      socketId,
      isHost,
      connection: ConnectionStatus.CONNECTED,
      lastSeen: now,
      joinedAt: now,
    };

    const pipeline = this.redis.pipeline();

    // Store player presence in session hash
    pipeline.hset(this.sessionKey(sessionId), playerId, JSON.stringify(presence));
    pipeline.expire(this.sessionKey(sessionId), this.PRESENCE_TTL_SECONDS);

    // Store reverse lookup: playerId → sessionId:socketId
    pipeline.hset(this.playerKey(playerId), sessionId, socketId);
    pipeline.expire(this.playerKey(playerId), this.PRESENCE_TTL_SECONDS);

    // If host, store host marker
    if (isHost) {
      pipeline.set(this.hostKey(sessionId), playerId, 'EX', this.PRESENCE_TTL_SECONDS);
    }

    await pipeline.exec();

    this.logger.debug(`[attachPlayer] ${playerId} (${isHost ? 'host' : 'player'}) attached to session ${sessionId}`);
    return presence;
  }

  /**
   * Detach a player from a session
   * Call when player intentionally leaves or session ends
   */
  async detachPlayer(sessionId: string, playerId: string): Promise<void> {
    const pipeline = this.redis.pipeline();

    pipeline.hdel(this.sessionKey(sessionId), playerId);
    pipeline.hdel(this.playerKey(playerId), sessionId);

    await pipeline.exec();

    this.logger.debug(`[detachPlayer] ${playerId} detached from session ${sessionId}`);
  }

  /**
   * Update socket ID when player reconnects with new socket
   * Call when player's socket reconnects
   */
  async updateSocketId(sessionId: string, playerId: string, newSocketId: string): Promise<PlayerPresence | null> {
    const existing = await this.getPlayerPresence(sessionId, playerId);
    if (!existing) {
      return null;
    }

    const updated: PlayerPresence = {
      ...existing,
      socketId: newSocketId,
      connection: ConnectionStatus.CONNECTED,
      lastSeen: Date.now(),
    };

    await this.redis.hset(this.sessionKey(sessionId), playerId, JSON.stringify(updated));

    // Update reverse lookup
    await this.redis.hset(this.playerKey(playerId), sessionId, newSocketId);

    this.logger.debug(`[updateSocketId] ${playerId} socket updated to ${newSocketId}`);
    return updated;
  }

  /**
   * Mark player as disconnected (soft disconnect)
   * Does NOT remove from session - player is still "in game"
   * Call on socket disconnect
   */
  async markDisconnected(sessionId: string, playerId: string): Promise<PlayerPresence | null> {
    const existing = await this.getPlayerPresence(sessionId, playerId);
    if (!existing) {
      return null;
    }

    const updated: PlayerPresence = {
      ...existing,
      connection: ConnectionStatus.DISCONNECTED,
      lastSeen: Date.now(),
      // socketId becomes stale but kept for reference
    };

    await this.redis.hset(this.sessionKey(sessionId), playerId, JSON.stringify(updated));

    this.logger.debug(`[markDisconnected] ${playerId} marked disconnected in session ${sessionId}`);
    return updated;
  }

  /**
   * Reconnect a disconnected player with a new socket
   * Combines markDisconnected + updateSocketId in one call
   */
  async reconnectPlayer(params: {
    sessionId: string;
    playerId: string;
    newSocketId: string;
  }): Promise<PlayerPresence | null> {
    const { sessionId, playerId, newSocketId } = params;
    const existing = await this.getPlayerPresence(sessionId, playerId);
    if (!existing) {
      return null;
    }

    const updated: PlayerPresence = {
      ...existing,
      socketId: newSocketId,
      connection: ConnectionStatus.CONNECTED,
      lastSeen: Date.now(),
    };

    const pipeline = this.redis.pipeline();

    pipeline.hset(this.sessionKey(sessionId), playerId, JSON.stringify(updated));
    pipeline.hset(this.playerKey(playerId), sessionId, newSocketId);

    await pipeline.exec();

    this.logger.debug(`[reconnectPlayer] ${playerId} reconnected with socket ${newSocketId}`);
    return updated;
  }

  /**
   * Get player presence in a session
   */
  async getPlayerPresence(sessionId: string, playerId: string): Promise<PlayerPresence | null> {
    const data = await this.redis.hget(this.sessionKey(sessionId), playerId);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as PlayerPresence;
    } catch {
      return null;
    }
  }

  /**
   * Get all players in a session
   */
  async getSessionPlayers(sessionId: string): Promise<PlayerPresence[]> {
    const data = await this.redis.hgetall(this.sessionKey(sessionId));
    if (!data) {
      return [];
    }

    const players: PlayerPresence[] = [];
    for (const [playerId, presenceStr] of Object.entries(data)) {
      try {
        const presence = JSON.parse(presenceStr as string) as PlayerPresence;
        players.push(presence);
      } catch {
        this.logger.warn(`[getSessionPlayers] Invalid presence data for ${playerId}`);
      }
    }

    return players;
  }

  /**
   * Get full session presence state
   */
  async getSessionPresence(sessionId: string): Promise<SessionPresence> {
    const [players, hostId] = await Promise.all([
      this.getSessionPlayers(sessionId),
      this.redis.get(this.hostKey(sessionId)),
    ]);

    return {
      sessionId,
      players,
      hostId,
    };
  }

  /**
   * Get all sessions a player is in (reverse lookup)
   */
  async getPlayerSessions(playerId: string): Promise<string[]> {
    const data = await this.redis.hkeys(this.playerKey(playerId));
    return data || [];
  }

  /**
   * Get all active (connected) players in a session
   */
  async getActivePlayers(sessionId: string): Promise<PlayerPresence[]> {
    const players = await this.getSessionPlayers(sessionId);
    return players.filter(p => p.connection === ConnectionStatus.CONNECTED);
  }

  /**
   * Get all disconnected players in a session
   */
  async getDisconnectedPlayers(sessionId: string): Promise<PlayerPresence[]> {
    const players = await this.getSessionPlayers(sessionId);
    return players.filter(p => p.connection === ConnectionStatus.DISCONNECTED);
  }

  /**
   * Get host ID for a session
   */
  async getHostId(sessionId: string): Promise<string | null> {
    return this.redis.get(this.hostKey(sessionId));
  }

  /**
   * Set a player as host of session
   */
  async setHost(sessionId: string, hostPlayerId: string): Promise<void> {
    await this.redis.set(this.hostKey(sessionId), hostPlayerId, 'EX', this.PRESENCE_TTL_SECONDS);

    // Update the player's isHost flag
    const presence = await this.getPlayerPresence(sessionId, hostPlayerId);
    if (presence && !presence.isHost) {
      const updated: PlayerPresence = { ...presence, isHost: true };
      await this.redis.hset(this.sessionKey(sessionId), hostPlayerId, JSON.stringify(updated));
    }

    this.logger.debug(`[setHost] ${hostPlayerId} set as host of session ${sessionId}`);
  }

  /**
   * Check if a player is still connected (recent lastSeen)
   * Returns true if lastSeen is within thresholdMs
   */
  async isPlayerActive(sessionId: string, playerId: string, thresholdMs = 30000): Promise<boolean> {
    const presence = await this.getPlayerPresence(sessionId, playerId);
    if (!presence) {
      return false;
    }
    return presence.connection === ConnectionStatus.CONNECTED ||
      (Date.now() - presence.lastSeen < thresholdMs);
  }

  /**
   * Cleanup all presence data for a session
   * Call when session ends
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const players = await this.getSessionPlayers(sessionId);

    const pipeline = this.redis.pipeline();

    pipeline.del(this.sessionKey(sessionId));
    pipeline.del(this.hostKey(sessionId));

    for (const player of players) {
      pipeline.hdel(this.playerKey(player.playerId), sessionId);
    }

    await pipeline.exec();

    this.logger.debug(`[cleanupSession] Cleaned up session ${sessionId} with ${players.length} players`);
  }

  /**
   * Get total connected player count across all sessions
   * Useful for monitoring
   */
  async getTotalConnectedCount(): Promise<number> {
    const keys = await this.redis.keys('presence:session:*');
    let total = 0;

    for (const key of keys) {
      const sessionId = key.replace('presence:session:', '');
      const players = await this.getActivePlayers(sessionId);
      total += players.length;
    }

    return total;
  }

  // ============================================================================
  // LOBBY PRESENCE (RoomGateway)
  // ============================================================================

  // TTL: Use centralized constants
  private LOBBY_PRESENCE_TTL_SECONDS = GAME_CONSTANTS.LOBBY_PRESENCE_TTL;

  /**
   * Get all rooms a player is currently in (for cross-gateway cleanup)
   */
  async getPlayerRooms(playerId: string): Promise<string[]> {
    const pattern = `player:lobby:*:${playerId}`;
    const keys = await this.redis.keys(pattern);
    return keys.map((key) => {
      const match = key.match(/player:lobby:([^:]+):/);
      return match ? match[1] : null;
    }).filter((roomId): roomId is string => roomId !== null);
  }

  /**
   * Get lobby presence data for a specific room
   */
  async getLobbyPresence(roomId: string): Promise<{
    players: Map<string, { nickname: string; isHost: boolean; joinedAt: number; socketId?: string }>;
    host: { nickname: string; playerId: string } | null;
  }> {
    const playersMap = new Map<string, { nickname: string; isHost: boolean; joinedAt: number; socketId?: string }>();

    // Get all player entries for this room
    const playerKeys = await this.redis.keys(`player:lobby:${roomId}:*`);
    for (const key of playerKeys) {
      const data = await this.redis.get(key);
      if (data) {
        const playerId = key.split(':').pop()!;
        const parsed = JSON.parse(data);
        playersMap.set(playerId, {
          nickname: parsed.nickname,
          isHost: parsed.isHost || false,
          joinedAt: parsed.joinedAt,
          socketId: parsed.socketId,
        });
      }
    }

    // Get host info
    const hostData = await this.redis.get(`lobby:${roomId}:host`);
    let host: { nickname: string; playerId: string } | null = null;
    if (hostData) {
      const parsed = JSON.parse(hostData);
      host = { nickname: parsed.nickname, playerId: parsed.playerId };
    }

    return { players: playersMap, host };
  }

  /**
   * Check if a player is already in a room (for reload detection)
   */
  async isPlayerInLobby(roomId: string, playerId: string): Promise<boolean> {
    const key = `player:lobby:${roomId}:${playerId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Attach player to lobby room
   */
  async attachPlayerToLobby(params: {
    roomId: string;
    playerId: string;
    nickname: string;
    socketId: string;
    isHost: boolean;
  }): Promise<void> {
    const { roomId, playerId, nickname, socketId, isHost } = params;

    const key = `player:lobby:${roomId}:${playerId}`;
    const data = JSON.stringify({
      nickname,
      socketId,
      isHost,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    });

    await this.redis.set(key, data, 'EX', this.LOBBY_PRESENCE_TTL_SECONDS);

    // Track player's rooms
    await this.redis.sadd(`lobby:${roomId}:players`, playerId);

    // Set host if this player is host
    if (isHost) {
      await this.redis.set(
        `lobby:${roomId}:host`,
        JSON.stringify({ playerId, nickname }),
        'EX',
        this.LOBBY_PRESENCE_TTL_SECONDS,
      );
    }

    this.logger.debug(`[attachPlayerToLobby] ${nickname} (${playerId}) joined room ${roomId}`);
  }

  /**
   * Update player's socket ID and mark as connected (for reconnect)
   */
  async updateLobbySocketId(roomId: string, playerId: string, socketId: string): Promise<void> {
    const key = `player:lobby:${roomId}:${playerId}`;
    const data = await this.redis.get(key);
    if (data) {
      const parsed = JSON.parse(data);
      parsed.socketId = socketId;
      parsed.lastSeen = Date.now();
      parsed.connection = 'CONNECTED';
      delete parsed.disconnectedAt;
      await this.redis.set(key, JSON.stringify(parsed), 'EX', this.LOBBY_PRESENCE_TTL_SECONDS);
      this.logger.debug(`[updateLobbySocketId] ${playerId} reconnected in room ${roomId}`);
    }
  }

  /**
   * Detach player from lobby room
   */
  async detachPlayerFromLobby(roomId: string, playerId: string): Promise<void> {
    const key = `player:lobby:${roomId}:${playerId}`;

    // Check if this player was host
    const hostData = await this.redis.get(`lobby:${roomId}:host`);
    if (hostData) {
      const parsed = JSON.parse(hostData);
      if (parsed.playerId === playerId) {
        await this.redis.del(`lobby:${roomId}:host`);
      }
    }

    await this.redis.del(key);
    await this.redis.srem(`lobby:${roomId}:players`, playerId);

    this.logger.debug(`[detachPlayerFromLobby] ${playerId} left room ${roomId}`);
  }

  /**
   * Mark player as disconnected but keep them in room (for reconnect grace period)
   * Does NOT remove from room - just updates connection status
   */
  async markDisconnectedInLobby(roomId: string, playerId: string): Promise<void> {
    const key = `player:lobby:${roomId}:${playerId}`;
    const data = await this.redis.get(key);
    if (data) {
      const parsed = JSON.parse(data);
      parsed.connection = 'DISCONNECTED';
      parsed.disconnectedAt = Date.now();
      // Keep player in room but mark as disconnected
      await this.redis.set(key, JSON.stringify(parsed), 'EX', this.LOBBY_PRESENCE_TTL_SECONDS);
      this.logger.debug(`[markDisconnectedInLobby] ${playerId} marked disconnected in room ${roomId}`);
    }
    // NOTE: Player stays in lobby:{roomId}:players set
  }

  /**
   * Get player presence in a specific lobby
   */
  async getPlayerLobbyPresence(roomId: string, playerId: string): Promise<{
    nickname: string;
    isHost: boolean;
    socketId?: string;
    joinedAt: number;
    connection?: 'CONNECTED' | 'DISCONNECTED';
    disconnectedAt?: number;
  } | null> {
    const key = `player:lobby:${roomId}:${playerId}`;
    const data = await this.redis.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }
}
