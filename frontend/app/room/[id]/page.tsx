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
  const hasJoinedRef = useRef(false);
  
  const { user, accessToken } = useAuthStore();
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

  // Handle joining the room
  const handleJoin = useCallback(async () => {
    if (!isConnected || !roomId || hasJoinedRef.current) {
      console.log('[RoomPage] Skipping join:', { isConnected, hasJoined: hasJoinedRef.current });
      return;
    }

    console.log('[RoomPage] Joining room:', { roomId, isHostFromUrl, user: !!user });

    if (isHostFromUrl && user) {
      // Host: join via WebSocket with JWT to authenticate
      try {
        const nickname = user.email?.split('@')[0] || 'Host';
        await joinRoomById(roomId, nickname, accessToken || undefined);
        hasJoinedRef.current = true;
      } catch (err) {
        console.error('[RoomPage] Host join failed:', err);
        await getRoomState(roomId);
        hasJoinedRef.current = true;
      }
    } else {
      // Guest: get room state
      await getRoomState(roomId);
      hasJoinedRef.current = true;
    }
  }, [isConnected, roomId, isHostFromUrl, user, accessToken]);

  // Connect socket only once
  useEffect(() => {
    if (!roomId) return;
    
    console.log('[RoomPage] Mounting, socket:', !!socket);
    
    // Only connect if socket doesn't exist
    if (!socket) {
      connectSocket();
    }

    return () => {
      console.log('[RoomPage] Unmounting');
    };
  }, [roomId]);

  // Join room when connected
  useEffect(() => {
    handleJoin();
  }, [handleJoin]);

  // When room data is loaded and user is host from URL, ensure host identity
  useEffect(() => {
    if (currentRoom && user && isHostFromUrl && !currentPlayer) {
      setAsHost(String(user.id), user.email?.split('@')[0] || 'Host');
    }
  }, [currentRoom, user, isHostFromUrl, currentPlayer]);

  return <WaitingScreen roomId={roomId} />;
}
