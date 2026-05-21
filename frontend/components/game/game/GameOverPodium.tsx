'use client';

import { useEffect, useState, useMemo } from 'react';
import { PodiumPlayerCard } from './PodiumPlayerCard';

interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
  connection?: 'CONNECTED' | 'LEFT' | 'DISCONNECTED' | null;
  hasAnswered?: boolean;
}

interface ConfettiPiece {
  id: number;
  left: string;
  color: string;
  borderRadius: string;
  delay: string;
  duration: string;
}

interface GameOverPodiumProps {
  entries: LeaderboardEntry[];
  currentPlayerId?: string | null;
}

const CONFETTI_COLORS = ['#FEFD2E', '#FF6B9D', '#4ECDC4', '#95E616', '#FF9F1C'];

function generateConfettiPieces(): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < 50; i++) {
    pieces.push({
      id: i,
      left: `${Math.random() * 100}%`,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      borderRadius: Math.random() > 0.5 ? '50%' : '2px',
      delay: `${Math.random() * 2}s`,
      duration: `${2 + Math.random() * 2}s`,
    });
  }
  return pieces;
}

export function GameOverPodium({ entries, currentPlayerId }: GameOverPodiumProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  // Generate confetti pieces once with useMemo
  const confettiPieces = useMemo(() => generateConfettiPieces(), []);

  // Trigger confetti after podium appears
  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // Get top 3 players sorted by rank
  const topThree = useMemo(() => {
    const sorted = [...(entries || [])].sort((a, b) => a.rank - b.rank);
    return sorted.slice(0, 3);
  }, [entries]);

  // Get remaining players (rank 4+)
  const remainingPlayers = useMemo(() => {
    const sorted = [...(entries || [])].sort((a, b) => a.rank - b.rank);
    return sorted.slice(3);
  }, [entries]);

  if (!entries || entries.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin bg-neon-pink" />
      </div>
    );
  }

  return (
    <div className="w-full relative">
      {/* Confetti Effect */}
      {showConfetti && topThree[0] && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          {confettiPieces.map((piece) => (
            <div
              key={piece.id}
              className="confetti-piece"
              style={{
                position: 'absolute',
                left: piece.left,
                top: '-10px',
                width: '10px',
                height: '10px',
                backgroundColor: piece.color,
                borderRadius: piece.borderRadius,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
              }}
            />
          ))}
        </div>
      )}

      {/* Podium Section */}
      <div className="mb-8">
        <h2 className="text-center text-2xl sm:text-3xl font-black text-white uppercase mb-6 flex items-center justify-center gap-3">
          <span className="text-3xl sm:text-4xl">🏆</span>
          TOP NGƯỜI CHƠI
          <span className="text-3xl sm:text-4xl">🏆</span>
        </h2>

        {/* Podium Display - Order: 2 (left), 1 (center), 3 (right) */}
        <div className="flex items-end justify-center gap-2 sm:gap-4 px-2">
          {/* Rank 2 - Left */}
          {topThree[1] && (
            <PodiumPlayerCard
              key={topThree[1].playerId}
              playerId={topThree[1].playerId}
              nickname={topThree[1].nickname}
              score={topThree[1].score}
              rank={2}
              animationDelay={400}
              isCurrentUser={topThree[1].playerId === currentPlayerId}
            />
          )}

          {/* Rank 1 - Center (tallest) */}
          {topThree[0] && (
            <PodiumPlayerCard
              key={topThree[0].playerId}
              playerId={topThree[0].playerId}
              nickname={topThree[0].nickname}
              score={topThree[0].score}
              rank={1}
              animationDelay={200}
              isCurrentUser={topThree[0].playerId === currentPlayerId}
            />
          )}

          {/* Rank 3 - Right */}
          {topThree[2] && (
            <PodiumPlayerCard
              key={topThree[2].playerId}
              playerId={topThree[2].playerId}
              nickname={topThree[2].nickname}
              score={topThree[2].score}
              rank={3}
              animationDelay={600}
              isCurrentUser={topThree[2].playerId === currentPlayerId}
            />
          )}
        </div>

        {/* Handle case with fewer than 3 players */}
        {entries.length === 1 && (
          <div className="text-center mt-4">
            <p className="text-base font-bold text-white/60">Chỉ có 1 người chơi trong game</p>
          </div>
        )}

        {entries.length === 2 && (
          <div className="text-center mt-4">
            <p className="text-base font-bold text-white/60">Chỉ có 2 người chơi trong game</p>
          </div>
        )}
      </div>

      {/* Remaining Players List */}
      {remainingPlayers.length > 0 && (
        <div className="mt-8">
          <h3 className="text-center text-lg sm:text-xl font-black text-white/80 uppercase mb-4">
            Bảng xếp hạng đầy đủ
          </h3>
          <div className="bg-white/10 backdrop-blur-sm border-4 border-black rounded-xl p-4 space-y-2">
            {remainingPlayers.map((entry, index) => (
              <div
                key={entry.playerId}
                className={`
                  flex items-center justify-between p-3 rounded-lg border-3 border-black
                  bg-white transition-all duration-200 hover:scale-[1.02] hover:shadow-brutal
                  animate-slide-up
                `}
                style={{ animationDelay: `${index * 50 + 200}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg border-3 border-black bg-neon-blue flex items-center justify-center font-black text-lg text-black">
                    {entry.rank}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-black">{entry.nickname}</span>
                    {entry.playerId === currentPlayerId && (
                      <span className="text-xs font-bold px-2 py-0.5 bg-neon-pink border-2 border-black rounded text-white">
                        BẠN
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-black text-xl text-neon-pink">{entry.score.toLocaleString()}</span>
                  <span className="text-xs font-bold text-black/50 ml-1">pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
