'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { WaitingRoom } from '@/components/game/WaitingRoom';
import { NicknameEntry } from '@/components/game/NicknameEntry';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { roomService } from '@/services/room.service';
import { useGameStore } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/auth.store';
import type { Room, Player } from '@/types/game';

export default function WaitingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const pin = params.pin as string;

  const { setRoom, setPlayers, setCurrentPlayer, reset } = useGameStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [showNicknameEntry, setShowNicknameEntry] = useState(false);
  const [pendingNickname, setPendingNickname] = useState<string | null>(null);

  // ============================================================================
  // CHECK IF USER IS HOST OR PLAYER
  // ============================================================================

  const checkUserRole = useCallback(async () => {
    const { accessToken, isHydrated } = useAuthStore.getState();

    if (!isHydrated) {
      await new Promise<void>((resolve) => {
        const unsub = useAuthStore.subscribe((state) => {
          if (state.isHydrated) {
            unsub();
            resolve();
          }
        });
      });
    }

    const token = useAuthStore.getState().accessToken;

    // Host flow: has token and is room host
    if (token) {
      try {
        const roomData = await roomService.getRoomByPin(pin);
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userId = payload.sub || payload.id;

        if (roomData.hostId === userId) {
          setRoom(roomData);
          setPlayers(roomData.players || []);
          setCurrentPlayer({
            id: roomData.hostId,
            roomId: roomData.id,
            nickname: roomData.host?.email?.split('@')[0] || 'Host',
            joinedAt: roomData.createdAt,
            isHost: true,
          });
          setIsHost(true);
          return 'host';
        }
      } catch (err) {
        console.error('Error checking host:', err);
      }
    }

    // Player flow: no token or not host
    return 'player';
  }, [pin, setRoom, setPlayers, setCurrentPlayer]);

  // ============================================================================
  // INITIALIZE
  // ============================================================================

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const role = await checkUserRole();
        if (role === 'host') {
          setShowNicknameEntry(false);
        } else {
          setShowNicknameEntry(true);
        }
      } catch (err) {
        console.error('Init error:', err);
        toast.error('Failed to load room');
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      reset();
    };
  }, [checkUserRole, reset]);

  // ============================================================================
  // SOCKET CONNECTION (unified for both host and player)
  // ============================================================================

  const { room, players, currentPlayer } = useGameStore();

  useEffect(() => {
    if (isLoading || (!isHost && !pendingNickname)) return;

    const socket = getSocket();

    // ─── Connection handlers ───
    const handleConnect = () => {
      console.log('[SOCKET] Connected');
      if (isHost && room) {
        socket.emit('room:host_join', { roomId: room.id });
      } else if (pendingNickname) {
        socket.emit('room:player_join', { pin, nickname: pendingNickname });
      }
    };

    const handleDisconnect = () => {
      console.log('[SOCKET] Disconnected');
    };

    // ─── Room joined (both host and player) ───
    const handleRoomJoined = (data: { success: boolean; room: Room; player?: Player; isHost: boolean }) => {
      if (!data.success) return;

      const store = useGameStore.getState();

      // Replace entire room state to ensure consistency
      store.setRoom(data.room);
      if (data.player) {
        store.setCurrentPlayer(data.player);
      }

      // Use players from room data, filtered for uniqueness by id
      const uniquePlayers = data.room.players?.filter(
        (p, i, arr) => arr.findIndex(x => x.id === p.id) === i
      ) || [];
      store.setPlayers(uniquePlayers);

      setShowNicknameEntry(false);
      setPendingNickname(null);
    };

    // ─── Room updated (player joined/left/removed) ───
    const handleRoomUpdated = (data: {
      action: 'player_joined' | 'player_removed' | 'player_left';
      player?: Player;
      playerId?: string;
      nickname?: string;
      players?: Player[];
    }) => {
      console.log('[SOCKET] Room updated:', data);

      const store = useGameStore.getState();

      if (data.action === 'player_joined' && data.player) {
        // Check for duplicate before adding
        const exists = store.players.some(p => p.id === data.player!.id);
        if (!exists) {
          store.addPlayer(data.player);
        }
        toast.info(`${data.player.nickname} joined`);
      } else if (data.action === 'player_removed' && data.playerId) {
        store.removePlayer(data.playerId);
        toast.info('Player removed');
      } else if (data.action === 'player_left' && data.playerId) {
        store.removePlayer(data.playerId);
        if (data.nickname) {
          toast.info(`${data.nickname} left`);
        }
      }

      // Only update full list if provided (for sync)
      if (data.players && data.players.length > 0) {
        store.setPlayers(data.players);
      }
    };

    // ─── Room removed (kicked or closed) ───
    const handleRoomRemoved = (data: { reason: string; message: string }) => {
      console.log('[SOCKET] Room removed:', data);

      // Prevent double handling - remove all listeners
      socket.off('room:removed', handleRoomRemoved);
      socket.off('room:updated', handleRoomUpdated);

      // Disconnect and prevent reconnection
      disconnectSocket();

      // Show message
      if (data.message) {
        toast.error(data.message);
      }

      // Reset store
      reset();

      // Navigate to home using hard redirect
      window.location.href = '/';
    };

    // ─── Game starting ───
    const handleGameStarting = (data: { sessionId: string }) => {
      console.log('[SOCKET] Game starting:', data);
      toast.success('Game is starting!');
      router.push(`/play/${data.sessionId}`);
    };

    // ─── Error ───
    const handleError = (data: { code: string; message: string }) => {
      console.error('[SOCKET] Error:', data);
      toast.error(data.message);

      if (data.code === 'ROOM_NOT_FOUND' || data.code === 'ROOM_FULL' || data.code === 'NICKNAME_TAKEN') {
        router.push('/');
      }
    };

    // ─── Bind events ───
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('room:joined', handleRoomJoined);
    socket.on('room:updated', handleRoomUpdated);
    socket.on('room:removed', handleRoomRemoved);
    socket.on('game:starting', handleGameStarting);
    socket.on('error', handleError);

    // ─── Connect ───
    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room:joined', handleRoomJoined);
      socket.off('room:updated', handleRoomUpdated);
      socket.off('room:removed', handleRoomRemoved);
      socket.off('game:starting', handleGameStarting);
      socket.off('error', handleError);
    };
  }, [isLoading, isHost, pendingNickname, pin, room, router, reset]);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleJoinAsPlayer = (nickname: string) => {
    setPendingNickname(nickname);
  };

  const handleStartGame = () => {
    if (!room) return;
    const socket = getSocket();
    socket.emit('game:start', { roomId: room.id });
  };

  const handleKickPlayer = (playerId: string) => {
    const socket = getSocket();
    socket.emit('room:kick', { playerId });
  };

  const handleLeaveRoom = () => {
    const socket = getSocket();

    if (isHost) {
      socket.emit('room:close');
    } else {
      socket.emit('room:leave');
    }

    reset();
    router.push('/');
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading room...</p>
        </div>
      </div>
    );
  }

  if (showNicknameEntry) {
    return <NicknameEntry onSubmit={handleJoinAsPlayer} isLoading={!!pendingNickname} />;
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Connecting...</p>
        </div>
      </div>
    );
  }

  return (
    <WaitingRoom
      room={room}
      players={players}
      currentPlayerId={useGameStore.getState().currentPlayer?.id}
      isHost={isHost}
      onStartGame={handleStartGame}
      onKickPlayer={handleKickPlayer}
      onLeaveRoom={handleLeaveRoom}
    />
  );
}
