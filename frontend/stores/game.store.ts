import { create } from 'zustand';
import { toast } from 'sonner';
import { Socket } from 'socket.io-client';
import { getGameSocket, connectGameSocket } from '@/lib/game-socket';
import { GameState, Question, LeaderboardEntry } from '@/types/game.type';
import { useAuthStore } from './auth.store';

interface PlayerStatus {
  playerId: string;
  nickname: string;
  connection: 'CONNECTED' | 'DISCONNECTED';
  isHost: boolean;
  lastSeen: number;
}

interface GameStore {
  socket: Socket | null;
  isConnected: boolean;
  _pendingRedirect: string | null;
  _pendingSessionSwitch: { oldSessionId: string; newSessionId: string } | null;
  // Flag to indicate HTTP state recovery is in progress
  // Used to skip socket events during recovery phase
  _isRecovering: boolean;

  // Track player connection statuses (from player_status events)
  playerStatuses: Map<string, PlayerStatus>;

  sessionId: string | null;
  roomId: string | null;
  gameStatus: GameState;
  isHost: boolean;

  // Freeze / Hard Lockdown (Dev's feature)
  isFrozen: boolean;
  freezeMessage: string;

  // Maintenance Mode (Your feature)
  isMaintenance: boolean;
  maintenanceMessage: string;

  currentQuestion: Question | null;
  questionIndex: number;
  totalQuestions: number;
  questionStartTime: number;

  timeRemaining: number;
  hasAnswered: boolean;
  selectedAnswerId: string | null;

  leaderboard: LeaderboardEntry[];

  myPlayerId: string | null;
  myNickname: string | null;
  myScore: number;
  myRank: number | null;

  countdown: number;
  correctAnswerId: string | null;

  connectSocket: () => void;
  disconnectSocket: () => void;

  // Player status tracking
  setPlayerStatus: (status: PlayerStatus) => void;
  getPlayerStatus: (playerId: string) => PlayerStatus | undefined;
  clearPlayerStatuses: () => void;

  joinGame: (sessionId: string, roomId: string, playerId: string, nickname: string, isHost: boolean) => void;

  startGame: (roomId: string) => Promise<string | null>;
  nextQuestion: () => Promise<void>;
  endGame: () => Promise<void>;
  playAgain: (sessionId: string, roomId: string) => Promise<string | null>;
  getGameState: () => Promise<void>;
  submitAnswer: (answerId: string) => void;

  setQuestionStartTime: (time: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  socket: null,
  isConnected: false,
  _pendingRedirect: null,
  _pendingSessionSwitch: null,
  _isRecovering: false,

  // Track player connection statuses
  playerStatuses: new Map(),

  sessionId: null,
  roomId: null,
  gameStatus: GameState.WAITING,
  isHost: false,

  isFrozen: false,
  freezeMessage: '',

  isMaintenance: false,
  maintenanceMessage: '',

  currentQuestion: null,
  questionIndex: 0,
  totalQuestions: 0,
  questionStartTime: 0,

  timeRemaining: 0,
  hasAnswered: false,
  selectedAnswerId: null,

  leaderboard: [],

  myPlayerId: null,
  myNickname: null,
  myScore: 0,
  myRank: null,

  countdown: 0,
  correctAnswerId: null,

  // Player status tracking methods
  setPlayerStatus: (status: PlayerStatus) => {
    const newMap = new Map(get().playerStatuses);
    newMap.set(status.playerId, status);
    set({ playerStatuses: newMap });
  },

  getPlayerStatus: (playerId: string) => {
    return get().playerStatuses.get(playerId);
  },

  clearPlayerStatuses: () => {
    set({ playerStatuses: new Map() });
  },

  connectSocket: () => {
    const { socket } = get();
    if (socket) return;

    const newSocket = getGameSocket();

    if (!newSocket.connected) {
      console.log('[GameStore] Connecting game socket...');
      connectGameSocket();
    }

    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    set({ socket: null, isConnected: false });
  },

  joinGame: (sessionId, roomId, playerId, nickname, isHost) => {
    const { socket, connectSocket } = get();
    if (!socket?.connected) connectSocket();

    const currentSocket = get().socket;
    if (!currentSocket) return;

    currentSocket.emit(
      'join_game',
      { sessionId, playerId, nickname },
      (response: any) => {
        if (response.success) {
          set({
            sessionId,
            roomId,
            myPlayerId: playerId,
            myNickname: nickname,
            isHost,
            gameStatus: response.state?.status || GameState.WAITING,
          });
        }
      }
    );
  },

  startGame: async (roomId: string) => {
    const { socket, connectSocket } = get();
    if (!socket?.connected) {
      connectSocket();
      await new Promise<void>(r => {
        const i = setInterval(() => { if (get().isConnected) { clearInterval(i); r(); } }, 50);
      });
    }

    const currentSocket = get().socket;
    if (!currentSocket) return null;

    const authStore = useAuthStore.getState();
    return new Promise((resolve) => {
      currentSocket.emit('host_start_game', { roomId, jwt: authStore.accessToken }, (res: any) => {
        if (res.success) {
          set({ sessionId: res.sessionId, roomId, isHost: true });
          resolve(res.sessionId);
        } else {
          toast.error(res.error || 'Failed to start game');
          resolve(null);
        }
      });
    });
  },

  nextQuestion: () => {
    return new Promise((resolve, reject) => {
      const { socket, sessionId } = get();
      if (!socket || !sessionId) return reject(new Error('Not in game'));
      socket.emit('host_next_question', { sessionId }, (res: any) => {
        if (res.success) resolve();
        else { toast.error(res.error); reject(new Error(res.error)); }
      });
    });
  },

  endGame: () => {
    return new Promise((resolve, reject) => {
      const { socket, sessionId } = get();
      if (!socket || !sessionId) return reject(new Error('Not in game'));
      socket.emit('host_end_game', { sessionId }, (res: any) => {
        if (res.success) resolve();
        else { toast.error(res.error); reject(new Error(res.error)); }
      });
    });
  },

  playAgain: async (sessionId: string, roomId: string) => {
    const { socket, connectSocket } = get();
    if (!socket?.connected) connectSocket();

    const currentSocket = get().socket;
    if (!currentSocket) return null;

    return new Promise((resolve, reject) => {
      currentSocket.emit('host_play_again', { sessionId, roomId }, (res: any) => {
        if (res.success) {
          set({
            sessionId: res.sessionId,
            roomId,
            isHost: true,
            gameStatus: GameState.WAITING,
            currentQuestion: null,
            hasAnswered: false,
            selectedAnswerId: null,
            leaderboard: [],
            countdown: 0,
            correctAnswerId: null,
          });
          resolve(res.sessionId);
        } else {
          toast.error(res.error);
          reject(new Error(res.error));
        }
      });
    });
  },

  getGameState: () => {
    return new Promise((resolve, reject) => {
      const { socket, sessionId } = get();
      if (!socket || !sessionId) return reject(new Error('Not in game'));
      socket.emit('get_game_state', { sessionId }, (res: any) => {
        console.log('[game.store.ts] getGameState response:', JSON.stringify(res));
        if (res.success) {
          const safeLeaderboard = Array.isArray(res.leaderboard) ? res.leaderboard : [];
          console.log('[game.store.ts] Setting leaderboard:', JSON.stringify(safeLeaderboard));
          set({
            gameStatus: res.state.status,
            leaderboard: safeLeaderboard,
            sessionId: res.state.sessionId,
            roomId: res.state.roomId,
          });
          resolve();
        } else {
          console.error('[game.store.ts] getGameState failed:', res.error);
          reject(new Error(res.error));
        }
      });
    });
  },

  submitAnswer: (answerId: string) => {
    const { socket, sessionId, myPlayerId, currentQuestion, hasAnswered } = get();

    if (!socket || !sessionId) return toast.error('Chưa kết nối game');
    if (!myPlayerId) return toast.error('Không tìm thấy player ID');
    if (!currentQuestion || hasAnswered) return;

    set({ hasAnswered: true, selectedAnswerId: answerId });

    socket.emit('submit_answer', {
      sessionId,
      playerId: myPlayerId,
      questionId: currentQuestion.id,
      answerId,
      clientTimestamp: Date.now(),
    }, (res: any) => {
      if (!res.success) {
        toast.error(res.message || 'Failed to submit answer');
        set({ hasAnswered: false, selectedAnswerId: null });
      }
    });
  },

  setQuestionStartTime: (time: number) => set({ questionStartTime: time }),

  reset: () => {
    set({
      sessionId: null, roomId: null, gameStatus: GameState.WAITING,
      isHost: false, isFrozen: false, freezeMessage: '',
      isMaintenance: false, maintenanceMessage: '',
      currentQuestion: null, questionIndex: 0, totalQuestions: 0,
      questionStartTime: 0, timeRemaining: 0, hasAnswered: false,
      selectedAnswerId: null, leaderboard: [], myPlayerId: null,
      myNickname: null, myScore: 0, myRank: null, countdown: 0,
      correctAnswerId: null, _pendingRedirect: null,
      _pendingSessionSwitch: null, _isRecovering: false,
      playerStatuses: new Map(),
    });
  },
}));
