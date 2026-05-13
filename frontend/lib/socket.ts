'use client';

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

/**
 * Single shared socket instance.
 * Listeners registered ONCE at module load — survive all SPA navigation.
 * Pages do NOT register listeners here. State updates flow from socket → store via
 * registered callbacks. If store isn't ready yet, events are queued.
 */

// Module-level listeners map to prevent duplicate registration
const registeredListeners = new Set<string>();
type SocketHandler = (...args: any[]) => void;
function safeOn(socket: Socket, event: string, handler: SocketHandler) {
  if (registeredListeners.has(event)) return;
  registeredListeners.add(event);
  socket.on(event, handler);
}

const sharedSocket: Socket = io(`${SOCKET_URL}/game`, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

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

safeOn(sharedSocket, 'question_start', (data: any) => {
  console.log('[SharedSocket] question_start:', data);
  emitToStore({
    gameStatus: 'QUESTION_ACTIVE',
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

safeOn(sharedSocket, 'question_result', (data: any) => {
  console.log('[SharedSocket] question_result:', data);
  emitToStore({
    gameStatus: 'QUESTION_RESULT',
    leaderboard: data.leaderboard,
    correctAnswerId: data.correctAnswer?.id || null,
  });
});

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

/** Disconnect the shared socket — call only on intentional app logout. */
export function disconnectSocket(): void {
  sharedSocket.disconnect();
}
