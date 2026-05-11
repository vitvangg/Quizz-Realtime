import { Question } from './quiz.type';

export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface Player {
  id: string;
  nickname: string;
  isHost?: boolean;
  joinedAt?: string;
}

export interface Quiz {
  id: string;
  title: string;
  questionCount: number;
  questions?: Question[];
}

export interface Room {
  id: string;
  pin: string;
  status: RoomStatus;
  hostId: string;
  quiz: Quiz;
  players: Player[];
  createdAt?: string;
}

export interface JoinRoomResponse {
  room: Room;
  player: Player;
}

export interface CreateRoomResponse {
  id: string;
  pin: string;
  status: RoomStatus;
  hostId: string;
  quiz: Quiz;
  players: Player[];
}

// WebSocket Payload types
export interface JoinRoomPayload {
  pin: string;
  nickname: string;
}

export interface JoinByIdPayload {
  roomId: string;
  nickname: string;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface RoomJoinedPayload {
  room: {
    id: string;
    pin: string;
    status: RoomStatus;
    hostId: string;
  };
  player: Player;
  players: Player[];
  quiz: {
    id: string;
    title: string;
    questionCount: number;
  };
}

export interface PlayerJoinedPayload {
  player: Player;
  playerCount: number;
  joinedBy?: string;
}

export interface PlayerLeftPayload {
  playerId: string;
  nickname: string;
  playerCount: number;
}

export interface RoomLeftPayload {
  roomId: string;
  message: string;
}

export interface RoomErrorPayload {
  message: string;
  code?: string;
}
