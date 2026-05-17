/**
 * Shared Socket Event Payloads
 * 
 * This module defines standardized event payloads used by both RoomGateway and GameGateway.
 * Using shared DTOs ensures payload format consistency across the application.
 */

// ============================================================================
// PLAYER EVENTS - Unified format for player join/leave/reconnect
// ============================================================================

export interface PlayerIdentityPayload {
  playerId: string;
  nickname: string;
  isHost?: boolean;
}

export interface PlayerJoinedEvent {
  /** Unique player identifier */
  playerId: string;
  /** Display name */
  nickname: string;
  /** Current player count in room/session */
  playerCount?: number;
  /** Who invited/host this player */
  joinedBy?: string;
  /** Server timestamp */
  timestamp: number;
  /** Whether this player is the host */
  isHost?: boolean;
}

export interface PlayerLeftEvent {
  /** Unique player identifier */
  playerId: string;
  /** Display name */
  nickname: string;
  /** Current player count after leaving */
  playerCount?: number;
  /** Whether the leaving player was host */
  isHost?: boolean;
  /** Server timestamp */
  timestamp: number;
}

export interface PlayerReconnectingEvent {
  playerId: string;
  nickname: string;
  gracePeriodMs: number;
  timestamp: number;
}

export interface PlayerReconnectedEvent {
  playerId: string;
  nickname: string;
  timestamp: number;
}

// ============================================================================
// GAME EVENTS
// ============================================================================

export interface QuestionStartEvent {
  sessionId: string;
  questionIndex: number;
  question: {
    id: string;
    content: string;
    answers: {
      id: string;
      content: string;
    }[];
    timeLimit: number;
  };
  totalQuestions: number;
  timeRemaining: number;
  serverTime: number;
  /** Version marker for idempotent client handling */
  questionVersion: number;
}

export interface QuestionResultEvent {
  questionIndex: number;
  correctAnswer: {
    id: string;
    content: string;
  } | null;
  isLastQuestion: boolean;
  question: {
    id: string;
    content: string;
  };
  leaderboard: LeaderboardEntry[];
  serverTime: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
}

export interface GameStartedEvent {
  sessionId: string;
  countdown: number;
}

export interface CountdownTickEvent {
  remaining: number;
}

export interface GameRedirectEvent {
  url: string;
  sessionId: string;
}

export interface GameEndedEvent {
  leaderboard: LeaderboardEntry[];
  totalQuestions: number;
}

export interface SessionClosedEvent {
  sessionId: string;
  reason: 'HOST_EXITED' | 'GAME_FINISHED' | 'HOST_DISCONNECTED';
}

// ============================================================================
// HOST EVENTS
// ============================================================================

export interface HostDisconnectedEvent {
  sessionId: string;
  gracePeriod: number;
}

export interface HostReconnectedEvent {
  sessionId: string;
}

// ============================================================================
// SCORE EVENTS
// ============================================================================

export interface ScoreUpdateEvent {
  playerId: string;
  score: number;
  leaderboard: LeaderboardEntry[];
}

export interface AnswerReceivedEvent {
  success: boolean;
  isCorrect: boolean;
  scoreEarned: number;
}

export interface LeaderboardUpdateEvent {
  leaderboard: LeaderboardEntry[];
}

// ============================================================================
// ROOM EVENTS
// ============================================================================

export interface RoomJoinedEvent {
  room: {
    id: string;
    pin: string;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
    hostId: string;
  };
  player: PlayerIdentityPayload;
  players: PlayerIdentityPayload[];
  quiz: {
    id: string;
    title: string;
    questionCount: number;
  };
}

export interface RoomLeftEvent {
  roomId: string;
  message: string;
  isHost?: boolean;
}

export interface HostLeftEvent {
  roomId: string;
}

// ============================================================================
// ERROR EVENTS
// ============================================================================

export interface ErrorEvent {
  message: string;
  code?: string;
}

// ============================================================================
// SYSTEM EVENTS
// ============================================================================

export interface SystemFreezeEvent {
  freeze: boolean;
  message?: string;
  timestamp: string;
}

export interface SystemMaintenanceEvent {
  maintenance: boolean;
  message?: string;
  scheduledFrom?: string | null;
  scheduledUntil?: string | null;
  timestamp: string;
}

export interface TimerResumeEvent {
  remainingSeconds: number;
}

// ============================================================================
// SESSION SWITCH EVENTS (Simplified Architecture)
// ============================================================================

export interface SessionSwitchedEvent {
  oldSessionId: string;
  newSessionId: string;
  url: string;
  timestamp: number;
}

export interface SessionStartedEvent {
  sessionId: string;
  timestamp: number;
}

export interface PlayerStatusEvent {
  playerId: string;
  nickname: string;
  connection: 'CONNECTED' | 'DISCONNECTED';
  isHost: boolean;
  timestamp: number;
}
