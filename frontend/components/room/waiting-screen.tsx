'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Copy, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerList } from './player-list';
import { useRoomStore } from '@/stores/room.store';
import { useGameStore } from '@/stores/game.store';
import { GameState } from '@/types/game.type';
import { toast } from 'sonner';

interface WaitingScreenProps {
  roomId: string;
}

export function WaitingScreen({ roomId }: WaitingScreenProps) {
  const router = useRouter();
  const {
    currentRoom,
    currentPlayer,
    players,
    socket: roomSocket,
    leaveRoom,
    loading,
    reset: resetRoomStore,
  } = useRoomStore();
  const [copied, setCopied] = useState(false);

  const isHost = !!(
    currentPlayer?.isHost ||
    currentPlayer?.id === currentRoom?.hostId ||
    (currentPlayer?.id?.startsWith('host_') && currentRoom?.hostId)
  );

  // Read countdown state from the game store — updated by socket events in the store.
  // This replaces the local gameStarting/countdown state that caused stale-closure bugs.
  const gameStore = useGameStore();

  // ── Ensure game store registers its socket updater ─────────────────────────────
  // connectSocket registers store updater so socket events (game_redirect etc.)
  // flow into Zustand. It no-ops if already registered.
  useEffect(() => {
    gameStore.connectSocket();
  }, []);
  const isGameStarting = gameStore.gameStatus === GameState.STARTING;
  const storeCountdown = gameStore.countdown;

  // ── Room events ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomSocket) return;

    const handleRoomLeft = (data: { roomId: string; isHost?: boolean }) => {
      resetRoomStore();
      if (data.isHost) {
        toast.info('Bạn đã rời phòng');
        router.push('/quiz');
      } else {
        toast.info('Bạn đã rời phòng');
        router.push('/');
      }
    };

    const handleHostLeft = (data: { roomId: string }) => {
      const gameStatus = useGameStore.getState().gameStatus;
      if (gameStatus === GameState.STARTING) return;
      toast.warning('Host đã rời phòng. Phòng sẽ bị đóng.');
      setTimeout(() => router.push('/'), 2000);
    };

    const handlePlayerLeft = (data: { nickname: string }) => {
      toast.info(`${data.nickname} đã rời phòng`);
    };

    roomSocket.on('room_left', handleRoomLeft);
    roomSocket.on('host_left', handleHostLeft);
    roomSocket.on('player_left', handlePlayerLeft);

    return () => {
      roomSocket.off('room_left', handleRoomLeft);
      roomSocket.off('host_left', handleHostLeft);
      roomSocket.off('player_left', handlePlayerLeft);
    };
  }, [roomSocket, router, resetRoomStore]);

  // ── SPA Navigation for game_redirect ───────────────────────────────────────────
  // _pendingRedirect is set in lib/socket.ts when game_redirect is received.
  // We use a separate useEffect on this specific field to avoid stale-closure issues.
  // IMPORTANT: Only set hostSessionId for the actual host, not for players.
  const pendingRedirect = useGameStore((s) => s._pendingRedirect);

  useEffect(() => {
    if (!pendingRedirect) return;
    console.log('[WaitingScreen] SPA redirect to:', pendingRedirect);
    
    // Only set hostSessionId if this user is actually the host
    // (has matching userId in room's hostId, or isHost flag is set)
    const isActualHost = !!(
      currentPlayer?.isHost ||
      currentPlayer?.id === currentRoom?.hostId ||
      (currentPlayer?.id?.startsWith('host_') && currentRoom?.hostId)
    );
    
    if (isActualHost) {
      sessionStorage.setItem('hostSessionId', pendingRedirect.replace('/game/', ''));
      console.log('[WaitingScreen] Set hostSessionId (is actual host)');
    } else {
      console.log('[WaitingScreen] Not setting hostSessionId (is player)');
    }
    
    useGameStore.setState({ _pendingRedirect: null });
    router.push(pendingRedirect);
  }, [pendingRedirect, currentPlayer, currentRoom]);

  const handleCopyPin = async () => {
    if (currentRoom?.pin) {
      await navigator.clipboard.writeText(currentRoom.pin);
      setCopied(true);
      toast.success('Đã copy mã PIN!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeave = async () => {
    if (isHost) {
      await leaveRoom();
      router.push('/quiz');
    } else {
      await leaveRoom();
      router.push('/');
    }
  };

  const handleStartGame = async () => {
    if (!isHost || !currentRoom) return;

    try {
      toast.loading('Đang bắt đầu game...', { id: 'start-game' });

      const gameStore = useGameStore.getState();

      if (!gameStore.socket?.connected) {
        gameStore.connectSocket();
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            if (useGameStore.getState().isConnected) {
              clearInterval(interval);
              resolve();
            }
          }, 50);
        });
      }

      const sessionId = await gameStore.startGame(currentRoom.id);

      if (sessionId) {
        sessionStorage.setItem('hostSessionId', sessionId);
        toast.success('Game bắt đầu!', { id: 'start-game' });
      }
    } catch (error) {
      console.error('[WaitingScreen] Start game error:', error);
      toast.error('Không thể bắt đầu game', { id: 'start-game' });
    }
  };

  if (loading || !currentRoom) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Đang tải phòng...</p>
        </div>
      </div>
    );
  }

  // Host countdown overlay — reads from game store (set by socket events in the store).
  if (isGameStarting && storeCountdown !== null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl text-white/80 mb-4">Game bắt đầu!</p>
          <div className="text-9xl font-bold text-white animate-pulse">
            {storeCountdown}
          </div>
          <p className="text-xl text-white/60 mt-4">Chuẩn bị câu hỏi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={handleLeave}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Phòng chờ</h1>
          <p className="text-muted-foreground">
            {currentRoom.quiz?.title || 'Quiz'}
          </p>
        </div>
        {isHost && (
          <span className="ml-auto px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
            Bạn là Host
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card className="border-2">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Mã phòng
                </p>
                <div className="flex items-center justify-center gap-4 mb-4">
                  <span className="text-5xl font-bold tracking-wider text-primary">
                    {currentRoom.pin}
                  </span>
                  <Button variant="outline" size="icon" onClick={handleCopyPin}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Chia sẻ mã này để bạn bè tham gia
                </p>
              </div>
            </CardContent>
          </Card>

          {isHost ? (
            <Button
              size="lg"
              className="w-full gap-2 text-lg"
              onClick={handleStartGame}
            >
              <Play className="w-5 h-5" />
              Bắt đầu Game
            </Button>
          ) : (
            <Card className="bg-muted/50">
              <CardContent className="pt-6 text-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="font-medium">Đang chờ Host bắt đầu...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Vui lòng chờ trong khi host chuẩn bị
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <PlayerList
            players={players}
            isHost={isHost}
            currentPlayerId={currentPlayer?.id}
            hostId={currentRoom.hostId}
          />
        </div>
      </div>
    </div>
  );
}
