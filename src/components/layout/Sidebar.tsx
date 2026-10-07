import React, { useState } from 'react';
import { useApp, ActiveView } from '../../context/AppContext';
import { canAccessView } from '../../utils/rbac';
import {
  LayoutDashboard,
  Box,
  Boxes,
  ArrowRightLeft,
  Wrench,
  Trash2,
  FileText,
  History,
  Users,
  Settings,
  ChevronDown,
  Building,
  Building2,
  Warehouse,
  ClipboardList,
  LineChart,
  Crown,
  X,
  ShieldCheck
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    currentUser,
    hasPermission,
    rooms,
    inventoryItems,
    requests,
    movements,
    maintenances,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useApp();

  const [bmnExpanded, setBmnExpanded] = useState(true);
  const [invExpanded, setInvExpanded] = useState(true);

  // Compute counters for badges
  const lowStockCount = inventoryItems.filter(i => i.status === 'Menipis' || i.status === 'Habis').length;
  const pendingRequestsCount = requests.filter(r => r.status === 'Diajukan' || r.status === 'Diverifikasi').length;
  const pendingMovementsCount = movements.filter(m => m.status === 'Pengajuan' || m.status === 'Verifikasi').length;
  const pendingMaintenanceCount = maintenances.filter(m => m.status === 'Terjadwal' || m.status === 'Dalam Proses').length;

  const handleSelectView = (view: ActiveView) => {
    setActiveView(view);
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  };

  const NavItem = ({
    view,
    icon: Icon,
    label,
    badge,
    badgeColor = 'bg-blue-500/20 text-blue-400'
  }: {
    view: ActiveView;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    badge?: number | string;
    badgeColor?: string;
  }) => {
    // Check RBAC permission for this view
    if (!canAccessView(view, hasPermission, currentUser)) {
      return null;
    }

    const isActive = activeView === view;
    return (
      <button
        onClick={() => handleSelectView(view)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all group min-h-[40px] ${
          isActive
            ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
          <span className="truncate">{label}</span>
        </div>
        {badge !== undefined && Number(badge) > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : badgeColor}`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  // Section visibility checks
  const canSeeBmn =
    canAccessView('assets', hasPermission, currentUser) ||
    canAccessView('rooms', hasPermission, currentUser) ||
    canAccessView('office-3d', hasPermission, currentUser) ||
    canAccessView('movements', hasPermission, currentUser) ||
    canAccessView('maintenance', hasPermission, currentUser) ||
    canAccessView('disposal', hasPermission, currentUser);

  const canSeeInv =
    canAccessView('inventory', hasPermission, currentUser) ||
    canAccessView('warehouse-3d', hasPermission, currentUser) ||
    canAccessView('requests', hasPermission, currentUser) ||
    canAccessView('stock-opname', hasPermission, currentUser);

  const canSeeDocs =
    canAccessView('documents', hasPermission, currentUser) ||
    canAccessView('reports', hasPermission, currentUser);

  const canSeeSystem =
    canAccessView('audit-trail', hasPermission, currentUser) ||
    canAccessView('users', hasPermission, currentUser) ||
    canAccessView('settings', hasPermission, currentUser);

  const navigationContent = (
    <div className="p-3 space-y-4 overflow-y-auto flex-1">
      {/* Main Dashboard & Executive */}
      <div className="space-y-1">
        <NavItem view="dashboard" icon={LayoutDashboard} label="Dashboard Utama" />
        <NavItem view="executive" icon={Crown} label="Dashboard Pimpinan" />
      </div>

      {/* Section: ASET BMN */}
      {canSeeBmn && (
        <div>
          <button
            onClick={() => setBmnExpanded(!bmnExpanded)}
            className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-300"
          >
            <div className="flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-blue-400" />
              <span>Aset BMN</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${bmnExpanded ? 'rotate-180' : ''}`} />
          </button>

          {bmnExpanded && (
            <div className="mt-1.5 space-y-0.5 pl-1.5">
              <NavItem view="assets" icon={Boxes} label="Semua Aset BMN" />
              <NavItem
                view="rooms"
                icon={Building2}
                label="Manajemen Ruangan"
                badge={rooms.length}
                badgeColor="bg-blue-500/20 text-blue-300"
              />
              <NavItem view="office-3d" icon={Building} label="3D Asset Mapping" />
              <NavItem
                view="movements"
                icon={ArrowRightLeft}
                label="Pemindahan Aset"
                badge={pendingMovementsCount}
                badgeColor="bg-cyan-500/20 text-cyan-400"
              />
              <NavItem
                view="maintenance"
                icon={Wrench}
                label="Pemeliharaan"
                badge={pendingMaintenanceCount}
                badgeColor="bg-amber-500/20 text-amber-400"
              />
              <NavItem view="disposal" icon={Trash2} label="Penghapusan BMN" />
            </div>
          )}
        </div>
      )}

      {/* Section: PERSEDIAAN */}
      {canSeeInv && (
        <div>
          <button
            onClick={() => setInvExpanded(!invExpanded)}
            className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-300"
          >
            <div className="flex items-center gap-1.5">
              <Warehouse className="w-3.5 h-3.5 text-amber-400" />
              <span>Persediaan ATK & ARK</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${invExpanded ? 'rotate-180' : ''}`} />
          </button>

          {invExpanded && (
            <div className="mt-1.5 space-y-0.5 pl-1.5">
              <NavItem
                view="inventory"
                icon={Boxes}
                label="Master Persediaan"
                badge={lowStockCount}
                badgeColor="bg-rose-500/20 text-rose-400"
              />
              <NavItem view="warehouse-3d" icon={Warehouse} label="Gudang 3D" />
              <NavItem
                view="requests"
                icon={ClipboardList}
                label="Permohonan Barang (ATK)"
                badge={pendingRequestsCount}
                badgeColor="bg-blue-500/20 text-blue-400"
              />
              <NavItem view="stock-opname" icon={History} label="Stock Opname" />
            </div>
          )}
        </div>
      )}

      {/* Section: DOKUMEN & LAPORAN */}
      {canSeeDocs && (
        <div className="space-y-1">
          <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Dokumentasi & Laporan
          </div>
          <NavItem view="documents" icon={FileText} label="Dokumen & BAST" />
          <NavItem view="reports" icon={LineChart} label="Laporan Resmi BPS" />
        </div>
      )}

      {/* Section: AUDIT & SISTEM */}
      {canSeeSystem && (
        <div className="space-y-1">
          <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Sistem & Keamanan
          </div>
          <NavItem view="audit-trail" icon={History} label="Audit Trail Log" />
          <NavItem view="users" icon={Users} label="Manajemen Pengguna" />
          <NavItem view="settings" icon={Settings} label="Pengaturan Sistem" />
        </div>
      )}
    </div>
  );

  const sidebarFooter = (
    <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400 shrink-0">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300">BPS Minahasa Utara</span>
        <span className="text-[10px] font-mono text-blue-400 font-bold">{currentUser?.role || 'Guest'}</span>
      </div>
      <div className="text-[10px] text-slate-400 mt-0.5">Kode Satker: 7106 • BMN BPS MINUT v2.6</div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (visible on md screens and up) */}
      <aside className="hidden md:flex w-64 bg-slate-900/90 backdrop-blur-md border-r border-slate-800 flex-col justify-between shrink-0 select-none">
        {navigationContent}
        {sidebarFooter}
      </aside>

      {/* Mobile Drawer (active on small screens when isMobileMenuOpen is true) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Blur Overlay */}
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-800 p-0.5 shadow-md">
                  <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center">
                    <div className="flex items-end gap-0.5">
                      <div className="w-1 h-2 bg-blue-500 rounded-xs"></div>
                      <div className="w-1 h-3 bg-emerald-400 rounded-xs"></div>
                      <div className="w-1 h-4 bg-cyan-400 rounded-xs"></div>
                      <div className="w-1 h-2.5 bg-amber-400 rounded-xs"></div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="font-extrabold text-white text-sm tracking-wide">BMN BPS MINUT</div>
                  <div className="text-[10px] text-blue-300 font-semibold leading-none">BPS Minahasa Utara</div>
                </div>
              </div>

              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Tutup menu navigasi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active User Quick Card */}
            <div className="px-3 pt-3">
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center gap-2.5">
                <img
                  src={currentUser?.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80'}
                  alt={currentUser?.name}
                  className="w-8 h-8 rounded-lg object-cover border border-slate-700 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">{currentUser?.name}</div>
                  <div className="text-[10px] text-blue-400 font-medium truncate flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 shrink-0" />
                    <span>{currentUser?.role}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Nav Items */}
            {navigationContent}

            {/* Footer */}
            {sidebarFooter}
          </div>
        </div>
      )}
    </>
  );
};
