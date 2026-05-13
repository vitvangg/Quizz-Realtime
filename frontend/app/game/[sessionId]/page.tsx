'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameStore } from '@/stores/game.store';
import { useRoomStore } from '@/stores/room.store';
import { useAuthStore } from '@/stores/auth.store';
import { GameState } from '@/types/game.type';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    joinGame,
    startGame,
    nextQuestion,
    endGame,
    reset,
  } = useGameStore();

  const { currentRoom, currentPlayer } = useRoomStore();
  const { user } = useAuthStore();

  const [localTimeRemaining, setLocalTimeRemaining] = useState(0);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinAsHost = useCallback(async () => {
    if (isJoining || !sessionId || sessionId === 'undefined') return;
    
    setIsJoining(true);
    
    const authStore = useAuthStore.getState();
    const jwt = authStore.accessToken;
    const roomStore = useRoomStore.getState();
    
    connectSocket();
    
    await new Promise<void>((resolve) => {
      const checkConnection = setInterval(() => {
        const store = useGameStore.getState();
        if (store.isConnected) {
          clearInterval(checkConnection);
          resolve();
        }
      }, 50);
    });
    
    const gameStore = useGameStore.getState();
    
    if (gameStore.socket) {
      gameStore.socket.emit(
        'host_join_game',
        { sessionId, jwt },
        (response: any) => {
          console.log('[GamePage] host_join_game response:', response);
          if (response.success) {
            useGameStore.setState({
              sessionId: sessionId,
              roomId: roomStore.currentRoom?.id,
              isHost: true,
              gameStatus: response.state?.status || GameState.WAITING,
              currentQuestion: response.state?.currentQuestion || null,
              questionIndex: response.state?.questionIndex || 0,
              totalQuestions: response.state?.totalQuestions || 0,
              leaderboard: response.state?.leaderboard || [],
              myPlayerId: 'host_' + authStore.user?.id,
              myNickname: authStore.user?.email?.split('@')[0] || 'Host',
            });
          } else {
            console.error('[GamePage] Failed to join game:', response.error);
          }
          setIsJoining(false);
        }
      );
    } else {
      setIsJoining(false);
    }
  }, [sessionId, connectSocket]);

  const handleJoinAsPlayer = useCallback(async (playerId: string, nickname: string, roomId: string) => {
    if (isJoining || !sessionId) return;
    
    setIsJoining(true);
    
    connectSocket();
    
    await new Promise<void>((resolve) => {
      const checkConnection = setInterval(() => {
        const store = useGameStore.getState();
        if (store.isConnected) {
          clearInterval(checkConnection);
          resolve();
        }
      }, 50);
    });
    
    const gameStore = useGameStore.getState();
    
    if (gameStore.socket) {
      gameStore.socket.emit(
        'join_game',
        { sessionId, playerId, nickname },
        (response: any) => {
          console.log('[GamePage] join_game response:', response);
          if (response.success) {
            useGameStore.setState({
              sessionId: sessionId,
              roomId: roomId,
              isHost: false,
              gameStatus: response.state?.status || GameState.WAITING,
              currentQuestion: response.state?.currentQuestion || null,
              questionIndex: response.state?.questionIndex || 0,
              totalQuestions: response.state?.totalQuestions || 0,
              leaderboard: response.state?.leaderboard || [],
              myPlayerId: playerId,
              myNickname: nickname,
            });
          } else {
            console.error('[GamePage] Failed to join game:', response.error);
          }
          setIsJoining(false);
        }
      );
    } else {
      setIsJoining(false);
    }
  }, [sessionId, connectSocket]);

  useEffect(() => {
    if (!sessionId || sessionId === 'undefined') {
      router.push('/');
      return;
    }

    const storedHostSessionId = sessionStorage.getItem('hostSessionId');
    const storedPlayerId = sessionStorage.getItem('playerId');
    const storedNickname = sessionStorage.getItem('playerNickname');
    const storedRoomId = sessionStorage.getItem('currentRoomId');
    const storedIsHost = sessionStorage.getItem('isHost');

    if (storedPlayerId && storedNickname && storedRoomId && storedIsHost === 'false') {
      handleJoinAsPlayer(storedPlayerId, storedNickname, storedRoomId);
    } else if (storedHostSessionId === sessionId) {
      sessionStorage.removeItem('hostSessionId');
      handleJoinAsHost();
    } else if (!storedPlayerId && !storedHostSessionId) {
      handleJoinAsHost();
    }

    return () => {
      reset();
    };
  }, [sessionId]);

  useEffect(() => {
    if (gameStatus === GameState.QUESTION_ACTIVE && currentQuestion) {
      setLocalTimeRemaining(currentQuestion.timeLimit);

      const interval = setInterval(() => {
        setLocalTimeRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [gameStatus, currentQuestion]);

  const handleNextQuestion = async () => {
    await nextQuestion();
  };

  const handleEndGame = async () => {
    await endGame();
    router.push('/quiz');
  };

  const getAnswerButtonColor = (answerId: string, index: number) => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500'];

    if (gameStatus === GameState.QUESTION_RESULT) {
      if (answerId === correctAnswerId) {
        return 'bg-green-600 ring-4 ring-green-300';
      }
      if (answerId === selectedAnswerId && answerId !== correctAnswerId) {
        return 'bg-red-500';
      }
    }

    if (selectedAnswerId === answerId) {
      return colors[index % 4];
    }

    return colors[index % 4];
  };

  if (!sessionId || sessionId === 'undefined') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-2xl">Session không hợp lệ</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => router.push('/')}>Quay về trang chủ</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 🔧 Maintenance Overlay
  if (isMaintenance) {
    return <MaintenanceOverlay message={maintenanceMessage} />;
  }

  // 🚨 Hard Freeze Overlay
  if (isFrozen) {
    return <FreezeOverlay message={freezeMessage} />;
  }

  if (gameStatus === GameState.WAITING || isJoining) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              {isJoining ? 'Đang tham gia...' : 'Đang chờ...'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
            <p className="text-muted-foreground text-center">
              {isJoining ? 'Đang kết nối game...' : 'Đang chờ game bắt đầu'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (gameStatus === GameState.STARTING) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-8xl font-bold text-white mb-4">{countdown}</h1>
          <p className="text-2xl text-white/80">Game sắp bắt đầu!</p>
        </div>
      </div>
    );
  }

  if (gameStatus === GameState.QUESTION_ACTIVE && currentQuestion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="text-white">
              <span className="text-xl">Câu {questionIndex + 1}/{totalQuestions}</span>
            </div>
            <div className="text-white text-3xl font-bold">
              ⏱️ {localTimeRemaining}s
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-2xl text-center">
                {currentQuestion.content}
              </CardTitle>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {currentQuestion.answers.map((answer, index) => (
              <button
                key={answer.id}
                onClick={() => !hasAnswered && useGameStore.getState().submitAnswer(answer.id)}
                disabled={hasAnswered}
                className={`
                  ${getAnswerButtonColor(answer.id, index)}
                  text-white text-xl font-semibold py-8 px-6 rounded-xl
                  transition-all duration-200
                  hover:scale-105 hover:shadow-lg
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                `}
              >
                <span className="mr-2">
                  {index === 0 ? 'A' : index === 1 ? 'B' : index === 2 ? 'C' : 'D'}
                </span>
                {answer.content}
              </button>
            ))}
          </div>

          {hasAnswered && (
            <div className="text-center text-white text-lg">
              ✅ Đã gửi đáp án! Chờ kết quả...
            </div>
          )}

          <div className="mt-6 text-center text-white/60 text-sm">
            Điểm của bạn: {myScore} pts | Xếp hạng: #{myRank || '-'}
          </div>
        </div>
      </div>
    );
  }

  if (gameStatus === GameState.QUESTION_RESULT) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-white mb-2">Kết quả</h2>
            {selectedAnswerId === correctAnswerId ? (
              <p className="text-green-400 text-xl">🎉 Chính xác!</p>
            ) : selectedAnswerId ? (
              <p className="text-red-400 text-xl">❌ Chưa đúng!</p>
            ) : (
              <p className="text-yellow-400 text-xl">⏰ Hết giờ!</p>
            )}
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-center">
                {currentQuestion?.content}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {currentQuestion?.answers.map((answer, index) => {
                  const isCorrect = answer.id === correctAnswerId;
                  const isSelected = answer.id === selectedAnswerId;

                  return (
                    <div
                      key={answer.id}
                      className={`
                        p-4 rounded-lg font-semibold
                        ${isCorrect ? 'bg-green-600 text-white' : isSelected ? 'bg-red-500 text-white' : 'bg-gray-700 text-white'}
                      `}
                    >
                      {index === 0 ? 'A' : index === 1 ? 'B' : index === 2 ? 'C' : 'D'}. {answer.content}
                      {isCorrect && ' ✅'}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-center">🏆 Bảng xếp hạng</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {leaderboard.slice(0, 5).map((entry) => (
                  <div
                    key={entry.playerId}
                    className={`
                      flex justify-between items-center p-3 rounded-lg
                      ${entry.rank === 1 ? 'bg-yellow-600' : 'bg-gray-700'}
                    `}
                  >
                    <span className="font-bold">#{entry.rank}</span>
                    <span>{entry.nickname}</span>
                    <span className="font-bold">{entry.score} pts</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-white/60 text-sm mb-4">
            Điểm của bạn: {myScore} pts | Xếp hạng: #{myRank || '-'}
          </div>

          {isHost && (
            <Button onClick={handleNextQuestion} size="lg" className="w-full">
              Tiếp tục ➡️
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (gameStatus === GameState.FINISHED) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-white mb-2">🎉 Game Over!</h1>
            <p className="text-xl text-white/80">Kết quả cuối cùng</p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-center text-2xl">🏆 Bảng xếp hạng</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {leaderboard.map((entry, index) => (
                  <div
                    key={entry.playerId}
                    className={`
                      flex justify-between items-center p-4 rounded-lg text-lg
                      ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-600' : 'bg-gray-700'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${entry.rank}`}
                      </span>
                      <span className="font-bold">{entry.nickname}</span>
                    </div>
                    <span className="font-bold text-xl">{entry.score} pts</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button onClick={() => router.push('/quiz')} className="flex-1">
              Quay về Quiz
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
      <div className="text-white">Đang tải...</div>
    </div>
  );
}
