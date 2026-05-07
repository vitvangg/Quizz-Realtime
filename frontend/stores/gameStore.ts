import { create } from 'zustand';
import type { Room, Player, GameSession, PlayerSession } from '@/types/game';

interface GameState {
  // Room state
  room: Room | null;
  pin: string;

  // Player state
  currentPlayer: Player | null;
  players: Player[];

  // Game session state
  session: GameSession | null;
  currentQuestionIndex: number;
  playerSessions: PlayerSession[];

  // UI state
  isHost: boolean;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // User state (if logged in)
  userId: string | null;

  // Actions
  setRoom: (room: Room) => void;
  setPin: (pin: string) => void;
  setCurrentPlayer: (player: Player) => void;
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  updatePlayer: (player: Player) => void;
  setSession: (session: GameSession) => void;
  setCurrentQuestionIndex: (index: number) => void;
  setPlayerSessions: (sessions: PlayerSession[]) => void;
  updatePlayerScore: (playerSessionId: string, score: number) => void;
  setIsHost: (isHost: boolean) => void;
  setIsConnected: (isConnected: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setUserId: (userId: string | null) => void;
  reset: () => void;
}

const initialState = {
  room: null,
  pin: '',
  currentPlayer: null,
  players: [],
  session: null,
  currentQuestionIndex: 0,
  playerSessions: [],
  isHost: true,
  isConnected: true,
  isLoading: false,
  error: null,
  userId: null,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  setRoom: (room) => set({ room }),

  setPin: (pin) => set({ pin }),

  setCurrentPlayer: (player) => set({ currentPlayer: player }),

  setPlayers: (players) => set({ players }),

  addPlayer: (player) =>
    set((state) => ({
      players: [...state.players, player],
    })),

  removePlayer: (playerId) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== playerId),
    })),

  updatePlayer: (player) =>
    set((state) => ({
      players: state.players.map((p) => (p.id === player.id ? player : p)),
    })),

  setSession: (session) =>
    set({
      session,
      currentQuestionIndex: session.currentQuestionIndex,
    }),

  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),

  setPlayerSessions: (sessions) => set({ playerSessions: sessions }),

  updatePlayerScore: (playerSessionId, score) =>
    set((state) => ({
      playerSessions: state.playerSessions.map((ps) =>
        ps.id === playerSessionId ? { ...ps, score } : ps
      ),
    })),

  setIsHost: (isHost) => set({ isHost }),

  setIsConnected: (isConnected) => set({ isConnected }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setUserId: (userId) => set({ userId }),

  reset: () => set(initialState),
}));
