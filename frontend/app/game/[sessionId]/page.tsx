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
import { HostGameView, PlayerGameView } from '@/components/game/game';

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
    myPlayerId,
    countdown,
    correctAnswerId,
    timeRemaining,
    questionStartTime,
    questionEndTime,
    serverTime,
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
  const [isPlayAgainLoading, setIsPlayAgainLoading] = useState(false);

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
      console.log('[GamePage] ========================================');
      console.log('[GamePage] question_start event received');
      console.log('[GamePage] question_start: current url sessionId=', sessionId);
      console.log('[GamePage] question_start: event data:', {
        sessionId: data.sessionId,
        questionIndex: data.questionIndex,
        questionContent: data.question?.content?.substring(0, 50),
        totalQuestions: data.totalQuestions,
        timeLimit: data.timeLimit,
        serverTime: data.serverTime,
        questionStartTime: data.questionStartTime,
        questionEndTime: data.questionEndTime,
      });
      console.log('[GamePage] ========================================');
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

      // Client-End-Time Architecture:
      // - questionEndTime is an absolute timestamp from server
      // - Timer interval calculates: remaining = questionEndTime - Date.now()
      // - This ensures perfect sync between host and players regardless of latency

      // Initial timeRemaining calculation (for display)
      const initialRemaining = data.questionEndTime 
        ? Math.max(0, Math.floor((data.questionEndTime - Date.now()) / 1000))
        : (data.timeLimit || 20);

      console.log(`[GamePage] question_start: questionEndTime=${data.questionEndTime}, initialRemaining=${initialRemaining}s`);

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

      // Store timer state - questionEndTime is the single source of truth
      useGameStore.setState({
        timeRemaining: initialRemaining,
        questionStartTime: data.questionStartTime,
        questionEndTime: data.questionEndTime,
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

      // Skip stale events - only process current question
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

      // Always update myScore/myRank from server leaderboard - it's the source of truth
      // No need to check hasAnswered since server already calculated correct score
      if (state.myPlayerId && safeLeaderboard.length > 0) {
        const myEntry = safeLeaderboard.find((e: any) => e?.playerId === state.myPlayerId);
        if (myEntry) {
          useGameStore.setState({
            myScore: myEntry.score,
            myRank: myEntry.rank,
          });
          console.log('[GamePage] question_result: Updated myScore:', myEntry.score, 'myRank:', myEntry.rank);
        }
      }
    };

    const handleGameEnded = (data: any) => {
      console.log('[GamePage] ========================================');
      console.log('[GamePage] game_ended event received:', data);
      console.log('[GamePage] game_ended: current url sessionId=', sessionId);
      console.log('[GamePage] game_ended: store sessionId=', useGameStore.getState().sessionId);
      console.log('[GamePage] game_ended: leaderboard length=', data.leaderboard?.length);
      console.log('[GamePage] ========================================');
      
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
      console.log('[GamePage] session_closed received:', data);
      console.log('[GamePage] session_closed: incoming sessionId=', data.sessionId, 'current url sessionId=', sessionId);
      
      // === GUARD: Chỉ xử lý nếu sessionId khớp ===
      const currentSessionId = sessionId || useGameStore.getState().sessionId;
      if (data.sessionId !== currentSessionId) {
        console.warn('[GamePage] ⚠️ STALE session_closed ignored! incoming=', data.sessionId, 'current=', currentSessionId);
        return;
      }
      
      const storedHostSessionId = sessionStorage.getItem('hostSessionId');
      const isHostSession = storedHostSessionId === data.sessionId;
      console.log('[GamePage] session_closed: isHostSession=', isHostSession, 'reason=', data.reason);

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

      console.log('[GamePage] ========================================');
      console.log(`[GamePage] session_transition received:`);
      console.log(`  resolvedNewSessionId=${resolvedNewSessionId}`);
      console.log(`  resolvedOldSessionId=${resolvedOldSessionId}`);
      console.log(`  current url sessionId=${sessionId}`);
      console.log(`  event timestamp=${data.timestamp}`);
      console.log(`  data.state.status=${data.state?.status}`);
      console.log('[GamePage] ========================================');

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

      // Defensive: ensure leaderboard is an array
      if (Array.isArray(data.leaderboard)) {
        useGameStore.setState({ leaderboard: data.leaderboard });

        // Always update myScore/myRank from server leaderboard - it's the source of truth
        if (state.myPlayerId) {
          const myEntry = data.leaderboard.find(
            (e: any) => e?.playerId === state.myPlayerId
          );
          if (myEntry) {
            console.log('[GamePage] score_update: Updating myScore:', myEntry.score, 'myRank:', myEntry.rank);
            useGameStore.setState({ myScore: myEntry.score, myRank: myEntry.rank });
          }
        }
      } else {
        console.warn('[GamePage] score_update: leaderboard is not an array, ignoring');
      }
    };

    const handleGameRedirect = (data: { url: string; sessionId: string }) => {
      console.log('[GamePage] ========================================');
      console.log('[GamePage] game_redirect received:', data);
      console.log('[GamePage] game_redirect: current url sessionId=', sessionId);
      console.log('[GamePage] game_redirect: redirecting to=', data.url, 'redirect sessionId=', data.sessionId);
      if (data.sessionId !== sessionId) {
        console.log('[GamePage] game_redirect: ⚠️ Session mismatch, will redirect!');
        useGameStore.setState({ _pendingRedirect: data.url });
      } else {
        console.log('[GamePage] game_redirect: Same session, no redirect needed');
      }
      console.log('[GamePage] ========================================');
    };

    const handleRoomClosed = (data: { reason: string }) => {
      console.log('[GamePage] room_closed received:', data);
      console.log('[GamePage] room_closed: current url sessionId=', sessionId, 'store sessionId=', useGameStore.getState().sessionId);
      const storedHostSessionId = sessionStorage.getItem('hostSessionId');
      const isHostSession = storedHostSessionId === sessionId;
      console.log('[GamePage] room_closed: isHostSession=', isHostSession);

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
    
    // Normalize sessionId to handle potential whitespace/case issues
    const normalizedSessionId = sessionId?.trim();
    const normalizedHostSessionId = storedHostSessionId?.trim();
    
    const isHostFromStorage = normalizedHostSessionId === normalizedSessionId;
    const isPlayer = !isHostFromStorage && !!storedPlayerId && !!storedNickname;
    
    // CRITICAL DEBUG: Log all values for host identity detection
    console.log('[GamePage] === IDENTITY DEBUG ===');
    console.log(`  sessionId (url) = "${sessionId}"`);
    console.log(`  storedHostSessionId = "${storedHostSessionId}"`);
    console.log(`  normalizedSessionId = "${normalizedSessionId}"`);
    console.log(`  normalizedHostSessionId = "${normalizedHostSessionId}"`);
    console.log(`  storedPlayerId = "${storedPlayerId}"`);
    console.log(`  storedNickname = "${storedNickname}"`);
    console.log(`  isHostFromStorage = ${isHostFromStorage} (normalizedHostSessionId === normalizedSessionId)`);
    console.log(`  isPlayer = ${isPlayer}`);
    console.log(`  accessToken exists = ${!!accessToken}`);
    console.log('[GamePage] ======================');

    // Check for redirect state FIRST (from previous redirect via router.replace)
    const checkRedirectState = (): boolean => {
      const redirectStateStr = sessionStorage.getItem('redirectState');
      if (!redirectStateStr) return false;
      
      // Check if we've already processed this redirect (prevent double processing)
      const processedKey = `redirectProcessed:${sessionId}`;
      if (sessionStorage.getItem(processedKey)) {
        // Already processed, remove both and continue normally
        sessionStorage.removeItem('redirectState');
        sessionStorage.removeItem(processedKey);
        return false;
      }
      
      try {
        const redirectState = JSON.parse(redirectStateStr);
        if (redirectState.sessionId === sessionId && redirectState.reason === 'finished_redirect' &&
            (Date.now() - redirectState._timestamp) < 30000) {
          console.log('[GamePage] Using redirect state:', redirectState);
          
          // Mark as processed BEFORE navigating
          sessionStorage.setItem(processedKey, '1');
          
          // Hydrate from redirect state - explicitly set isHost
          const isHostRedirect = storedHostSessionId === sessionId;
          console.log('[GamePage] redirect recovery: isHostRedirect=', isHostRedirect);
          
          useGameStore.setState({
            sessionId,
            roomId: redirectState.state?.roomId || storedRoomId,
            gameStatus: GameState.FINISHED,
            isHost: isHostRedirect,  // Set isHost based on storage
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
            if (isHostRedirect && accessToken) {
              console.log('[GamePage] redirect recovery: calling host_join_game (host detected)');
              socket.emit('host_join_game', { sessionId, jwt: accessToken }, (joinRes: any) => {
                console.log('[GamePage] redirect recovery: host_join_game response:', joinRes);
                
                // CRITICAL: Update game state from response
                if (joinRes.success && joinRes.state) {
                  const { state } = joinRes;
                  useGameStore.setState({
                    gameStatus: state.status === 'QUESTION_RESULT' 
                      ? GameState.QUESTION_RESULT 
                      : state.status === 'QUESTION_ACTIVE'
                        ? GameState.QUESTION_ACTIVE
                        : state.status === 'WAITING'
                          ? GameState.WAITING
                          : state.status === 'STARTING'
                            ? GameState.STARTING
                            : state.status === 'FINISHED'
                              ? GameState.FINISHED
                              : GameState.WAITING,
                    leaderboard: state.leaderboard || [],
                    questionIndex: state.questionIndex ?? 0,
                    totalQuestions: state.totalQuestions ?? 0,
                    currentQuestion: state.currentQuestion || null,
                    correctAnswerId: state.correctAnswerId || null,
                    timeRemaining: state.remainingTime ?? 0,
                    questionStartTime: state.questionStartedAt ? state.questionStartedAt : undefined,
                    isHost: joinRes.isActualHost ?? true,
                  });
                }
                
                // Clear redirect state after successful processing
                sessionStorage.removeItem('redirectState');
                sessionStorage.removeItem(processedKey);
                setIsJoining(false);
              });
            } else {
              console.log('[GamePage] redirect recovery: calling join_game (player detected)');
              socket.emit('join_game', { sessionId, playerId: storedPlayerId, nickname: storedNickname }, (joinRes: any) => {
                console.log('[GamePage] redirect recovery: join_game response:', joinRes);
                
                // CRITICAL: Update game state from response
                if (joinRes.success && joinRes.state) {
                  const { state } = joinRes;
                  useGameStore.setState({
                    gameStatus: state.status === 'QUESTION_RESULT' 
                      ? GameState.QUESTION_RESULT 
                      : state.status === 'QUESTION_ACTIVE'
                        ? GameState.QUESTION_ACTIVE
                        : state.status === 'WAITING'
                          ? GameState.WAITING
                          : state.status === 'STARTING'
                            ? GameState.STARTING
                            : state.status === 'FINISHED'
                              ? GameState.FINISHED
                              : GameState.WAITING,
                    leaderboard: state.leaderboard || [],
                    questionIndex: state.questionIndex ?? 0,
                    totalQuestions: state.totalQuestions ?? 0,
                    currentQuestion: state.currentQuestion || null,
                    correctAnswerId: state.correctAnswerId || null,
                    timeRemaining: state.remainingTime ?? 0,
                    questionStartTime: state.questionStartedAt ? state.questionStartedAt : undefined,
                    myPlayerId: joinRes.playerId,
                    myNickname: joinRes.nickname,
                    myScore: joinRes.score ?? 0,
                    myRank: joinRes.rank ?? null,
                    hasAnswered: joinRes.hasAnswered ?? false,
                    selectedAnswerId: joinRes.selectedAnswerId ?? null,
                  });
                }
                
                // Clear redirect state after successful processing
                sessionStorage.removeItem('redirectState');
                sessionStorage.removeItem(processedKey);
                setIsJoining(false);
              });
            }
          } else {
            socket.on('connect', () => {
              useGameStore.setState({ socket });
              if (isHostRedirect && accessToken) {
                console.log('[GamePage] redirect recovery (connect): calling host_join_game (host detected)');
                socket.emit('host_join_game', { sessionId, jwt: accessToken }, (joinRes: any) => {
                  console.log('[GamePage] redirect recovery (connect): host_join_game response:', joinRes);
                  
                  // CRITICAL: Update game state from response
                  if (joinRes.success && joinRes.state) {
                    const { state } = joinRes;
                    useGameStore.setState({
                      gameStatus: state.status === 'QUESTION_RESULT' 
                        ? GameState.QUESTION_RESULT 
                        : state.status === 'QUESTION_ACTIVE'
                          ? GameState.QUESTION_ACTIVE
                          : state.status === 'WAITING'
                            ? GameState.WAITING
                            : state.status === 'STARTING'
                              ? GameState.STARTING
                              : state.status === 'FINISHED'
                                ? GameState.FINISHED
                                : GameState.WAITING,
                      leaderboard: state.leaderboard || [],
                      questionIndex: state.questionIndex ?? 0,
                      totalQuestions: state.totalQuestions ?? 0,
                      currentQuestion: state.currentQuestion || null,
                      correctAnswerId: state.correctAnswerId || null,
                      timeRemaining: state.remainingTime ?? 0,
                      questionStartTime: state.questionStartedAt ? state.questionStartedAt : undefined,
                      isHost: joinRes.isActualHost ?? true,
                    });
                  }
                  
                  // Clear redirect state after successful processing
                  sessionStorage.removeItem('redirectState');
                  sessionStorage.removeItem(processedKey);
                  setIsJoining(false);
                });
              } else {
                console.log('[GamePage] redirect recovery (connect): calling join_game (player detected)');
                socket.emit('join_game', { sessionId, playerId: storedPlayerId, nickname: storedNickname }, (joinRes: any) => {
                  console.log('[GamePage] redirect recovery (connect): join_game response:', joinRes);
                  
                  // CRITICAL: Update game state from response
                  if (joinRes.success && joinRes.state) {
                    const { state } = joinRes;
                    useGameStore.setState({
                      gameStatus: state.status === 'QUESTION_RESULT' 
                        ? GameState.QUESTION_RESULT 
                        : state.status === 'QUESTION_ACTIVE'
                          ? GameState.QUESTION_ACTIVE
                          : state.status === 'WAITING'
                            ? GameState.WAITING
                            : state.status === 'STARTING'
                              ? GameState.STARTING
                              : state.status === 'FINISHED'
                                ? GameState.FINISHED
                                : GameState.WAITING,
                      leaderboard: state.leaderboard || [],
                      questionIndex: state.questionIndex ?? 0,
                      totalQuestions: state.totalQuestions ?? 0,
                      currentQuestion: state.currentQuestion || null,
                      correctAnswerId: state.correctAnswerId || null,
                      timeRemaining: state.remainingTime ?? 0,
                      questionStartTime: state.questionStartedAt ? state.questionStartedAt : undefined,
                      myPlayerId: joinRes.playerId,
                      myNickname: joinRes.nickname,
                      myScore: joinRes.score ?? 0,
                      myRank: joinRes.rank ?? null,
                      hasAnswered: joinRes.hasAnswered ?? false,
                      selectedAnswerId: joinRes.selectedAnswerId ?? null,
                    });
                  }
                  
                  // Clear redirect state after successful processing
                  sessionStorage.removeItem('redirectState');
                  sessionStorage.removeItem(processedKey);
                  setIsJoining(false);
                });
              }
            });
          }
          
          return true;
        } else {
          // Stale or wrong session — clear it
          sessionStorage.removeItem('redirectState');
          sessionStorage.removeItem(processedKey);
          return false;
        }
      } catch (e) {
        sessionStorage.removeItem('redirectState');
        sessionStorage.removeItem(processedKey);
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
        
        // === COMPREHENSIVE DEBUG LOGGING ===
        console.log('[GamePage Reload] ========================================');
        console.log(`[GamePage Reload] sessionId=${sessionId}`);
        console.log(`[GamePage Reload] authReady=${authReady} hasAccessToken=${!!accessToken}`);
        console.log(`[GamePage Reload] storedHostSessionId=${storedHostSessionId} isHostFromStorage=${storedHostSessionId === sessionId}`);
        console.log(`[GamePage Reload] storedPlayerId=${storedPlayerId} storedNickname=${storedNickname}`);
        console.log(`[GamePage Reload] HTTP state:`, {
          status: httpData.status,
          roomId: httpData.roomId,
          currentQuestionIndex: httpData.currentQuestionIndex,
          totalQuestions: httpData.totalQuestions,
          currentQuestion: httpData.currentQuestion?.content?.substring(0, 50),
          questionStartedAt: httpData.questionStartedAt,
          remainingTime: httpData.remainingTime,
          leaderboardLength: httpData.leaderboard?.length,
          serverTime: httpData.serverTime,
        });
        console.log('[GamePage Reload] ========================================');

        // CRITICAL: If session is FINISHED, redirect immediately BEFORE setting any state
        // This prevents flash of old FINISHED state on page reload after host_play_again
        if (httpData.status === 'FINISHED' && httpData.currentSessionId) {
          console.log(`[GamePage] Session finished, redirecting to new session ${httpData.currentSessionId}`);
          
          // FIX: If we were a host session, update hostSessionId to new session
          // This ensures host rejoins correctly after play_again redirect
          const wasHostSession = storedHostSessionId === sessionId;
          if (wasHostSession) {
            console.log(`[GamePage] Was host session, updating hostSessionId: ${storedHostSessionId} -> ${httpData.currentSessionId}`);
            sessionStorage.setItem('hostSessionId', httpData.currentSessionId);
          }
          
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
          // Client-End-Time: Use questionEndTime for timer sync
          // Backend provides questionEndTime = questionStartedAt + timeLimit * 1000
          const questionEndTime = httpData.questionEndTime 
            || ((httpData.questionStartedAt || Date.now()) + (httpData.currentQuestion.timeLimit || 20) * 1000);
          const initialRemaining = Math.max(0, Math.floor((questionEndTime - Date.now()) / 1000));

          useGameStore.setState({
            gameStatus: GameState.QUESTION_ACTIVE,
            currentQuestion: httpData.currentQuestion,
            questionIndex: httpData.currentQuestionIndex,
            totalQuestions: httpData.totalQuestions,
            timeRemaining: initialRemaining,
            questionStartTime: httpData.questionStartedAt || 0,
            questionEndTime: questionEndTime,
            serverTime: httpData.serverTime || Date.now(),
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
          // === COMPREHENSIVE DEBUG LOGGING FOR HOST JOIN ===
          console.log('[GamePage] ========================================');
          console.log(`[GamePage Reload] host_join_game response:`);
          console.log(`  success=${response.success}`);
          console.log(`  isActualHost=${response.isActualHost}`);
          console.log(`  isReconnect=${response.isReconnect}`);
          console.log(`  rejoinReason=${response.rejoinReason}`);
          console.log(`  state.status=${response.state?.status}`);
          console.log(`  state.currentQuestion=${response.state?.currentQuestion?.content?.substring(0, 30)}...`);
          console.log(`  state.questionIndex=${response.state?.questionIndex}`);
          console.log(`  state.totalQuestions=${response.state?.totalQuestions}`);
          console.log(`  state.remainingTime=${response.state?.remainingTime}`);
          console.log(`  state.leaderboard length=${response.state?.leaderboard?.length}`);
          console.log(`  state.currentSessionId=${response.state?.currentSessionId}`);
          console.log(`  TOP-LEVEL currentSessionId=${response.currentSessionId}`);
          console.log(`  url sessionId=${sessionId}`);
          console.log('[GamePage] ========================================');
          
          if (response.success && response.state) {
            // CRITICAL: Check if we need to redirect to a NEWER session (play_again case)
            // Only redirect if there's a NEWER session (currentSessionId !== sessionId)
            // If currentSessionId === sessionId or undefined, this is the latest session - don't redirect
            const redirectTarget = response.currentSessionId || response.state?.currentSessionId;
            console.log(`[GamePage] redirect check: redirectTarget=${redirectTarget} sessionId=${sessionId} isSame=${redirectTarget === sessionId}`);
            
            if (redirectTarget && redirectTarget !== sessionId) {
              console.log(`[GamePage] Session finished, redirecting to newer session ${redirectTarget}`);
              
              // Update hostSessionId for the new session
              sessionStorage.setItem('hostSessionId', redirectTarget);
              sessionStorage.setItem('playerSessionId', redirectTarget);
              
              // Navigate to new session
              router.replace(`/game/${redirectTarget}`);
              return;
            }
            
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
            
            // Calculate remaining time for QUESTION_ACTIVE state
            // Client-End-Time: Use questionEndTime for timer sync
            let finalTimeRemaining: number;
            
            if (response.state.status === GameState.QUESTION_ACTIVE) {
              // Use questionEndTime from server for accurate timer sync
              if (response.state.questionEndTime) {
                finalTimeRemaining = Math.max(0, Math.floor((response.state.questionEndTime - Date.now()) / 1000));
              } else if (response.state.questionStartedAt) {
                // Fallback: calculate questionEndTime from questionStartedAt
                const timeLimit = response.state.currentQuestion?.timeLimit || 20;
                finalTimeRemaining = Math.max(0, Math.floor(((response.state.questionStartedAt + timeLimit * 1000) - Date.now()) / 1000));
              } else {
                // Fallback to server's remainingTime
                finalTimeRemaining = response.state.remainingTime ?? response.state.currentQuestion?.timeLimit ?? 20;
              }
            } else {
              finalTimeRemaining = response.state.remainingTime ?? 0;
            }
            
            console.log('[GamePage] host_join_game: remaining=', finalTimeRemaining);
            
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
              timeRemaining: finalTimeRemaining,
              questionStartTime: response.state.questionStartedAt || 0,
              questionEndTime: response.state.questionEndTime || (response.state.questionStartedAt ? response.state.questionStartedAt + ((response.state.currentQuestion?.timeLimit || 20) * 1000) : 0),
              serverTime: response.state.serverTime || Date.now(),
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
                // CRITICAL: Check if we need to redirect (session finished, play_again case)
                // Use httpData which was fetched before this callback
                if (httpData?.status === 'FINISHED' && httpData?.currentSessionId && httpData.currentSessionId !== sessionId) {
                  console.log(`[GamePage] Session finished in fallback, redirecting to ${httpData.currentSessionId}`);
                  sessionStorage.setItem('playerSessionId', httpData.currentSessionId);
                  router.replace(`/game/${httpData.currentSessionId}`);
                  return;
                }
                
                // Defensive: ensure leaderboard is an array
                const safeLeaderboard = Array.isArray(playerResponse.state.leaderboard)
                  ? playerResponse.state.leaderboard
                  : (Array.isArray(httpData?.leaderboard) ? httpData.leaderboard : []);
                
                // Client-End-Time: Use questionEndTime for timer sync
                let finalTimeRemaining: number;
                
                if (playerResponse.state.status === GameState.QUESTION_ACTIVE) {
                  // Use questionEndTime from server for accurate timer sync
                  if (playerResponse.state.questionEndTime) {
                    finalTimeRemaining = Math.max(0, Math.floor((playerResponse.state.questionEndTime - Date.now()) / 1000));
                  } else if (playerResponse.state.questionStartedAt) {
                    // Fallback: calculate questionEndTime from questionStartedAt
                    const timeLimit = playerResponse.state.currentQuestion?.timeLimit || 20;
                    finalTimeRemaining = Math.max(0, Math.floor(((playerResponse.state.questionStartedAt + timeLimit * 1000) - Date.now()) / 1000));
                  } else {
                    finalTimeRemaining = playerResponse.state.remainingTime ?? playerResponse.state.currentQuestion?.timeLimit ?? 20;
                  }
                } else {
                  finalTimeRemaining = playerResponse.state.remainingTime ?? 0;
                }
                
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
                  timeRemaining: finalTimeRemaining,
                  questionStartTime: playerResponse.state.questionStartedAt || 0,
                  questionEndTime: playerResponse.state.questionEndTime || (playerResponse.state.questionStartedAt ? playerResponse.state.questionStartedAt + ((playerResponse.state.currentQuestion?.timeLimit || 20) * 1000) : 0),
                  serverTime: playerResponse.state.serverTime || Date.now(),
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
            
            // Client-End-Time: Use questionEndTime for timer sync
            let finalTimeRemaining: number;
            
            if (response.state.status === GameState.QUESTION_ACTIVE) {
              // Use questionEndTime from server for accurate timer sync
              if (response.state.questionEndTime) {
                finalTimeRemaining = Math.max(0, Math.floor((response.state.questionEndTime - Date.now()) / 1000));
              } else if (response.state.questionStartedAt) {
                // Fallback: calculate questionEndTime from questionStartedAt
                const timeLimit = response.state.currentQuestion?.timeLimit || 20;
                finalTimeRemaining = Math.max(0, Math.floor(((response.state.questionStartedAt + timeLimit * 1000) - Date.now()) / 1000));
              } else {
                finalTimeRemaining = response.state.remainingTime ?? response.state.currentQuestion?.timeLimit ?? 20;
              }
            } else {
              finalTimeRemaining = response.state.remainingTime ?? 0;
            }
            
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
              timeRemaining: finalTimeRemaining,
              questionStartTime: response.state.questionStartedAt || 0,
              questionEndTime: response.state.questionEndTime || (response.state.questionStartedAt ? response.state.questionStartedAt + ((response.state.currentQuestion?.timeLimit || 20) * 1000) : 0),
              serverTime: response.state.serverTime || Date.now(),
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

  // Client-End-Time Timer Architecture:
  // - questionEndTime is an absolute timestamp from server
  // - Timer calculates: remaining = questionEndTime - Date.now()
  // - This ensures perfect sync between host and players regardless of latency
  // - NO distinction between live mode vs recovery mode - same logic applies
  useEffect(() => {
    if (gameStatus === GameState.QUESTION_ACTIVE && questionEndTime > 0) {
      const calculateRemaining = () => {
        const remaining = questionEndTime - Date.now();
        return Math.max(0, Math.floor(remaining / 1000));
      };

      // Initial calculation
      setLocalTimeRemaining(calculateRemaining());

      // Interval updates every 100ms for smooth display
      const interval = setInterval(() => {
        const remaining = calculateRemaining();
        setLocalTimeRemaining(remaining);

        // Timer ended - question_result event will handle state transition
        // We don't change state here to avoid race conditions with server event
      }, 100);

      return () => clearInterval(interval);
    } else {
      setLocalTimeRemaining(0);
    }
  }, [gameStatus, questionEndTime]); // Simple dependencies - only re-run when these change

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

    setIsPlayAgainLoading(true);

    // Emit play_again — backend will emit session_switched to this socket too.
    // The session_switched handler stores state + navigates via router.replace.
    socket.emit('host_play_again', { sessionId: sid, roomId: rid }, (response: any) => {
      if (!response.success) {
        toast.error(response.error || 'Không thể chơi lại');
        setIsPlayAgainLoading(false);
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

  // Countdown/Starting
  if (gameStatus === GameState.STARTING) {
    if (effectiveIsHost) {
      return (
        <HostGameView
          gameStatus="STARTING"
          currentQuestion={null}
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          timeRemaining={localTimeRemaining}
          countdown={countdown}
          leaderboard={leaderboard}
        />
      );
    }
    return (
      <PlayerGameView
        gameStatus="STARTING"
        currentQuestion={null}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        timeRemaining={localTimeRemaining}
        countdown={countdown}
      />
    );
  }

  // Waiting
  if (gameStatus === GameState.WAITING) {
    if (effectiveIsHost) {
      return (
        <HostGameView
          gameStatus="WAITING"
          currentQuestion={null}
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          timeRemaining={localTimeRemaining}
          leaderboard={leaderboard}
        />
      );
    }
    return (
      <PlayerGameView
        gameStatus="WAITING"
        currentQuestion={null}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        timeRemaining={localTimeRemaining}
      />
    );
  }

  // Question Active
  if (gameStatus === GameState.QUESTION_ACTIVE && currentQuestion) {
    if (effectiveIsHost) {
      return (
        <HostGameView
          gameStatus="QUESTION_ACTIVE"
          currentQuestion={currentQuestion}
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          timeRemaining={localTimeRemaining}
          leaderboard={leaderboard}
        />
      );
    }
    return (
      <PlayerGameView
        gameStatus="QUESTION_ACTIVE"
        currentQuestion={currentQuestion}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        timeRemaining={localTimeRemaining}
        leaderboardCount={leaderboard.filter(e => e.connection !== 'LEFT').length}
        selectedAnswerId={selectedAnswerId}
        hasAnswered={hasAnswered}
        myScore={myScore}
        myRank={myRank}
        onAnswerSelect={handleSubmitAnswer}
      />
    );
  }

  // Question Result
  if (gameStatus === GameState.QUESTION_RESULT) {
    if (effectiveIsHost) {
      return (
        <HostGameView
          gameStatus="QUESTION_RESULT"
          currentQuestion={currentQuestion}
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          timeRemaining={localTimeRemaining}
          leaderboard={leaderboard}
          correctAnswerId={correctAnswerId}
          onNextQuestion={handleNextQuestion}
          isLastQuestion={isLastQuestion}
        />
      );
    }
    return (
      <PlayerGameView
        gameStatus="QUESTION_RESULT"
        currentQuestion={currentQuestion}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        timeRemaining={localTimeRemaining}
        selectedAnswerId={selectedAnswerId}
        correctAnswerId={correctAnswerId}
        hasAnswered={hasAnswered}
        myScore={myScore}
        myRank={myRank}
      />
    );
  }

  // Game Finished
  if (gameStatus === GameState.FINISHED) {
    if (effectiveIsHost) {
      return (
        <HostGameView
          gameStatus="FINISHED"
          currentQuestion={null}
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          timeRemaining={0}
          leaderboard={leaderboard}
          onPlayAgain={handlePlayAgain}
          onEndGame={handleCloseRoom}
        />
      );
    }
    return (
      <PlayerGameView
        gameStatus="FINISHED"
        currentQuestion={null}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        timeRemaining={0}
        myScore={myScore}
        myRank={myRank}
        onLeaveRoom={handleLeaveRoom}
      />
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
