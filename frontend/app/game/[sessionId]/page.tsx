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
import { registerStoreUpdater } from '@/lib/socket';
import { getGameSocket, connectGameSocket } from '@/lib/game-socket';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/common/PaginationControls';
import { Zap, Trophy, Crown, Clock, Target, CheckCircle, XCircle, AlertTriangle, Users } from 'lucide-react';
import { useGameHostIdentity } from '@/hooks/useHostIdentity';

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
    questionStartTime,
    connectSocket,
    reset,
  } = useGameStore();

  // ============================================================
  // SINGLE SOURCE OF TRUTH: useGameHostIdentity
  // ============================================================
  // This hook provides authoritative host identity based on:
  // 1. Server response (host_join_game response) - authoritative
  // 2. Store's isHost flag (set by server response)
  // 3. Storage recovery (sessionStorage for reload)
  const hostIdentity = useGameHostIdentity();
  
  // Debug logging in development
  if (process.env.NODE_ENV === 'development' && sessionId) {
    console.log('[GamePage] Host Identity:', {
      isHost: hostIdentity.isHost,
      source: hostIdentity.source,
      storeIsHost: isHost,
      debug: hostIdentity.debug,
    });
  }

  const isLastQuestion = totalQuestions > 0 && questionIndex >= totalQuestions - 1;

  const [localTimeRemaining, setLocalTimeRemaining] = useState(0);
  const [isJoining, setIsJoining] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [hasRecoveredFromHttp, setHasRecoveredFromHttp] = useState(false);

  // ============================================================
  // EFFECTIVE HOST STATUS FOR UI
  // ============================================================
  // Use hostIdentity.isHost as authoritative for UI
  // This ensures consistent host detection across all UI elements
  const effectiveIsHost = hostIdentity.isHost;

  const hasRecoveredRef = useRef(false);
  const joinedSessionRef = useRef<string | null>(null);
  const lastJoinedTimeRef = useRef<number>(0);

  // Pagination for host player panel during game - 15 players per page
  const hostPlayerPageSize = 15;
  const {
    page: hostPlayerPage,
    totalPages: hostPlayerTotalPages,
    totalItems: hostPlayerTotalItems,
    startIndex: hostPlayerStartIndex,
    endIndex: hostPlayerEndIndex,
    hasNextPage: hostPlayerHasNextPage,
    hasPrevPage: hostPlayerHasPrevPage,
    nextPage: hostPlayerNextPage,
    prevPage: hostPlayerPrevPage,
    paginatedItems: paginatedHostPlayers,
    shouldShowPagination: hostPlayerShouldShowPagination,
    resetPage: resetHostPlayerPage,
  } = usePagination(leaderboard, { pageSize: hostPlayerPageSize });

  // Pagination for host leaderboard in result/finished - 20 players per page
  const hostLeaderboardPageSize = 20;
  const {
    page: leaderboardPage,
    totalPages: leaderboardTotalPages,
    totalItems: leaderboardTotalItems,
    startIndex: leaderboardStartIndex,
    endIndex: leaderboardEndIndex,
    hasNextPage: leaderboardHasNextPage,
    hasPrevPage: leaderboardHasPrevPage,
    nextPage: leaderboardNextPage,
    prevPage: leaderboardPrevPage,
    paginatedItems: paginatedLeaderboard,
    shouldShowPagination: leaderboardShouldShowPagination,
    resetPage: resetLeaderboardPage,
  } = usePagination(leaderboard, { pageSize: hostLeaderboardPageSize });

  // Player count for non-host players
  const activePlayerCount = leaderboard.filter(e => e.connection !== 'LEFT').length;

  useEffect(() => {
    hasRecoveredRef.current = false;
    joinedSessionRef.current = null;
    lastJoinedTimeRef.current = 0;
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

    const socket = getGameSocket();
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

      // DEBUG: Validate payload
      if (!data) {
        console.error('[GamePage] question_start: Invalid payload');
        return;
      }
      if (!data.question) {
        console.error('[GamePage] question_start: Missing question data');
        return;
      }
      if (data.question && !data.question.id) {
        console.error('[GamePage] question_start: Missing question.id');
        return;
      }

      if (state._isRecovering) {
        console.log('[GamePage] Skipping question_start due to HTTP recovery in progress');
        return;
      }

      const isNewQuestion = state.currentQuestion?.id !== data.question.id;
      const shouldResetAnswer = isNewQuestion || state.gameStatus !== GameState.QUESTION_ACTIVE;

      console.log('[GamePage] question_start: isNewQuestion=', isNewQuestion, 'shouldResetAnswer=', shouldResetAnswer);

      // Calculate timeRemaining based on server time (server is source of truth)
      // Account for network latency to sync host and player timers
      const clientReceiveTime = Date.now();
      const serverToClientLatencyMs = Math.max(0, clientReceiveTime - data.serverTime);
      const latencyCompensationMs = Math.floor(serverToClientLatencyMs / 2);
      const adjustedQuestionStartTime = data.questionStartTime + latencyCompensationMs;
      const elapsedMs = clientReceiveTime - adjustedQuestionStartTime;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const timeLimit = data.timeLimit || 20;
      const newTimeRemaining = Math.max(0, timeLimit - elapsedSec);

      console.log(`[GamePage] question_start: serverTime=${data.serverTime}, questionStartTime=${data.questionStartTime}, latency=${serverToClientLatencyMs}ms, elapsed=${elapsedSec}s, timeRemaining=${newTimeRemaining}s`);

      useGameStore.setState({
        gameStatus: GameState.QUESTION_ACTIVE,
        currentQuestion: data.question,
        questionIndex: data.questionIndex ?? 0,
        totalQuestions: data.totalQuestions ?? 0,
        countdown: 0,
        hasAnswered: shouldResetAnswer ? false : state.hasAnswered,
        selectedAnswerId: shouldResetAnswer ? null : state.selectedAnswerId,
        correctAnswerId: shouldResetAnswer ? null : state.correctAnswerId,
      });

      // Reset hasAnswered for all players in leaderboard when new question starts
      if (shouldResetAnswer && Array.isArray(state.leaderboard)) {
        const resetLeaderboard = state.leaderboard.map((entry: any) => ({
          ...entry,
          hasAnswered: false,
        }));
        useGameStore.setState({ leaderboard: resetLeaderboard });
      }

      useGameStore.setState({
        timeRemaining: newTimeRemaining,
        questionStartTime: data.questionStartTime,
        serverTime: data.serverTime,
      });
    };

    const handleQuestionResult = (data: any) => {
      console.log('[GamePage] question_result:', data);
      const state = useGameStore.getState();

      // DEBUG: Validate payload
      if (!data) {
        console.error('[GamePage] question_result: Invalid payload');
        return;
      }

      if (data.questionIndex !== state.questionIndex) {
        console.warn('[GamePage] Stale question_result received, skipping');
        return;
      }

      // Defensive: ensure leaderboard is an array
      const safeLeaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];

      useGameStore.setState({
        gameStatus: GameState.QUESTION_RESULT,
        leaderboard: safeLeaderboard,
        correctAnswerId: data.correctAnswer?.id || null,
      });

      if (state.myPlayerId && safeLeaderboard.length > 0) {
        const myEntry = safeLeaderboard.find((e: any) => e?.playerId === state.myPlayerId);
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
      
      // DEBUG: Validate payload
      if (!data) {
        console.error('[GamePage] game_ended: Invalid payload');
        return;
      }
      
      // Defensive: ensure leaderboard is an array
      const safeLeaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];
      
      useGameStore.setState({
        gameStatus: GameState.FINISHED,
        leaderboard: safeLeaderboard,
        currentQuestion: null,
      });
    };

    const handleHostDisconnected = (data: { sessionId: string; gracePeriod: number }) => {
      console.log('[GamePage] host_disconnected:', data);
      toast.warning('Host đang mất kết nối. Đang chờ reconnect...', {
        duration: data.gracePeriod,
      });
    };

    const handleHostReconnected = (data: { sessionId: string; reason?: string; phase?: string }) => {
      console.log('[GamePage] host_reconnected:', data);
      // TEMPORARILY DISABLED: This event should only fire for actual host reload during game
      // Not for first join after game_redirect
      // toast.success('Host đã kết nối lại!');
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

    // Unified session transition handler — handles BOTH host and player play_again.
    //
    // TIMELINE:
    //   1. host_play_again emitted → backend creates new session, updates host presence,
    //      moves host socket to new room, then emits session_switched to OLD room.
    //   2. session_switched received by ALL (host + players still in old room).
    //   3. Handler stores embedded state in sessionStorage (playAgainState) and navigates
    //      to /game/{newSessionId} via router.replace → page remounts.
    //   4. Remounted useEffect sees valid playAgainState → skips HTTP fetch,
    //      hydrates store with STARTING state, emits join_game.
    //   5. question_start arrives after countdown → game proceeds.
    //
    // KEY PRINCIPLES:
    //   - Does NOT update store directly (would be overwritten on remount anyway).
    //   - Does NOT emit join_game here (handled after remount in useEffect).
    //   - Guards against duplicate events using sessionStorage key + timestamp.
    //   - session_started event listener is also kept for backward compat (if any old
    //     socket connections receive it), but it's now unreachable from backend.
    const handleSessionTransition = (data: {
      oldSessionId: string;
      newSessionId: string;
      url?: string;
      timestamp?: number;
      state?: {
        status: string;
        currentQuestion: any;
        questionIndex: number;
        totalQuestions: number;
        leaderboard: any[];
        remainingTime: number;
        correctAnswerId: string | null;
        countdown: number;
      };
      // session_started uses "sessionId" instead of "newSessionId"
      sessionId?: string;
    }) => {
      // Normalise: support both session_started (sessionId) and session_switched (newSessionId)
      const resolvedNewSessionId = data.newSessionId || (data as any).sessionId;
      const resolvedOldSessionId = data.oldSessionId || sessionId;

      console.log('[GamePage] session_transition:', { resolvedNewSessionId, resolvedOldSessionId, data });

      const state = useGameStore.getState();
      console.log('[GamePage] BEFORE reset: leaderboard.length=', state.leaderboard?.length, 'myScore=', state.myScore);

      // CRITICAL: Reset leaderboard AND scores IMMEDIATELY in store for new game
      // This ensures UI updates right away, before router.replace completes
      // Also update sessionId to prevent old session events from affecting new session
      useGameStore.setState({
        leaderboard: [],
        myScore: 0,
        myRank: null,
        sessionId: resolvedNewSessionId  // Update sessionId immediately
      });
      console.log('[GamePage] AFTER reset: leaderboard=[], myScore=0, myRank=null, sessionId=', resolvedNewSessionId);

      // GUARD: Ignore if we're already handling this new session (duplicate event)
      // Use sessionStorage to survive page remount attempts
      const pendingKey = `playAgain:${resolvedNewSessionId}`;
      const existingPending = sessionStorage.getItem(pendingKey);
      if (existingPending) {
        const pending = JSON.parse(existingPending);
        const age = Date.now() - (pending._timestamp || 0);
        if (age < 15000) {
          console.log('[GamePage] Ignoring duplicate session_transition for', resolvedNewSessionId);
          return;
        }
      }

      // Mark pending so page won't double-process
      sessionStorage.setItem(pendingKey, JSON.stringify({
        resolvedNewSessionId,
        resolvedOldSessionId,
        _timestamp: Date.now(),
        _fromPlayAgain: true,
      }));

      toast.info('Game mới đã bắt đầu! Đang tải...', { duration: 3000 });

      // Store embedded state for recovery after page remount.
      // This is the SOLE source of truth after remount — HTTP fetch is SKIPPED.
      // CRITICAL: leaderboard MUST be reset to empty for new game
      sessionStorage.setItem('playAgainState', JSON.stringify({
        sessionId: resolvedNewSessionId,
        gameStatus: GameState.STARTING,
        currentQuestion: null,
        questionIndex: 0,
        totalQuestions: data.state?.totalQuestions ?? 0,
        leaderboard: [],  // Reset leaderboard for new game
        correctAnswerId: null,
        hasAnswered: false,
        selectedAnswerId: null,
        countdown: data.state?.countdown ?? 5,
        isHost: state.isHost,
        myPlayerId: state.myPlayerId,
        myNickname: state.myNickname,
        roomId: state.roomId,
        _fromPlayAgain: true,
        _timestamp: Date.now(),
      }));

      // Update sessionStorage identity keys for remount detection
      if (state.isHost) {
        sessionStorage.setItem('hostSessionId', resolvedNewSessionId);
      } else {
        sessionStorage.setItem('playerSessionId', resolvedNewSessionId);
      }

      // Navigate to new session — router.replace triggers page remount
      const redirectUrl = data.url || `/game/${resolvedNewSessionId}`;
      console.log('[GamePage] Navigating to new session:', redirectUrl);
      router.replace(redirectUrl);
    };

    // Alias for backward compat (backend used to emit session_started separately)
    const handleSessionStarted = handleSessionTransition;
    const handleSessionSwitched = handleSessionTransition;

    // Handle player joined - update leaderboard with new player
    const handlePlayerJoined = (data: { playerId: string; nickname: string; timestamp: number }) => {
      console.log('[GamePage] player_joined:', data);

      const state = useGameStore.getState();

      // Add new player to leaderboard if not exists, or update connection
      if (Array.isArray(state.leaderboard)) {
        const existingEntry = state.leaderboard.find(e => e.playerId === data.playerId);
        if (!existingEntry) {
          // New player - will be added when leaderboard_update comes
          console.log('[GamePage] New player joined, waiting for leaderboard_update');
        } else {
          // Player reconnecting - update connection status
          const updatedLeaderboard = state.leaderboard.map((entry) => {
            if (entry?.playerId === data.playerId) {
              return { ...entry, connection: 'CONNECTED' as const };
            }
            return entry;
          });
          useGameStore.setState({ leaderboard: updatedLeaderboard });
        }
      }

      // Toast handled by backend
    };

    // Handle player answer - immediate UI update for host
    // Updates hasAnswered status as soon as player submits, before leaderboard_update
    const handlePlayerAnswered = (data: { sessionId: string; playerId: string; questionId: string; hasAnswered: boolean; answeredAt: number }) => {
      console.log('[GamePage] player_answered:', data);

      const state = useGameStore.getState();

      // Immediately update hasAnswered in leaderboard (optimistic update)
      if (Array.isArray(state.leaderboard)) {
        const updatedLeaderboard = state.leaderboard.map((entry) => {
          if (entry?.playerId === data.playerId) {
            return { ...entry, hasAnswered: data.hasAnswered };
          }
          return entry;
        });
        useGameStore.setState({ leaderboard: updatedLeaderboard });
      }

      // No toast for answer - just silent UI update
    };

    // Handle player connection status changes
    // NOTE: player_status only updates connection state, NO toasts for reload/reconnect
    // Toast for join/leave comes from player_joined/player_left events only
    const handlePlayerStatus = (data: { playerId: string; nickname: string; connection: 'CONNECTED' | 'DISCONNECTED'; isHost: boolean; timestamp: number }) => {
      console.log('[GamePage] player_status:', data);

      const state = useGameStore.getState();

      // Update player status in store
      state.setPlayerStatus({
        playerId: data.playerId,
        nickname: data.nickname,
        connection: data.connection,
        isHost: data.isHost,
        lastSeen: data.timestamp,
      });

      // FIX: Also update leaderboard entry with connection status
      if (Array.isArray(state.leaderboard)) {
        const updatedLeaderboard = state.leaderboard.map((entry) => {
          if (entry?.playerId === data.playerId) {
            return { ...entry, connection: data.connection as 'CONNECTED' | 'DISCONNECTED' };
          }
          return entry;
        });
        useGameStore.setState({ leaderboard: updatedLeaderboard });
      }

      // NO toasts here - connection status updates silently
      // Toast for actual join/leave is handled by player_joined/player_left events
    };

    const handlePlayerLeft = (data: { playerId: string; nickname: string; timestamp: number }) => {
      console.log('[GamePage] player_left:', data);

      if (!data) {
        console.error('[GamePage] player_left: Invalid payload - data is null/undefined');
        return;
      }
      if (!data.playerId) {
        console.error('[GamePage] player_left: Invalid payload - missing playerId', data);
        return;
      }

      const state = useGameStore.getState();

      // Defensive: ensure leaderboard is an array before filtering
      if (!Array.isArray(state.leaderboard)) {
        console.warn('[GamePage] player_left: leaderboard is not an array, resetting to empty array');
        useGameStore.setState({ leaderboard: [] });
        return;
      }

      // FIX: Update player connection to LEFT instead of removing from leaderboard
      const newLeaderboard = state.leaderboard.map((entry) => {
        if (entry?.playerId === data.playerId) {
          return { ...entry, connection: 'LEFT' as const };
        }
        return entry;
      });

      useGameStore.setState({ leaderboard: newLeaderboard });

      if (data.playerId === state.myPlayerId) {
        toast.error('Bạn đã rời phòng');
      } else if (data.nickname) {
        toast.info(`${data.nickname} đã rời phòng`);
      }
    };

    const handleScoreUpdate = (data: any) => {
      const state = useGameStore.getState();

      console.log('[GamePage] score_update received:', {
        myPlayerId: state.myPlayerId,
        gameStatus: state.gameStatus,
        hasAnswered: state.hasAnswered,
        dataHasLeaderboard: !!data?.leaderboard,
      });

      // DEBUG: Validate payload
      if (!data) {
        console.error('[GamePage] score_update: Invalid payload');
        return;
      }

      if (state._isRecovering) {
        console.log('[GamePage] Skipping score_update due to HTTP recovery in progress');
        return;
      }

      // Skip for non-host players during QUESTION_ACTIVE (anti-cheat)
      if (state.gameStatus === GameState.QUESTION_ACTIVE && !state.isHost) {
        console.log('[GamePage] Skipping score_update during QUESTION_ACTIVE for non-host');
        return;
      }

      // Only non-host players need to have answered
      if (!state.isHost && !state.hasAnswered) {
        console.log('[GamePage] Skipping score_update: player has not answered this question');
        return;
      }

      // Defensive: ensure leaderboard is an array
      if (Array.isArray(data.leaderboard)) {
        useGameStore.setState({ leaderboard: data.leaderboard });
        if (state.myPlayerId) {
          const myEntry = data.leaderboard.find(
            (e: any) => e?.playerId === state.myPlayerId
          );
          if (myEntry) {
            console.log('[GamePage] Updating myScore:', myEntry.score, 'rank:', myEntry.rank);
            useGameStore.setState({ myScore: myEntry.score, myRank: myEntry.rank });
          }
        }
      } else {
        console.warn('[GamePage] score_update: leaderboard is not an array, ignoring');
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

    // Handle leaderboard_update event - merges with existing leaderboard preserving connection/hasAnswered
    const handleLeaderboardUpdate = (data: { leaderboard: any[]; sessionId?: string }) => {
      if (!data?.leaderboard || !Array.isArray(data.leaderboard)) {
        return;
      }

      // CRITICAL: Validate sessionId matches current session
      // This prevents old session leaderboard data from overriding new session
      const currentSessionId = useGameStore.getState().sessionId;
      const incomingSessionId = data.sessionId;
      console.log('[GamePage] leaderboard_update:', {
        incomingSessionId,
        currentSessionId,
        leaderboardLength: data.leaderboard?.length
      });
      if (incomingSessionId && incomingSessionId !== currentSessionId) {
        console.warn('[GamePage] leaderboard_update: sessionId mismatch, ignoring', {
          incoming: incomingSessionId,
          current: currentSessionId
        });
        return;
      }

      const state = useGameStore.getState();
      const existingMap = new Map(
        (state.leaderboard || []).map((e: any) => [e.playerId, e])
      );

      const mergedLeaderboard = data.leaderboard.map((entry: any) => {
        const existing = existingMap.get(entry.playerId);
        return {
          ...entry,
          connection: entry.connection || existing?.connection || 'DISCONNECTED',
          hasAnswered: entry.hasAnswered ?? existing?.hasAnswered ?? false,
        };
      });

      console.log('[GamePage] leaderboard_update: setting leaderboard with', mergedLeaderboard.length, 'entries, first entry score:', mergedLeaderboard[0]?.score);
      useGameStore.setState({ leaderboard: mergedLeaderboard });
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
    socket.on('session_started', handleSessionTransition);
    socket.on('session_switched', handleSessionTransition);
    socket.on('player_left', handlePlayerLeft);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('player_answered', handlePlayerAnswered);
    socket.on('player_status', handlePlayerStatus);
    socket.on('leaderboard_update', handleLeaderboardUpdate);

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
      socket.off('session_started', handleSessionTransition);
      socket.off('session_switched', handleSessionTransition);
      socket.off('player_left', handlePlayerLeft);
      socket.off('player_joined', handlePlayerJoined);
      socket.off('player_answered', handlePlayerAnswered);
      socket.off('player_status', handlePlayerStatus);
      socket.off('leaderboard_update', handleLeaderboardUpdate);
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

    // CRITICAL: Reset game store for new session
    // This ensures complete cleanup when navigating to a new game session
    console.log('[GamePage] New session detected, resetting store for:', sessionId);
    useGameStore.getState().reset();
    console.log('[GamePage] After reset, store state:', {
      leaderboard: useGameStore.getState().leaderboard,
      myScore: useGameStore.getState().myScore,
      myRank: useGameStore.getState().myRank
    });

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

    // Check for redirect state FIRST (from previous redirect via router.replace)
    const checkRedirectState = (): boolean => {
      const redirectStateStr = sessionStorage.getItem('redirectState');
      if (!redirectStateStr) return false;
      
      try {
        const redirectState = JSON.parse(redirectStateStr);
        if (redirectState.sessionId === sessionId && redirectState.reason === 'finished_redirect' &&
            (Date.now() - redirectState._timestamp) < 30000) {
          console.log('[GamePage] Using redirect state:', redirectState);
          sessionStorage.removeItem('redirectState');
          
          // Hydrate from redirect state
          useGameStore.setState({
            sessionId,
            roomId: redirectState.state?.roomId || storedRoomId,
            gameStatus: GameState.FINISHED,
            leaderboard: redirectState.state?.leaderboard || [],
            currentQuestion: null,
            _isRecovering: false,
          });
          
          // Connect socket and emit join_game
          connectGameSocket(accessToken ?? undefined);
          const socket = getGameSocket();
          
          console.log('[GamePage] redirect recovery: socket.id=', socket.id, 'sessionId=', sessionId, 'reason=finished_redirect');
          
          if (socket.connected) {
            useGameStore.setState({ socket });
            socket.emit('join_game', { sessionId, playerId: storedPlayerId, nickname: storedNickname }, (joinRes: any) => {
              console.log('[GamePage] join_game response:', joinRes);
            });
          } else {
            socket.on('connect', () => {
              useGameStore.setState({ socket });
              socket.emit('join_game', { sessionId, playerId: storedPlayerId, nickname: storedNickname }, (joinRes: any) => {
                console.log('[GamePage] join_game response:', joinRes);
              });
            });
          }
          
          setIsJoining(false);
          return true;
        } else {
          sessionStorage.removeItem('redirectState');
          return false;
        }
      } catch (e) {
        sessionStorage.removeItem('redirectState');
        return false;
      }
    };

    // If redirect state exists, skip normal HTTP fetch
    if (checkRedirectState()) {
      return;
    }

    // --- playAgainState recovery (skip HTTP fetch) ---
    // After session_transition navigates via router.replace, the page remounts.
    // The remounted useEffect checks for valid playAgainState and hydrates
    // directly from sessionStorage without an HTTP fetch.
    const storedPlayAgain = sessionStorage.getItem('playAgainState');
    if (storedPlayAgain) {
      try {
        const playAgain = JSON.parse(storedPlayAgain);
        const age = Date.now() - (playAgain._timestamp || 0);

        // Only consume if it's for this sessionId and not stale (15s window)
        if (playAgain.sessionId === sessionId && age < 15000) {
          console.log('[GamePage] Recovering from playAgainState:', playAgain);

          useGameStore.setState({
            sessionId: playAgain.sessionId,
            roomId: playAgain.roomId || null,
            gameStatus: GameState.STARTING,
            isHost: playAgain.isHost,
            myPlayerId: playAgain.myPlayerId,
            myNickname: playAgain.myNickname,
            currentQuestion: null,
            questionIndex: 0,
            totalQuestions: playAgain.totalQuestions || 0,
            leaderboard: playAgain.leaderboard || [],
            correctAnswerId: null,
            hasAnswered: false,
            selectedAnswerId: null,
            countdown: playAgain.countdown ?? 5,
            myScore: 0,      // Reset for new game
            myRank: null,    // Reset for new game
            _isRecovering: false,
          });

          // Connect socket and emit join_game (host → host_join_game, player → join_game)
          connectGameSocket(accessToken ?? undefined);
          const socket = getGameSocket();

          if (socket.connected) {
            useGameStore.setState({ socket });
            if (playAgain.isHost) {
              socket.emit('host_join_game', { sessionId, jwt: accessToken }, (res: any) => {
                console.log('[GamePage] playAgainState: host_join_game response:', res);
              });
            } else {
              socket.emit('join_game', {
                sessionId,
                playerId: playAgain.myPlayerId,
                nickname: playAgain.myNickname,
              }, (res: any) => {
                console.log('[GamePage] playAgainState: join_game response:', res);
              });
            }
          } else {
            socket.on('connect', () => {
              useGameStore.setState({ socket });
              if (playAgain.isHost) {
                socket.emit('host_join_game', { sessionId, jwt: accessToken }, (res: any) => {
                  console.log('[GamePage] playAgainState: host_join_game response:', res);
                });
              } else {
                socket.emit('join_game', {
                  sessionId,
                  playerId: playAgain.myPlayerId,
                  nickname: playAgain.myNickname,
                }, (res: any) => {
                  console.log('[GamePage] playAgainState: join_game response:', res);
                });
              }
            });
          }

          // Clean up after consuming
          sessionStorage.removeItem('playAgainState');

          setIsJoining(false);
          return;
        } else {
          // Stale or wrong session — clear it
          sessionStorage.removeItem('playAgainState');
        }
      } catch (e) {
        sessionStorage.removeItem('playAgainState');
      }
    }
    // --- end playAgainState recovery ---

    let httpData: any = null;

    const recoverState = async () => {
      useGameStore.setState({ _isRecovering: true });

      try {
        const response = await apiClient.get(`/games/${sessionId}/state`);
        httpData = response.data;
        console.log('[GamePage] HTTP state recovered:', httpData);

        // CRITICAL: If session is FINISHED, redirect immediately BEFORE setting any state
        // This prevents flash of old FINISHED state on page reload after host_play_again
        if (httpData.status === 'FINISHED' && httpData.currentSessionId) {
          console.log(`[GamePage] Session finished, redirecting to new session ${httpData.currentSessionId}`);
          
          // Store redirect state with full game state for SPA navigation
          sessionStorage.setItem('redirectState', JSON.stringify({
            sessionId: httpData.currentSessionId,
            reason: 'finished_redirect',
            state: {
              status: httpData.status,
              roomId: httpData.roomId,
              leaderboard: httpData.leaderboard || [],
            },
            _timestamp: Date.now(),
          }));
          sessionStorage.setItem('playerSessionId', httpData.currentSessionId);
          
          // Use router.replace for SPA navigation
          router.replace(`/game/${httpData.currentSessionId}`);
          return; // Don't set any state - we're redirecting
        }

        useGameStore.setState({
          currentQuestion: null,
          leaderboard: [],
          countdown: 0,
          correctAnswerId: null,
        });
        console.log('[GamePage] recoverState: set leaderboard=[]');

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
          // DEBUG: Log response
          console.log('[GamePage] host_join_game response:', response);
          
          if (response.success && response.state) {
            console.log('[GamePage] host_join_game success', {
              isActualHost: response.isActualHost,
              isReconnect: response.isReconnect,
              rejoinReason: response.rejoinReason,
            });
            
            const actualIsHost = response.isActualHost;
            const correctAnswerId = response.state.status === 'QUESTION_RESULT' 
              ? (response.state.correctAnswerId || httpData?.correctAnswerId || null)
              : null;
            
            // CRITICAL: If game is WAITING (new game after play_again), reset leaderboard
            // Backend may return leaderboard from old session
            const isNewGame = response.state.status === GameState.WAITING;
            
            // Defensive: ensure leaderboard is an array
            // Only use response leaderboard if game is NOT in WAITING state
            const safeLeaderboard = isNewGame 
              ? []  // Reset leaderboard for new game
              : (Array.isArray(response.state.leaderboard) 
                  ? response.state.leaderboard 
                  : (Array.isArray(httpData?.leaderboard) ? httpData.leaderboard : []));
            
            console.log('[GamePage] host_join_game: isNewGame=', isNewGame, 'leaderboard length=', safeLeaderboard.length);
            
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
              leaderboard: safeLeaderboard,
              timeRemaining: response.state.remainingTime ?? response.state.currentQuestion?.timeLimit ?? 0,
              correctAnswerId,
              myScore: 0,       // Reset for new game session
              myRank: null,     // Reset for new game session
              _isRecovering: false,
            });
            if (!actualIsHost) {
              console.warn('[GamePage] Server rejected host identity - user is NOT the host');
            }
          } else {
            console.error('[GamePage] host_join_game failed:', response?.error);
            const fallbackNickname = storedNickname || authStore.user?.email?.split('@')[0] || `Player_${Date.now() % 1000}`;
            socket.emit('join_game', { sessionId, playerId: storedPlayerId || null, nickname: fallbackNickname }, (playerResponse: any) => {
              // DEBUG: Log player response
              console.log('[GamePage] join_game fallback response:', playerResponse);
              
              if (playerResponse.success && playerResponse.state) {
                // Defensive: ensure leaderboard is an array
                const safeLeaderboard = Array.isArray(playerResponse.state.leaderboard)
                  ? playerResponse.state.leaderboard
                  : (Array.isArray(httpData?.leaderboard) ? httpData.leaderboard : []);
                
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
                  leaderboard: safeLeaderboard,
                  timeRemaining: playerResponse.state.remainingTime ?? playerResponse.state.currentQuestion?.timeLimit ?? 0,
                  myScore: 0,       // Reset for new game session
                  myRank: null,     // Reset for new game session
                  _isRecovering: false,
                });
              } else {
                console.error('[GamePage] join_game fallback also failed');
                useGameStore.setState({ _isRecovering: false });
              }
            });
          }
        });
      } else if (isPlayer && storedPlayerId && storedNickname) {
        console.log('[GamePage] Joining as PLAYER');
        socket.emit('join_game', { sessionId, playerId: storedPlayerId, nickname: storedNickname }, (response: any) => {
          // DEBUG: Log response
          console.log('[GamePage] join_game response:', response);
          
          // CRITICAL: Handle session redirect (player tried to join finished session)
          if (response.needsRedirect && response.redirectToSession) {
            console.log(`[GamePage] Session ${sessionId} is finished, redirecting to new session ${response.redirectToSession}`);
            
            // Store redirect state with full game state for SPA navigation
            sessionStorage.setItem('redirectState', JSON.stringify({
              sessionId: response.redirectToSession,
              reason: 'finished_redirect',
              state: response.state,
              _timestamp: Date.now(),
            }));
            sessionStorage.setItem('playerSessionId', response.redirectToSession);
            
            // Use router.replace for SPA navigation
            router.replace(`/game/${response.redirectToSession}`);
            return;
          }
          
          if (response.success && response.state) {
            console.log('[GamePage] join_game success');
            
            // CRITICAL: If game is WAITING (new game after play_again), reset leaderboard
            // Backend may return leaderboard from old session
            const isNewGame = response.state.status === GameState.WAITING;
            
            // Defensive: ensure leaderboard is an array
            // Only use response leaderboard if game is NOT in WAITING state
            const safeLeaderboard = isNewGame
              ? []
              : (Array.isArray(response.state.leaderboard)
                  ? response.state.leaderboard
                  : (Array.isArray(httpData?.leaderboard) ? httpData.leaderboard : []));
            
            console.log('[GamePage] join_game: isNewGame=', isNewGame, 'leaderboard length=', safeLeaderboard.length);
            
            const myEntry = safeLeaderboard.find((e: any) => e?.playerId === storedPlayerId);
            const showLeaderboard = response.state.status !== GameState.QUESTION_ACTIVE;
            const correctAnswerId = response.state.status === 'QUESTION_RESULT'
              ? (response.state.correctAnswerId || httpData?.correctAnswerId || null)
              : null;
            
            // Get existing leaderboard if showing leaderboard state
            const finalLeaderboard = showLeaderboard ? safeLeaderboard : useGameStore.getState().leaderboard;
            const safeFinalLeaderboard = Array.isArray(finalLeaderboard) ? finalLeaderboard : [];
            
            // CRITICAL: Always reset scores for new game session
            // Do NOT use old myScore/myRank from store
            const myEntryFromFinal = safeFinalLeaderboard.find((e: any) => e?.playerId === storedPlayerId);
            
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
              leaderboard: safeFinalLeaderboard,
              timeRemaining: response.state.remainingTime ?? response.state.currentQuestion?.timeLimit ?? 0,
              correctAnswerId,
              // Reset scores - get from leaderboard or default to 0
              // Do NOT fallback to old store values
              myScore: myEntryFromFinal?.score ?? 0,
              myRank: myEntryFromFinal?.rank ?? null,
              _isRecovering: false,
            });
          } else {
            console.error('[GamePage] join_game failed:', response?.error);
            useGameStore.setState({ _isRecovering: false });
          }
        });
      } else {
        console.log('[GamePage] No stored credentials, using HTTP state only');
        useGameStore.setState({ _isRecovering: false });
      }
    };

    const initGame = async () => {
      const socket = getGameSocket();
      
      if (!socket.connected) {
        console.log('[GamePage] Connecting socket with auth token...');
        if (accessToken) {
          connectGameSocket(accessToken ?? undefined);
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

  // Server-driven timer: recalculate from questionStartTime + serverTime instead of local countdown
  // This ensures host and player timers stay in sync
  useEffect(() => {
    if (gameStatus === GameState.QUESTION_ACTIVE && currentQuestion && questionStartTime) {
      const calculateRemaining = () => {
        const serverTime = useGameStore.getState().serverTime || questionStartTime;
        const timeLimit = currentQuestion.timeLimit || 20;
        const elapsedMs = Date.now() - questionStartTime;
        const elapsedSec = Math.floor(elapsedMs / 1000);
        return Math.max(0, timeLimit - elapsedSec);
      };

      setLocalTimeRemaining(calculateRemaining());
      const interval = setInterval(() => {
        const remaining = calculateRemaining();
        setLocalTimeRemaining(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    } else if (gameStatus !== GameState.QUESTION_ACTIVE) {
      setLocalTimeRemaining(0);
    }
  }, [gameStatus, currentQuestion, questionStartTime]);

  const handleNextQuestion = () => {
    const gameStore = useGameStore.getState();
    // FIX: Dùng sessionId từ store (đáng tin cậy) thay vì từ params (có thể stale sau router.replace)
    const currentSessionId = gameStore.sessionId || sessionId;
    if (!gameStore.socket || !currentSessionId) return;

    if (!gameStore.isHost) {
      console.warn('[GamePage] handleNextQuestion called by non-host, ignoring');
      return;
    }

    console.log('[GamePage] handleNextQuestion: params.sessionId=', sessionId, ', store.sessionId=', gameStore.sessionId, ', emit sessionId=', currentSessionId);

    gameStore.socket.emit('host_next_question', { sessionId: currentSessionId }, (response: any) => {
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

  const handlePlayAgain = () => {
    const gameStore = useGameStore.getState();
    const { sessionId: sid, roomId: rid, socket } = gameStore;
    if (!sid || !rid || !socket) return;
    
    // Emit play_again — backend will emit session_switched to this socket too.
    // The session_switched handler stores state + navigates via router.replace.
    socket.emit('host_play_again', { sessionId: sid, roomId: rid }, (response: any) => {
      if (!response.success) {
        toast.error(response.error || 'Không thể chơi lại');
      }
      // No store update here — session_transition handler handles everything.
      // If response has new sessionId it's just for logging/debug.
    });
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
              {effectiveIsHost ? 'Đợi người chơi tham gia' : 'Chờ host bắt đầu game'}
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
        {/* Player count for non-host players */}
        {!effectiveIsHost && (
          <div className="max-w-4xl mx-auto mb-4">
            <Card className="bg-white border-4 border-black shadow-brutal">
              <CardContent className="py-3 px-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-black/50" />
                <span className="font-bold text-black/70">
                  {activePlayerCount} người đang chơi
                </span>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Host Player List Panel with Pagination */}
        {effectiveIsHost && (
          <div className="max-w-6xl mx-auto mb-4">
            <Card className="bg-white border-4 border-black shadow-brutal">
              <CardHeader className="bg-neon-green border-b-4 border-black pb-3">
                <div className="flex justify-between items-center gap-4">
                  <CardTitle className="text-xl font-black text-black">Người chơi ({hostPlayerTotalItems})</CardTitle>
                  <span className="text-sm font-bold text-black/70">
                    {leaderboard.filter(e => e.connection !== 'LEFT').length} active
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-3">
                {/* Pagination controls */}
                {hostPlayerShouldShowPagination && (
                  <div className="mb-3">
                    <PaginationControls
                      page={hostPlayerPage}
                      totalPages={hostPlayerTotalPages}
                      totalItems={hostPlayerTotalItems}
                      startIndex={hostPlayerStartIndex}
                      endIndex={hostPlayerEndIndex}
                      onPrev={hostPlayerPrevPage}
                      onNext={hostPlayerNextPage}
                    />
                  </div>
                )}
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {paginatedHostPlayers.map((entry) => (
                    <div key={entry.playerId} className="flex items-center justify-between p-2 bg-gray-100 rounded-lg border-2 border-black">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-black/50 w-6">#{entry.rank}</span>
                        <span className="font-bold text-black">{entry.nickname}</span>
                        <span className={`
                          text-xs font-bold px-2 py-0.5 rounded border
                          ${entry.connection === 'CONNECTED' ? 'bg-green-400 text-black border-black' : ''}
                          ${entry.connection === 'LEFT' ? 'bg-gray-400 text-black border-black line-through' : ''}
                          ${entry.connection === 'DISCONNECTED' ? 'bg-orange-400 text-black border-black' : ''}
                          ${!entry.connection ? 'bg-gray-300 text-black border-black' : ''}
                        `}>
                          {entry.connection === 'CONNECTED' ? 'Online' : entry.connection === 'LEFT' ? 'Đã rời' : entry.connection === 'DISCONNECTED' ? 'Mất kết nối' : 'Offline'}
                        </span>
                        <span className={`
                          text-xs font-bold px-2 py-0.5 rounded border
                          ${entry.hasAnswered ? 'bg-neon-green text-black border-black' : 'bg-gray-300 text-black border-black'}
                        `}>
                          {entry.hasAnswered ? 'Đã trả lời' : 'Chưa trả lời'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {leaderboard.length === 0 && (
                    <p className="text-center text-black/50 font-bold">Chưa có người chơi</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className={effectiveIsHost ? 'max-w-3xl mx-auto' : 'max-w-4xl mx-auto'}>
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
                  onClick={() => !effectiveIsHost && handleSubmitAnswer(answer.id)}
                  disabled={hasAnswered || effectiveIsHost}
                  className={`
                    ${color.bg} border-4 border-black
                    text-white text-xl py-10 px-6
                    font-black uppercase
                    shadow-brutal
                    transition-all duration-150
                    ${!effectiveIsHost && !hasAnswered ? `${color.hover} hover:-translate-y-1 hover:shadow-brutal-lg cursor-pointer` : ''}
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
          {effectiveIsHost ? (
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
                  const isSelected = !effectiveIsHost && answer.id === selectedAnswerId;
                  
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
          {!effectiveIsHost && (
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
          {effectiveIsHost && (
            <Card className="mb-6 bg-white border-4 border-black shadow-brutal">
              <CardHeader className="bg-neon-yellow border-b-4 border-black pb-4">
                <CardTitle className="text-xl font-black uppercase flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-black" />
                  Bảng xếp hạng ({leaderboardTotalItems})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Pagination controls */}
                {leaderboardShouldShowPagination && (
                  <div className="mb-4">
                    <PaginationControls
                      page={leaderboardPage}
                      totalPages={leaderboardTotalPages}
                      totalItems={leaderboardTotalItems}
                      startIndex={leaderboardStartIndex}
                      endIndex={leaderboardEndIndex}
                      onPrev={leaderboardPrevPage}
                      onNext={leaderboardNextPage}
                    />
                  </div>
                )}
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {paginatedLeaderboard.map((entry, idx) => (
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
                        <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-black">{entry.nickname}</span>
                        <span className={`
                          text-xs font-bold px-2 py-0.5 rounded border-2 border-black
                          ${entry.connection === 'CONNECTED' ? 'bg-green-400 text-black' : ''}
                          ${entry.connection === 'LEFT' ? 'bg-gray-400 text-black line-through' : ''}
                          ${entry.connection === 'DISCONNECTED' ? 'bg-orange-400 text-black' : ''}
                          ${!entry.connection ? 'bg-gray-300 text-black' : ''}
                        `}>
                          {entry.connection === 'CONNECTED' ? 'Online' : entry.connection === 'LEFT' ? 'Đã rời' : entry.connection === 'DISCONNECTED' ? 'Mất kết nối' : 'Offline'}
                        </span>
                      </div>
                      </div>
                      {/* <span className="font-black text-xl text-black">{entry.score} pts</span> */}
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
          {effectiveIsHost && !isLastQuestion && (
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
          {!effectiveIsHost && (
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
          {effectiveIsHost && (
            <Card className="mb-6 bg-white border-4 border-black shadow-brutal-xl">
              <CardHeader className="bg-neon-green border-b-4 border-black pb-4">
                <CardTitle className="text-xl font-black uppercase flex items-center gap-2">
                  <Crown className="w-6 h-6 text-black" />
                  Bảng xếp hạng ({leaderboardTotalItems})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Pagination controls */}
                {leaderboardShouldShowPagination && (
                  <div className="mb-4">
                    <PaginationControls
                      page={leaderboardPage}
                      totalPages={leaderboardTotalPages}
                      totalItems={leaderboardTotalItems}
                      startIndex={leaderboardStartIndex}
                      endIndex={leaderboardEndIndex}
                      onPrev={leaderboardPrevPage}
                      onNext={leaderboardNextPage}
                    />
                  </div>
                )}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {paginatedLeaderboard.map((entry, idx) => (
                    <div key={entry.playerId} className={`
                      flex justify-between items-center p-4 rounded-xl border-4 border-black
                      ${entry.rank === 1 ? 'bg-neon-yellow shadow-brutal' : entry.rank === 2 ? 'bg-gray-300 shadow-brutal-sm' : entry.rank === 3 ? 'bg-orange-400 shadow-brutal-sm' : 'bg-white shadow-brutal-sm'}
                    `}>
                      <div className="flex items-center gap-3">
                        <span className={`w-12 h-12 rounded-xl border-4 border-black flex items-center justify-center text-2xl ${
                          entry.rank === 1 ? 'bg-black text-neon-yellow' : entry.rank === 2 ? 'bg-black text-gray-300' : entry.rank === 3 ? 'bg-black text-orange-400' : 'bg-black/20 text-black'
                        }`}>
                          {entry.rank === 1 ? '👑' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                        </span>
                        <span className="font-black text-xl text-black">{entry.nickname}</span>
                        <span className={`
                          text-xs font-bold px-2 py-0.5 rounded border-2 border-black
                          ${entry.connection === 'CONNECTED' ? 'bg-green-400 text-black' : ''}
                          ${entry.connection === 'LEFT' ? 'bg-gray-400 text-black line-through' : ''}
                          ${entry.connection === 'DISCONNECTED' ? 'bg-orange-400 text-black' : ''}
                          ${!entry.connection ? 'bg-gray-300 text-black' : ''}
                        `}>
                          {entry.connection === 'CONNECTED' ? 'Online' : entry.connection === 'LEFT' ? 'Đã rời' : entry.connection === 'DISCONNECTED' ? 'Mất kết nối' : 'Offline'}
                        </span>
                      </div>
                      <span className="font-black text-2xl text-black">{entry.score} pts</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          {effectiveIsHost ? (
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
