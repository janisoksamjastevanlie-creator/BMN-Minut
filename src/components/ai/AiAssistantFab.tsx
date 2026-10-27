import React from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Tombol mengambang "Tanya AI" (icon-only).
 *
 * Mengikuti pola floating action button yang umum dipakai aplikasi modern:
 * bulat, kontras tinggi, satu aksi utama, label hanya muncul sebagai tooltip
 * saat hover/fokus sehingga tampilan tetap bersih.
 */
export const AiAssistantFab: React.FC = () => {
  const { isAiAssistantOpen, setIsAiAssistantOpen } = useApp();

  if (isAiAssistantOpen) return null;

  return (
    <div className="no-print group fixed bottom-20 right-4 z-40 sm:bottom-6 sm:right-6">
      {/* Tooltip (desktop only, muncul saat hover atau keyboard focus) */}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-slate-100 opacity-0 shadow-lg ring-1 ring-white/10 transition-all duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:block"
      >
        Tanya AI
        <span
          aria-hidden="true"
          className="absolute left-full top-1/2 -ml-px h-2 w-2 -translate-y-1/2 rotate-45 bg-slate-900 ring-1 ring-white/10"
        />
      </span>

      <button
        type="button"
        onClick={() => setIsAiAssistantOpen(true)}
        aria-label="Tanya AI"
        aria-haspopup="dialog"
        title="Tanya AI"
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-950/40 ring-1 ring-white/20 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-cyan-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-95"
      >
        {/* Glow halus di belakang tombol */}
        <span
          aria-hidden="true"
          className="absolute -inset-1 -z-10 rounded-full bg-gradient-to-br from-blue-500/30 to-cyan-400/30 opacity-70 blur-md transition-opacity duration-200 group-hover:opacity-100"
        />
        <Sparkles className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
};
