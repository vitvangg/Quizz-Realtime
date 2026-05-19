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
    if (socket) {
      console.log('[RoomStore] connectSocket: socket already exists, skipping listener registration');
      return; // already initialized with shared socket
    }

    const newSocket = getSocket();
    
    // Track listener count for debugging
    let listenerCount = 0;
    const registerListener = (event: string, handler: (...args: any[]) => void) => {
      listenerCount++;
      console.log(`[RoomStore] Registering listener #${listenerCount}: ${event}`);
      newSocket.on(event, handler);
    };

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

    // DEBUG: Log socket id and listener count before registering
    console.log('[RoomStore] About to register listeners, socket.id:', newSocket.id);

    registerListener('room_joined', (data: RoomJoinedPayload) => {
      console.log('[Socket] room_joined received:', JSON.stringify(data));
      
      // DEBUG: Validate entire payload
      if (!data) {
        console.error('[Socket] room_joined: data is null/undefined!');
        return;
      }
      if (!data.room) {
        console.error('[Socket] room_joined: data.room is undefined!');
        return;
      }
      if (!data.player) {
        console.error('[Socket] room_joined: data.player is undefined!');
        return;
      }
      if (!data.players) {
        console.error('[Socket] room_joined: data.players is undefined!');
        return;
      }
      
      set({
        currentRoom: data.room,
        currentPlayer: data.player,
        players: Array.isArray(data.players) ? data.players : [],
        isHost: data.player?.isHost ?? false,
        error: null,
      });
    });

    registerListener('player_joined', (data: any) => {
      console.log('[Socket] player_joined received:', JSON.stringify(data));
      
      // CRITICAL: Handle TWO different payload shapes from different gateways:
      // - RoomGateway: { player: { id, nickname }, playerCount, joinedBy }
      // - GameGateway: { playerId, nickname, timestamp }
      
      // Normalize payload to consistent format
      let playerId: string | undefined;
      let playerNickname: string | undefined;
      
      if (data.player) {
        // RoomGateway format
        playerId = data.player.id;
        playerNickname = data.player.nickname;
      } else if (data.playerId) {
        // GameGateway format
        playerId = data.playerId;
        playerNickname = data.nickname;
      }
      
      // DEBUG: Validate normalized payload
      if (!playerId) {
        console.error('[Socket] player_joined: playerId is undefined! Raw data:', JSON.stringify(data));
        return;
      }
      
      set((state) => {
        console.log('[Socket] player_joined: current players state:', JSON.stringify(state.players));
        
        // Defensive: ensure players is an array
        const safePlayers = Array.isArray(state.players) ? state.players : [];
        
        // Filter with safety check
        const filtered = safePlayers.filter(p => p && p.id && p.id !== playerId);
        console.log('[Socket] player_joined: after filter:', JSON.stringify(filtered));
        
        return {
          players: [...filtered, { id: playerId!, nickname: playerNickname || 'Unknown', isHost: false }]
        };
      });
      toast.success(`${playerNickname || 'Player'} đã tham gia!`);
    });

    registerListener('player_left', (data: any) => {
      console.log('[Socket] player_left received:', JSON.stringify(data));
      
      // CRITICAL: Handle TWO different payload shapes from different gateways:
      // - RoomGateway: { playerId, nickname, playerCount, isHost }
      // - GameGateway: { playerId, nickname, timestamp }
      
      // Normalize payload - extract playerId
      const playerId = data.playerId;
      
      // DEBUG: Validate payload
      if (!playerId) {
        console.error('[Socket] player_left: playerId is undefined! Raw data:', JSON.stringify(data));
        return;
      }
      
      set((state) => {
        console.log('[Socket] player_left: current players state:', JSON.stringify(state.players));
        
        // Defensive: ensure players is an array
        const safePlayers = Array.isArray(state.players) ? state.players : [];
        
        // Filter with safety check
        const filtered = safePlayers.filter(p => p && p.id && p.id !== playerId);
        console.log('[Socket] player_left: after filter:', JSON.stringify(filtered));
        
        return {
          players: filtered
        };
      });
      
      if (data.nickname) {
        toast.info(`${data.nickname} đã rời phòng`);
      }
    });

    registerListener('player_reconnecting', (data: { playerId: string; nickname: string; gracePeriodMs: number }) => {
      console.log('[Socket] player_reconnecting received:', JSON.stringify(data));
      toast.warning(`${data.nickname} đang kết nối lại...`, {
        duration: Math.min(data.gracePeriodMs, 5000),
      });
    });

    registerListener('player_reconnected', (data: { playerId: string; nickname: string; timestamp: number }) => {
      console.log('[Socket] player_reconnected received:', JSON.stringify(data));
      toast.success(`${data.nickname} đã quay lại!`);
    });

    registerListener('host_left', (data: { roomId: string }) => {
      console.log('[Socket] host_left received:', JSON.stringify(data));
    });

    registerListener('room_left', (data: { roomId: string; message: string; isHost?: boolean }) => {
      console.log('[Socket] room_left received:', JSON.stringify(data));
    });

    registerListener('error', (error: { message: string }) => {
      console.error('[Socket] error received:', JSON.stringify(error));
      set({ error: error.message });
      toast.error(error.message);
    });

    console.log('[RoomStore] connectSocket: registered', listenerCount, 'listeners, socket.id:', newSocket.id);
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
