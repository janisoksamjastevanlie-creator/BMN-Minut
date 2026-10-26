import { useCallback, type RefObject } from 'react';
import type { InventoryItem, InventoryRequest, InventoryRequestItem, User } from '../types';
import { getRequestableStock, normalizeRequestHandoverItems } from '../../requestStockValidation.mjs';
import { getNextRequestNumber } from '../../requestNumber.mjs';
import { apiFailureMessage, fetchWithTimeout, readApiResponse } from '../utils/serverRequest';
import { mergeStateAfterConflict } from '../../stateConflict.mjs';
import {
  StateSyncError,
  cloneSharedState,
  sameSharedState,
  type LogAudit,
  type PushNotification,
  type RequestStateChange
} from './syncHelpers';
import { isPimpinanUser } from '../utils/rbac';

type RequestStateRef = RefObject<Record<string, unknown> | null>;
type WaitersRef = RefObject<Map<string, {
  resolve: (request: InventoryRequest) => void;
  reject: (error: Error) => void;
  expectedStatus?: InventoryRequest['status'];
}>>;
type WhatsappEventsRef = RefObject<Array<{
  eventId: string;
  requestId: string;
  status: InventoryRequest['status'];
  action: 'submitted' | 'status_changed';
  note?: string;
}>>;
type WhatsappStatusRef = RefObject<Map<string, InventoryRequest['status']>>;

interface UseRequestsParams {
  inventoryItems: InventoryItem[];
  requests: InventoryRequest[];
  currentUser: User | null;
  hasPermission: (permission: 'approveRequests' | 'manageInventory' | 'requestSupplies') => boolean;
  logAudit: LogAudit;
  pushNotification: PushNotification;
  persistSharedState: (requestChange?: RequestStateChange) => Promise<void>;
  reloadServerData: () => Promise<boolean>;
  applySharedState: (state: Record<string, unknown>) => void;
  setSyncError: (message: string | null, recoverable?: boolean) => void;
  lastSyncedStateRef: RequestStateRef;
  latestSharedStateRef: RefObject<Record<string, unknown>>;
  syncBlockedRef: RefObject<boolean>;
  syncQueueRef: RefObject<Promise<void>>;
  revisionRef: RefObject<number>;
  pendingServerActionsRef: RefObject<number>;
  pageRefreshRequestedRef: RefObject<boolean>;
  requestPersistenceWaitersRef: WaitersRef;
  pendingRequestWhatsAppEventsRef: WhatsappEventsRef;
  queuedRequestWhatsAppStatusRef: WhatsappStatusRef;
}

// Permohonan barang persediaan: pengajuan, persetujuan, penyerahan, pembatalan.
// Workflow ini selalu beroperasi erat dengan mesin sinkronisasi di AppContext,
// sehingga mesin disuntikkan lewat params (semuanya ref/function stabil-secara-semantik).
export const useRequests = ({
  inventoryItems, requests, currentUser, hasPermission,
  logAudit, pushNotification, persistSharedState, reloadServerData, applySharedState, setSyncError,
  lastSyncedStateRef, latestSharedStateRef, syncBlockedRef, syncQueueRef, revisionRef,
  pendingServerActionsRef, pageRefreshRequestedRef, requestPersistenceWaitersRef,
  pendingRequestWhatsAppEventsRef, queuedRequestWhatsAppStatusRef
}: UseRequestsParams) => {
  const queueRequestWhatsAppEvent = useCallback((
    request: InventoryRequest,
    action: 'submitted' | 'status_changed',
    note?: string
  ) => {
    pendingRequestWhatsAppEventsRef.current.push({
      eventId: crypto.randomUUID(),
      requestId: request.id,
      status: request.status,
      action,
      note
    });
  }, [pendingRequestWhatsAppEventsRef]);

  const addInventoryRequest = useCallback((reqData: Omit<InventoryRequest, 'id' | 'nomorPermintaan' | 'tanggal' | 'status'>) => {
    const requestedItems = reqData.items?.length
      ? reqData.items
      : [{
          itemId: reqData.itemId,
          namaBarang: reqData.namaBarang,
          jumlahDiminta: reqData.jumlahDiminta,
          satuan: reqData.satuan
        }];
    if (requestedItems.length > 100) throw new Error('Satu permohonan maksimal berisi 100 jenis barang.');
    const seenItemIds = new Set<string>();
    const normalizedItems = requestedItems.map((requestedItem, index) => {
      const item = inventoryItems.find(inventoryItem => inventoryItem.id === requestedItem.itemId);
      if (!item) throw new Error(`Barang pada baris ${index + 1} tidak ditemukan dalam master persediaan.`);
      if (!Number.isSafeInteger(requestedItem.jumlahDiminta) || requestedItem.jumlahDiminta <= 0) {
        throw new Error(`Jumlah barang pada baris ${index + 1} harus berupa bilangan bulat lebih dari nol.`);
      }
      if (seenItemIds.has(item.id)) throw new Error(`Barang pada baris ${index + 1} dipilih lebih dari sekali.`);
      seenItemIds.add(item.id);
      const availableStock = getRequestableStock(item.id, inventoryItems, requests);
      if (availableStock === 0) {
        throw new Error(`${item.nama} tidak dapat diajukan karena stok tersedia 0 ${item.satuan}.`);
      }
      if (requestedItem.jumlahDiminta > availableStock) {
        throw new Error(`Jumlah permintaan ${item.nama} melebihi stok tersedia. Stok tersedia: ${availableStock} ${item.satuan}.`);
      }
      return {
        itemId: item.id,
        namaBarang: item.nama,
        kodeBarang: item.kodeBarang,
        jumlahDiminta: requestedItem.jumlahDiminta,
        satuan: item.satuan,
        spesifikasi: requestedItem.spesifikasi?.trim() || undefined,
        catatan: requestedItem.catatan?.trim() || undefined
      };
    });
    const item = inventoryItems.find(i => i.id === normalizedItems[0].itemId);
    const now = new Date();
    const requestDate = now.toISOString().split('T')[0];
    const newReq: InventoryRequest = {
      ...reqData,
      id: crypto.randomUUID(),
      nomorPermintaan: getNextRequestNumber(requests, requestDate.slice(0, 4)),
      tanggal: requestDate,
      status: 'Diajukan',
      namaBarang: item ? item.nama : reqData.namaBarang,
      itemId: normalizedItems[0].itemId,
      jumlahDiminta: normalizedItems[0].jumlahDiminta,
      satuan: item ? item.satuan : reqData.satuan,
      items: normalizedItems
    };

    const requestChange: RequestStateChange = { request: newReq, auditLogs: [], notifications: [] };
    const persisted = new Promise<InventoryRequest>((resolve, reject) => {
      requestPersistenceWaitersRef.current.set(newReq.id, { resolve, reject, expectedStatus: 'Diajukan' });
    });
    queueRequestWhatsAppEvent(newReq, 'submitted', newReq.catatan);
    const itemSummary = normalizedItems.map(requestedItem => `${requestedItem.namaBarang} (${requestedItem.jumlahDiminta} ${requestedItem.satuan})`).join(', ');
    logAudit('Pengajuan Permohonan Barang', 'PERSEDIAAN', `Permohonan baru (${newReq.id}): ${itemSummary} diajukan oleh ${newReq.pemohonNama}`, requestChange);
    pushNotification('PERMINTAAN_BARU', '📋 Permohonan Barang Baru', `${newReq.pemohonNama} mengajukan ${normalizedItems.length} jenis barang: ${itemSummary}`, 'requests', requestChange);
    void persistSharedState(requestChange);
    return persisted.catch(async (error: unknown) => {
      if (error instanceof StateSyncError && !error.definitelyNotSaved) {
        try {
          await reloadServerData();
        } catch (statusError) {
          throw new StateSyncError(
            `Status penyimpanan permohonan belum dapat dipastikan. ${apiFailureMessage(statusError)} Jangan kirim ulang sebelum daftar permohonan diperiksa.`
          );
        }
        if (syncBlockedRef.current) {
          throw new StateSyncError('Status penyimpanan permohonan belum dapat dipastikan. Muat ulang data server dan periksa daftar permohonan sebelum mengirim ulang.');
        }
        const latestRequests = lastSyncedStateRef.current?.requests;
        const persistedRequest = Array.isArray(latestRequests)
          ? (latestRequests as InventoryRequest[]).find(request => request.id === newReq.id)
          : undefined;
        if (persistedRequest) return persistedRequest;
        throw new StateSyncError(
          'Server memastikan permohonan belum tersimpan. Isian formulir tetap tersedia; Anda dapat mencoba kembali.',
          true
        );
      }
      if (error instanceof StateSyncError && error.definitelyNotSaved) {
        pendingRequestWhatsAppEventsRef.current = pendingRequestWhatsAppEventsRef.current.filter(event => event.requestId !== newReq.id);
        if (error.status === 400) syncBlockedRef.current = false;
      }
      throw error;
    });
  }, [inventoryItems, requests, requestPersistenceWaitersRef, queueRequestWhatsAppEvent, logAudit, pushNotification,
    persistSharedState, reloadServerData, syncBlockedRef, lastSyncedStateRef, pendingRequestWhatsAppEventsRef]);

  const updateRequestStatus = useCallback(async (
    id: string,
    status: InventoryRequest['status'],
    catatan?: string,
    jumlahDisetujui?: number,
    itemsDisetujui?: InventoryRequestItem[]
  ): Promise<{ success: boolean; message: string }> => {
    const target = requests.find(r => r.id === id);
    if (!target) return { success: false, message: 'Permohonan tidak ditemukan' };
    const canApprove = hasPermission('approveRequests') && !isPimpinanUser(currentUser);
    const canManage = hasPermission('manageInventory');
    const canRequest = hasPermission('requestSupplies');
    const isPimpinan = isPimpinanUser(currentUser);
    const canCancelOwn = status === 'Dibatalkan' && canRequest && !canApprove && !canManage &&
      !isPimpinan && target.pemohonUserId === currentUser?.id && target.status === 'Diajukan';
    const canCancelManaged = status === 'Dibatalkan' && (canApprove || canManage) && !isPimpinan &&
      ['Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses'].includes(target.status);
    const allowed = status === 'Dibatalkan'
      ? canCancelOwn || canCancelManaged
      : status === 'Disetujui' || (status === 'Ditolak' && target.status === 'Diverifikasi')
        ? canApprove
        : canApprove || canManage;
    if (!allowed) return { success: false, message: 'Anda tidak berwenang mengubah status permohonan ini.' };
    if (requestPersistenceWaitersRef.current.has(id)) {
      return { success: false, message: 'Perubahan status permohonan ini masih diproses.' };
    }
    if (target.status === status) {
      return { success: false, message: `Permohonan sudah berstatus ${status}.` };
    }

    let actionNote = catatan;
    if (status === 'Ditolak') {
      const reason = String(catatan || '').replace(/^Ditolak:\s*/i, '').trim();
      if (reason.length < 5 || reason.length > 500) {
        return { success: false, message: 'Alasan penolakan wajib diisi antara 5 sampai 500 karakter.' };
      }
      actionNote = `Ditolak: ${reason}`;
    }
    if (status === 'Dibatalkan') {
      const reason = String(catatan || '').replace(/^Dibatalkan:\s*/i, '').trim();
      if (reason.length < 5 || reason.length > 500) {
        return { success: false, message: 'Alasan pembatalan wajib diisi antara 5 sampai 500 karakter.' };
      }
      actionNote = `Dibatalkan: ${reason}`;
    }

    const requestedItems = target.items?.length
      ? target.items
      : [{
          itemId: target.itemId,
          namaBarang: target.namaBarang,
          jumlahDiminta: target.jumlahDiminta,
          jumlahDisetujui: target.jumlahDisetujui,
          satuan: target.satuan
        }];
    const approvedQty = status === 'Menunggu Konfirmasi'
      ? target.jumlahDisetujui
        ?? (requestedItems.length === 1
          ? requestedItems[0].jumlahDisetujui ?? requestedItems[0].jumlahDiminta
          : undefined)
      : jumlahDisetujui !== undefined
        ? jumlahDisetujui
        : (status === 'Disetujui' || status === 'Diproses'
          ? target.jumlahDisetujui || target.jumlahDiminta
          : target.jumlahDisetujui);
    const approvedItems = requestedItems.map(item => {
      const approvedItem = itemsDisetujui?.find(candidate => candidate.itemId === item.itemId);
      return {
        ...item,
        jumlahDisetujui: status === 'Menunggu Konfirmasi'
          ? item.jumlahDisetujui
            ?? (requestedItems.length === 1 ? target.jumlahDisetujui : undefined)
            ?? item.jumlahDiminta
          : approvedItem?.jumlahDisetujui
            ?? item.jumlahDisetujui
            ?? (requestedItems.length === 1 ? approvedQty : item.jumlahDiminta)
      };
    });
    const shouldSetApprovedItems = status === 'Disetujui' || status === 'Diproses' ||
      status === 'Selesai';
    if (shouldSetApprovedItems) {
      const invalidApprovedItem = approvedItems.find(item =>
        !Number.isSafeInteger(item.jumlahDisetujui)
        || (item.jumlahDisetujui || 0) <= 0
        || (item.jumlahDisetujui || 0) > item.jumlahDiminta
      );
      if (invalidApprovedItem) {
        return { success: false, message: `Jumlah yang disetujui untuk ${invalidApprovedItem.namaBarang} harus lebih dari nol dan tidak melebihi jumlah permohonan.` };
      }
    }
    let handoverItems: Array<{ itemId: string; jumlah: number }> = [];
    if (status === 'Menunggu Konfirmasi') {
      const handoverResult = normalizeRequestHandoverItems(
        { ...target, items: approvedItems },
        itemsDisetujui || []
      );
      if (handoverResult.error || !handoverResult.items) {
        return { success: false, message: handoverResult.error || 'Rincian barang yang akan diserahkan tidak valid.' };
      }
      handoverItems = handoverResult.items;
    }

    const nextPenerimaan = status === 'Menunggu Konfirmasi'
      ? {
          status: 'Menunggu Konfirmasi' as const,
          diserahkanOleh: currentUser?.name || '',
          diserahkanPada: new Date().toISOString(),
          items: handoverItems,
          mutasiIds: [],
          diterimaItems: target.penerimaan?.diterimaItems || []
        }
      : target.penerimaan;
    const effectiveNote = actionNote?.trim() ? actionNote : undefined;
    const nextRequest: InventoryRequest = {
      ...target,
      status,
      catatan: effectiveNote !== undefined ? effectiveNote : target.catatan,
      jumlahDisetujui: approvedQty,
      items: shouldSetApprovedItems || status === 'Menunggu Konfirmasi' ? approvedItems : target.items,
      penerimaan: nextPenerimaan
    };
    const requestChange: RequestStateChange = { request: nextRequest, auditLogs: [], notifications: [] };
    const persisted = new Promise<InventoryRequest>((resolve, reject) => {
      requestPersistenceWaitersRef.current.set(id, { resolve, reject, expectedStatus: status });
    });

    if (target.status !== status && status !== 'Dibatalkan' &&
        queuedRequestWhatsAppStatusRef.current.get(id) !== status) {
      queuedRequestWhatsAppStatusRef.current.set(id, status);
      queueRequestWhatsAppEvent(nextRequest, 'status_changed', effectiveNote);
    }
    if (status === 'Dibatalkan') {
      const reason = String(actionNote || '').replace(/^Dibatalkan:\s*/i, '').trim();
      logAudit(
        'Pembatalan Permohonan Barang',
        'PERSEDIAAN',
        `Permohonan ${target.id} dibatalkan. Alasan: ${reason}`,
        requestChange
      );
    }
    logAudit('Pembaruan Status Permohonan', 'PERSEDIAAN', `Permohonan ${target.nomorPermintaan} (${requestedItems.map(item => item.namaBarang).join(', ')}) diubah statusnya menjadi ${status}.`, requestChange);
    pushNotification(
      'TRANSAKSI',
      status === 'Dibatalkan' ? 'Permohonan Dibatalkan' : `📋 Status Permohonan: ${status}`,
      `Permohonan ${target.nomorPermintaan} (${requestedItems.map(item => item.namaBarang).join(', ')}) kini berstatus ${status}.`,
      'requests',
      requestChange
    );
    void persistSharedState(requestChange);
    try {
      const savedRequest = await persisted;
      if (savedRequest.status !== status) {
        throw new StateSyncError('Server menyimpan status permohonan yang berbeda. Data terbaru telah dimuat.', true);
      }
      return { success: true, message: `Status permohonan berhasil diperbarui menjadi ${status}.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Perubahan status permohonan tidak dapat disimpan.';
      if (error instanceof StateSyncError && error.definitelyNotSaved) {
        pendingRequestWhatsAppEventsRef.current = pendingRequestWhatsAppEventsRef.current.filter(event => event.requestId !== id);
        queuedRequestWhatsAppStatusRef.current.delete(id);
        if (error.status === 400) syncBlockedRef.current = false;
        return { success: false, message };
      }
      const reloaded = await reloadServerData();
      if (!reloaded) {
        return {
          success: false,
          message: `${message} Status di server belum dapat diperiksa; jangan ulangi sebelum data berhasil dimuat ulang.`
        };
      }
      const latestRequests = lastSyncedStateRef.current?.requests;
      const savedRequest = Array.isArray(latestRequests)
        ? (latestRequests as InventoryRequest[]).find(request => request.id === id)
        : undefined;
      if (savedRequest?.status === status) {
        return { success: true, message: `Status permohonan ${status} telah tercatat di server.` };
      }
      return { success: false, message };
    }
  }, [requests, currentUser, hasPermission, isPimpinanUser, requestPersistenceWaitersRef,
    queuedRequestWhatsAppStatusRef, queueRequestWhatsAppEvent, logAudit, pushNotification,
    persistSharedState, pendingRequestWhatsAppEventsRef, syncBlockedRef, reloadServerData, lastSyncedStateRef]);

  const syncAfterRequestAction = useCallback(async (revision: number) => {
    const latestResponse = await fetchWithTimeout('/api/state');
    const latest = await readApiResponse<{ state: Record<string, unknown>; revision: number }>(latestResponse, '/api/state');
    if (!latest.state || !Number.isInteger(latest.revision) || latest.revision < revision) {
      throw new Error('Perubahan berhasil dicatat, tetapi data terbaru tidak dapat dimuat. Muat ulang halaman.');
    }
    const rebased = mergeStateAfterConflict(lastSyncedStateRef.current, latestSharedStateRef.current, latest.state);
    if (rebased.conflicts.length > 0) {
      syncBlockedRef.current = true;
      throw new Error(`Tindakan tersimpan, tetapi ada konflik perubahan lokal (${rebased.conflicts.slice(0, 3).join(', ')}). Periksa data server.`);
    }
    revisionRef.current = latest.revision;
    lastSyncedStateRef.current = cloneSharedState(latest.state);
    applySharedState(rebased.mergedState);
    setSyncError(null);
  }, [lastSyncedStateRef, latestSharedStateRef, syncBlockedRef, revisionRef, applySharedState, setSyncError]);

  const submitRequestAction = useCallback(async (
    path: string,
    body: Record<string, unknown>,
    fallbackMessage: string,
    alreadyApplied?: (state: Record<string, unknown>) => boolean
  ) => {
    pendingServerActionsRef.current += 1;
    try {
      await persistSharedState();
      if (syncBlockedRef.current || !sameSharedState(latestSharedStateRef.current, lastSyncedStateRef.current)) {
        pageRefreshRequestedRef.current = false;
        return { success: false, message: 'Perubahan lokal belum tersimpan. Selesaikan sinkronisasi sebelum memproses permohonan.' };
      }
      const action = syncQueueRef.current.then(async () => {
        const response = await fetchWithTimeout(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await readApiResponse<{ success: boolean; revision: number; alreadyConfirmed?: boolean }>(response, path);
        if (result.success !== true || !Number.isInteger(result.revision)) {
          throw new Error(fallbackMessage);
        }
        await syncAfterRequestAction(result.revision);
        return result;
      });
      // The caller reports action failures; subsequent queued saves must still be able to run.
      syncQueueRef.current = action.then(() => undefined, () => undefined);
      const result = await action;
      return { success: true, message: result.alreadyConfirmed
        ? 'Penerimaan ini sudah pernah dikonfirmasi; stok tidak dikurangi kembali.'
        : fallbackMessage };
    } catch (error) {
      const message = apiFailureMessage(error);
      if (syncBlockedRef.current) {
        pageRefreshRequestedRef.current = false;
        setSyncError(message);
        return { success: false, message };
      }
      const reloaded = await reloadServerData();
      if (reloaded && alreadyApplied?.(lastSyncedStateRef.current || {})) {
        return { success: true, message: 'Server telah mencatat tindakan ini; data terbaru sudah dimuat tanpa mengulang mutasi stok.' };
      }
      pageRefreshRequestedRef.current = false;
      return {
        success: false,
        message: reloaded
          ? message
          : `${message} Status di server belum dapat diperiksa; jangan ulangi sebelum data berhasil dimuat ulang.`
      };
    } finally {
      pendingServerActionsRef.current -= 1;
    }
  }, [pendingServerActionsRef, persistSharedState, syncBlockedRef, latestSharedStateRef, lastSyncedStateRef,
    pageRefreshRequestedRef, syncQueueRef, syncAfterRequestAction, reloadServerData, setSyncError]);

  const confirmInventoryRequestReceipt = useCallback((id: string) => submitRequestAction(
    `/api/requests/${encodeURIComponent(id)}/confirm-receipt`,
    {},
    'Penerimaan berhasil dikonfirmasi dan mutasi stok telah dicatat.',
    state => {
      const savedRequests = state.requests;
      const savedRequest = Array.isArray(savedRequests)
        ? (savedRequests as InventoryRequest[]).find(request => request.id === id)
        : undefined;
      return Boolean(savedRequest && ['Diproses', 'Diterima'].includes(savedRequest.status) &&
        savedRequest.penerimaan?.status === 'Diterima');
    }
  ), [submitRequestAction]);

  const reportInventoryReceiptDiscrepancy = useCallback((id: string, reason: string) => submitRequestAction(
    `/api/requests/${encodeURIComponent(id)}/receipt-discrepancy`,
    { reason },
    'Laporan selisih berhasil dikirim kepada petugas.'
  ), [submitRequestAction]);

  const reopenInventoryRequestHandover = useCallback((id: string) => submitRequestAction(
    `/api/requests/${encodeURIComponent(id)}/reopen-handover`,
    {},
    'Permohonan dikembalikan ke tahap penyerahan untuk ditindaklanjuti.',
    state => {
      const savedRequests = state.requests;
      const savedRequest = Array.isArray(savedRequests)
        ? (savedRequests as InventoryRequest[]).find(request => request.id === id)
        : undefined;
      return Boolean(savedRequest?.status === 'Diproses' && !savedRequest.penerimaan?.catatanSelisih);
    }
  ), [submitRequestAction]);

  const cancelInventoryRequest = useCallback((id: string, reason: string) =>
    updateRequestStatus(id, 'Dibatalkan', reason), [updateRequestStatus]);

  const deleteInventoryRequests = useCallback((ids: string[]) => submitRequestAction(
    '/api/requests/bulk-delete',
    { ids },
    'Permohonan terpilih berhasil dihapus permanen.',
    state => Array.isArray(state.requests) && ids.length > 0 &&
      ids.every(id => !(state.requests as InventoryRequest[]).some(request => request.id === id))
  ), [submitRequestAction]);

  return {
    addInventoryRequest, updateRequestStatus,
    confirmInventoryRequestReceipt, reportInventoryReceiptDiscrepancy,
    reopenInventoryRequestHandover, cancelInventoryRequest, deleteInventoryRequests
  };
};
