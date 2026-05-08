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

// ============================================================================
// WEBSOCKET EVENT TYPES
// ============================================================================

// ---------- HOST EVENTS ----------

/** Host gửi khi kết nối vào room để quản lý */
export interface HostJoinRoomPayload {
  roomId: string;
}

/** Server gửi cho host khi join thành công */
export interface HostJoinedRoomResponse {
  success: boolean;
  room: Room;
  players: Player[];
}

/** Host gửi khi kick player */
export interface HostKickPlayerPayload {
  playerId: string;
}

/** Server gửi cho host khi kick thành công */
export interface HostPlayerKickedResponse {
  success: boolean;
  playerId: string;
}

/** Host gửi khi bắt đầu game */
export interface HostStartGamePayload {
  roomId: string;
}

/** Server gửi cho host khi game bắt đầu */
export interface HostGameStartedResponse {
  success: boolean;
  session: GameSession;
}

/** Host gửi khi đóng phòng */
export interface HostCloseRoomPayload {}

// ---------- PLAYER EVENTS ----------

/** Player gửi khi tham gia phòng qua PIN */
export interface PlayerJoinRoomPayload {
  pin: string;
  nickname: string;
}

/** Server gửi cho player khi join thành công */
export interface PlayerJoinedRoomResponse {
  player: Player;
  room: Room;
}

/** Server gửi cho tất cả (bao gồm host) khi có player mới */
export interface PlayerJoinedPayload {
  player: Player;
}

/** Player gửi khi rời phòng */
export interface PlayerLeaveRoomPayload {
  playerId: string;
}

/** Server gửi cho tất cả khi player rời/kicked */
export interface PlayerLeftPayload {
  playerId: string;
  nickname?: string;
  kicked: boolean;
  disconnected?: boolean;
}

/** Server gửi cho player bị kick */
export interface PlayerKickedPayload {
  playerId: string;
  reason: string;
}

// ---------- GAME EVENTS ----------

/** Server gửi cho tất cả khi game bắt đầu */
export interface GameStartingPayload {
  sessionId: string;
  countdown: number;
  totalQuestions: number;
}

/** Server gửi khi có câu hỏi mới */
export interface QuestionStartPayload {
  sessionId: string;
  questionIndex: number;
  question: Question;
  timeLimit: number;
}

/** Server gửi khi room bị đóng */
export interface RoomClosedPayload {
  reason: string;
}

// ---------- UTILITY ----------

/** Get room info */
export interface GetRoomInfoPayload {
  pin?: string;
  roomId?: string;
}

/** Error response */
export interface ErrorPayload {
  code: string;
  message: string;
}
