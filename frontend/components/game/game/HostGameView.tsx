'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TimerBadge } from './TimerBadge';
import { QuestionCard, QuestionHeader } from './QuestionCard';
import { AnswerButtons } from './AnswerButtons';
import { LeaderboardPanel } from './LeaderboardPanel';
import { PlayerListPanel } from './PlayerListPanel';
import { CountdownView } from './CountdownView';
import { CheckCircle, Zap, Clock } from 'lucide-react';

interface Question {
  id: string;
  content: string;
  imageUrl?: string;
  answers?: Array<{ id: string; content: string }>;
}

interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
  connection?: 'CONNECTED' | 'LEFT' | 'DISCONNECTED' | null;
  hasAnswered?: boolean;
}

interface HostGameViewProps {
  // Game state
  gameStatus: 'WAITING' | 'STARTING' | 'QUESTION_ACTIVE' | 'QUESTION_RESULT' | 'FINISHED';
  currentQuestion: Question | null;
  questionIndex: number;
  totalQuestions: number;
  timeRemaining: number;
  countdown?: number | null;
  leaderboard: LeaderboardEntry[];
  correctAnswerId?: string | null;
  onNextQuestion?: () => void;
  onPlayAgain?: () => void;
  onEndGame?: () => void;
  isLastQuestion?: boolean;
  isPlayAgainLoading?: boolean;
}

export function HostGameView({
  gameStatus,
  currentQuestion,
  questionIndex,
  totalQuestions,
  timeRemaining,
  countdown,
  leaderboard,
  correctAnswerId,
  onNextQuestion,
  onPlayAgain,
  onEndGame,
  isLastQuestion,
  isPlayAgainLoading = false,
}: HostGameViewProps) {
  // Countdown/Starting state
  if (gameStatus === 'STARTING') {
    return (
      <CountdownView
        countdown={countdown ?? timeRemaining}
        message="Game sắp bắt đầu"
        subMessage="Chuẩn bị câu hỏi"
      />
    );
  }

  // Waiting state
  if (gameStatus === 'WAITING') {
    return (
      <div className="min-h-screen bg-neon-blue flex items-center justify-center p-4">
        <Card className="w-full max-w-sm sm:max-w-md bg-white border-4 border-black shadow-brutal-xl">
          <CardHeader className="bg-neon-pink border-b-4 border-black text-center">
            <CardTitle className="text-xl sm:text-2xl font-black uppercase text-white">
              Đang chờ game bắt đầu
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin bg-neon-green" />
            <p className="text-base sm:text-lg font-bold text-black/60">Đợi người chơi tham gia</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Question Active state
  if (gameStatus === 'QUESTION_ACTIVE' && currentQuestion) {
    // Calculate stats
    const activePlayers = leaderboard.filter(e => e.connection !== 'LEFT');
    const answeredPlayers = activePlayers.filter(e => e.hasAnswered);
    const answeredCount = answeredPlayers.length;
    const totalCount = activePlayers.length;
    const answeredPercent = totalCount > 0
      ? Math.round((answeredCount / totalCount) * 100)
      : 0;

    return (
      <div className="min-h-screen bg-neon-yellow p-3 sm:p-4">
        <div className="w-full max-w-sm sm:max-w-2xl md:max-w-3xl mx-auto">
          {/* Header with question and timer */}
          <QuestionHeader
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
            timeRemaining={timeRemaining}
            TimerBadge={<TimerBadge timeRemaining={timeRemaining} size="md" />}
          />

          {/* Question content */}
          {/* <QuestionCard
            content={currentQuestion.content}
            imageUrl={currentQuestion.imageUrl}
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
          /> */}

          {/* Progress section - main focus */}
          <Card className="mb-3 sm:mb-4 bg-white border-4 border-black shadow-brutal">
            <CardContent className="p-4 sm:p-6">
              {/* Stats row */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-3 sm:mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-neon-green" />
                  <span className="font-black text-base sm:text-xl text-black">
                    Đã trả lời: {answeredCount} / {totalCount}
                  </span>
                </div>
                <div className="bg-neon-green border-4 border-black shadow-brutal-sm px-3 sm:px-4 py-1 sm:py-2">
                  <span className="font-black text-xl sm:text-2xl text-white">{answeredPercent}%</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-6 sm:h-8 bg-gray-200 border-4 border-black rounded-lg overflow-hidden">
                <div
                  className="h-full bg-neon-green transition-all duration-300 ease-out"
                  style={{ width: `${answeredPercent}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Recent answer feed - secondary */}
          {answeredPlayers.length > 0 && (
            <Card className="bg-white border-4 border-black shadow-brutal">
              <CardHeader className="bg-neon-orange border-b-4 border-black pb-2 sm:pb-3">
                <CardTitle className="text-base sm:text-lg font-black uppercase flex items-center gap-2">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                  Người đã trả lời
                  <span className="ml-auto text-sm font-bold">+{answeredPlayers.length} người</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-3">
                <div className="flex flex-wrap gap-2 sm:gap-3 max-h-24 sm:max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-neon-orange scrollbar-track-gray-200">
                  {answeredPlayers.slice(-20).map((entry) => (
                    <div
                      key={entry.playerId}
                      className="flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 bg-neon-green border-2 sm:border-3 border-black rounded-lg shadow-brutal-sm"
                    >
                      <span className="font-black text-sm sm:text-base text-black uppercase">
                        {entry.nickname.charAt(0)}
                      </span>
                      <span className="text-[8px] sm:text-[10px] font-bold text-black/70 truncate max-w-full px-1">
                        {entry.nickname.length > 6 ? entry.nickname.slice(0, 5) + '..' : entry.nickname}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status message */}
          <div className="text-center bg-white border-4 border-black shadow-brutal p-3 sm:p-4 mt-3 sm:mt-4">
            <p className="font-bold text-black/60 uppercase tracking-wide text-sm sm:text-base">
              <span className="inline-block w-3 h-3 bg-neon-orange border-2 border-black mr-2"></span>
              Đang chờ người chơi trả lời...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Question Result state
  if (gameStatus === 'QUESTION_RESULT' && currentQuestion) {
    return (
      <div className="min-h-screen bg-neon-green p-3 sm:p-4">
        <div className="w-full max-w-sm sm:max-w-2xl md:max-w-4xl mx-auto">
          <div className="text-center mb-4 sm:mb-6">
            <div className="bg-neon-yellow border-4 border-black shadow-brutal-xl inline-block px-6 sm:px-8 py-4 sm:py-4 mb-3">
              <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-black mx-auto" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white uppercase">Kết quả</h2>
          </div>

          {/* <Card className="mb-4 sm:mb-6 bg-white border-4 border-black shadow-brutal">
            <CardHeader className="bg-neon-blue border-b-4 border-black pb-3 sm:pb-4">
              <CardTitle className="text-lg sm:text-xl font-black text-white text-center leading-relaxed">
                {currentQuestion.content}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AnswerButtons
                answers={currentQuestion.answers || []}
                selectedAnswerId={null}
                correctAnswerId={correctAnswerId}
                showCorrect={true}
                isHost={true}
              />
            </CardContent>
          </Card> */}

          <LeaderboardPanel
            entries={leaderboard}
            pageSize={20}
            showConnectionStatus={true}
            title="Bảng xếp hạng"
          />

          {!isLastQuestion && (
            <Button
              onClick={onNextQuestion}
              className="w-full bg-neon-pink border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-lg sm:text-xl py-5 sm:py-8 uppercase"
            >
              Tiếp tục →
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Finished state
  if (gameStatus === 'FINISHED') {
    return (
      <div className="min-h-screen bg-neon-pink p-4">
        <div className="w-full max-w-sm sm:max-w-2xl md:max-w-4xl mx-auto">
          <div className="text-center mb-6 sm:mb-8">
            <div className="bg-neon-yellow border-4 border-black shadow-brutal-xl inline-block px-6 sm:px-8 py-4 sm:py-4 mb-4">
              <Zap className="w-12 h-12 sm:w-16 sm:h-16 text-black mx-auto" />
            </div>
            <h1 className="text-3xl sm:text-4xl sm:text-5xl font-black text-white uppercase mb-2">Game Over!</h1>
            <p className="text-base sm:text-xl font-bold text-white/70 uppercase tracking-wide">Kết quả cuối cùng</p>
          </div>

          <LeaderboardPanel
            entries={leaderboard}
            pageSize={20}
            showConnectionStatus={true}
            title="Bảng xếp hạng cuối cùng"
          />

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Button
              onClick={onPlayAgain}
              disabled={isPlayAgainLoading}
              className={`flex-1 border-4 shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-lg sm:text-xl py-5 sm:py-8 uppercase transition-all ${
                isPlayAgainLoading
                  ? 'bg-gray-300 text-gray-500 cursor-wait'
                  : 'bg-neon-green text-black border-black'
              }`}
            >
              {isPlayAgainLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-3 border-black border-t-transparent rounded-full animate-spin" />
                  Đang tải...
                </div>
              ) : (
                'Chơi lại'
              )}
            </Button>
            <Button
              onClick={onEndGame}
              className="flex-1 bg-neon-blue border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-lg sm:text-xl py-5 sm:py-8 uppercase"
            >
              Kết thúc
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
