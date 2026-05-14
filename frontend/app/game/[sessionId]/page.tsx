'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useGameStore } from '@/stores/game.store';
import { useRoomStore } from '@/stores/room.store';
import { useAuthStore } from '@/stores/auth.store';
import { GameState } from '@/types/game.type';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/apiClient';
import { getSocket, connectSocketWithAuth, registerStoreUpdater } from '@/lib/socket';
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
    timeRemaining,
    connectSocket,
    reset,
  } = useGameStore();

  const [localTimeRemaining, setLocalTimeRemaining] = useState(0);
  const [isJoining, setIsJoining] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  // Track nếu đã recover state từ HTTP API (sau reload)
  const [hasRecoveredFromHttp, setHasRecoveredFromHttp] = useState(false);

  // Track if recovery has been initiated to prevent double execution
  // (effect may run twice due to React StrictMode or re-renders)
  const hasRecoveredRef = useRef(false);

  // ── Wait for auth hydration before any game logic ────────────────────────────
  // This effect runs ONCE when auth hydrates, ensuring auth token is available
  useEffect(() => {
    const checkAuth = () => {
      const authStore = useAuthStore.getState();
      if (authStore.isHydrated) {
        setAuthReady(true);
        console.log('[GamePage] Auth hydrated, accessToken available:', !!authStore.accessToken);
      }
    };

    // Check immediately
    checkAuth();

    // Also subscribe to auth changes
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (state.isHydrated) {
        setAuthReady(true);
      }
    });

    return unsubscribe;
  }, []);

  // ── Setup socket + listeners ONCE (never cleanup on unmount) ─────────────────
  // reset() is intentionally NOT called here — the socket must survive navigation
  useEffect(() => {
    if (!sessionId || sessionId === 'undefined') {
      router.push('/');
      return;
    }

    // Register store updater
    registerStoreUpdater((updater) => {
      useGameStore.setState(updater);
    });

    const socket = getSocket();
    useGameStore.setState({ socket });

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
      const state = useGameStore.getState();

      // Skip if we're in the middle of HTTP state recovery
      // The HTTP state is authoritative during recovery
      if (state._isRecovering) {
        console.log('[GamePage] Skipping question_start due to HTTP recovery in progress');
        return;
      }

      // Check if this is a NEW question or the SAME question (after reload/reconnect)
      // Only reset hasAnswered/selectedAnswerId for truly NEW questions
      // correctAnswerId is SERVER DATA and should NEVER be reset here
      // It will be set by question_result event
      const isNewQuestion = state.currentQuestion?.id !== data.question.id;
      const shouldResetAnswer = isNewQuestion || state.gameStatus !== GameState.QUESTION_ACTIVE;

      console.log('[GamePage] question_start: isNewQuestion=', isNewQuestion, 'shouldResetAnswer=', shouldResetAnswer, 'prev gameStatus=', state.gameStatus);

      // For timing: only use server timeRemaining if it's provided and valid
      // Otherwise use question.timeLimit as the full duration
      // NEVER use server's remainingTime as-is because it doesn't account for
      // how long the player has been on the page after reload
      let newTimeRemaining = data.question.timeLimit;
      if (data.timeRemaining !== undefined && data.timeRemaining !== null) {
        // Only use server's remainingTime for truly NEW questions (not after reload)
        if (shouldResetAnswer) {
          newTimeRemaining = data.timeRemaining;
        }
        // If same question (reload), keep the timeRemaining from HTTP recovery
      }

      useGameStore.setState({
        gameStatus: GameState.QUESTION_ACTIVE,
        currentQuestion: data.question,
        questionIndex: data.questionIndex,
        totalQuestions: data.totalQuestions,
        countdown: 0,
        // Only reset player's answer state if it's a genuinely NEW question
        // If recovering state after reload, preserve hasAnswered and selectedAnswerId
        hasAnswered: shouldResetAnswer ? false : state.hasAnswered,
        selectedAnswerId: shouldResetAnswer ? null : state.selectedAnswerId,
        // CORRECT: correctAnswerId is NEVER reset here - question_result sets it
        // This fixes the bug where correct answer would flash and disappear
        // timeRemaining will be updated below
      });
      
      // Update timer separately to preserve correctAnswerId
      useGameStore.setState({
        timeRemaining: newTimeRemaining,
        questionStartTime: Date.now(),
      });
    };

    const handleQuestionResult = (data: any) => {
      console.log('[GamePage] question_result:', data);
      const state = useGameStore.getState();

      // question_result should ALWAYS be processed - it updates game status from QUESTION_ACTIVE to QUESTION_RESULT
      // This is critical for the game flow to progress correctly

      // Update leaderboard and correct answer
      useGameStore.setState({
        gameStatus: GameState.QUESTION_RESULT,
        leaderboard: data.leaderboard || [],
        correctAnswerId: data.correctAnswer?.id || null,
      });

      // Update my score from leaderboard - ONLY if player already answered this question
      // If player hasn't answered yet (reloaded before submitting), don't show score
      // This prevents "score jump" from previous questions
      console.log('[GamePage] question_result: myPlayerId=', state.myPlayerId, 'hasAnswered=', state.hasAnswered);
      console.log('[GamePage] question_result: leaderboard playerIds=', data.leaderboard?.map((e: any) => e.playerId));
      if (state.myPlayerId && data.leaderboard) {
        const myEntry = data.leaderboard.find((e: any) => e.playerId === state.myPlayerId);
        console.log('[GamePage] question_result: myEntry=', myEntry);
        if (myEntry) {
          // Only update score if player has answered this question
          // If hasn't answered, keep the score from HTTP recovery (previous question's score)
          const newScore = state.hasAnswered ? myEntry.score : state.myScore;
          const newRank = state.hasAnswered ? myEntry.rank : state.myRank;
          console.log('[GamePage] question_result: updating score from', state.myScore, 'to', newScore, 'hasAnswered=', state.hasAnswered);
          useGameStore.setState({
            myScore: newScore,
            myRank: newRank,
          });
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

    const handleHostDisconnected = (data: { sessionId: string; gracePeriod: number }) => {
      console.log('[GamePage] host_disconnected:', data);
      toast.warning('Host đang mất kết nối. Đang chờ reconnect...', {
        duration: data.gracePeriod,
      });
    };

    const handleHostReconnected = () => {
      console.log('[GamePage] host_reconnected');
      toast.success('Host đã kết nối lại!');
    };

    const handleSessionClosed = (data: { sessionId: string; reason: 'HOST_EXITED' | 'GAME_FINISHED' | 'HOST_DISCONNECTED' }) => {
      console.log('[GamePage] session_closed:', data);
      const storedHostSessionId = sessionStorage.getItem('hostSessionId');
      const isHostSession = storedHostSessionId === data.sessionId;

      // Clear session-related storage
      sessionStorage.removeItem('hostSessionId');
      sessionStorage.removeItem('hostUserId');
      sessionStorage.removeItem('playerId');
      sessionStorage.removeItem('playerNickname');
      sessionStorage.removeItem('currentRoomId');

      // Reset stores
      useGameStore.getState().reset();
      useRoomStore.getState().reset();

      // Redirect based on reason and role
      if (data.reason === 'GAME_FINISHED') {
        if (isHostSession) {
          toast.info('Game đã kết thúc!');
          router.push('/quiz');
        } else {
          toast.info('Game đã kết thúc!');
          router.push('/');
        }
      } else if (data.reason === 'HOST_EXITED') {
        if (isHostSession) {
          router.push('/quiz');
        } else {
          toast.warning('Host đã rời phòng');
          router.push('/');
        }
      } else if (data.reason === 'HOST_DISCONNECTED') {
        if (isHostSession) {
          router.push('/quiz');
        } else {
          toast.error('Mất kết nối với host. Phiên chơi đã kết thúc.');
          router.push('/');
        }
      }
    };

    const handleScoreUpdate = (data: any) => {
      const state = useGameStore.getState();

      console.log('[GamePage] score_update received:', {
        myPlayerId: state.myPlayerId,
        gameStatus: state.gameStatus,
        hasAnswered: state.hasAnswered,
        currentQuestionId: state.currentQuestion?.id,
      });

      // Skip if we're in the middle of HTTP state recovery
      if (state._isRecovering) {
        console.log('[GamePage] Skipping score_update due to HTTP recovery in progress');
        return;
      }

      // CRITICAL: Never update myScore during QUESTION_ACTIVE
      // Players should NOT see score changes while answering - this is anti-cheating
      // Only show score after question ends (QUESTION_RESULT) or game ends (FINISHED)
      if (state.gameStatus === GameState.QUESTION_ACTIVE) {
        console.log('[GamePage] Skipping score_update during QUESTION_ACTIVE to prevent cheating');
        return;
      }

      // If player hasn't answered this question yet, don't show any score
      // (this handles cases where leaderboard has scores from previous questions)
      if (!state.hasAnswered) {
        console.log('[GamePage] Skipping score_update: player has not answered this question');
        return;
      }

      if (data.leaderboard) {
        useGameStore.setState({ leaderboard: data.leaderboard });
        if (state.myPlayerId) {
          const myEntry = data.leaderboard.find(
            (e: any) => e.playerId === state.myPlayerId
          );
          if (myEntry) {
            console.log('[GamePage] Updating myScore:', myEntry.score, 'rank:', myEntry.rank);
            useGameStore.setState({ myScore: myEntry.score, myRank: myEntry.rank });
          } else {
            console.log('[GamePage] myPlayerId not found in leaderboard');
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
    socket.on('host_disconnected', handleHostDisconnected);
    socket.on('host_reconnected', handleHostReconnected);
    socket.on('session_closed', handleSessionClosed);

    return () => {
      socket.off('game_starting', handleGameStarting);
      socket.off('countdown_tick', handleCountdownTick);
      socket.off('question_start', handleQuestionStart);
      socket.off('question_result', handleQuestionResult);
      socket.off('game_ended', handleGameEnded);
      socket.off('score_update', handleScoreUpdate);
      socket.off('game_redirect', handleGameRedirect);
      socket.off('room_closed', handleRoomClosed);
      socket.off('host_disconnected', handleHostDisconnected);
      socket.off('host_reconnected', handleHostReconnected);
      socket.off('session_closed', handleSessionClosed);
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
  // CRITICAL: This effect waits for auth hydration before running.
  // This prevents race conditions where game join happens before auth is ready.
  // 
  // Correct flow:
  // 1. Auth hydrates (token available)
  // 2. Connect socket with auth token
  // 3. Wait for socket connection
  // 4. Emit host_join_game or join_game
  // 5. Server verifies JWT and sets identity
  // 6. UI renders correctly
  useEffect(() => {
    if (!sessionId || sessionId === 'undefined') return;

    // Wait for auth to hydrate
    if (!authReady) {
      console.log('[GamePage] Waiting for auth to hydrate...');
      return;
    }

    // Prevent double execution
    if (hasRecoveredRef.current) {
      console.log('[GamePage] Skipping double recovery');
      return;
    }
    hasRecoveredRef.current = true;

    // Get auth state
    const authStore = useAuthStore.getState();
    const accessToken = authStore.accessToken;
    console.log('[GamePage] Auth ready, token available:', !!accessToken);

    // Session storage for host/player detection
    const storedHostSessionId = sessionStorage.getItem('hostSessionId');
    const storedPlayerId = sessionStorage.getItem('playerId');
    const storedNickname = sessionStorage.getItem('playerNickname');
    const storedRoomId = sessionStorage.getItem('currentRoomId');
    
    // Determine role AFTER auth is ready
    const isHostFromStorage = storedHostSessionId === sessionId;
    const isPlayer = !isHostFromStorage && !!storedPlayerId && !!storedNickname;
    console.log('[GamePage] Role: isHostFromStorage=', isHostFromStorage, 'isPlayer=', isPlayer);

    let httpData: any = null;

    const recoverState = async () => {
      useGameStore.setState({ _isRecovering: true });

      try {
        const response = await apiClient.get(`/games/${sessionId}/state`);
        httpData = response.data;
        console.log('[GamePage] HTTP state recovered:', httpData);

        useGameStore.setState({
          currentQuestion: null,
          leaderboard: [],
          countdown: 0,
          correctAnswerId: null,
        });

        let playerHasAnswered = false;

        if (httpData.status === 'QUESTION_ACTIVE' && httpData.currentQuestion) {
          let adjustedRemainingTime: number;
          if (httpData.questionStartedAt && httpData.serverTime) {
            const elapsedSeconds = (httpData.serverTime - httpData.questionStartedAt) / 1000;
            const networkLatencySec = Math.max(0, (Date.now() - httpData.serverTime) / 1000);
            adjustedRemainingTime = Math.max(0, Math.ceil((httpData.currentQuestion.timeLimit || 15) - elapsedSeconds - networkLatencySec));
          } else {
            adjustedRemainingTime = Math.max(0, (httpData.remainingTime || httpData.currentQuestion.timeLimit || 15) - 1);
          }

          useGameStore.setState({
            gameStatus: GameState.QUESTION_ACTIVE,
            currentQuestion: httpData.currentQuestion,
            questionIndex: httpData.currentQuestionIndex,
            totalQuestions: httpData.totalQuestions,
            timeRemaining: adjustedRemainingTime,
            questionStartTime: Date.now(),
            leaderboard: [],
          });
        } else if (httpData.status === 'QUESTION_RESULT') {
          useGameStore.setState({
            gameStatus: GameState.QUESTION_RESULT,
            currentQuestion: httpData.currentQuestion || null,
            correctAnswerId: httpData.correctAnswerId || null,
            leaderboard: httpData.leaderboard || [],
            questionIndex: httpData.currentQuestionIndex,
            totalQuestions: httpData.totalQuestions,
            hasAnswered: httpData.hasAnswered ?? false,
            selectedAnswerId: httpData.selectedAnswerId || null,
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
          });

          if (httpData.status === 'QUESTION_ACTIVE' && httpData.currentQuestion) {
            try {
              const answeredRes = await apiClient.get(`/games/${sessionId}/answered-questions?playerId=${storedPlayerId}`);
              const answeredQuestions: string[] = answeredRes.data.answeredQuestions || [];
              if (answeredQuestions.includes(httpData.currentQuestion?.id)) {
                playerHasAnswered = true;
              }
            } catch {}
          }

          const myEntry = httpData.leaderboard?.find((e: any) => e.playerId === storedPlayerId);
          const showScore = httpData.status === 'QUESTION_RESULT' || httpData.status === 'FINISHED';
          useGameStore.setState({
            hasAnswered: playerHasAnswered,
            selectedAnswerId: null,
            myScore: myEntry?.score ?? 0,
            myRank: myEntry?.rank ?? null,
          });
        } else if (isHostFromStorage) {
          useGameStore.setState({
            sessionId,
            roomId: httpData.roomId || null,
            isHost: true,
            myPlayerId: `host_${authStore.user?.id || 'unknown'}`,
            myNickname: authStore.user?.email?.split('@')[0] || 'Host',
          });
        }
      } catch (err: any) {
        console.error('[GamePage] HTTP state recovery failed:', err?.message);
        useGameStore.setState({
          hasAnswered: false,
          selectedAnswerId: null,
          isHost: !!storedHostSessionId && storedHostSessionId === sessionId,
          myPlayerId: storedPlayerId,
          myNickname: storedNickname,
          _isRecovering: false,
        });
      } finally {
        setIsJoining(false);
      }
    };

    const joinSocketRoom = () => {
      const socket = useGameStore.getState().socket;
      if (!socket) {
        console.error('[GamePage] Socket not available');
        return;
      }

      if (isHostFromStorage && accessToken) {
        // HOST: Join with JWT - server will verify
        console.log('[GamePage] Joining as HOST with JWT');
        socket.emit('host_join_game', { sessionId, jwt: accessToken }, (response: any) => {
          if (response.success && response.state) {
            console.log('[GamePage] host_join_game success, isActualHost:', response.isActualHost);
            
            // Trust server's verification
            const actualIsHost = response.isActualHost;
            // Only set correctAnswerId if in QUESTION_RESULT state
            const correctAnswerId = response.state.status === 'QUESTION_RESULT' 
              ? (response.state.correctAnswerId || httpData?.correctAnswerId || null)
              : null;
            
            useGameStore.setState({
              sessionId,
              roomId: response.state.roomId || httpData?.roomId || null,
              isHost: actualIsHost,
              myPlayerId: actualIsHost ? `host_${authStore.user?.id || 'unknown'}` : (response.state.myPlayerId || storedPlayerId || null),
              myNickname: actualIsHost 
                ? (authStore.user?.email?.split('@')[0] || 'Host')
                : (response.state.nickname || storedNickname || authStore.user?.email?.split('@')[0] || `Player`),
              gameStatus: response.state.status || GameState.WAITING,
              currentQuestion: response.state.currentQuestion || httpData?.currentQuestion || null,
              questionIndex: response.state.questionIndex ?? 0,
              totalQuestions: response.state.totalQuestions ?? 0,
              leaderboard: response.state.leaderboard || httpData?.leaderboard || [],
              timeRemaining: response.state.remainingTime ?? response.state.currentQuestion?.timeLimit ?? 0,
              correctAnswerId, // Set from server if in QUESTION_RESULT
              _isRecovering: false,
            });
            if (!actualIsHost) {
              console.warn('[GamePage] Server rejected host identity - user is NOT the host');
            }
          } else {
            console.error('[GamePage] host_join_game failed:', response.error);
            // Fallback to player mode
            const fallbackNickname = storedNickname || authStore.user?.email?.split('@')[0] || `Player_${Date.now() % 1000}`;
            socket.emit('join_game', { sessionId, playerId: storedPlayerId || null, nickname: fallbackNickname }, (playerResponse: any) => {
              if (playerResponse.success && playerResponse.state) {
                useGameStore.setState({
                  sessionId,
                  roomId: playerResponse.state.roomId || httpData?.roomId || storedRoomId,
                  isHost: false,
                  myPlayerId: playerResponse.state.myPlayerId || storedPlayerId,
                  myNickname: fallbackNickname,
                  gameStatus: playerResponse.state.status || GameState.WAITING,
                  currentQuestion: playerResponse.state.currentQuestion || httpData?.currentQuestion || null,
                  questionIndex: playerResponse.state.questionIndex ?? 0,
                  totalQuestions: playerResponse.state.totalQuestions ?? 0,
                  leaderboard: playerResponse.state.leaderboard || httpData?.leaderboard || [],
                  timeRemaining: playerResponse.state.remainingTime ?? playerResponse.state.currentQuestion?.timeLimit ?? 0,
                  _isRecovering: false,
                });
              } else {
                useGameStore.setState({ _isRecovering: false });
              }
            });
          }
        });
      } else if (isPlayer && storedPlayerId && storedNickname) {
        // PLAYER: Normal join
        console.log('[GamePage] Joining as PLAYER');
        socket.emit('join_game', { sessionId, playerId: storedPlayerId, nickname: storedNickname }, (response: any) => {
          if (response.success && response.state) {
            console.log('[GamePage] join_game success');
            const myEntry = response.state.leaderboard?.find((e: any) => e.playerId === storedPlayerId);
            const showLeaderboard = response.state.status !== GameState.QUESTION_ACTIVE;
            // Only set correctAnswerId if in QUESTION_RESULT state
            const correctAnswerId = response.state.status === 'QUESTION_RESULT'
              ? (response.state.correctAnswerId || httpData?.correctAnswerId || null)
              : null;
            
            useGameStore.setState({
              sessionId,
              roomId: response.state.roomId || storedRoomId,
              isHost: false,
              myPlayerId: storedPlayerId,
              myNickname: storedNickname,
              gameStatus: response.state.status || GameState.WAITING,
              currentQuestion: response.state.currentQuestion || httpData?.currentQuestion || null,
              questionIndex: response.state.questionIndex ?? 0,
              totalQuestions: response.state.totalQuestions ?? 0,
              leaderboard: showLeaderboard ? (response.state.leaderboard || httpData?.leaderboard || []) : useGameStore.getState().leaderboard,
              timeRemaining: response.state.remainingTime ?? response.state.currentQuestion?.timeLimit ?? 0,
              correctAnswerId, // Set from server if in QUESTION_RESULT
              myScore: myEntry?.score ?? useGameStore.getState().myScore ?? 0,
              myRank: myEntry?.rank ?? useGameStore.getState().myRank ?? null,
              _isRecovering: false,
            });
          } else {
            useGameStore.setState({ _isRecovering: false });
          }
        });
      } else {
        // No stored credentials - use HTTP state
        console.log('[GamePage] No stored credentials, using HTTP state only');
        useGameStore.setState({ _isRecovering: false });
      }
    };

    // Main flow: connect socket with auth, then recover state, then join room
    const initGame = async () => {
      const socket = getSocket();
      
      // Connect socket with auth token if not connected
      if (!socket.connected) {
        console.log('[GamePage] Connecting socket with auth token...');
        if (accessToken) {
          connectSocketWithAuth(accessToken);
        } else {
          socket.connect();
        }
        
        // Wait for connection
        await new Promise<void>((resolve) => {
          if (socket.connected) {
            resolve();
          } else {
            socket.once('connect', () => resolve());
          }
        });
        console.log('[GamePage] Socket connected:', socket.id);
      }

      // Recover HTTP state
      await recoverState();
      
      // Join socket room
      joinSocketRoom();
    };

    initGame().catch((err) => {
      console.error('[GamePage] initGame error:', err);
      setIsJoining(false);
      useGameStore.setState({ _isRecovering: false });
    });

  }, [sessionId, authReady]);

  // ── Local countdown timer ────────────────────────────────────────────────────
  // Uses timeRemaining from store if available (after reload recovery),
  // otherwise starts from currentQuestion.timeLimit
  useEffect(() => {
    if (gameStatus === GameState.QUESTION_ACTIVE && currentQuestion) {
      const startTime = timeRemaining > 0 ? timeRemaining : currentQuestion.timeLimit;
      setLocalTimeRemaining(startTime);
      const interval = setInterval(() => {
        setLocalTimeRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameStatus, currentQuestion, timeRemaining]);

  const handleNextQuestion = () => {
    const gameStore = useGameStore.getState();
    if (!gameStore.socket || !sessionId) return;
    
    // Double-check: only hosts can advance questions
    if (!gameStore.isHost) {
      console.warn('[GamePage] handleNextQuestion called by non-host, ignoring');
      return;
    }
    
    gameStore.socket.emit('host_next_question', { sessionId }, (response: any) => {
      if (!response.success) {
        console.error('[GamePage] next_question error:', response.error);
        // If game already ended, update status
        if (response.error === 'Game already finished') {
          useGameStore.setState({ gameStatus: GameState.FINISHED });
        }
        // If not the host, hide the button by updating state
        if (response.error === 'Only host can advance question') {
          useGameStore.setState({ isHost: false });
        }
      }
      // If game ended via this action, backend will emit game_ended event
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

          {/* Score display - CHỈ hiển thị khi KHÔNG phải đang trả lời (QUESTION_ACTIVE) */}
          {gameStatus !== GameState.QUESTION_ACTIVE && (
            <div className="mt-6 text-center bg-white rounded-xl p-4 shadow-[2px_2px_0_#1DAD97] border border-[#1DAD97]/30" style={{ fontFamily: 'Delicious Handrawn, cursive' }}>
              <span className="text-[#111827]/60">Diem cua ban: </span>
              <span className="text-[#1DAD97]">{myScore} pts</span>
              <span className="text-[#111827]/40 mx-2">|</span>
              <span className="text-[#111827]/60">Xep hang: </span>
              <span>#{myRank || '-'}</span>
            </div>
          )}
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
                  // Host không thấy đáp án player chọn - chỉ thấy đáp án đúng
                  // Player thấy đáp án mình chọn (highlight đỏ nếu sai)
                  const isSelected = !isHost && answer.id === selectedAnswerId;
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
            {isHost ? `` : `Diem cua ban: ${myScore} pts`}
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