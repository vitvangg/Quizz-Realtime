'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';

/**
 * Socket Event Handler type
 */
type SocketEventHandler = (...args: any[]) => void;

/**
 * Hook result type
 */
interface UseSocketResult {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

/**
 * Custom hook for socket event management with automatic cleanup
 * 
 * Features:
 * - Automatic listener cleanup on unmount
 * - Prevention of duplicate listeners
 * - Connection state management
 * - Proper event handler storage for cleanup
 * 
 * Usage:
 * ```tsx
 * const { socket, isConnected } = useSocket();
 * 
 * useEffect(() => {
 *   if (!socket || !isConnected) return;
 *   
 *   const handleMessage = (data) => console.log(data);
 *   socket.on('message', handleMessage);
 *   
 *   return () => {
 *     socket.off('message', handleMessage);
 *   };
 * }, [socket, isConnected]);
 * ```
 */
export function useSocket(): UseSocketResult & {
  /** Register event handler that auto-cleans on unmount */
  useSocketEvent: <T = any>(event: string, handler: SocketEventHandler, deps?: any[]) => void;
} {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Store socket reference
  const socketRef = useRef<Socket | null>(null);
  
  // Store all registered handlers for cleanup
  const handlersRef = useRef<Map<string, Set<SocketEventHandler>>>(new Map());
  
  // Track if component is mounted
  const mountedRef = useRef(true);

  // Initialize socket connection
  useEffect(() => {
    mountedRef.current = true;
    const socket = getSocket();
    socketRef.current = socket;

    // Connection event handlers
    const onConnect = () => {
      if (mountedRef.current) {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
      }
    };

    const onDisconnect = (reason: string) => {
      if (mountedRef.current) {
        setIsConnected(false);
        setIsConnecting(false);
        console.log('[useSocket] Disconnected:', reason);
      }
    };

    const onConnectError = (err: Error) => {
      if (mountedRef.current) {
        setIsConnected(false);
        setIsConnecting(false);
        setError(err.message || 'Connection failed');
        console.error('[useSocket] Connection error:', err);
      }
    };

    // Register base listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    // Connect if not connected
    if (!socket.connected) {
      setIsConnecting(true);
      socket.connect();
    } else {
      setIsConnected(true);
    }

    // Cleanup function
    return () => {
      mountedRef.current = false;
      
      // Remove base listeners
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      
      // Remove all registered event handlers
      handlersRef.current.forEach((handlers, event) => {
        handlers.forEach(handler => {
          socket.off(event, handler);
        });
      });
      handlersRef.current.clear();
      
      setIsConnected(false);
      setIsConnecting(false);
    };
  }, []);

  /**
   * Register an event handler that automatically cleans up on unmount
   */
  const useSocketEvent = useCallback(<T = any>(
    event: string,
    handler: SocketEventHandler,
    deps: any[] = []
  ) => {
    useEffect(() => {
      const socket = socketRef.current;
      if (!socket) return;

      // Add handler to tracked handlers
      if (!handlersRef.current.has(event)) {
        handlersRef.current.set(event, new Set());
      }
      handlersRef.current.get(event)!.add(handler);

      // Register the handler
      socket.on(event, handler);

      // Cleanup on unmount or when dependencies change
      return () => {
        socket.off(event, handler);
        handlersRef.current.get(event)?.delete(handler);
      };
    }, [event, ...deps]);
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    isConnecting,
    error,
    useSocketEvent,
  };
}

/**
 * Hook to manage a single socket event with manual cleanup
 * 
 * Returns cleanup function to remove the listener
 */
export function useSocketListener(
  event: string,
  handler: SocketEventHandler,
  enabled: boolean = true
): () => void {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();
    socketRef.current = socket;
    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
    };
  }, [event, handler, enabled]);

  // Return cleanup function
  return useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.off(event, handler);
    }
  }, [event, handler]);
}

/**
 * Hook to manage multiple socket events with a single cleanup
 * 
 * Usage:
 * ```tsx
 * const cleanup = useSocketEvents({
 *   'message': handleMessage,
 *   'error': handleError,
 *   'notification': handleNotification,
 * });
 * 
 * // Call cleanup when done
 * useEffect(() => cleanup, []);
 * ```
 */
export function useSocketEvents(
  events: Record<string, SocketEventHandler>,
  enabled: boolean = true
): () => void {
  const handlersRef = useRef<Record<string, SocketEventHandler>>(events);

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();

    // Register all handlers
    Object.entries(events).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    // Cleanup function removes all handlers
    return () => {
      Object.entries(events).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  }, [enabled]);

  // Return manual cleanup function
  return useCallback(() => {
    const socket = getSocket();
    Object.entries(handlersRef.current).forEach(([event, handler]) => {
      socket.off(event, handler);
    });
  }, []);
}
