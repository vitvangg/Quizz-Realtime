'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useRoomStore } from '@/stores/room.store';
import { useAuthStore } from '@/stores/auth.store';
import { WaitingScreen } from '@/components/room/waiting-screen';
import { 
  useRoomHostIdentity, 
  checkIsHost,
  getStorageHostIdentity,
} from '@/hooks/useHostIdentity';

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = params.id as string;
  
  // URL ?host=true is ONLY a hint for initial routing
  // NOT used for authoritative host determination
  const isHostFromUrl = searchParams.get('host') === 'true';
  
  // Track if we've successfully joined to prevent duplicate calls
  const hasJoinedRef = useRef(false);
  // Track if we're currently determining the join path
  const isDeterminingRef = useRef(false);
  // Track the current room ID for cleanup
  const currentRoomIdRef = useRef<string | null>(null);

  const { user, accessToken, isHydrated } = useAuthStore();
  const {
    currentRoom,
    currentPlayer,
    isConnected,
    socket,
    connectSocket,
    getRoomState,
    joinRoomById,
    setAsHost,
  } = useRoomStore();
  
  // ============================================================
  // SINGLE SOURCE OF TRUTH: useRoomHostIdentity
  // ============================================================
  // This hook provides authoritative host identity based on:
  // 1. Server response (room_joined event) - authoritative
  // 2. Server validation (playerId format)
  // 3. Storage recovery (sessionStorage for reload)
  const hostIdentity = useRoomHostIdentity(roomId);
  
  // Debug logging in development
  if (process.env.NODE_ENV === 'development' && (currentRoom || currentPlayer)) {
    console.log('[RoomPage] Host Identity:', {
      isHost: hostIdentity.isHost,
      source: hostIdentity.source,
      isHostFromUrl,
      debug: hostIdentity.debug,
    });
  }

  // Handle joining the room - MUST wait for auth and socket to be ready
  const handleJoin = useCallback(async () => {
    // CRITICAL: Wait for auth to be hydrated
    if (!isHydrated) {
      console.log('[RoomPage] Skipping join: auth not yet hydrated');
      return;
    }
    
    // CRITICAL: Wait for socket to be connected
    if (!socket || !isConnected) {
      console.log('[RoomPage] Skipping join: socket not connected');
      return;
    }
    
    // CRITICAL: Only join once per page mount
    if (hasJoinedRef.current) {
      console.log('[RoomPage] Skipping join: already joined');
      return;
    }
    
    // Prevent concurrent join attempts
    if (isDeterminingRef.current) {
      console.log('[RoomPage] Skipping join: currently determining role');
      return;
    }
    isDeterminingRef.current = true;
    
    try {
      // ============================================================
      // DETERMINE HOST STATUS USING SINGLE SOURCE OF TRUTH
      // ============================================================
      
      // Get storage identity for recovery check
      const { hostSessionId: storedHostSessionId } = getStorageHostIdentity();
      const hasStoredHostSession = !!storedHostSessionId;
      
      // Use the hook's authoritative isHost determination
      // BUT: The hook's isHost is based on currentPlayer which is set AFTER join
      // So for initial join determination, we need to check:
      // 1. Is this a reload recovery? (has stored hostSessionId for this room)
      // 2. Is this a direct host navigation? (?host=true + JWT)
      
      // RECOVERY PATH: User is reloading after being host
      // (Backend will verify via JWT)
      const isRecoveryFromHost = hasStoredHostSession && storedHostSessionId === roomId;
      
      // DIRECT HOST PATH: User navigating directly as host
      // (Backend will verify via JWT)
      const isDirectHostNavigation = isHostFromUrl && !!user && !!accessToken;
      
      // GUEST PATH: Normal player or no stored session
      const isGuestPath = !isRecoveryFromHost && !isDirectHostNavigation;
      
      console.log('[RoomPage] Joining room:', { 
        roomId, 
        isRecoveryFromHost,
        isDirectHostNavigation,
        isGuestPath,
        hasStoredHostSession,
        storedHostSessionId,
        isHostFromUrl,
        hasUser: !!user,
        hasToken: !!accessToken,
        hostIdentity: hostIdentity.isHost,
        hostIdentitySource: hostIdentity.source,
      });

      // ============================================================
      // HOST PATH: JWT + (direct nav OR recovery)
      // Backend will verify via JWT
      // ============================================================
      if ((isDirectHostNavigation || isRecoveryFromHost) && user && accessToken) {
        const nickname = user.email?.split('@')[0] || 'Host';
        console.log('[RoomPage] HOST PATH: calling joinRoomById with JWT, userId:', user.id);
        
        await joinRoomById(roomId, nickname, accessToken);
        hasJoinedRef.current = true;
        
        console.log('[RoomPage] Host joined successfully');
        return;
      }
      
      // ============================================================
      // HOST RELOAD WITHOUT JWT: Try with existing hostSessionId
      // (Edge case: JWT expired but user still has hostSessionId)
      // ============================================================
      if (isRecoveryFromHost && hasStoredHostSession) {
        console.log('[RoomPage] HOST RELOAD PATH: has hostSessionId but JWT may be expired');
        
        try {
          await joinRoomById(roomId, 'Host', accessToken || undefined);
          hasJoinedRef.current = true;
          console.log('[RoomPage] Host reconnected via hostSessionId');
          return;
        } catch (err) {
          console.log('[RoomPage] Host reconnect failed, falling through to guest path');
        }
      }
      
      // ============================================================
      // GUEST PATH: No host indication OR no JWT
      // ============================================================
      if (isGuestPath || !user || !accessToken) {
        const storedPlayerId = sessionStorage.getItem('playerId') ?? undefined;
        const storedNickname = sessionStorage.getItem('playerNickname');
        
        // CRITICAL: Never auto-create nickname "Player" - require actual nickname
        if (!storedNickname) {
          console.log('[RoomPage] GUEST PATH: No stored nickname, getting room state only');
          // Guest with no session - just get room state, don't join socket
          await getRoomState(roomId);
          hasJoinedRef.current = true;
          return;
        }
        
        console.log('[RoomPage] GUEST PATH: calling joinRoomById with stored credentials');
        await joinRoomById(roomId, storedNickname, undefined, storedPlayerId);
        hasJoinedRef.current = true;
        
        console.log('[RoomPage] Guest joined successfully');
        return;
      }
      
      // Fallback: just get room state
      console.log('[RoomPage] Fallback: getting room state only');
      await getRoomState(roomId);
      hasJoinedRef.current = true;
      
    } finally {
      isDeterminingRef.current = false;
    }
  }, [
    socket, 
    isConnected, 
    roomId, 
    isHostFromUrl, 
    user, 
    accessToken, 
    isHydrated, 
    joinRoomById, 
    getRoomState,
    hostIdentity,
  ]);

  // Connect socket only once
  useEffect(() => {
    if (!roomId) return;
    
    console.log('[RoomPage] Mounting room page:', roomId);
    
    if (!socket) {
      connectSocket();
    }
  }, [roomId]);

  // Join room ONLY when BOTH socket is connected AND auth is hydrated
  useEffect(() => {
    // Only trigger when both are ready
    if (isConnected && isHydrated) {
      handleJoin();
    }
  }, [isConnected, isHydrated, handleJoin]);

  // Additional effect: When socket connects, trigger join if room not yet joined
  // This handles the case where socket reconnects after navigation
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    // Only trigger if we haven't joined yet
    if (hasJoinedRef.current) return;
    
    console.log('[RoomPage] Socket connected, triggering join');
    handleJoin();
  }, [isConnected, socket, handleJoin]);

  // When room data is loaded, we use the hook's host identity
  // The hook provides authoritative status based on server response
  useEffect(() => {
    // If server confirms we're host via currentPlayer.isHost, update store
    if (currentPlayer?.isHost && !hostIdentity.isHost) {
      console.log('[RoomPage] Server confirmed host status via currentPlayer.isHost');
    }
  }, [currentPlayer, hostIdentity.isHost]);

  // =========================================================================
  // HOST LEAVE HANDLING
  // =========================================================================
  
  // Handle host leaving when navigating away from room page
  const handleHostLeave = useCallback(async (roomIdToLeave: string) => {
    const { socket } = useRoomStore.getState();
    
    // Use checkIsHost utility for authoritative check
    const store = useRoomStore.getState();
    const isHost = checkIsHost({
      playerId: store.currentPlayer?.id || null,
      currentPlayerIsHost: store.currentPlayer?.isHost || null,
      currentRoomHostId: store.currentRoom?.hostId || null,
    });
    
    if (!isHost) {
      console.log('[RoomPage] handleHostLeave: not host, skipping');
      return;
    }
    
    if (!socket?.connected) {
      console.log('[RoomPage] handleHostLeave: socket not connected, skipping');
      return;
    }
    
    console.log('[RoomPage] handleHostLeave: emitting host_leave_room for room', roomIdToLeave);
    
    return new Promise<void>((resolve) => {
      // Set a timeout in case the server doesn't respond
      const timeout = setTimeout(() => {
        console.log('[RoomPage] handleHostLeave: timeout, resolving anyway');
        resolve();
      }, 3000);
      
      socket.emit('host_leave_room', { roomId: roomIdToLeave }, (response: any) => {
        clearTimeout(timeout);
        if (response?.success) {
          console.log('[RoomPage] handleHostLeave: room closed successfully');
        } else {
          console.log('[RoomPage] handleHostLeave: server responded with error:', response?.message);
        }
        resolve();
      });
    });
  }, []);

  // Cleanup effect: Handle host leaving when navigating away
  useEffect(() => {
    // Track current room ID
    currentRoomIdRef.current = roomId;
    
    return () => {
      // This cleanup runs on:
      // 1. Route change (navigating away from /room/:id)
      // 2. Page refresh (unmount)
      // 3. Tab close (unmount)
      
      console.log('[RoomPage] Cleanup: unmounting from room', currentRoomIdRef.current);
      
      // ============================================================
      // HOST LEAVE DETERMINATION (Single Source of Truth)
      // ============================================================
      const store = useRoomStore.getState();
      
      // Use checkIsHost for authoritative determination
      const isHost = checkIsHost({
        playerId: store.currentPlayer?.id || null,
        currentPlayerIsHost: store.currentPlayer?.isHost || null,
        currentRoomHostId: store.currentRoom?.hostId || null,
      });
      
      const hasJoined = hasJoinedRef.current;
      
      if (isHost && hasJoined && currentRoomIdRef.current) {
        console.log('[RoomPage] Cleanup: Host is leaving room', currentRoomIdRef.current);
        
        // Emit host_leave_room asynchronously (don't block unmount)
        handleHostLeave(currentRoomIdRef.current);
      } else {
        console.log('[RoomPage] Cleanup: Not emitting host_leave_room', {
          isHost,
          hasJoined,
          roomId: currentRoomIdRef.current,
          debug: store.currentPlayer ? {
            playerId: store.currentPlayer.id,
            isHost: store.currentPlayer.isHost,
            hostId: store.currentRoom?.hostId,
          } : null,
        });
      }
      
      // Reset refs
      hasJoinedRef.current = false;
      isDeterminingRef.current = false;
      currentRoomIdRef.current = null;
    };
  }, [roomId, handleHostLeave]);

  return <WaitingScreen roomId={roomId} />;
}
