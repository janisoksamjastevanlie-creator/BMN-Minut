/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  /** Judul halaman/view untuk pesan yang lebih informatif. */
  label?: string;
  /** Dipanggil saat pengguna memilih "Coba lagi" tanpa memuat ulang halaman. */
  onReset?: () => void;
  /** Navigasi pulang; bila tidak diberikan, tombol memakai setActiveView('dashboard') melalui onReset. */
  onGoHome?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Penangkap error tingkat view. Tanpa boundary ini, satu kesalahan render pada
 * sebuah halaman (mis. ikon yang belum diimpor) akan membongkar seluruh pohon
 * React dan membuat aplikasi tampil kosong. Di sini error hanya mengisolasi
 * halaman yang bermasalah dan menampilkan panel pemulihan, sementara navbar,
 * sidebar, dan halaman lain tetap utuh.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Catat ke konsol untuk diagnostik; stack komponen membantu melacak view asal.
    console.error('[ErrorBoundary] Render halaman gagal:', error, info?.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleHome = (): void => {
    if (this.props.onGoHome) {
      this.setState({ hasError: false, error: null });
      this.props.onGoHome();
      return;
    }
    this.handleRetry();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    const { label } = this.props;
    const message = this.state.error?.message || 'Terjadi kesalahan tak terduga.';

    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 sm:p-8 text-center space-y-4"
      >
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-500/15 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-white">
            Halaman{label ? ` "${label}"` : ' ini'} gagal ditampilkan
          </h2>
          <p className="text-xs text-slate-400">
            Sistem tetap berjalan. Halaman lain tidak terpengaruh. Silakan coba lagi atau kembali ke dasbor.
          </p>
        </div>
        <p className="mx-auto max-w-md break-words rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 font-mono text-[11px] text-rose-300">
          {message}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Coba lagi
          </button>
          <button
            type="button"
            onClick={this.handleHome}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            <Home className="h-3.5 w-3.5" />
            Ke Dasbor
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            Muat ulang aplikasi
          </button>
        </div>
      </div>
    );
  }
}
