import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { OfficeTwin3D } from '../components/3d/OfficeTwin3D';
import { ShieldCheck, Lock, User, ArrowRight, Sparkles, Building2 } from 'lucide-react';
import { INITIAL_USERS } from '../data/initialData';

export const LoginView: React.FC = () => {
  const { loginAs, setActiveView, roles, users } = useApp();
  const [username, setUsername] = useState('197405121998031002');
  const [password, setPassword] = useState('••••••••••••');
  const [rememberMe, setRememberMe] = useState(true);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginAs('Pimpinan');
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
              <div className="flex items-end gap-1">
                <div className="w-2 h-4 bg-blue-500 rounded-sm"></div>
                <div className="w-2 h-6 bg-emerald-400 rounded-sm"></div>
                <div className="w-2 h-8 bg-cyan-400 rounded-sm"></div>
                <div className="w-2 h-5 bg-amber-400 rounded-sm"></div>
              </div>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-wider text-white bg-gradient-to-r from-white via-blue-100 to-cyan-300 bg-clip-text text-transparent">
              SIMAN-BMN
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
                placeholder="198503202008011003"
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
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
              />
              <span>Ingat Sesi Saya</span>
            </label>

            <span className="text-[11px] text-blue-400 cursor-pointer hover:underline">
              Bantuan SSO BPS
            </span>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
          >
            <span>Masuk ke Sistem</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Demo Fast Login Switcher as specified in Prompt #5 */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
            Pilih Role Cepat (Demo Mode Enterprise):
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs max-h-44 overflow-y-auto pr-0.5">
            {roles.map(r => {
              const matchedUser = users.find(u => u.role.toLowerCase() === r.name.toLowerCase());
              const colorText =
                r.color === 'purple' ? 'text-purple-400' :
                r.color === 'blue' ? 'text-blue-400' :
                r.color === 'cyan' ? 'text-cyan-400' :
                r.color === 'amber' ? 'text-amber-400' :
                r.color === 'emerald' ? 'text-emerald-400' :
                r.color === 'rose' ? 'text-rose-400' :
                r.color === 'orange' ? 'text-orange-400' : 'text-indigo-400';

              return (
                <button
                  key={r.id}
                  onClick={() => loginAs(r.name)}
                  className="p-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-slate-200 border border-slate-800 text-left transition-colors"
                >
                  <div className={`font-bold ${colorText} truncate`}>{r.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {matchedUser ? matchedUser.name.split(',')[0] : `[${r.code}]`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-slate-400">
          © 2026 BPS Kabupaten Minahasa Utara • Satker 7106
        </div>
      </div>
    </div>
  );
};
