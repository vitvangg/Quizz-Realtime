'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Copy, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerList } from './player-list';
import { useRoomStore } from '@/stores/room.store';
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
    socket,
    leaveRoom,
    loading,
    reset,
  } = useRoomStore();
  const [copied, setCopied] = useState(false);

  const isHost = !!(currentPlayer?.isHost || 
    (currentPlayer?.id === currentRoom?.hostId) ||
    (currentPlayer?.id?.startsWith('host_') && currentRoom?.hostId));

  useEffect(() => {
    if (!socket) return;

    const handleRoomLeft = (data: { roomId: string; message: string; isHost?: boolean }) => {
      console.log('[WaitingScreen] Room left event:', data);
      if (data.isHost) {
        toast.info('Bạn đã rời phòng');
        router.push('/quiz');
      } else {
        toast.info('Bạn đã rời phòng');
        router.push('/');
      }
      reset();
    };

    const handleHostLeft = (data: { roomId: string }) => {
      console.log('[WaitingScreen] Host left event:', data);
      toast.warning('Host đã rời phòng. Phòng sẽ bị đóng.');
      setTimeout(() => {
        router.push('/');
      }, 2000);
    };

    const handlePlayerLeft = (data: { playerId: string; nickname: string }) => {
      console.log('[WaitingScreen] Player left:', data);
      toast.info(`${data.nickname} đã rời phòng`);
    };

    const handleGameStarting = (data: { sessionId: string; countdown: number }) => {
      console.log('[WaitingScreen] Game starting (player only):', data);
      if (!isHost && currentPlayer) {
        sessionStorage.setItem('playerId', currentPlayer.id);
        sessionStorage.setItem('playerNickname', currentPlayer.nickname);
        sessionStorage.setItem('currentRoomId', currentRoom?.id || '');
        sessionStorage.setItem('isHost', 'false');
        router.push(`/game/${data.sessionId}`);
      }
    };

    socket.on('room_left', handleRoomLeft);
    socket.on('host_left', handleHostLeft);
    socket.on('player_left', handlePlayerLeft);
    socket.on('game_starting', handleGameStarting);

    return () => {
      socket.off('room_left', handleRoomLeft);
      socket.off('host_left', handleHostLeft);
      socket.off('player_left', handlePlayerLeft);
      socket.off('game_starting', handleGameStarting);
    };
  }, [socket, router, reset, isHost, currentPlayer]);

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
      
      const { useGameStore } = await import('@/stores/game.store');
      const gameStore = useGameStore.getState();
      
      if (!gameStore.socket?.connected) {
        gameStore.connectSocket();
        await new Promise<void>((resolve) => {
          const checkConnection = setInterval(() => {
            const store = useGameStore.getState();
            if (store.isConnected) {
              clearInterval(checkConnection);
              resolve();
            }
          }, 50);
        });
      }

      const sessionId = await gameStore.startGame(currentRoom.id);

      if (sessionId) {
        sessionStorage.setItem('hostSessionId', sessionId);
        toast.success('Game bắt đầu!', { id: 'start-game' });
        await new Promise(resolve => setTimeout(resolve, 5500));
        router.push(`/game/${sessionId}`);
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
