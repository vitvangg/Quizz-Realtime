// ============================================================================
// HOST PAYLOADS
// ============================================================================

export interface HostJoinPayload {
  roomId: string;
}

export interface KickPlayerPayload {
  playerId: string;
}

export interface StartGamePayload {
  roomId: string;
}

// ============================================================================
// PLAYER PAYLOADS
// ============================================================================

export interface PlayerJoinPayload {
  pin: string;
  nickname: string;
}

export interface LeaveRoomPayload {
  playerId: string;
}

export interface SubmitAnswerPayload {
  questionId: string;
  answerId: string;
}

// ============================================================================
// UTILITY PAYLOADS
// ============================================================================

export interface GetRoomInfoPayload {
  pin?: string;
  roomId?: string;
}

// ============================================================================
// ACTIVE QUESTION (from GameService)
// ============================================================================

export interface ActiveQuestion {
  sessionId: string;
  questionId: string;
  questionIndex: number;
  startedAt: number;
  durationMs: number;
}
