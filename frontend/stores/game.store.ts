import { create } from 'zustand';
import { toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import {
  GameState,
  Question,
  LeaderboardEntry,
  GameStateData,
  QuestionStartPayload,
  QuestionResultPayload,
  GameEndedPayload,
  GameStartingPayload,
  CountdownTickPayload,
} from '@/types/game.type';
import { useAuthStore } from './auth.store';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

interface GameStore {
  socket: Socket | null;
  isConnected: boolean;

  sessionId: string | null;
  roomId: string | null;
  gameStatus: GameState;
  isHost: boolean;

  // Freeze / Hard Lockdown
  isFrozen: boolean;
  freezeMessage: string;

  // Maintenance Mode
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

  joinGame: (sessionId: string, roomId: string, playerId: string, nickname: string, isHost: boolean) => void;

  startGame: (roomId: string) => Promise<string | null>;
  nextQuestion: () => Promise<void>;
  endGame: () => Promise<void>;
  getGameState: () => Promise<void>;
  submitAnswer: (answerId: string) => void;

  setQuestionStartTime: (time: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  socket: null,
  isConnected: false,

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

  connectSocket: () => {
    const { socket } = get();
    if (socket?.connected) return;

    const newSocket = io(`${SOCKET_URL}/game`, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('[GameSocket] Connected:', newSocket.id);
      set({ isConnected: true });
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[GameSocket] Disconnected:', reason);
      set({ isConnected: false });
    });

    newSocket.on('connect_error', (error) => {
      console.error('[GameSocket] Connection error:', error);
      set({ isConnected: false });
    });

    newSocket.on('game_starting', (data: GameStartingPayload) => {
      console.log('[GameSocket] Game starting:', data);
      set({
        sessionId: data.sessionId,
        gameStatus: GameState.STARTING,
        countdown: data.countdown,
      });
    });

    newSocket.on('countdown_tick', (data: CountdownTickPayload) => {
      console.log('[GameSocket] Countdown tick:', data);
      set({ countdown: data.remaining });
    });

    newSocket.on('question_start', (data: QuestionStartPayload) => {
      console.log('[GameSocket] Question start:', data);
      set({
        gameStatus: GameState.QUESTION_ACTIVE,
        currentQuestion: data.question,
        questionIndex: data.questionIndex,
        totalQuestions: data.totalQuestions,
        questionStartTime: data.serverTime,
        timeRemaining: data.question.timeLimit,
        hasAnswered: false,
        selectedAnswerId: null,
        correctAnswerId: null,
      });
    });

    newSocket.on('question_result', (data: QuestionResultPayload) => {
      console.log('[GameSocket] Question result:', data);
      set({
        gameStatus: GameState.QUESTION_RESULT,
        leaderboard: data.leaderboard,
        correctAnswerId: data.correctAnswer?.id || null,
      });

      const state = get();
      if (state.myPlayerId) {
        const myEntry = data.leaderboard.find(
          (entry) => entry.playerId === state.myPlayerId
        );
        if (myEntry) {
          set({
            myScore: myEntry.score,
            myRank: myEntry.rank,
          });
        }
      }
    });

    newSocket.on('game_ended', (data: GameEndedPayload) => {
      console.log('[GameSocket] Game ended:', data);
      set({
        gameStatus: GameState.FINISHED,
        leaderboard: data.leaderboard,
        currentQuestion: null,
      });

      if (data.leaderboard.length > 0) {
        toast.success('Game kết thúc!');
      }
    });

    newSocket.on('error', (error: { message: string }) => {
      console.error('[GameSocket] Error:', error);
      toast.error(error.message);
    });

    // 🚨 SYSTEM FREEZE
    newSocket.on('system:freeze', (data: { freeze: boolean; message: string }) => {
      set({ isFrozen: data.freeze, freezeMessage: data.message || '' });
      if (data.freeze) toast.warning('⚠️ Hệ thống tạm dừng. Đang xử lý sự cố an ninh...');
      else toast.success('✅ Hệ thống hoạt động trở lại!');
    });

    // 🔧 MAINTENANCE MODE
    newSocket.on('system:maintenance', (data: { maintenance: boolean; message: string }) => {
      set({ isMaintenance: data.maintenance, maintenanceMessage: data.message || '' });
      if (data.maintenance) toast.error('🔧 Hệ thống đang bảo trì. Bạn sẽ bị ngắt kết nối sau 5 giây.');
      else toast.success('✅ Bảo trì hoàn tất. Hệ thống đã sẵn sàng!');
    });

    // ⏱️ TIMER RESUME
    newSocket.on('timer_resume', (data: { remainingSeconds: number }) => {
      set({ timeRemaining: data.remainingSeconds });
    });

    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      socket.removeAllListeners();
      set({ socket: null, isConnected: false });
    }
  },

  joinGame: (sessionId, roomId, playerId, nickname, isHost) => {
    const { socket, connectSocket } = get();

    if (!socket?.connected) {
      connectSocket();
    }

    const currentSocket = get().socket;
    if (!currentSocket) return;

    currentSocket.emit(
      'join_game',
      { sessionId, playerId, nickname },
      (response: any) => {
        console.log('[GameSocket] join_game response:', response);
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
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (get().isConnected) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });
    }

    const currentSocket = get().socket;
    if (!currentSocket) {
      toast.error('Socket not connected');
      return null;
    }

    const authStore = useAuthStore.getState();
    const jwt = authStore.accessToken;

    return new Promise<string | null>((resolve) => {
      currentSocket.emit(
        'host_start_game',
        { roomId, jwt },
        (response: any) => {
          console.log('[GameSocket] host_start_game response:', response);
          if (response.success) {
            set({
              sessionId: response.sessionId,
              roomId,
              isHost: true,
            });
            resolve(response.sessionId);
          } else {
            toast.error(response.error || 'Failed to start game');
            resolve(null);
          }
        }
      );
    });
  },

  nextQuestion: () => {
    return new Promise<void>((resolve, reject) => {
      const { socket, sessionId } = get();
      if (!socket || !sessionId) {
        reject(new Error('Not in game'));
        return;
      }

      socket.emit(
        'host_next_question',
        { sessionId },
        (response: any) => {
          console.log('[GameSocket] host_next_question response:', response);
          if (response.success) {
            resolve();
          } else {
            toast.error(response.error || 'Failed to next question');
            reject(new Error(response.error));
          }
        }
      );
    });
  },

  endGame: () => {
    return new Promise<void>((resolve, reject) => {
      const { socket, sessionId } = get();
      if (!socket || !sessionId) {
        reject(new Error('Not in game'));
        return;
      }

      socket.emit(
        'host_end_game',
        { sessionId },
        (response: any) => {
          console.log('[GameSocket] host_end_game response:', response);
          if (response.success) {
            resolve();
          } else {
            toast.error(response.error || 'Failed to end game');
            reject(new Error(response.error));
          }
        }
      );
    });
  },

  getGameState: () => {
    return new Promise<void>((resolve, reject) => {
      const { socket, sessionId } = get();
      if (!socket || !sessionId) {
        reject(new Error('Not in game'));
        return;
      }

      socket.emit(
        'get_game_state',
        { sessionId },
        (response: any) => {
          console.log('[GameSocket] get_game_state response:', response);
          if (response.success) {
            set({
              gameStatus: response.state.status,
              leaderboard: response.leaderboard,
              sessionId: response.state.sessionId,
              roomId: response.state.roomId,
            });
            resolve();
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  },

  submitAnswer: (answerId: string) => {
    const { socket, sessionId, myPlayerId, currentQuestion, hasAnswered } = get();

    if (!socket || !sessionId || !myPlayerId || !currentQuestion || hasAnswered) {
      return;
    }

    set({ hasAnswered: true, selectedAnswerId: answerId });

    socket.emit(
      'submit_answer',
      {
        sessionId,
        playerId: myPlayerId,
        questionId: currentQuestion.id,
        answerId,
        clientTimestamp: Date.now(),
      },
      (response: any) => {
        console.log('[GameSocket] submit_answer response:', response);
        if (!response.success) {
          toast.error(response.message || 'Failed to submit answer');
          set({ hasAnswered: false, selectedAnswerId: null });
        }
      }
    );
  },

  setQuestionStartTime: (time: number) => {
    set({ questionStartTime: time });
  },

  reset: () => {
    const { disconnectSocket } = get();
    disconnectSocket();
    set({
      socket: null,
      isConnected: false,
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
    });
  },
}));
