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
import { Zap, Trophy, Crown, Clock, Target, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

// ============================================================================
// FREEZE OVERLAY COMPONENT - Neo-Brutalism Style
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
      style={{ background: '#000000' }}
    >
      {/* Warning Icon */}
      <div className="mb-8 relative">
        <div className="bg-red-500 border-4 border-black shadow-brutal-xl w-32 h-32 flex items-center justify-center">
          <AlertTriangle className="w-16 h-16 text-white" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-4xl font-black text-red-500 uppercase mb-4 tracking-wider">
        HỆ THỐNG TẠM DỪNG
      </h1>

      {/* Message */}
      <p className="text-center text-white/80 max-w-lg px-6 text-base leading-relaxed mb-8 font-bold">
        {message || 'Phát hiện truy cập bất thường. Đang truy vết kẻ tấn công. Vui lòng giữ nguyên màn hình.'}
      </p>

      {/* Timer */}
      <div className="bg-white border-4 border-black shadow-brutal p-6 text-center mb-8">
        <p className="text-xs font-black uppercase text-black/50 mb-2 tracking-widest">Đã dừng</p>
        <p className="text-5xl font-black text-red-500">{fmt(elapsed)}</p>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-6 py-3 bg-red-500 border-4 border-black">
        <div className="w-3 h-3 bg-white rounded-full" />
        <span className="text-sm font-black text-white tracking-wider">SECURITY RESPONSE ACTIVE</span>
      </div>
    </div>
  );
}

// ============================================================================
// MAINTENANCE OVERLAY - Neo-Brutalism Style
// ============================================================================
function MaintenanceOverlay({ message }: { message: string }) {
  const [countdown, setCountdown] = useState(5);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);
  return (
    <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-black">
      <div className="bg-neon-yellow border-4 border-black shadow-brutal p-8 mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-20 h-20 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <h1 className="text-3xl font-black text-white mb-3 uppercase">Hệ thống bảo trì</h1>
      <p className="text-white/60 text-base max-w-md text-center px-6 mb-6 font-medium">
        {message || 'Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau ít phút.'}
      </p>
      {countdown > 0 && (
        <p className="text-white/40 text-sm font-bold">Ngắt kết nối sau <span className="text-neon-yellow font-black">{countdown}s</span></p>
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

  const isLastQuestion = totalQuestions > 0 && questionIndex >= totalQuestions - 1;

  const [localTimeRemaining, setLocalTimeRemaining] = useState(0);
  const [isJoining, setIsJoining] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [hasRecoveredFromHttp, setHasRecoveredFromHttp] = useState(false);

  const hasRecoveredRef = useRef(false);

  useEffect(() => {
    hasRecoveredRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    const checkAuth = () => {
      const authStore = useAuthStore.getState();
      if (authStore.isHydrated) {
        setAuthReady(true);
        console.log('[GamePage] Auth hydrated, accessToken available:', !!authStore.accessToken);
      }
    };

    checkAuth();

    const unsubscribe = useAuthStore.subscribe((state) => {
      if (state.isHydrated) {
        setAuthReady(true);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!sessionId || sessionId === 'undefined') {
      router.push('/');
      return;
    }

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

      if (state._isRecovering) {
        console.log('[GamePage] Skipping question_start due to HTTP recovery in progress');
        return;
      }

      const isNewQuestion = state.currentQuestion?.id !== data.question.id;
      const shouldResetAnswer = isNewQuestion || state.gameStatus !== GameState.QUESTION_ACTIVE;

      console.log('[GamePage] question_start: isNewQuestion=', isNewQuestion, 'shouldResetAnswer=', shouldResetAnswer);

      let newTimeRemaining = data.question.timeLimit;
      if (data.timeRemaining !== undefined && data.timeRemaining !== null) {
        if (shouldResetAnswer) {
          newTimeRemaining = data.timeRemaining;
        }
      }

      useGameStore.setState({
        gameStatus: GameState.QUESTION_ACTIVE,
        currentQuestion: data.question,
        questionIndex: data.questionIndex,
        totalQuestions: data.totalQuestions,
        countdown: 0,
        hasAnswered: shouldResetAnswer ? false : state.hasAnswered,
        selectedAnswerId: shouldResetAnswer ? null : state.selectedAnswerId,
        correctAnswerId: shouldResetAnswer ? null : state.correctAnswerId,
      });
      
      useGameStore.setState({
        timeRemaining: newTimeRemaining,
        questionStartTime: data.serverTime || Date.now(),
      });
    };

    const handleQuestionResult = (data: any) => {
      console.log('[GamePage] question_result:', data);
      const state = useGameStore.getState();

      if (data.questionIndex !== state.questionIndex) {
        console.warn('[GamePage] Stale question_result received, skipping');
        return;
      }

      useGameStore.setState({
        gameStatus: GameState.QUESTION_RESULT,
        leaderboard: data.leaderboard || [],
        correctAnswerId: data.correctAnswer?.id || null,
      });

      if (state.myPlayerId && data.leaderboard) {
        const myEntry = data.leaderboard.find((e: any) => e.playerId === state.myPlayerId);
        if (myEntry) {
          const newScore = state.hasAnswered ? myEntry.score : state.myScore;
          const newRank = state.hasAnswered ? myEntry.rank : state.myRank;
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

      sessionStorage.removeItem('hostSessionId');
      sessionStorage.removeItem('hostUserId');
      sessionStorage.removeItem('playerId');
      sessionStorage.removeItem('playerNickname');
      sessionStorage.removeItem('currentRoomId');

      useGameStore.getState().reset();
      useRoomStore.getState().reset();

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

    // Handle player reconnecting (entering grace period)
    const handlePlayerReconnecting = (data: { playerId: string; nickname: string; gracePeriodMs: number }) => {
      console.log('[GamePage] player_reconnecting:', data);
      
      // Add to reconnecting set so UI can show "reconnecting..." status
      useGameStore.getState().setPlayerReconnecting(data.playerId, data.nickname, data.gracePeriodMs);
      
      // Show toast indicating player is reconnecting
      toast.warning(`${data.nickname} đang kết nối lại...`, {
        duration: Math.min(data.gracePeriodMs, 5000),
      });
    };

    // Handle player reconnected (within grace period)
    const handlePlayerReconnected = (data: { playerId: string; nickname: string; timestamp: number }) => {
      console.log('[GamePage] player_reconnected:', data);
      
      // Clear from reconnecting set
      useGameStore.getState().clearPlayerReconnecting(data.playerId);
      
      // Show toast indicating player reconnected
      toast.success(`${data.nickname} đã quay lại!`);
    };

    const handlePlayerLeft = (data: { playerId: string; nickname: string; timestamp: number }) => {
      console.log('[GamePage] player_left:', data);

      const state = useGameStore.getState();
      
      // Check if player was in reconnecting state - if so, ignore this event
      // (player_left is only emitted AFTER grace period expires)
      if (state.reconnectingPlayers.has(data.playerId)) {
        console.log('[GamePage] Ignoring player_left for player in reconnecting state:', data.playerId);
        return;
      }

      const newLeaderboard = state.leaderboard.filter(
        (entry) => entry.playerId !== data.playerId
      );

      useGameStore.setState({ leaderboard: newLeaderboard });

      if (data.playerId === state.myPlayerId) {
        toast.error('Bạn đã bị ngắt kết nối');
      } else {
        toast.info(`${data.nickname} đã rời phòng`);
      }
    };

    const handleScoreUpdate = (data: any) => {
      const state = useGameStore.getState();

      console.log('[GamePage] score_update received:', {
        myPlayerId: state.myPlayerId,
        gameStatus: state.gameStatus,
        hasAnswered: state.hasAnswered,
      });

      if (state._isRecovering) {
        console.log('[GamePage] Skipping score_update due to HTTP recovery in progress');
        return;
      }

      if (state.gameStatus === GameState.QUESTION_ACTIVE) {
        console.log('[GamePage] Skipping score_update during QUESTION_ACTIVE to prevent cheating');
        return;
      }

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
          }
        }
      }
    };

    const handleGameRedirect = (data: { url: string; sessionId: string }) => {
      console.log('[GamePage] game_redirect received:', data, 'current sessionId:', sessionId);
      if (data.sessionId !== sessionId) {
        useGameStore.setState({ _pendingRedirect: data.url });
      }
    };

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
    socket.on('player_left', handlePlayerLeft);
    socket.on('player_reconnecting', handlePlayerReconnecting);
    socket.on('player_reconnected', handlePlayerReconnected);

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
      socket.off('player_left', handlePlayerLeft);
      socket.off('player_reconnecting', handlePlayerReconnecting);
      socket.off('player_reconnected', handlePlayerReconnected);
    };
  }, [sessionId, router]);

  const pendingRedirect = useGameStore((s) => s._pendingRedirect);

  useEffect(() => {
    if (!pendingRedirect || pendingRedirect === `/game/${sessionId}`) return;

    console.log('[GamePage] SPA redirect to:', pendingRedirect);
    router.push(pendingRedirect);
    useGameStore.setState({ _pendingRedirect: null });
  }, [pendingRedirect, sessionId, router]);

  useEffect(() => {
    if (!sessionId || sessionId === 'undefined') return;

    if (!authReady) {
      console.log('[GamePage] Waiting for auth to hydrate...');
      return;
    }

    if (hasRecoveredRef.current) {
      console.log('[GamePage] Skipping double recovery');
      return;
    }
    hasRecoveredRef.current = true;

    const authStore = useAuthStore.getState();
    const accessToken = authStore.accessToken;
    console.log('[GamePage] Auth ready, token available:', !!accessToken);

    const storedHostSessionId = sessionStorage.getItem('hostSessionId');
    const storedPlayerId = sessionStorage.getItem('playerId');
    const storedNickname = sessionStorage.getItem('playerNickname');
    const storedRoomId = sessionStorage.getItem('currentRoomId');
    
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
        console.log('[GamePage] Joining as HOST with JWT');
        socket.emit('host_join_game', { sessionId, jwt: accessToken }, (response: any) => {
          if (response.success && response.state) {
            console.log('[GamePage] host_join_game success, isActualHost:', response.isActualHost);
            
            const actualIsHost = response.isActualHost;
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
              correctAnswerId,
              _isRecovering: false,
            });
            if (!actualIsHost) {
              console.warn('[GamePage] Server rejected host identity - user is NOT the host');
            }
          } else {
            console.error('[GamePage] host_join_game failed:', response.error);
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
        console.log('[GamePage] Joining as PLAYER');
        socket.emit('join_game', { sessionId, playerId: storedPlayerId, nickname: storedNickname }, (response: any) => {
          if (response.success && response.state) {
            console.log('[GamePage] join_game success');
            const myEntry = response.state.leaderboard?.find((e: any) => e.playerId === storedPlayerId);
            const showLeaderboard = response.state.status !== GameState.QUESTION_ACTIVE;
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
              correctAnswerId,
              myScore: myEntry?.score ?? useGameStore.getState().myScore ?? 0,
              myRank: myEntry?.rank ?? useGameStore.getState().myRank ?? null,
              _isRecovering: false,
            });
          } else {
            useGameStore.setState({ _isRecovering: false });
          }
        });
      } else {
        console.log('[GamePage] No stored credentials, using HTTP state only');
        useGameStore.setState({ _isRecovering: false });
      }
    };

    const initGame = async () => {
      const socket = getSocket();
      
      if (!socket.connected) {
        console.log('[GamePage] Connecting socket with auth token...');
        if (accessToken) {
          connectSocketWithAuth(accessToken);
        } else {
          socket.connect();
        }
        
        await new Promise<void>((resolve) => {
          if (socket.connected) {
            resolve();
          } else {
            socket.once('connect', () => resolve());
          }
        });
        console.log('[GamePage] Socket connected:', socket.id);
      }

      await recoverState();
      joinSocketRoom();
    };

    initGame().catch((err) => {
      console.error('[GamePage] initGame error:', err);
      setIsJoining(false);
      useGameStore.setState({ _isRecovering: false });
    });

  }, [sessionId, authReady]);

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
    
    if (!gameStore.isHost) {
      console.warn('[GamePage] handleNextQuestion called by non-host, ignoring');
      return;
    }
    
    gameStore.socket.emit('host_next_question', { sessionId }, (response: any) => {
      if (!response.success) {
        console.error('[GamePage] next_question error:', response.error);
        if (response.error === 'Game already finished') {
          useGameStore.setState({ gameStatus: GameState.FINISHED });
        }
        if (response.error === 'Only host can advance question') {
          useGameStore.setState({ isHost: false });
        }
      }
    });
  };

  const handlePlayAgain = async () => {
    const { sessionId: sid, roomId: rid, playAgain } = useGameStore.getState();
    if (!sid || !rid) return;
    try {
      const newSessionId = await playAgain(sid, rid);
      if (newSessionId) {
        sessionStorage.setItem('hostSessionId', newSessionId);
        router.push(`/game/${newSessionId}`);
      }
    } catch (error) {
      console.error('[GamePage] play_again error:', error);
    }
  };

  const handleLeaveRoom = () => {
    const gameStore = useGameStore.getState();

    if (gameStore.socket && sessionId) {
      gameStore.socket.emit('player_leave_game', {
        sessionId,
        playerId: gameStore.myPlayerId,
        nickname: gameStore.myNickname,
      });
    }

    gameStore.reset();
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

  // ============================================================================
  // RENDER - Neo-Brutalism Game UI
  // ============================================================================
  if (!sessionId || sessionId === 'undefined') {
    return (
      <div className="min-h-screen bg-neon-yellow flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white border-4 border-black shadow-brutal-xl">
          <CardHeader className="bg-red-500 border-b-4 border-black text-center">
            <CardTitle className="text-2xl font-black text-white uppercase">
              Session không hợp lệ
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 flex justify-center">
            <Button
              onClick={() => router.push('/')}
              className="bg-neon-green border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1 font-black text-lg px-8 py-6"
            >
              QUAY VỀ TRANG CHỦ
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isMaintenance) {
    return <MaintenanceOverlay message={maintenanceMessage} />;
  }

  if (isFrozen) {
    return <FreezeOverlay message={freezeMessage} />;
  }

  if (isJoining) {
    return (
      <div className="min-h-screen bg-neon-yellow flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white border-4 border-black shadow-brutal-xl">
          <CardHeader className="bg-neon-blue border-b-4 border-black text-center">
            <CardTitle className="text-2xl font-black uppercase">
              Đang kết nối...
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin bg-neon-pink" />
            <p className="text-lg font-bold text-black/60">Đang tham gia game</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Countdown overlay
  if (gameStatus === GameState.STARTING) {
    return (
      <div className="min-h-screen bg-neon-yellow flex items-center justify-center overflow-hidden">
        <div className="text-center">
          <p className="text-lg font-bold text-black/60 mb-8 uppercase tracking-wide">
            Game sắp bắt đầu
          </p>

          <div className="relative inline-block">
            <div className="bg-black border-4 border-black shadow-brutal-xl w-64 h-64 flex items-center justify-center">
              <span className="text-8xl font-black text-neon-yellow">
                {countdown}
              </span>
            </div>
          </div>

          <p className="text-2xl font-bold text-black/70 mt-8 uppercase tracking-wide">
            Chuẩn bị câu hỏi
          </p>
        </div>
      </div>
    );
  }

  // Waiting
  if (gameStatus === GameState.WAITING) {
    return (
      <div className="min-h-screen bg-neon-blue flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white border-4 border-black shadow-brutal-xl">
          <CardHeader className="bg-neon-pink border-b-4 border-black text-center">
            <CardTitle className="text-2xl font-black uppercase text-white">
              Đang chờ game bắt đầu
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin bg-neon-green" />
            <p className="text-lg font-bold text-black/60">
              {isHost ? 'Đợi người chơi tham gia' : 'Chờ host bắt đầu game'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Question active
  if (gameStatus === GameState.QUESTION_ACTIVE && currentQuestion) {
    // Neo-Brutalism colors for answers
    const answerColors = [
      { bg: 'bg-neon-blue', border: 'border-blue-600', hover: 'hover:bg-blue-600' },
      { bg: 'bg-neon-green', border: 'border-green-600', hover: 'hover:bg-green-600' },
      { bg: 'bg-neon-yellow', border: 'border-yellow-500', hover: 'hover:bg-yellow-500' },
      { bg: 'bg-neon-purple', border: 'border-purple-600', hover: 'hover:bg-purple-600' },
    ];

    return (
      <div className="min-h-screen bg-neon-yellow p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 bg-white rounded-2xl p-4 border-4 border-black shadow-brutal">
            <div className="bg-black border-4 border-black shadow-brutal-sm px-4 py-2">
              <span className="text-white font-black text-xl uppercase">
                Câu {questionIndex + 1}/{totalQuestions}
              </span>
            </div>
            <div className={`px-6 py-3 border-4 border-black shadow-brutal ${localTimeRemaining <= 5 ? 'bg-red-500' : 'bg-neon-green'}`}>
              <span className="text-white font-black text-2xl flex items-center gap-2">
                <Clock className="w-6 h-6" />
                {localTimeRemaining}s
              </span>
            </div>
          </div>

          {/* Question card */}
          <Card className="mb-6 bg-white border-4 border-black shadow-brutal">
            <CardHeader className="bg-neon-pink border-b-4 border-black pb-4">
              <div className="flex items-center gap-3">
                <Target className="w-8 h-8 text-white" />
                <CardTitle className="text-2xl font-black text-white text-center leading-relaxed">
                  {currentQuestion.content}
                </CardTitle>
              </div>
            </CardHeader>
          </Card>

          {/* Answer buttons - Neo-Brutalism style */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {currentQuestion.answers.map((answer, index) => {
              const color = answerColors[index % 4];
              const isSelected = selectedAnswerId === answer.id;
              return (
                <button
                  key={answer.id}
                  onClick={() => !isHost && handleSubmitAnswer(answer.id)}
                  disabled={hasAnswered || isHost}
                  className={`
                    ${color.bg} border-4 border-black
                    text-white text-xl py-10 px-6
                    font-black uppercase
                    shadow-brutal
                    transition-all duration-150
                    ${!isHost && !hasAnswered ? `${color.hover} hover:-translate-y-1 hover:shadow-brutal-lg cursor-pointer` : ''}
                    ${isSelected ? 'ring-4 ring-white scale-105' : ''}
                    disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0
                  `}
                >
                  <span className="flex items-center justify-center gap-4">
                    <span className="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center text-2xl font-black">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="text-left flex-1">{answer.content}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Status message - Neo-Brutalism */}
          {isHost ? (
            <div className="text-center bg-white border-4 border-black shadow-brutal p-4">
              <p className="font-bold text-black/60 uppercase tracking-wide">
                <span className="inline-block w-3 h-3 bg-neon-orange border-2 border-black mr-2"></span>
                Host đang theo dõi câu hỏi
              </p>
            </div>
          ) : hasAnswered ? (
            <div className="text-center bg-neon-green border-4 border-black shadow-brutal p-4">
              <p className="font-black text-white uppercase tracking-wide flex items-center justify-center gap-2">
                <CheckCircle className="w-6 h-6" />
                Đã gửi đáp án! Chờ kết quả...
              </p>
            </div>
          ) : (
            <div className="text-center bg-white border-4 border-black shadow-brutal p-4">
              <p className="font-bold text-black/60 uppercase tracking-wide">
                Chọn đáp án của bạn
              </p>
            </div>
          )}

          {/* Score display - only when NOT answering */}
          {gameStatus !== GameState.QUESTION_ACTIVE && (
            <div className="mt-6 text-center bg-white border-4 border-black shadow-brutal p-4">
              <span className="font-bold text-black/60">Điểm của bạn: </span>
              <span className="font-black text-neon-green">{myScore} pts</span>
              <span className="font-bold text-black/40 mx-4">|</span>
              <span className="font-bold text-black/60">Xếp hạng: </span>
              <span className="font-black text-neon-pink">#{myRank || '-'}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Question result
  if (gameStatus === GameState.QUESTION_RESULT) {
    const isCorrect = selectedAnswerId === correctAnswerId;
    const noAnswer = !selectedAnswerId;

    return (
      <div className="min-h-screen bg-neon-green p-4">
        <div className="max-w-4xl mx-auto">
          {/* Result header */}
          <div className="text-center mb-6">
            {isCorrect ? (
              <>
                <div className="bg-neon-yellow border-4 border-black shadow-brutal-xl inline-block px-8 py-4 mb-3">
                  <CheckCircle className="w-16 h-16 text-black mx-auto" />
                </div>
                <h2 className="text-4xl font-black text-white uppercase">Chính xác!</h2>
              </>
            ) : noAnswer ? (
              <>
                <div className="bg-neon-orange border-4 border-black shadow-brutal-xl inline-block px-8 py-4 mb-3">
                  <Clock className="w-16 h-16 text-white mx-auto" />
                </div>
                <h2 className="text-4xl font-black text-white uppercase">Hết giờ!</h2>
              </>
            ) : (
              <>
                <div className="bg-red-500 border-4 border-black shadow-brutal-xl inline-block px-8 py-4 mb-3">
                  <XCircle className="w-16 h-16 text-white mx-auto" />
                </div>
                <h2 className="text-4xl font-black text-white uppercase">Chưa đúng!</h2>
              </>
            )}
          </div>

          {/* Question card */}
          <Card className="mb-6 bg-white border-4 border-black shadow-brutal">
            <CardHeader className="bg-neon-blue border-b-4 border-black pb-4">
              <CardTitle className="text-xl font-black text-white text-center leading-relaxed">
                {currentQuestion?.content}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {currentQuestion?.answers.map((answer, index) => {
                  const isAnswerCorrect = answer.id === correctAnswerId;
                  const isSelected = !isHost && answer.id === selectedAnswerId;
                  
                  return (
                    <div key={answer.id} className={`
                      p-4 rounded-xl flex items-center gap-3 border-4 border-black
                      ${isAnswerCorrect 
                        ? 'bg-neon-green shadow-brutal' 
                        : isSelected 
                          ? 'bg-red-500 shadow-brutal' 
                          : 'bg-white shadow-brutal-sm'
                      }
                    `}>
                      <span className={`w-10 h-10 rounded-lg border-2 border-black flex items-center justify-center font-black text-lg ${
                        isAnswerCorrect || isSelected ? 'bg-black text-white' : 'bg-black/10 text-black'
                      }`}>
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className={`flex-1 font-bold text-lg ${isAnswerCorrect || isSelected ? 'text-white' : 'text-black'}`}>
                        {answer.content}
                      </span>
                      {isAnswerCorrect && <CheckCircle className="w-6 h-6 text-white" />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Player score card */}
          {!isHost && (
            <Card className="mb-6 bg-white border-4 border-black shadow-brutal">
              <CardContent className="pt-6 text-center">
                <p className="text-sm font-bold text-black/50 uppercase tracking-wider mb-2">Điểm của bạn</p>
                <div className="text-5xl font-black text-neon-pink mb-2">{myScore} pts</div>
                <div className="text-lg font-bold text-black/70">
                  Xếp hạng: <span className="text-neon-blue font-black">#{myRank || '-'}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Host leaderboard */}
          {isHost && (
            <Card className="mb-6 bg-white border-4 border-black shadow-brutal">
              <CardHeader className="bg-neon-yellow border-b-4 border-black pb-4">
                <CardTitle className="text-xl font-black uppercase flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-black" />
                  Bảng xếp hạng
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaderboard.slice(0, 5).map((entry, idx) => (
                    <div key={entry.playerId} className={`
                      flex justify-between items-center p-4 rounded-xl border-4 border-black
                      ${entry.rank === 1 ? 'bg-neon-yellow shadow-brutal' : entry.rank === 2 ? 'bg-gray-300 shadow-brutal-sm' : entry.rank === 3 ? 'bg-orange-400 shadow-brutal-sm' : 'bg-white shadow-brutal-sm'}
                    `}>
                      <div className="flex items-center gap-3">
                        <span className={`w-10 h-10 rounded-lg border-4 border-black flex items-center justify-center font-black text-lg ${
                          entry.rank === 1 ? 'bg-black text-neon-yellow' : 'bg-black/20 text-black'
                        }`}>
                          {entry.rank === 1 ? '👑' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                        </span>
                        <span className="font-bold text-lg text-black">{entry.nickname}</span>
                      </div>
                      <span className="font-black text-xl text-black">{entry.score} pts</span>
                    </div>
                  ))}
                  {leaderboard.length === 0 && (
                    <p className="text-center font-bold text-black/50 uppercase">Chưa có dữ liệu</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Next question button */}
          {isHost && !isLastQuestion && (
            <Button
              onClick={handleNextQuestion}
              className="w-full bg-neon-pink border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-xl py-8 uppercase"
            >
              Tiếp tục →
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Game finished
  if (gameStatus === GameState.FINISHED) {
    return (
      <div className="min-h-screen bg-neon-pink p-4">
        <div className="max-w-4xl mx-auto">
          {/* Game Over header */}
          <div className="text-center mb-8">
            <div className="bg-neon-yellow border-4 border-black shadow-brutal-xl inline-block px-8 py-4 mb-4">
              <Trophy className="w-16 h-16 text-black mx-auto" />
            </div>
            <h1 className="text-5xl font-black text-white uppercase mb-2">Game Over!</h1>
            <p className="text-xl font-bold text-white/70 uppercase tracking-wide">Kết quả cuối cùng</p>
          </div>

          {/* Player result card */}
          {!isHost && (
            <Card className="mb-6 bg-white border-4 border-black shadow-brutal-xl">
              <CardHeader className="bg-neon-blue border-b-4 border-black pb-4">
                <CardTitle className="text-xl font-black uppercase text-white text-center">
                  Kết quả của bạn
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 text-center">
                <div className="bg-neon-yellow border-4 border-black shadow-brutal inline-block px-8 py-4 mb-3">
                  <p className="text-6xl font-black text-black">{myScore}</p>
                  <p className="text-sm font-bold text-black/60 uppercase">Điểm</p>
                </div>
                <div className="text-2xl font-bold text-black/70 mt-4">
                  Xếp hạng: <span className="text-neon-pink font-black">#{myRank || '-'}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Host leaderboard */}
          {isHost && (
            <Card className="mb-6 bg-white border-4 border-black shadow-brutal-xl">
              <CardHeader className="bg-neon-green border-b-4 border-black pb-4">
                <CardTitle className="text-xl font-black uppercase flex items-center gap-2">
                  <Crown className="w-6 h-6 text-black" />
                  Bảng xếp hạng
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaderboard.map((entry, idx) => (
                    <div key={entry.playerId} className={`
                      flex justify-between items-center p-4 rounded-xl border-4 border-black
                      ${idx === 0 ? 'bg-neon-yellow shadow-brutal' : idx === 1 ? 'bg-gray-300 shadow-brutal-sm' : idx === 2 ? 'bg-orange-400 shadow-brutal-sm' : 'bg-white shadow-brutal-sm'}
                    `}>
                      <div className="flex items-center gap-3">
                        <span className={`w-12 h-12 rounded-xl border-4 border-black flex items-center justify-center text-2xl ${
                          idx === 0 ? 'bg-black text-neon-yellow' : idx === 1 ? 'bg-black text-gray-300' : idx === 2 ? 'bg-black text-orange-400' : 'bg-black/20 text-black'
                        }`}>
                          {idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : entry.rank}
                        </span>
                        <span className="font-black text-xl text-black">{entry.nickname}</span>
                      </div>
                      <span className="font-black text-2xl text-black">{entry.score} pts</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          {isHost ? (
            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={handlePlayAgain}
                className="bg-neon-green border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-xl py-8 uppercase"
              >
                <Zap className="w-6 h-6 mr-2" />
                Chơi lại
              </Button>
              <Button
                onClick={handleCloseRoom}
                variant="outline"
                className="bg-white border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-xl py-8 uppercase"
              >
                Về Quiz
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleLeaveRoom}
              variant="outline"
              className="w-full bg-white border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-xl py-8 uppercase"
            >
              Rời phòng
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neon-yellow flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin bg-neon-blue mx-auto mb-4" />
        <p className="font-black text-xl text-black/60 uppercase tracking-wide">Đang tải...</p>
      </div>
    </div>
  );
}
