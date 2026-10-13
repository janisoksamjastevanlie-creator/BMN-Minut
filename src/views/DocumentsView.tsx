import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DocumentItem } from '../types';
import { UploadDocumentModal } from '../components/documents/UploadDocumentModal';
import { UploadNotaModal } from '../components/documents/UploadNotaModal';
import { ListPager, usePagedList } from '../components/common/ListPager';
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
  DollarSign
} from 'lucide-react';

export const DocumentsView: React.FC = () => {
  const { documents, deleteDocument, registerDeletedDocument, hasPermission } = useApp();
  const canManageDocuments =
    hasPermission('manageAssets') || hasPermission('manageInventory') || hasPermission('systemSettings');

  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploadNotaOpen, setIsUploadNotaOpen] = useState(false);

  const filteredDocs = documents.filter(d => {
    const matchType = filterType === 'all' || d.jenis === filterType;
    const matchSearch =
      search === '' ||
      d.judul.toLowerCase().includes(search.toLowerCase()) ||
      d.nomorDokumen.toLowerCase().includes(search.toLowerCase()) ||
      d.uploader.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });
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

  const handleDownloadDoc = (doc: DocumentItem) => {
    if (doc.storageBackend === 'hostinger') {
      window.open(`/api/documents/${encodeURIComponent(doc.id)}/file?download=1`, '_blank', 'noopener');
      return;
    }
    if (doc.fileDataUrl) {
      const link = document.createElement('a');
      link.href = doc.fileDataUrl;
      link.download = doc.fileName || `${doc.nomorDokumen.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsUploadNotaOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-600/20 w-fit"
            >
              <Receipt className="w-4 h-4" />
              <span>Upload Nota Belanja</span>
            </button>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-purple-600/20 w-fit"
            >
              <Upload className="w-4 h-4" />
              <span>Unggah / Import Dokumen</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            'all',
            'Nota',
            'Berita Acara',
            'Dokumen Lainnya',
            'Dokumen Perolehan',
            'Dokumen Pemindahan',
            'Dokumen Pemeliharaan',
            'Dokumen Penghapusan',
            'Dokumen Stock Opname'
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

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari berkas BAST..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Document Grid */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
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
        <div className="flex items-center gap-3">
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
                <button
                  onClick={() => handleDownloadDoc(doc)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                  title="Unduh Berkas Asli"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <ListPager {...pager} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} label="dokumen" />
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
                {previewDoc.totalNilaiNota !== undefined && previewDoc.totalNilaiNota !== null && (
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
                  <span className="text-slate-400">Status Validasi:</span>
                  <span className="font-bold text-emerald-400">{previewDoc.status}</span>
                </div>
                {previewDoc.uploadedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Waktu Upload:</span>
                    <span className="font-semibold text-white">{new Date(previewDoc.uploadedAt).toLocaleString('id-ID')}</span>
                  </div>
                )}
                {previewDoc.description && (
                  <div>
                    <span className="text-slate-400">Keterangan:</span>
                    <p className="mt-1 text-slate-200">{previewDoc.description}</p>
                  </div>
                )}
                {previewDoc.fileName && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Nama Berkas:</span>
                    <span className="font-mono text-cyan-300">{previewDoc.fileName}</span>
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
                          <th className="py-1.5 px-2 font-medium text-right">Harga Satuan</th>
                          <th className="py-1.5 px-2 font-medium text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {previewDoc.items.map((item, idx) => (
                          <tr key={idx} className="text-slate-200 hover:bg-slate-900/40">
                            <td className="py-1.5 px-2 text-slate-500">{idx + 1}</td>
                            <td className="py-1.5 px-2 font-medium text-white">{item.namaBarang}</td>
                            <td className="py-1.5 px-2 text-right">{item.jumlah}</td>
                            <td className="py-1.5 px-2 text-slate-400">{item.satuan}</td>
                            <td className="py-1.5 px-2 text-right text-slate-300">
                              Rp {Number(item.hargaSatuan || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-2 text-right font-semibold text-emerald-400">
                              Rp {Number(item.subtotal !== undefined ? item.subtotal : item.totalHarga || 0).toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-700 font-semibold text-white">
                          <td colSpan={5} className="py-2 px-2 text-right">Total:</td>
                          <td className="py-2 px-2 text-right text-amber-300">
                            Rp {(
                              previewDoc.totalNilaiNota ||
                              previewDoc.items.reduce((acc, it) => acc + (Number(it.subtotal !== undefined ? it.subtotal : it.totalHarga) || 0), 0)
                            ).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {(previewDoc.fileDataUrl || previewDoc.storageBackend === 'hostinger') &&
              previewDoc.fileType?.startsWith('image/') ? (
                <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-center">
                  <img
                    src={previewDoc.fileDataUrl || `/api/documents/${encodeURIComponent(previewDoc.id)}/file`}
                    alt={previewDoc.judul}
                    className="max-h-56 mx-auto rounded-lg object-contain"
                  />
                </div>
              ) : (
                <div className="p-6 bg-slate-950/80 rounded-xl border border-slate-800 text-center space-y-2">
                  <FileCheck className="w-12 h-12 text-purple-400 mx-auto" />
                  <div className="font-bold text-white">Dokumen Terverifikasi & Ditandatangani Elektronik</div>
                  <p className="text-slate-400 text-[11px]">
                    Telah diregistrasi pada Arsip Digital BPS Kabupaten Minahasa Utara TA 2026.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end gap-2">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Tutup
              </button>
              <button
                onClick={() => {
                  if (previewDoc.storageBackend === 'hostinger') {
                    window.open(`/api/documents/${encodeURIComponent(previewDoc.id)}/file`, '_blank', 'noopener');
                  } else {
                    handleDownloadDoc(previewDoc);
                  }
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Lihat Berkas</span>
              </button>
              <button
                onClick={() => {
                  handleDownloadDoc(previewDoc);
                  setPreviewDoc(null);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Berkas</span>
              </button>
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
      {isUploadNotaOpen && canManageDocuments && (
        <UploadNotaModal
          isOpen={isUploadNotaOpen}
          onClose={() => setIsUploadNotaOpen(false)}
        />
      )}
    </div>
  );
};
