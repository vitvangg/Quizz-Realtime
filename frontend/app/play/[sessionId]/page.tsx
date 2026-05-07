'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSocket } from '@/lib/socket';
import { apiClient } from '@/lib/apiClient';
import type { GameSession, Question, PlayerSession } from '@/types/game';

export default function GamePlayPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<GameSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);

  // Load session data
  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await apiClient.get(`/game-session/${sessionId}`);
        const sessionData = response.data;
        setSession(sessionData);
        setCurrentQuestion(sessionData.currentQuestion);
        setTimeLeft(sessionData.currentQuestion?.timeLimit || 20);
      } catch (err) {
        console.error('Error loading session:', err);
        setError('Failed to load game session');
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, [sessionId]);

  // Socket events
  useEffect(() => {
    const socket = getSocket();

    const handleGameStarting = (data: { countdown: number }) => {
      setCountdown(data.countdown);
      
      let count = data.countdown;
      const interval = setInterval(() => {
        count--;
        if (count > 0) {
          setCountdown(count);
        } else {
          setCountdown(null);
          clearInterval(interval);
        }
      }, 1000);
    };

    const handleQuestionStart = (data: { question: Question; timeLimit: number; questionIndex: number }) => {
      setCurrentQuestion(data.question);
      setTimeLeft(data.timeLimit);
    };

    const handleQuestionEnd = (data: { correctAnswers: string[] }) => {
      toast.info('Time is up!');
    };

    const handleLeaderboard = (data: { rankings: PlayerSession[] }) => {
      toast.success('Leaderboard updated!');
    };

    const handleSessionEnd = (data: { finalRankings: PlayerSession[]; winner: PlayerSession }) => {
      toast.success(`Game Over! Winner: ${data.winner.player?.nickname}`);
      setTimeout(() => {
        router.push('/');
      }, 5000);
    };

    const handleError = (data: { code: string; message: string }) => {
      toast.error(data.message);
    };

    socket.on('game-starting', handleGameStarting);
    socket.on('question-start', handleQuestionStart);
    socket.on('question-end', handleQuestionEnd);
    socket.on('leaderboard', handleLeaderboard);
    socket.on('session-end', handleSessionEnd);
    socket.on('error', handleError);

    return () => {
      socket.off('game-starting', handleGameStarting);
      socket.off('question-start', handleQuestionStart);
      socket.off('question-end', handleQuestionEnd);
      socket.off('leaderboard', handleLeaderboard);
      socket.off('session-end', handleSessionEnd);
      socket.off('error', handleError);
    };
  }, [router]);

  // Timer countdown
  useEffect(() => {
    if (!currentQuestion || countdown !== null) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQuestion, countdown]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4">Loading game...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <h2 className="text-xl font-semibold text-red-400 mb-4">{error}</h2>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back Home
          </button>
        </div>
      </div>
    );
  }

  // Countdown overlay
  if (countdown !== null) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-9xl font-bold text-white animate-pulse">
            {countdown}
          </div>
          <p className="text-2xl text-gray-400 mt-4">Get Ready!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">{session?.room?.quiz?.title || 'Quiz Game'}</h1>
            <p className="text-sm text-gray-400">
              Question {currentQuestion ? (session?.currentQuestionIndex || 0) + 1 : 0} / {session?.totalQuestions || 0}
            </p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${timeLeft <= 5 ? 'text-red-500' : 'text-green-500'}`}>
              {timeLeft}
            </div>
            <p className="text-xs text-gray-400">seconds</p>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-gray-700">
        <div
          className="h-full bg-blue-500 transition-all duration-1000"
          style={{ width: `${((timeLeft) / (currentQuestion?.timeLimit || 20)) * 100}%` }}
        />
      </div>

      {/* Question */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {currentQuestion ? (
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-12">{currentQuestion.content}</h2>

            {/* Answer options - placeholder */}
            <div className="grid gap-4 md:grid-cols-2">
              {currentQuestion.answers?.map((answer, index) => (
                <button
                  key={answer.id}
                  className="p-6 bg-gray-800 border-2 border-gray-700 rounded-xl text-xl font-medium hover:bg-gray-700 hover:border-blue-500 transition-all"
                >
                  {String.fromCharCode(65 + index)}. {answer.content}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-xl text-gray-400">Waiting for next question...</p>
          </div>
        )}
      </main>

      {/* Placeholder for leaderboard */}
      <footer className="fixed bottom-0 left-0 right-0 bg-gray-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex justify-between items-center text-sm text-gray-400">
          <p>Leaderboard coming soon...</p>
          <p>Game ID: {sessionId.slice(0, 8)}...</p>
        </div>
      </footer>
    </div>
  );
}
