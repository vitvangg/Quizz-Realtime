'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onPageChange?: (page: number) => void;
  showItemRange?: boolean;
  className?: string;
}

export function PaginationControls({
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
}: PaginationControlsProps) {
  // Don't render if only 1 page
  if (totalPages <= 1 && totalItems <= (endIndex - startIndex + 1)) {
    return null;
  }

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={page <= 1}
          className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed h-10 px-3"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>

        <span className="font-bold text-sm text-black whitespace-nowrap">
          Trang {page} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={page >= totalPages}
          className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed h-10 px-3"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {showItemRange && totalItems > 0 && (
        <span className="text-sm font-medium text-black/60">
          Hiển thị {startIndex}-{endIndex} / {totalItems} người chơi
        </span>
      )}
    </div>
  );
}
