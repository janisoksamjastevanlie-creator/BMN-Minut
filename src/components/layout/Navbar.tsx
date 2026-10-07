import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search,
  Bell,
  Sparkles,
  User,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Cpu,
  Sliders,
  CheckCheck,
  Building,
  QrCode,
  Menu
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    currentUser,
    loginAs,
    logout,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    setIsGlobalSearchOpen,
    setIsAiAssistantOpen,
    setIsQrScannerOpen,
    performance3D,
    setPerformance3D,
    setActiveView,
    roles,
    hasPermission,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useApp();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPerfMenuOpen, setIsPerfMenuOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Branding & Mobile Menu Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Menu Hamburger Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Buka navigasi menu"
          >
            <Menu className="w-5 h-5 text-slate-300" />
          </button>

          {/* Official Emblem Placeholder for BPS Kabupaten Minahasa Utara */}
          <div
            onClick={() => setActiveView('dashboard')}
            className="cursor-pointer flex items-center gap-2.5 sm:gap-3 group"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-800 p-0.5 shadow-md shadow-blue-900/30 group-hover:scale-105 transition-transform shrink-0">
              <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center relative overflow-hidden">
                {/* Clean geometric BPS statistical badge */}
                <div className="flex items-end gap-0.5">
                  <div className="w-1.5 h-3 bg-blue-500 rounded-sm"></div>
                  <div className="w-1.5 h-4.5 bg-emerald-400 rounded-sm"></div>
                  <div className="w-1.5 h-6 bg-cyan-400 rounded-sm"></div>
                  <div className="w-1.5 h-3.5 bg-amber-400 rounded-sm"></div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-white tracking-wider text-sm sm:text-base bg-gradient-to-r from-white via-blue-100 to-cyan-300 bg-clip-text text-transparent">
                  SIMAN-BMN
                </span>
                <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-widest hidden xs:inline-block">
                  Minut
                </span>
              </div>
              <div className="text-[10px] text-slate-400 leading-tight tracking-tight hidden md:block">
                BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Global Search Bar (Ctrl + K) */}
        <div className="flex-1 max-w-md hidden sm:block">
          <button
            onClick={() => setIsGlobalSearchOpen(true)}
            className="w-full h-9 px-3 rounded-xl bg-slate-950/70 hover:bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700 flex items-center justify-between text-xs transition-colors shadow-inner"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Cari aset, persediaan, ruangan, kode NUP...</span>
            </div>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right Action Icons & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile search trigger */}
          <button
            onClick={() => setIsGlobalSearchOpen(true)}
            className="sm:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Quick Scan QR Button */}
          <button
            onClick={() => setIsQrScannerOpen(true)}
            title="Pindai QR / Barcode Aset"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors flex items-center gap-1.5 text-xs font-medium"
          >
            <QrCode className="w-4 h-4 text-cyan-400" />
            <span className="hidden lg:inline">Scan QR</span>
          </button>

          {/* AI Assistant Button */}
          <button
            onClick={() => setIsAiAssistantOpen(true)}
            className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600/30 to-cyan-600/30 hover:from-blue-600/40 hover:to-cyan-600/40 text-cyan-200 border border-cyan-500/30 transition-all flex items-center gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} />
            <span className="hidden md:inline">Tanya AI</span>
          </button>

          {/* 3D Performance Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsPerfMenuOpen(!isPerfMenuOpen)}
              title="Mode Performa 3D"
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              <Cpu className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] uppercase font-mono font-bold text-slate-400 hidden xl:inline">
                {performance3D}
              </span>
            </button>

            {isPerfMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50 text-xs">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  Mode Performa 3D
                </div>
                {(['normal', 'performance', 'low'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => {
                      setPerformance3D(mode);
                      setIsPerfMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-800 transition-colors ${
                      performance3D === mode ? 'text-blue-400 font-bold bg-blue-500/10' : 'text-slate-300'
                    }`}
                  >
                    <span className="capitalize">{mode} Mode</span>
                    {performance3D === mode && <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-slate-900 animate-pulse"></span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-sm sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50">
                <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Notifikasi Sistem</h4>
                    <p className="text-[10px] text-slate-400">{unreadCount} belum dibaca</p>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllNotificationsRead}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                    >
                      <CheckCheck className="w-3 h-3" />
                      <span>Tandai Semua</span>
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">Tidak ada notifikasi</div>
                  ) : (
                    notifications.map(notif => (
                      <div
                        key={notif.id}
                        onClick={() => {
                          markNotificationRead(notif.id);
                          if (notif.link) setActiveView(notif.link as any);
                          setIsNotifOpen(false);
                        }}
                        className={`p-3 text-xs hover:bg-slate-800/60 cursor-pointer transition-colors ${
                          !notif.read ? 'bg-blue-500/5' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-200">{notif.title}</span>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">{notif.timestamp}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{notif.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile & Role Switcher */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
            >
              <div className="w-7 h-7 rounded-lg overflow-hidden bg-blue-600 flex items-center justify-center font-bold text-xs text-white">
                {currentUser?.name.charAt(0) || 'U'}
              </div>
              <div className="hidden lg:block text-left text-xs leading-tight">
                <div className="font-bold text-slate-200 truncate max-w-[130px]">{currentUser?.name}</div>
                <div className="text-[10px] text-blue-400 font-medium">{currentUser?.role}</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-xs sm:w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 text-xs">
                <div className="p-3 bg-slate-950/60 rounded-xl mb-2 border border-slate-800/80">
                  <div className="font-bold text-white text-sm">{currentUser?.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">NIP: {currentUser?.nip}</div>
                  <div className="text-[11px] text-blue-400 font-medium mt-0.5">{currentUser?.unitKerja}</div>
                  <div className="inline-block mt-2 px-2 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded font-semibold text-[10px]">
                    Role: {currentUser?.role}
                  </div>
                </div>

                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Beralih Role (Demo Multi-Role RBAC):
                </div>
                <div className="grid grid-cols-2 gap-1 mb-2 max-h-36 overflow-y-auto pr-0.5">
                  {roles.map(r => (
                    <button
                      key={r.id}
                      onClick={() => {
                        loginAs(r.name);
                        setIsProfileOpen(false);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-left text-[11px] transition-colors truncate ${
                        currentUser?.role === r.name
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-slate-800/50 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">{r.name}</span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-slate-800 pt-1 space-y-1">
                  {(hasPermission('manageUsers') || hasPermission('manageRoles')) && (
                    <button
                      onClick={() => {
                        setIsProfileOpen(false);
                        setActiveView('users');
                      }}
                      className="w-full px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl flex items-center gap-2 font-medium transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-blue-400" />
                      <span>Manajemen Pengguna</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      logout();
                    }}
                    className="w-full px-3 py-2 text-rose-400 hover:bg-rose-500/10 rounded-xl flex items-center gap-2 font-medium transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Keluar dari Akun</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
