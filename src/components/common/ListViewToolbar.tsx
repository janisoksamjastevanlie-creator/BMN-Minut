import React from 'react';
import { LayoutGrid, List } from 'lucide-react';

export type ListViewMode = 'cards' | 'table';

const ACCENT_CLASSES = {
  purple: { active: 'bg-purple-600 text-white', checkbox: 'text-purple-500 focus:ring-purple-500' },
  blue: { active: 'bg-blue-600 text-white', checkbox: 'text-blue-500 focus:ring-blue-500' },
  amber: { active: 'bg-amber-600 text-white', checkbox: 'text-amber-500 focus:ring-amber-500' },
  emerald: { active: 'bg-emerald-600 text-white', checkbox: 'text-emerald-500 focus:ring-emerald-500' },
  rose: { active: 'bg-rose-600 text-white', checkbox: 'text-rose-500 focus:ring-rose-500' },
  cyan: { active: 'bg-cyan-600 text-white', checkbox: 'text-cyan-500 focus:ring-cyan-500' }
} as const;

export type ListViewAccent = keyof typeof ACCENT_CLASSES;

export const ListViewToggle: React.FC<{
  view: ListViewMode;
  onChange: (view: ListViewMode) => void;
  accent?: ListViewAccent;
  label?: string;
}> = ({ view, onChange, accent = 'purple', label = 'Tampilan daftar' }) => {
  const active = ACCENT_CLASSES[accent].active;
  return (
    <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 p-0.5" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange('cards')}
        aria-pressed={view === 'cards'}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          view === 'cards' ? active : 'text-slate-400 hover:text-white'
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Kartu
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        aria-pressed={view === 'table'}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          view === 'table' ? active : 'text-slate-400 hover:text-white'
        }`}
      >
        <List className="w-3.5 h-3.5" />
        Tabel
      </button>
    </div>
  );
};

// Bilah alat daftar yang seragam: [Pilih Semua] ... [Kartu | Tabel] [N dipilih] [aksi tambahan].
export const ListViewToolbar: React.FC<{
  view: ListViewMode;
  onViewChange: (view: ListViewMode) => void;
  accent?: ListViewAccent;
  selectAll?: { checked: boolean; onChange: () => void; ariaLabel: string; disabled?: boolean };
  selectionText?: string;
  leading?: React.ReactNode;
  children?: React.ReactNode;
  /** true bila bilah alat menempel di bagian atas kartu/tabel (tanpa sudut membulat & bingkai luar). */
  embedded?: boolean;
}> = ({ view, onViewChange, accent = 'purple', selectAll, selectionText, leading, children, embedded = false }) => (
  <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-900 no-print ${
    embedded ? 'border-b border-slate-800' : 'rounded-xl border border-slate-800'
  }`}>
    <div className="flex items-center gap-3 min-h-[1.75rem]">
      {selectAll ? (
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={selectAll.checked}
            onChange={selectAll.onChange}
            disabled={selectAll.disabled}
            className={`h-4 w-4 rounded border-slate-600 bg-slate-950 ${ACCENT_CLASSES[accent].checkbox}`}
            aria-label={selectAll.ariaLabel}
          />
          Pilih Semua
        </label>
      ) : leading}
    </div>
    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
      <ListViewToggle view={view} onChange={onViewChange} accent={accent} />
      {selectionText && <span className="text-xs text-slate-400">{selectionText}</span>}
      {children}
    </div>
  </div>
);
