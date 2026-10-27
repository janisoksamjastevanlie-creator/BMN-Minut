/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { AiAssistantFab } from './components/ai/AiAssistantFab';
import { QrScannerModal } from './components/common/QrScannerModal';
import { AiAssistantModal } from './components/ai/AiAssistantModal';
import { BackToTopButton } from './components/common/BackToTopButton';

// Modals
import { StockInModal } from './components/inventory/StockInModal';
import { StockOutModal } from './components/inventory/StockOutModal';
import { StockRequestModal } from './components/inventory/StockRequestModal';
import { AssetFormModal } from './components/bmn/AssetFormModal';

// Halaman berat hanya dimuat saat pengguna benar-benar membukanya. Ini menjaga
// halaman login dan dashboard awal tetap kecil, terutama pada koneksi kantor.
const LandingPageView = lazy(() => import('./views/LandingPageView').then(({ LandingPageView }) => ({ default: LandingPageView })));
const LoginView = lazy(() => import('./views/LoginView').then(({ LoginView }) => ({ default: LoginView })));
const DashboardView = lazy(() => import('./views/DashboardView').then(({ DashboardView }) => ({ default: DashboardView })));
const ExecutiveDashboardView = lazy(() => import('./views/ExecutiveDashboardView').then(({ ExecutiveDashboardView }) => ({ default: ExecutiveDashboardView })));
const AssetsView = lazy(() => import('./views/AssetsView').then(({ AssetsView }) => ({ default: AssetsView })));
const RoomsView = lazy(() => import('./views/RoomsView').then(({ RoomsView }) => ({ default: RoomsView })));
const AssetMapping3DView = lazy(() => import('./views/AssetMapping3DView').then(({ AssetMapping3DView }) => ({ default: AssetMapping3DView })));
const AssetMovementsView = lazy(() => import('./views/AssetMovementsView').then(({ AssetMovementsView }) => ({ default: AssetMovementsView })));
const AssetMaintenanceView = lazy(() => import('./views/AssetMaintenanceView').then(({ AssetMaintenanceView }) => ({ default: AssetMaintenanceView })));
const AssetDisposalView = lazy(() => import('./views/AssetDisposalView').then(({ AssetDisposalView }) => ({ default: AssetDisposalView })));
const InventoryView = lazy(() => import('./views/InventoryView').then(({ InventoryView }) => ({ default: InventoryView })));
const Warehouse3D = lazy(() => import('./components/3d/Warehouse3D').then(({ Warehouse3D }) => ({ default: Warehouse3D })));
const StockRequestsView = lazy(() => import('./views/StockRequestsView').then(({ StockRequestsView }) => ({ default: StockRequestsView })));
const StockOpnameView = lazy(() => import('./views/StockOpnameView').then(({ StockOpnameView }) => ({ default: StockOpnameView })));
const DocumentsView = lazy(() => import('./views/DocumentsView').then(({ DocumentsView }) => ({ default: DocumentsView })));
const ReportsView = lazy(() => import('./views/ReportsView').then(({ ReportsView }) => ({ default: ReportsView })));
const AuditTrailView = lazy(() => import('./views/AuditTrailView').then(({ AuditTrailView }) => ({ default: AuditTrailView })));
const UsersView = lazy(() => import('./views/UsersView').then(({ UsersView }) => ({ default: UsersView })));
const SettingsView = lazy(() => import('./views/SettingsView').then(({ SettingsView }) => ({ default: SettingsView })));
const AccessDeniedView = lazy(() => import('./views/AccessDeniedView').then(({ AccessDeniedView }) => ({ default: AccessDeniedView })));
const NotFoundView = lazy(() => import('./views/NotFoundView').then(({ NotFoundView }) => ({ default: NotFoundView })));
import { canAccessView, getHomeView } from './utils/rbac';

const MainLayout: React.FC = () => {
  const {
    activeView, currentUser, setActiveView, hasPermission, isInitializing,
    syncError, isSyncRecoverable, syncRecoveryAttempt, connectionStatus,
    isReloadingServerData, reloadServerData
  } = useApp();

  // Floating & Quick Transaction Modals state
  const [isStockInModalOpen, setIsStockInModalOpen] = useState(false);
  const [isStockOutModalOpen, setIsStockOutModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isAddAssetModalOpen, setIsAddAssetModalOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Arahkan ke dashboard yang sesuai role jika view dashboard yang dibuka bukan miliknya
  useEffect(() => {
    if (!currentUser) return;
    if (activeView === 'login') {
      setActiveView(getHomeView(currentUser));
      return;
    }
    if ((activeView === 'dashboard' || activeView === 'executive') && !canAccessView(activeView, hasPermission, currentUser)) {
      setActiveView(getHomeView(currentUser));
    }
  }, [activeView, currentUser, hasPermission, setActiveView]);

  useEffect(() => {
    if (isInitializing || currentUser || activeView === 'landing' || activeView === 'login' || activeView === 'not-found') return;
    setActiveView('login');
  }, [activeView, currentUser, isInitializing, setActiveView]);

  if (isInitializing) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-sm text-slate-300">
        Memeriksa sesi dan memuat data bersama...
      </div>
    );
  }

  // If user is not authenticated or at landing/login views
  if (activeView === 'landing') {
    return <LandingPageView />;
  }

  if (activeView === 'not-found') {
    return <NotFoundView />;
  }

  if (activeView === 'login' || !currentUser) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Header */}
      <div className="no-print">
        <Navbar />
      </div>

      {/* Body Area */}
      <div className="flex-1 flex overflow-hidden print:overflow-visible print:block md:pl-64">
        {/* Collapsible Sidebar */}
        <div className="no-print md:w-64 md:shrink-0">
          <Sidebar />
        </div>

        {/* Main View Port */}
        <main ref={mainRef} className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 pb-28 md:pb-8 w-full print:p-0 print:m-0 print:max-w-none print:overflow-visible">
          {(syncError || connectionStatus !== 'online') && (
            <div role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
              {syncError
                ? <>Sinkronisasi server gagal: {syncError}</>
                : connectionStatus === 'offline'
                  ? 'Koneksi ke server terputus. Perubahan akan disinkronkan kembali secara otomatis saat koneksi pulih.'
                  : 'Menghubungkan kembali ke server...'}
              {syncError && isSyncRecoverable && (
                <span className="ml-2 text-amber-300/90">
                  {connectionStatus === 'reconnecting'
                    ? 'Menghubungkan kembali...'
                    : `Mencoba menghubungkan kembali secara otomatis${syncRecoveryAttempt > 0 ? ` (percobaan ke-${syncRecoveryAttempt + 1})` : ''}.`}
                </span>
              )}
              <button
                onClick={() => void reloadServerData()}
                disabled={isReloadingServerData || connectionStatus === 'reconnecting'}
                className="ml-3 font-bold underline underline-offset-2 disabled:opacity-60"
              >
                {isReloadingServerData ? 'Memuat data server...' : 'Muat ulang data server'}
              </button>
            </div>
          )}
          {!canAccessView(activeView, hasPermission, currentUser) ? (
            <AccessDeniedView />
          ) : (
            <>
              {activeView === 'dashboard' && (
                <DashboardView
                  onOpenStockIn={() => setIsStockInModalOpen(true)}
                  onOpenStockOut={() => setIsStockOutModalOpen(true)}
                  onOpenRequest={() => setIsRequestModalOpen(true)}
                  onOpenStockOpname={() => setActiveView('stock-opname')}
                  onOpenAddAsset={() => setIsAddAssetModalOpen(true)}
                />
              )}

              {activeView === 'executive' && <ExecutiveDashboardView />}
              {activeView === 'assets' && <AssetsView />}
              {activeView === 'rooms' && <RoomsView />}
              {activeView === 'office-3d' && <AssetMapping3DView />}
              {activeView === 'movements' && <AssetMovementsView />}
              {activeView === 'maintenance' && <AssetMaintenanceView />}
              {activeView === 'disposal' && <AssetDisposalView />}
              {activeView === 'inventory' && <InventoryView />}
              
              {activeView === 'warehouse-3d' && (
                <div className="space-y-4">
                  <div>
                    <h1 className="text-xl font-extrabold text-white">Gudang 3D Digital Twin</h1>
                    <p className="text-xs text-slate-400 mt-1">
                      Visualisasi tata letak Rak A s/d Rak E Gudang Logistik BPS Minahasa Utara
                    </p>
                  </div>
                  <Warehouse3D onOpenStockIn={() => setIsStockInModalOpen(true)} />
                </div>
              )}

              {activeView === 'requests' && <StockRequestsView />}
              {activeView === 'stock-opname' && <StockOpnameView />}
              {activeView === 'documents' && <DocumentsView />}
              {activeView === 'reports' && <ReportsView />}
              {activeView === 'audit-trail' && <AuditTrailView />}
              {activeView === 'users' && <UsersView />}
              {activeView === 'settings' && <SettingsView />}
            </>
          )}
        </main>
      </div>

      {/* Tombol mengambang Tanya AI */}
      <div className="no-print floating-action-fab">
        <AiAssistantFab />
      </div>

      <BackToTopButton containerRef={mainRef} />

      {/* Mobile Bottom Navigation Bar (Phone & Tablet) */}
      <div className="no-print">
        <MobileBottomNav />
      </div>

      {/* Global Interactive Modals */}
      <GlobalSearchModal />
      <QrScannerModal />
      <AiAssistantModal />

      {/* Transaction Modals */}
      {isStockInModalOpen && (
        <StockInModal
          isOpen={isStockInModalOpen}
          onClose={() => setIsStockInModalOpen(false)}
        />
      )}

      {isStockOutModalOpen && (
        <StockOutModal
          isOpen={isStockOutModalOpen}
          onClose={() => setIsStockOutModalOpen(false)}
        />
      )}

      {isRequestModalOpen && (
        <StockRequestModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
        />
      )}

      {isAddAssetModalOpen && (
        <AssetFormModal
          isOpen={isAddAssetModalOpen}
          onClose={() => setIsAddAssetModalOpen(false)}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Suspense fallback={<div className="min-h-screen grid place-items-center bg-slate-950 text-sm text-slate-300">Memuat halaman...</div>}>
          <MainLayout />
        </Suspense>
      </AppProvider>
    </ThemeProvider>
  );
}
