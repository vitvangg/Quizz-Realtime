import { create } from 'zustand';
import { toast } from 'sonner';
import { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';
import { Room, Player, RoomJoinedPayload, PlayerJoinedPayload, PlayerLeftPayload } from '@/types/room.type';
import { roomService } from '@/services/room.service';
import axios from 'axios';

interface RoomState {
  socket: Socket | null;
  isConnected: boolean;
  currentRoom: Room | null;
  currentPlayer: Player | null;
  players: Player[];
  isHost: boolean;
  loading: boolean;
  error: string | null;

  connectSocket: () => void;
  disconnectSocket: () => void;
  createRoom: (quizId: string) => Promise<Room>;
  joinRoom: (pin: string, nickname: string) => Promise<void>;
  joinRoomById: (roomId: string, nickname: string, jwt?: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  getRoomState: (roomId: string) => Promise<void>;
  setCurrentRoom: (room: Room | null) => void;
  setAsHost: (playerId: string, nickname: string) => void;
  clearError: () => void;
  reset: () => void;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

export const useRoomStore = create<RoomState>((set, get) => ({
  socket: null,
  isConnected: false,
  currentRoom: null,
  currentPlayer: null,
  players: [],
  isHost: false,
  loading: false,
  error: null,

  connectSocket: () => {
    const { socket } = get();
    if (socket) return; // already initialized with shared socket

    const newSocket = getSocket();

    newSocket.on('connect', () => {
      console.log('[Socket] Connected:', newSocket.id);
      set({ isConnected: true, error: null });
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      set({ isConnected: false });
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
      set({ isConnected: true });
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      set({ error: 'Không thể kết nối server', isConnected: false });
    });

    // CRITICAL: Actually connect the socket (autoConnect: false in socket.ts)
    if (!newSocket.connected) {
      console.log('[RoomStore] Connecting socket...');
      newSocket.connect();
    }

    newSocket.on('room_joined', (data: RoomJoinedPayload) => {
      console.log('[Socket] Room joined:', data);
      set({
        currentRoom: data.room,
        currentPlayer: data.player,
        players: data.players,
        isHost: data.player.isHost,
        error: null,
      });
    });

    newSocket.on('player_joined', (data: PlayerJoinedPayload) => {
      console.log('[Socket] Player joined:', data);
      set((state) => ({
        players: [
          ...state.players.filter(p => p.id !== data.player.id),
          data.player,
        ],
      }));
      toast.success(`${data.player.nickname} đã tham gia!`);
    });

    newSocket.on('player_left', (data: PlayerLeftPayload) => {
      console.log('[Socket] Player left:', data);
      set((state) => ({
        players: state.players.filter(p => p.id !== data.playerId),
      }));
      toast.info(`${data.nickname} đã rời phòng`);
    });

    newSocket.on('host_left', (data: { roomId: string }) => {
      console.log('[Socket] Host left:', data);
      // This will be handled by the WaitingScreen component for redirect
    });

    newSocket.on('room_left', (data: { roomId: string; message: string; isHost?: boolean }) => {
      console.log('[Socket] Room left:', data);
      // Don't clear state here - let the page handle redirect
    });

    newSocket.on('error', (error: { message: string }) => {
      console.error('[Socket] Error:', error);
      set({ error: error.message });
      toast.error(error.message);
    });

    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    // Socket is shared — never disconnect it here.
    set({ socket: null, isConnected: false });
  },

  createRoom: async (quizId: string) => {
    try {
      set({ loading: true, error: null });
      const room = await roomService.create({ quizId });
      set({ currentRoom: room, isHost: true });
      return room;
    } catch (error) {
      const message = getErrorMessage(error, 'Tạo phòng thất bại');
      set({ error: message });
      toast.error(message);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  joinRoom: (pin: string, nickname: string) => {
    return new Promise<void>((resolve, reject) => {
      const { socket, connectSocket } = get();
      
      console.log('[RoomStore] joinRoom called:', { pin, nickname, socketConnected: socket?.connected });
      
      // Ensure socket is connected
      const currentSocket = socket?.connected ? socket : null;
      
      if (!currentSocket) {
        console.log('[RoomStore] Socket not connected, connecting...');
        connectSocket();
        
        // Wait for connection then join
        const timeout = setTimeout(() => {
          cleanup();
          console.log('[RoomStore] Join timeout');
          reject(new Error('Connection timeout'));
        }, 10000);

        const cleanup = () => {
          clearTimeout(timeout);
          offRoomJoined();
        };

        const offRoomJoined = () => {
          const s = get().socket;
          if (s) {
            s.off('room_joined', onRoomJoined);
            s.off('error', onError);
          }
        };

        const onRoomJoined = (data: RoomJoinedPayload) => {
          console.log('[RoomStore] room_joined event received:', data);
          cleanup();
          // Save playerId so game page can recover after redirect (window.location.href)
          if (data.player?.id) {
            sessionStorage.setItem('playerId', data.player.id);
            sessionStorage.setItem('playerNickname', data.player.nickname);
            sessionStorage.setItem('currentRoomId', data.room.id);
            sessionStorage.setItem('isHost', 'false');
          }
          resolve();
        };

        const onError = (error: { message: string }) => {
          console.log('[RoomStore] error event received:', error);
          cleanup();
          reject(new Error(error.message));
        };

        // Wait for connection then emit
        const tryJoin = () => {
          const s = get().socket;
          if (s?.connected) {
            clearTimeout(timeout);
            console.log('[RoomStore] Socket connected, emitting join_room');
            
            s.on('room_joined', onRoomJoined);
            s.on('error', onError);
            
            s.emit('join_room', { pin, nickname }, (response: any) => {
              console.log('[RoomStore] join_room callback:', response);
              if (!response?.success) {
                cleanup();
                reject(new Error(response?.message || 'Join failed'));
              }
            });
          } else {
            setTimeout(tryJoin, 100);
          }
        };

        setTimeout(tryJoin, 100);
      } else {
        // Already connected
        console.log('[RoomStore] Socket already connected, emitting join_room');
        currentSocket.emit('join_room', { pin, nickname }, (response: any) => {
          console.log('[RoomStore] join_room callback:', response);
          if (!response?.success) {
            reject(new Error(response?.message || 'Join failed'));
          }
          // Resolve when room_joined event is received
          const onRoomJoined = (data: RoomJoinedPayload) => {
            currentSocket.off('room_joined', onRoomJoined);
            if (data.player?.id) {
              sessionStorage.setItem('playerId', data.player.id);
              sessionStorage.setItem('playerNickname', data.player.nickname);
              sessionStorage.setItem('currentRoomId', data.room.id);
              sessionStorage.setItem('isHost', 'false');
            }
            resolve();
          };
          currentSocket.on('room_joined', onRoomJoined);
        });
      }
    });
  },

  joinRoomById: async (roomId: string, nickname: string, jwt?: string) => {
    // Always call connectSocket — it no-ops if socket already exists.
    const { connectSocket } = get();

    if (!get().socket) {
      connectSocket();
      // Wait for socket to connect
      await new Promise<void>((resolve) => {
        const checkConnection = setInterval(() => {
          if (get().isConnected) {
            clearInterval(checkConnection);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          clearInterval(checkConnection);
          resolve();
        }, 5000);
      });
    }

    return new Promise<void>((resolve, reject) => {
      // Read socket AFTER it is guaranteed to exist and be connected.
      const currentSocket = get().socket;
      if (!currentSocket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      currentSocket.emit('join_by_id', { roomId, nickname, jwt }, (response: any) => {
        if (response.success) {
          if (response.playerId) {
            sessionStorage.setItem('playerId', response.playerId);
            sessionStorage.setItem('playerNickname', nickname);
            sessionStorage.setItem('currentRoomId', roomId);
            sessionStorage.setItem('isHost', 'false');
          }
          resolve();
        } else {
          reject(new Error(response.message || 'Join failed'));
        }
      });
    });
  },

  leaveRoom: async () => {
    const { socket, currentRoom, currentPlayer } = get();
    
    if (socket && currentRoom) {
      socket.emit('leave_room', { roomId: currentRoom.id });
    }
    
    set({
      currentRoom: null,
      currentPlayer: null,
      players: [],
      isHost: false,
    });
  },

  getRoomState: async (roomId: string) => {
    try {
      set({ loading: true });
      const room = await roomService.getById(roomId);
      set({ currentRoom: room });
      // Ensure sessionStorage is set (may have been missed if room_joined fired before storage was ready)
      if (room) {
        const storedRoomId = sessionStorage.getItem('currentRoomId');
        if (!storedRoomId || storedRoomId !== roomId) {
          // Only set if not already a host (hostSessionId takes precedence)
          if (!sessionStorage.getItem('hostSessionId')) {
            sessionStorage.setItem('currentRoomId', roomId);
          }
        }
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Không tìm thấy phòng');
      set({ error: message });
      toast.error(message);
    } finally {
      set({ loading: false });
    }
  },

  setCurrentRoom: (room: Room | null) => {
    set({ currentRoom: room });
  },

  setAsHost: (playerId: string, nickname: string) => {
    set({
      currentPlayer: {
        id: playerId,
        nickname,
        isHost: true,
      },
      isHost: true,
    });
  },

  clearError: () => set({ error: null }),

  reset: () => {
    const { disconnectSocket } = get();
    disconnectSocket();
    set({
      socket: null,
      isConnected: false,
      currentRoom: null,
      currentPlayer: null,
      players: [],
      isHost: false,
      loading: false,
      error: null,
    });
  },
}));
