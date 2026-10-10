import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { InventoryRequest, InventoryRequestItem, RequestStatus } from '../types';
import { StockRequestModal } from '../components/inventory/StockRequestModal';
import { OfficialLetterhead } from '../components/common/OfficialLetterhead';
import { ReportSignatureBlock } from '../components/common/ReportSignatureBlock';
import { triggerPrint } from '../utils/printHelper';
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  Clock,
  Check,
  X,
  AlertCircle,
  FileText,
  Search,
  Printer,
  ChevronRight,
  Building,
  User,
  AlertTriangle,
  RotateCcw,
  CheckCheck,
  Send,
  Boxes,
  Eye,
  Trash2
} from 'lucide-react';

const getRequestItems = (request: InventoryRequest): InventoryRequestItem[] => request.items?.length
  ? request.items
  : [{
      itemId: request.itemId,
      namaBarang: request.namaBarang,
      jumlahDiminta: request.jumlahDiminta,
      jumlahDisetujui: request.jumlahDisetujui,
      satuan: request.satuan
    }];

export const StockRequestsView: React.FC = () => {
  const { requests, inventoryItems, updateRequestStatus, deleteInventoryRequest, currentUser, hasPermission } = useApp();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteNotice, setBulkDeleteNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Workflow Dialog State
  const [workflowTarget, setWorkflowTarget] = useState<{
    request: InventoryRequest;
    action: 'approve' | 'reject' | 'complete';
  } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [approvedQty, setApprovedQty] = useState<number>(1);
  const [approvedItemQuantities, setApprovedItemQuantities] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Printable Detail Modal State
  const [selectedDetail, setSelectedDetail] = useState<InventoryRequest | null>(null);

  // Filtered & Searched Requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchStatus = filterStatus === 'all' || r.status === filterStatus;
      const term = searchTerm.toLowerCase().trim();
      const matchSearch =
        !term ||
        r.nomorPermintaan.toLowerCase().includes(term) ||
        getRequestItems(r).some(item =>
          item.namaBarang.toLocaleLowerCase('id-ID').includes(term) ||
          (item.kodeBarang || '').toLocaleLowerCase('id-ID').includes(term) ||
          (item.spesifikasi || '').toLocaleLowerCase('id-ID').includes(term)
        ) ||
        r.pemohonNama.toLowerCase().includes(term) ||
        r.unitKerja.toLowerCase().includes(term) ||
        r.keperluan.toLowerCase().includes(term);

      return matchStatus && matchSearch;
    });
  }, [requests, filterStatus, searchTerm]);

  const areAllFilteredRequestsSelected =
    filteredRequests.length > 0 && filteredRequests.every(request => selectedRequestIds.has(request.id));

  const toggleRequestSelection = (id: string) => {
    setSelectedRequestIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRequestSelection = () => {
    setSelectedRequestIds(prev => {
      if (areAllFilteredRequestsSelected) return new Set();
      const next = new Set(prev);
      filteredRequests.forEach(request => next.add(request.id));
      return next;
    });
  };

  const handleBulkDeleteRequests = () => {
    const selectedRequests = requests.filter(request => selectedRequestIds.has(request.id));
    const missingCount = selectedRequestIds.size - selectedRequests.length;
    let deletedCount = 0;
    const errors: string[] = missingCount > 0
      ? [`${missingCount} permohonan tidak ditemukan dan tidak dihapus.`]
      : [];

    selectedRequests.forEach(request => {
      try {
        deleteInventoryRequest(request.id);
        deletedCount += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Gagal menghapus permohonan ${request.nomorPermintaan}.`);
      }
    });

    setSelectedRequestIds(new Set());
    setIsBulkDeleteConfirmOpen(false);
    setBulkDeleteNotice(
      errors.length > 0
        ? { type: 'error', message: `${deletedCount} permohonan berhasil dihapus. ${errors.join(' ')}` }
        : { type: 'success', message: `${deletedCount} permohonan berhasil dihapus.` }
    );
  };

  // Metric stats
  const totalCount = requests.length;
  const pendingVerification = requests.filter(r => r.status === 'Diajukan').length;
  const approvedOrProcessing = requests.filter(r => r.status === 'Disetujui' || r.status === 'Diproses').length;
  const completedCount = requests.filter(r => r.status === 'Selesai').length;

  const getBadgeStyle = (status: RequestStatus) => {
    switch (status) {
      case 'Diajukan':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'Diverifikasi':
        return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
      case 'Disetujui':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'Diproses':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'Selesai':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Ditolak':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      default:
        return 'bg-slate-800 text-slate-300';
    }
  };

  const handleOpenApproveDialog = (req: InventoryRequest) => {
    setErrorMessage(null);
    setActionNotes(req.catatan || '');
    setApprovedQty(req.jumlahDisetujui || req.jumlahDiminta);
    setApprovedItemQuantities(Object.fromEntries(getRequestItems(req).map(item => [
      item.itemId,
      item.jumlahDisetujui || item.jumlahDiminta
    ])));
    setWorkflowTarget({ request: req, action: 'approve' });
  };

  const handleOpenRejectDialog = (req: InventoryRequest) => {
    setErrorMessage(null);
    setActionNotes('');
    setWorkflowTarget({ request: req, action: 'reject' });
  };

  const handleOpenCompleteDialog = (req: InventoryRequest) => {
    setErrorMessage(null);
    setActionNotes('');
    setApprovedQty(req.jumlahDisetujui || req.jumlahDiminta);
    setApprovedItemQuantities(Object.fromEntries(getRequestItems(req).map(item => [
      item.itemId,
      item.jumlahDisetujui || item.jumlahDiminta
    ])));
    setWorkflowTarget({ request: req, action: 'complete' });
  };

  const executeWorkflowAction = () => {
    if (!workflowTarget) return;
    const { request, action } = workflowTarget;

    if (action === 'approve') {
      const approvedItems = getRequestItems(request).map(item => ({
        ...item,
        jumlahDisetujui: approvedItemQuantities[item.itemId] ?? item.jumlahDiminta
      }));
      const res = updateRequestStatus(
        request.id,
        'Disetujui',
        actionNotes,
        approvedItems[0]?.jumlahDisetujui ?? approvedQty,
        approvedItems
      );
      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }
    } else if (action === 'reject') {
      const res = updateRequestStatus(
        request.id,
        'Ditolak',
        actionNotes.trim() ? `Ditolak: ${actionNotes}` : 'Ditolak oleh verifikator dinas.'
      );
      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }
    } else if (action === 'complete') {
      const approvedItems = getRequestItems(request).map(item => ({
        ...item,
        jumlahDisetujui: approvedItemQuantities[item.itemId] ?? item.jumlahDiminta
      }));
      const res = updateRequestStatus(
        request.id,
        'Selesai',
        actionNotes,
        approvedItems[0]?.jumlahDisetujui ?? approvedQty,
        approvedItems
      );
      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }
    }

    setWorkflowTarget(null);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Permohonan & Permintaan Barang Persediaan</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold font-mono">
              {requests.length} Pengajuan
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pengelolaan alur permohonan ATK/ARK dinas BPS Kabupaten Minahasa Utara TA 2026
          </p>
        </div>

        {hasPermission('requestSupplies') && (
          <button
            onClick={() => setIsNewRequestOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-600/20 w-fit"
          >
            <Plus className="w-4 h-4" />
            <span>+ Buat Permohonan ATK/ARK</span>
          </button>
        )}
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400">TOTAL PERMOHONAN</div>
          <div className="text-2xl font-black text-white mt-1 font-mono">{totalCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Semua pengajuan pegawai</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] font-semibold text-blue-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>MENUNGGU VERIFIKASI</span>
          </div>
          <div className="text-2xl font-black text-blue-300 mt-1 font-mono">{pendingVerification}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Permohonan baru masuk</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5" />
            <span>DISETUJUI / PROSES GUDANG</span>
          </div>
          <div className="text-2xl font-black text-amber-300 mt-1 font-mono">{approvedOrProcessing}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Siap dikeluarkan gudang</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
            <CheckCheck className="w-3.5 h-3.5" />
            <span>SELESAI DISERAHKAN</span>
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">{completedCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Tercatat di kartu stok</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {(['all', 'Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Selesai', 'Ditolak'] as const).map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                filterStatus === st
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {st === 'all' ? 'Semua Status' : st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Cari permohonan, pemohon, barang..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Requests Content: Mobile Card View (md:hidden) & Desktop Table View (hidden md:block) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {hasPermission('manageInventory') && (
          <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="md:hidden flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={areAllFilteredRequestsSelected}
                  onChange={toggleAllRequestSelection}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                  aria-label="Pilih semua permohonan yang ditampilkan"
                />
                Pilih Semua
              </label>
              <span className="text-xs text-slate-400">{selectedRequestIds.size} data dipilih</span>
            </div>
            <button
              onClick={() => {
                if (selectedRequestIds.size > 0) {
                  setBulkDeleteNotice(null);
                  setIsBulkDeleteConfirmOpen(true);
                }
              }}
              disabled={selectedRequestIds.size === 0}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Hapus Terpilih ({selectedRequestIds.size})
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
          {filteredRequests.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 text-xs">
              <ClipboardList className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <div>Tidak ada permohonan barang yang sesuai dengan filter.</div>
            </div>
          ) : (
            filteredRequests.map(req => {
              const requestItems = getRequestItems(req);
              const item = inventoryItems.find(i => i.id === req.itemId);
              return (
                <div key={req.id} className="p-4 space-y-3 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {hasPermission('manageInventory') && (
                        <input
                          type="checkbox"
                          checked={selectedRequestIds.has(req.id)}
                          onChange={() => toggleRequestSelection(req.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                          aria-label={`Pilih permohonan ${req.nomorPermintaan}`}
                        />
                      )}
                      <div>
                      <span className="font-mono font-bold text-xs text-cyan-300">
                        {req.nomorPermintaan}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">{req.tanggal}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          req.prioritas === 'Mendesak'
                            ? 'bg-rose-500/20 text-rose-300'
                            : req.prioritas === 'Tinggi'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {req.prioritas}
                      </span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getBadgeStyle(req.status)}`}>
                        {req.status}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{req.pemohonNama}</span>
                      <span className="text-[11px] text-slate-400">{req.unitKerja}</span>
                    </div>
                    <div className="border-t border-slate-800/60 pt-1.5 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-200">
                          {requestItems.slice(0, 2).map(requestItem => requestItem.namaBarang).join(', ')}
                          {requestItems.length > 2 ? ` + ${requestItems.length - 2} barang lainnya` : ''}
                        </div>
                        <div className="text-[10px] text-indigo-300">{requestItems.length} jenis barang</div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">{req.keperluan}</div>
                      </div>
                      <div className="text-right shrink-0">
                        {requestItems.map(requestItem => (
                          <div key={requestItem.itemId} className="font-mono font-bold text-sm text-white">
                            {requestItem.jumlahDiminta} {requestItem.satuan}
                            {requestItem.jumlahDisetujui !== undefined && requestItem.jumlahDisetujui !== requestItem.jumlahDiminta && (
                              <span className="block text-[10px] text-amber-400">Setuju: {requestItem.jumlahDisetujui}</span>
                            )}
                          </div>
                        ))}
                        {requestItems.length > 1 && (
                          <div className="text-[10px] text-slate-500">{requestItems.length} jenis</div>
                        )}
                        {item && requestItems.length === 1 && req.status !== 'Selesai' && (
                          <div className={`text-[10px] ${item.stokSaatIni < req.jumlahDiminta ? 'text-rose-400' : 'text-slate-400'}`}>
                            Stok: {item.stokSaatIni} {item.satuan}
                          </div>
                        )}
                      </div>
                    </div>
                    {req.catatan && (
                      <div className="text-[10px] text-amber-300/90 italic">
                        Catatan: {req.catatan}
                      </div>
                    )}
                  </div>

                  {/* Mobile Actions */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() => setSelectedDetail(req)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 min-h-[36px]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Rincian</span>
                    </button>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {req.status === 'Diajukan' && (
                        <>
                          <button
                            onClick={() => updateRequestStatus(req.id, 'Diverifikasi')}
                            className="px-3 py-1.5 rounded-xl bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600 hover:text-white text-xs font-bold transition-colors min-h-[36px]"
                          >
                            Verifikasi
                          </button>
                          <button
                            onClick={() => handleOpenRejectDialog(req)}
                            className="px-3 py-1.5 rounded-xl bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white text-xs font-bold transition-colors min-h-[36px]"
                          >
                            Tolak
                          </button>
                        </>
                      )}

                      {req.status === 'Diverifikasi' && (
                        hasPermission('approveRequests') ? (
                          <>
                            <button
                              onClick={() => handleOpenApproveDialog(req)}
                              className="px-3 py-1.5 rounded-xl bg-amber-600/20 text-amber-300 hover:bg-amber-600 hover:text-white text-xs font-bold transition-colors min-h-[36px]"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => handleOpenRejectDialog(req)}
                              className="px-3 py-1.5 rounded-xl bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white text-xs font-bold transition-colors min-h-[36px]"
                            >
                              Tolak
                            </button>
                          </>
                        ) : (
                          <span className="text-amber-400 text-xs font-medium">Menunggu Disposisi</span>
                        )
                      )}

                      {req.status === 'Disetujui' && (
                        hasPermission('manageInventory') ? (
                          <button
                            onClick={() => updateRequestStatus(req.id, 'Diproses')}
                            className="px-3 py-1.5 rounded-xl bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white text-xs font-bold transition-colors min-h-[36px]"
                          >
                            Proses Gudang
                          </button>
                        ) : (
                          <span className="text-purple-400 text-xs font-medium">Siap Diproses</span>
                        )
                      )}

                      {req.status === 'Diproses' && (
                        hasPermission('manageInventory') ? (
                          <button
                            onClick={() => handleOpenCompleteDialog(req)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors min-h-[36px]"
                          >
                            Keluarkan & Selesai
                          </button>
                        ) : (
                          <span className="text-blue-400 text-xs font-medium">Sedang Disiapkan</span>
                        )
                      )}

                      {req.status === 'Selesai' && (
                        <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Diserahkan</span>
                        </span>
                      )}

                      {req.status === 'Ditolak' && (
                        <span className="text-rose-400 text-xs font-semibold">
                          Ditolak
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
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
                      checked={areAllFilteredRequestsSelected}
                      onChange={toggleAllRequestSelection}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                      aria-label="Pilih semua permohonan yang ditampilkan"
                    />
                  </th>
                )}
                <th className="py-3 px-3">No Permohonan</th>
                <th className="py-3 px-3">Tanggal</th>
                <th className="py-3 px-3">Pemohon & Unit</th>
                <th className="py-3 px-4">Barang yang Diminta</th>
                <th className="py-3 px-3 text-right">Jumlah</th>
                <th className="py-3 px-3">Prioritas</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Tindakan Alur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={hasPermission('manageInventory') ? 9 : 8} className="py-12 text-center text-slate-400">
                    <ClipboardList className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <div>Tidak ada permohonan barang yang sesuai dengan filter.</div>
                  </td>
                </tr>
              ) : (
                filteredRequests.map(req => {
                  const requestItems = getRequestItems(req);
                  const isStockAvailable = requestItems.every(requestItem => {
                    const stockItem = inventoryItems.find(i => i.id === requestItem.itemId);
                    return !stockItem || stockItem.stokSaatIni >= (requestItem.jumlahDisetujui || requestItem.jumlahDiminta);
                  });

                  return (
                    <tr key={req.id} className="hover:bg-slate-800/40 transition-colors">
                      {hasPermission('manageInventory') && (
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedRequestIds.has(req.id)}
                            onChange={() => toggleRequestSelection(req.id)}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                            aria-label={`Pilih permohonan ${req.nomorPermintaan}`}
                          />
                        </td>
                      )}
                      <td className="py-3 px-3 font-mono font-bold text-cyan-300">
                        {req.nomorPermintaan}
                      </td>
                      <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                        {req.tanggal}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{req.pemohonNama}</div>
                        <div className="text-[10px] text-slate-400">{req.unitKerja} • {req.ruangan}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">
                          {requestItems.slice(0, 2).map(requestItem => requestItem.namaBarang).join(', ')}
                          {requestItems.length > 2 ? ` + ${requestItems.length - 2} barang lainnya` : ''}
                        </div>
                        <div className="text-[10px] text-indigo-300">{requestItems.length} jenis barang</div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">{req.keperluan}</div>
                        {req.catatan && (
                          <div className="text-[10px] text-amber-300/80 italic mt-0.5">Catatan: {req.catatan}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {requestItems.map(requestItem => {
                          const stockItem = inventoryItems.find(i => i.id === requestItem.itemId);
                          return (
                            <div key={requestItem.itemId} className="mb-1">
                              <div className="font-bold text-white">{requestItem.jumlahDiminta} {requestItem.satuan}</div>
                              {requestItem.jumlahDisetujui !== undefined && requestItem.jumlahDisetujui !== requestItem.jumlahDiminta && (
                                <div className="text-[10px] text-amber-400">Disetujui: {requestItem.jumlahDisetujui} {requestItem.satuan}</div>
                              )}
                              {stockItem && req.status !== 'Selesai' && (
                                <div className={`text-[10px] ${stockItem.stokSaatIni < requestItem.jumlahDiminta ? 'text-rose-400' : 'text-slate-400'}`}>
                                  Stok: {stockItem.stokSaatIni}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {!isStockAvailable && req.status === 'Disetujui' && (
                          <div className="text-[10px] text-rose-400">Stok belum mencukupi</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          req.prioritas === 'Mendesak' ? 'bg-rose-500/20 text-rose-300' :
                          req.prioritas === 'Tinggi' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {req.prioritas}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getBadgeStyle(req.status)}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Detail / SBBK Print Button */}
                          <button
                            onClick={() => setSelectedDetail(req)}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="Lihat Rincian & Cetak Formulir SBBK"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Workflow progression */}
                          {req.status === 'Diajukan' && (
                            <>
                              <button
                                onClick={() => updateRequestStatus(req.id, 'Diverifikasi')}
                                className="px-2 py-1 rounded-lg bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600 hover:text-white text-[10px] font-bold transition-colors"
                                title="Verifikasi Permohonan"
                              >
                                Verifikasi
                              </button>
                              <button
                                onClick={() => handleOpenRejectDialog(req)}
                                className="px-2 py-1 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white text-[10px] font-bold transition-colors"
                                title="Tolak Permohonan"
                              >
                                Tolak
                              </button>
                            </>
                          )}

                          {req.status === 'Diverifikasi' && (
                            hasPermission('approveRequests') ? (
                              <>
                                <button
                                  onClick={() => handleOpenApproveDialog(req)}
                                  className="px-2 py-1 rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600 hover:text-white text-[10px] font-bold transition-colors"
                                  title="Setujui Permohonan"
                                >
                                  Setujui
                                </button>
                                <button
                                  onClick={() => handleOpenRejectDialog(req)}
                                  className="px-2 py-1 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white text-[10px] font-bold transition-colors"
                                  title="Tolak Permohonan"
                                >
                                  Tolak
                                </button>
                              </>
                            ) : (
                              <span className="text-amber-400 text-[10px] font-medium">Menunggu Disposisi</span>
                            )
                          )}

                          {req.status === 'Disetujui' && (
                            hasPermission('manageInventory') ? (
                              <button
                                onClick={() => updateRequestStatus(req.id, 'Diproses')}
                                className="px-2 py-1 rounded-lg bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white text-[10px] font-bold transition-colors"
                                title="Kirim ke Petugas Gudang"
                              >
                                Proses Gudang
                              </button>
                            ) : (
                              <span className="text-purple-400 text-[10px] font-medium">Siap Diproses Gudang</span>
                            )
                          )}

                          {req.status === 'Diproses' && (
                            hasPermission('manageInventory') ? (
                              <button
                                onClick={() => handleOpenCompleteDialog(req)}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-sm transition-colors"
                                title="Keluarkan Barang dari Gudang & Selesaikan Permohonan"
                              >
                                Keluarkan & Selesai
                              </button>
                            ) : (
                              <span className="text-blue-400 text-[10px] font-medium">Sedang Disiapkan</span>
                            )
                          )}

                          {req.status === 'Selesai' && (
                            <span className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Diserahkan</span>
                            </span>
                          )}

                          {req.status === 'Ditolak' && (
                            <span className="text-rose-400 text-[10px] font-semibold">
                              Ditolak
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-requests-title"
            className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 space-y-4"
          >
            <h3 id="bulk-delete-requests-title" className="text-sm font-bold text-white">
              Konfirmasi Hapus Permohonan
            </h3>
            <p className="text-xs text-slate-300">
              Apakah Anda yakin ingin menghapus {selectedRequestIds.size} data yang dipilih?
            </p>
            <p className="text-xs text-slate-400">Data yang sudah dihapus tidak dapat dikembalikan.</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleBulkDeleteRequests}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Request Creation Modal */}
      {isNewRequestOpen && (
        <StockRequestModal
          isOpen={isNewRequestOpen}
          onClose={() => setIsNewRequestOpen(false)}
        />
      )}

      {/* Action / Approval / Complete / Reject Dialog */}
      {workflowTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                {workflowTarget.action === 'approve' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                {workflowTarget.action === 'reject' && <X className="w-4 h-4 text-rose-400" />}
                {workflowTarget.action === 'complete' && <Boxes className="w-4 h-4 text-emerald-400" />}
                <span>
                  {workflowTarget.action === 'approve' && 'Persetujuan Permohonan Barang'}
                  {workflowTarget.action === 'reject' && 'Tolak Permohonan Barang'}
                  {workflowTarget.action === 'complete' && 'Pengeluaran Barang dari Gudang'}
                </span>
              </h3>
              <button onClick={() => setWorkflowTarget(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="text-slate-400">
                No: <span className="font-mono text-cyan-400 font-bold">{workflowTarget.request.nomorPermintaan}</span>
              </div>
              <div className="text-white font-semibold">
                {getRequestItems(workflowTarget.request).map(item => item.namaBarang).join(', ')}
              </div>
              <div className="text-slate-300">
                Pemohon: <span className="text-white">{workflowTarget.request.pemohonNama}</span> ({workflowTarget.request.unitKerja})
              </div>
              <div className="text-slate-400">
                {getRequestItems(workflowTarget.request).length} jenis barang: <span className="font-bold text-white">
                  {getRequestItems(workflowTarget.request).map(item => `${item.jumlahDiminta} ${item.satuan} ${item.namaBarang}`).join('; ')}
                </span>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>{errorMessage}</div>
              </div>
            )}

            {workflowTarget.action !== 'reject' && getRequestItems(workflowTarget.request).map((requestItem, index) => (
              <div key={requestItem.itemId}>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {getRequestItems(workflowTarget.request).length > 1 ? `${index + 1}. ` : ''}{requestItem.namaBarang} — jumlah disetujui ({requestItem.satuan})
                </label>
                <input
                  type="number"
                  min="1"
                  max={requestItem.jumlahDiminta}
                  value={approvedItemQuantities[requestItem.itemId] ?? requestItem.jumlahDiminta}
                  onChange={e => setApprovedItemQuantities(current => ({
                    ...current,
                    [requestItem.itemId]: Number(e.target.value)
                  }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {workflowTarget.action === 'reject' ? 'Alasan Penolakan Permohonan' : 'Catatan Petugas (Opsional)'}
              </label>
              <textarea
                rows={2}
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                placeholder={workflowTarget.action === 'reject' ? 'Stok persediaan tidak mencukupi atau prioritas lain...' : 'Catatan persetujuan...'}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              ></textarea>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWorkflowTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={executeWorkflowAction}
                className={`px-4 py-2 text-white text-xs font-bold rounded-xl shadow-lg transition-all ${
                  workflowTarget.action === 'reject'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                    : workflowTarget.action === 'complete'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                    : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                }`}
              >
                {workflowTarget.action === 'reject' && 'Konfirmasi Tolak Permohonan'}
                {workflowTarget.action === 'approve' && 'Setujui Permohonan'}
                {workflowTarget.action === 'complete' && 'Keluarkan Barang Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail & Print SBBK Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150 printable-modal-overlay">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] printable-modal-card">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between no-print">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">
                  Formulir Permohonan & Bukti Pengeluaran Barang (SBBK)
                </h3>
              </div>
              <button onClick={() => setSelectedDetail(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Content Area */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs bg-slate-950 print-page text-slate-200">
              <OfficialLetterhead />

              <div className="text-center py-1">
                <div className="font-bold text-xs uppercase tracking-wider text-white underline">
                  SURAT BUKTI PENGELUARAN BARANG (SBBK) / FORMULIR PERMOHONAN
                </div>
                <div className="text-[11px] font-mono text-cyan-400 font-bold mt-0.5">
                  Nomor: {selectedDetail.nomorPermintaan}
                </div>
              </div>

              {/* Data Table */}
              <table className="w-full text-xs border border-slate-800">
                <tbody>
                  <tr className="border-b border-slate-800">
                    <td className="p-2 font-semibold text-slate-400 w-1/3 bg-slate-900">Tanggal Pengajuan</td>
                    <td className="p-2 text-white font-mono">{selectedDetail.tanggal}</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-2 font-semibold text-slate-400 bg-slate-900">Nama Pemohon</td>
                    <td className="p-2 text-white font-bold">{selectedDetail.pemohonNama}</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-2 font-semibold text-slate-400 bg-slate-900">Unit Kerja / Ruangan</td>
                    <td className="p-2 text-white">{selectedDetail.unitKerja} • {selectedDetail.ruangan}</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-2 font-semibold text-slate-400 bg-slate-900">Rincian Barang</td>
                    <td className="p-2">
                      <table className="w-full text-left">
                        <thead className="text-[10px] text-slate-400">
                          <tr>
                            <th className="py-1 pr-2">Barang / Kode</th>
                            <th className="py-1 px-2">Diminta</th>
                            <th className="py-1 px-2">Disetujui</th>
                            <th className="py-1 px-2">Spesifikasi / Catatan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getRequestItems(selectedDetail).map((requestItem, index) => (
                            <tr key={`${requestItem.itemId}-${index}`} className="border-t border-slate-800">
                              <td className="py-1.5 pr-2 font-semibold text-white">
                                {requestItem.namaBarang}
                                <span className="block text-[10px] font-normal text-slate-400">
                                  {requestItem.kodeBarang || inventoryItems.find(item => item.id === requestItem.itemId)?.kodeBarang || '—'}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 whitespace-nowrap font-mono text-white">{requestItem.jumlahDiminta} {requestItem.satuan}</td>
                              <td className="py-1.5 px-2 whitespace-nowrap font-mono text-emerald-400">
                                {requestItem.jumlahDisetujui ?? selectedDetail.jumlahDisetujui ?? requestItem.jumlahDiminta} {requestItem.satuan}
                              </td>
                              <td className="py-1.5 px-2 text-slate-300">{[requestItem.spesifikasi, requestItem.catatan].filter(Boolean).join(' • ') || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-2 font-semibold text-slate-400 bg-slate-900">Keperluan</td>
                    <td className="p-2 text-white">{selectedDetail.keperluan}</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-2 font-semibold text-slate-400 bg-slate-900">Status Alur Dokumen</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBadgeStyle(selectedDetail.status)}`}>
                        {selectedDetail.status}
                      </span>
                    </td>
                  </tr>
                  {selectedDetail.catatan && (
                    <tr>
                      <td className="p-2 font-semibold text-slate-400 bg-slate-900">Catatan Khusus</td>
                      <td className="p-2 text-amber-300 italic">{selectedDetail.catatan}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <ReportSignatureBlock signers={[
                { heading: 'Pemohon', name: selectedDetail.pemohonNama },
                { heading: 'Kepala Sub Bagian Umum', role: 'Kepala Sub Bagian Umum' }
              ]} />
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between no-print">
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={() => triggerPrint({
                  title: `SBBK_${selectedDetail.nomorPermintaan}_BPS_Minut`,
                  orientation: 'portrait'
                })}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/30"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Surat Bukti (SBBK)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
