'use client';

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

/**
 * Lobby Socket - Used during room creation, joining, and waiting phase
 * Connects to /lobby namespace
 */

// Module-level listeners map
const registeredLobbyListeners = new Map<string, LobbyHandler[]>();
type LobbyHandler = (...args: any[]) => void;

function safeOnLobby(socket: Socket, event: string, handler: LobbyHandler): void {
  if (registeredLobbyListeners.has(event)) {
    return;
  }
  registeredLobbyListeners.set(event, [handler]);
  socket.on(event, handler);
}

export function removeAllLobbyListeners(socket: Socket): void {
  registeredLobbyListeners.forEach((handlers, event) => {
    handlers.forEach(handler => socket.off(event, handler));
  });
  registeredLobbyListeners.clear();
}

// Lobby socket instance
const lobbySocket: Socket = io(`${SOCKET_URL}/lobby`, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

let _lobbyAuthToken: string | null = null;

export function connectLobbySocket(token?: string) {
  if (token) {
    _lobbyAuthToken = token;
    (lobbySocket as any).auth = { token };
  }
  if (!lobbySocket.connected) {
    lobbySocket.connect();
  }
}

export function disconnectLobbySocket(): void {
  removeAllLobbyListeners(lobbySocket);
  lobbySocket.disconnect();
}

export function getLobbySocket(): Socket {
  return lobbySocket;
}

/**
 * Lobby-specific event handlers
 * These are safe to register at module level - they'll be deduplicated
 */

safeOnLobby(lobbySocket, 'connect', () => {
  console.log('[LobbySocket] Connected:', lobbySocket.id);
});

safeOnLobby(lobbySocket, 'disconnect', (reason: string) => {
  console.log('[LobbySocket] Disconnected:', reason);
});

safeOnLobby(lobbySocket, 'connect_error', (error: Error) => {
  console.error('[LobbySocket] Connection error:', error);
});

// Room events
safeOnLobby(lobbySocket, 'room_joined', (data: any) => {
  console.log('[LobbySocket] room_joined:', data);
});

safeOnLobby(lobbySocket, 'player_joined', (data: any) => {
  console.log('[LobbySocket] player_joined:', data);
});

safeOnLobby(lobbySocket, 'player_left', (data: any) => {
  console.log('[LobbySocket] player_left:', data);
});

safeOnLobby(lobbySocket, 'room_left', (data: any) => {
  console.log('[LobbySocket] room_left:', data);
});

safeOnLobby(lobbySocket, 'host_left', (data: any) => {
  console.log('[LobbySocket] host_left:', data);
});

safeOnLobby(lobbySocket, 'error', (error: { message: string }) => {
  console.error('[LobbySocket] Error:', error);
});

safeOnLobby(lobbySocket, 'game_redirect', (data: { url: string; sessionId: string }) => {
  console.log('[LobbySocket] game_redirect:', data);
  // This event will be picked up by waiting-screen to redirect to game page
});

export { lobbySocket };
