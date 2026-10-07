import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { InventoryRequest, RequestStatus } from '../types';
import { StockRequestModal } from '../components/inventory/StockRequestModal';
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
  Eye
} from 'lucide-react';

export const StockRequestsView: React.FC = () => {
  const { requests, inventoryItems, updateRequestStatus, currentUser, hasPermission } = useApp();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);

  // Workflow Dialog State
  const [workflowTarget, setWorkflowTarget] = useState<{
    request: InventoryRequest;
    action: 'approve' | 'reject' | 'complete';
  } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [approvedQty, setApprovedQty] = useState<number>(1);
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
        r.namaBarang.toLowerCase().includes(term) ||
        r.pemohonNama.toLowerCase().includes(term) ||
        r.unitKerja.toLowerCase().includes(term) ||
        r.keperluan.toLowerCase().includes(term);

      return matchStatus && matchSearch;
    });
  }, [requests, filterStatus, searchTerm]);

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
    setWorkflowTarget({ request: req, action: 'complete' });
  };

  const executeWorkflowAction = () => {
    if (!workflowTarget) return;
    const { request, action } = workflowTarget;

    if (action === 'approve') {
      const res = updateRequestStatus(request.id, 'Disetujui', actionNotes, approvedQty);
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
      const res = updateRequestStatus(request.id, 'Selesai', actionNotes, approvedQty);
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
        {/* MOBILE CARD VIEW */}
        <div className="md:hidden divide-y divide-slate-800/80">
          {filteredRequests.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 text-xs">
              <ClipboardList className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <div>Tidak ada permohonan barang yang sesuai dengan filter.</div>
            </div>
          ) : (
            filteredRequests.map(req => {
              const item = inventoryItems.find(i => i.id === req.itemId);
              return (
                <div key={req.id} className="p-4 space-y-3 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-xs text-cyan-300">
                        {req.nomorPermintaan}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">{req.tanggal}</div>
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
                        <div className="font-bold text-slate-200">{req.namaBarang}</div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">{req.keperluan}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-sm text-white">
                          {req.jumlahDiminta} {req.satuan}
                        </div>
                        {req.jumlahDisetujui !== undefined && req.jumlahDisetujui !== req.jumlahDiminta && (
                          <div className="text-[10px] text-amber-400">
                            Setuju: {req.jumlahDisetujui}
                          </div>
                        )}
                      </div>
                    </div>
                    {item && req.status !== 'Selesai' && (
                      <div className={`text-[10px] ${item.stokSaatIni < req.jumlahDiminta ? 'text-rose-400' : 'text-slate-400'}`}>
                        Stok Tersedia di Gudang: {item.stokSaatIni} {item.satuan}
                      </div>
                    )}
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
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <ClipboardList className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <div>Tidak ada permohonan barang yang sesuai dengan filter.</div>
                  </td>
                </tr>
              ) : (
                filteredRequests.map(req => {
                  const item = inventoryItems.find(i => i.id === req.itemId);
                  const isStockAvailable = item ? item.stokSaatIni >= req.jumlahDiminta : true;

                  return (
                    <tr key={req.id} className="hover:bg-slate-800/40 transition-colors">
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
                        <div className="font-medium text-slate-200">{req.namaBarang}</div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">{req.keperluan}</div>
                        {req.catatan && (
                          <div className="text-[10px] text-amber-300/80 italic mt-0.5">Catatan: {req.catatan}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        <div className="font-bold text-white">
                          {req.jumlahDiminta} {req.satuan}
                        </div>
                        {req.jumlahDisetujui !== undefined && req.jumlahDisetujui !== req.jumlahDiminta && (
                          <div className="text-[10px] text-amber-400">
                            Disetujui: {req.jumlahDisetujui} {req.satuan}
                          </div>
                        )}
                        {item && req.status !== 'Selesai' && (
                          <div className={`text-[10px] ${item.stokSaatIni < req.jumlahDiminta ? 'text-rose-400' : 'text-slate-400'}`}>
                            Stok: {item.stokSaatIni}
                          </div>
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
              <div className="text-white font-semibold">{workflowTarget.request.namaBarang}</div>
              <div className="text-slate-300">
                Pemohon: <span className="text-white">{workflowTarget.request.pemohonNama}</span> ({workflowTarget.request.unitKerja})
              </div>
              <div className="text-slate-400">
                Jumlah Diminta: <span className="font-bold text-white">{workflowTarget.request.jumlahDiminta} {workflowTarget.request.satuan}</span>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>{errorMessage}</div>
              </div>
            )}

            {workflowTarget.action !== 'reject' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Jumlah Disetujui ({workflowTarget.request.satuan})
                </label>
                <input
                  type="number"
                  min="1"
                  max={workflowTarget.request.jumlahDiminta}
                  value={approvedQty}
                  onChange={e => setApprovedQty(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
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
              {/* Kop Surat Resmi */}
              <div className="text-center border-b-2 border-slate-700 pb-3">
                <div className="font-extrabold uppercase tracking-wide text-sm text-white">
                  BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
                </div>
                <div className="text-[11px] text-slate-400">
                  Jalan Worang By Pass, Airmadidi, Minahasa Utara, Sulawesi Utara 95371
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Sistem Informasi Manajemen Persediaan • Kode Satker: 7106
                </div>
              </div>

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
                    <td className="p-2 font-semibold text-slate-400 bg-slate-900">Barang yang Diminta</td>
                    <td className="p-2 text-white font-semibold">{selectedDetail.namaBarang}</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-2 font-semibold text-slate-400 bg-slate-900">Jumlah Diminta</td>
                    <td className="p-2 text-white font-mono font-bold">
                      {selectedDetail.jumlahDiminta} {selectedDetail.satuan}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-2 font-semibold text-slate-400 bg-slate-900">Jumlah Disetujui</td>
                    <td className="p-2 text-emerald-400 font-mono font-bold">
                      {selectedDetail.jumlahDisetujui || selectedDetail.jumlahDiminta} {selectedDetail.satuan}
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

              {/* Tanda Tangan Resmi */}
              <div className="pt-6 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div>
                  <div className="text-slate-400">Yang Memohon,</div>
                  <div className="h-14"></div>
                  <div className="font-bold text-white border-t border-slate-700 pt-1">
                    {selectedDetail.pemohonNama}
                  </div>
                  <div className="text-slate-400">Pegawai BPS</div>
                </div>

                <div>
                  <div className="text-slate-400">Mengetahui / Verifikator,</div>
                  <div className="h-14"></div>
                  <div className="font-bold text-white border-t border-slate-700 pt-1">
                    Dra. Meity Sondakh
                  </div>
                  <div className="text-slate-400">Kepala Subbagian Umum</div>
                </div>

                <div>
                  <div className="text-slate-400">Petugas Gudang / Persediaan,</div>
                  <div className="h-14"></div>
                  <div className="font-bold text-white border-t border-slate-700 pt-1">
                    Pengelola Logistik
                  </div>
                  <div className="text-slate-400">BPS Minahasa Utara</div>
                </div>
              </div>
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
                onClick={() => window.print()}
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
