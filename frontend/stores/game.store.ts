import { create } from 'zustand';
import { toast } from 'sonner';
import { Socket } from 'socket.io-client';
import { getSocket, registerStoreUpdater } from '@/lib/socket';
import { GameState, Question, LeaderboardEntry } from '@/types/game.type';
import { useAuthStore } from './auth.store';

interface GameStore {
  socket: Socket | null;
  isConnected: boolean;
  _pendingRedirect: string | null;

  sessionId: string | null;
  roomId: string | null;
  gameStatus: GameState;
  isHost: boolean;

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

  sessionId: null,
  roomId: null,
  gameStatus: GameState.WAITING,
  isHost: false,

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
    if (socket) return; // already initialized

    // Register this store as the handler for socket events.
    // Listeners are managed at the module level in lib/socket.ts.
    registerStoreUpdater((updater) => {
      set(updater);
    });

    const newSocket = getSocket();
    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    // Socket is shared — never disconnect it here.
    // This is called only on intentional full logout / app teardown.
    set({ socket: null, isConnected: false });
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

    console.log('[GameSocket] startGame: emitting host_start_game, socket.id=', currentSocket.id);

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

  playAgain: async (sessionId: string, roomId: string) => {
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

    return new Promise<string | null>((resolve, reject) => {
      currentSocket.emit(
        'host_play_again',
        { sessionId, roomId },
        (response: any) => {
          console.log('[GameSocket] host_play_again response:', response);
          if (response.success) {
            set({
              sessionId: response.sessionId,
              roomId,
              isHost: true,
              // Reset game state for new session
              gameStatus: GameState.WAITING,
              currentQuestion: null,
              hasAnswered: false,
              selectedAnswerId: null,
              leaderboard: [],
              countdown: 0,
              correctAnswerId: null,
            });
            resolve(response.sessionId);
          } else {
            toast.error(response.error || 'Failed to restart game');
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

    if (!socket || !sessionId) {
      toast.error('Chưa kết nối game');
      return;
    }
    if (!myPlayerId) {
      toast.error('Không tìm thấy player ID — reload trang để thử lại');
      return;
    }
    if (!currentQuestion || hasAnswered) {
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
    // Reset gameplay state only — socket stays alive for other pages.
    // Never disconnect the shared socket here.
    set({
      sessionId: null,
      roomId: null,
      gameStatus: GameState.WAITING,
      isHost: false,
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
      _pendingRedirect: null,
    });
  },
}));
