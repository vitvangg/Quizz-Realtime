'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuizPaginationProps } from '@/types/quiz.type';



export function QuizPagination({
  page,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPrev,
  onNext,
  onPageChange,
  showItemRange = true,
  className = '',
}: QuizPaginationProps) {
  // Don't render if only 1 page and all items are visible
  if (totalPages <= 1 && totalItems <= (endIndex - startIndex + 1)) {
    return null;
  }

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 mt-10 ${className}`}>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={page <= 1}
          className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed h-12 w-12 p-0 bg-white"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        <div className="bg-black text-white px-4 py-2 border-4 border-black font-black text-sm uppercase tracking-wider shadow-brutal-sm">
          Trang {page} / {totalPages}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={page >= totalPages}
          className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed h-12 w-12 p-0 bg-white"
        >
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>

      {showItemRange && totalItems > 0 && (
        <div className="bg-neon-yellow border-4 border-black px-4 py-2 font-bold text-sm shadow-brutal-sm">
          Hiển thị {startIndex}-{endIndex} / {totalItems} bộ câu hỏi
        </div>
      )}
    </div>
  );
}
