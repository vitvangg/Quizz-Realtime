'use client';

import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';

interface PodiumPlayerCardProps {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
  animationDelay?: number;
  isCurrentUser?: boolean;
}

export function PodiumPlayerCard({
  nickname,
  score,
  rank,
  animationDelay = 0,
  isCurrentUser = false,
}: PodiumPlayerCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), animationDelay);
    return () => clearTimeout(timer);
  }, [animationDelay]);

  const podiumHeight = rank === 1 ? 'h-48' : rank === 2 ? 'h-36' : 'h-28';
  const bgColor = rank === 1 ? 'bg-neon-yellow' : rank === 2 ? 'bg-gray-300' : 'bg-orange-400';
  const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
  const crownVisible = rank === 1;

  return (
    <div
      className={`
        relative flex flex-col items-center transition-all duration-500 ease-out
        ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-75'}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Crown for 1st place */}
      {crownVisible && (
        <div className="absolute -top-8 animate-bounce-slight">
          <div className="bg-neon-yellow border-4 border-black rounded-lg p-1 shadow-brutal-sm">
            <Crown className="w-8 h-8 text-neon-orange fill-current" />
          </div>
        </div>
      )}

      {/* Player avatar/icon */}
      <div
        className={`
          relative z-10 w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-black
          flex items-center justify-center text-2xl sm:text-3xl font-black
          shadow-brutal transition-all duration-200
          ${bgColor} ${isHovered ? 'scale-110' : ''}
          ${rank === 1 ? 'ring-4 ring-neon-pink ring-offset-2' : ''}
        `}
        style={{
          boxShadow: rank === 1 && isVisible ? '0 0 30px rgba(255, 107, 157, 0.6), 8px 8px 0px 0px #000' : undefined,
        }}
      >
        {nickname.charAt(0).toUpperCase()}
        {isCurrentUser && (
          <div className="absolute -bottom-1 -right-1 bg-neon-pink border-2 border-black rounded-full px-1">
            <span className="text-[8px] font-black text-white">YOU</span>
          </div>
        )}
      </div>

      {/* Medal badge */}
      <div className="absolute -top-2 right-0 bg-white border-3 border-black rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center shadow-brutal-sm">
        <span className="text-lg sm:text-xl">{medalEmoji}</span>
      </div>

      {/* Player info card */}
      <div
        className={`
          mt-2 bg-white border-4 border-black rounded-xl p-2 sm:p-3 text-center
          shadow-brutal transition-all duration-200 min-w-[100px] sm:min-w-[140px]
          ${isHovered ? '-translate-y-1 shadow-brutal-lg' : ''}
        `}
      >
        <p className="font-black text-sm sm:text-base text-black truncate max-w-full px-1">
          {nickname}
        </p>
        <p className="font-black text-lg sm:text-2xl text-neon-pink mt-1">
          {score.toLocaleString()}
        </p>
        <p className="text-xs font-bold text-black/50 uppercase">điểm</p>
      </div>

      {/* Podium base */}
      <div
        className={`
          ${podiumHeight} w-24 sm:w-32 mt-2 rounded-t-2xl border-4 border-black
          flex flex-col items-center justify-end pb-3
          ${bgColor} shadow-brutal
        `}
        style={{
          background: rank === 1
            ? 'linear-gradient(180deg, #FEFD2E 0%, #E5E500 100%)'
            : rank === 2
              ? 'linear-gradient(180deg, #D1D5DB 0%, #9CA3AF 100%)'
              : 'linear-gradient(180deg, #FB923C 0%, #EA580C 100%)',
          boxShadow: rank === 1
            ? 'inset 0 2px 10px rgba(255, 255, 255, 0.5), 8px 8px 0px 0px #000'
            : '8px 8px 0px 0px #000',
        }}
      >
        <span className="text-4xl sm:text-5xl font-black text-black/30">
          {rank === 1 ? '1' : rank === 2 ? '2' : '3'}
        </span>
      </div>
    </div>
  );
}
