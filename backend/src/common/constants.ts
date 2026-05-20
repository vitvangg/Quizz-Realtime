/**
 * Game Constants - Centralized configuration for the quiz game
 * This file consolidates all magic numbers and hardcoded values
 * to improve maintainability and consistency.
 */

export const GAME_CONSTANTS = {
  // ============================================================
  // COUNTDOWN & TIMING
  // ============================================================

  /** Countdown seconds before game starts */
  COUNTDOWN_SECONDS: 3,

  /** Delay between countdown ticks (ms) */
  COUNTDOWN_TICK_DELAY: 1000,

  // ============================================================
  // REDIRECT & BUFFER
  // ============================================================

  /** Buffer time (ms) after game_redirect before question_start
   * DISABLED: We emit question_start immediately after countdown
   * Players joining late will use recoverState to sync timer
   */
  GAME_REDIRECT_BUFFER_MS: 0,

  // ============================================================
  // REDIS TTL (seconds)
  // ============================================================

  /** Game cache TTL - 2 hours */
  GAME_CACHE_TTL: 7200,

  /** Player presence TTL - 24 hours */
  PLAYER_PRESENCE_TTL: 86400,

  /** Lobby presence TTL - 1 hour */
  LOBBY_PRESENCE_TTL: 3600,

  /** Answer lock TTL - 30 seconds */
  ANSWER_LOCK_TTL: 30,

  /** Player name cache TTL - 24 hours (ms) */
  PLAYER_NAME_CACHE_TTL_MS: 24 * 60 * 60 * 1000,

  // ============================================================
  // SCORING
  // ============================================================

  /** Base score for correct answer */
  BASE_SCORE: 1000,

  /** Time bonus divisor (ms per point) */
  TIME_BONUS_DIVISOR: 10,

  // ============================================================
  // TIMER & BATCH
  // ============================================================

  /** Timer check interval (ms) */
  TIMER_CHECK_INTERVAL: 100,

  /** Answer batch size */
  ANSWER_BATCH_SIZE: 100,

  /** Answer batch interval (ms) */
  ANSWER_BATCH_INTERVAL: 100,

  // ============================================================
  // SOCKET & NETWORK
  // ============================================================

  /** Redis connection timeout (ms) */
  REDIS_CONNECT_TIMEOUT: 10000,

  /** Rate limit window (ms) */
  RATE_LIMIT_WINDOW: 1000,

  // ============================================================
  // GRACE PERIODS
  // ============================================================

  /** Player reconnect grace period (ms) */
  RECONNECT_GRACE_PERIOD: 30000,

  /** Cleanup grace period for disconnect (ms) */
  DISCONNECT_GRACE_PERIOD: 5000,
} as const;

export const LOBBY_CONSTANTS = {
  // Lobby-specific constants
  MAX_PLAYERS_PER_ROOM: 50,
  MIN_NICKNAME_LENGTH: 2,
  MAX_NICKNAME_LENGTH: 20,
} as const;

export const GAME_CONSTRAINT = {
  // Game constraints
  MIN_QUESTION_TIME: 5,
  MAX_QUESTION_TIME: 60,
  DEFAULT_QUESTION_TIME: 20,
} as const;

// Type exports for consumers
export type GameConstants = typeof GAME_CONSTANTS;
export type LobbyConstants = typeof LOBBY_CONSTANTS;
export type GameConstraint = typeof GAME_CONSTRAINT;
