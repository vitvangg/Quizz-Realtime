'use client';

/**
 * useHostIdentity - Single Source of Truth for Host Identity Detection
 * 
 * PROBLEM: Host identity is detected in 5+ different ways across the codebase:
 * 1. URL param: ?host=true (CLIENT - can be spoofed)
 * 2. sessionStorage: hostSessionId === sessionId (CLIENT - can be stale)
 * 3. room_joined response: player.isHost (SERVER - authoritative)
 * 4. currentPlayer?.isHost flag (SERVER set, CLIENT read)
 * 5. currentPlayer?.id === currentRoom?.hostId (SERVER validation)
 * 
 * SOLUTION: This hook provides a single source of truth with priority:
 * 
 * Priority Order (highest to lowest):
 * 1. Server Response (authoritative) - currentPlayer?.isHost
 * 2. Server Validation - playerId matches host format
 * 3. Recovery Hint - sessionStorage for reload recovery
 * 
 * IMPORTANT: 
 * - Server response is ALWAYS authoritative
 * - sessionStorage is only used for recovery after reload
 * - URL ?host=true is ONLY a hint for initial routing, NOT for permissions
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useRoomStore } from '@/stores/room.store';
import { useGameStore } from '@/stores/game.store';

export type HostIdentitySource = 
  | 'server_response'    // From socket event response (authoritative)
  | 'server_validation'   // playerId format validated
  | 'storage_recovery'    // From sessionStorage (recovery only)
  | 'not_host';         // Not host

export interface UseHostIdentityResult {
  /** Whether the current user is the host */
  isHost: boolean;
  
  /** Source of the host determination (for debugging) */
  source: HostIdentitySource;
  
  /** Player ID of the current user */
  playerId: string | null;
  
  /** Nickname of the current user */
  nickname: string | null;
  
  /** Current room ID */
  roomId: string | null;
  
  /** Current session ID (if in game) */
  sessionId: string | null;
  
  /** Whether the user is a guest (not host) */
  isGuest: boolean;
  
  /** Debug info for troubleshooting */
  debug: {
    currentPlayerId: string | null;
    currentPlayerIsHost: boolean | null;
    currentRoomHostId: string | null;
    currentPlayerIdStartsWithHost: boolean;
    sessionStorageHostSessionId: string | null;
    urlSessionId: string | null;
    sessionStorageMatch: boolean;
  };
}

/**
 * Hook for Room/Lobby pages
 * 
 * Use when: In /room/:id page context
 */
export function useRoomHostIdentity(roomIdFromParams?: string): UseHostIdentityResult {
  const params = useParams();
  const roomId = roomIdFromParams || params?.id as string;
  
  const { 
    currentPlayer, 
    currentRoom, 
    isHost: storeIsHost,
    players 
  } = useRoomStore();
  
  return useMemo(() => {
    // === SERVER RESPONSE (Authoritative) ===
    // This is set by backend in room_joined event
    const serverIsHost = currentPlayer?.isHost === true;
    
    // === SERVER VALIDATION ===
    // Check if playerId matches host pattern
    const playerId = currentPlayer?.id || null;
    const playerIdStartsWithHost = !!playerId?.startsWith('host_');
    
    // === STORAGE RECOVERY ===
    // sessionStorage is used for reload recovery
    const storedHostSessionId = typeof window !== 'undefined' 
      ? sessionStorage.getItem('hostSessionId') 
      : null;
    
    // === DEBUG INFO ===
    const debug = {
      currentPlayerId: currentPlayer?.id || null,
      currentPlayerIsHost: currentPlayer?.isHost || null,
      currentRoomHostId: currentRoom?.hostId || null,
      currentPlayerIdStartsWithHost: playerIdStartsWithHost,
      sessionStorageHostSessionId: storedHostSessionId,
      urlSessionId: roomId || null,
      sessionStorageMatch: !!storedHostSessionId && storedHostSessionId === roomId,
    };
    
    // === DETERMINE HOST STATUS ===
    // Priority: Server Response > Server Validation > Storage Recovery
    
    if (serverIsHost) {
      return {
        isHost: true,
        source: 'server_response' as HostIdentitySource,
        playerId,
        nickname: currentPlayer?.nickname || null,
        roomId: currentRoom?.id || roomId,
        sessionId: null,
        isGuest: false,
        debug,
      };
    }
    
    // Check if playerId matches host format AND room matches
    if (playerIdStartsWithHost && currentRoom?.hostId) {
      // Extract userId from host_xxx format and compare
      const userIdFromPlayer = playerId?.replace('host_', '');
      const matchesHostId = userIdFromPlayer === currentRoom.hostId;
      
      if (matchesHostId) {
        return {
          isHost: true,
          source: 'server_validation' as HostIdentitySource,
          playerId,
          nickname: currentPlayer?.nickname || null,
          roomId: currentRoom?.id || roomId,
          sessionId: null,
          isGuest: false,
          debug,
        };
      }
    }
    
    // Storage recovery - only for reload scenarios
    // This is weaker evidence, used as fallback
    if (storedHostSessionId && storedHostSessionId === roomId) {
      // This might be stale - warn in console
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useHostIdentity] Using storage recovery for host status - may be stale');
      }
      
      return {
        isHost: true,
        source: 'storage_recovery' as HostIdentitySource,
        playerId,
        nickname: currentPlayer?.nickname || null,
        roomId: currentRoom?.id || roomId,
        sessionId: null,
        isGuest: false,
        debug,
      };
    }
    
    // Not host
    return {
      isHost: false,
      source: 'not_host' as HostIdentitySource,
      playerId,
      nickname: currentPlayer?.nickname || null,
      roomId: currentRoom?.id || roomId,
      sessionId: null,
      isGuest: true,
      debug,
    };
  }, [currentPlayer, currentRoom, roomId, storeIsHost]);
}

/**
 * Hook for Game pages
 * 
 * Use when: In /game/:sessionId page context
 */
export function useGameHostIdentity(): UseHostIdentityResult {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  
  const {
    isHost: storeIsHost,
    myPlayerId,
    myNickname,
    roomId: storeRoomId,
    sessionId: storeSessionId,
  } = useGameStore();
  
  const { currentPlayer, currentRoom } = useRoomStore();
  
  return useMemo(() => {
    // === SERVER RESPONSE (Authoritative) ===
    // From game store (set by host_join_game response)
    const serverIsHost = storeIsHost === true;
    
    // === SERVER VALIDATION ===
    // Check if playerId matches host format
    const playerId = myPlayerId || currentPlayer?.id || null;
    const playerIdStartsWithHost = !!playerId?.startsWith('host_');
    
    // === STORAGE RECOVERY ===
    const storedHostSessionId = typeof window !== 'undefined'
      ? sessionStorage.getItem('hostSessionId')
      : null;
    
    // === DEBUG INFO ===
    const debug = {
      currentPlayerId: playerId,
      currentPlayerIsHost: storeIsHost,
      currentRoomHostId: currentRoom?.hostId || null,
      currentPlayerIdStartsWithHost: playerIdStartsWithHost,
      sessionStorageHostSessionId: storedHostSessionId,
      urlSessionId: sessionId || null,
      sessionStorageMatch: !!storedHostSessionId && storedHostSessionId === sessionId,
    };
    
    // === DETERMINE HOST STATUS ===
    if (serverIsHost) {
      return {
        isHost: true,
        source: 'server_response' as HostIdentitySource,
        playerId,
        nickname: myNickname || currentPlayer?.nickname || null,
        roomId: storeRoomId || currentRoom?.id || null,
        sessionId: storeSessionId || sessionId,
        isGuest: false,
        debug,
      };
    }
    
    // Check if playerId matches host format
    if (playerIdStartsWithHost) {
      // For game, we trust the store's isHost flag
      // This was set based on server response
      return {
        isHost: storeIsHost,
        source: storeIsHost ? 'server_validation' as HostIdentitySource : 'not_host' as HostIdentitySource,
        playerId,
        nickname: myNickname || currentPlayer?.nickname || null,
        roomId: storeRoomId || currentRoom?.id || null,
        sessionId: storeSessionId || sessionId,
        isGuest: !storeIsHost,
        debug,
      };
    }
    
    // Storage recovery
    if (storedHostSessionId && storedHostSessionId === sessionId) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useGameHostIdentity] Using storage recovery for host status - may be stale');
      }
      
      return {
        isHost: true,
        source: 'storage_recovery' as HostIdentitySource,
        playerId,
        nickname: myNickname || currentPlayer?.nickname || null,
        roomId: storeRoomId || currentRoom?.id || null,
        sessionId: storeSessionId || sessionId,
        isGuest: false,
        debug,
      };
    }
    
    return {
      isHost: false,
      source: 'not_host' as HostIdentitySource,
      playerId,
      nickname: myNickname || currentPlayer?.nickname || null,
      roomId: storeRoomId || currentRoom?.id || null,
      sessionId: storeSessionId || sessionId,
      isGuest: true,
      debug,
    };
  }, [
    storeIsHost, 
    myPlayerId, 
    myNickname, 
    storeRoomId, 
    storeSessionId, 
    sessionId,
    currentPlayer,
    currentRoom,
  ]);
}

/**
 * Utility function to check if a player is host (for non-hook context)
 * Use this only when you can't use hooks (e.g., in event handlers)
 */
export function checkIsHost(options: {
  playerId: string | null;
  currentPlayerIsHost: boolean | null;
  currentRoomHostId: string | null;
}): boolean {
  const { playerId, currentPlayerIsHost, currentRoomHostId } = options;
  
  // Server says they're host
  if (currentPlayerIsHost === true) {
    return true;
  }
  
  // Check host_ format
  if (playerId?.startsWith('host_') && currentRoomHostId) {
    const userIdFromPlayer = playerId.replace('host_', '');
    return userIdFromPlayer === currentRoomHostId;
  }
  
  return false;
}

/**
 * Constants for sessionStorage keys
 */
export const HOST_IDENTITY_STORAGE_KEYS = {
  HOST_SESSION_ID: 'hostSessionId',
  HOST_USER_ID: 'hostUserId',
  PLAYER_SESSION_ID: 'playerSessionId',
  PLAYER_ID: 'playerId',
  PLAYER_NICKNAME: 'playerNickname',
  CURRENT_ROOM_ID: 'currentRoomId',
} as const;

/**
 * Get host identity from sessionStorage (for recovery scenarios)
 */
export function getStorageHostIdentity() {
  if (typeof window === 'undefined') {
    return { hostSessionId: null, hostUserId: null };
  }
  
  return {
    hostSessionId: sessionStorage.getItem(HOST_IDENTITY_STORAGE_KEYS.HOST_SESSION_ID),
    hostUserId: sessionStorage.getItem(HOST_IDENTITY_STORAGE_KEYS.HOST_USER_ID),
  };
}

/**
 * Set host identity in sessionStorage
 */
export function setStorageHostIdentity(sessionId: string, userId?: string) {
  if (typeof window === 'undefined') return;
  
  sessionStorage.setItem(HOST_IDENTITY_STORAGE_KEYS.HOST_SESSION_ID, sessionId);
  if (userId) {
    sessionStorage.setItem(HOST_IDENTITY_STORAGE_KEYS.HOST_USER_ID, userId);
  }
}

/**
 * Clear host identity from sessionStorage
 */
export function clearStorageHostIdentity() {
  if (typeof window === 'undefined') return;
  
  sessionStorage.removeItem(HOST_IDENTITY_STORAGE_KEYS.HOST_SESSION_ID);
  sessionStorage.removeItem(HOST_IDENTITY_STORAGE_KEYS.HOST_USER_ID);
}
