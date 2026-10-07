import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Plus,
  Inbox,
  Send,
  ClipboardList,
  History,
  QrCode,
  Box,
  X
} from 'lucide-react';

export const QuickActionFab: React.FC<{
  onOpenStockIn: () => void;
  onOpenStockOut: () => void;
  onOpenRequest: () => void;
  onOpenStockOpname: () => void;
  onOpenAddAsset: () => void;
}> = ({
  onOpenStockIn,
  onOpenStockOut,
  onOpenRequest,
  onOpenStockOpname,
  onOpenAddAsset
}) => {
  const { isQuickActionOpen, setIsQuickActionOpen, setIsQrScannerOpen, hasPermission } = useApp();

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 flex flex-col items-end">
      {/* Popover Menu */}
      {isQuickActionOpen && (
        <div className="mb-3 w-56 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-2 space-y-1 animate-in slide-in-from-bottom-4 duration-200">
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            Transaksi Cepat
          </div>

          {hasPermission('manageInventory') && (
            <>
              <button
                onClick={() => {
                  setIsQuickActionOpen(false);
                  onOpenStockIn();
                }}
                className="w-full px-3 py-2 text-left rounded-xl hover:bg-slate-800/80 text-xs font-semibold text-slate-200 flex items-center gap-2.5 transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Inbox className="w-4 h-4" />
                </div>
                <span>📥 Barang Masuk</span>
              </button>

              <button
                onClick={() => {
                  setIsQuickActionOpen(false);
                  onOpenStockOut();
                }}
                className="w-full px-3 py-2 text-left rounded-xl hover:bg-slate-800/80 text-xs font-semibold text-slate-200 flex items-center gap-2.5 transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Send className="w-4 h-4" />
                </div>
                <span>📤 Barang Keluar</span>
              </button>
            </>
          )}

          {hasPermission('requestSupplies') && (
            <button
              onClick={() => {
                setIsQuickActionOpen(false);
                onOpenRequest();
              }}
              className="w-full px-3 py-2 text-left rounded-xl hover:bg-slate-800/80 text-xs font-semibold text-slate-200 flex items-center gap-2.5 transition-colors group"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <ClipboardList className="w-4 h-4" />
              </div>
              <span>📋 Permohonan Barang</span>
            </button>
          )}

          {hasPermission('stockOpname') && (
            <button
              onClick={() => {
                setIsQuickActionOpen(false);
                onOpenStockOpname();
              }}
              className="w-full px-3 py-2 text-left rounded-xl hover:bg-slate-800/80 text-xs font-semibold text-slate-200 flex items-center gap-2.5 transition-colors group"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <History className="w-4 h-4" />
              </div>
              <span>📦 Stock Opname</span>
            </button>
          )}

          <button
            onClick={() => {
              setIsQuickActionOpen(false);
              setIsQrScannerOpen(true);
            }}
            className="w-full px-3 py-2 text-left rounded-xl hover:bg-slate-800/80 text-xs font-semibold text-slate-200 flex items-center gap-2.5 transition-colors group"
          >
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <QrCode className="w-4 h-4" />
            </div>
            <span>🔍 Scan QR / Barcode</span>
          </button>

          {hasPermission('manageAssets') && (
            <button
              onClick={() => {
                setIsQuickActionOpen(false);
                onOpenAddAsset();
              }}
              className="w-full px-3 py-2 text-left rounded-xl hover:bg-slate-800/80 text-xs font-semibold text-slate-200 flex items-center gap-2.5 transition-colors group"
            >
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Box className="w-4 h-4" />
              </div>
              <span>➕ Tambah Aset BMN</span>
            </button>
          )}
        </div>
      )}

      {/* Main Floating Trigger Button */}
      <button
        onClick={() => setIsQuickActionOpen(!isQuickActionOpen)}
        className="px-4 py-3 rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs shadow-xl shadow-blue-600/30 flex items-center gap-2 transition-all hover:scale-105"
      >
        {isQuickActionOpen ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        <span>+ TRANSAKSI</span>
      </button>
    </div>
  );
};
