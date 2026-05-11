export interface AnswerPayload {
  playerId: string;
  playerSessionId?: string;
  sessionId: string;
  questionId: string;
  answerId: string;
  responseTimeMs: number;
  scoreEarned?: number;
  timestamp: number;
}

export interface LeaderboardEntry {
  playerId: string;
  score: number;
}

export interface SessionState {
  sessionId: string;
  roomId: string;
  currentQuestionId?: string;
  questionStartedAt?: number;
  totalPlayers: number;
  answeredPlayers: number;
}

export interface PlayerAnswerResult {
  isCorrect: boolean;
  correctAnswerId?: string;
  scoreEarned: number;
  rank?: number;
}
