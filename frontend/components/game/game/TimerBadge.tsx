'use client';

import { Clock } from 'lucide-react';

interface TimerBadgeProps {
  timeRemaining: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function TimerBadge({ timeRemaining, size = 'md', showLabel = true }: TimerBadgeProps) {
  const isLow = timeRemaining <= 5;

  const sizeClasses = {
    sm: 'px-3 py-1 text-lg',
    md: 'px-6 py-3 text-2xl',
    lg: 'px-8 py-4 text-3xl',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div
      className={`
        inline-flex items-center gap-2 border-4 border-black shadow-brutal font-black uppercase
        ${isLow ? 'bg-red-500 text-white animate-pulse' : 'bg-neon-green text-white'}
        ${sizeClasses[size]}
      `}
    >
      <Clock className={iconSizes[size]} />
      <span>{timeRemaining}s</span>
    </div>
  );
}
