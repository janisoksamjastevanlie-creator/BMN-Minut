import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { InventoryItem, StockInTransaction } from '../types';
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
  Edit,
  Trash2,
  ClipboardCheck,
  FileText,
  Check,
  X
} from 'lucide-react';

export const InventoryView: React.FC = () => {
  const {
    inventoryItems, stockInList, currentUser, selectedInventoryItem, setSelectedInventoryItem,
    setActiveView, hasPermission, deleteInventoryItem, inspectStockIn, verifyStockIn, deleteStockIn
  } = useApp();

  // DITAMBAHKAN: simpan pilihan menggunakan ID barang agar tetap valid antar halaman.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteNotice, setBulkDeleteNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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
  const [editingStockIn, setEditingStockIn] = useState<StockInTransaction | null>(null);
  const [inspectingStockIn, setInspectingStockIn] = useState<StockInTransaction | null>(null);
  const [viewingStockIn, setViewingStockIn] = useState<StockInTransaction | null>(null);
  const [stockInSearch, setStockInSearch] = useState('');
  const [stockInStatusFilter, setStockInStatusFilter] = useState('ALL');
  const [stockInNotice, setStockInNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [inspectionCondition, setInspectionCondition] = useState<'Baik' | 'Rusak Ringan' | 'Rusak Berat'>('Baik');
  const [inspectionQuantityOk, setInspectionQuantityOk] = useState(true);
  const [inspectionDocumentOk, setInspectionDocumentOk] = useState(true);
  const [inspectionItemOk, setInspectionItemOk] = useState(true);
  const [inspectionNotes, setInspectionNotes] = useState('');

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

  // DITAMBAHKAN: buang pilihan yang sudah tidak ada setelah refresh, import, atau penghapusan.
  useEffect(() => {
    const existingIds = new Set(inventoryItems.map(item => item.id));
    setSelectedIds(prev => {
      const next = new Set(Array.from(prev).filter(id => existingIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [inventoryItems]);

  // DITAMBAHKAN: Pilih Semua hanya mengubah data pada halaman yang sedang ditampilkan.
  const areAllVisibleItemsSelected =
    paginatedItems.length > 0 && paginatedItems.every(item => selectedIds.has(item.id));

  const toggleItemSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisibleItemSelection = () => {
    setSelectedIds(prev => {
      if (areAllVisibleItemsSelected) return new Set();
      const next = new Set(prev);
      paginatedItems.forEach(item => next.add(item.id));
      return next;
    });
  };

  const handleBulkDelete = () => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) {
      setBulkDeleteNotice({ type: 'error', message: 'Pilih data persediaan yang ingin dihapus terlebih dahulu.' });
      return;
    }

    let deletedCount = 0;
    const errors: string[] = [];
    const successfullyDeletedIds = new Set<string>();
    idsToDelete.forEach(id => {
      try {
        const result = deleteInventoryItem(id);
        if (result.success) {
          deletedCount += 1;
          successfullyDeletedIds.add(id);
        }
        else errors.push(result.message);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Gagal menghapus data dengan ID ${id}.`);
      }
    });

    const deletedFromCurrentFilter = filteredItems.filter(item => successfullyDeletedIds.has(item.id)).length;
    setCurrentPage(page => Math.min(
      page,
      Math.max(1, Math.ceil((filteredItems.length - deletedFromCurrentFilter) / itemsPerPage))
    ));
    setSelectedIds(new Set());
    setIsBulkDeleteConfirmOpen(false);
    setBulkDeleteNotice(
      errors.length > 0
        ? { type: 'error', message: `${deletedCount} data berhasil dihapus. ${errors.length} data gagal: ${errors.join(' ')}` }
        : { type: 'success', message: `${deletedCount} data persediaan berhasil dihapus.` }
    );
  };

  const lowStockItems = inventoryItems.filter(i => i.status === 'Menipis' || i.status === 'Habis');
  const filteredStockIn = stockInList.filter(tx => {
    const status = tx.status || 'HISTORICAL';
    if (stockInStatusFilter !== 'ALL' && status !== stockInStatusFilter) return false;
    const query = stockInSearch.trim().toLocaleLowerCase('id-ID');
    return !query || [
      tx.nomorTransaksi, tx.nomorDokumen, tx.namaBarang, tx.itemId, tx.sumber, tx.petugas
    ].some(value => String(value || '').toLocaleLowerCase('id-ID').includes(query));
  });

  const handleInspectionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!inspectingStockIn) return;
    const result = inspectStockIn(inspectingStockIn.id, {
      kondisi: inspectionCondition,
      jumlahSesuai: inspectionQuantityOk,
      dokumenSesuai: inspectionDocumentOk,
      barangSesuai: inspectionItemOk,
      catatan: inspectionNotes.trim(),
      diperiksaOleh: currentUser?.name || 'Petugas Gudang',
      diperiksaPada: new Date().toISOString()
    });
    setStockInNotice({ type: result.success ? 'success' : 'error', message: result.message });
    if (result.success) setInspectingStockIn(null);
  };

  const handleStockInDelete = (tx: StockInTransaction) => {
    if (!window.confirm(`Hapus transaksi ${tx.nomorTransaksi}? Jika sudah menambah stok, jumlah yang sama akan dikoreksi dari stok saat ini.`)) return;
    const result = deleteStockIn(tx.id);
    setStockInNotice({ type: result.success ? 'success' : 'error', message: result.message });
  };

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
                disabled={inventoryItems.length === 0}
                title={inventoryItems.length === 0 ? 'Tambahkan master persediaan terlebih dahulu' : undefined}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-emerald-600/20"
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

      {/* Barang Masuk ledger and workflow */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Inbox className="w-4 h-4 text-emerald-400" />
              Transaksi Barang Masuk
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{stockInList.length}</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">Pencatatan, pemeriksaan, verifikasi, dan koreksi penerimaan persediaan</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                value={stockInSearch}
                onChange={event => setStockInSearch(event.target.value)}
                placeholder="Cari nomor, barang, dokumen..."
                className="w-full sm:w-64 bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                aria-label="Cari transaksi barang masuk"
              />
            </div>
            <select
              value={stockInStatusFilter}
              onChange={event => setStockInStatusFilter(event.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              aria-label="Filter status barang masuk"
            >
              <option value="ALL">Semua Status</option>
              <option value="Menunggu Pemeriksaan">Menunggu Pemeriksaan</option>
              <option value="Sudah Diperiksa">Sudah Diperiksa</option>
              <option value="Diverifikasi">Diverifikasi</option>
              <option value="Ditolak">Ditolak</option>
              <option value="HISTORICAL">Historis (sebelum alur pemeriksaan)</option>
            </select>
            {hasPermission('manageInventory') && (
              <button
                onClick={() => {
                  setEditingStockIn(null);
                  setActiveModalItemId(undefined);
                  setIsStockInOpen(true);
                }}
                disabled={inventoryItems.length === 0}
                title={inventoryItems.length === 0 ? 'Tambahkan master persediaan terlebih dahulu' : undefined}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Barang Masuk
              </button>
            )}
          </div>
        </div>

        {stockInNotice && (
          <div role="status" className={`mx-4 mt-3 p-3 rounded-xl border text-xs ${
            stockInNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {stockInNotice.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-950/70 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Tanggal / Nomor</th>
                <th className="px-4 py-3">Barang / Dokumen</th>
                <th className="px-4 py-3 text-right">Jumlah / Nilai</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredStockIn.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-500">Tidak ada transaksi Barang Masuk yang cocok.</td></tr>
              ) : filteredStockIn.map(tx => {
                const status = tx.status || 'HISTORICAL';
                const statusClass = status === 'Diverifikasi' || status === 'HISTORICAL'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                  : status === 'Ditolak'
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                    : status === 'Sudah Diperiksa'
                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/20';
                return (
                  <tr key={tx.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 align-top">
                      <div className="text-xs font-semibold text-white">{tx.tanggal}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">{tx.nomorTransaksi}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-xs font-semibold text-slate-100">{tx.namaBarang}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{tx.nomorDokumen} · {tx.sumber}</div>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <div className="text-xs font-bold text-white">{tx.jumlah} {tx.satuan}</div>
                      <div className="text-[10px] text-amber-300 mt-1">Rp {Number(tx.totalHarga || 0).toLocaleString('id-ID')}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex max-w-48 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass}`}>
                        {status === 'HISTORICAL' ? 'Historis (data lama)' : status}
                      </span>
                      {tx.pemeriksaan && <div className="text-[10px] text-slate-500 mt-1">Diperiksa: {tx.pemeriksaan.diperiksaOleh}</div>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setViewingStockIn(tx)} title="Detail transaksi" className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"><FileText className="w-3.5 h-3.5" /></button>
                        {hasPermission('manageInventory') && (
                          <>
                            {(status === 'Menunggu Pemeriksaan' || status === 'Ditolak') && (
                              <button onClick={() => setEditingStockIn(tx)} title="Edit transaksi" className="p-1.5 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white"><Edit className="w-3.5 h-3.5" /></button>
                            )}
                            {status === 'Menunggu Pemeriksaan' && (
                              <button
                                onClick={() => {
                                  setInspectionCondition('Baik');
                                  setInspectionQuantityOk(true);
                                  setInspectionDocumentOk(true);
                                  setInspectionItemOk(true);
                                  setInspectionNotes('');
                                  setInspectingStockIn(tx);
                                }}
                                title="Periksa transaksi"
                                className="p-1.5 rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600 hover:text-white"
                              ><ClipboardCheck className="w-3.5 h-3.5" /></button>
                            )}
                            {status === 'Sudah Diperiksa' && (
                              <>
                                <button
                                  onClick={() => {
                                    if (!window.confirm(`Verifikasi penerimaan ${tx.namaBarang} sebanyak ${tx.jumlah} ${tx.satuan}? Stok akan bertambah satu kali.`)) return;
                                    const result = verifyStockIn(tx.id, true);
                                    setStockInNotice({ type: result.success ? 'success' : 'error', message: result.message });
                                  }}
                                  title="Verifikasi dan terima"
                                  className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white"
                                ><Check className="w-3.5 h-3.5" /></button>
                                <button
                                  onClick={() => {
                                    const reason = window.prompt('Alasan penolakan transaksi:');
                                    if (reason === null) return;
                                    const result = verifyStockIn(tx.id, false, reason);
                                    setStockInNotice({ type: result.success ? 'success' : 'error', message: result.message });
                                  }}
                                  title="Tolak penerimaan"
                                  className="p-1.5 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white"
                                ><X className="w-3.5 h-3.5" /></button>
                              </>
                            )}
                            <button onClick={() => handleStockInDelete(tx)} title="Hapus / koreksi transaksi" className="p-1.5 rounded-lg bg-slate-800 text-rose-300 hover:bg-rose-600 hover:text-white"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-slate-800 text-[10px] text-slate-500">
          Menampilkan {filteredStockIn.length} dari {stockInList.length} transaksi. Data historis tanpa status dipertahankan dan tidak otomatis mengubah stok.
        </div>
      </section>

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
        {/* DITAMBAHKAN: kontrol bulk delete; tidak mengubah aksi barang lainnya. */}
        {hasPermission('manageInventory') && (
          <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="md:hidden flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={areAllVisibleItemsSelected}
                  onChange={toggleVisibleItemSelection}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                  aria-label="Pilih semua persediaan pada halaman ini"
                />
                Pilih Semua
              </label>
              <span className="text-xs text-slate-400">{selectedIds.size} data dipilih</span>
            </div>
            <button
              onClick={() => {
                if (selectedIds.size > 0) {
                  setBulkDeleteNotice(null);
                  setIsBulkDeleteConfirmOpen(true);
                }
              }}
              disabled={selectedIds.size === 0}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Hapus Terpilih ({selectedIds.size})
            </button>
          </div>
        )}
        {bulkDeleteNotice && (
          <div
            role="status"
            className={`mx-3 mt-3 p-3 rounded-xl border text-xs ${
              bulkDeleteNotice.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {bulkDeleteNotice.message}
          </div>
        )}
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
                    {hasPermission('manageInventory') && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                        aria-label={`Pilih persediaan ${item.nama}`}
                      />
                    )}
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
                {hasPermission('manageInventory') && (
                  <th className="py-3 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={areAllVisibleItemsSelected}
                      onChange={toggleVisibleItemSelection}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                      aria-label="Pilih semua persediaan pada halaman ini"
                    />
                  </th>
                )}
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
                  {hasPermission('manageInventory') && (
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                        aria-label={`Pilih persediaan ${item.nama}`}
                      />
                    </td>
                  )}
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

      {/* DITAMBAHKAN: dialog konfirmasi bulk delete. */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-inventory-title"
            className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl"
          >
            <h2 id="bulk-delete-inventory-title" className="text-base font-bold text-white">
              Konfirmasi Hapus Data
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Apakah Anda yakin ingin menghapus {selectedIds.size} data yang dipilih?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {inspectingStockIn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <form onSubmit={handleInspectionSubmit} className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">Pemeriksaan Barang Masuk</h2>
                <p className="text-xs text-slate-400 mt-1">{inspectingStockIn.nomorTransaksi} · {inspectingStockIn.namaBarang}</p>
              </div>
              <button type="button" onClick={() => setInspectingStockIn(null)} className="text-slate-400 hover:text-white" aria-label="Tutup"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['Jumlah sesuai dokumen', inspectionQuantityOk, setInspectionQuantityOk],
                ['Dokumen penerimaan sesuai', inspectionDocumentOk, setInspectionDocumentOk],
                ['Jenis barang sesuai', inspectionItemOk, setInspectionItemOk]
              ].map(([label, checked, setChecked]) => (
                <label key={String(label)} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    onChange={event => (setChecked as React.Dispatch<React.SetStateAction<boolean>>)(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                  />
                  {String(label)}
                </label>
              ))}
            </div>
            <label className="block text-xs text-slate-300">
              Kondisi barang
              <select value={inspectionCondition} onChange={event => setInspectionCondition(event.target.value as typeof inspectionCondition)} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white">
                <option>Baik</option><option>Rusak Ringan</option><option>Rusak Berat</option>
              </select>
            </label>
            <label className="block text-xs text-slate-300">
              Catatan pemeriksaan
              <textarea value={inspectionNotes} onChange={event => setInspectionNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white" />
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button type="button" onClick={() => setInspectingStockIn(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold">Batal</button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold">Simpan Pemeriksaan</button>
            </div>
          </form>
        </div>
      )}

      {viewingStockIn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div><h2 className="text-base font-bold text-white">Detail Barang Masuk</h2><p className="text-xs text-slate-400 mt-1">{viewingStockIn.nomorTransaksi}</p></div>
              <button onClick={() => setViewingStockIn(null)} className="text-slate-400 hover:text-white" aria-label="Tutup"><X className="w-5 h-5" /></button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-slate-500">Barang</dt><dd className="mt-1 text-white">{viewingStockIn.namaBarang}</dd></div>
              <div><dt className="text-slate-500">Jumlah</dt><dd className="mt-1 text-white">{viewingStockIn.jumlah} {viewingStockIn.satuan}</dd></div>
              <div><dt className="text-slate-500">Tanggal</dt><dd className="mt-1 text-white">{viewingStockIn.tanggal}</dd></div>
              <div><dt className="text-slate-500">Nomor dokumen</dt><dd className="mt-1 text-white">{viewingStockIn.nomorDokumen}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd className="mt-1 text-white">{viewingStockIn.status || 'Historis (data lama)'}</dd></div>
              <div><dt className="text-slate-500">Sumber</dt><dd className="mt-1 text-white">{viewingStockIn.sumber}</dd></div>
              <div><dt className="text-slate-500">Nilai</dt><dd className="mt-1 text-amber-300">Rp {Number(viewingStockIn.totalHarga || 0).toLocaleString('id-ID')}</dd></div>
              <div className="col-span-2"><dt className="text-slate-500">Keterangan</dt><dd className="mt-1 text-slate-200">{viewingStockIn.keterangan || '-'}</dd></div>
              {viewingStockIn.pemeriksaan && (
                <>
                  <div><dt className="text-slate-500">Kondisi pemeriksaan</dt><dd className="mt-1 text-white">{viewingStockIn.pemeriksaan.kondisi}</dd></div>
                  <div><dt className="text-slate-500">Pemeriksa / waktu</dt><dd className="mt-1 text-white">{viewingStockIn.pemeriksaan.diperiksaOleh} · {new Date(viewingStockIn.pemeriksaan.diperiksaPada).toLocaleString('id-ID')}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Hasil pemeriksaan</dt><dd className="mt-1 text-slate-200">Jumlah {viewingStockIn.pemeriksaan.jumlahSesuai ? 'sesuai' : 'tidak sesuai'} · Dokumen {viewingStockIn.pemeriksaan.dokumenSesuai ? 'sesuai' : 'tidak sesuai'} · Barang {viewingStockIn.pemeriksaan.barangSesuai ? 'sesuai' : 'tidak sesuai'}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Catatan pemeriksaan</dt><dd className="mt-1 text-slate-200">{viewingStockIn.pemeriksaan.catatan || '-'}</dd></div>
                </>
              )}
              {(viewingStockIn.diverifikasiOleh || !viewingStockIn.status) && (
                <div className="col-span-2"><dt className="text-slate-500">Verifikasi</dt><dd className="mt-1 text-slate-200">{viewingStockIn.diverifikasiOleh || 'Data historis (sebelum alur verifikasi)'}{viewingStockIn.diverifikasiPada ? ` · ${new Date(viewingStockIn.diverifikasiPada).toLocaleString('id-ID')}` : ''}</dd></div>
              )}
            </dl>
            <div className="mt-5 flex justify-end"><button onClick={() => setViewingStockIn(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold">Tutup</button></div>
          </div>
        </div>
      )}

      {/* Stock In & Stock Out Modals */}
      {(isStockInOpen || editingStockIn) && (
        <StockInModal
          isOpen={isStockInOpen || !!editingStockIn}
          onClose={() => {
            setIsStockInOpen(false);
            setEditingStockIn(null);
          }}
          defaultItemId={activeModalItemId}
          initialTransaction={editingStockIn}
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
