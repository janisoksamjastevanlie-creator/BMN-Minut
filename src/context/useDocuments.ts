import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { AuditLog, BmnAsset, DocumentItem, InventoryItem } from '../types';
import type { LogAudit, PushNotification } from './types';
import { cloneSharedState } from './syncHelpers';

interface UseDocumentsParams {
  documents: DocumentItem[];
  setDocuments: Dispatch<SetStateAction<DocumentItem[]>>;
  setAuditLogs: Dispatch<SetStateAction<AuditLog[]>>;
  setAssets: Dispatch<SetStateAction<BmnAsset[]>>;
  setInventoryItems: Dispatch<SetStateAction<InventoryItem[]>>;
  logAudit: LogAudit;
  pushNotification: PushNotification;
  requestPageRefresh: () => void;
  revisionRef: RefObject<number>;
  lastSyncedStateRef: RefObject<Record<string, unknown> | null>;
  /**
   * Snapshot state bersama terbaru (latestSharedStateRef di AppContext).
   * Handler dokumen memakainya sebagai baseline ketika belum ada salinan sinkron server.
   */
  sharedStateRef: RefObject<Record<string, unknown>>;
}

// Arsip dokumen digital: CRUD biasa + pendaftaran hasil upload backend (register*)
// yang juga menyetel baseline sinkronisasi, serta restore backup sistem.
export const useDocuments = ({
  documents, setDocuments, setAuditLogs, setAssets, setInventoryItems,
  logAudit, pushNotification, requestPageRefresh,
  revisionRef, lastSyncedStateRef, sharedStateRef
}: UseDocumentsParams) => {
  const addDocument = useCallback((docData: Omit<DocumentItem, 'id'>) => {
    const newDoc: DocumentItem = {
      ...docData,
      id: `doc-${Date.now()}`
    };
    setDocuments(prev => [newDoc, ...prev]);
    logAudit('Unggah Dokumen Digital', 'DOKUMEN', `Pengunggahan arsip digital: ${newDoc.judul} (${newDoc.nomorDokumen})`);
    pushNotification('TRANSAKSI', '📄 Dokumen Digital Diunggah', `${newDoc.judul} berhasil disimpan ke arsip digital.`, 'documents');
  }, [setDocuments, logAudit, pushNotification]);

  const updateDocument = useCallback((id: string, updates: Partial<DocumentItem>) => {
    const target = documents.find(document => document.id === id);
    if (!target) return;
    const safeUpdates = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.storageBackend;
    delete safeUpdates.storageKey;
    delete safeUpdates.storageSize;
    delete safeUpdates.sha256;
    delete safeUpdates.idempotencyKey;
    delete safeUpdates.fileName;
    delete safeUpdates.fileType;
    delete safeUpdates.uploadedAt;
    const updated = { ...target, ...safeUpdates };
    setDocuments(prev => prev.map(document => document.id === id ? updated : document));
    logAudit('Perubahan Keterangan Dokumen Digital', 'DOKUMEN', `Keterangan arsip ${target.judul} (${target.nomorDokumen}) diperbarui.`);
  }, [documents, setDocuments, logAudit]);

  const deleteDocument = useCallback((id: string) => {
    const target = documents.find(d => d.id === id);
    if (!target) return;
    setDocuments(prev => prev.filter(d => d.id !== id));
    logAudit('Penghapusan Dokumen Digital', 'DOKUMEN', `Arsip ${target.judul} (${target.nomorDokumen}) dihapus.`);
  }, [documents, setDocuments, logAudit]);

  const registerUploadedDocument = useCallback((document: DocumentItem, revision: number, auditLog?: AuditLog) => {
    if (!Number.isInteger(revision)) throw new Error('Revisi penyimpanan dokumen tidak valid.');
    revisionRef.current = revision;
    const baseline = lastSyncedStateRef.current || cloneSharedState(sharedStateRef.current);
    const baselineDocuments = Array.isArray(baseline.documents) ? baseline.documents as DocumentItem[] : [];
    const baselineAuditLogs = Array.isArray(baseline.auditLogs) ? baseline.auditLogs as AuditLog[] : [];
    const nextDocuments = [document, ...baselineDocuments.filter(item => item.id !== document.id)]
      .sort((left, right) => right.tanggal.localeCompare(left.tanggal) || left.id.localeCompare(right.id));
    lastSyncedStateRef.current = cloneSharedState({
      ...baseline,
      documents: nextDocuments,
      auditLogs: auditLog
        ? [auditLog, ...baselineAuditLogs.filter(item => item.id !== auditLog.id)]
        : baselineAuditLogs
    });
    setDocuments(prev => [document, ...prev.filter(item => item.id !== document.id)]
      .sort((left, right) => right.tanggal.localeCompare(left.tanggal) || left.id.localeCompare(right.id)));
    if (auditLog) setAuditLogs(prev => [auditLog, ...prev.filter(item => item.id !== auditLog.id)]);
    pushNotification(
      'TRANSAKSI',
      '📄 Dokumen Digital Diunggah',
      `${document.judul} berhasil disimpan ke penyimpanan backend dan arsip aplikasi.`,
      'documents'
    );
  }, [revisionRef, lastSyncedStateRef, sharedStateRef, setDocuments, setAuditLogs, pushNotification]);

  const registerUpdatedDocument = useCallback((document: DocumentItem, revision: number, auditLog?: AuditLog) => {
    if (!Number.isInteger(revision)) throw new Error('Revisi perubahan dokumen tidak valid.');
    revisionRef.current = revision;
    const baseline = lastSyncedStateRef.current || cloneSharedState(sharedStateRef.current);
    const baselineDocuments = Array.isArray(baseline.documents) ? baseline.documents as DocumentItem[] : [];
    const baselineAuditLogs = Array.isArray(baseline.auditLogs) ? baseline.auditLogs as AuditLog[] : [];
    const nextDocuments = baselineDocuments.map(item => item.id === document.id ? document : item)
      .sort((left, right) => right.tanggal.localeCompare(left.tanggal) || left.id.localeCompare(right.id));
    lastSyncedStateRef.current = cloneSharedState({
      ...baseline,
      documents: nextDocuments,
      auditLogs: auditLog
        ? [auditLog, ...baselineAuditLogs.filter(item => item.id !== auditLog.id)]
        : baselineAuditLogs
    });
    setDocuments(prev => prev.map(item => item.id === document.id ? document : item)
      .sort((left, right) => right.tanggal.localeCompare(left.tanggal) || left.id.localeCompare(right.id)));
    if (auditLog) setAuditLogs(prev => [auditLog, ...prev.filter(item => item.id !== auditLog.id)]);
    pushNotification(
      'TRANSAKSI',
      'Nota Belanja Diperbarui',
      `${document.judul} berhasil diperbarui pada arsip dokumen.`,
      'documents'
    );
  }, [revisionRef, lastSyncedStateRef, sharedStateRef, setDocuments, setAuditLogs, pushNotification]);

  const registerDeletedDocument = useCallback((id: string, revision: number, auditLog: AuditLog) => {
    if (!Number.isInteger(revision)) throw new Error('Revisi penghapusan dokumen tidak valid.');
    revisionRef.current = revision;
    const baseline = lastSyncedStateRef.current || cloneSharedState(sharedStateRef.current);
    const baselineDocuments = Array.isArray(baseline.documents) ? baseline.documents as DocumentItem[] : [];
    const baselineAuditLogs = Array.isArray(baseline.auditLogs) ? baseline.auditLogs as AuditLog[] : [];
    lastSyncedStateRef.current = cloneSharedState({
      ...baseline,
      documents: baselineDocuments.filter(item => item.id !== id),
      auditLogs: [auditLog, ...baselineAuditLogs.filter(item => item.id !== auditLog.id)]
    });
    setDocuments(prev => prev.filter(item => item.id !== id));
    setAuditLogs(prev => [auditLog, ...prev.filter(item => item.id !== auditLog.id)]);
    requestPageRefresh();
  }, [revisionRef, lastSyncedStateRef, sharedStateRef, setDocuments, setAuditLogs, requestPageRefresh]);

  const importSystemBackup = useCallback((data: { assets?: BmnAsset[]; inventoryItems?: InventoryItem[]; documents?: DocumentItem[] }) => {
    if (data.assets && Array.isArray(data.assets)) {
      setAssets(data.assets);
    }
    if (data.inventoryItems && Array.isArray(data.inventoryItems)) {
      setInventoryItems(data.inventoryItems);
    }
    if (data.documents && Array.isArray(data.documents)) {
      setDocuments(data.documents);
    }
    logAudit('Restore / Import Backup Sistem', 'SISTEM', `Pemulihan data backup berhasil diimpor.`);
    pushNotification('TRANSAKSI', '🔄 Restore Backup Selesai', `Data database berhasil diperbarui dari file backup.`, 'dashboard');
  }, [setAssets, setInventoryItems, setDocuments, logAudit, pushNotification]);

  return {
    documents, setDocuments,
    addDocument, updateDocument, deleteDocument,
    registerUploadedDocument, registerUpdatedDocument, registerDeletedDocument,
    importSystemBackup
  };
};
