import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { OfficeTwin3D } from '../components/3d/OfficeTwin3D';
import { Lock, User, ArrowRight } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, syncError } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Gagal masuk. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 overflow-hidden">
      {/* 3D Background with Dark Glass Overlay */}
      <div className="absolute inset-0 z-0 opacity-40 scale-105 pointer-events-none blur-[1px]">
        <OfficeTwin3D />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-0"></div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md bg-slate-900/90 backdrop-blur-2xl border border-slate-700/80 rounded-3xl p-8 shadow-2xl shadow-black/80 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          {/* Official Emblem Geometric Placeholder */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-800 p-0.5 shadow-xl shadow-blue-900/40">
            <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center">
              <img src="/bps-minut-logo.png" alt="Logo BPS Minahasa Utara" className="w-full h-full object-contain" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-wider text-white bg-gradient-to-r from-white via-blue-100 to-cyan-300 bg-clip-text text-transparent">
              BMN BPS MINUT
            </h1>
            <p className="text-xs font-semibold text-blue-300 tracking-wide mt-1">
              Sistem Informasi Manajemen Aset BMN & Persediaan
            </p>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
            </p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {syncError && (
            <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Server/data belum siap: {syncError}
            </p>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              NIP / Username BPS
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Masukkan NIP"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Kata Sandi (Password)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Sesi login berlaku maksimal 12 jam.</span>
            <span className="text-[11px] text-blue-400 cursor-pointer hover:underline">
              Bantuan SSO BPS
            </span>
          </div>

          {loginError && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
          >
            <span>{isSubmitting ? 'Memeriksa akun...' : 'Masuk ke Sistem'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Footer */}
        <div className="text-center text-[10px] text-slate-400">
          © 2026 BPS Kabupaten Minahasa Utara • Satker 7106
        </div>
      </div>
    </div>
  );
};
