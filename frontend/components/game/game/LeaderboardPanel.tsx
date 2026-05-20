'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Trophy, Crown } from 'lucide-react';
import { PaginationControls } from '@/components/common/PaginationControls';
import { usePagination } from '@/hooks/usePagination';

interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
  connection?: 'CONNECTED' | 'LEFT' | 'DISCONNECTED' | null;
  hasAnswered?: boolean;
}

interface LeaderboardPanelProps {
  entries: LeaderboardEntry[];
  pageSize?: number;
  showConnectionStatus?: boolean;
  showAnswerStatus?: boolean;
  variant?: 'full' | 'compact';
  title?: string;
}

export function LeaderboardPanel({
  entries,
  pageSize = 20,
  showConnectionStatus = false,
  showAnswerStatus = false,
  variant = 'full',
  title = 'Bảng xếp hạng',
}: LeaderboardPanelProps) {
  const {
    page,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    paginatedItems,
    shouldShowPagination,
  } = usePagination(entries, { pageSize });

  const getEntryClass = (rank: number) => {
    if (rank === 1) return 'bg-neon-yellow shadow-brutal';
    if (rank === 2) return 'bg-gray-300 shadow-brutal-sm';
    if (rank === 3) return 'bg-orange-400 shadow-brutal-sm';
    return 'bg-white shadow-brutal-sm';
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return '👑';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  };

  if (variant === 'compact') {
    return (
      <div className="space-y-2">
        {entries.slice(0, 5).map((entry) => (
          <div
            key={entry.playerId}
            className="flex items-center justify-between p-2 bg-white/80 rounded-lg border-2 border-black"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-black">{getRankEmoji(entry.rank)}</span>
              <span className="font-medium text-black truncate max-w-[100px]">{entry.nickname}</span>
            </div>
            <span className="font-bold text-neon-pink">{entry.score} pts</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card className="mb-6 bg-white border-4 border-black shadow-brutal">
      <CardHeader className="bg-neon-yellow border-b-4 border-black pb-4">
        <CardTitle className="text-xl font-black uppercase flex items-center gap-2">
          <Trophy className="w-6 h-6 text-black" />
          {title} ({totalItems})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {shouldShowPagination && (
          <div className="mb-4">
            <PaginationControls
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              onPrev={prevPage}
              onNext={nextPage}
            />
          </div>
        )}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {paginatedItems.map((entry) => (
            <div
              key={entry.playerId}
              className={`flex justify-between items-center p-4 rounded-xl border-4 border-black ${getEntryClass(entry.rank)}`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-10 h-10 rounded-lg border-4 border-black flex items-center justify-center text-lg ${
                  entry.rank === 1 ? 'bg-black text-neon-yellow' : 'bg-black/20 text-black'
                }`}>
                  {getRankEmoji(entry.rank)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-black">{entry.nickname}</span>
                  {showConnectionStatus && (
                    <span className={`
                      text-xs font-bold px-2 py-0.5 rounded border-2 border-black
                      ${entry.connection === 'CONNECTED' ? 'bg-green-400 text-black' : ''}
                      ${entry.connection === 'LEFT' ? 'bg-gray-400 text-black line-through' : ''}
                      ${entry.connection === 'DISCONNECTED' ? 'bg-orange-400 text-black' : ''}
                      ${!entry.connection ? 'bg-gray-300 text-black' : ''}
                    `}>
                      {entry.connection === 'CONNECTED' ? 'Online' : entry.connection === 'LEFT' ? 'Đã rời' : entry.connection === 'DISCONNECTED' ? 'Mất kết nối' : 'Offline'}
                    </span>
                  )}
                  {showAnswerStatus && (
                    <span className={`
                      text-xs font-bold px-2 py-0.5 rounded border-2 border-black
                      ${entry.hasAnswered ? 'bg-neon-green text-black border-black' : 'bg-gray-300 text-black border-black'}
                    `}>
                      {entry.hasAnswered ? 'Đã trả lời' : 'Chưa trả lời'}
                    </span>
                  )}
                </div>
              </div>
              <span className="font-black text-xl text-black">{entry.score} pts</span>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-center font-bold text-black/50 uppercase">Chưa có dữ liệu</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
