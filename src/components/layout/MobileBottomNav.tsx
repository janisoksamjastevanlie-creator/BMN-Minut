import React from 'react';
import { useApp, ActiveView } from '../../context/AppContext';
import { canAccessView } from '../../utils/rbac';
import {
  LayoutDashboard,
  Boxes,
  Warehouse,
  ClipboardList,
  Menu,
  Crown
} from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const {
    activeView,
    setActiveView,
    currentUser,
    hasPermission,
    inventoryItems,
    requests,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useApp();

  const pendingRequestsCount = requests.filter(r => r.status === 'Diajukan' || r.status === 'Diverifikasi').length;
  const lowStockCount = inventoryItems.filter(i => i.status === 'Menipis' || i.status === 'Habis').length;

  const isBmnActive = ['assets', 'rooms', 'office-3d', 'movements', 'maintenance', 'disposal'].includes(activeView);
  const isInvActive = ['inventory', 'warehouse-3d', 'stock-opname'].includes(activeView);
  const isReqActive = activeView === 'requests';
  const isHomeActive = activeView === 'dashboard' || activeView === 'executive';

  // Check permissions
  const canSeeDashboard = canAccessView('dashboard', hasPermission, currentUser);
  const canSeeBmn = canAccessView('assets', hasPermission, currentUser);
  const canSeeInv = canAccessView('inventory', hasPermission, currentUser);
  const canSeeReq = canAccessView('requests', hasPermission, currentUser);

  return (
    <nav
      aria-label="Mobile Navigation Bar"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] transition-all"
    >
      <div className="grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-1">
        {/* 1. Beranda / Dashboard */}
        {canSeeDashboard && (
          <button
            onClick={() => {
              setActiveView('dashboard');
              if (isMobileMenuOpen) setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors relative py-1 ${
              isHomeActive ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-xl transition-all ${isHomeActive ? 'bg-blue-500/20 shadow-sm' : ''}`}>
              <LayoutDashboard className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-medium truncate max-w-full px-1">
              Beranda
            </span>
            {isHomeActive && (
              <span className="absolute top-1 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            )}
          </button>
        )}

        {/* 2. Aset BMN */}
        {canSeeBmn && (
          <button
            onClick={() => {
              setActiveView('assets');
              if (isMobileMenuOpen) setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors relative py-1 ${
              isBmnActive ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-xl transition-all ${isBmnActive ? 'bg-blue-500/20 shadow-sm' : ''}`}>
              <Boxes className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-medium truncate max-w-full px-1">
              Aset BMN
            </span>
            {isBmnActive && (
              <span className="absolute top-1 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            )}
          </button>
        )}

        {/* 3. Persediaan ATK */}
        {canSeeInv && (
          <button
            onClick={() => {
              setActiveView('inventory');
              if (isMobileMenuOpen) setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors relative py-1 ${
              isInvActive ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-xl relative transition-all ${isInvActive ? 'bg-amber-500/20 shadow-sm' : ''}`}>
              <Warehouse className="w-5 h-5 shrink-0" />
              {lowStockCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900"></span>
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-medium truncate max-w-full px-1">
              Persediaan
            </span>
            {isInvActive && (
              <span className="absolute top-1 w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            )}
          </button>
        )}

        {/* 4. Permohonan */}
        {canSeeReq ? (
          <button
            onClick={() => {
              setActiveView('requests');
              if (isMobileMenuOpen) setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors relative py-1 ${
              isReqActive ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-xl relative transition-all ${isReqActive ? 'bg-cyan-500/20 shadow-sm' : ''}`}>
              <ClipboardList className="w-5 h-5 shrink-0" />
              {pendingRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1.5 px-1 py-0.2 rounded-full bg-blue-500 text-white font-mono text-[9px] font-bold leading-tight">
                  {pendingRequestsCount}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-medium truncate max-w-full px-1">
              Permohonan
            </span>
            {isReqActive && (
              <span className="absolute top-1 w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            )}
          </button>
        ) : (
          <button
            onClick={() => {
              setActiveView('executive');
              if (isMobileMenuOpen) setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors relative py-1 ${
              activeView === 'executive' ? 'text-purple-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-xl transition-all ${activeView === 'executive' ? 'bg-purple-500/20 shadow-sm' : ''}`}>
              <Crown className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-medium truncate max-w-full px-1">
              Pimpinan
            </span>
          </button>
        )}

        {/* 5. Menu Drawer Trigger */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors relative py-1 ${
            isMobileMenuOpen ? 'text-white font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Buka Semua Menu Sistem"
        >
          <div className={`p-1 rounded-xl transition-all ${isMobileMenuOpen ? 'bg-slate-700/80 shadow-sm' : ''}`}>
            <Menu className="w-5 h-5 shrink-0" />
          </div>
          <span className="text-[10px] tracking-tight mt-0.5 font-medium truncate max-w-full px-1">
            Menu
          </span>
          {isMobileMenuOpen && (
            <span className="absolute top-1 w-1.5 h-1.5 rounded-full bg-slate-300"></span>
          )}
        </button>
      </div>
    </nav>
  );
};
