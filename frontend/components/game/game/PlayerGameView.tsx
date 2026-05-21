'use client';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TimerBadge } from './TimerBadge';
import { QuestionCard, QuestionHeader } from './QuestionCard';
import { AnswerButtons } from './AnswerButtons';
import { CheckCircle, Clock, XCircle, Zap } from 'lucide-react';

interface Question {
  id: string;
  content: string;
  imageUrl?: string;
  answers?: Array<{ id: string; content: string }>;
}

interface PlayerGameViewProps {
  // Game state
  gameStatus: 'WAITING' | 'STARTING' | 'QUESTION_ACTIVE' | 'QUESTION_RESULT' | 'FINISHED';
  currentQuestion: Question | null;
  questionIndex: number;
  totalQuestions: number;
  timeRemaining: number;
  countdown?: number | null;
  leaderboardCount?: number;
  // Player state
  selectedAnswerId?: string | null;
  correctAnswerId?: string | null;
  hasAnswered?: boolean;
  myScore?: number;
  myRank?: number | null;
  // Actions
  onAnswerSelect?: (answerId: string) => void;
  onLeaveRoom?: () => void;
}

export function PlayerGameView({
  gameStatus,
  currentQuestion,
  questionIndex,
  totalQuestions,
  timeRemaining,
  countdown,
  leaderboardCount = 0,
  selectedAnswerId,
  correctAnswerId,
  hasAnswered,
  myScore,
  myRank,
  onAnswerSelect,
  onLeaveRoom,
}: PlayerGameViewProps) {
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
            <p className="text-base sm:text-lg font-bold text-black/60">Chờ host bắt đầu game</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Countdown/Starting state
  if (gameStatus === 'STARTING' && countdown !== undefined && countdown !== null) {
    return (
      <div className="min-h-screen bg-neon-yellow flex items-center justify-center overflow-hidden p-4">
        <div className="text-center">
          <p className="text-base sm:text-lg font-bold text-black/60 mb-6 sm:mb-8 uppercase tracking-wide">
            Game sắp bắt đầu
          </p>
          <div className="bg-black border-4 border-black shadow-brutal-xl w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 flex items-center justify-center">
            <span className="text-7xl sm:text-8xl md:text-9xl font-black text-neon-yellow">
              {countdown}
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-black/70 mt-6 sm:mt-8 uppercase tracking-wide">
            Chuẩn bị câu hỏi
          </p>
        </div>
      </div>
    );
  }

  // Question Active state
  if (gameStatus === 'QUESTION_ACTIVE' && currentQuestion) {
    return (
      <div className="min-h-screen bg-neon-yellow p-3 sm:p-4">
        <div className="w-full max-w-sm sm:max-w-lg md:max-w-2xl mx-auto">
          <QuestionHeader
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
            timeRemaining={timeRemaining}
            TimerBadge={<TimerBadge timeRemaining={timeRemaining} size="md" />}
          />

          <QuestionCard
            content={currentQuestion.content}
            imageUrl={currentQuestion.imageUrl}
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
          />

          <AnswerButtons
            answers={currentQuestion.answers || []}
            selectedAnswerId={selectedAnswerId}
            correctAnswerId={null}
            showCorrect={false}
            disabled={hasAnswered || false}
            isHost={false}
            onAnswerSelect={onAnswerSelect}
          />

          {hasAnswered ? (
            <div className="text-center bg-neon-green border-4 border-black shadow-brutal p-3 sm:p-4">
              <p className="font-black text-white uppercase tracking-wide flex items-center justify-center gap-2 text-sm sm:text-base">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                Đã gửi đáp án! Chờ kết quả...
              </p>
            </div>
          ) : (
            <div className="text-center bg-white border-4 border-black shadow-brutal p-3 sm:p-4">
              <p className="font-bold text-black/60 uppercase tracking-wide text-sm sm:text-base">
                Chọn đáp án của bạn
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Question Result state
  if (gameStatus === 'QUESTION_RESULT' && currentQuestion) {
    const isCorrect = selectedAnswerId === correctAnswerId;
    const noAnswer = !selectedAnswerId;

    return (
      <div className="min-h-screen bg-neon-green p-3 sm:p-4">
        <div className="w-full max-w-sm sm:max-w-lg md:max-w-2xl mx-auto">
          {/* Result header */}
          <div className="text-center mb-4 sm:mb-6">
            {isCorrect ? (
              <>
                <div className="bg-neon-yellow border-4 border-black shadow-brutal-xl inline-block px-6 sm:px-8 py-4 sm:py-4 mb-3">
                  <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-black mx-auto" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white uppercase">Chính xác!</h2>
              </>
            ) : noAnswer ? (
              <>
                <div className="bg-neon-orange border-4 border-black shadow-brutal-xl inline-block px-6 sm:px-8 py-4 sm:py-4 mb-3">
                  <Clock className="w-12 h-12 sm:w-16 sm:h-16 text-white mx-auto" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white uppercase">Hết giờ!</h2>
              </>
            ) : (
              <>
                <div className="bg-red-500 border-4 border-black shadow-brutal-xl inline-block px-6 sm:px-8 py-4 sm:py-4 mb-3">
                  <XCircle className="w-12 h-12 sm:w-16 sm:h-16 text-white mx-auto" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white uppercase">Chưa đúng!</h2>
              </>
            )}
          </div>

          {/* Question with answers */}
          <Card className="mb-4 sm:mb-6 bg-white border-4 border-black shadow-brutal">
            <CardHeader className="bg-neon-blue border-b-4 border-black pb-3 sm:pb-4">
              <CardTitle className="text-lg sm:text-xl font-black text-white text-center leading-relaxed">
                {currentQuestion.content}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AnswerButtons
                answers={currentQuestion.answers || []}
                selectedAnswerId={selectedAnswerId}
                correctAnswerId={correctAnswerId}
                showCorrect={true}
                isHost={false}
              />
            </CardContent>
          </Card>

          {/* Player score card */}
          <Card className="mb-4 sm:mb-6 bg-white border-4 border-black shadow-brutal">
            <CardContent className="pt-4 sm:pt-6 text-center">
              <p className="text-xs sm:text-sm font-bold text-black/50 uppercase tracking-wider mb-2">Điểm của bạn</p>
              <div className="text-4xl sm:text-5xl font-black text-neon-pink mb-2">{myScore ?? 0} pts</div>
              <div className="text-base sm:text-lg font-bold text-black/70">
                Xếp hạng: <span className="text-neon-blue font-black">#{myRank ?? '-'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Finished state
  if (gameStatus === 'FINISHED') {
    return (
      <div className="min-h-screen bg-neon-pink p-4">
        <div className="w-full max-w-sm sm:max-w-md md:max-w-lg mx-auto">
          <div className="text-center mb-6 sm:mb-8">
            <div className="bg-neon-yellow border-4 border-black shadow-brutal-xl inline-block px-6 sm:px-8 py-4 sm:py-4 mb-4">
              <Zap className="w-12 h-12 sm:w-16 sm:h-16 text-black mx-auto" />
            </div>
            <h1 className="text-3xl sm:text-4xl sm:text-5xl font-black text-white uppercase mb-2">Game Over!</h1>
            <p className="text-base sm:text-xl font-bold text-white/70 uppercase tracking-wide">Kết quả cuối cùng</p>
          </div>

          {/* Player result card */}
          <Card className="mb-4 sm:mb-6 bg-white border-4 border-black shadow-brutal-xl">
            <CardHeader className="bg-neon-blue border-b-4 border-black pb-3 sm:pb-4">
              <CardTitle className="text-lg sm:text-xl font-black uppercase text-white text-center">
                Kết quả của bạn
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 text-center">
              <div className="bg-neon-yellow border-4 border-black shadow-brutal inline-block px-6 sm:px-8 py-3 sm:py-4 mb-3">
                <p className="text-4xl sm:text-5xl sm:text-6xl font-black text-black">{myScore ?? 0}</p>
                <p className="text-xs sm:text-sm font-bold text-black/60 uppercase">Điểm</p>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-black/70 mt-4">
                Xếp hạng: <span className="text-neon-pink font-black">#{myRank ?? '-'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Leave room button */}
          <Button
            onClick={onLeaveRoom}
            className="w-full bg-neon-blue border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-2 hover:translate-y-2 font-black text-lg sm:text-xl py-5 sm:py-6 uppercase"
          >
            Rời phòng
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
