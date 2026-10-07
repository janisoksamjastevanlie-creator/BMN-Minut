import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { InventoryItem } from '../types';
import { StockInModal } from '../components/inventory/StockInModal';
import { StockOutModal } from '../components/inventory/StockOutModal';
import { StockCardModal } from '../components/inventory/StockCardModal';
import { ImportInventoryModal } from '../components/inventory/ImportInventoryModal';
import { InventoryFormModal } from '../components/inventory/InventoryFormModal';
import { getInventoryPhotoUrl } from '../utils/assetImages';
import {
  Boxes,
  Search,
  Plus,
  Inbox,
  Send,
  FileSpreadsheet,
  UploadCloud,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Warehouse,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Sparkles,
  ArrowRight,
  Edit
} from 'lucide-react';

export const InventoryView: React.FC = () => {
  const { inventoryItems, selectedInventoryItem, setSelectedInventoryItem, setActiveView, hasPermission } = useApp();

  const [activeTab, setActiveTab] = useState<'ALL' | 'ATK' | 'ARK' | 'LOW' | 'EMPTY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Modals
  const [isStockInOpen, setIsStockInOpen] = useState(false);
  const [isStockOutOpen, setIsStockOutOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [cardModalItem, setCardModalItem] = useState<InventoryItem | null>(null);
  const [activeModalItemId, setActiveModalItemId] = useState<string | undefined>(undefined);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return inventoryItems.filter(item => {
      // Tab filter
      if (activeTab === 'ATK' && item.jenis !== 'ATK') return false;
      if (activeTab === 'ARK' && item.jenis !== 'ARK') return false;
      if (activeTab === 'LOW' && item.status !== 'Menipis' && item.status !== 'Habis') return false;
      if (activeTab === 'EMPTY' && item.status !== 'Habis') return false;

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.binCode.toLowerCase().includes(q) ||
        item.rak.toLowerCase().includes(q) ||
        item.subkategori.toLowerCase().includes(q)
      );
    });
  }, [inventoryItems, activeTab, searchQuery]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage]);

  const lowStockItems = inventoryItems.filter(i => i.status === 'Menipis' || i.status === 'Habis');

  const handleExportCSV = () => {
    const headers = ['Kode Barang,Nama Barang,Jenis,Subkategori,Satuan,Stok Saat Ini,Stok Min,Stok Max,Harga Satuan,Total Nilai,Lokasi Rak,Bin Code,Status'];
    const rows = filteredItems.map(i =>
      `"${i.kodeBarang}","${i.nama}","${i.jenis}","${i.subkategori}","${i.satuan}","${i.stokSaatIni}","${i.stokMinimum}","${i.stokMaksimum}","${i.hargaSatuan}","${i.totalNilai}","${i.rak}","${i.binCode}","${i.status}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `Master_Persediaan_BPS_Minut_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Master Persediaan ATK & ARK</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold font-mono">
              {inventoryItems.length} Jenis Barang
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pengelolaan stok barang habis pakai, alat tulis kantor, dan perbekalan rumah tangga dinas
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {hasPermission('manageInventory') && (
            <button
              onClick={() => setIsFormOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>+ Tambah Barang</span>
            </button>
          )}

          <button
            onClick={() => setActiveView('warehouse-3d')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <Warehouse className="w-4 h-4 text-amber-400" />
            <span>Gudang 3D</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          {hasPermission('manageInventory') && (
            <>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors border border-amber-500/40 shadow-sm"
              >
                <UploadCloud className="w-4 h-4 text-amber-400" />
                <span>Import File</span>
              </button>

              <button
                onClick={() => {
                  setActiveModalItemId(undefined);
                  setIsStockInOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-emerald-600/20"
              >
                <Inbox className="w-4 h-4" />
                <span>Barang Masuk</span>
              </button>

              <button
                onClick={() => {
                  setActiveModalItemId(undefined);
                  setIsStockOutOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-blue-600/20"
              >
                <Send className="w-4 h-4" />
                <span>Barang Keluar</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Rekomendasi Pengadaan Banner (Prompt #26) */}
      {lowStockItems.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900 border border-amber-500/30 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-200">
                Sistem Rekomendasi Pengadaan Otomatis
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Terdapat <span className="font-bold text-amber-400">{lowStockItems.length} barang</span> dengan stok di bawah batas minimum. Contoh: {lowStockItems[0]?.nama} (Stok: {lowStockItems[0]?.stokSaatIni}, Rekomendasi pengadaan: {Math.max(20, (lowStockItems[0]?.ratarataPenggunaanBulanan || 10) * 2)} {lowStockItems[0]?.satuan}).
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('LOW')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl whitespace-nowrap transition-colors flex items-center gap-1.5 self-start md:self-auto"
          >
            <span>Tinjau Barang Menipis</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <button
              onClick={() => {
                setActiveTab('ALL');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'ALL' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Semua ({inventoryItems.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('ATK');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'ATK' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              ATK (Alat Tulis Kantor)
            </button>
            <button
              onClick={() => {
                setActiveTab('ARK');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'ARK' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              ARK (Rumah Tangga Kantor)
            </button>
            <button
              onClick={() => {
                setActiveTab('LOW');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'LOW' ? 'bg-amber-600 text-white shadow' : 'text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Stok Menipis ({lowStockItems.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari persediaan, kode, rak, bin..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Main Inventory Content: Mobile Card View (md:hidden) & Desktop Table View (hidden md:block) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* MOBILE CARD VIEW */}
        <div className="md:hidden divide-y divide-slate-800/80">
          {paginatedItems.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 text-xs">
              Tidak ada persediaan barang yang sesuai dengan filter.
            </div>
          ) : (
            paginatedItems.map(item => (
              <div key={item.id} className="p-4 space-y-3 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {item.kodeBarang}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.jenis === 'ATK'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {item.jenis}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.status === 'Aman'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : item.status === 'Menipis'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {item.status === 'Aman' && <CheckCircle2 className="w-3 h-3" />}
                    {item.status === 'Menipis' && <AlertTriangle className="w-3 h-3" />}
                    {item.status === 'Habis' && <AlertCircle className="w-3 h-3" />}
                    <span>{item.status}</span>
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <div
                    onClick={() => setCardModalItem(item)}
                    className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 cursor-pointer relative"
                  >
                    <img
                      src={item.fotoUrl || getInventoryPhotoUrl(item.nama, item.subkategori, item.jenis)}
                      alt={item.nama}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getInventoryPhotoUrl(item.nama, item.subkategori, item.jenis);
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3
                      onClick={() => setCardModalItem(item)}
                      className="text-xs font-bold text-white hover:text-emerald-400 cursor-pointer leading-snug line-clamp-2"
                    >
                      {item.nama}
                    </h3>
                    <div className="text-[11px] text-slate-400 mt-0.5">{item.subkategori}</div>
                    <div className="text-[11px] text-cyan-400 font-mono mt-1">
                      {item.binCode} • <span className="text-slate-400">{item.rak}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Stok Fisik:</span>
                    <span className="text-sm font-black text-white font-mono">
                      {item.stokSaatIni}
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1">{item.satuan}</span>
                    <span className="text-[10px] text-slate-500 ml-2">(Min: {item.stokMinimum})</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Harga Satuan:</span>
                    <span className="font-mono text-slate-300 font-medium">
                      Rp {item.hargaSatuan.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Mobile Actions */}
                <div className="flex items-center justify-between gap-1.5 pt-1">
                  <button
                    onClick={() => setCardModalItem(item)}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[36px]"
                  >
                    <span>Kartu Stok</span>
                  </button>

                  {hasPermission('manageInventory') && (
                    <>
                      <button
                        onClick={() => {
                          setActiveModalItemId(item.id);
                          setIsStockInOpen(true);
                        }}
                        title="Barang Masuk"
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white text-xs font-semibold flex items-center gap-1 min-h-[36px]"
                      >
                        <Inbox className="w-3.5 h-3.5" />
                        <span>Masuk</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveModalItemId(item.id);
                          setIsStockOutOpen(true);
                        }}
                        title="Barang Keluar"
                        className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white text-xs font-semibold flex items-center gap-1 min-h-[36px]"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Keluar</span>
                      </button>

                      <button
                        onClick={() => setEditingItem(item)}
                        title="Edit Data"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Kode Barang</th>
                <th className="py-3 px-4">Nama Barang & Subkategori</th>
                <th className="py-3 px-3 text-center">Jenis</th>
                <th className="py-3 px-3 text-center">Lokasi Rak & Bin</th>
                <th className="py-3 px-3 text-right">Stok Fisik</th>
                <th className="py-3 px-3 text-right">Min / Max</th>
                <th className="py-3 px-3 text-right">Harga Satuan (Rp)</th>
                <th className="py-3 px-3 text-right">Total Nilai (Rp)</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {paginatedItems.map(item => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  {/* Kode Barang */}
                  <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                    {item.kodeBarang}
                  </td>

                  {/* Nama with Photo */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        onClick={() => setCardModalItem(item)}
                        className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 cursor-pointer group/img relative hover:border-emerald-500/50 transition-all shadow-sm"
                        title="Klik untuk membuka kartu stok & foto"
                      >
                        <img
                          src={item.fotoUrl || getInventoryPhotoUrl(item.nama, item.subkategori, item.jenis)}
                          alt={item.nama}
                          className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getInventoryPhotoUrl(item.nama, item.subkategori, item.jenis);
                          }}
                        />
                      </div>
                      <div>
                        <div
                          onClick={() => setCardModalItem(item)}
                          className="font-semibold text-white leading-tight hover:text-emerald-400 cursor-pointer transition-colors"
                        >
                          {item.nama}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{item.subkategori}</div>
                      </div>
                    </div>
                  </td>

                  {/* Jenis */}
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.jenis === 'ATK' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {item.jenis}
                    </span>
                  </td>

                  {/* Lokasi Rak & Bin Code (e.g. WH-B-02-05) */}
                  <td className="py-3 px-3 text-center">
                    <div className="font-mono text-cyan-400 font-semibold text-[11px]">{item.binCode}</div>
                    <div className="text-[10px] text-slate-400">{item.rak} • {item.shelf}</div>
                  </td>

                  {/* Stok Saat Ini */}
                  <td className="py-3 px-3 text-right">
                    <span className="font-mono font-black text-white text-sm">
                      {item.stokSaatIni}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">{item.satuan}</span>
                  </td>

                  {/* Min / Max */}
                  <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-400">
                    {item.stokMinimum} / {item.stokMaksimum}
                  </td>

                  {/* Harga Satuan */}
                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    Rp {item.hargaSatuan.toLocaleString('id-ID')}
                  </td>

                  {/* Total Nilai */}
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                    Rp {item.totalNilai.toLocaleString('id-ID')}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold ${
                      item.status === 'Aman' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      item.status === 'Menipis' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {item.status === 'Aman' && <CheckCircle2 className="w-3 h-3" />}
                      {item.status === 'Menipis' && <AlertTriangle className="w-3 h-3" />}
                      {item.status === 'Habis' && <AlertCircle className="w-3 h-3" />}
                      <span>{item.status}</span>
                    </span>
                  </td>

                  {/* Aksi Cepat */}
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setCardModalItem(item)}
                        title="Buka Kartu Stok Digital"
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[10px] font-bold transition-colors"
                      >
                        Kartu Stok
                      </button>

                      {hasPermission('manageInventory') && (
                        <>
                          <button
                            onClick={() => {
                              setActiveModalItemId(item.id);
                              setIsStockInOpen(true);
                            }}
                            title="Tambah Stok Masuk"
                            className="p-1 rounded bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white transition-colors"
                          >
                            <Inbox className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setActiveModalItemId(item.id);
                              setIsStockOutOpen(true);
                            }}
                            title="Keluarkan Barang"
                            className="p-1 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setEditingItem(item)}
                            title="Edit Master Barang & Foto"
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Menampilkan <span className="font-bold text-white">{(currentPage - 1) * itemsPerPage + 1}</span> -{' '}
            <span className="font-bold text-white">{Math.min(currentPage * itemsPerPage, filteredItems.length)}</span> dari{' '}
            <span className="font-bold text-white">{filteredItems.length}</span> jenis persediaan
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 bg-slate-800 rounded-lg text-white font-mono font-bold">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stock In & Stock Out Modals */}
      {isStockInOpen && (
        <StockInModal
          isOpen={isStockInOpen}
          onClose={() => setIsStockInOpen(false)}
          defaultItemId={activeModalItemId}
        />
      )}

      {isStockOutOpen && (
        <StockOutModal
          isOpen={isStockOutOpen}
          onClose={() => setIsStockOutOpen(false)}
          defaultItemId={activeModalItemId}
        />
      )}

      {cardModalItem && (
        <StockCardModal
          item={cardModalItem}
          onClose={() => setCardModalItem(null)}
        />
      )}

      {isImportModalOpen && (
        <ImportInventoryModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
      )}

      {(isFormOpen || editingItem) && (
        <InventoryFormModal
          isOpen={isFormOpen || !!editingItem}
          initialItem={editingItem}
          onClose={() => {
            setIsFormOpen(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
};
