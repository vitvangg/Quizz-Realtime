'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';

export interface UsePaginationOptions {
  pageSize?: number;
  initialPage?: number;
}

export interface UsePaginationReturn<T> {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  paginatedItems: T[];
  startIndex: number;
  endIndex: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: () => void;
  prevPage: () => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  resetPage: () => void;
  shouldShowPagination: boolean;
}

export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
): UsePaginationReturn<T> {
  const { pageSize: initialPageSize = 20, initialPage = 1 } = options;

  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Calculate total pages whenever items or pageSize changes
  const totalPages = useMemo(() => {
    if (items.length === 0) return 1;
    return Math.max(1, Math.ceil(items.length / pageSize));
  }, [items.length, pageSize]);

  // Clamp page when totalPages changes (e.g., after items are removed)
  useEffect(() => {
    if (page > totalPages) {
      setPage(Math.max(1, totalPages));
    }
  }, [totalPages, page]);

  // Paginated items
  const paginatedItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return items.slice(startIndex, endIndex);
  }, [items, page, pageSize]);

  // Start and end indices for display
  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, items.length);

  // Navigation functions
  const nextPage = useCallback(() => {
    setPage((currentPage) => Math.min(currentPage + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage((currentPage) => Math.max(currentPage - 1, 1));
  }, []);

  const goToPage = useCallback((targetPage: number) => {
    const clampedPage = Math.max(1, Math.min(targetPage, totalPages));
    setPage(clampedPage);
  }, [totalPages]);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  // Helper flags
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Whether pagination UI should be shown (only when there are multiple pages)
  const shouldShowPagination = totalPages > 1;

  return {
    page,
    pageSize,
    totalItems: items.length,
    totalPages,
    paginatedItems,
    startIndex,
    endIndex,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    setPage: goToPage,
    setPageSize,
    resetPage,
    shouldShowPagination,
  };
}
