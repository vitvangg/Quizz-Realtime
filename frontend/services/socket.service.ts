import { io, Socket } from 'socket.io-client';
import {
  RoomJoinedPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  RoomLeftPayload,
  RoomErrorPayload,
} from '@/types/room.type';

type SocketEventCallback<T = any> = (data: T) => void;

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<SocketEventCallback>> = new Map();

  connect(url: string = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000') {
    if (this.socket?.connected) {
      console.log('[Socket] Already connected');
      return this.socket;
    }

    console.log('[Socket] Connecting to', url);
    
    this.socket = io(`${url}/game`, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
      this.notifyListeners('connection', { connected: true, socketId: this.socket?.id });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.notifyListeners('disconnection', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      this.notifyListeners('error', { message: error.message });
    });

    // Re-emit custom events to listeners
    this.socket.on('room_joined', (data: RoomJoinedPayload) => this.notifyListeners('room_joined', data));
    this.socket.on('player_joined', (data: PlayerJoinedPayload) => this.notifyListeners('player_joined', data));
    this.socket.on('player_left', (data: PlayerLeftPayload) => this.notifyListeners('player_left', data));
    this.socket.on('room_left', (data: RoomLeftPayload) => this.notifyListeners('room_left', data));
    this.socket.on('error', (data: RoomErrorPayload) => this.notifyListeners('room_error', data));
    this.socket.on('pong', (data: any) => this.notifyListeners('pong', data));

    // Game events
    this.socket.on('game_starting', (data: any) => this.notifyListeners('game_starting', data));
    this.socket.on('countdown_tick', (data: any) => this.notifyListeners('countdown_tick', data));
    this.socket.on('question_start', (data: any) => this.notifyListeners('question_start', data));
    this.socket.on('answer_received', (data: any) => this.notifyListeners('answer_received', data));
    this.socket.on('player_answered', (data: any) => this.notifyListeners('player_answered', data));
    this.socket.on('question_result', (data: any) => this.notifyListeners('question_result', data));
    this.socket.on('leaderboard', (data: any) => this.notifyListeners('leaderboard', data));
    this.socket.on('game_end', (data: any) => this.notifyListeners('game_end', data));

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  emit(event: string, data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit(event, data, (response: any) => {
        if (response?.success === false || response?.error) {
          reject(response);
        } else {
          resolve(response);
        }
      });
    });
  }

  on(event: string, callback: SocketEventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private notifyListeners(event: string, data: any) {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Socket] Error in ${event} listener:`, error);
      }
    });
  }

  async joinRoom(pin: string, nickname: string) {
    return this.emit('join_room', { pin, nickname });
  }

  async joinById(roomId: string, nickname: string) {
    return this.emit('join_by_id', { roomId, nickname });
  }

  async leaveRoom(roomId: string) {
    return this.emit('leave_room', { roomId });
  }

  async getRoomState(roomId: string) {
    return this.emit('get_room_state', { roomId });
  }

  ping() {
    this.emit('ping');
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

export const socketService = new SocketService();
