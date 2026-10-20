import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { AuditLog, InventoryRequest, InventoryRequestItem, RequestStatus } from '../types';
import { ListPager, usePagedList } from '../components/common/ListPager';
import { StockRequestModal } from '../components/inventory/StockRequestModal';
import { OfficialLetterhead } from '../components/common/OfficialLetterhead';
import { ReportSignatureBlock } from '../components/common/ReportSignatureBlock';
import { triggerPrint } from '../utils/printHelper';
import { isPimpinanUser } from '../utils/rbac';
import { getRequestItemQuantities } from '../../requestStockValidation.mjs';
import { canDeleteInventoryRequests } from '../../requestAccess.mjs';
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

type OutstandingRequestItem = InventoryRequestItem & { jumlahTersisa: number };

// Tahapan alur dokumen permohonan dari pengajuan sampai barang diterima pemohon.
const REQUEST_FLOW_STAGES: RequestStatus[] = ['Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Menunggu Konfirmasi', 'Diterima'];
const REQUEST_FLOW_LABELS: Partial<Record<RequestStatus, string>> = {
  'Menunggu Konfirmasi': 'Diserahkan (Menunggu Konfirmasi)',
  Diterima: 'Diterima Pemohon'
};

type RequestFlowEntry = {
  status: RequestStatus;
  label: string;
  timestamp: string | null;
  actor?: string;
  reached: boolean;
  current: boolean;
};

const formatFlowDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatFlowTimestamp = (value: string | null) => {
  if (!value) return null;
  if (value.includes('T')) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar'
      })} WITA`;
    }
  }
  const [date, ...rest] = value.split(' ');
  const time = rest.join(' ').replace(/\s*WITA$/i, '').replace(/\./g, ':').slice(0, 5);
  return time ? `${formatFlowDate(date)} ${time} WITA` : formatFlowDate(date);
};

const getRequestFlowTimeline = (request: InventoryRequest, auditLogs: AuditLog[]): RequestFlowEntry[] => {
  const auditTimestamp = (log: AuditLog) => `${log.tanggal} ${log.waktu}`;
  // Log audit tersusun terbaru di depan, sehingga temuan pertama adalah kejadian terakhir.
  const findStatusLog = (status: RequestStatus) => auditLogs.find(log =>
    log.aktivitas === 'Pembaruan Status Permohonan' &&
    log.detail.startsWith(`Permohonan ${request.nomorPermintaan} `) &&
    log.detail.endsWith(`menjadi ${status}.`)
  );
  const submissionLog = auditLogs.find(log =>
    log.aktivitas === 'Pengajuan Permohonan Barang' && log.detail.includes(`(${request.id})`)
  );
  const confirmationLog = auditLogs.find(log =>
    log.aktivitas === 'Konfirmasi Penerimaan Barang' &&
    log.detail.startsWith(`Permohonan ${request.nomorPermintaan} `)
  );
  const cancellationLog = auditLogs.find(log =>
    log.aktivitas === 'Pembatalan Permohonan Barang' && log.detail.startsWith(`Permohonan ${request.id} `)
  );

  const effectiveStatus: RequestStatus = request.status === 'Selesai' ? 'Diterima' : request.status;
  const currentIndex = REQUEST_FLOW_STAGES.indexOf(effectiveStatus);
  const isTerminated = request.status === 'Ditolak' || request.status === 'Dibatalkan';

  const entries: RequestFlowEntry[] = REQUEST_FLOW_STAGES.map((status, index) => {
    let timestamp: string | null = null;
    let actor: string | undefined;
    if (status === 'Diajukan') {
      timestamp = submissionLog ? auditTimestamp(submissionLog) : request.tanggal;
      actor = submissionLog?.userName || request.pemohonNama;
    } else if (status === 'Menunggu Konfirmasi' && request.penerimaan?.diserahkanPada) {
      timestamp = request.penerimaan.diserahkanPada;
      actor = request.penerimaan.diserahkanOleh;
    } else if (status === 'Diterima' && request.penerimaan?.dikonfirmasiPada &&
      (request.status === 'Diterima' || request.status === 'Selesai')) {
      timestamp = request.penerimaan.dikonfirmasiPada;
      actor = request.penerimaan.dikonfirmasiOleh;
    } else {
      const log = status === 'Diterima' ? (confirmationLog || findStatusLog(status)) : findStatusLog(status);
      if (log) {
        timestamp = auditTimestamp(log);
        actor = log.userName;
      }
    }
    const reached = Boolean(timestamp) || (currentIndex >= 0 && index <= currentIndex);
    return {
      status,
      label: REQUEST_FLOW_LABELS[status] || status,
      timestamp,
      actor,
      reached,
      current: !isTerminated && status === effectiveStatus
    };
  });

  if (isTerminated) {
    const log = request.status === 'Dibatalkan' ? (cancellationLog || findStatusLog('Dibatalkan')) : findStatusLog('Ditolak');
    entries.push({
      status: request.status,
      label: request.status,
      timestamp: log ? auditTimestamp(log) : null,
      actor: log?.userName,
      reached: true,
      current: true
    });
  }
  return entries;
};

const getRequestRemainingItems = (request: InventoryRequest): OutstandingRequestItem[] => {
  const items = getRequestItems(request);
  const quantitiesById = new Map(getRequestItemQuantities(request).map(item => [item.itemId, item]));
  return items.map(item => {
    const quantities = quantitiesById.get(item.itemId);
    const approvedQuantity = quantities?.jumlahDisetujui
      ?? item.jumlahDisetujui
      ?? (items.length === 1 ? request.jumlahDisetujui : undefined)
      ?? item.jumlahDiminta;
    return {
      ...item,
      jumlahDisetujui: approvedQuantity,
      jumlahTersisa: quantities?.jumlahTersisa ?? approvedQuantity
    };
  }).filter(item => item.jumlahTersisa > 0);
};

export const StockRequestsView: React.FC = () => {
  const {
    requests, inventoryItems, auditLogs, updateRequestStatus, cancelInventoryRequest,
    confirmInventoryRequestReceipt, reportInventoryReceiptDiscrepancy,
    reopenInventoryRequestHandover, deleteInventoryRequests, currentUser, hasPermission
  } = useApp();
  // Pimpinan hanya memantau; Pemohon tidak memiliki kewenangan keputusan.
  const canApproveRequests = hasPermission('approveRequests') && !isPimpinanUser(currentUser);
  const canReviewRequests = canApproveRequests || hasPermission('manageInventory');
  const canDeleteRequests = canDeleteInventoryRequests(currentUser, (_user: unknown, permission: 'manageInventory') => hasPermission(permission));
  const canCancelOwnRequest = hasPermission('requestSupplies')
    && !hasPermission('manageInventory')
    && !canApproveRequests
    && !isPimpinanUser(currentUser);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isPermanentDeleteConfirmOpen, setIsPermanentDeleteConfirmOpen] = useState(false);
  const [isPermanentDeleteBusy, setIsPermanentDeleteBusy] = useState(false);
  const [permanentDeleteError, setPermanentDeleteError] = useState('');
  const [bulkCancelReason, setBulkCancelReason] = useState('');
  const [bulkCancelError, setBulkCancelError] = useState<string | null>(null);
  const [isBulkCancelBusy, setIsBulkCancelBusy] = useState(false);
  const [bulkDeleteNotice, setBulkDeleteNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InventoryRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelBusy, setIsCancelBusy] = useState(false);

  // Workflow Dialog State
  const [workflowTarget, setWorkflowTarget] = useState<{
    request: InventoryRequest;
    action: 'verify' | 'approve' | 'reject' | 'process' | 'complete' | 'reopen';
  } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [approvedQty, setApprovedQty] = useState<number>(1);
  const [approvedItemQuantities, setApprovedItemQuantities] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);

  // Printable Detail Modal State
  const [selectedDetail, setSelectedDetail] = useState<InventoryRequest | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<InventoryRequest | null>(null);
  const [receiptError, setReceiptError] = useState('');
  const [receiptReason, setReceiptReason] = useState('');
  const [isReceiptBusy, setIsReceiptBusy] = useState(false);
  const [isReportingDiscrepancy, setIsReportingDiscrepancy] = useState(false);
  const bulkCancelBusyRef = useRef(false);
  const permanentDeleteBusyRef = useRef(false);
  const cancelBusyRef = useRef(false);
  const workflowBusyRef = useRef(false);
  const receiptBusyRef = useRef(false);

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
  const pager = usePagedList(filteredRequests);

  const areAllPageRequestsSelected =
    pager.pageItems.length > 0 && pager.pageItems.every(request => selectedRequestIds.has(request.id));
  const isOwnRequest = (request: InventoryRequest) =>
    Boolean(currentUser?.id && request.pemohonUserId === currentUser.id);

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
      const next = new Set(prev);
      pager.pageItems.forEach(request => {
        if (areAllPageRequestsSelected) next.delete(request.id);
        else next.add(request.id);
      });
      return next;
    });
  };

  const handlePermanentDeleteRequests = async () => {
    if (permanentDeleteBusyRef.current || !canDeleteRequests || selectedRequestIds.size === 0) return;
    permanentDeleteBusyRef.current = true;
    setIsPermanentDeleteBusy(true);
    setPermanentDeleteError('');
    try {
      const result = await deleteInventoryRequests([...selectedRequestIds]);
      if (!result.success) {
        setPermanentDeleteError(result.message);
        return;
      }
      setSelectedRequestIds(new Set());
      setIsPermanentDeleteConfirmOpen(false);
      setBulkDeleteNotice({ type: 'success', message: result.message });
    } catch (error) {
      setPermanentDeleteError(error instanceof Error ? error.message : 'Gagal menghapus permohonan barang.');
    } finally {
      permanentDeleteBusyRef.current = false;
      setIsPermanentDeleteBusy(false);
    }
  };

  const handleBulkCancelRequests = async () => {
    if (isBulkCancelBusy || bulkCancelBusyRef.current) return;
    const reason = bulkCancelReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setBulkCancelError('Alasan pembatalan wajib diisi antara 5 sampai 500 karakter.');
      return;
    }
    bulkCancelBusyRef.current = true;
    setIsBulkCancelBusy(true);
    const selectedRequests = requests.filter(request => selectedRequestIds.has(request.id));
    const missingCount = selectedRequestIds.size - selectedRequests.length;
    let cancelledCount = 0;
    const failedIds = new Set([...selectedRequestIds].filter(id => !selectedRequests.some(request => request.id === id)));
    const errors: string[] = missingCount > 0
      ? [`${missingCount} permohonan tidak ditemukan.`]
      : [];

    for (const request of selectedRequests) {
      try {
        const result = await cancelInventoryRequest(request.id, reason);
        if (result.success) cancelledCount += 1;
        else {
          failedIds.add(request.id);
          errors.push(`${request.nomorPermintaan}: ${result.message}`);
        }
      } catch (error) {
        failedIds.add(request.id);
        errors.push(error instanceof Error ? error.message : `Gagal membatalkan permohonan ${request.nomorPermintaan}.`);
      }
    }

    setSelectedRequestIds(failedIds);
    if (errors.length === 0) {
      setIsBulkDeleteConfirmOpen(false);
      setBulkCancelReason('');
      setBulkCancelError(null);
    } else {
      setBulkCancelError(errors.join(' '));
    }
    setBulkDeleteNotice(
      errors.length > 0
        ? { type: 'error', message: `${cancelledCount} permohonan berhasil dibatalkan; riwayat tetap tersimpan. ${errors.join(' ')}` }
        : { type: 'success', message: `${cancelledCount} permohonan berhasil dibatalkan; riwayat tetap tersimpan.` }
    );
    bulkCancelBusyRef.current = false;
    setIsBulkCancelBusy(false);
  };

  const handleCancelOwnRequest = async () => {
    if (!cancelTarget || isCancelBusy || cancelBusyRef.current) return;
    const reason = cancelReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setCancelError('Alasan pembatalan wajib diisi antara 5 sampai 500 karakter.');
      return;
    }
    cancelBusyRef.current = true;
    setIsCancelBusy(true);
    try {
      const result = await cancelInventoryRequest(cancelTarget.id, reason);
      if (!result.success) {
        setCancelError(result.message);
        return;
      }
      setCancelTarget(null);
      setCancelReason('');
      setCancelError(null);
      setBulkDeleteNotice({ type: 'success', message: result.message });
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Pembatalan permohonan gagal dipastikan.');
    } finally {
      cancelBusyRef.current = false;
      setIsCancelBusy(false);
    }
  };

  // Metric stats
  const totalCount = requests.length;
  const pendingVerification = requests.filter(r => r.status === 'Diajukan').length;
  const approvedOrProcessing = requests.filter(r => r.status === 'Disetujui' || r.status === 'Diproses').length;
  const completedCount = requests.filter(r => r.status === 'Diterima' || r.status === 'Selesai').length;

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
      case 'Menunggu Konfirmasi':
        return 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20';
      case 'Diterima':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Selesai':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Ditolak':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case 'Dibatalkan':
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
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
    const remainingItems = getRequestRemainingItems(req);
    setApprovedQty(remainingItems[0]?.jumlahTersisa || 1);
    setApprovedItemQuantities(Object.fromEntries(remainingItems.map(item => [
      item.itemId,
      item.jumlahTersisa
    ])));
    setWorkflowTarget({ request: req, action: 'complete' });
  };

  const handleOpenVerifyDialog = (req: InventoryRequest) => {
    setErrorMessage(null);
    setActionNotes('');
    setWorkflowTarget({ request: req, action: 'verify' });
  };

  const handleOpenProcessDialog = (req: InventoryRequest) => {
    setErrorMessage(null);
    setActionNotes('');
    setWorkflowTarget({ request: req, action: 'process' });
  };

  const handleOpenReopenDialog = (req: InventoryRequest) => {
    setErrorMessage(null);
    setActionNotes('');
    setWorkflowTarget({ request: req, action: 'reopen' });
  };

  const executeWorkflowAction = async () => {
    if (!workflowTarget || isWorkflowBusy || workflowBusyRef.current) return;
    const { request, action } = workflowTarget;
    if (action === 'reject' && (actionNotes.trim().length < 5 || actionNotes.trim().length > 500)) {
      setErrorMessage('Alasan penolakan wajib diisi antara 5 sampai 500 karakter.');
      return;
    }
    workflowBusyRef.current = true;
    setIsWorkflowBusy(true);
    setErrorMessage(null);
    try {
      let result: { success: boolean; message: string };
      if (action === 'verify') {
        result = await updateRequestStatus(request.id, 'Diverifikasi', actionNotes);
      } else if (action === 'approve') {
        const approvedItems = getRequestItems(request).map(item => ({
          ...item,
          jumlahDisetujui: approvedItemQuantities[item.itemId] ?? item.jumlahDiminta
        }));
        result = await updateRequestStatus(
          request.id,
          'Disetujui',
          actionNotes,
          approvedItems[0]?.jumlahDisetujui ?? approvedQty,
          approvedItems
        );
      } else if (action === 'reject') {
        result = await updateRequestStatus(request.id, 'Ditolak', actionNotes);
      } else if (action === 'process') {
        result = await updateRequestStatus(request.id, 'Diproses', actionNotes);
      } else if (action === 'complete') {
        const deliveredItems = getRequestRemainingItems(request).map(item => ({
          ...item,
          jumlahDisetujui: approvedItemQuantities[item.itemId] ?? item.jumlahTersisa
        }));
        result = await updateRequestStatus(
          request.id,
          'Menunggu Konfirmasi',
          actionNotes,
          request.jumlahDisetujui ?? request.jumlahDiminta,
          deliveredItems
        );
      } else {
        result = await reopenInventoryRequestHandover(request.id);
      }
      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }

      setWorkflowTarget(null);
      setErrorMessage(null);
      setBulkDeleteNotice({ type: 'success', message: result.message });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Tindakan permohonan gagal dipastikan.');
    } finally {
      workflowBusyRef.current = false;
      setIsWorkflowBusy(false);
    }
  };

  const submitReceiptConfirmation = async () => {
    if (!receiptTarget || isReceiptBusy || receiptBusyRef.current) return;
    receiptBusyRef.current = true;
    setIsReceiptBusy(true);
    setReceiptError('');
    try {
      const result = isReportingDiscrepancy
        ? await reportInventoryReceiptDiscrepancy(receiptTarget.id, receiptReason.trim())
        : await confirmInventoryRequestReceipt(receiptTarget.id);
      if (!result.success) {
        setReceiptError(result.message);
        return;
      }
      setReceiptTarget(null);
      setReceiptReason('');
      setIsReportingDiscrepancy(false);
      setBulkDeleteNotice({ type: 'success', message: result.message });
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : 'Penerimaan barang gagal dipastikan.');
    } finally {
      receiptBusyRef.current = false;
      setIsReceiptBusy(false);
    }
  };

  const openReceiptDialog = (request: InventoryRequest) => {
    setReceiptTarget(request);
    setReceiptError('');
    setReceiptReason('');
    setIsReportingDiscrepancy(false);
  };
  const workflowItems: OutstandingRequestItem[] = !workflowTarget
    ? []
    : workflowTarget.action === 'complete'
      ? getRequestRemainingItems(workflowTarget.request)
      : getRequestItems(workflowTarget.request).map(item => ({
          ...item,
          jumlahTersisa: item.jumlahDiminta
        }));

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
            Pengelolaan alur permohonan ATK/ARK BPS Kabupaten Minahasa Utara TA 2026
          </p>
        </div>

        {hasPermission('requestSupplies') && (
          <button
            onClick={() => setIsNewRequestOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-600/20 w-fit"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Permohonan ATK/ARK</span>
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
          {(['all', 'Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Menunggu Konfirmasi', 'Diterima', 'Selesai', 'Ditolak', 'Dibatalkan'] as const).map(st => (
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
                  checked={areAllPageRequestsSelected}
                  onChange={toggleAllRequestSelection}
                  disabled={isPermanentDeleteBusy || isBulkCancelBusy}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                  aria-label="Pilih semua permohonan yang ditampilkan"
                />
                Pilih Semua di Halaman Ini
              </label>
              <span className="text-xs text-slate-400">{selectedRequestIds.size} data dipilih</span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => {
                if (selectedRequestIds.size > 0) {
                  setBulkDeleteNotice(null);
                  setBulkCancelReason('');
                  setBulkCancelError(null);
                  setIsBulkDeleteConfirmOpen(true);
                }
              }}
              disabled={selectedRequestIds.size === 0 || isPermanentDeleteBusy || isBulkCancelBusy}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
              Batalkan Terpilih ({selectedRequestIds.size})
            </button>
            {canDeleteRequests && (
              <button
                type="button"
                onClick={() => {
                  setPermanentDeleteError('');
                  setBulkDeleteNotice(null);
                  setIsPermanentDeleteConfirmOpen(true);
                }}
                disabled={selectedRequestIds.size === 0 || isPermanentDeleteBusy || isBulkCancelBusy}
                className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                Hapus Terpilih ({selectedRequestIds.size})
              </button>
            )}
            </div>
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
            pager.pageItems.map(req => {
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
                          disabled={isPermanentDeleteBusy || isBulkCancelBusy}
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
                        {requestItems.map(requestItem => {
                          const receivedQuantity = (req.penerimaan?.diterimaItems || [])
                            .find(received => received.itemId === requestItem.itemId)?.jumlah || 0;
                          return (
                            <div key={requestItem.itemId} className="font-mono font-bold text-sm text-white">
                              {requestItem.jumlahDiminta} {requestItem.satuan}
                              {requestItem.jumlahDisetujui !== undefined && requestItem.jumlahDisetujui !== requestItem.jumlahDiminta && (
                                <span className="block text-[10px] text-amber-400">Setuju: {requestItem.jumlahDisetujui}</span>
                              )}
                              {receivedQuantity > 0 && (
                                <span className="block text-[10px] text-emerald-400">
                                  Diterima: {receivedQuantity}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {requestItems.length > 1 && (
                          <div className="text-[10px] text-slate-500">{requestItems.length} jenis</div>
                        )}
                        {item && requestItems.length === 1 && !['Selesai', 'Diterima'].includes(req.status) && (
                          <div className={`text-[10px] ${item.stokSaatIni < Math.max(0, (requestItems[0].jumlahDisetujui ?? req.jumlahDiminta) - ((req.penerimaan?.diterimaItems || []).find(received => received.itemId === requestItems[0].itemId)?.jumlah || 0)) ? 'text-rose-400' : 'text-slate-400'}`}>
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
                      {req.status === 'Diajukan' && canCancelOwnRequest && isOwnRequest(req) && (
                        <button
                          onClick={() => {
                            setCancelTarget(req);
                            setCancelReason('');
                            setCancelError(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white text-xs font-bold transition-colors min-h-[36px]"
                          title="Batalkan permohonan sendiri"
                        >
                          Batal
                        </button>
                      )}
                      {req.status === 'Diajukan' && canReviewRequests && (
                        <>
                          <button
                            onClick={() => handleOpenVerifyDialog(req)}
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

                      {req.status === 'Diajukan' && !canReviewRequests && (
                        <span className="text-cyan-400 text-xs font-medium">Menunggu Verifikasi</span>
                      )}

                      {req.status === 'Diverifikasi' && (
                        canApproveRequests ? (
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
                            onClick={() => handleOpenProcessDialog(req)}
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
                            Tandai Barang Diserahkan
                          </button>
                        ) : (
                          <span className="text-blue-400 text-xs font-medium">Sedang Disiapkan</span>
                        )
                      )}

                      {req.status === 'Menunggu Konfirmasi' && isOwnRequest(req) && (
                        <button
                          onClick={() => openReceiptDialog(req)}
                          className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-sm transition-colors min-h-[36px]"
                        >
                          Konfirmasi Barang Diterima
                        </button>
                      )}

                      {req.status === 'Menunggu Konfirmasi' && hasPermission('manageInventory') && req.penerimaan?.catatanSelisih && (
                        <button
                          onClick={() => handleOpenReopenDialog(req)}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors min-h-[36px]"
                        >
                          Tindaklanjuti Selisih
                        </button>
                      )}

                      {['Diterima', 'Selesai'].includes(req.status) && (
                        <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{req.status === 'Diterima' ? 'Diterima' : 'Diserahkan (historis)'}</span>
                        </span>
                      )}

                      {req.status === 'Ditolak' && (
                        <span className="text-rose-400 text-xs font-semibold">
                          Ditolak
                        </span>
                      )}
                      {req.status === 'Dibatalkan' && (
                        <span className="text-slate-400 text-xs font-semibold">
                          Dibatalkan
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
                      checked={areAllPageRequestsSelected}
                      onChange={toggleAllRequestSelection}
                      disabled={isPermanentDeleteBusy || isBulkCancelBusy}
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
                pager.pageItems.map(req => {
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
                            disabled={isPermanentDeleteBusy || isBulkCancelBusy}
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
                              {((req.penerimaan?.diterimaItems || []).find(received => received.itemId === requestItem.itemId)?.jumlah || 0) > 0 && (
                                <div className="text-[10px] text-emerald-400">
                                  Diterima: {(req.penerimaan?.diterimaItems || []).find(received => received.itemId === requestItem.itemId)?.jumlah} {requestItem.satuan}
                                </div>
                              )}
                              {stockItem && !['Selesai', 'Diterima'].includes(req.status) && (
                                <div className={`text-[10px] ${stockItem.stokSaatIni < Math.max(0, (requestItem.jumlahDisetujui ?? requestItem.jumlahDiminta) - ((req.penerimaan?.diterimaItems || []).find(received => received.itemId === requestItem.itemId)?.jumlah || 0)) ? 'text-rose-400' : 'text-slate-400'}`}>
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

                          {req.status === 'Diajukan' && canCancelOwnRequest && isOwnRequest(req) && (
                            <button
                              onClick={() => {
                                setCancelTarget(req);
                                setCancelReason('');
                                setCancelError(null);
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white text-[10px] font-bold transition-colors"
                              title="Batalkan permohonan sendiri"
                            >
                              Batal
                            </button>
                          )}

                          {/* Workflow progression */}
                          {req.status === 'Diajukan' && canReviewRequests && (
                            <>
                              <button
                                onClick={() => handleOpenVerifyDialog(req)}
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

                          {req.status === 'Diajukan' && !canReviewRequests && (
                            <span className="text-cyan-400 text-[10px] font-medium">Menunggu Verifikasi</span>
                          )}

                          {req.status === 'Diverifikasi' && (
                            canApproveRequests ? (
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
                                onClick={() => handleOpenProcessDialog(req)}
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
                                title="Tandai barang sudah diserahkan untuk menunggu konfirmasi Pemohon"
                              >
                                Tandai Diserahkan
                              </button>
                            ) : (
                              <span className="text-blue-400 text-[10px] font-medium">Sedang Disiapkan</span>
                            )
                          )}

                          {req.status === 'Menunggu Konfirmasi' && isOwnRequest(req) && (
                            <button
                              onClick={() => openReceiptDialog(req)}
                              className="px-2 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold transition-colors"
                            >
                              Konfirmasi Diterima
                            </button>
                          )}

                          {req.status === 'Menunggu Konfirmasi' && hasPermission('manageInventory') && req.penerimaan?.catatanSelisih && (
                            <button
                              onClick={() => handleOpenReopenDialog(req)}
                              className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold transition-colors"
                            >
                              Tindaklanjuti Selisih
                            </button>
                          )}

                          {['Diterima', 'Selesai'].includes(req.status) && (
                            <span className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{req.status === 'Diterima' ? 'Diterima' : 'Diserahkan (historis)'}</span>
                            </span>
                          )}

                          {req.status === 'Ditolak' && (
                            <span className="text-rose-400 text-[10px] font-semibold">
                              Ditolak
                            </span>
                          )}
                          {req.status === 'Dibatalkan' && (
                            <span className="text-slate-400 text-[10px] font-semibold">
                              Dibatalkan
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
        <ListPager {...pager} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} label="permohonan" />
      </div>

      {receiptTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-confirmation-title"
            className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 id="receipt-confirmation-title" className="text-sm font-bold text-white">
              {isReportingDiscrepancy ? 'Laporkan Selisih Penerimaan' : 'Konfirmasi Barang Diterima'}
            </h3>
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs space-y-2">
              <div className="text-slate-400">
                Permohonan <span className="font-mono font-bold text-cyan-300">{receiptTarget.nomorPermintaan}</span>
              </div>
              <div className="text-white font-semibold">{receiptTarget.pemohonNama} · {receiptTarget.unitKerja}</div>
              <div className="space-y-1 border-t border-slate-800 pt-2">
                {(receiptTarget.penerimaan?.items || []).map(delivered => {
                  const item = getRequestItems(receiptTarget).find(row => row.itemId === delivered.itemId);
                  return (
                    <div key={delivered.itemId} className="flex justify-between gap-3 text-slate-200">
                      <span>{item?.namaBarang || 'Barang'} ({item?.satuan || ''})</span>
                      <span className="font-mono font-bold">{delivered.jumlah}</span>
                    </div>
                  );
                })}
              </div>
              {(receiptTarget.penerimaan?.diterimaItems || []).length > 0 && (
                <div className="space-y-1 border-t border-slate-800 pt-2 text-[10px] text-emerald-300">
                  <div className="font-semibold">Jumlah yang sudah diterima pada penyerahan sebelumnya</div>
                  {(receiptTarget.penerimaan?.diterimaItems || []).map(received => {
                    const item = getRequestItems(receiptTarget).find(row => row.itemId === received.itemId);
                    return (
                      <div key={received.itemId} className="flex justify-between gap-3">
                        <span>{item?.namaBarang || 'Barang'} ({item?.satuan || ''})</span>
                        <span className="font-mono font-bold">{received.jumlah}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="text-[10px] text-slate-400">
                Diserahkan oleh {receiptTarget.penerimaan?.diserahkanOleh || '—'} pada{' '}
                {receiptTarget.penerimaan?.diserahkanPada
                  ? new Date(receiptTarget.penerimaan.diserahkanPada).toLocaleString('id-ID')
                  : '—'}
              </div>
            </div>
            {receiptTarget.penerimaan?.catatanSelisih && (
              <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                Laporan selisih: {receiptTarget.penerimaan.catatanSelisih}. Konfirmasi ditahan sampai petugas menindaklanjuti.
              </div>
            )}
            {isReportingDiscrepancy && (
              <div>
                <label htmlFor="receipt-discrepancy-reason" className="block text-xs font-semibold text-slate-300 mb-1">
                  Jelaskan selisih yang diterima (5–500 karakter)
                </label>
                <textarea
                  id="receipt-discrepancy-reason"
                  value={receiptReason}
                  onChange={event => setReceiptReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                disabled={isReceiptBusy}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>
            )}
            {receiptError && <p role="alert" className="text-xs text-rose-300">{receiptError}</p>}
            <p className="text-xs text-slate-400">
              {isReportingDiscrepancy
                ? 'Apakah Anda yakin ingin mengirim laporan selisih penerimaan barang ini? Laporan tidak mengurangi stok. Petugas akan memeriksa dan menindaklanjuti selisih.'
                : 'Apakah Anda yakin semua barang dan jumlah di atas sudah diterima? Konfirmasi ini akan mencatat mutasi stok dan tidak dapat dibatalkan.'}
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsReportingDiscrepancy(value => !value)}
                disabled={isReceiptBusy || receiptTarget.penerimaan?.status === 'Diterima'}
                className="px-3 py-2 rounded-xl bg-amber-600/15 text-amber-300 hover:bg-amber-600/25 text-xs font-semibold disabled:opacity-50"
              >
                {isReportingDiscrepancy ? 'Kembali ke Konfirmasi' : 'Laporkan Selisih'}
              </button>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReceiptTarget(null)}
                  disabled={isReceiptBusy}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Tidak, Batal
                </button>
                <button
                  type="button"
                  onClick={() => void submitReceiptConfirmation()}
                  disabled={isReceiptBusy ||
                    (isReportingDiscrepancy && receiptReason.trim().length < 5) ||
                    (!isReportingDiscrepancy && Boolean(receiptTarget.penerimaan?.catatanSelisih))}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
                >
                  {isReceiptBusy
                    ? 'Memproses...'
                    : isReportingDiscrepancy ? 'Iya, Kirim Laporan' : 'Iya, Konfirmasi Diterima'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPermanentDeleteConfirmOpen && canDeleteRequests && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="permanent-request-delete-title" className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 id="permanent-request-delete-title" className="text-sm font-bold text-white">Konfirmasi Hapus Permohonan</h3>
            <p className="text-xs text-slate-300">
              Apakah Anda yakin ingin menghapus permanen {selectedRequestIds.size} permohonan barang terpilih? Tindakan ini tidak dapat dibatalkan.
            </p>
            <p className="text-xs text-amber-300">
              Permohonan beserta rincian penerimaannya dihapus. Stok dan transaksi barang keluar yang sudah tercatat tidak diubah; audit penghapusan tetap disimpan.
            </p>
            {permanentDeleteError && <p role="alert" className="text-xs text-rose-300">{permanentDeleteError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setIsPermanentDeleteConfirmOpen(false)} disabled={isPermanentDeleteBusy} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl disabled:opacity-50">
                Tidak, Batal
              </button>
              <button type="button" onClick={() => void handlePermanentDeleteRequests()} disabled={isPermanentDeleteBusy} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl disabled:opacity-50">
                {isPermanentDeleteBusy ? 'Menghapus...' : 'Iya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-cancel-requests-title"
            className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 space-y-4"
          >
            <h3 id="bulk-cancel-requests-title" className="text-sm font-bold text-white">
              Konfirmasi Pembatalan Permohonan
            </h3>
            <p className="text-xs text-slate-300">
              Apakah Anda yakin ingin membatalkan {selectedRequestIds.size} permohonan terpilih? Riwayat dan rincian barang tetap tersimpan.
            </p>
            <div>
              <label htmlFor="bulk-request-cancellation-reason" className="block text-xs font-semibold text-slate-300 mb-1">
                Alasan pembatalan (wajib, 5–500 karakter)
              </label>
              <textarea
                id="bulk-request-cancellation-reason"
                value={bulkCancelReason}
                onChange={event => setBulkCancelReason(event.target.value)}
                rows={3}
                maxLength={500}
                disabled={isBulkCancelBusy}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                placeholder="Tuliskan alasan pembatalan..."
              />
            </div>
            {bulkCancelError && <p role="alert" className="text-xs text-rose-300">{bulkCancelError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  if (isBulkCancelBusy) return;
                  setIsBulkDeleteConfirmOpen(false);
                  setBulkCancelReason('');
                  setBulkCancelError(null);
                }}
                disabled={isBulkCancelBusy}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Tidak, Batal
              </button>
              <button
                onClick={() => void handleBulkCancelRequests()}
                disabled={isBulkCancelBusy || bulkCancelReason.trim().length < 5 || bulkCancelReason.trim().length > 500}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
              >
                {isBulkCancelBusy ? 'Membatalkan...' : 'Iya, Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-request-title"
            className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 space-y-4"
          >
            <h3 id="cancel-request-title" className="text-sm font-bold text-white">
              Batalkan Permohonan
            </h3>
            <p className="text-xs text-slate-300">
              Apakah Anda yakin ingin membatalkan permohonan barang ini? Permohonan {cancelTarget.nomorPermintaan} akan tetap tersimpan sebagai riwayat.
            </p>
            <div>
              <label htmlFor="request-cancellation-reason" className="block text-xs font-semibold text-slate-300 mb-1">
                Alasan pembatalan (wajib)
              </label>
              <textarea
                id="request-cancellation-reason"
                value={cancelReason}
                onChange={event => setCancelReason(event.target.value)}
                rows={3}
                maxLength={500}
                autoFocus
                disabled={isCancelBusy}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                placeholder="Tuliskan alasan pembatalan, minimal 5 karakter..."
              />
              <div className="mt-1 text-right text-[10px] text-slate-500">{cancelReason.trim().length}/500</div>
            </div>
            {cancelError && (
              <div role="alert" className="text-xs text-rose-300">{cancelError}</div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isCancelBusy) return;
                  setCancelTarget(null);
                  setCancelReason('');
                  setCancelError(null);
                }}
                disabled={isCancelBusy}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Tidak, Batal
              </button>
              <button
                type="button"
                onClick={() => void handleCancelOwnRequest()}
                disabled={isCancelBusy || cancelReason.trim().length < 5 || cancelReason.trim().length > 500}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
              >
                {isCancelBusy ? 'Membatalkan...' : 'Iya, Batalkan'}
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

      {/* Request workflow confirmation dialog */}
      {workflowTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div role="dialog" aria-modal="true" aria-labelledby="request-workflow-title" className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 id="request-workflow-title" className="text-sm font-bold text-white flex items-center gap-2">
                {(workflowTarget.action === 'verify' || workflowTarget.action === 'process') && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                {workflowTarget.action === 'approve' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                {workflowTarget.action === 'reject' && <X className="w-4 h-4 text-rose-400" />}
                {workflowTarget.action === 'complete' && <Boxes className="w-4 h-4 text-emerald-400" />}
                {workflowTarget.action === 'reopen' && <RotateCcw className="w-4 h-4 text-amber-400" />}
                <span>
                  {workflowTarget.action === 'verify' && 'Verifikasi Permohonan Barang'}
                  {workflowTarget.action === 'approve' && 'Persetujuan Permohonan Barang'}
                  {workflowTarget.action === 'reject' && 'Tolak Permohonan Barang'}
                  {workflowTarget.action === 'process' && 'Proses Gudang'}
                  {workflowTarget.action === 'complete' && 'Pengeluaran Barang dari Gudang'}
                  {workflowTarget.action === 'reopen' && 'Tindaklanjuti Selisih Penerimaan'}
                </span>
              </h3>
              <button
                onClick={() => setWorkflowTarget(null)}
                disabled={isWorkflowBusy}
                className="text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              {workflowTarget.action === 'verify' ? 'Apakah Anda yakin ingin memverifikasi permohonan barang ini?'
                : workflowTarget.action === 'approve' ? 'Apakah Anda yakin ingin menyetujui permohonan barang ini?'
                : workflowTarget.action === 'reject' ? 'Apakah Anda yakin ingin menolak permohonan barang ini?'
                : workflowTarget.action === 'process' ? 'Apakah Anda yakin ingin memproses permohonan barang ini di gudang?'
                : workflowTarget.action === 'complete' ? 'Apakah Anda yakin ingin menandai barang pada permohonan ini sudah diserahkan?'
                : 'Apakah Anda yakin ingin mengembalikan permohonan ini ke tahap penyerahan untuk menindaklanjuti selisih?'}
            </p>

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
              <div className="text-slate-400">
                Status: <span className="font-semibold text-white">{workflowTarget.request.status}</span>
                {' → '}
                <span className="font-semibold text-cyan-300">
                  {workflowTarget.action === 'verify' ? 'Diverifikasi'
                    : workflowTarget.action === 'approve' ? 'Disetujui'
                    : workflowTarget.action === 'reject' ? 'Ditolak'
                    : workflowTarget.action === 'process' ? 'Diproses'
                    : workflowTarget.action === 'complete' ? 'Menunggu Konfirmasi'
                    : 'Diproses'}
                </span>
              </div>
            </div>

            {errorMessage && (
              <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>{errorMessage}</div>
              </div>
            )}

            {(workflowTarget.action === 'approve' || workflowTarget.action === 'complete') && workflowItems.map((requestItem, index) => (
              <div key={requestItem.itemId}>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {workflowItems.length > 1 ? `${index + 1}. ` : ''}{requestItem.namaBarang} —{' '}
                  {workflowTarget.action === 'complete'
                    ? `jumlah yang diserahkan (sisa ${requestItem.jumlahTersisa} ${requestItem.satuan})`
                    : `jumlah disetujui (${requestItem.satuan})`}
                </label>
                <input
                  type="number"
                  min="1"
                  max={workflowTarget.action === 'complete' ? requestItem.jumlahTersisa : requestItem.jumlahDiminta}
                  value={approvedItemQuantities[requestItem.itemId] ?? (
                    workflowTarget.action === 'complete' ? requestItem.jumlahTersisa : requestItem.jumlahDiminta
                  )}
                  disabled={isWorkflowBusy}
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
                disabled={isWorkflowBusy}
                maxLength={500}
                minLength={workflowTarget.action === 'reject' ? 5 : undefined}
                placeholder={workflowTarget.action === 'reject' ? 'Tuliskan alasan penolakan...' : 'Catatan petugas (opsional)...'}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              ></textarea>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWorkflowTarget(null)}
                disabled={isWorkflowBusy}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Tidak, Batal
              </button>

              <button
                type="button"
                onClick={() => void executeWorkflowAction()}
                disabled={isWorkflowBusy}
                className={`px-4 py-2 text-white text-xs font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 ${
                  workflowTarget.action === 'reject'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                    : workflowTarget.action === 'complete'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                    : workflowTarget.action === 'reopen'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                    : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                }`}
              >
                {isWorkflowBusy ? (
                  <span className="flex items-center gap-2"><RotateCcw className="w-3.5 h-3.5 animate-spin" /> Menyimpan...</span>
                ) : workflowTarget.action === 'verify' ? 'Iya, Verifikasi'
                  : workflowTarget.action === 'approve' ? 'Iya, Setujui'
                  : workflowTarget.action === 'reject' ? 'Iya, Tolak'
                  : workflowTarget.action === 'process' ? 'Iya, Proses Gudang'
                  : workflowTarget.action === 'complete' ? 'Iya, Tandai Diserahkan'
                  : 'Iya, Tindak Lanjuti'}
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
                            <th className="py-1 px-2">Diterima</th>
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
                              <td className="py-1.5 px-2 whitespace-nowrap font-mono text-cyan-300">
                                {(selectedDetail.penerimaan?.diterimaItems || [])
                                  .find(received => received.itemId === requestItem.itemId)?.jumlah || 0} {requestItem.satuan}
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
                    <td className="p-2 font-semibold text-slate-400 bg-slate-900 align-top">Status Alur Dokumen</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBadgeStyle(selectedDetail.status)}`}>
                        {selectedDetail.status}
                      </span>
                      <ol className="mt-2 space-y-1">
                        {getRequestFlowTimeline(selectedDetail, auditLogs).map(entry => (
                          <li key={entry.status} className="flex items-start gap-2 text-[11px]">
                            <span
                              className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                !entry.reached
                                  ? 'bg-slate-700'
                                  : entry.status === 'Ditolak'
                                    ? 'bg-rose-400'
                                    : entry.status === 'Dibatalkan'
                                      ? 'bg-slate-400'
                                      : entry.current
                                        ? 'bg-cyan-400 ring-2 ring-cyan-400/30'
                                        : 'bg-emerald-400'
                              }`}
                            />
                            <span className={`w-44 shrink-0 ${entry.reached ? 'text-slate-200 font-semibold' : 'text-slate-500'}`}>
                              {entry.label}
                            </span>
                            <span className={`font-mono ${entry.reached ? 'text-white' : 'text-slate-500'}`}>
                              {formatFlowTimestamp(entry.timestamp) || (entry.reached ? 'Tanggal tidak tercatat' : 'Belum')}
                              {entry.actor && entry.timestamp && (
                                <span className="ml-1 font-sans text-slate-400">• {entry.actor}</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ol>
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
