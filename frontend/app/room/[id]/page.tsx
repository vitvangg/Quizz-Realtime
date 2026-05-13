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
    // Skip only if already joined or no socket (not yet initialized).
    // Wait for isConnected if socket exists — socket connects asynchronously.
    if (hasJoinedRef.current || !socket) {
      if (!socket) {
        console.log('[RoomPage] Skipping join: socket not yet initialized');
      }
      return;
    }

    console.log('[RoomPage] Joining room:', { roomId, isHostFromUrl, user: !!user });

    if (isHostFromUrl && user) {
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
      // Guest: fetch room state. Socket is already joined to the room
      // from the JoinRoomDialog flow via join_by_id — no need to rejoin.
      await getRoomState(roomId);
      hasJoinedRef.current = true;
    }
  }, [socket, roomId, isHostFromUrl, user, accessToken, joinRoomById, getRoomState]);

  // Connect socket only once
  useEffect(() => {
    if (!roomId) return;

    console.log('[RoomPage] Mounting, socket:', !!socket);

    if (!socket) {
      connectSocket();
    }

    return () => {
      console.log('[RoomPage] Unmounting');
    };
  }, [roomId, socket]);

  // Join room when socket becomes available OR when isConnected flips true
  useEffect(() => {
    handleJoin();
  }, [handleJoin, isConnected]);

  // When room data is loaded and user is host from URL, ensure host identity
  useEffect(() => {
    if (currentRoom && user && isHostFromUrl && !currentPlayer) {
      setAsHost(String(user.id), user.email?.split('@')[0] || 'Host');
    }
  }, [currentRoom, user, isHostFromUrl, currentPlayer]);

  return <WaitingScreen roomId={roomId} />;
}
