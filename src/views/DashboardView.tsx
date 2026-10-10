import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { OfficeTwin3D } from '../components/3d/OfficeTwin3D';
import { DashboardFilterPanel } from '../components/dashboard/DashboardFilterPanel';
import {
  filterDashboardAssets,
  filterDashboardInventory,
  hasDashboardAssetCriteria,
  hasDashboardInventoryCriteria,
  matchesDashboardAssetAttributes,
  matchesDashboardInventoryItem,
  matchesDashboardPeriod,
  matchesDashboardSearch
} from '../utils/dashboardFilters';
import {
  Box,
  Boxes,
  TrendingUp,
  Inbox,
  Send,
  ClipboardList,
  History,
  QrCode,
  LineChart,
  Plus,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Wrench,
  ArrowRightLeft,
  Warehouse,
  Sparkles,
  Building2,
  ArrowUpRight
} from 'lucide-react';

export const DashboardView: React.FC<{
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
  const {
    assets: allAssets,
    inventoryItems: allInventoryItems,
    stockInList,
    stockOutList,
    requests,
    maintenances,
    rooms,
    dashboardFilters,
    setDashboardFilters,
    setActiveView,
    setIsQrScannerOpen,
    currentUser,
    hasPermission
  } = useApp();

  const assets = useMemo(() => filterDashboardAssets(allAssets, dashboardFilters), [allAssets, dashboardFilters]);
  const inventoryItems = useMemo(() => filterDashboardInventory(allInventoryItems, dashboardFilters), [allInventoryItems, dashboardFilters]);
  const matchesInventoryFields = (entry: { jenis?: string; kategori?: string; itemId?: string }) => {
    const linkedItem = entry.itemId ? allInventoryItems.find(item => item.id === entry.itemId) : undefined;
    if (hasDashboardInventoryCriteria(dashboardFilters) && (!linkedItem || !matchesDashboardInventoryItem(linkedItem, dashboardFilters, false))) {
      return false;
    }
    return (!dashboardFilters.inventoryType || (entry.jenis || linkedItem?.jenis) === dashboardFilters.inventoryType)
      && (!dashboardFilters.inventoryCategory || (entry.kategori || linkedItem?.kategori) === dashboardFilters.inventoryCategory)
      && (!dashboardFilters.inventorySubcategory || linkedItem?.subkategori === dashboardFilters.inventorySubcategory)
      && (!dashboardFilters.warehouse || linkedItem?.lokasiGudang === dashboardFilters.warehouse)
      && (!dashboardFilters.rack || linkedItem?.rak === dashboardFilters.rack);
  };
  const filteredStockInList = useMemo(() => stockInList.filter(entry =>
    matchesDashboardPeriod(entry.tanggal, dashboardFilters)
    && matchesInventoryFields(entry)
    && matchesDashboardSearch(dashboardFilters.keyword, [
      entry.nomorTransaksi, entry.nomorDokumen, entry.namaBarang, entry.kategori,
      entry.sumber, entry.petugas, entry.keterangan, entry.status
    ])
  ), [stockInList, allInventoryItems, dashboardFilters]);
  const filteredStockOutList = useMemo(() => stockOutList.filter(entry =>
    matchesDashboardPeriod(entry.tanggal, dashboardFilters)
    && matchesInventoryFields(entry)
    && matchesDashboardSearch(dashboardFilters.keyword, [
      entry.nomorTransaksi, entry.namaBarang, entry.unitKerja, entry.ruangan,
      entry.pemohon, entry.keperluan, entry.petugas
    ])
  ).sort((a, b) => b.tanggal.localeCompare(a.tanggal)), [stockOutList, allInventoryItems, dashboardFilters]);
  const filteredRequests = useMemo(() => requests.filter(entry =>
    (() => {
      const requestItems = entry.items?.length ? entry.items : [{
        itemId: entry.itemId,
        namaBarang: entry.namaBarang,
        jumlahDiminta: entry.jumlahDiminta,
        satuan: entry.satuan
      }];
      const matchesInventoryFilters = !hasDashboardInventoryCriteria(dashboardFilters)
        || requestItems.some(requestItem => {
          const item = allInventoryItems.find(inventoryItem => inventoryItem.id === requestItem.itemId);
          return Boolean(item && matchesDashboardInventoryItem(item, dashboardFilters, false));
        });
      return matchesDashboardPeriod(entry.tanggal, dashboardFilters)
        && matchesInventoryFilters
        && matchesDashboardSearch(dashboardFilters.keyword, [
          entry.nomorPermintaan, entry.pemohonNama, entry.unitKerja, entry.ruangan,
          entry.keperluan, entry.status,
          ...requestItems.flatMap(item => [item.namaBarang, item.kodeBarang, item.spesifikasi, item.catatan])
        ]);
    })()
  ), [requests, allInventoryItems, dashboardFilters]);
  const filteredMaintenances = useMemo(() => maintenances.filter(entry =>
    matchesDashboardPeriod(entry.tanggalMulai, dashboardFilters)
    && (!hasDashboardAssetCriteria(dashboardFilters) || Boolean(
      allAssets.find(asset => asset.id === entry.assetId && matchesDashboardAssetAttributes(asset, dashboardFilters))
    ))
    && matchesDashboardSearch(dashboardFilters.keyword, [
      entry.nomorTiket, entry.assetName, entry.kodeBarang, entry.jenisPemeliharaan,
      entry.teknisi, entry.vendor, entry.status, entry.ruanganNama, entry.keterangan
    ])
  ).sort((a, b) => b.tanggalMulai.localeCompare(a.tanggalMulai)), [maintenances, allAssets, dashboardFilters]);

  // BMN Calculations
  const totalAssetsCount = assets.length;
  const totalAssetValue = assets.reduce((sum, a) => sum + a.nilaiPerolehan, 0);
  const totalAssetBookValue = assets.reduce((sum, a) => sum + a.nilaiBuku, 0);
  const assetsBaik = assets.filter(a => a.kondisi === 'Baik').length;
  const assetsRusakRingan = assets.filter(a => a.kondisi === 'Rusak Ringan').length;
  const assetsRusakBerat = assets.filter(a => a.kondisi === 'Rusak Berat').length;
  const assetsInMaintenance = assets.filter(a => a.status === 'Dalam Pemeliharaan').length;
  const assetsInMovement = assets.filter(a => a.status === 'Dalam Proses Pemindahan').length;

  // Inventory Calculations
  const totalInvTypes = inventoryItems.length;
  const totalStockQty = inventoryItems.reduce((sum, i) => sum + i.stokSaatIni, 0);
  const totalInvValue = inventoryItems.reduce((sum, i) => sum + i.totalNilai, 0);
  const lowStockCount = inventoryItems.filter(i => i.status === 'Menipis').length;
  const outOfStockCount = inventoryItems.filter(i => i.status === 'Habis').length;
  const pendingRequests = filteredRequests.filter(r => r.status === 'Diajukan' || r.status === 'Diverifikasi').length;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-900 border border-blue-500/20 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-widest">
              Satker 7106
            </span>
            <span className="text-xs text-slate-400">Selamat datang kembali,</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-white mt-1">
            {currentUser?.name || 'Administrator BPS'}
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Sistem Informasi Manajemen Aset BMN & Persediaan • BPS Kabupaten Minahasa Utara
          </p>
        </div>

        {/* Quick Action Dashboard Buttons (Role-Guarded) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {hasPermission('manageAssets') && (
            <button
              onClick={onOpenAddAsset}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ TAMBAH ASET</span>
            </button>
          )}

          {hasPermission('manageInventory') && (
            <>
              <button
                onClick={onOpenStockIn}
                className="px-3 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>📥 BARANG MASUK</span>
              </button>

              <button
                onClick={onOpenStockOut}
                className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-md shadow-cyan-600/20 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>📤 BARANG KELUAR</span>
              </button>
            </>
          )}

          {hasPermission('requestSupplies') && (
            <button
              onClick={onOpenRequest}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>📋 PERMOHONAN ATK</span>
            </button>
          )}

          <button
            onClick={() => setIsQrScannerOpen(true)}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700 flex items-center gap-1.5"
          >
            <QrCode className="w-3.5 h-3.5 text-cyan-400" />
            <span>🔍 SCAN QR</span>
          </button>

          {hasPermission('stockOpname') && (
            <button
              onClick={onOpenStockOpname}
              className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5" />
              <span>📦 STOCK OPNAME</span>
            </button>
          )}

          {hasPermission('viewReports') && (
            <button
              onClick={() => setActiveView('reports')}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700 flex items-center gap-1.5"
            >
              <LineChart className="w-3.5 h-3.5 text-purple-400" />
              <span>📊 LAPORAN</span>
            </button>
          )}
        </div>
      </div>

      <DashboardFilterPanel
        filters={dashboardFilters}
        onChange={setDashboardFilters}
        assets={allAssets}
        inventoryItems={allInventoryItems}
        rooms={rooms}
        assetResultCount={assets.length}
        inventoryResultCount={inventoryItems.length}
      />

      {/* DUAL MONITORING SECTION: SECTION A (ASET BMN) & SECTION B (PERSEDIAAN) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GROUP A: ASET BMN MONITORING */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
                <Box className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">A. ASET BMN (BARANG MILIK NEGARA)</h3>
                <p className="text-[11px] text-slate-400">Total inventaris terdaftar pada DIPA BPS Minut</p>
              </div>
            </div>

            <button
              onClick={() => setActiveView('assets')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
            >
              <span>Kelola</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Top Asset Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-medium">Total Aset BMN</span>
              <div className="text-2xl font-black text-white mt-1">
                {totalAssetsCount} <span className="text-xs font-normal text-slate-400">Unit</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                Nilai Perolehan: Rp {(totalAssetValue / 1_000_000_000).toFixed(2)} M
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-medium">Total Nilai Buku</span>
              <div className="text-xl font-black text-emerald-400 mt-1 font-mono">
                Rp {(totalAssetBookValue / 1_000_000_000).toFixed(2)} M
              </div>
              <span className="text-[10px] text-emerald-400/80 font-mono mt-1 block">
                Setelah Depresiasi
              </span>
            </div>
          </div>

          {/* Condition Breakdown */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-emerald-950/20 border border-emerald-900/40 p-2.5 rounded-xl">
              <div className="text-[10px] text-emerald-400 flex items-center justify-center gap-1 font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                <span>Kondisi Baik</span>
              </div>
              <div className="text-lg font-bold text-emerald-300 mt-0.5">{assetsBaik}</div>
              <div className="text-[9px] text-slate-400 font-mono">{(totalAssetsCount ? (assetsBaik / totalAssetsCount) * 100 : 0).toFixed(1)}%</div>
            </div>

            <div className="bg-amber-950/20 border border-amber-900/40 p-2.5 rounded-xl">
              <div className="text-[10px] text-amber-400 flex items-center justify-center gap-1 font-semibold">
                <AlertTriangle className="w-3 h-3" />
                <span>Rusak Ringan</span>
              </div>
              <div className="text-lg font-bold text-amber-300 mt-0.5">{assetsRusakRingan}</div>
              <div className="text-[9px] text-slate-400 font-mono">{(totalAssetsCount ? (assetsRusakRingan / totalAssetsCount) * 100 : 0).toFixed(1)}%</div>
            </div>

            <div className="bg-rose-950/20 border border-rose-900/40 p-2.5 rounded-xl">
              <div className="text-[10px] text-rose-400 flex items-center justify-center gap-1 font-semibold">
                <AlertCircle className="w-3 h-3" />
                <span>Rusak Berat</span>
              </div>
              <div className="text-lg font-bold text-rose-300 mt-0.5">{assetsRusakBerat}</div>
              <div className="text-[9px] text-slate-400 font-mono">{(totalAssetsCount ? (assetsRusakBerat / totalAssetsCount) * 100 : 0).toFixed(1)}%</div>
            </div>
          </div>

          {/* Operational Workflow Indicators */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div
              onClick={() => setActiveView('maintenance')}
              className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-300">Dalam Pemeliharaan</span>
              </div>
              <span className="font-bold text-amber-400 font-mono">{assetsInMaintenance}</span>
            </div>

            <div
              onClick={() => setActiveView('movements')}
              className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-300">Proses Pemindahan</span>
              </div>
              <span className="font-bold text-cyan-400 font-mono">{assetsInMovement}</span>
            </div>
          </div>
        </div>

        {/* GROUP B: PERSEDIAAN ATK & ARK MONITORING */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">B. PERSEDIAAN (ATK & ARK)</h3>
                <p className="text-[11px] text-slate-400">Monitoring saldo gudang logistik dan konsumsi dinas</p>
              </div>
            </div>

            <button
              onClick={() => setActiveView('inventory')}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
            >
              <span>Kelola</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Top Inventory Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-medium">Jenis & Saldo Fisik</span>
              <div className="text-2xl font-black text-white mt-1">
                {totalInvTypes} <span className="text-xs font-normal text-slate-400">Jenis</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                Total Kuantitas: {totalStockQty.toLocaleString('id-ID')} unit
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-medium">Total Nilai Persediaan</span>
              <div className="text-xl font-black text-emerald-400 mt-1 font-mono">
                Rp {(totalInvValue / 1_000_000).toFixed(1)} Jt
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                Gudang Utama BPS Minut
              </span>
            </div>
          </div>

          {/* Critical Threshold Indicators */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl">
              <div className="text-[10px] text-blue-400 font-semibold">Barang Masuk</div>
              <div className="text-lg font-bold text-white mt-0.5">{filteredStockInList.length}</div>
              <div className="text-[9px] text-slate-400">Penerimaan TA 26</div>
            </div>

            <div className="bg-amber-950/20 border border-amber-900/40 p-2.5 rounded-xl">
              <div className="text-[10px] text-amber-400 flex items-center justify-center gap-1 font-semibold">
                <AlertTriangle className="w-3 h-3" />
                <span>Stok Menipis</span>
              </div>
              <div className="text-lg font-bold text-amber-300 mt-0.5">{lowStockCount}</div>
              <div className="text-[9px] text-amber-400/80">Perlu Pengadaan</div>
            </div>

            <div className="bg-rose-950/20 border border-rose-900/40 p-2.5 rounded-xl">
              <div className="text-[10px] text-rose-400 flex items-center justify-center gap-1 font-semibold">
                <AlertCircle className="w-3 h-3" />
                <span>Barang Habis</span>
              </div>
              <div className="text-lg font-bold text-rose-300 mt-0.5">{outOfStockCount}</div>
              <div className="text-[9px] text-rose-400/80">Saldo 0</div>
            </div>
          </div>

          {/* Quick Transaction Info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div
              onClick={() => setActiveView('requests')}
              className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-slate-300">Permintaan Menunggu</span>
              </div>
              <span className="font-bold text-blue-400 font-mono">{pendingRequests}</span>
            </div>

            <div
              onClick={() => setActiveView('warehouse-3d')}
              className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Warehouse className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-300">Gudang 3D Rak A-E</span>
              </div>
              <span className="font-bold text-amber-400 font-mono">5 Rak</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3D DIGITAL TWIN KANTOR SECTION (Prompt #7) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400" />
              <span>3D Digital Twin Kantor BPS Kabupaten Minahasa Utara</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Klik ruangan pada model 3D untuk memantau sebaran aset dan penanggung jawab
            </p>
          </div>

          <button
            onClick={() => setActiveView('office-3d')}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <span>Buka Layar Penuh</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <OfficeTwin3D assets={assets} />
      </div>

      {/* RECENT ACTIVITY & AUDIT SNIPPET */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Stock Out Transactions */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Send className="w-4 h-4 text-cyan-400" />
              <span>Pengeluaran Barang Terakhir</span>
            </h3>
            <button
              onClick={() => setActiveView('inventory')}
              className="text-[11px] text-blue-400 hover:underline"
            >
              Lihat Semua
            </button>
          </div>

          <div className="space-y-2">
            {filteredStockOutList.slice(0, 4).map(s => (
              <div key={s.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-white">{s.namaBarang}</div>
                  <div className="text-[10px] text-slate-400">
                    {s.unitKerja} • Penerima: {s.pemohon}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span className="font-bold text-cyan-400">-{s.jumlah} {s.satuan}</span>
                  <div className="text-[10px] text-slate-400">{s.tanggal}</div>
                </div>
              </div>
            ))}
            {filteredStockOutList.length === 0 && <p className="py-3 text-center text-xs text-slate-500">Tidak ada aktivitas barang keluar yang sesuai filter.</p>}
          </div>
        </div>

        {/* Recent Movements & Maintenance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              <span>Perawatan & Mutasi BMN</span>
            </h3>
            <button
              onClick={() => setActiveView('maintenance')}
              className="text-[11px] text-amber-400 hover:underline"
            >
              Lihat Semua
            </button>
          </div>

          <div className="space-y-2">
            {filteredMaintenances.slice(0, 4).map(m => (
              <div key={m.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-white">{m.assetName}</div>
                  <div className="text-[10px] text-slate-400">{m.jenisPemeliharaan} • {m.ruanganNama}</div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    m.status === 'Selesai' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {m.status}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-0.5">{m.tanggalMulai}</div>
                </div>
              </div>
            ))}
            {filteredMaintenances.length === 0 && <p className="py-3 text-center text-xs text-slate-500">Tidak ada aktivitas pemeliharaan yang sesuai filter.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
