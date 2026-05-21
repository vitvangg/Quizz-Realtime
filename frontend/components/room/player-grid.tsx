'use client';

import { memo } from 'react';
import { Crown } from 'lucide-react';

interface Player {
  id: string;
  nickname: string;
  isHost?: boolean;
}

interface PlayerGridCardProps {
  player: Player;
  rank: number;
  isCurrentPlayer: boolean;
}

// Memoized player card để tránh re-render khi có nhiều players
export const PlayerGridCard = memo(function PlayerGridCard({
  player,
  rank,
  isCurrentPlayer,
}: PlayerGridCardProps) {
  const isPlayerHost = player.isHost;

  return (
    <div
      className={`
        relative flex flex-col items-center justify-center p-2 rounded-xl border-3 border-black
        transition-all duration-150
        ${isCurrentPlayer 
          ? 'bg-neon-yellow shadow-brutal-sm hover:shadow-brutal' 
          : isPlayerHost 
            ? 'bg-neon-pink shadow-brutal-sm' 
            : 'bg-white shadow-brutal-sm hover:shadow-brutal hover:-translate-y-0.5'
        }
      `}
    >
      {/* Rank badge */}
      <div className="absolute -top-2 -left-2 w-6 h-6 bg-black rounded-full flex items-center justify-center">
        <span className="text-xs font-black text-white">{rank}</span>
      </div>

      {/* Avatar */}
      <div
        className={`
          w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-black flex items-center justify-center
          text-xl sm:text-2xl font-black
          ${isPlayerHost ? 'bg-neon-orange text-white' : 'bg-neon-blue text-white'}
        `}
      >
        {isPlayerHost ? (
          <Crown className="w-6 h-6" />
        ) : (
          player.nickname.charAt(0).toUpperCase()
        )}
      </div>

      {/* Nickname */}
      <p className="mt-2 text-xs sm:text-sm font-bold text-black text-center truncate max-w-full px-1">
        {player.nickname}
      </p>

      {/* You badge */}
      {isCurrentPlayer && !isPlayerHost && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-black text-neon-pink bg-white px-1 border border-black rounded">
          BẠN
        </span>
      )}
    </div>
  );
});

interface PlayerGridProps {
  players: Player[];
  currentPlayerId?: string;
}

export const PlayerGrid = memo(function PlayerGrid({
  players,
  currentPlayerId,
}: PlayerGridProps) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
      {players.map((player, index) => (
        <PlayerGridCard
          key={player.id}
          player={player}
          rank={index + 1}
          isCurrentPlayer={currentPlayerId === player.id}
        />
      ))}
    </div>
  );
});
