import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { DocumentItem, ReceiptItem } from '../types';
import { UploadDocumentModal } from '../components/documents/UploadDocumentModal';
import { UploadNotaModal } from '../components/documents/UploadNotaModal';
import { ListPager, usePagedList } from '../components/common/ListPager';
import { DocumentFileError, fetchDocumentFile } from '../utils/documentFiles';
import {
  FileText,
  Search,
  Upload,
  Receipt,
  Download,
  Eye,
  CheckCircle2,
  Clock,
  Filter,
  X,
  FileCheck,
  Calendar,
  User,
  Trash2,
  ExternalLink,
  Store,
  DollarSign,
  Package,
  LayoutGrid,
  List
} from 'lucide-react';

export const DocumentsView: React.FC = () => {
  const { documents, deleteDocument, registerDeletedDocument, updateDocument, hasPermission } = useApp();
  const canManageDocuments =
    hasPermission('manageAssets') || hasPermission('manageInventory') || hasPermission('systemSettings');
  const canViewFinancials = hasPermission('manageInventory');

  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [minimumReceiptTotal, setMinimumReceiptTotal] = useState('');
  const [maximumReceiptTotal, setMaximumReceiptTotal] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [documentView, setDocumentView] = useState<'cards' | 'table'>('cards');
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploadNotaOpen, setIsUploadNotaOpen] = useState(false);
  const [editingNota, setEditingNota] = useState<DocumentItem | null>(null);
  const [previewFile, setPreviewFile] = useState<{ documentId: string; url?: string; error?: string; code?: string } | null>(null);
  const [previewReload, setPreviewReload] = useState(0);
  const [isRestoringFile, setIsRestoringFile] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const hasPreviewAttachment = Boolean(previewDoc &&
    (previewDoc.jenis !== 'Nota' || canViewFinancials) &&
    (previewDoc.storageBackend === 'hostinger' || previewDoc.fileDataUrl));
  const currentPreviewFile = previewFile?.documentId === previewDoc?.id ? previewFile : null;
  const canEditNota = (document: DocumentItem) =>
    canViewFinancials && (document.status === 'Draft' || hasPermission('systemSettings'));

  useEffect(() => {
    setRestoreError('');
    if (!previewDoc || !hasPreviewAttachment) {
      setPreviewFile(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setPreviewFile(null);
    fetchDocumentFile(previewDoc, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewFile({ documentId: previewDoc.id, url: objectUrl });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setPreviewFile({
        documentId: previewDoc.id,
        error: error instanceof Error ? error.message : 'Gagal membuka lampiran dokumen.',
        code: error instanceof DocumentFileError ? error.code : undefined
      });
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewDoc, hasPreviewAttachment, previewReload]);

  const handleRestoreFile = async (doc: DocumentItem, file: File) => {
    setIsRestoringFile(true);
    setRestoreError('');
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/file`, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name)
        },
        body: file
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || 'Gagal memulihkan lampiran. Silakan coba lagi.');
      }
      setPreviewReload(value => value + 1);
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'Gagal memulihkan lampiran.');
    } finally {
      setIsRestoringFile(false);
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const parseReceiptAmount = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits ? Number(digits) : undefined;
  };

  const filteredDocs = useMemo(() => {
    return documents.filter(d => {
      const matchType = filterType === 'all' || d.jenis === filterType;
      if (!matchType) return false;
      if (canViewFinancials && d.jenis === 'Nota') {
        const minimum = parseReceiptAmount(minimumReceiptTotal);
        const maximum = parseReceiptAmount(maximumReceiptTotal);
        const total = Number(d.totalNilaiNota || 0);
        if (minimum !== undefined && total < minimum) return false;
        if (maximum !== undefined && total > maximum) return false;
      }
      if (!normalizedSearch) return true;

      const matchDocMeta =
        d.judul.toLowerCase().includes(normalizedSearch) ||
        d.nomorDokumen.toLowerCase().includes(normalizedSearch) ||
        d.uploader.toLowerCase().includes(normalizedSearch) ||
        (d.namaToko && d.namaToko.toLowerCase().includes(normalizedSearch)) ||
        (d.kategoriNota && d.kategoriNota.toLowerCase().includes(normalizedSearch)) ||
        d.tanggal.toLowerCase().includes(normalizedSearch) ||
        (d.description && d.description.toLowerCase().includes(normalizedSearch)) ||
        (d.fileName && d.fileName.toLowerCase().includes(normalizedSearch));

      if (matchDocMeta) return true;

      if (d.items && d.items.length > 0) {
        return d.items.some(item =>
          item.namaBarang.toLowerCase().includes(normalizedSearch) ||
          (item.kodeBarang && item.kodeBarang.toLowerCase().includes(normalizedSearch)) ||
          item.satuan.toLowerCase().includes(normalizedSearch) ||
          item.kategori.toLowerCase().includes(normalizedSearch)
        );
      }

      return false;
    });
  }, [documents, filterType, normalizedSearch, minimumReceiptTotal, maximumReceiptTotal, canViewFinancials]);

  const matchedReceiptItems = useMemo(() => {
    if (!normalizedSearch) return [];
    const results: Array<{
      key: string;
      doc: DocumentItem;
      item: ReceiptItem;
    }> = [];

    const receiptDocs = documents.filter(d => Array.isArray(d.items) && d.items.length > 0);
    for (const doc of receiptDocs) {
      const docMatches =
        doc.judul.toLowerCase().includes(normalizedSearch) ||
        doc.nomorDokumen.toLowerCase().includes(normalizedSearch) ||
        (doc.namaToko && doc.namaToko.toLowerCase().includes(normalizedSearch)) ||
        (doc.kategoriNota && doc.kategoriNota.toLowerCase().includes(normalizedSearch)) ||
        doc.tanggal.toLowerCase().includes(normalizedSearch) ||
        (doc.description && doc.description.toLowerCase().includes(normalizedSearch));

      doc.items!.forEach((item, idx) => {
        const itemMatches =
          item.namaBarang.toLowerCase().includes(normalizedSearch) ||
          (item.kodeBarang && item.kodeBarang.toLowerCase().includes(normalizedSearch)) ||
          item.satuan.toLowerCase().includes(normalizedSearch) ||
          item.kategori.toLowerCase().includes(normalizedSearch);

        if (itemMatches || docMatches) {
          results.push({
            key: `${doc.id}-item-${idx}`,
            doc,
            item
          });
        }
      });
    }
    return results;
  }, [documents, normalizedSearch]);

  const pager = usePagedList(filteredDocs);

  const areAllDocumentsSelected =
    filteredDocs.length > 0 && filteredDocs.every(doc => selectedDocumentIds.has(doc.id));

  const toggleDocumentSelection = (id: string) => {
    setSelectedDocumentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllDocumentSelection = () => {
    setSelectedDocumentIds(areAllDocumentsSelected ? new Set() : new Set(filteredDocs.map(doc => doc.id)));
  };

  const deleteSelectedDocument = async (doc: DocumentItem) => {
    if (doc.storageBackend !== 'hostinger') {
      deleteDocument(doc.id);
      return;
    }
    const response = await fetch(`/api/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Gagal menghapus dokumen.');
    if (!Number.isInteger(result.revision) || !result.auditLog) {
      throw new Error('Respons server untuk penghapusan dokumen tidak valid.');
    }
    registerDeletedDocument(doc.id, result.revision, result.auditLog);
  };

  const handleDeleteDocument = async (doc: DocumentItem) => {
    if (!window.confirm(`Hapus berkas "${doc.judul}" dari arsip digital dan penyimpanan backend?`)) return;
    try {
      await deleteSelectedDocument(doc);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Gagal menghapus dokumen.');
    }
  };

  const handleBulkDeleteDocuments = async () => {
    const selectedDocuments = documents.filter(doc => selectedDocumentIds.has(doc.id));
    if (selectedDocuments.length === 0) {
      window.alert('Pilih data dokumen yang ingin dihapus terlebih dahulu.');
      return;
    }
    if (!window.confirm('Apakah Anda yakin ingin menghapus data yang dipilih?')) return;

    let deletedCount = 0;
    const errors: string[] = [];
    for (const doc of selectedDocuments) {
      try {
        await deleteSelectedDocument(doc);
        deletedCount += 1;
      } catch (error) {
        errors.push(`${doc.judul}: ${error instanceof Error ? error.message : 'terjadi kesalahan saat menghapus.'}`);
      }
    }
    setSelectedDocumentIds(new Set());

    if (errors.length > 0) {
      window.alert(`${deletedCount} dokumen berhasil dihapus. ${errors.length} dokumen gagal dihapus:\n${errors.join('\n')}`);
    } else {
      window.alert(`${deletedCount} dokumen berhasil dihapus.`);
    }
  };

  const handleDownloadDoc = async (doc: DocumentItem) => {
    if (doc.jenis === 'Nota' && !canViewFinancials) return;
    if (doc.storageBackend === 'hostinger' || doc.fileDataUrl) {
      try {
        const blob = await fetchDocumentFile(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.fileName || `${doc.nomorDokumen.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Gagal mengunduh lampiran dokumen.');
      }
    } else {
      // Generate official text document
      const docContent = `==========================================================\nBADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA\nARSIP DOKUMEN ELEKTRONIK SIMAN-BMN TA 2026\n==========================================================\n\nNomor Dokumen : ${doc.nomorDokumen}\nJudul Berkas  : ${doc.judul}\nJenis         : ${doc.jenis}\nTanggal       : ${doc.tanggal}\nStatus        : ${doc.status}\nPengunggah    : ${doc.uploader}\n\nTelah diregistrasi sah dan terarsip dalam database BPS Minahasa Utara.`;
      const blob = new Blob([docContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${doc.nomorDokumen.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Manajemen Dokumen & Berita Acara</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold font-mono">
              {documents.length} Arsip Digital
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Repositori digital Berita Acara Rekonsiliasi, BAST Pengadaan, Usulan KPKNL, dan Berita Acara Opname
          </p>
        </div>

        {canManageDocuments && (
          <div className="flex w-full flex-col sm:w-auto sm:flex-row items-stretch sm:items-center gap-2">
            {canViewFinancials && (
              <button
                onClick={() => setIsUploadNotaOpen(true)}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-amber-600/20 whitespace-nowrap"
              >
                <Receipt className="w-4 h-4" />
                <span>Upload Nota Belanja</span>
              </button>
            )}
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-purple-600/20 whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>Import Document</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col gap-4">
        <div className="flex items-center gap-1.5 flex-wrap w-full">
          {[
            'all',
            'Nota',
            'Berita Acara',
            'Dokumen Perolehan',
            'Dokumen Pemindahan',
            'Dokumen Pemeliharaan',
            'Dokumen Penghapusan',
            'Dokumen Stock Opname',
            'Dokumen Lainnya'
          ].map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                filterType === t
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {t === 'all' ? 'Semua Berkas' : t}
            </button>
          ))}
        </div>

        <div className={`grid grid-cols-1 items-end gap-3 ${canViewFinancials && (filterType === 'all' || filterType === 'Nota') ? 'lg:grid-cols-[minmax(0,1fr)_minmax(18rem,auto)]' : ''}`}>
          <div className="relative w-full min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama barang, kode barang, satuan, toko, atau nomor nota..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                title="Hapus kata pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {canViewFinancials && (filterType === 'all' || filterType === 'Nota') && (
            <div className="grid grid-cols-2 gap-2 w-full lg:w-auto">
              <label className="min-w-0 text-[10px] text-slate-400">
                Total minimum
                <input
                  type="text"
                  inputMode="numeric"
                  value={minimumReceiptTotal}
                  onChange={event => setMinimumReceiptTotal(event.target.value)}
                  placeholder="Rp"
                  aria-label="Total nota minimum"
                  className="mt-1 w-full lg:w-36 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </label>
              <label className="min-w-0 text-[10px] text-slate-400">
                Total maksimum
                <input
                  type="text"
                  inputMode="numeric"
                  value={maximumReceiptTotal}
                  onChange={event => setMaximumReceiptTotal(event.target.value)}
                  placeholder="Rp"
                  aria-label="Total nota maksimum"
                  className="mt-1 w-full lg:w-36 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Hasil Pencarian Barang Lintas Seluruh Nota */}
      {normalizedSearch && matchedReceiptItems.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white">
                Hasil Pencarian Rincian Barang di Seluruh Nota ({matchedReceiptItems.length} item ditemukan)
              </h3>
            </div>
            <button
              onClick={() => setSearch('')}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 self-start sm:self-auto"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hapus Kata Pencarian</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="py-2 px-3 font-medium">Nama Barang</th>
                  <th className="py-2 px-3 font-medium">Toko / Penyedia</th>
                  <th className="py-2 px-3 font-medium">No. Nota</th>
                  <th className="py-2 px-3 font-medium">Tanggal</th>
                  <th className="py-2 px-3 font-medium text-right">Jumlah</th>
                  <th className="py-2 px-3 font-medium">Satuan</th>
                  {canViewFinancials && (
                    <>
                      <th className="py-2 px-3 font-medium text-right">Harga Satuan</th>
                      <th className="py-2 px-3 font-medium text-right">Subtotal</th>
                      <th className="py-2 px-3 font-medium text-right">Total Nota</th>
                    </>
                  )}
                  <th className="py-2 px-3 font-medium text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {matchedReceiptItems.map(({ key, doc, item }) => (
                  <tr key={key} className="text-slate-200 hover:bg-slate-800/50 transition-colors">
                    <td className="py-2 px-3 font-semibold text-white">
                      <div className="flex items-center gap-1.5">
                        <span>{item.namaBarang}</span>
                        {item.kategori && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {item.kategori}
                          </span>
                        )}
                      </div>
                      {item.kodeBarang && (
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.kodeBarang}</div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-emerald-400 font-medium">
                      {doc.namaToko || '-'}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-300">
                      {doc.nomorDokumen}
                    </td>
                    <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                      {doc.tanggal}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-white">
                      {item.jumlah}
                    </td>
                    <td className="py-2 px-3 text-slate-400">
                      {item.satuan}
                    </td>
                    {canViewFinancials && (
                      <>
                        <td className="py-2 px-3 text-right text-slate-300 whitespace-nowrap">
                          Rp {Number(item.hargaSatuan || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                          Rp {Number(item.subtotal !== undefined ? item.subtotal : item.totalHarga || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-amber-300 whitespace-nowrap">
                          Rp {Number(doc.totalNilaiNota || 0).toLocaleString('id-ID')}
                        </td>
                      </>
                    )}
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-semibold transition-colors inline-flex items-center gap-1 border border-blue-500/30"
                        title="Buka rincian lengkap nota dan bukti lampiran"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Lihat Nota</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Document Grid */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={areAllDocumentsSelected}
            onChange={toggleAllDocumentSelection}
            className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-purple-500 focus:ring-purple-500"
            aria-label="Pilih semua dokumen yang ditampilkan"
          />
          Pilih Semua
        </label>
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 p-0.5" role="group" aria-label="Tampilan daftar dokumen">
            <button
              type="button"
              onClick={() => setDocumentView('cards')}
              aria-pressed={documentView === 'cards'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                documentView === 'cards' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Kartu
            </button>
            <button
              type="button"
              onClick={() => setDocumentView('table')}
              aria-pressed={documentView === 'table'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                documentView === 'table' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Tabel
            </button>
          </div>
          <span className="text-xs text-slate-400">{selectedDocumentIds.size} dokumen dipilih</span>
          {canManageDocuments && (
            <button
              onClick={() => void handleBulkDeleteDocuments()}
              disabled={selectedDocumentIds.size === 0}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Hapus Terpilih
            </button>
          )}
        </div>
      </div>

      {filteredDocs.length === 0 ? (
        <div className="p-10 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          {normalizedSearch ? (
            <>
              <Search className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-200">
                Barang atau nota yang Anda cari tidak ditemukan.
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Tidak ada barang, toko, atau nota yang cocok dengan kata pencarian "{search}".
              </p>
              <button
                onClick={() => setSearch('')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Hapus Kata Pencarian & Tampilkan Seluruh Nota</span>
              </button>
            </>
          ) : filterType === 'Nota' ? (
            <>
              <Receipt className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-200">
                Belum ada nota atau kuitansi yang diunggah
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Unggah berkas fisik nota belanja ATK / ARK atau ambil foto kuitansi secara langsung.
              </p>
              {canViewFinancials && (
                <button
                  onClick={() => setIsUploadNotaOpen(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-lg shadow-amber-600/20"
                >
                  <Receipt className="w-4 h-4" />
                  Upload Nota Belanja
                </button>
              )}
            </>
          ) : (
            <>
              <FileText className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-200">
                Belum ada dokumen yang diunggah
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Belum ada arsip digital untuk kategori "{filterType === 'all' ? 'Semua Berkas' : filterType}".
              </p>
              {canManageDocuments && (
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-lg shadow-purple-600/20"
                >
                  <Upload className="w-4 h-4" />
                  Import Document
                </button>
              )}
            </>
          )}
        </div>
      ) : documentView === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pager.pageItems.map(doc => (
            <div
              key={doc.id}
              className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedDocumentIds.has(doc.id)}
                      onChange={() => toggleDocumentSelection(doc.id)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-purple-500 focus:ring-purple-500"
                      aria-label={`Pilih dokumen ${doc.judul}`}
                    />
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold">
                      {doc.jenis}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      doc.status === 'Sah' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>
                    {doc.status}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-white mt-2 leading-snug line-clamp-2">
                  {doc.judul}
                </h4>

                <div className="text-[11px] font-mono text-slate-400 mt-1">
                  {doc.nomorDokumen}
                </div>

                {doc.namaToko && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium truncate">
                    <Store className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{doc.namaToko}</span>
                  </div>
                )}

                {canViewFinancials && doc.totalNilaiNota != null && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-300 font-bold">
                    <DollarSign className="w-3.5 h-3.5 shrink-0" />
                    <span>Rp {Number(doc.totalNilaiNota).toLocaleString('id-ID')}</span>
                    {doc.items && doc.items.length > 0 && (
                      <span className="text-[10px] font-normal text-slate-400">({doc.items.length} item)</span>
                    )}
                  </div>
                )}

                {doc.fileName && (doc.jenis !== 'Nota' || canViewFinancials) && (
                  <div className="mt-1.5 text-[10px] font-mono text-slate-400 truncate">
                    📎 {doc.fileName}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{doc.tanggal}</span>
                  <span>{doc.fileSize}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 truncate mr-2">Oleh: {doc.uploader}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 transition-colors"
                    title="Lihat Pratinjau Dokumen"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {(doc.jenis !== 'Nota' || canViewFinancials) && (
                    <button
                      onClick={() => handleDownloadDoc(doc)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                      title="Unduh Berkas Asli"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canManageDocuments && (
                    <button
                      onClick={() => {
                        void handleDeleteDocument(doc);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Hapus Dokumen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full min-w-[760px] text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="px-3 py-3 font-medium">
                  <span className="sr-only">Pilih</span>
                </th>
                <th className="px-3 py-3 font-medium">Dokumen</th>
                <th className="px-3 py-3 font-medium">Jenis</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Tanggal</th>
                {canViewFinancials && <th className="px-3 py-3 text-right font-medium">Total Nota</th>}
                <th className="px-3 py-3 font-medium">Pengunggah</th>
                <th className="px-3 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {pager.pageItems.map(doc => (
                <tr key={doc.id} className="text-slate-300 hover:bg-slate-800/40">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedDocumentIds.has(doc.id)}
                      onChange={() => toggleDocumentSelection(doc.id)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-purple-500 focus:ring-purple-500"
                      aria-label={`Pilih dokumen ${doc.judul}`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">{doc.judul}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-400">{doc.nomorDokumen}</div>
                    {doc.namaToko && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
                        <Store className="h-3 w-3" />
                        {doc.namaToko}
                      </div>
                    )}
                    {doc.fileName && (doc.jenis !== 'Nota' || canViewFinancials) && (
                      <div className="mt-1 max-w-xs truncate font-mono text-[10px] text-slate-500">{doc.fileName}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[10px] font-semibold text-purple-300">
                      {doc.jenis}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded px-2 py-1 text-[10px] font-bold ${
                      doc.status === 'Sah' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                    <div>{doc.tanggal}</div>
                    <div className="mt-0.5 text-[10px]">{doc.fileSize}</div>
                  </td>
                  {canViewFinancials && (
                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-amber-300">
                      {doc.totalNilaiNota != null ? `Rp ${Number(doc.totalNilaiNota).toLocaleString('id-ID')}` : '-'}
                    </td>
                  )}
                  <td className="px-3 py-3 text-slate-400">{doc.uploader}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="rounded-lg bg-slate-800 p-1.5 text-blue-400 transition-colors hover:bg-slate-700"
                        title="Lihat Pratinjau Dokumen"
                        aria-label={`Lihat dokumen ${doc.judul}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {(doc.jenis !== 'Nota' || canViewFinancials) && (
                        <button
                          onClick={() => handleDownloadDoc(doc)}
                          className="rounded-lg bg-slate-800 p-1.5 text-emerald-400 transition-colors hover:bg-slate-700"
                          title="Unduh Berkas Asli"
                          aria-label={`Unduh dokumen ${doc.judul}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canManageDocuments && (
                        <button
                          onClick={() => void handleDeleteDocument(doc)}
                          className="rounded-lg bg-slate-800 p-1.5 text-slate-400 transition-colors hover:bg-rose-950 hover:text-rose-400"
                          title="Hapus Dokumen"
                          aria-label={`Hapus dokumen ${doc.judul}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <ListPager {...pager} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} label="dokumen" />
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-white truncate max-w-md">{previewDoc.judul}</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{previewDoc.nomorDokumen}</p>
                </div>
              </div>
              <button onClick={() => setPreviewDoc(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Jenis Dokumen:</span>
                  <span className="font-semibold text-white">{previewDoc.jenis}</span>
                </div>
                {previewDoc.namaToko && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Nama Toko / Rekanan:</span>
                    <span className="font-semibold text-emerald-400">{previewDoc.namaToko}</span>
                  </div>
                )}
                {previewDoc.kategoriNota && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Kategori Nota:</span>
                    <span className="font-semibold text-purple-300">{previewDoc.kategoriNota}</span>
                  </div>
                )}
                {canViewFinancials && previewDoc.totalNilaiNota !== undefined && previewDoc.totalNilaiNota !== null && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Nilai Nota:</span>
                    <span className="font-bold text-amber-300">
                      Rp {Number(previewDoc.totalNilaiNota).toLocaleString('id-ID')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Tanggal Pengesahan:</span>
                  <span className="font-semibold text-white">{previewDoc.tanggal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pejabat Pengunggah:</span>
                  <span className="font-semibold text-white">{previewDoc.uploader}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status Dokumen:</span>
                  <span className="font-semibold text-emerald-400">{previewDoc.status}</span>
                </div>
                {previewDoc.uploadedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Waktu Upload:</span>
                    <span className="font-semibold text-white">{new Date(previewDoc.uploadedAt).toLocaleString('id-ID')}</span>
                  </div>
                )}
                {previewDoc.description && !isEditingDescription && (
                  <div>
                    <span className="text-slate-400">Keterangan:</span>
                    <p className="mt-1 text-slate-200">{previewDoc.description}</p>
                  </div>
                )}
                {canManageDocuments && (
                  <div className="border-t border-slate-800 pt-2">
                    {isEditingDescription ? (
                      <div className="space-y-2">
                        <label htmlFor="document-description-edit" className="block text-slate-400">Keterangan</label>
                        <textarea
                          id="document-description-edit"
                          value={descriptionDraft}
                          maxLength={500}
                          rows={3}
                          onChange={event => setDescriptionDraft(event.target.value)}
                          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                        />
                        {descriptionError && <p role="alert" className="text-rose-300">{descriptionError}</p>}
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDescriptionDraft(previewDoc.description || '');
                              setDescriptionError('');
                              setIsEditingDescription(false);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (descriptionDraft.length > 500) {
                                setDescriptionError('Keterangan tidak boleh melebihi 500 karakter.');
                                return;
                              }
                              const description = descriptionDraft.trim();
                              updateDocument(previewDoc.id, { description });
                              setPreviewDoc({ ...previewDoc, description });
                              setDescriptionError('');
                              setIsEditingDescription(false);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                          >
                            Simpan Keterangan
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDescriptionDraft(previewDoc.description || '');
                          setDescriptionError('');
                          setIsEditingDescription(true);
                        }}
                        className="text-purple-300 hover:text-purple-200 font-semibold"
                      >
                        Edit Keterangan
                      </button>
                    )}
                  </div>
                )}
                {previewDoc.fileName && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Nama Berkas:</span>
                    <span className="font-mono text-cyan-300">{previewDoc.fileName}</span>
                  </div>
                )}
                {previewDoc.fileSize && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ukuran Berkas:</span>
                    <span className="font-mono text-slate-300">{previewDoc.fileSize}</span>
                  </div>
                )}
              </div>

              {/* Rincian Item Barang jika Nota */}
              {previewDoc.items && previewDoc.items.length > 0 && (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-emerald-400" />
                      Rincian Barang Belanja ({previewDoc.items.length} item)
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-1.5 px-2 font-medium">No</th>
                          <th className="py-1.5 px-2 font-medium">Nama Barang</th>
                          <th className="py-1.5 px-2 font-medium text-right">Jumlah</th>
                          <th className="py-1.5 px-2 font-medium">Satuan</th>
                          {canViewFinancials && (
                            <>
                              <th className="py-1.5 px-2 font-medium text-right">Harga Satuan</th>
                              <th className="py-1.5 px-2 font-medium text-right">Subtotal</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {previewDoc.items.map((item, idx) => (
                          <tr key={idx} className="text-slate-200 hover:bg-slate-900/40">
                            <td className="py-1.5 px-2 text-slate-500">{idx + 1}</td>
                            <td className="py-1.5 px-2 font-medium text-white">{item.namaBarang}</td>
                            <td className="py-1.5 px-2 text-right">{item.jumlah}</td>
                            <td className="py-1.5 px-2 text-slate-400">{item.satuan}</td>
                            {canViewFinancials && (
                              <>
                                <td className="py-1.5 px-2 text-right text-slate-300">
                                  Rp {Number(item.hargaSatuan || 0).toLocaleString('id-ID')}
                                </td>
                                <td className="py-1.5 px-2 text-right font-semibold text-emerald-400">
                                  Rp {Number(item.subtotal !== undefined ? item.subtotal : item.totalHarga || 0).toLocaleString('id-ID')}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-700 font-semibold text-white">
                          <td colSpan={canViewFinancials ? 5 : 3} className="py-2 px-2 text-right">Total:</td>
                          {canViewFinancials && (
                            <td className="py-2 px-2 text-right text-amber-300">
                              Rp {(
                                previewDoc.totalNilaiNota ||
                                previewDoc.items.reduce((acc, it) => acc + (Number(it.subtotal !== undefined ? it.subtotal : it.totalHarga) || 0), 0)
                              ).toLocaleString('id-ID')}
                            </td>
                          )}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Bukti Berkas Fisik: Image, PDF, or Other Format */}
              {(() => {
                if (previewDoc.jenis === 'Nota' && !canViewFinancials) {
                  return (
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400" role="status">
                      Lampiran dan rincian nilai nota hanya dapat diakses oleh role yang berwenang atas persediaan.
                    </div>
                  );
                }
                const fileUrl = currentPreviewFile?.url;
                const isImage =
                  previewDoc.fileType?.startsWith('image/') ||
                  /\.(jpe?g|png|webp|gif|bmp)$/i.test(previewDoc.fileName || '');
                const isPdf =
                  previewDoc.fileType === 'application/pdf' ||
                  /\.pdf$/i.test(previewDoc.fileName || '');

                if (hasPreviewAttachment && !fileUrl) {
                  return (
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3" role="status">
                      {!currentPreviewFile?.error ? (
                        <p className="text-xs text-slate-300">Memuat berkas lampiran...</p>
                      ) : (
                        <>
                          <p className="font-semibold text-amber-300 text-sm">Lampiran belum dapat dibuka</p>
                          <p className="text-xs text-slate-300">{currentPreviewFile.error}</p>
                          <button type="button" disabled={isRestoringFile}
                            onClick={() => setPreviewReload(value => value + 1)}
                            className="px-3 py-2 bg-slate-800 text-blue-300 text-xs rounded-lg disabled:opacity-50">
                            Coba Lagi
                          </button>
                          {canManageDocuments && currentPreviewFile.code === 'DOCUMENT_FILE_MISSING' && (
                            <label className="block text-xs text-slate-300 space-y-2">
                              <span>Unggah ulang berkas asli yang sama. Nomor nota dan rincian barang tidak berubah.</span>
                              <input type="file" disabled={isRestoringFile}
                                accept={previewDoc.fileType || undefined}
                                onChange={event => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  if (file) void handleRestoreFile(previewDoc, file);
                                }}
                                className="block w-full text-xs text-slate-300" />
                            </label>
                          )}
                          {isRestoringFile && <p className="text-xs text-blue-300">Memulihkan lampiran dan cadangan MySQL...</p>}
                          {restoreError && <p role="alert" className="text-xs text-red-300">{restoreError}</p>}
                        </>
                      )}
                    </div>
                  );
                }

                if (isImage && fileUrl) {
                  return (
                    <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                          Bukti Berkas Fisik Nota / Kuitansi (Gambar)
                        </span>
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px] font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Buka Ukuran Penuh
                        </a>
                      </div>
                      <div className="max-h-[500px] overflow-auto rounded-lg border border-slate-800 bg-slate-900/60 p-2 flex items-center justify-center">
                        <img
                          src={fileUrl}
                          alt={previewDoc.judul}
                          className="max-h-[460px] w-auto max-w-full object-contain rounded-md"
                          onError={() => setPreviewFile({ documentId: previewDoc.id, error: 'Gambar tidak dapat ditampilkan. Coba lagi atau hubungi administrator untuk memeriksa berkas asli.' })}
                        />
                      </div>
                    </div>
                  );
                }

                if (isPdf && fileUrl) {
                  return (
                    <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-purple-400" />
                          Bukti Berkas Fisik Nota / Kuitansi (Dokumen PDF)
                        </span>
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px] font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Buka PDF di Tab Baru
                        </a>
                      </div>
                      <div className="w-full h-80 sm:h-96 rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                        <iframe
                          src={fileUrl}
                          title={`Pratinjau PDF - ${previewDoc.judul}`}
                          className="w-full h-full border-0"
                        />
                      </div>
                      <div className="text-right">
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
                        >
                          <span>PDF tidak tampil di browser? Klik untuk membuka atau unduh langsung.</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                }

                if (fileUrl) {
                  return (
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-slate-400 shrink-0" />
                        <div>
                          <div className="font-medium text-white text-xs">{previewDoc.fileName || 'Berkas Dokumen'}</div>
                          <div className="text-[11px] text-slate-400">{previewDoc.fileSize} • {previewDoc.fileType || 'Berkas Terlampir'}</div>
                        </div>
                      </div>
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Lihat Dokumen
                      </a>
                    </div>
                  );
                }

                return (
                  <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800 text-center space-y-1">
                    <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                    <div className="font-semibold text-slate-300 text-xs">Tidak Ada Bukti Berkas Fisik Terlampir</div>
                    <p className="text-slate-500 text-[11px]">
                      Dokumen ini dicatat sebagai data arsip tanpa berkas fisik terlampir.
                    </p>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end gap-2">
              {previewDoc.jenis === 'Nota' && canEditNota(previewDoc) && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingNota(previewDoc);
                    setPreviewDoc(null);
                    setIsUploadNotaOpen(true);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl"
                >
                  Edit Nota
                </button>
              )}
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Tutup
              </button>
              {(previewDoc.jenis !== 'Nota' || canViewFinancials) && (
                <>
                  <button
                    disabled={hasPreviewAttachment && !currentPreviewFile?.url}
                    onClick={() => {
                      if (currentPreviewFile?.url) {
                        window.open(currentPreviewFile.url, '_blank', 'noopener');
                      } else {
                        handleDownloadDoc(previewDoc);
                      }
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Lihat Dokumen</span>
                  </button>
                  <button
                    disabled={hasPreviewAttachment && !currentPreviewFile?.url}
                    onClick={() => {
                      void handleDownloadDoc(previewDoc);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Real Upload & Import Modal */}
      {isUploadOpen && canManageDocuments && (
        <UploadDocumentModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
        />
      )}

      {/* Upload Nota Belanja ATK / ARK Modal */}
      {isUploadNotaOpen && canViewFinancials && (
        <UploadNotaModal
          isOpen={isUploadNotaOpen}
          initialDocument={editingNota || undefined}
          onClose={() => {
            setIsUploadNotaOpen(false);
            setEditingNota(null);
          }}
        />
      )}
    </div>
  );
};
