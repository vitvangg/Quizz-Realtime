'use client';

import { usePagination } from '@/hooks/usePagination';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Trophy, Crown, Medal } from 'lucide-react';
import { PaginationControls } from '@/components/common/PaginationControls';

interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
  connection?: 'CONNECTED' | 'LEFT' | 'DISCONNECTED' | null;
  hasAnswered?: boolean;
}

interface FinalLeaderboardProps {
  entries: LeaderboardEntry[];
  pageSize?: number;
  showConnectionStatus?: boolean;
  currentPlayerId?: string | null;
  title?: string;
}

export function FinalLeaderboard({
  entries,
  pageSize = 20,
  showConnectionStatus = false,
  currentPlayerId,
  title = 'Bảng xếp hạng cuối cùng',
}: FinalLeaderboardProps) {
  const {
    page,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    nextPage,
    prevPage,
    paginatedItems,
    shouldShowPagination,
  } = usePagination(entries, { pageSize });

  const getRankStyle = (rank: number) => {
    if (rank === 1) {
      return {
        bg: 'bg-gradient-to-br from-neon-yellow to-yellow-300',
        border: 'border-neon-yellow',
        glow: 'shadow-neon-yellow',
        icon: <Crown className="w-5 h-5 text-neon-orange fill-current" />,
      };
    }
    if (rank === 2) {
      return {
        bg: 'bg-gradient-to-br from-gray-300 to-gray-400',
        border: 'border-gray-400',
        glow: '',
        icon: <Medal className="w-5 h-5 text-gray-600 fill-current" />,
      };
    }
    if (rank === 3) {
      return {
        bg: 'bg-gradient-to-br from-orange-400 to-orange-500',
        border: 'border-orange-500',
        glow: '',
        icon: <Medal className="w-5 h-5 text-orange-700 fill-current" />,
      };
    }
    return {
      bg: 'bg-white',
      border: 'border-black',
      glow: '',
      icon: null,
    };
  };

  const getRankNumber = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  if (entries.length === 0) {
    return (
      <Card className="bg-white border-4 border-black shadow-brutal">
        <CardHeader className="bg-neon-blue border-b-4 border-black pb-4">
          <CardTitle className="text-xl font-black uppercase flex items-center gap-2">
            <Trophy className="w-6 h-6 text-white" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-12 text-center">
          <p className="font-bold text-black/50 uppercase">Chưa có dữ liệu người chơi</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border-4 border-black shadow-brutal overflow-hidden">
      <CardHeader className="bg-neon-blue border-b-4 border-black pb-4">
        <CardTitle className="text-xl font-black uppercase flex items-center gap-2">
          <Trophy className="w-6 h-6 text-white" />
          {title}
          <span className="ml-auto text-base font-bold text-white/80">
            ({totalItems} người chơi)
          </span>
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
        <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
          {paginatedItems.map((entry, index) => {
            const style = getRankStyle(entry.rank);
            const isCurrentUser = entry.playerId === currentPlayerId;

            return (
              <div
                key={entry.playerId}
                className={`
                  flex items-center justify-between p-4 rounded-xl border-4 border-black
                  ${style.bg} ${isCurrentUser ? 'ring-4 ring-neon-pink ring-offset-2' : ''}
                  shadow-brutal transition-all duration-200 hover:scale-[1.01] hover:shadow-brutal-lg
                  animate-slide-up
                `}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    w-12 h-12 rounded-xl border-4 border-black flex items-center justify-center
                    font-black text-xl
                    ${entry.rank <= 3 ? 'bg-black/20 text-black' : 'bg-neon-blue text-black'}
                  `}>
                    {getRankNumber(entry.rank)}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-lg text-black">{entry.nickname}</span>
                      {isCurrentUser && (
                        <span className="text-xs font-bold px-2 py-0.5 bg-neon-pink border-2 border-black rounded text-white">
                          BẠN
                        </span>
                      )}
                    </div>
                    {showConnectionStatus && (
                      <span className={`
                        text-xs font-bold px-2 py-0.5 rounded border-2 border-black w-fit
                        ${entry.connection === 'CONNECTED' ? 'bg-green-400 text-black' : ''}
                        ${entry.connection === 'LEFT' ? 'bg-gray-400 text-black line-through' : ''}
                        ${entry.connection === 'DISCONNECTED' ? 'bg-orange-400 text-black' : ''}
                        ${!entry.connection ? 'bg-gray-300 text-black' : ''}
                      `}>
                        {entry.connection === 'CONNECTED' ? 'Online' :
                         entry.connection === 'LEFT' ? 'Đã rời' :
                         entry.connection === 'DISCONNECTED' ? 'Mất kết nối' : 'Offline'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-black text-2xl text-black">{entry.score.toLocaleString()}</span>
                  <span className="text-sm font-bold text-black/50 ml-1">pts</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
