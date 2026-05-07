// Game Types

export interface User {
  id: string;
  email: string;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  questions?: Question[];
  questionCount?: number;
  category?: string;
  timePerQuestion?: number;
  isPublic?: boolean;
}

export interface Question {
  id: string;
  quizId: string;
  content: string;
  timeLimit: number;
  orderIndex: number;
  answers?: Answer[];
}

export interface Answer {
  id: string;
  questionId: string;
  content: string;
  isCorrect: boolean;
}

export interface Room {
  id: string;
  pin: string;
  quizId: string;
  hostId: string;
  status: RoomStatus;
  createdAt: string;
  quiz?: Quiz;
  players: Player[];
  host?: User;
}

export enum RoomStatus {
  WAITING = 'WAITING',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED',
}

export interface Player {
  id: string;
  roomId: string;
  nickname: string;
  joinedAt: string;
  isHost?: boolean;
  isReady?: boolean;
}

export interface GameSession {
  id: string;
  roomId: string;
  status: RoomStatus;
  startedAt: string;
  endedAt?: string;
  currentQuestionIndex: number;
  questionStartedAt?: string;
  room?: Room;
  players?: PlayerSession[];
  currentQuestion?: Question;
  totalQuestions?: number;
}

export interface PlayerSession {
  id: string;
  playerId: string;
  sessionId: string;
  score: number;
  player?: Player;
}

// WebSocket Event Payloads
export interface JoinRoomPayload {
  pin: string;
  nickname: string;
  userId?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  player?: Player;
  room?: Room;
  error?: string;
}

export interface PlayerJoinedPayload {
  player: Player;
}

export interface PlayerLeftPayload {
  playerId: string;
  nickname?: string;
}

export interface PlayerKickedPayload {
  playerId: string;
  reason: string;
}

export interface RoomUpdatedPayload {
  room: Room;
  players: Player[];
}

export interface GameStartingPayload {
  sessionId: string;
  countdown: number;
  totalQuestions: number;
}

export interface QuestionStartPayload {
  sessionId: string;
  questionIndex: number;
  question: Question;
  timeLimit: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}
