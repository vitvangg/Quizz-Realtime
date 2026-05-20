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
        <Card className="w-full max-w-md bg-white border-4 border-black shadow-brutal-xl">
          <CardHeader className="bg-neon-pink border-b-4 border-black text-center">
            <CardTitle className="text-2xl font-black uppercase text-white">
              Đang chờ game bắt đầu
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin bg-neon-green" />
            <p className="text-lg font-bold text-black/60">Đợi người chơi tham gia</p>
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

    // Recent answers - get players who just answered in this batch (last 3)
    const recentAnswerers = answeredPlayers.slice(-3);
    const remainingAnswerers = Math.max(0, answeredPlayers.length - 3);

    return (
      <div className="min-h-screen bg-neon-yellow p-4">
        <div className="max-w-3xl mx-auto">
          {/* Header with question and timer */}
          <QuestionHeader
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
            timeRemaining={timeRemaining}
            TimerBadge={<TimerBadge timeRemaining={timeRemaining} size="md" />}
          />

          {/* Question content */}
          <QuestionCard
            content={currentQuestion.content}
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
          />

          {/* Progress section - main focus */}
          <Card className="mb-4 bg-white border-4 border-black shadow-brutal">
            <CardContent className="p-6">
              {/* Stats row */}
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-neon-green" />
                  <span className="font-black text-xl text-black">
                    Đã trả lời: {answeredCount} / {totalCount}
                  </span>
                </div>
                <div className="bg-neon-green border-4 border-black shadow-brutal-sm px-4 py-2">
                  <span className="font-black text-2xl text-white">{answeredPercent}%</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-8 bg-gray-200 border-4 border-black rounded-lg overflow-hidden">
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
              <CardHeader className="bg-neon-orange border-b-4 border-black pb-3">
                <CardTitle className="text-lg font-black uppercase flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Trả lời gần đây
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="space-y-2">
                  {recentAnswerers.map((entry) => (
                    <div
                      key={entry.playerId}
                      className="flex items-center gap-3 p-2 bg-green-50 border-2 border-black rounded-lg"
                    >
                      <div className="w-8 h-8 bg-neon-green border-2 border-black rounded-full flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-black" />
                      </div>
                      <span className="font-bold text-black">{entry.nickname}</span>
                      <span className="text-sm text-black/50 ml-auto">đã trả lời</span>
                    </div>
                  ))}
                  {remainingAnswerers > 0 && (
                    <div className="text-center py-2">
                      <span className="font-bold text-neon-orange text-lg">
                        +{remainingAnswerers} người khác vừa trả lời
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status message */}
          <div className="text-center bg-white border-4 border-black shadow-brutal p-4 mt-4">
            <p className="font-bold text-black/60 uppercase tracking-wide">
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
      <div className="min-h-screen bg-neon-green p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-6">
            <div className="bg-neon-yellow border-4 border-black shadow-brutal-xl inline-block px-8 py-4 mb-3">
              <CheckCircle className="w-16 h-16 text-black mx-auto" />
            </div>
            <h2 className="text-4xl font-black text-white uppercase">Kết quả câu hỏi</h2>
          </div>

          <Card className="mb-6 bg-white border-4 border-black shadow-brutal">
            <CardHeader className="bg-neon-blue border-b-4 border-black pb-4">
              <CardTitle className="text-xl font-black text-white text-center leading-relaxed">
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
          </Card>

          <LeaderboardPanel
            entries={leaderboard}
            pageSize={20}
            showConnectionStatus={true}
            title="Bảng xếp hạng"
          />

          {!isLastQuestion && (
            <Button
              onClick={onNextQuestion}
              className="w-full bg-neon-pink border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-xl py-8 uppercase"
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
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="bg-neon-yellow border-4 border-black shadow-brutal-xl inline-block px-8 py-4 mb-4">
              <Zap className="w-16 h-16 text-black mx-auto" />
            </div>
            <h1 className="text-5xl font-black text-white uppercase mb-2">Game Over!</h1>
            <p className="text-xl font-bold text-white/70 uppercase tracking-wide">Kết quả cuối cùng</p>
          </div>

          <LeaderboardPanel
            entries={leaderboard}
            pageSize={20}
            showConnectionStatus={true}
            title="Bảng xếp hạng cuối cùng"
          />

          <div className="flex gap-4">
            <Button
              onClick={onPlayAgain}
              className="flex-1 bg-neon-green border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-xl py-8 uppercase"
            >
              Chơi lại
            </Button>
            <Button
              onClick={onEndGame}
              className="flex-1 bg-neon-blue border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-xl py-8 uppercase"
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
