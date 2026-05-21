'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Copy, ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerGrid } from './player-grid';
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

  // Single source of truth for host identity
  // Use direct property access for immediate rendering, no memoization delay
  const isHost = currentPlayer?.isHost === true;

  const gameStore = useGameStore();

  useEffect(() => {
    gameStore.connectSocket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isGameStarting = gameStore.gameStatus === GameState.STARTING;
  const storeCountdown = gameStore.countdown;

  // Calculate active players (no connection property in room Player type, just use all)
  const activePlayers = useMemo(
    () => players,
    [players]
  );

  useEffect(() => {
    if (!roomSocket) return;

    const handleRoomClosed = (_data: { roomId: string; reason: string; message?: string }) => {
      console.log('[WaitingScreen] room_closed received:', _data);
      resetRoomStore();
      toast.warning(_data.message || 'Phòng đã bị đóng.', { duration: 5000 });
      router.push('/');
    };

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

    const handleHostLeft = (_data: { roomId: string }) => {
      const gameStatus = useGameStore.getState().gameStatus;
      if (gameStatus === GameState.STARTING) return;
      toast.warning('Host đã rời phòng. Phòng sẽ bị đóng.');
      setTimeout(() => router.push('/'), 2000);
    };

    const handleGameStarting = (data: { sessionId: string; countdown: number }) => {
      console.log('[WaitingScreen] game_starting received:', data);
      useGameStore.setState({
        gameStatus: GameState.STARTING,
        countdown: data.countdown,
        sessionId: data.sessionId,
      });
      toast.success('Game bắt đầu!', { id: 'start-game' });
    };

    const handleCountdownTick = (data: { remaining: number }) => {
      console.log('[WaitingScreen] countdown_tick received:', data);
      useGameStore.setState({ countdown: data.remaining });
    };

    const handleGameRedirect = (data: { url: string; sessionId: string }) => {
      console.log('[WaitingScreen] game_redirect received:', data);
      useGameStore.setState({ _pendingRedirect: data.url });
    };

    roomSocket.on('room_closed', handleRoomClosed);
    roomSocket.on('room_left', handleRoomLeft);
    roomSocket.on('host_left', handleHostLeft);
    roomSocket.on('game_starting', handleGameStarting);
    roomSocket.on('countdown_tick', handleCountdownTick);
    roomSocket.on('game_redirect', handleGameRedirect);

    return () => {
      roomSocket.off('room_closed', handleRoomClosed);
      roomSocket.off('room_left', handleRoomLeft);
      roomSocket.off('host_left', handleHostLeft);
      roomSocket.off('game_starting', handleGameStarting);
      roomSocket.off('countdown_tick', handleCountdownTick);
      roomSocket.off('game_redirect', handleGameRedirect);
    };
  }, [roomSocket, router, resetRoomStore]);

  const pendingRedirect = useGameStore((s) => s._pendingRedirect);

  useEffect(() => {
    if (!pendingRedirect) return;
    console.log('[WaitingScreen] SPA redirect to:', pendingRedirect);

    if (isHost) {
      sessionStorage.setItem('hostSessionId', pendingRedirect.replace('/game/', ''));
      console.log('[WaitingScreen] Set hostSessionId (is host)');
    } else {
      console.log('[WaitingScreen] Not setting hostSessionId (is player)');
    }

    useGameStore.setState({ _pendingRedirect: null });
    router.push(pendingRedirect);
  }, [pendingRedirect, isHost, router]);

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

      gameStore.startGame(currentRoom.id);
    } catch (error) {
      console.error('[WaitingScreen] Start game error:', error);
      toast.error('Không thể bắt đầu game', { id: 'start-game' });
    }
  };

  // Wait for both room and player data before rendering views
  // This prevents flickering between Player/Host views
  if (loading || !currentRoom || !currentPlayer) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4 bg-neon-pink"></div>
          <p className="font-black uppercase tracking-widest">Đang tải phòng...</p>
        </div>
      </div>
    );
  }

  // Host countdown overlay
  if (isGameStarting && storeCountdown !== null) {
    return (
      <div className="min-h-screen bg-neon-yellow flex items-center justify-center border-4 border-black">
        <div className="text-center">
          <p className="text-2xl text-black font-bold mb-4 uppercase">Game bắt đầu!</p>
          <div className="bg-black text-neon-yellow border-4 border-black shadow-brutal-xl w-48 h-48 flex items-center justify-center mx-auto mb-4">
            <span className="text-8xl font-black">{storeCountdown}</span>
          </div>
          <p className="text-xl text-black/70 font-bold uppercase">Chuẩn bị câu hỏi...</p>
        </div>
      </div>
    );
  }

  // =====================================================
  // HOST LOBBY VIEW - Grid layout với sticky control panel
  // =====================================================
  if (isHost) {
    return (
      <div className="min-h-screen bg-neon-yellow p-3 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto h-full flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Left Control Panel - Sticky on desktop */}
          <div className="lg:w-80 lg:flex-shrink-0">
            <div className="bg-white border-4 border-black shadow-brutal-xl rounded-2xl p-4 lg:sticky lg:top-4">
              {/* Back Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleLeave}
                className="w-full mb-4 border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 bg-white font-black"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Thoát phòng
              </Button>

              {/* Room Code Section */}
              <div className="text-center mb-4">
                <p className="text-xs font-bold text-black/50 uppercase tracking-wider mb-1">
                  Mã phòng
                </p>
                <div className="bg-neon-yellow border-4 border-black rounded-xl p-3 shadow-brutal-sm">
                  <p className="text-3xl sm:text-4xl font-black font-mono tracking-widest text-black">
                    {currentRoom.pin}
                  </p>
                </div>
                <button
                  onClick={handleCopyPin}
                  className="mt-3 flex items-center justify-center gap-2 w-full py-2 bg-black text-white text-sm font-bold rounded-lg hover:bg-black/80 transition-colors border-2 border-black"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Đã copy!' : 'Copy mã phòng'}
                </button>
              </div>

              {/* Player Count */}
              <div className="bg-neon-pink border-4 border-black rounded-xl p-3 mb-4 text-center shadow-brutal-sm">
                <div className="flex items-center justify-center gap-2">
                  <Users className="w-5 h-5 text-white" />
                  <span className="text-2xl font-black text-white">
                    {activePlayers.length}
                  </span>
                </div>
                <p className="text-xs font-bold text-white/80 uppercase mt-1">
                  Người chơi
                </p>
              </div>

              {/* Quiz Info */}
              <div className="bg-black/5 border-3 border-black rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-black/50 uppercase">
                  Quiz
                </p>
                <p className="text-base font-black text-black truncate">
                  {currentRoom.quiz?.title || 'Quiz'}
                </p>
              </div>

              {/* Start Button */}
              <Button
                onClick={handleStartGame}
                className={`
                  w-full py-4 text-lg font-black uppercase border-4 border-black shadow-brutal
                  transition-all duration-150 active:shadow-none active:translate-x-2 active:translate-y-2
                  ${activePlayers.length > 0
                    ? 'bg-neon-green hover:bg-neon-green/80 text-black'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }
                `}
              >
                <Play className="w-6 h-6 mr-2" />
                Bắt đầu Game
              </Button>
            </div>
          </div>

          {/* Right Player Arena - Grid */}
          <div className="flex-1 min-h-0 flex flex-col bg-white/50 backdrop-blur-sm border-4 border-black rounded-2xl overflow-hidden shadow-brutal">
            {/* Header */}
            <div className="bg-neon-blue border-b-4 border-black px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-white" />
                <h2 className="font-black text-white uppercase">
                  Người chơi
                </h2>
                <span className="bg-black text-white px-2 py-0.5 rounded-full text-sm font-bold">
                  {activePlayers.length}
                </span>
              </div>
              <span className="text-sm font-bold text-white/70 animate-pulse">
                Đang chờ...
              </span>
            </div>

            {/* Player Grid - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4">
              {activePlayers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="text-6xl mb-4">👥</div>
                  <p className="text-xl font-black text-black/50 uppercase">
                    Chưa có người chơi
                  </p>
                  <p className="text-sm font-bold text-black/30 mt-2">
                    Chia sẻ mã phòng để mời bạn bè
                  </p>
                </div>
              ) : activePlayers.length > 100 ? (
                <>
                  <div className="mb-4 p-2 bg-neon-green border-3 border-black rounded-xl text-center">
                    <p className="font-black text-black">
                      🎉 {activePlayers.length} người chơi đã tham gia!
                    </p>
                  </div>
                  <PlayerGrid
                    players={activePlayers}
                    currentPlayerId={currentPlayer?.id}
                  />
                </>
              ) : (
                <PlayerGrid
                  players={activePlayers}
                  currentPlayerId={currentPlayer?.id}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =====================================================
  // PLAYER VIEW - Card đơn giản, không grid
  // =====================================================
  return (
    <div className="min-h-screen bg-neon-blue flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <Card className="bg-white border-4 border-black shadow-brutal-xl rounded-2xl overflow-hidden">
          {/* Header */}
          <CardHeader className="bg-neon-pink border-b-4 border-black px-6 py-4 text-center">
            <CardTitle className="text-2xl font-black text-white uppercase">
              Bạn đã vào phòng
            </CardTitle>
          </CardHeader>

          <CardContent className="p-6">
            {/* Avatar */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-24 h-24 bg-neon-yellow border-4 border-black rounded-full flex items-center justify-center shadow-brutal">
                  <span className="text-5xl font-black text-black">
                    {currentPlayer?.nickname?.charAt(0).toUpperCase() || 'P'}
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-neon-green border-3 border-black rounded-full flex items-center justify-center">
                  <span className="text-sm">✓</span>
                </div>
              </div>
            </div>

            {/* Nickname */}
            <div className="text-center mb-6">
              <p className="text-sm font-bold text-black/50 uppercase tracking-wider">
                Tên của bạn
              </p>
              <p className="text-2xl font-black text-black mt-1">
                {currentPlayer?.nickname || 'Player'}
              </p>
            </div>

            {/* Room Code */}
            <div className="bg-black/5 border-3 border-black rounded-xl p-4 mb-6">
              <p className="text-xs font-bold text-black/50 uppercase tracking-wider text-center mb-2">
                Mã phòng
              </p>
              <div className="flex items-center justify-center gap-3">
                <p className="text-4xl font-black font-mono tracking-widest text-neon-pink">
                  {currentRoom.pin}
                </p>
                <button
                  onClick={handleCopyPin}
                  className="p-2 bg-black text-white rounded-lg hover:bg-black/80 transition-colors border-2 border-black"
                  title="Copy mã phòng"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Waiting Status */}
            <div className="text-center">
              <div className="inline-flex items-center gap-3 bg-neon-green border-4 border-black rounded-xl px-6 py-4 shadow-brutal">
                <div className="relative">
                  <div className="w-3 h-3 bg-black rounded-full animate-pulse" />
                </div>
                <span className="font-black text-black uppercase text-lg">
                  Đang chờ host bắt đầu...
                </span>
              </div>
            </div>

            {/* Leave Button */}
            <button
              onClick={handleLeave}
              className="w-full mt-6 py-3 text-sm font-bold text-black/50 hover:text-black transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Rời phòng
            </button>
          </CardContent>
        </Card>

        {/* Decorative elements */}
        <div className="flex justify-center gap-2 mt-6">
          <div className="w-3 h-3 bg-neon-yellow border-2 border-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-3 h-3 bg-neon-pink border-2 border-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-3 h-3 bg-neon-blue border-2 border-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
