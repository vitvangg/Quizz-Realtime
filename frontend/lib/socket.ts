'use client';

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

/**
 * Single shared socket instance.
 * IMPORTANT: Socket connection is controlled by auth state.
 * We don't auto-connect because we need auth token to be ready first.
 */

// Module-level listeners map to track registered listeners
const registeredListeners = new Map<string, SocketHandler[]>();
const listenerCounts = new Map<string, number>();

type SocketHandler = (...args: any[]) => void;

/**
 * Safe listener registration with deduplication
 * Each event can only have ONE handler registered at the module level
 */
function safeOn(socket: Socket, event: string, handler: SocketHandler): void {
  // Check if already registered
  if (registeredListeners.has(event)) {
    console.warn(`[Socket] Event ${event} already registered, skipping duplicate`);
    return;
  }

  registeredListeners.set(event, [handler]);
  listenerCounts.set(event, 1);
  socket.on(event, handler);
  console.log(`[Socket] Registered listener for event: ${event}`);
}

/**
 * Remove a specific listener
 */
function safeOff(socket: Socket, event: string, handler?: SocketHandler): void {
  if (handler) {
    socket.off(event, handler);
    const handlers = registeredListeners.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx > -1) handlers.splice(idx, 1);
    }
  } else {
    // Remove all handlers for this event
    const handlers = registeredListeners.get(event);
    if (handlers) {
      handlers.forEach(h => socket.off(event, h));
      registeredListeners.delete(event);
    }
  }
}

/**
 * Remove ALL listeners registered via safeOn
 */
export function removeAllSocketListeners(socket: Socket): void {
  console.log('[Socket] Removing all registered socket listeners');
  registeredListeners.forEach((handlers, event) => {
    handlers.forEach(handler => socket.off(event, handler));
  });
  registeredListeners.clear();
  listenerCounts.clear();
}

/**
 * Get list of registered event names
 */
export function getRegisteredSocketEvents(): string[] {
  return Array.from(registeredListeners.keys());
}

// Socket instance - auth token will be set when connecting
const sharedSocket: Socket = io(`${SOCKET_URL}/game`, {
  autoConnect: false, // IMPORTANT: Don't auto-connect - wait for auth
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Store the auth token to attach to socket connections
let _authToken: string | null = null;

export function setSocketAuthToken(token: string | null) {
  _authToken = token;

  // If connected, disconnect and reconnect with new token
  // This ensures socket always has the latest auth token
  if (sharedSocket.connected) {
    const currentAuth = (sharedSocket.auth as any)?.token;
    if (currentAuth !== token) {
      sharedSocket.disconnect();
      sharedSocket.connect();
    }
  }
}

export function connectSocketWithAuth(token: string) {
  setSocketAuthToken(token);

  if (!sharedSocket.connected) {
    (sharedSocket as any).auth = { token };
    sharedSocket.connect();
  }
}

// ── Module-level redirect state (survives Zustand resets) ──────────────────────────
/**
 * gameRedirectUrl persists the redirect URL across Zustand resets.
 * Zustand store alone is unreliable — store state can be cleared or overwritten
 * before React effects run. Module-level variable survives everything.
 */
export const gameRedirectUrl = {
  _url: null as string | null,
  get(): string | null { return this._url; },
  set(url: string) { this._url = url; },
  clear() { this._url = null; },
};

// ── Store integration: safe queue until store is ready ────────────────────────────
type StoreUpdater = (partial: Record<string, unknown>) => void;
let _updateStore: StoreUpdater | null = null;
const _pendingEvents: Array<{ event: string; args: unknown[] }> = [];

function emitToStore(partial: Record<string, unknown>) {
  if (_updateStore) {
    _updateStore(partial);
  } else {
    _pendingEvents.push({ event: 'store', args: [partial] });
  }
}

export function registerStoreUpdater(updater: StoreUpdater) {
  _updateStore = updater;
  for (const ev of _pendingEvents) {
    if (ev.event === 'store') {
      updater(ev.args[0] as Record<string, unknown>);
    }
  }
  _pendingEvents.length = 0;
}

// ── Socket listeners — registered ONCE at module load ──────────────────────────────
safeOn(sharedSocket, 'connect', () => {
  console.log('[SharedSocket] Connected:', sharedSocket.id);
  emitToStore({ isConnected: true });
});

safeOn(sharedSocket, 'disconnect', (reason: string) => {
  console.log('[SharedSocket] Disconnected:', reason);
  emitToStore({ isConnected: false });
});

safeOn(sharedSocket, 'connect_error', (error: Error) => {
  console.error('[SharedSocket] Connection error:', error);
  emitToStore({ isConnected: false });
});

safeOn(sharedSocket, 'game_starting', (data: { sessionId: string; countdown: number }) => {
  console.log('[SharedSocket] game_starting:', data);
  emitToStore({
    sessionId: data.sessionId,
    gameStatus: 'STARTING',
    countdown: data.countdown,
  });
});

safeOn(sharedSocket, 'game_redirect', (data: { url: string; sessionId: string }) => {
  console.log('[SharedSocket] game_redirect:', data.url);
  // Set BOTH store and module-level so pages can use whichever works reliably.
  gameRedirectUrl.set(data.url);
  emitToStore({ _pendingRedirect: data.url });
});

safeOn(sharedSocket, 'countdown_tick', (data: { remaining: number }) => {
  emitToStore({ countdown: data.remaining });
});

// Comment: question_start handled by game page listener to avoid double processing
// safeOn(sharedSocket, 'question_start', (data: any) => {
//   console.log('[SharedSocket] question_start:', data);
//   emitToStore({
//     gameStatus: 'QUESTION_ACTIVE',
//     currentQuestion: data.question,
//     questionIndex: data.questionIndex,
//     totalQuestions: data.totalQuestions,
//     questionStartTime: data.serverTime,
//     timeRemaining: data.question.timeLimit,
//     hasAnswered: false,
//     selectedAnswerId: null,
//     correctAnswerId: null,
//   });
// });

// Comment: question_result is handled by game page listener to avoid double processing
// The game page handler needs to also update myScore/myRank from the leaderboard
// safeOn(sharedSocket, 'question_result', (data: any) => {
//   console.log('[SharedSocket] question_result:', data);
//   emitToStore({
//     gameStatus: 'QUESTION_RESULT',
//     leaderboard: data.leaderboard,
//     correctAnswerId: data.correctAnswer?.id || null,
//   });
// });

safeOn(sharedSocket, 'game_ended', (data: any) => {
  console.log('[SharedSocket] game_ended:', data);
  emitToStore({
    gameStatus: 'FINISHED',
    leaderboard: data.leaderboard,
    currentQuestion: null,
  });
});

safeOn(sharedSocket, 'error', (error: { message: string }) => {
  console.error('[SharedSocket] Error:', error);
});

// 🚨 SYSTEM FREEZE: Ngừng toàn bộ hoạt động game
safeOn(sharedSocket, 'system:freeze', (data: { freeze: boolean; message: string }) => {
  console.warn('[SharedSocket] System freeze event:', data);
  emitToStore({ isFrozen: data.freeze, freezeMessage: data.message || '' });
});

// 🔧 MAINTENANCE MODE: Thông báo bảo trì và ngắt kết nối
safeOn(sharedSocket, 'system:maintenance', (data: { maintenance: boolean; message: string }) => {
  console.warn('[SharedSocket] Maintenance event:', data);
  emitToStore({ isMaintenance: data.maintenance, maintenanceMessage: data.message || '' });
});

// ⏱️ TIMER RESUME: Cập nhật lại thời gian sau khi unfreeze
safeOn(sharedSocket, 'timer_resume', (data: { remainingSeconds: number }) => {
  emitToStore({ timeRemaining: data.remainingSeconds });
});

// 🚪 ROOM CLOSED
safeOn(sharedSocket, 'room_closed', (data: { reason: string }) => {
  emitToStore({ roomClosedReason: data.reason });
});

// 📈 SCORE UPDATE
safeOn(sharedSocket, 'score_update', (data: { leaderboard: any[] }) => {
  emitToStore({ leaderboard: data.leaderboard });
});

/** Returns the shared socket instance. */
export function getSocket(): Socket {
  return sharedSocket;
}

/**
 * Disconnect and cleanup the shared socket
 * Call this on intentional app logout
 */
export function disconnectSocket(): void {
  // Remove all registered listeners before disconnecting
  removeAllSocketListeners(sharedSocket);
  sharedSocket.disconnect();
}

/**
 * Reconnect socket with cleanup
 */
export function reconnectSocket(): void {
  removeAllSocketListeners(sharedSocket);
  if (sharedSocket.connected) {
    sharedSocket.disconnect();
  }
  sharedSocket.connect();
}
