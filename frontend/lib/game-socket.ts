'use client';

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

/**
 * Game Socket - Used during actual game play
 * Connects to /game namespace
 */

// Module-level listeners map
const registeredGameListeners = new Map<string, GameHandler[]>();
type GameHandler = (...args: any[]) => void;

function safeOnGame(socket: Socket, event: string, handler: GameHandler): void {
  if (registeredGameListeners.has(event)) {
    return;
  }
  registeredGameListeners.set(event, [handler]);
  socket.on(event, handler);
}

export function removeAllGameListeners(socket: Socket): void {
  registeredGameListeners.forEach((handlers, event) => {
    handlers.forEach(handler => socket.off(event, handler));
  });
  registeredGameListeners.clear();
}

// Game socket instance
const gameSocket: Socket = io(`${SOCKET_URL}/game`, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

let _gameAuthToken: string | null = null;

export function connectGameSocket(token?: string) {
  if (token) {
    _gameAuthToken = token;
    (gameSocket as any).auth = { token };
  }
  if (!gameSocket.connected) {
    gameSocket.connect();
  }
}

export function disconnectGameSocket(): void {
  removeAllGameListeners(gameSocket);
  gameSocket.disconnect();
}

export function getGameSocket(): Socket {
  return gameSocket;
}

/**
 * Game-specific event handlers
 */

// Connection state
safeOnGame(gameSocket, 'connect', () => {
  console.log('[GameSocket] Connected:', gameSocket.id);
});

safeOnGame(gameSocket, 'disconnect', (reason: string) => {
  console.log('[GameSocket] Disconnected:', reason);
});

safeOnGame(gameSocket, 'connect_error', (error: Error) => {
  console.error('[GameSocket] Connection error:', error);
});

// Game lifecycle
safeOnGame(gameSocket, 'game_starting', (data: { sessionId: string; countdown: number }) => {
  console.log('[GameSocket] game_starting:', data);
});

safeOnGame(gameSocket, 'game_redirect', (data: { url: string; sessionId: string }) => {
  console.log('[GameSocket] game_redirect:', data.url);
});

safeOnGame(gameSocket, 'countdown_tick', (data: { remaining: number }) => {
  console.log('[GameSocket] countdown_tick:', data);
});

// Question events
safeOnGame(gameSocket, 'question_start', (data: any) => {
  console.log('[GameSocket] question_start:', data);
});

safeOnGame(gameSocket, 'question_result', (data: any) => {
  console.log('[GameSocket] question_result:', data);
});

// Game end
safeOnGame(gameSocket, 'game_ended', (data: any) => {
  console.log('[GameSocket] game_ended:', data);
});

// Session management
safeOnGame(gameSocket, 'session_switched', (data: any) => {
  console.log('[GameSocket] session_switched:', data);
});

safeOnGame(gameSocket, 'session_closed', (data: any) => {
  console.log('[GameSocket] session_closed:', data);
});

safeOnGame(gameSocket, 'room_closed', (data: any) => {
  console.log('[GameSocket] room_closed:', data);
});

// Player events
safeOnGame(gameSocket, 'player_joined', (data: any) => {
  console.log('[GameSocket] player_joined:', data);
});

safeOnGame(gameSocket, 'player_left', (data: any) => {
  console.log('[GameSocket] player_left:', data);
});

safeOnGame(gameSocket, 'player_status', (data: any) => {
  console.log('[GameSocket] player_status:', data);
});

safeOnGame(gameSocket, 'host_reconnected', (data: any) => {
  console.log('[GameSocket] host_reconnected:', data);
});

// Scoring
safeOnGame(gameSocket, 'answer_received', (data: any) => {
  console.log('[GameSocket] answer_received:', data);
});

safeOnGame(gameSocket, 'score_update', (data: any) => {
  console.log('[GameSocket] score_update:', data);
});

safeOnGame(gameSocket, 'leaderboard_update', (data: any) => {
  console.log('[GameSocket] leaderboard_update:', data);
});

// System events
safeOnGame(gameSocket, 'system:freeze', (data: any) => {
  console.warn('[GameSocket] System freeze:', data);
});

safeOnGame(gameSocket, 'system:maintenance', (data: any) => {
  console.warn('[GameSocket] System maintenance:', data);
});

safeOnGame(gameSocket, 'timer_resume', (data: any) => {
  console.log('[GameSocket] timer_resume:', data);
});

safeOnGame(gameSocket, 'error', (error: { message: string }) => {
  console.error('[GameSocket] Error:', error);
});

export { gameSocket };
