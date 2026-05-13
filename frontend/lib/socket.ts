'use client';

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

export function getSocket(): Socket {
  if (!socket) {
    // Connect directly to the /game namespace
    const url = `${SOCKET_URL}/game`;
    console.log('[SOCKET] Creating socket connection to:', url);

    socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[SOCKET] Connected with ID:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[SOCKET] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[SOCKET] Connection error:', error.message, 'url:', url);
    });

    socket.on('error', (error: { code: string; message: string }) => {
      console.error('[SOCKET] Error:', error);
    });

    // Debug all events
    socket.onAny((event, ...args) => {
      console.log('[SOCKET] Event received:', event, args);
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
