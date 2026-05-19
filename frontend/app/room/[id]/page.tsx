'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useRoomStore } from '@/stores/room.store';
import { useAuthStore } from '@/stores/auth.store';
import { WaitingScreen } from '@/components/room/waiting-screen';

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.id as string;
  const isHostFromUrl = searchParams.get('host') === 'true';
  
  // Track if we've successfully joined to prevent duplicate calls
  const hasJoinedRef = useRef(false);
  // Track if we're currently determining the join path
  const isDeterminingRef = useRef(false);

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
      // Determine host status AFTER auth is hydrated
      const hasHostSession = !!sessionStorage.getItem('hostSessionId');
      const isActuallyHost = isHostFromUrl || hasHostSession;
      
      console.log('[RoomPage] Joining room:', { 
        roomId, 
        isActuallyHost, 
        isHostFromUrl,
        hasHostSession,
        hasUser: !!user,
        hasToken: !!accessToken 
      });

      // ========================================
      // HOST PATH: Has JWT and is host
      // ========================================
      if (isActuallyHost && user && accessToken) {
        const nickname = user.email?.split('@')[0] || 'Host';
        console.log('[RoomPage] HOST PATH: calling joinRoomById with JWT, userId:', user.id);
        
        await joinRoomById(roomId, nickname, accessToken);
        hasJoinedRef.current = true;
        
        console.log('[RoomPage] Host joined successfully');
        return;
      }
      
      // ========================================
      // HOST RELOAD WITHOUT JWT: Try with existing hostSessionId
      // ========================================
      if (isActuallyHost && hasHostSession) {
        console.log('[RoomPage] HOST RELOAD PATH: has hostSessionId but no JWT');
        
        try {
          await joinRoomById(roomId, 'Host', accessToken || undefined);
          hasJoinedRef.current = true;
          console.log('[RoomPage] Host reconnected via hostSessionId');
          return;
        } catch (err) {
          console.log('[RoomPage] Host reconnect failed, falling through');
        }
      }
      
      // ========================================
      // GUEST PATH: Only if explicitly NOT host
      // ========================================
      if (!isActuallyHost) {
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
  }, [socket, isConnected, roomId, isHostFromUrl, user, accessToken, isHydrated, joinRoomById, getRoomState]);

  // Connect socket only once
  useEffect(() => {
    if (!roomId) return;
    
    console.log('[RoomPage] Mounting room page:', roomId);
    
    if (!socket) {
      connectSocket();
    }

    return () => {
      console.log('[RoomPage] Unmounting');
      // Reset refs on unmount for next visit
      hasJoinedRef.current = false;
      isDeterminingRef.current = false;
    };
  }, [roomId]);

  // Join room ONLY when BOTH socket is connected AND auth is hydrated
  useEffect(() => {
    // Only trigger when both are ready
    if (isConnected && isHydrated) {
      handleJoin();
    }
  }, [isConnected, isHydrated, handleJoin]);

  // When room data is loaded and user is host from URL, ensure host identity
  useEffect(() => {
    if (currentRoom && user && isHostFromUrl && !currentPlayer) {
      setAsHost(String(user.id), user.email?.split('@')[0] || 'Host');
    }
  }, [currentRoom, user, isHostFromUrl, currentPlayer]);

  return <WaitingScreen roomId={roomId} />;
}
