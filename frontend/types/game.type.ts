export enum GameState {
  WAITING = 'WAITING',
  STARTING = 'STARTING',
  QUESTION_ACTIVE = 'QUESTION_ACTIVE',
  QUESTION_RESULT = 'QUESTION_RESULT',
  LEADERBOARD = 'LEADERBOARD',
  FINISHED = 'FINISHED',
}

export interface Answer {
  id: string;
  content: string;
}

export interface Question {
  id: string;
  content: string;
  answers: Answer[];
  timeLimit: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
}

export interface GameStateData {
  sessionId: string;
  roomId: string;
  status: GameState;
  currentQuestionIndex: number;
  cachedStatus?: GameState;
}

export interface GameStartingPayload {
  sessionId: string;
  countdown: number;
}

export interface CountdownTickPayload {
  remaining: number;
}

export interface QuestionStartPayload {
  sessionId: string;
  questionIndex: number;
  question: Question;
  totalQuestions: number;
  serverTime: number;
}

export interface QuestionResultPayload {
  correctAnswer: Answer;
  leaderboard: LeaderboardEntry[];
  isLastQuestion: boolean;
  serverTime: number;
}

export interface GameEndedPayload {
  leaderboard: LeaderboardEntry[];
  totalQuestions: number;
}

export interface GameJoinedPayload {
  state: GameStateData;
}

export interface SubmitAnswerPayload {
  sessionId: string;
  playerId: string;
  questionId: string;
  answerId: string;
  clientTimestamp: number;
}

export interface SubmitAnswerResponse {
  success: boolean;
  scoreEarned?: number;
  isCorrect?: boolean;
}
