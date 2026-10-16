import React from 'react';
import { useApp } from '../context/AppContext';

export const NotFoundView: React.FC = () => {
  const { currentUser, setActiveView } = useApp();
  return (
    <div className="min-h-screen grid place-items-center bg-slate-950 px-4 text-slate-100">
      <div className="max-w-md text-center">
        <p className="text-sm font-bold tracking-[0.3em] text-blue-400">404</p>
        <h1 className="mt-3 text-2xl font-extrabold">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-slate-400">URL yang dibuka tidak cocok dengan halaman yang tersedia.</p>
        <button
          type="button"
          onClick={() => setActiveView(currentUser ? 'dashboard' : 'login')}
          className="mt-6 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500"
        >
          {currentUser ? 'Kembali ke Dashboard' : 'Masuk'}
        </button>
      </div>
    </div>
  );
};
