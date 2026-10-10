import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DashboardFilterPanel } from '../components/dashboard/DashboardFilterPanel';
import {
  filterDashboardAssets,
  filterDashboardInventory,
  hasDashboardAssetCriteria,
  hasDashboardInventoryCriteria,
  matchesDashboardAssetAttributes,
  matchesDashboardInventoryItem,
  matchesDashboardSearch,
  matchesDashboardPeriod,
} from '../utils/dashboardFilters';
import {
  Crown,
  Box,
  Boxes,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Wrench,
  Trash2,
  ClipboardList,
  Building2,
  FileCheck,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';

export const ExecutiveDashboardView: React.FC = () => {
  const {
    assets: allAssets,
    inventoryItems: allInventoryItems,
    requests,
    maintenances,
    disposals,
    rooms,
    dashboardFilters,
    setDashboardFilters,
    setActiveView
  } = useApp();

  const assets = useMemo(() => filterDashboardAssets(allAssets, dashboardFilters), [allAssets, dashboardFilters]);
  const inventoryItems = useMemo(() => filterDashboardInventory(allInventoryItems, dashboardFilters), [allInventoryItems, dashboardFilters]);
  const matchesRequestFilters = (request: typeof requests[number]) => {
    if (!matchesDashboardPeriod(request.tanggal, dashboardFilters)) return false;
    const requestItems = request.items?.length ? request.items : [{
      itemId: request.itemId,
      namaBarang: request.namaBarang,
      jumlahDiminta: request.jumlahDiminta,
      satuan: request.satuan
    }];
    if (hasDashboardInventoryCriteria(dashboardFilters)) {
      const matchingItem = requestItems.some(requestItem => {
        const linkedItem = allInventoryItems.find(item => item.id === requestItem.itemId);
        return Boolean(linkedItem && matchesDashboardInventoryItem(linkedItem, dashboardFilters, false));
      });
      if (!matchingItem) return false;
    }
    return matchesDashboardSearch(dashboardFilters.keyword, [
      request.nomorPermintaan, request.pemohonNama, request.unitKerja, request.ruangan,
      request.keperluan, request.status,
      ...requestItems.flatMap(item => [item.namaBarang, item.kodeBarang, item.spesifikasi, item.catatan])
    ]);
  };
  const filteredRequests = useMemo(() => requests.filter(request =>
    matchesRequestFilters(request)
  ), [requests, allInventoryItems, dashboardFilters]);
  const filteredMaintenances = useMemo(() => maintenances.filter(maintenance =>
    matchesDashboardPeriod(maintenance.tanggalMulai, dashboardFilters)
    && (!hasDashboardAssetCriteria(dashboardFilters) || Boolean(
      allAssets.find(asset => asset.id === maintenance.assetId && matchesDashboardAssetAttributes(asset, dashboardFilters))
    ))
    && matchesDashboardSearch(dashboardFilters.keyword, [
      maintenance.nomorTiket, maintenance.assetName, maintenance.kodeBarang,
      maintenance.jenisPemeliharaan, maintenance.teknisi, maintenance.vendor,
      maintenance.status, maintenance.ruanganNama, maintenance.keterangan
    ])
  ), [maintenances, allAssets, dashboardFilters]);
  const filteredDisposals = useMemo(() => disposals.filter(disposal =>
    matchesDashboardPeriod(disposal.tanggalPengajuan, dashboardFilters)
    && (!hasDashboardAssetCriteria(dashboardFilters) || Boolean(
      allAssets.find(asset => asset.id === disposal.assetId && matchesDashboardAssetAttributes(asset, dashboardFilters))
    ))
    && matchesDashboardSearch(dashboardFilters.keyword, [
      disposal.nomorPengajuan, disposal.assetName, disposal.kodeBarang,
      disposal.alasan, disposal.status, disposal.penyetuju
    ])
  ), [disposals, allAssets, dashboardFilters]);

  // High level KPIs
  const totalBmnCount = assets.length;
  const totalBmnValue = assets.reduce((sum, a) => sum + a.nilaiPerolehan, 0);
  const totalBmnBookValue = assets.reduce((sum, a) => sum + a.nilaiBuku, 0);
  const totalDamagedAssets = assets.filter(a => a.kondisi !== 'Baik').length;

  const totalInventoryTypes = inventoryItems.length;
  const totalInventoryValue = inventoryItems.reduce((sum, i) => sum + i.totalNilai, 0);
  const lowStockCount = inventoryItems.filter(i => i.status === 'Menipis' || i.status === 'Habis').length;

  const pendingRequestsCount = filteredRequests.filter(r => r.status === 'Diajukan' || r.status === 'Diverifikasi').length;
  const ongoingMaintenanceCount = filteredMaintenances.filter(m => m.status === 'Terjadwal' || m.status === 'Dalam Proses').length;
  const pendingDisposalsCount = filteredDisposals.filter(d => d.status === 'Pengajuan' || d.status === 'Verifikasi' || d.status === 'Persetujuan').length;

  // Category breakdown for chart
  const categoryColors = ['bg-blue-500', 'bg-cyan-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500'];
  const categories = [...new Set(assets.map(asset => asset.kategori).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id'))
    .map((name, index) => ({
      name,
      count: assets.filter(asset => asset.kategori === name).length,
      color: categoryColors[index % categoryColors.length]
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Crown className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-extrabold text-white">Dashboard Eksekutif Pimpinan BPS Minut</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Ringkasan strategis neraca aset, kesehatan operasional barang negara, dan kepatuhan DIPA
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono">
            Tahun Anggaran 2026
          </span>
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

      {/* 9 Executive Cards (Section 30 prompt requirement) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {/* 1. TOTAL BMN */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TOTAL BMN</div>
          <div className="text-2xl font-black text-white mt-1.5">{totalBmnCount} <span className="text-xs font-normal text-slate-400">Unit</span></div>
          <div className="text-[10px] text-blue-400 mt-2 font-medium">100% Tercatat SIMAN</div>
        </div>

        {/* 2. TOTAL NILAI BMN */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TOTAL NILAI BMN</div>
          <div className="text-xl font-black text-emerald-400 mt-1.5 font-mono">
            Rp {(totalBmnBookValue / 1_000_000_000).toFixed(2)} M
          </div>
          <div className="text-[10px] text-slate-400 mt-2 font-mono">Perolehan: Rp {(totalBmnValue / 1_000_000_000).toFixed(2)} M</div>
        </div>

        {/* 3. TOTAL PERSEDIAAN */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TOTAL PERSEDIAAN</div>
          <div className="text-2xl font-black text-white mt-1.5">{totalInventoryTypes} <span className="text-xs font-normal text-slate-400">Jenis</span></div>
          <div className="text-[10px] text-cyan-400 mt-2">Gudang Utama & Logistik</div>
        </div>

        {/* 4. TOTAL NILAI PERSEDIAAN */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NILAI PERSEDIAAN</div>
          <div className="text-xl font-black text-cyan-400 mt-1.5 font-mono">
            Rp {(totalInventoryValue / 1_000_000).toFixed(1)} Jt
          </div>
          <div className="text-[10px] text-slate-400 mt-2">Saldo Aktif Gudang</div>
        </div>

        {/* 5. ASET RUSAK */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">ASET RUSAK</div>
          <div className="text-2xl font-black text-rose-400 mt-1.5">{totalDamagedAssets} <span className="text-xs font-normal text-slate-400">Unit</span></div>
          <div className="text-[10px] text-rose-400/80 mt-2">Perlu Servis / Penghapusan</div>
        </div>

        {/* 6. STOK MENIPIS */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">STOK MENIPIS / HABIS</div>
          <div className="text-2xl font-black text-amber-400 mt-1.5">{lowStockCount} <span className="text-xs font-normal text-slate-400">Item</span></div>
          <div className="text-[10px] text-amber-400/80 mt-2">Perlu Pengadaan Rutin</div>
        </div>

        {/* 7. PERMINTAAN MENUNGGU */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">PERMINTAAN ATK/ARK</div>
          <div className="text-2xl font-black text-blue-300 mt-1.5">{pendingRequestsCount} <span className="text-xs font-normal text-slate-400">Pengajuan</span></div>
          <div className="text-[10px] text-slate-400 mt-2">Menunggu Persetujuan</div>
        </div>

        {/* 8. PEMELIHARAAN */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">PEMELIHARAAN AKTIF</div>
          <div className="text-2xl font-black text-amber-300 mt-1.5">{ongoingMaintenanceCount} <span className="text-xs font-normal text-slate-400">Tiket</span></div>
          <div className="text-[10px] text-slate-400 mt-2">AC, Komputer & Mobil</div>
        </div>

        {/* 9. PENGHAPUSAN */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">PENGHAPUSAN BMN</div>
          <div className="text-2xl font-black text-purple-300 mt-1.5">{pendingDisposalsCount} <span className="text-xs font-normal text-slate-400">Berkas</span></div>
          <div className="text-[10px] text-purple-400/80 mt-2">Proses Approval KPKNL</div>
        </div>
      </div>

      {/* Strategic Analytics & Health Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Category Portfolio & Asset Distribution */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Distribusi Kategori Portofolio Aset BMN
              </h3>
              <p className="text-[11px] text-slate-400">Komposisi nilai dan volume fisik aset operasional dinas</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {categories.map(cat => {
              const pct = (totalBmnCount ? (cat.count / totalBmnCount) * 100 : 0).toFixed(1);
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">{cat.name}</span>
                    <span className="font-mono text-slate-400">
                      {cat.count} Unit <span className="text-slate-500 font-bold">({pct}%)</span>
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full ${cat.color} rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Kesesuaian Kodefikasi SAKTI BMN: 100%</span>
            <button
              onClick={() => setActiveView('reports')}
              className="text-blue-400 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Download Neraca Lengkap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Col: Executive Action Required (Approvals) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>Keputusan Pimpinan</span>
              </h3>
              <p className="text-[11px] text-slate-400">Item yang memerlukan persetujuan Kepala Satker</p>
            </div>

            <div className="space-y-2.5 mt-3">
              <div
                onClick={() => setActiveView('requests')}
                className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Persetujuan Permintaan ATK</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                    {pendingRequestsCount} Menunggu
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Permintaan logistik survei seksi Sosial, Distribusi, dan IPDS.
                </p>
              </div>

              <div
                onClick={() => setActiveView('disposal')}
                className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">SK Penghapusan BMN Rusak Berat</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                    {pendingDisposalsCount} Berkas
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Usulan lelang/penghapusan aset PC dan laptop eks sensus lama.
                </p>
              </div>

              <div
                onClick={() => setActiveView('stock-opname')}
                className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Pengesahan Berita Acara Opname</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    Triwulan II
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Penyelarasan catatan fisik gudang dengan aplikasi persediaan.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Kondisi BMN & Persediaan BPS Minut dalam status WTP.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
