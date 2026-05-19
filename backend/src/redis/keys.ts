/**
 * Redis Key Patterns - Centralized key generation for Redis
 * 
 * This file provides type-safe key generation functions to ensure
 * consistency across the codebase and make key changes easier.
 * 
 * All Redis keys should use these functions instead of hardcoded strings.
 */

export const REDIS_KEYS = {
  // ============================================================================
  // PRESENCE KEYS (Game Session)
  // ============================================================================
  
  /**
   * Player presence in a game session
   * Pattern: presence:session:{sessionId}
   * Type: Hash<playerId, PlayerPresenceJSON>
   */
  PRESENCE_SESSION: (sessionId: string) => `presence:session:${sessionId}`,
  
  /**
   * Player's sessions (reverse lookup)
   * Pattern: presence:player:{playerId}
   * Type: Hash<sessionId, socketId>
   */
  PRESENCE_PLAYER: (playerId: string) => `presence:player:${playerId}`,
  
  /**
   * Session host ID
   * Pattern: presence:host:{sessionId}
   * Type: String (hostPlayerId)
   */
  PRESENCE_HOST: (sessionId: string) => `presence:host:${sessionId}`,

  // ============================================================================
  // LOBBY KEYS (Waiting Room)
  // ============================================================================
  
  /**
   * Player presence in lobby
   * Pattern: player:lobby:{roomId}:{playerId}
   * Type: Hash
   */
  LOBBY_PLAYER: (roomId: string, playerId: string) => 
    `player:lobby:${roomId}:${playerId}`,
  
  /**
   * All players in a lobby
   * Pattern: lobby:{roomId}:players
   * Type: Set of playerIds
   */
  LOBBY_PLAYERS: (roomId: string) => `lobby:${roomId}:players`,
  
  /**
   * Lobby host info
   * Pattern: lobby:{roomId}:host
   * Type: Hash<playerId, nickname>
   */
  LOBBY_HOST: (roomId: string) => `lobby:${roomId}:host`,

  // ============================================================================
  // GAME KEYS
  // ============================================================================
  
  /**
   * Game session runtime state
   * Pattern: game:{sessionId}
   * Type: GameCache JSON
   */
  GAME_CACHE: (sessionId: string) => `game:${sessionId}`,
  
  /**
   * Game leaderboard
   * Pattern: leaderboard:{sessionId}
   * Type: Sorted Set (playerId → score)
   */
  LEADERBOARD: (sessionId: string) => `leaderboard:${sessionId}`,
  
  /**
   * Player names cache
   * Pattern: player:names
   * Type: Hash<playerId, nickname>
   */
  PLAYER_NAMES: 'player:names',
  
  /**
   * Player names TTL tracking
   * Pattern: player:names:ttl
   * Type: Hash<playerId, expiresAt>
   */
  PLAYER_NAMES_TTL: 'player:names:ttl',

  // ============================================================================
  // ANSWER KEYS
  // ============================================================================
  
  /**
   * Answer submission lock (prevents double submission)
   * Pattern: answer:lock:{sessionId}:{playerId}:{questionId}
   * Type: String (with TTL)
   */
  ANSWER_LOCK: (sessionId: string, playerId: string, questionId: string) =>
    `answer:lock:${sessionId}:${playerId}:${questionId}`,
  
  /**
   * Answer batch queue
   * Pattern: answers:queue:{sessionId}
   * Type: List of queued answers
   */
  ANSWER_QUEUE: (sessionId: string) => `answers:queue:${sessionId}`,

  // ============================================================================
  // TIMER KEYS
  // ============================================================================
  
  /**
   * Timer metadata for freeze/resume
   * Pattern: game:timer_meta:{sessionId}
   * Type: JSON { totalMs, scheduledAt, timerVersion }
   */
  TIMER_META: (sessionId: string) => `game:timer_meta:${sessionId}`,
  
  /**
   * Timer pause state
   * Pattern: game:timer_pause:{sessionId}
   * Type: String (remaining milliseconds)
   */
  TIMER_PAUSE: (sessionId: string) => `game:timer_pause:${sessionId}`,

  // ============================================================================
  // SECURITY KEYS
  // ============================================================================
  
  /**
   * IP blacklist with TTL
   * Pattern: blacklist:ttl:{ip}
   * Type: String ('1')
   */
  IP_BLACKLIST_TTL: (ip: string) => `blacklist:ttl:${ip}`,
  
  /**
   * IP blacklist reason
   * Pattern: blacklist:reason:{ip}
   * Type: String (reason text)
   */
  IP_BLACKLIST_REASON: (ip: string) => `blacklist:reason:${ip}`,

  // ============================================================================
  // RATE LIMIT KEYS
  // ============================================================================
  
  /**
   * Rate limit bucket
   * Pattern: ratelimit:{identifier}
   * Type: String (count)
   */
  RATE_LIMIT: (identifier: string) => `ratelimit:${identifier}`,
} as const;

// Type exports
export type RedisKeyPattern = typeof REDIS_KEYS;
