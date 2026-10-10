/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp, ActiveView } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { QuickActionFab } from './components/layout/QuickActionFab';
import { QrScannerModal } from './components/common/QrScannerModal';
import { AiAssistantModal } from './components/ai/AiAssistantModal';

// Modals
import { StockInModal } from './components/inventory/StockInModal';
import { StockOutModal } from './components/inventory/StockOutModal';
import { StockRequestModal } from './components/inventory/StockRequestModal';
import { AssetFormModal } from './components/bmn/AssetFormModal';

// Views
import { LandingPageView } from './views/LandingPageView';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { ExecutiveDashboardView } from './views/ExecutiveDashboardView';
import { AssetsView } from './views/AssetsView';
import { RoomsView } from './views/RoomsView';
import { AssetMapping3DView } from './views/AssetMapping3DView';
import { AssetMovementsView } from './views/AssetMovementsView';
import { AssetMaintenanceView } from './views/AssetMaintenanceView';
import { AssetDisposalView } from './views/AssetDisposalView';
import { InventoryView } from './views/InventoryView';
import { Warehouse3D } from './components/3d/Warehouse3D';
import { StockRequestsView } from './views/StockRequestsView';
import { StockOpnameView } from './views/StockOpnameView';
import { DocumentsView } from './views/DocumentsView';
import { ReportsView } from './views/ReportsView';
import { AuditTrailView } from './views/AuditTrailView';
import { UsersView } from './views/UsersView';
import { SettingsView } from './views/SettingsView';
import { AccessDeniedView } from './views/AccessDeniedView';
import { canAccessView } from './utils/rbac';

const MainLayout: React.FC = () => {
  const { activeView, currentUser, setActiveView, hasPermission, isInitializing, syncError } = useApp();

  // Floating & Quick Transaction Modals state
  const [isStockInModalOpen, setIsStockInModalOpen] = useState(false);
  const [isStockOutModalOpen, setIsStockOutModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isAddAssetModalOpen, setIsAddAssetModalOpen] = useState(false);

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
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 pb-28 md:pb-8 w-full print:p-0 print:m-0 print:max-w-none print:overflow-visible">
          {syncError && (
            <div role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
              Sinkronisasi server gagal: {syncError}
              <button
                onClick={() => window.location.reload()}
                className="ml-3 font-bold underline underline-offset-2"
              >
                Muat ulang data server
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
                  <Warehouse3D />
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

      {/* Floating Action Buttons & Quick Menus */}
      <div className="no-print floating-action-fab">
        <QuickActionFab
          onOpenStockIn={() => setIsStockInModalOpen(true)}
          onOpenStockOut={() => setIsStockOutModalOpen(true)}
          onOpenRequest={() => setIsRequestModalOpen(true)}
          onOpenStockOpname={() => setActiveView('stock-opname')}
          onOpenAddAsset={() => setIsAddAssetModalOpen(true)}
        />
      </div>

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
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
