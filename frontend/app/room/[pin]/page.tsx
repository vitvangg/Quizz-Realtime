'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { WaitingRoom } from '@/components/game/WaitingRoom';
import { NicknameEntry } from '@/components/game/NicknameEntry';
import { getSocket } from '@/lib/socket';
import { roomService } from '@/services/room.service';
import { useGameStore } from '@/stores/gameStore';
import type { Room, Player } from '@/types/game';

export default function WaitingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const pin = params.pin as string;

  const {
    room,
    setRoom,
    currentPlayer,
    setCurrentPlayer,
    players,
    setPlayers,
    addPlayer,
    removePlayer,
    isHost,
    setIsHost,
    isConnected,
    setIsConnected,
    reset,
  } = useGameStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showNicknameEntry, setShowNicknameEntry] = useState(false);
  const [error, setError] = useState('');

  // Check if user is logged in (host)
  const checkUserSession = useCallback(async () => {
    console.log('[DEBUG] checkUserSession called with pin:', pin);
    const token = localStorage.getItem('accessToken');
    console.log('[DEBUG] token exists:', !!token);

    if (token) {
      // User is logged in - try to find room and verify as host
      try {
        console.log('[DEBUG] Fetching room by PIN:', pin);
        const roomData = await roomService.getRoomByPin(pin);
        console.log('[DEBUG] Room data:', roomData);

        // Check if user is the host
        const payload = JSON.parse(atob(token.split('.')[1]));
        const userId = payload.sub || payload.id;
        console.log('[DEBUG] userId:', userId, 'hostId:', roomData.hostId);

        if (roomData.hostId === userId) {
          // User is the host
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
          console.log('[DEBUG] User is HOST');
          return 'host';
        } else {
          console.log('[DEBUG] User is logged in but NOT host');
        }
      } catch (err: any) {
        console.error('[DEBUG] Error in checkUserSession:', err);
        if (err.response?.status === 401) {
          // Token expired
          localStorage.removeItem('accessToken');
        }
      }
    } else {
      console.log('[DEBUG] No token - player flow');
    }

    // Not logged in or not the host - player flow
    return 'player';
  }, [pin, setRoom, setPlayers, setCurrentPlayer, setIsHost]);

  // Initialize room and socket
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const userType = await checkUserSession();

        if (userType === 'host') {
          setShowNicknameEntry(false);
        } else {
          setShowNicknameEntry(true);
        }
      } catch (err) {
        console.error('Error initializing room:', err);
        setError('Failed to load room');
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      reset();
    };
  }, [checkUserSession, reset]);

  // Socket connection for hosts
  useEffect(() => {
    if (!isHost || !room) return;

    const socket = getSocket();

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('join-room', { pin, userId: currentPlayer?.id });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handlePlayerJoined = (data: { player: Player }) => {
      addPlayer(data.player);
      toast.info(`${data.player.nickname} joined the room`);
    };

    const handlePlayerLeft = (data: { playerId: string }) => {
      removePlayer(data.playerId);
    };

    const handlePlayerKicked = (data: { playerId: string }) => {
      if (data.playerId === currentPlayer?.id) {
        toast.error('You have been removed from the room');
        router.push('/');
      } else {
        removePlayer(data.playerId);
      }
    };

    const handleRoomUpdated = (data: { players: Player[] }) => {
      setPlayers(data.players);
    };

    const handleGameStarting = (data: { sessionId: string }) => {
      toast.success('Game is starting!');
      router.push(`/play/${data.sessionId}`);
    };

    const handleError = (data: { code: string; message: string }) => {
      toast.error(data.message);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);
    socket.on('player-kicked', handlePlayerKicked);
    socket.on('room-updated', handleRoomUpdated);
    socket.on('game-starting', handleGameStarting);
    socket.on('error', handleError);

    // Connect if not already connected
    if (socket.connected) {
      setIsConnected(true);
      socket.emit('join-room', { pin, userId: currentPlayer?.id });
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('player-left', handlePlayerLeft);
      socket.off('player-kicked', handlePlayerKicked);
      socket.off('room-updated', handleRoomUpdated);
      socket.off('game-starting', handleGameStarting);
      socket.off('error', handleError);
    };
  }, [isHost, room, pin, currentPlayer, addPlayer, removePlayer, setPlayers, setIsConnected, router]);

  // Socket connection for players
  useEffect(() => {
    if (isHost || !currentPlayer) return;

    const socket = getSocket();

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('join-room', { pin, nickname: currentPlayer.nickname });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleJoinedRoom = (data: { room: Room; player: Player }) => {
      setRoom(data.room);
      setPlayers(data.room.players || []);
      setShowNicknameEntry(false);
    };

    const handlePlayerJoined = (data: { player: Player }) => {
      addPlayer(data.player);
    };

    const handlePlayerLeft = (data: { playerId: string }) => {
      removePlayer(data.playerId);
    };

    const handlePlayerKicked = () => {
      toast.error('You have been removed from the room');
      router.push('/');
    };

    const handleRoomUpdated = (data: { players: Player[] }) => {
      setPlayers(data.players);
    };

    const handleGameStarting = (data: { sessionId: string }) => {
      toast.success('Game is starting!');
      router.push(`/play/${data.sessionId}`);
    };

    const handleError = (data: { code: string; message: string }) => {
      toast.error(data.message);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('joined-room', handleJoinedRoom);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);
    socket.on('player-kicked', handlePlayerKicked);
    socket.on('room-updated', handleRoomUpdated);
    socket.on('game-starting', handleGameStarting);
    socket.on('error', handleError);

    // Connect if not already connected
    if (socket.connected) {
      setIsConnected(true);
      socket.emit('join-room', { pin, nickname: currentPlayer.nickname });
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('joined-room', handleJoinedRoom);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('player-left', handlePlayerLeft);
      socket.off('player-kicked', handlePlayerKicked);
      socket.off('room-updated', handleRoomUpdated);
      socket.off('game-starting', handleGameStarting);
      socket.off('error', handleError);
    };
  }, [isHost, currentPlayer, pin, addPlayer, removePlayer, setRoom, setPlayers, setIsConnected, router]);

  const handleJoinAsPlayer = (nickname: string) => {
    setIsJoining(true);

    // Set temporary player info
    setCurrentPlayer({
      id: 'temp-' + Date.now(),
      roomId: '',
      nickname,
      joinedAt: new Date().toISOString(),
      isHost: false,
    });

    // Actually join via socket will happen in useEffect
    setShowNicknameEntry(false);
    setIsJoining(false);
  };

  const handleStartGame = () => {
    if (!room || !currentPlayer) return;

    setIsStarting(true);
    const socket = getSocket();
    socket.emit('start-game', {
      roomId: room.id,
      hostId: currentPlayer.id,
    });

    // Timeout for error handling
    setTimeout(() => {
      setIsStarting(false);
    }, 10000);
  };

  const handleKickPlayer = (playerId: string) => {
    if (!currentPlayer) return;

    const socket = getSocket();
    socket.emit('kick-player', {
      playerId,
      hostId: currentPlayer.id,
    });
  };

  const handleLeaveRoom = () => {
    reset();
    router.push('/');
  };

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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{error}</h2>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back Home
          </button>
        </div>
      </div>
    );
  }

  // Show nickname entry for players
  if (showNicknameEntry) {
    return <NicknameEntry onSubmit={handleJoinAsPlayer} isLoading={isJoining} />;
  }

  if (!room) {
    console.log('Room is null - isHost:', isHost, 'isConnected:', isConnected, 'showNicknameEntry:', showNicknameEntry);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Connecting... (isHost: {String(isHost)})</p>
          <p className="mt-2 text-gray-400 text-sm">PIN: {pin}</p>
        </div>
      </div>
    );
  }

  return (
    <WaitingRoom
      room={room}
      players={players}
      currentPlayerId={currentPlayer?.id}
      isHost={isHost}
      onStartGame={handleStartGame}
      onKickPlayer={handleKickPlayer}
      isStarting={isStarting}
    />
  );
}
