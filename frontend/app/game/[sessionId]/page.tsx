'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useGameStore } from '@/stores/game.store';
import { useRoomStore } from '@/stores/room.store';
import { useAuthStore } from '@/stores/auth.store';
import { GameState } from '@/types/game.type';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/apiClient';
// ============================================================================
// FREEZE OVERLAY COMPONENT
// ============================================================================
function FreezeOverlay({ message }: { message: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: 'rgba(15, 2, 2, 0.97)' }}
    >
      {/* Pulsing Warning Icon */}
      <div className="mb-6 relative">
        <div className="absolute inset-0 rounded-full bg-red-600 animate-ping opacity-30" />
        <div className="relative w-24 h-24 rounded-full bg-red-900 border-4 border-red-500 flex items-center justify-center">
          <span className="text-5xl">🚨</span>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-black text-red-500 tracking-widest uppercase mb-2 animate-pulse">
        HỆ THỐNG TẠM DỪNG
      </h1>

      {/* Message */}
      <p className="text-center text-red-200 max-w-lg px-6 text-sm leading-relaxed mb-6">
        {message || 'Phát hiện truy cập bất thường. Đang truy vết kẻ tấn công. Vui lòng giữ nguyên màn hình và đợi thông báo từ ban tổ chức.'}
      </p>

      {/* Timer */}
      <div className="flex flex-col items-center gap-1 mb-8">
        <span className="text-xs text-red-400 uppercase tracking-widest">Đã dừng</span>
        <span className="text-4xl font-mono font-bold text-white">{fmt(elapsed)}</span>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-red-800 bg-red-950">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs text-red-300 font-mono">SECURITY RESPONSE ACTIVE</span>
      </div>
    </div>
  );
}
// ============================================================================
// MAINTENANCE OVERLAY
// ============================================================================
function MaintenanceOverlay({ message }: { message: string }) {
  const [countdown, setCountdown] = useState(5);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);
  return (
    <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-gray-950/98">
      <div className="mb-5 text-6xl">🔧</div>
      <h1 className="text-2xl font-bold text-white mb-2">Hệ thống đang bảo trì</h1>
      <p className="text-gray-400 text-sm max-w-md text-center px-6 mb-6">
        {message || 'Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau ít phút.'}
      </p>
      {countdown > 0 && (
        <p className="text-gray-500 text-xs">Ngắt kết nối sau <span className="text-white font-bold">{countdown}s</span></p>
      )}
    </div>
  );
}
export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const {
    gameStatus,
    isHost,
    isFrozen,
    freezeMessage,
    isMaintenance,
    maintenanceMessage,
    currentQuestion,
    questionIndex,
    totalQuestions,
    hasAnswered,
    selectedAnswerId,
    leaderboard,
    myScore,
    myRank,
    countdown,
    correctAnswerId,
    connectSocket,
    reset,
  } = useGameStore();

  const [localTimeRemaining, setLocalTimeRemaining] = useState(0);
  const [isJoining, setIsJoining] = useState(true);

  // ── Setup socket + listeners ONCE (never cleanup on unmount) ─────────────────
  // reset() is intentionally NOT called here — the socket must survive navigation
  useEffect(() => {
    if (!sessionId || sessionId === 'undefined') {
      router.push('/');
      return;
    }

    const gameStore = useGameStore.getState();
    if (!gameStore.socket?.connected) {
      gameStore.connectSocket();
    }

    const socket = gameStore.socket;
    if (!socket) return;

    const handleGameStarting = (data: { sessionId: string; countdown: number }) => {
      console.log('[GamePage] game_starting:', data);
      useGameStore.setState({
        gameStatus: GameState.STARTING,
        countdown: data.countdown,
        sessionId: data.sessionId,
      });
    };

    const handleCountdownTick = (data: { remaining: number }) => {
      useGameStore.setState({ countdown: data.remaining });
    };

    const handleQuestionStart = (data: any) => {
      console.log('[GamePage] question_start:', data);
      useGameStore.setState({
        gameStatus: GameState.QUESTION_ACTIVE,
        currentQuestion: data.question,
        questionIndex: data.questionIndex,
        totalQuestions: data.totalQuestions,
        countdown: 0,
        hasAnswered: false,
        selectedAnswerId: null,
        correctAnswerId: null,
      });
    };

    const handleQuestionResult = (data: any) => {
      console.log('[GamePage] question_result:', data);
      const state = useGameStore.getState();
      useGameStore.setState({
        gameStatus: GameState.QUESTION_RESULT,
        leaderboard: data.leaderboard || [],
        correctAnswerId: data.correctAnswer?.id || null,
      });
      // Update my score from leaderboard
      if (state.myPlayerId) {
        const myEntry = (data.leaderboard || []).find(
          (e: any) => e.playerId === state.myPlayerId
        );
        if (myEntry) {
          useGameStore.setState({ myScore: myEntry.score, myRank: myEntry.rank });
        }
      }
    };

    const handleGameEnded = (data: any) => {
      console.log('[GamePage] game_ended:', data);
      useGameStore.setState({
        gameStatus: GameState.FINISHED,
        leaderboard: data.leaderboard || [],
        currentQuestion: null,
      });
    };

    const handleScoreUpdate = (data: any) => {
      // Only update leaderboard when game is in QUESTION_RESULT state (after time expires)
      // During QUESTION_ACTIVE, score should NOT be shown to players
      const state = useGameStore.getState();
      if (state.gameStatus === GameState.QUESTION_RESULT && data.leaderboard) {
        useGameStore.setState({ leaderboard: data.leaderboard });
        if (state.myPlayerId) {
          const myEntry = data.leaderboard.find(
            (e: any) => e.playerId === state.myPlayerId
          );
          if (myEntry) {
            useGameStore.setState({ myScore: myEntry.score, myRank: myEntry.rank });
          }
        }
      }
    };

    // Safety: if server says this sessionId is wrong, redirect to the right one.
    // For play_again, this redirects to the new session.
    const handleGameRedirect = (data: { url: string; sessionId: string }) => {
      console.log('[GamePage] game_redirect received:', data, 'current sessionId:', sessionId);
      if (data.sessionId !== sessionId) {
        // Use _pendingRedirect so the effect handles navigation
        useGameStore.setState({ _pendingRedirect: data.url });
      }
    };

    // Handle room closed by host - kick all players to home page, host goes to /quiz
    const handleRoomClosed = (data: { reason: string }) => {
      console.log('[GamePage] room_closed received:', data);
      const storedHostSessionId = sessionStorage.getItem('hostSessionId');
      const isHostSession = storedHostSessionId === sessionId;

      if (isHostSession) {
        toast.info(data.reason || 'Da dong phong');
        useGameStore.getState().reset();
        useRoomStore.getState().reset();
        router.push('/quiz');
      } else {
        toast.warning(data.reason || 'Host da roi phong');
        useGameStore.getState().reset();
        useRoomStore.getState().reset();
        router.push('/');
      }
    };

    socket.on('game_starting', handleGameStarting);
    socket.on('countdown_tick', handleCountdownTick);
    socket.on('question_start', handleQuestionStart);
    socket.on('question_result', handleQuestionResult);
    socket.on('game_ended', handleGameEnded);
    socket.on('score_update', handleScoreUpdate);
    socket.on('game_redirect', handleGameRedirect);
    socket.on('room_closed', handleRoomClosed);

    return () => {
      socket.off('game_starting', handleGameStarting);
      socket.off('countdown_tick', handleCountdownTick);
      socket.off('question_start', handleQuestionStart);
      socket.off('question_result', handleQuestionResult);
      socket.off('game_ended', handleGameEnded);
      socket.off('score_update', handleScoreUpdate);
      socket.off('game_redirect', handleGameRedirect);
      socket.off('room_closed', handleRoomClosed);
    };
  }, [sessionId, router]);

  // ── SPA navigation: watch _pendingRedirect from game store ─────────────────────
  // Must use reactive selector so effect re-runs when _pendingRedirect changes
  const pendingRedirect = useGameStore((s) => s._pendingRedirect);

  useEffect(() => {
    if (!pendingRedirect || pendingRedirect === `/game/${sessionId}`) return;

    console.log('[GamePage] SPA redirect to:', pendingRedirect);
    router.push(pendingRedirect);
    useGameStore.setState({ _pendingRedirect: null });
  }, [pendingRedirect, sessionId, router]);

  // ── Authoritative state recovery via HTTP + socket join ───────────────────────
  // window.location.href causes a full page reload: old JS context destroyed, new
  // socket connects fresh. Socket events emitted before this effect runs are lost.
  // The HTTP call is the authoritative state source — it always reflects the
  // current game state regardless of socket timing.
  useEffect(() => {
    if (!sessionId || sessionId === 'undefined') return;

    // isHost detection: sessionStorage.setItem('hostSessionId', ...) is called in
    // waiting-screen.tsx ONLY when the user is the host who clicked "Start Game".
    // If we have a valid sessionId in storage, we are the host.
    const storedHostSessionId = sessionStorage.getItem('hostSessionId');
    const storedPlayerId = sessionStorage.getItem('playerId');
    const storedNickname = sessionStorage.getItem('playerNickname');
    const storedRoomId = sessionStorage.getItem('currentRoomId');
    const isHost = storedHostSessionId === sessionId;
    const isPlayer = !isHost && !!storedPlayerId && !!storedNickname;

    // Hoisted so both recoverState and joinSocketRoom can reference it.
    let httpData: any = null;

    const recoverState = async () => {
      try {
        const response = await apiClient.get(`/games/${sessionId}/state`);
        httpData = response.data;

        console.log('[GamePage] HTTP state recovered:', httpData);

        // Always reset game state for new session BEFORE applying HTTP state
        useGameStore.setState({
          hasAnswered: false,
          selectedAnswerId: null,
          currentQuestion: null,
          leaderboard: [],
          countdown: 0,
          correctAnswerId: null,
        });

        if (httpData.status === 'QUESTION_ACTIVE' && httpData.currentQuestion) {
          // Active question — recover immediately so UI renders without waiting for socket
          useGameStore.setState({
            gameStatus: GameState.QUESTION_ACTIVE,
            currentQuestion: httpData.currentQuestion,
            questionIndex: httpData.currentQuestionIndex,
            totalQuestions: httpData.totalQuestions,
            timeRemaining: httpData.remainingTime ?? httpData.currentQuestion.timeLimit,
            questionStartTime: Date.now(),
            leaderboard: httpData.leaderboard || [],
            // hasAnswered should remain false - player hasn't answered this question yet
          });
        } else if (httpData.status === 'QUESTION_RESULT') {
          useGameStore.setState({
            gameStatus: GameState.QUESTION_RESULT,
            leaderboard: httpData.leaderboard || [],
            questionIndex: httpData.currentQuestionIndex,
            totalQuestions: httpData.totalQuestions,
          });
        } else if (httpData.status === 'FINISHED') {
          useGameStore.setState({
            gameStatus: GameState.FINISHED,
            leaderboard: httpData.leaderboard || [],
            currentQuestion: null,
          });
        } else {
          useGameStore.setState({
            gameStatus: httpData.status || GameState.WAITING,
          });
        }

        if (isPlayer) {
          useGameStore.setState({
            sessionId,
            roomId: storedRoomId,
            isHost: false,
            myPlayerId: storedPlayerId,
            myNickname: storedNickname,
            // Force hasAnswered: false for player in new session
            hasAnswered: false,
            selectedAnswerId: null,
          });
        } else if (isHost) {
          const authStore = useAuthStore.getState();
          useGameStore.setState({
            sessionId,
            roomId: httpData.roomId || null,
            isHost: true,
            myPlayerId: 'host_' + authStore.user?.id,
            myNickname: authStore.user?.email?.split('@')[0] || 'Host',
          });
        }
      } catch (err: any) {
        console.error('[GamePage] HTTP state recovery failed:', err?.message);
        // On HTTP failure, still try to join the session
        useGameStore.setState({
          hasAnswered: false,
          selectedAnswerId: null,
          isHost: !!storedHostSessionId && storedHostSessionId === sessionId,
          myPlayerId: storedPlayerId,
          myNickname: storedNickname,
        });
      } finally {
        setIsJoining(false);
      }
    };

    // Join socket room for real-time events after HTTP recovery is done.
    // Even if HTTP fails, we still join the socket.
    const joinSocketRoom = () => {
      const gameStore = useGameStore.getState();
      const socket = gameStore.socket;
      if (!socket?.connected) return;

      if (isPlayer && storedPlayerId && storedNickname) {
        // Normal case: player joined via room flow with sessionStorage data
        socket.emit('join_game', { sessionId, playerId: storedPlayerId, nickname: storedNickname }, (response: any) => {
          if (response.success) {
            console.log('[GamePage] join_game confirmed (player)');
          }
        });
      } else if (isHost) {
        // Host: has sessionStorage hostSessionId matching sessionId
        const authStore = useAuthStore.getState();
        socket.emit('host_join_game', { sessionId, jwt: authStore.accessToken }, (response: any) => {
          if (response.success) {
            console.log('[GamePage] host_join_game confirmed, isActualHost:', response.isActualHost);
            useGameStore.setState({
              sessionId,
              roomId: httpData?.roomId || null,
              isHost: true,
              myPlayerId: 'host_' + authStore.user?.id,
              myNickname: authStore.user?.email?.split('@')[0] || 'Host',
            });
          }
        });
      } else {
        // Fallback: player without sessionStorage data (navigated directly or guest join)
        // Emit join_game with any available data so they can still participate
        const fallbackNickname = storedNickname || `Player_${Date.now() % 1000}`;
        socket.emit('join_game', { sessionId, playerId: storedPlayerId || null, nickname: fallbackNickname }, (response: any) => {
          if (response.success) {
            console.log('[GamePage] join_game confirmed (fallback player)');
            useGameStore.setState({
              sessionId,
              roomId: httpData?.roomId || storedRoomId,
              isHost: false,
              myPlayerId: response.playerId || storedPlayerId,
              myNickname: fallbackNickname,
            });
          }
        });
      }
    };

    const gameStore = useGameStore.getState();
    if (gameStore.socket?.connected) {
      recoverState().then(joinSocketRoom);
    } else {
      // Wait for socket connection, then recover state and join
      const interval = setInterval(() => {
        if (useGameStore.getState().socket?.connected) {
          clearInterval(interval);
          recoverState().then(joinSocketRoom);
        }
      }, 50);
    }
  }, [sessionId]);

  // ── Local countdown timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (gameStatus === GameState.QUESTION_ACTIVE && currentQuestion) {
      setLocalTimeRemaining(currentQuestion.timeLimit);
      const interval = setInterval(() => {
        setLocalTimeRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameStatus, currentQuestion]);

  const handleNextQuestion = () => {
    const gameStore = useGameStore.getState();
    if (!gameStore.socket || !sessionId) return;
    gameStore.socket.emit('host_next_question', { sessionId }, (response: any) => {
      if (!response.success) console.error('[GamePage] next_question error:', response.error);
    });
  };

  const handlePlayAgain = async () => {
    const { sessionId: sid, roomId: rid, playAgain } = useGameStore.getState();
    if (!sid || !rid) return;
    try {
      const newSessionId = await playAgain(sid, rid);
      if (newSessionId) {
        // Update sessionStorage for the new session
        sessionStorage.setItem('hostSessionId', newSessionId);
        router.push(`/game/${newSessionId}`);
      }
    } catch (error) {
      console.error('[GamePage] play_again error:', error);
    }
  };

  const handleLeaveRoom = () => {
    useGameStore.getState().reset();
    useRoomStore.getState().reset();
    router.push('/');
  };

  const handleEndGame = () => {
    const gameStore = useGameStore.getState();
    if (!gameStore.socket || !sessionId) return;
    gameStore.socket.emit('host_end_game', { sessionId }, (response: any) => {
      if (response.success) router.push('/quiz');
    });
  };

  const handleCloseRoom = () => {
    const gameStore = useGameStore.getState();
    const { roomId } = gameStore;
    if (!gameStore.socket || !sessionId || !roomId) return;
    gameStore.socket.emit('host_close_room', { sessionId, roomId }, (response: any) => {
      if (response.success) {
        toast.success('Da dong phong thanh cong');
        gameStore.reset();
        useRoomStore.getState().reset();
        router.push('/quiz');
      }
    });
  };

  const handleSubmitAnswer = (answerId: string) => {
    const { sessionId: sid, currentQuestion: q, hasAnswered: answered } = useGameStore.getState();
    if (!sid || !q || answered) return;
    useGameStore.setState({ hasAnswered: true, selectedAnswerId: answerId });
    const gameStore = useGameStore.getState();
    gameStore.socket?.emit('submit_answer', {
      sessionId: sid,
      playerId: gameStore.myPlayerId,
      questionId: q.id,
      answerId,
      clientTimestamp: Date.now(),
    }, (response: any) => {
      if (!response.success) {
        useGameStore.setState({ hasAnswered: false, selectedAnswerId: null });
      }
    });
  };

  const getAnswerButtonColor = (answerId: string, index: number) => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500'];
    if (gameStatus === GameState.QUESTION_RESULT) {
      if (answerId === correctAnswerId) return 'bg-green-600 ring-4 ring-green-300';
      if (answerId === selectedAnswerId && answerId !== correctAnswerId) return 'bg-red-500';
    }
    if (selectedAnswerId === answerId) return colors[index % 4] + ' ring-4 ring-white/50';
    return colors[index % 4];
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!sessionId || sessionId === 'undefined') {
    return (
      <div className="min-h-screen bg-[#F4EDE0] flex items-center justify-center">
        <Card className="w-full max-w-md bg-white rounded-2xl shadow-[6px_6px_0_#1DAD97] border-2 border-[#DC2626]/30">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl text-[#111827]" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              Session khong hop le
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button
              onClick={() => router.push('/')}
              className="bg-[#1DAD97] hover:bg-[#1a9a87] text-white rounded-xl shadow-[3px_3px_0_#111827]/20 px-8 py-6 border-2 border-[#1DAD97]"
              style={{ fontFamily: 'Delicious Handrawn, cursive' }}
            >
              Quay ve trang chu
            </Button>
          </CardContent>
        </Card>

        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Delicious+Handrawn&display=swap');
        `}</style>
      </div>
    );
  }
  // Maintenance Overlay
  if (isMaintenance) {
    return <MaintenanceOverlay message={maintenanceMessage} />;
  }

  // Hard Freeze Overlay
  if (isFrozen) {
    return <FreezeOverlay message={freezeMessage} />;
  }
  if (isJoining) {
    return (
      <div className="min-h-screen bg-[#F4EDE0] flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white rounded-2xl shadow-[6px_6px_0_#1DAD97] border-2 border-[#1DAD97]/30">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl text-[#111827]" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              Dang ket noi...
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-2">
            <div className="w-8 h-8 border-4 border-[#1DAD97] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#111827]/60 text-sm" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              Dang tham gia game
            </p>
          </CardContent>
        </Card>

        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Delicious+Handrawn&display=swap');
        `}</style>
      </div>
    );
  }

  // Countdown overlay
  if (gameStatus === GameState.STARTING) {
    return (
      <div className="min-h-screen bg-[#F4EDE0] flex items-center justify-center overflow-hidden">
        <div className="text-center">
          <p className="text-lg text-[#111827]/60 mb-8" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
            Game sap bat dau
          </p>

          <div className="relative inline-block">
            <span
              className="text-[180px] md:text-[240px] text-[#1DAD97] leading-none"
              style={{ fontFamily: 'Delicious Handrawn, cursive', fontWeight: 400 }}
            >
              {countdown}
            </span>
          </div>

          <p className="text-2xl text-[#111827]/70 mt-8" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
            Chuan bi cau hoi
          </p>
        </div>

        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Delicious+Handrawn&display=swap');
        `}</style>
      </div>
    );
  }

  // Waiting
  if (gameStatus === GameState.WAITING) {
    return (
      <div className="min-h-screen bg-[#F4EDE0] flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white rounded-3xl shadow-[6px_6px_0_#1DAD97] border-2 border-[#1DAD97]/30">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl text-[#111827]" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              Dang cho game bat dau
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-2">
            <div className="w-8 h-8 border-4 border-[#1DAD97] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#111827]/60 text-sm" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              {isHost ? 'Doi nguoi choi tham gia' : 'Cho host bat dau game'}
            </p>
          </CardContent>
        </Card>

        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Delicious+Handrawn&display=swap');
        `}</style>
      </div>
    );
  }

  // Question active
  if (gameStatus === GameState.QUESTION_ACTIVE && currentQuestion) {
    return (
      <div className="min-h-screen bg-[#F4EDE0] p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 bg-white rounded-2xl p-4 shadow-[3px_3px_0_#1DAD97] border-2 border-[#1DAD97]/30">
            <div className="text-[#111827] text-xl" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              Cau {questionIndex + 1}/{totalQuestions}
            </div>
            <div className={`px-4 py-2 rounded-full text-lg ${localTimeRemaining <= 5 ? 'bg-[#DC2626] text-white' : 'bg-[#1DAD97] text-white'}`} style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              {localTimeRemaining}s
            </div>
          </div>

          {/* Question card */}
          <Card className="mb-6 bg-white rounded-2xl shadow-[4px_4px_0_#1DAD97] border-2 border-[#1DAD97]/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl text-center text-[#111827] leading-relaxed" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
                {currentQuestion.content}
              </CardTitle>
            </CardHeader>
          </Card>

          {/* Answer buttons */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {currentQuestion.answers.map((answer, index) => {
              const colors = ['bg-[#1DAD97]', 'bg-[#F59E0B]', 'bg-[#8B5CF6]', 'bg-[#EC4899]'];
              return (
                <button
                  key={answer.id}
                  onClick={() => !isHost && handleSubmitAnswer(answer.id)}
                  disabled={hasAnswered || isHost}
                  className={`
                    ${colors[index % 4]}
                    text-white text-xl py-8 px-6 rounded-2xl
                    transition-all duration-200 shadow-[3px_3px_0_#111827]/20
                    ${!isHost && !hasAnswered ? 'hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0_#111827]/20 cursor-pointer active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#111827]/20' : ''}
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                  style={{ fontFamily: 'Delicious Handrawn, cursive' }}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg">
                      {index === 0 ? 'A' : index === 1 ? 'B' : index === 2 ? 'C' : 'D'}
                    </span>
                    <span className="text-left flex-1">{answer.content}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Status message */}
          {isHost ? (
            <div className="text-center text-[#111827]/60 text-lg bg-white rounded-xl p-4 shadow-[2px_2px_0_#1DAD97] border border-[#1DAD97]/30">
              Host dang theo doi cau hoi
            </div>
          ) : hasAnswered ? (
            <div className="text-center text-[#16A34A] text-lg bg-[#16A34A]/10 rounded-xl p-4 border-2 border-[#16A34A]/30" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              Da gui dap an! Cho ket qua...
            </div>
          ) : (
            <div className="text-center text-[#111827]/60 text-lg" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              Chon dap an cua ban
            </div>
          )}

          {/* Score display */}
          <div className="mt-6 text-center bg-white rounded-xl p-4 shadow-[2px_2px_0_#1DAD97] border border-[#1DAD97]/30" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
            <span className="text-[#111827]/60">Diem cua ban: </span>
            <span className="text-[#1DAD97]">{myScore} pts</span>
            <span className="text-[#111827]/40 mx-2">|</span>
            <span className="text-[#111827]/60">Xep hang: </span>
            <span>#{myRank || '-'}</span>
          </div>
        </div>

        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Delicious+Handrawn&display=swap');
        `}</style>
      </div>
    );
  }

  // Question result
  if (gameStatus === GameState.QUESTION_RESULT) {
    return (
      <div className="min-h-screen bg-[#F4EDE0] p-4">
        <div className="max-w-4xl mx-auto">
          {/* Result header */}
          <div className="text-center mb-6">
            <h2 className="text-3xl text-[#111827] mb-2" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Ket qua</h2>
            {selectedAnswerId === correctAnswerId
              ? <p className="text-[#16A34A] text-xl" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Chinh xac!</p>
              : selectedAnswerId
                ? <p className="text-[#DC2626] text-xl" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Chua dung!</p>
                : <p className="text-[#D97706] text-xl" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Het gio!</p>}
          </div>

          {/* Question card */}
          <Card className="mb-6 bg-white rounded-2xl shadow-[4px_4px_0_#1DAD97] border-2 border-[#1DAD97]/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-center text-[#111827]" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>{currentQuestion?.content}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {currentQuestion?.answers.map((answer, index) => {
                  const isCorrect = answer.id === correctAnswerId;
                  const isSelected = answer.id === selectedAnswerId;
                  return (
                    <div key={answer.id} className={`
                      p-4 rounded-xl flex items-center gap-3
                      ${isCorrect ? 'bg-[#16A34A] text-white shadow-[2px_2px_0_#111827]/20' : isSelected ? 'bg-[#DC2626] text-white shadow-[2px_2px_0_#111827]/20' : 'bg-[#111827]/10 text-[#111827] border border-[#111827]/10'}
                    `} style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
                      <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm">
                        {index === 0 ? 'A' : index === 1 ? 'B' : index === 2 ? 'C' : 'D'}
                      </span>
                      <span className="flex-1">{answer.content}</span>
                      {isCorrect && <span className="text-green-200">Correct</span>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Player: chỉ thấy điểm cá nhân */}
          {!isHost && (
            <Card className="mb-6 bg-white rounded-2xl shadow-[4px_4px_0_#1DAD97] border-2 border-[#1DAD97]/30">
              <CardContent className="pt-6 text-center">
                <div className="text-[#111827]/60 text-sm mb-2" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Diem cua ban</div>
                <div className="text-5xl text-[#1DAD97] mb-1" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>{myScore} pts</div>
                <div className="text-[#111827]/70" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Xep hang: <span className="text-[#111827]">#{myRank || '-'}</span></div>
              </CardContent>
            </Card>
          )}

          {/* Host: thấy đầy đủ leaderboard */}
          {isHost && (
            <Card className="mb-6 bg-white rounded-2xl shadow-[4px_4px_0_#1DAD97] border-2 border-[#1DAD97]/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-center text-[#111827]" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Bang xep hang</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaderboard.slice(0, 5).map((entry, idx) => (
                    <div key={entry.playerId} className={`
                      flex justify-between items-center p-4 rounded-xl
                      ${entry.rank === 1 ? 'bg-[#F59E0B] text-white shadow-[2px_2px_0_#111827]/20' : 'bg-[#111827]/5 text-[#111827] border border-[#111827]/10'}
                    `} style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold">
                          {idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${entry.rank}th`}
                        </span>
                        <span>{entry.nickname}</span>
                      </div>
                      <span className="text-lg">{entry.score} pts</span>
                    </div>
                  ))}
                  {leaderboard.length === 0 && (
                    <p className="text-center text-[#111827]/50">Chua co du lieu</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="text-center text-[#111827]/50 text-sm mb-4" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
            {isHost ? `Diem cua ban (Host): ${myScore} pts` : `Diem cua ban: ${myScore} pts`}
          </div>

          {isHost && (
            <Button
              onClick={handleNextQuestion}
              size="lg"
              className="w-full bg-[#1DAD97] hover:bg-[#1a9a87] text-white rounded-xl shadow-[3px_3px_0_#111827]/20 text-lg py-6 border-2 border-[#1DAD97]"
              style={{ fontFamily: 'Delicious Handrawn, cursive' }}
            >
              Tiep tuc
            </Button>
          )}
        </div>

        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Delicious+Handrawn&display=swap');
        `}</style>
      </div>
    );
  }

  // Game finished
  if (gameStatus === GameState.FINISHED) {
    return (
      <div className="min-h-screen bg-[#F4EDE0] p-4">
        <div className="max-w-4xl mx-auto">
          {/* Game Over header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl text-[#111827] mb-2" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Game Over!</h1>
            <p className="text-xl text-[#111827]/70" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Ket qua cuoi cung</p>
          </div>

          {/* Player: chỉ thấy điểm cá nhân */}
          {!isHost && (
            <Card className="mb-6 bg-white rounded-2xl shadow-[4px_4px_0_#1DAD97] border-2 border-[#1DAD97]/30">
              <CardContent className="pt-6 text-center">
                <div className="text-[#111827]/60 text-sm mb-2" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Ket qua cua ban</div>
                <div className="text-5xl text-[#1DAD97] mb-1" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>{myScore} pts</div>
                <div className="text-[#111827]/70" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Xep hang: <span className="text-[#111827]">#{myRank || '-'}</span></div>
              </CardContent>
            </Card>
          )}

          {/* Host: thấy đầy đủ leaderboard */}
          {isHost && (
            <Card className="mb-6 bg-white rounded-2xl shadow-[4px_4px_0_#1DAD97] border-2 border-[#1DAD97]/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-center text-2xl text-[#111827]" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>Bang xep hang</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaderboard.map((entry, idx) => (
                    <div key={entry.playerId} className={`
                      flex justify-between items-center p-4 rounded-xl text-lg
                      ${idx === 0 ? 'bg-[#F59E0B] text-white shadow-[3px_3px_0_#111827]/20' : idx === 1 ? 'bg-[#9CA3AF] text-white shadow-[2px_2px_0_#111827]/20' : idx === 2 ? 'bg-[#CD7F32] text-white shadow-[2px_2px_0_#111827]/20' : 'bg-[#111827]/5 text-[#111827] border border-[#111827]/10'}
                    `} style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
                      <div className="flex items-center gap-3">
                        <span className="text-lg">
                          {idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${entry.rank}th`}
                        </span>
                        <span>{entry.nickname}</span>
                      </div>
                      <span className="text-lg">{entry.score} pts</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          {isHost ? (
            <div className="flex gap-4">
              <Button
                onClick={handlePlayAgain}
                className="flex-1 text-lg bg-[#1DAD97] hover:bg-[#1a9a87] text-white rounded-xl shadow-[3px_3px_0_#111827]/20 py-6 border-2 border-[#1DAD97]"
                style={{ fontFamily: 'Delicious Handrawn, cursive' }}
              >
                Choi lai
              </Button>
              <Button
                onClick={handleCloseRoom}
                variant="outline"
                className="flex-1 text-lg bg-white rounded-xl shadow-[3px_3px_0_#1DAD97] py-6 border-2 border-[#1DAD97]/50 text-[#111827]"
                style={{ fontFamily: 'Delicious Handrawn, cursive' }}
              >
                Ve Quiz
              </Button>
            </div>
          ) : (
            <div className="flex gap-4">
              <Button
                onClick={handleLeaveRoom}
                variant="outline"
                className="flex-1 text-lg bg-white rounded-xl shadow-[3px_3px_0_#1DAD97] py-6 border-2 border-[#1DAD97]/50 text-[#111827]"
                style={{ fontFamily: 'Delicious Handrawn, cursive' }}
              >
                Roi phong
              </Button>
              <Button
                onClick={() => router.push('/')}
                className="flex-1 text-lg bg-[#1DAD97] hover:bg-[#1a9a87] text-white rounded-xl shadow-[3px_3px_0_#111827]/20 py-6 border-2 border-[#1DAD97]"
                style={{ fontFamily: 'Delicious Handrawn, cursive' }}
              >
                Ve Trang chu
              </Button>
            </div>
          )}
        </div>

        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Delicious+Handrawn&display=swap');
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4EDE0] flex items-center justify-center">
      <div className="text-[#111827]/50">Đang tải...</div>
    </div>
  );
}