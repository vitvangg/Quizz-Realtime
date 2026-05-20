'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Copy, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerList } from './player-list';
import { PaginationControls } from '@/components/common/PaginationControls';
import { usePagination } from '@/hooks/usePagination';
import { useRoomStore } from '@/stores/room.store';
import { useGameStore } from '@/stores/game.store';
import { useAuthStore } from '@/stores/auth.store';
import { GameState } from '@/types/game.type';
import { toast } from 'sonner';
import { useRoomHostIdentity, checkIsHost } from '@/hooks/useHostIdentity';

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

  // Pagination for lobby player list - 20 players per page
  const lobbyPageSize = 20;
  const {
    page: lobbyPage,
    totalPages: lobbyTotalPages,
    totalItems: lobbyTotalItems,
    startIndex: lobbyStartIndex,
    endIndex: lobbyEndIndex,
    hasNextPage: lobbyHasNextPage,
    hasPrevPage: lobbyHasPrevPage,
    nextPage: lobbyNextPage,
    prevPage: lobbyPrevPage,
    paginatedItems: paginatedPlayers,
    shouldShowPagination: lobbyShouldShowPagination,
  } = usePagination(players, { pageSize: lobbyPageSize });

  // ============================================================
  // SINGLE SOURCE OF TRUTH: useRoomHostIdentity
  // ============================================================
  // This hook provides authoritative host identity based on:
  // 1. Server response (room_joined event) - authoritative
  // 2. Server validation (playerId format)
  // 3. Storage recovery (sessionStorage for reload)
  const hostIdentity = useRoomHostIdentity(roomId);
  
  // Use the hook's isHost for consistent determination
  // The hook handles all edge cases and priority logic
  const isHost = hostIdentity.isHost;

  const gameStore = useGameStore();

  useEffect(() => {
    gameStore.connectSocket();
  }, []);
  const isGameStarting = gameStore.gameStatus === GameState.STARTING;
  const storeCountdown = gameStore.countdown;

  useEffect(() => {
    if (!roomSocket) return;

    const handleRoomClosed = (data: { roomId: string; reason: string; message?: string }) => {
      console.log('[WaitingScreen] room_closed received:', data);
      resetRoomStore();
      toast.warning(data.message || 'Phòng đã bị đóng.', {
        duration: 5000,
      });
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

    const handleHostLeft = (data: { roomId: string }) => {
      const gameStatus = useGameStore.getState().gameStatus;
      if (gameStatus === GameState.STARTING) return;
      toast.warning('Host đã rời phòng. Phòng sẽ bị đóng.');
      setTimeout(() => router.push('/'), 2000);
    };

    const handleGameStarting = (data: { sessionId: string; countdown: number }) => {
      console.log('[WaitingScreen] game_starting received:', data);
      // Update store state
      useGameStore.setState({
        gameStatus: GameState.STARTING,
        countdown: data.countdown,
        sessionId: data.sessionId,
      });
      // Show success toast - this happens BEFORE question_start
      toast.success('Game bắt đầu!', { id: 'start-game' });
    };

    const handleCountdownTick = (data: { remaining: number }) => {
      console.log('[WaitingScreen] countdown_tick received:', data);
      useGameStore.setState({ countdown: data.remaining });
    };

    const handleGameRedirect = (data: { url: string; sessionId: string }) => {
      console.log('[WaitingScreen] game_redirect received:', data);
      // Set pendingRedirect to trigger redirect effect
      useGameStore.setState({ _pendingRedirect: data.url });
    };

    roomSocket.on('room_closed', handleRoomClosed);
    roomSocket.on('room_left', handleRoomLeft);
    roomSocket.on('host_left', handleHostLeft);
    // NOTE: player_left toast is handled by room.store.ts
    // DO NOT add duplicate listener here
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
    
    // ============================================================
    // DETERMINE HOST STATUS FOR REDIRECT
    // Using single source of truth
    // ============================================================
    const isHostForRedirect = hostIdentity.isHost;
    
    if (isHostForRedirect) {
      // Update sessionStorage for the new game session
      sessionStorage.setItem('hostSessionId', pendingRedirect.replace('/game/', ''));
      console.log('[WaitingScreen] Set hostSessionId (is host)');
    } else {
      console.log('[WaitingScreen] Not setting hostSessionId (is player)');
    }
    
    useGameStore.setState({ _pendingRedirect: null });
    router.push(pendingRedirect);
  }, [pendingRedirect, hostIdentity.isHost, router]);

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

      // IMPORTANT: Redirect immediately after emitting host_start_game
      // DO NOT wait for response - the redirect will happen via game_redirect event
      // This ensures the toast "Game bắt đầu!" appears BEFORE question_start
      gameStore.startGame(currentRoom.id);
      
      // SessionId will be set by server response, but we redirect anyway
      // The game_redirect event will also trigger redirect
      // toast.success will be called by the game_starting event handler
      // So we just return without waiting
      
    } catch (error) {
      console.error('[WaitingScreen] Start game error:', error);
      toast.error('Không thể bắt đầu game', { id: 'start-game' });
    }
  };

  if (loading || !currentRoom) {
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

  return (
    <div className="min-h-screen bg-white">
      {/* Header Banner */}
      <div className="bg-neon-blue border-b-4 border-black">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleLeave}
              className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 bg-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-black uppercase">PHÒNG CHỜ</h1>
              <p className="font-bold text-black/70">{currentRoom.quiz?.title || 'Quiz'}</p>
            </div>
            {isHost && (
              <span className="ml-auto px-4 py-2 bg-neon-orange border-4 border-black shadow-brutal-sm font-black uppercase text-sm">
                BẠN LÀ HOST
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column - PIN Card */}
          <div className="space-y-6">
            <Card className="border-4 border-black shadow-brutal">
              <CardHeader className="bg-neon-green border-b-4 border-black">
                <CardTitle className="text-center font-black uppercase">Mã phòng</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="bg-black text-white border-4 border-black shadow-brutal inline-block px-8 py-4 mb-4">
                    <span className="text-5xl font-black tracking-widest">{currentRoom.pin}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleCopyPin}
                    className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 ml-2"
                  >
                    <Copy className={`w-5 h-5 ${copied ? 'text-neon-green' : ''}`} />
                  </Button>
                  <p className="text-sm font-medium text-black/50 mt-4 uppercase">
                    Chia sẻ mã này để bạn bè tham gia
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Start Game / Waiting */}
            {isHost ? (
              <Button
                size="lg"
                className="w-full h-16 text-xl font-black bg-neon-pink border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 transition-all"
                onClick={handleStartGame}
              >
                <Play className="w-6 h-6 mr-2" />
                BẮT ĐẦU GAME
              </Button>
            ) : (
              <Card className="border-4 border-black shadow-brutal bg-neon-yellow">
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4 bg-black"></div>
                  <p className="font-black uppercase text-lg">Đang chờ Host bắt đầu...</p>
                  <p className="text-sm font-medium text-black/50 mt-2">
                    Vui lòng chờ trong khi host chuẩn bị
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Player List */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg uppercase tracking-wide">
                Người chơi ({lobbyTotalItems})
              </h3>
            </div>
            <PlayerList
              players={paginatedPlayers}
              isHost={isHost}
              currentPlayerId={currentPlayer?.id}
              hostId={currentRoom.hostId}
              page={lobbyPage}
              totalPages={lobbyTotalPages}
              totalItems={lobbyTotalItems}
              startIndex={lobbyStartIndex}
              endIndex={lobbyEndIndex}
              onPrev={lobbyPrevPage}
              onNext={lobbyNextPage}
              showPagination={lobbyShouldShowPagination}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
