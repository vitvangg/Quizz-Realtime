'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { PaginationControls } from '@/components/common/PaginationControls';
import { usePagination } from '@/hooks/usePagination';

interface PlayerListEntry {
  playerId: string;
  nickname: string;
  rank: number;
  connection?: 'CONNECTED' | 'LEFT' | 'DISCONNECTED' | null;
  hasAnswered?: boolean;
}

interface PlayerListPanelProps {
  entries: PlayerListEntry[];
  pageSize?: number;
}

export function PlayerListPanel({ entries, pageSize = 15 }: PlayerListPanelProps) {
  const activeCount = entries.filter(e => e.connection !== 'LEFT').length;
  
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

  return (
    <Card className="bg-white border-4 border-black shadow-brutal">
      <CardHeader className="bg-neon-green border-b-4 border-black pb-3">
        <div className="flex justify-between items-center gap-4">
          <CardTitle className="text-xl font-black text-black flex items-center gap-2">
            <Users className="w-6 h-6" />
            Người chơi ({totalItems})
          </CardTitle>
          <span className="text-sm font-bold text-black/70">
            {activeCount} active
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {shouldShowPagination && (
          <div className="mb-3">
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
        <div className="max-h-64 overflow-y-auto space-y-2">
          {paginatedItems.map((entry) => (
            <div key={entry.playerId} className="flex items-center justify-between p-2 bg-gray-100 rounded-lg border-2 border-black">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-black/50 w-6">#{entry.rank}</span>
                <span className="font-bold text-black">{entry.nickname}</span>
                <span className={`
                  text-xs font-bold px-2 py-0.5 rounded border
                  ${entry.connection === 'CONNECTED' ? 'bg-green-400 text-black border-black' : ''}
                  ${entry.connection === 'LEFT' ? 'bg-gray-400 text-black border-black line-through' : ''}
                  ${entry.connection === 'DISCONNECTED' ? 'bg-orange-400 text-black border-black' : ''}
                  ${!entry.connection ? 'bg-gray-300 text-black border-black' : ''}
                `}>
                  {entry.connection === 'CONNECTED' ? 'Online' : entry.connection === 'LEFT' ? 'Đã rời' : entry.connection === 'DISCONNECTED' ? 'Mất kết nối' : 'Offline'}
                </span>
                <span className={`
                  text-xs font-bold px-2 py-0.5 rounded border
                  ${entry.hasAnswered ? 'bg-neon-green text-black border-black' : 'bg-gray-300 text-black border-black'}
                `}>
                  {entry.hasAnswered ? 'Đã trả lời' : 'Chưa trả lời'}
                </span>
              </div>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-center text-black/50 font-bold">Chưa có người chơi</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
