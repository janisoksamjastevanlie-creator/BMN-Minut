import React from 'react';
import { useApp } from '../context/AppContext';
import { VIEW_ACCESS_CONFIGS, getFirstAllowedView } from '../utils/rbac';
import {
  ShieldAlert,
  Lock,
  ArrowLeft,
  LogIn,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  UserCheck
} from 'lucide-react';

export const AccessDeniedView: React.FC = () => {
  const { activeView, setActiveView, currentUser, roles, loginAs, hasPermission } = useApp();

  const viewConfig = VIEW_ACCESS_CONFIGS[activeView] || {
    label: activeView,
    category: 'Modul Sistem',
    requiredPermissions: [],
    description: 'Modul aplikasi SIMAN BPS'
  };

  const currentRoleDef = roles.find(
    r => r.name.toLowerCase() === (currentUser?.role || '').toLowerCase()
  );

  const fallbackView = getFirstAllowedView(hasPermission, currentUser);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900/90 border border-rose-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-rose-950/20 backdrop-blur-md space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header with Glowing Shield */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 shadow-lg shadow-rose-950/50">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold uppercase tracking-wider">
              <Lock className="w-3 h-3" />
              <span>Akses Dibatasi (RBAC Restricted)</span>
            </div>
            <h2 className="text-xl font-extrabold text-white mt-1">
              Tidak Memiliki Izin Akses
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Anda tidak memiliki wewenang untuk membuka modul <span className="font-bold text-white">"{viewConfig.label}"</span>.
            </p>
            {activeView === 'rooms' && (
              <div className="mt-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl font-medium">
                Sesuai kebijakan penatausahaan aset BPS, modul Manajemen Ruangan & DBR hanya dapat diakses oleh <span className="font-bold text-white">Pimpinan</span>, <span className="font-bold text-white">Administrator</span>, dan <span className="font-bold text-white">Pengelola BMN</span>.
              </div>
            )}
          </div>
        </div>

        {/* User Identity & Role Box */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Identitas Akun Saat Ini:
            </span>
            <span className="text-[10px] font-mono text-slate-500">Satker 7106 BPS</span>
          </div>

          <div className="flex items-center gap-3">
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shrink-0">
                {currentUser?.name?.charAt(0) || 'U'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate">{currentUser?.name}</div>
              <div className="text-[11px] font-mono text-slate-400">NIP: {currentUser?.nip}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Peran: {currentUser?.role}
                </span>
                <span className="text-[10px] text-slate-400 truncate">
                  • {currentUser?.unitKerja}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Required Permission Details */}
        <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 space-y-2.5">
          <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>Persyaratan Hak Akses Modul Ini:</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {viewConfig.description}
          </p>

          {viewConfig.requiredPermissions.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Izin yang Diperlukan:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {viewConfig.requiredPermissions.map(perm => {
                  const isGranted = hasPermission(perm);
                  return (
                    <span
                      key={perm}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                        isGranted
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      <span>{isGranted ? '✓ Diizinkan' : '✕ Tidak Ada Izin'}:</span>
                      <span className="font-mono">{perm}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Quick Demo Switch Role (Helper for review / testing) */}
        <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80 space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Uji Peran Lain (Demo Switch):</span>
            <span className="text-slate-500 font-normal">Pilih role untuk beralih</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {roles.slice(0, 4).map(r => (
              <button
                key={r.id}
                onClick={() => loginAs(r.name)}
                className={`px-2 py-1.5 rounded-xl border text-left text-xs font-semibold transition-colors truncate ${
                  currentUser?.role === r.name
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="truncate">{r.name}</div>
                <div className="text-[9px] opacity-70 font-mono">[{r.code}]</div>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-800">
          <button
            onClick={() => setActiveView(fallbackView)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Menu Diizinkan ({fallbackView})</span>
          </button>

          <button
            onClick={() => setActiveView('dashboard')}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            Buka Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
