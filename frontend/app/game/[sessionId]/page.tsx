'use client';

import { useEffect, useState, useRef } from 'react';
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
    timeRemaining,
    connectSocket,
    reset,
  } = useGameStore();

  const [localTimeRemaining, setLocalTimeRemaining] = useState(0);
  const [isJoining, setIsJoining] = useState(true);
  // Track nếu đã recover state từ HTTP API (sau reload)
  const [hasRecoveredFromHttp, setHasRecoveredFromHttp] = useState(false);

  // Track if recovery has been initiated to prevent double execution
  // (effect may run twice due to React StrictMode or re-renders)
  const hasRecoveredRef = useRef(false);

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
      const state = useGameStore.getState();

      // Skip if we're in the middle of HTTP state recovery
      // The HTTP state is authoritative during recovery
      if (state._isRecovering) {
        console.log('[GamePage] Skipping question_start due to HTTP recovery in progress');
        return;
      }

      // Check if this is a NEW question or the SAME question (after reload/reconnect)
      // Only reset hasAnswered for truly NEW questions
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
        // Only reset hasAnswered if it's a genuinely NEW question
        // If recovering state after reload, preserve hasAnswered
        hasAnswered: shouldResetAnswer ? false : state.hasAnswered,
        selectedAnswerId: shouldResetAnswer ? null : state.selectedAnswerId,
        correctAnswerId: null,
        // Update timer - use question.timeLimit as base for NEW questions
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

    // Prevent double execution - if already recovered, skip
    if (hasRecoveredRef.current) {
      console.log('[GamePage] Skipping double recovery');
      return;
    }

    // isHost detection: sessionStorage.setItem('hostSessionId', ...) is called in
    // waiting-screen.tsx ONLY when the user is the host who clicked "Start Game".
    // PRIORITY: If hostSessionId matches sessionId → ALWAYS treat as host, IGNORE player data.
    // This prevents host from becoming player on page reload.
    const storedHostSessionId = sessionStorage.getItem('hostSessionId');
    const storedHostUserId = sessionStorage.getItem('hostUserId'); // Saved when host starts game
    const storedPlayerId = sessionStorage.getItem('playerId');
    const storedNickname = sessionStorage.getItem('playerNickname');
    const storedRoomId = sessionStorage.getItem('currentRoomId');
    
    // isHostFromStorage: Highest priority - if this matches, user is definitely host
    const isHostFromStorage = storedHostSessionId === sessionId;
    const isHost = isHostFromStorage;
    // isPlayer: Only if NOT a host (from storage) AND has player credentials
    const isPlayer = !isHost && !!storedPlayerId && !!storedNickname;

    // Hoisted so both recoverState and joinSocketRoom can reference it.
    let httpData: any = null;

    const recoverState = async () => {
      // Set flag để socket handlers không ghi đè state trong quá trình recover
      useGameStore.setState({ _isRecovering: true });

      try {
        const response = await apiClient.get(`/games/${sessionId}/state`);
        httpData = response.data;

        console.log('[GamePage] HTTP state recovered:', httpData);

        // Reset game state for new session BEFORE applying HTTP state
        // Note: hasAnswered và selectedAnswerId sẽ được set đúng sau khi check API
        useGameStore.setState({
          currentQuestion: null,
          leaderboard: [],
          countdown: 0,
          correctAnswerId: null,
          // Giữ nguyên hasAnswered và selectedAnswerId - sẽ update sau
        });

        // Đặt biến để track player đã trả lời chưa
        let playerHasAnswered = false;
        let playerAnsweredQuestionId: string | null = null;

        if (httpData.status === 'QUESTION_ACTIVE' && httpData.currentQuestion) {
          // Calculate remaining time using server's questionStartedAt for accuracy
          // This ensures host and player see the same countdown
          let adjustedRemainingTime: number;

          if (httpData.questionStartedAt && httpData.serverTime) {
            // Use server timestamps for accurate calculation
            const serverTime = httpData.serverTime;
            const questionStartedAt = httpData.questionStartedAt;
            const timeLimit = httpData.currentQuestion.timeLimit || 15;
            const elapsedSeconds = (serverTime - questionStartedAt) / 1000;
            // Adjust for network latency from server to client
            const clientReceiveTime = Date.now();
            const networkLatencyMs = Math.max(0, clientReceiveTime - serverTime);
            const networkLatencySec = networkLatencyMs / 1000;
            adjustedRemainingTime = Math.max(0, Math.ceil(timeLimit - elapsedSeconds - networkLatencySec));
          } else {
            // Fallback: use remainingTime from server with basic adjustment
            const serverTime = httpData.serverTime || Date.now();
            const clientReceiveTime = Date.now();
            const networkLatencyMs = Math.max(0, clientReceiveTime - serverTime);
            const networkLatencySec = Math.ceil(networkLatencyMs / 1000);
            adjustedRemainingTime = Math.max(0, (httpData.remainingTime || httpData.currentQuestion.timeLimit || 15) - networkLatencySec);
          }

          console.log(`[GamePage] Timer sync: questionStartedAt=${httpData.questionStartedAt}, serverTime=${httpData.serverTime}, adjusted=${adjustedRemainingTime}s`);

          // Active question — recover immediately so UI renders without waiting for socket
          useGameStore.setState({
            gameStatus: GameState.QUESTION_ACTIVE,
            currentQuestion: httpData.currentQuestion,
            questionIndex: httpData.currentQuestionIndex,
            totalQuestions: httpData.totalQuestions,
            timeRemaining: adjustedRemainingTime,
            questionStartTime: Date.now(),
            // Không restore leaderboard ở đây - player không cần thấy trong lúc đang làm
            leaderboard: [],
          });
        } else if (httpData.status === 'QUESTION_RESULT') {
          // Restore full state including question and correct answer for result display
          useGameStore.setState({
            gameStatus: GameState.QUESTION_RESULT,
            currentQuestion: httpData.currentQuestion || null,
            correctAnswerId: httpData.correctAnswerId || null,
            leaderboard: httpData.leaderboard || [],
            questionIndex: httpData.currentQuestionIndex,
            totalQuestions: httpData.totalQuestions,
            // Restore player answer info if available
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

          // Check if player already answered the current question BEFORE setting any state
          if (httpData.status === 'QUESTION_ACTIVE' && httpData.currentQuestion) {
            try {
              const answeredRes = await apiClient.get(
                `/games/${sessionId}/answered-questions?playerId=${storedPlayerId}`
              );
              const answeredQuestions: string[] = answeredRes.data.answeredQuestions || [];
              const currentQuestionId = httpData.currentQuestion?.id;

              if (currentQuestionId && answeredQuestions.includes(currentQuestionId)) {
                console.log('[GamePage] Player already answered this question:', currentQuestionId);
                playerHasAnswered = true;
                playerAnsweredQuestionId = currentQuestionId;
              }
            } catch (answeredErr) {
              console.error('[GamePage] Failed to fetch answered questions:', answeredErr);
            }
          }

          // Chỉ restore myScore khi game đã kết thúc hoặc đang hiển thị kết quả
          // KHÔNG restore score trong QUESTION_ACTIVE để tránh player thấy điểm trước khi hết giờ
          const myEntry = httpData.leaderboard?.find((e: any) => e.playerId === storedPlayerId);
          const showScore = httpData.status === 'QUESTION_RESULT' || httpData.status === 'FINISHED';

          // myScore: LUÔN restore từ leaderboard (nếu có) để player thấy điểm
          const myScore = myEntry?.score ?? 0;
          const myRank = myEntry?.rank ?? null;

          console.log('[GamePage] recoverState: myScore from leaderboard:', myScore, 'rank:', myRank);

          useGameStore.setState({
            // hasAnswered: chỉ set true nếu player đã trả lời câu hiện tại
            hasAnswered: playerHasAnswered,
            selectedAnswerId: null,
            // myScore: LUÔN restore từ leaderboard
            myScore,
            myRank,
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
          _isRecovering: false, // Reset flag on error
        });
      } finally {
        setIsJoining(false);
        // KHÔNG reset _isRecovering ở đây - sẽ reset sau khi join_game callback xong
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
          if (response.success && response.state) {
            console.log('[GamePage] join_game confirmed (player)');
            console.log('[GamePage] storedPlayerId:', storedPlayerId);
            console.log('[GamePage] response leaderboard:', response.state.leaderboard);
            const state = useGameStore.getState();

            // Find my entry in leaderboard to restore myScore
            const myEntry = response.state.leaderboard?.find((e: any) => e.playerId === storedPlayerId);
            const myScore = myEntry?.score ?? state.myScore ?? 0;
            const myRank = myEntry?.rank ?? state.myRank ?? null;

            // During QUESTION_ACTIVE, don't show leaderboard to player (to avoid cheating)
            // But ALWAYS restore myScore if player has already answered
            const showLeaderboard = response.state.status !== GameState.QUESTION_ACTIVE;

            console.log('[GamePage] Restoring myScore:', myScore, 'rank:', myRank, 'showLeaderboard:', showLeaderboard);

            useGameStore.setState({
              sessionId,
              roomId: response.state.roomId || storedRoomId,
              isHost: false,
              myPlayerId: storedPlayerId,
              myNickname: storedNickname,
              gameStatus: response.state.status || GameState.WAITING,
              currentQuestion: response.state.currentQuestion || null,
              questionIndex: response.state.questionIndex ?? 0,
              totalQuestions: response.state.totalQuestions ?? 0,
              // Leaderboard: chỉ hiển thị khi không phải QUESTION_ACTIVE
              leaderboard: showLeaderboard ? (response.state.leaderboard || []) : state.leaderboard,
              timeRemaining: response.state.remainingTime ?? response.state.currentQuestion?.timeLimit ?? 0,
              // KHÔNG ghi đè hasAnswered, selectedAnswerId khi đang recover
              // hasAnswered và selectedAnswerId đã được set đúng từ recoverState
              // myScore: LUÔN restore từ leaderboard (nếu có) để player thấy điểm
              myScore,
              myRank,
              // Hoàn tất recover - socket handlers giờ có thể update state
              _isRecovering: false,
            });
          }
        });
      } else if (isHost) {
        // Host: has sessionStorage hostSessionId matching sessionId
        const authStore = useAuthStore.getState();
        // Use storedHostUserId if authStore.user is null (after reload)
        const hostUserId = authStore.user?.id || storedHostUserId;
        const emitPayload = { 
          sessionId, 
          jwt: authStore.accessToken,
          userId: hostUserId,
        };
        console.log('[GamePage] Host join emit payload:', emitPayload);
        // Send both JWT and userId for verification
        // userId is used by server when JWT is expired/invalid
        socket.emit('host_join_game', emitPayload, (response: any) => {
          if (response.success && response.state) {
            console.log('[GamePage] host_join_game confirmed, isActualHost:', response.isActualHost, 'isHostFromStorage:', isHostFromStorage);
            // CRITICAL: Use server's isActualHost as the authoritative source of truth
            // The server verifies JWT/DB to determine if user is actually the host
            // This prevents non-hosts from seeing host controls if sessionStorage is incorrect
            // Even if sessionStorage has hostSessionId, server says we're not host → we're not host
            const actualIsHost = response.isActualHost && isHostFromStorage;
            useGameStore.setState({
              sessionId,
              roomId: response.state.roomId || httpData?.roomId || null,
              isHost: actualIsHost,
              myPlayerId: actualIsHost ? 'host_' + hostUserId : (response.state.myPlayerId || storedPlayerId || null),
              myNickname: actualIsHost 
                ? (authStore.user?.email?.split('@')[0] || 'Host')
                : (response.state.nickname || storedNickname || authStore.user?.email?.split('@')[0] || `Player_${Date.now() % 1000}`),
              gameStatus: response.state.status || GameState.WAITING,
              currentQuestion: response.state.currentQuestion || null,
              questionIndex: response.state.questionIndex ?? 0,
              totalQuestions: response.state.totalQuestions ?? 0,
              leaderboard: response.state.leaderboard || [],
              timeRemaining: response.state.remainingTime ?? response.state.currentQuestion?.timeLimit ?? 0,
              _isRecovering: false, // Hoàn tất recover
            });
            if (!actualIsHost) {
              console.log('[GamePage] Server says user is NOT the host, hiding host controls');
            }
          } else {
            // Server rejected the host join entirely - fall back to player mode
            console.log('[GamePage] host_join_game failed:', response.error, '- falling back to player mode');
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
                  currentQuestion: playerResponse.state.currentQuestion || null,
                  questionIndex: playerResponse.state.questionIndex ?? 0,
                  totalQuestions: playerResponse.state.totalQuestions ?? 0,
                  leaderboard: playerResponse.state.leaderboard || [],
                  timeRemaining: playerResponse.state.remainingTime ?? playerResponse.state.currentQuestion?.timeLimit ?? 0,
                  _isRecovering: false,
                });
              }
            });
          }
        });
      } else {
        // Fallback: player without sessionStorage data (navigated directly or guest join)
        // Emit join_game with any available data so they can still participate
        const fallbackNickname = storedNickname || `Player_${Date.now() % 1000}`;
        socket.emit('join_game', { sessionId, playerId: storedPlayerId || null, nickname: fallbackNickname }, (response: any) => {
          if (response.success && response.state) {
            console.log('[GamePage] join_game confirmed (fallback player)');
            useGameStore.setState({
              sessionId,
              roomId: response.state.roomId || httpData?.roomId || storedRoomId,
              isHost: false,
              myPlayerId: response.state.myPlayerId || storedPlayerId,
              myNickname: fallbackNickname,
              gameStatus: response.state.status || GameState.WAITING,
              currentQuestion: response.state.currentQuestion || null,
              questionIndex: response.state.questionIndex ?? 0,
              totalQuestions: response.state.totalQuestions ?? 0,
              leaderboard: response.state.leaderboard || [],
              timeRemaining: response.state.remainingTime ?? response.state.currentQuestion?.timeLimit ?? 0,
              _isRecovering: false, // Hoàn tất recover
            });
          }
        });
      }
    };

    const gameStore = useGameStore.getState();
    if (gameStore.socket?.connected) {
      recoverState().then(() => {
        hasRecoveredRef.current = true;
        joinSocketRoom();
      });
    } else {
      // Wait for socket connection, then recover state and join
      const interval = setInterval(() => {
        if (useGameStore.getState().socket?.connected) {
          clearInterval(interval);
          recoverState().then(() => {
            hasRecoveredRef.current = true;
            joinSocketRoom();
          });
        }
      }, 50);
    }
  }, [sessionId]);

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