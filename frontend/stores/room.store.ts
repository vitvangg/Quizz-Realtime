import { create } from 'zustand';
import { toast } from 'sonner';
import { Room, Player } from '@/types/room.type';
import { roomService } from '@/services/room.service';
import { socketService } from '@/services/socket.service';

interface RoomState {
  // State
  currentRoom: Room | null;
  players: Player[];
  myPlayer: Player | null;
  isHost: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  loading: boolean;
  error: string | null;

  // Actions
  createRoom: (quizId: string) => Promise<Room | null>;
  getRoom: (roomId: string) => Promise<Room | null>;
  getRoomByPin: (pin: string) => Promise<Room | null>;
  joinRoom: (pin: string, nickname: string) => Promise<boolean>;
  joinRoomById: (roomId: string, nickname: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  connectSocket: () => void;
  disconnectSocket: () => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  currentRoom: null,
  players: [],
  myPlayer: null,
  isHost: false,
  connectionStatus: 'disconnected',
  loading: false,
  error: null,

  createRoom: async (quizId: string) => {
    try {
      set({ loading: true, error: null });
      
      const room = await roomService.create(quizId);
      
      set({
        currentRoom: room,
        players: room.players || [],
        isHost: true,
      });

      toast.success('Đã tạo phòng thành công!');
      
      // Connect to socket
      get().connectSocket();
      
      return room;
    } catch (error: any) {
      const message = error.response?.data?.message || 'Tạo phòng thất bại';
      set({ error: message });
      toast.error(message);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  getRoom: async (roomId: string) => {
    try {
      set({ loading: true, error: null });
      const room = await roomService.getById(roomId);
      set({ currentRoom: room });
      return room;
    } catch (error: any) {
      const message = error.response?.data?.message || 'Không tìm thấy phòng';
      set({ error: message });
      toast.error(message);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  getRoomByPin: async (pin: string) => {
    try {
      set({ loading: true, error: null });
      const room = await roomService.getById(pin);
      return room;
    } catch (error: any) {
      const message = error.response?.data?.message || 'Không tìm thấy phòng';
      set({ error: message });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  joinRoom: async (pin: string, nickname: string) => {
    try {
      set({ loading: true, error: null, connectionStatus: 'connecting' });

      // Connect socket first
      socketService.connect();

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
        
        socketService.on('connection', () => {
          clearTimeout(timeout);
          resolve();
        });

        socketService.on('error', (data: any) => {
          clearTimeout(timeout);
          reject(data);
        });
      });

      // Join room via socket
      await socketService.joinRoom(pin, nickname);
      
      return true;
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Tham gia phòng thất bại';
      set({ error: message });
      toast.error(message);
      return false;
    } finally {
      set({ loading: false });
    }
  },

  joinRoomById: async (roomId: string, nickname: string) => {
    try {
      set({ loading: true, error: null, connectionStatus: 'connecting' });

      // Connect socket first
      socketService.connect();

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
        
        socketService.on('connection', () => {
          clearTimeout(timeout);
          resolve();
        });

        socketService.on('error', (data: any) => {
          clearTimeout(timeout);
          reject(data);
        });
      });

      // Join room via socket
      await socketService.joinById(roomId, nickname);
      
      return true;
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Tham gia phòng thất bại';
      set({ error: message });
      toast.error(message);
      return false;
    } finally {
      set({ loading: false });
    }
  },

  leaveRoom: async () => {
    const { currentRoom } = get();
    
    try {
      if (currentRoom) {
        await socketService.leaveRoom(currentRoom.id);
      }
    } catch (error) {
      console.error('Leave room error:', error);
    } finally {
      socketService.disconnect();
      get().reset();
    }
  },

  connectSocket: () => {
    socketService.connect();

    // Set up listeners
    socketService.on('connection', () => {
      set({ connectionStatus: 'connected' });
    });

    socketService.on('disconnection', () => {
      set({ connectionStatus: 'disconnected' });
    });

    socketService.on('room_joined', (data) => {
      set({
        currentRoom: {
          ...get().currentRoom!,
          id: data.room.id,
          pin: data.room.pin,
          status: data.room.status,
          hostId: data.room.hostId,
        },
        myPlayer: data.player,
        players: data.players,
        isHost: data.player.id === data.room.hostId,
        connectionStatus: 'connected',
      });
    });

    socketService.on('player_joined', (data) => {
      const { players } = get();
      if (!players.find((p) => p.id === data.player.id)) {
        set({ players: [...players, data.player] });
      }
      toast.info(`${data.player.nickname} đã tham gia!`);
    });

    socketService.on('player_left', (data) => {
      const { players } = get();
      set({ players: players.filter((p) => p.id !== data.playerId) });
      toast.info(`${data.nickname} đã rời phòng`);
    });

    socketService.on('room_left', () => {
      get().reset();
    });

    socketService.on('room_error', (data) => {
      set({ error: data.message });
      toast.error(data.message);
    });
  },

  disconnectSocket: () => {
    socketService.disconnect();
    set({ connectionStatus: 'disconnected' });
  },

  reset: () => {
    set({
      currentRoom: null,
      players: [],
      myPlayer: null,
      isHost: false,
      connectionStatus: 'disconnected',
      loading: false,
      error: null,
    });
  },
}));
