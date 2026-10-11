import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 0] as const;
export const DEFAULT_PAGE_SIZE = 10;

// pageSize 0 berarti "Semua data".
export const resolvePageSize = (pageSize: number, total: number) =>
  pageSize === 0 ? Math.max(1, total) : pageSize;

export const PageSizeSelect: React.FC<{
  value: number;
  onChange: (value: number) => void;
}> = ({ value, onChange }) => (
  <label className="flex items-center gap-1.5 text-xs text-slate-400">
    <span>Tampilkan</span>
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      aria-label="Jumlah data yang ditampilkan"
      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {PAGE_SIZE_OPTIONS.map(option => (
        <option key={option} value={option}>
          {option === 0 ? 'Semua data' : `${option} data`}
        </option>
      ))}
    </select>
  </label>
);

export function usePagedList<T>(items: T[], initialSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialSize);

  const perPage = resolvePageSize(pageSize, items.length);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return items.slice(start, start + perPage);
  }, [items, currentPage, perPage]);

  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
  };

  return {
    page: currentPage,
    setPage,
    pageSize,
    setPageSize,
    perPage,
    totalPages,
    total: items.length,
    pageItems,
    offset: (currentPage - 1) * perPage
  };
}

export const ListPager: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  label?: string;
}> = ({ page, totalPages, total, perPage, pageSize, onPageChange, onPageSizeChange, label = 'data' }) => (
  <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
    <div className="flex flex-wrap items-center gap-3">
      <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      <span>
        Menampilkan{' '}
        <span className="font-bold text-white">{total === 0 ? 0 : (page - 1) * perPage + 1}</span> -{' '}
        <span className="font-bold text-white">{Math.min(page * perPage, total)}</span> dari{' '}
        <span className="font-bold text-white">{total}</span> {label}
      </span>
    </div>
    {totalPages > 1 && (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Halaman sebelumnya"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-3 py-1 bg-slate-800 rounded-lg text-white font-mono font-bold">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          aria-label="Halaman berikutnya"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    )}
  </div>
);
