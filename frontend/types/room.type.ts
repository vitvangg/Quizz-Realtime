export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  joinedAt?: string;
}

export interface Quiz {
  id: string;
  title: string;
  questionCount: number;
}

export interface Room {
  id: string;
  pin: string;
  status: RoomStatus;
  hostId: string;
  quiz?: Quiz;
  players?: Player[];
}

export interface RoomJoinedPayload {
  room: Room;
  player: Player;
  players: Player[];
  quiz: Quiz;
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
  isHost?: boolean;
}

export interface CreateRoomDto {
  quizId: string;
  pin?: string;
}

export interface JoinRoomDto {
  pin: string;
  nickname: string;
}
