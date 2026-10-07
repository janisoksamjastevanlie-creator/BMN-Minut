import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { DocumentItem } from '../../types';
import confetti from 'canvas-confetti';
import {
  UploadCloud,
  FileText,
  FileCheck,
  CheckCircle2,
  X,
  Calendar,
  Tag,
  ShieldCheck,
  FileType,
  FileCode,
  FileSpreadsheet,
  FileImage,
  RefreshCw
} from 'lucide-react';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, addDocument } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const [jenis, setJenis] = useState<DocumentItem['jenis']>('Berita Acara');
  const [judul, setJudul] = useState('');
  const [nomorDokumen, setNomorDokumen] = useState('');
  const [tanggal, setTanggal] = useState(today);
  const [status, setStatus] = useState<DocumentItem['status']>('Sah');
  const [tagInput, setTagInput] = useState('Rekonsiliasi, Minahasa Utara');
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const generateDocNumber = (selectedType: string) => {
    const codeMap: Record<string, string> = {
      'Berita Acara': 'BA-REKON',
      'Dokumen Perolehan': 'BAST-PEROLEHAN',
      'Dokumen Pemindahan': 'BA-MUTASI',
      'Dokumen Pemeliharaan': 'BA-MNT',
      'Dokumen Penghapusan': 'SK-DSP',
      'Dokumen Barang Masuk': 'BA-MASUK',
      'Dokumen Barang Keluar': 'BA-KELUAR',
      'Dokumen Stock Opname': 'BA-SO',
      'Dokumen Pengadaan': 'SPK-PENGADAAN'
    };
    const prefix = codeMap[selectedType] || 'BA';
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}/BPS-7106/2026/${rand}`;
  };

  const handleFile = (file: File) => {
    setSelectedFile(file);
    if (!judul) {
      // Remove file extension for clean title
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setJudul(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
    }
    if (!nomorDokumen) {
      setNomorDokumen(generateDocNumber(jenis));
    }

    // Read as Data URL for browser preview & download
    const reader = new FileReader();
    reader.onload = e => {
      setFileDataUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !judul.trim()) return;

    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    addDocument({
      nomorDokumen: nomorDokumen.trim() || generateDocNumber(jenis),
      judul: judul.trim(),
      jenis,
      tanggal,
      tahun: new Date(tanggal).getFullYear(),
      fileSize: formatFileSize(selectedFile.size),
      uploader: currentUser?.name || 'Operator BMN',
      tags: tags.length > 0 ? tags : ['SIMAN-BMN'],
      status,
      fileName: selectedFile.name,
      fileType: selectedFile.type || selectedFile.name.split('.').pop() || 'unknown',
      fileDataUrl
    });

    setIsSuccess(true);
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch {
      // fallback
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="w-5 h-5 text-rose-400" />;
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    if (['png', 'jpg', 'jpeg'].includes(ext || '')) return <FileImage className="w-5 h-5 text-purple-400" />;
    return <FileType className="w-5 h-5 text-blue-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl max-h-[92vh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Unggah & Import Dokumen Digital</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                  Arsip BPS Minut
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Simpan Berita Acara Rekonsiliasi, BAST, SK Penetapan Status, atau Dokumen Opname
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {isSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Dokumen Berhasil Diunggah!</h3>
                <p className="text-xs text-slate-300 mt-1 max-w-sm mx-auto">
                  Berkas <span className="text-white font-semibold">"{selectedFile?.name}"</span> telah tersimpan dalam repositori arsip digital SIMAN-BMN.
                </p>
              </div>

              <div className="pt-3 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setFileDataUrl(undefined);
                    setJudul('');
                    setNomorDokumen('');
                    setIsSuccess(false);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
                >
                  Unggah Dokumen Lain
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/30"
                >
                  Tutup & Lihat Arsip
                </button>
              </div>
            </div>
          ) : (
            <form id="uploadDocForm" onSubmit={handleSubmit} className="space-y-4">
              {/* File Drag & Drop Box */}
              {!selectedFile ? (
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-6 sm:p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-purple-500 bg-purple-600/10'
                      : 'border-slate-700 hover:border-slate-600 bg-slate-950/60 hover:bg-slate-950'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handleFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="w-12 h-12 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto mb-2">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-white">
                    Pilih atau Seret Dokumen PDF / Excel / Word ke Sini
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Format: PDF, Word (DOC/DOCX), Excel (XLS/XLSX), Gambar (PNG/JPG) hingga 25 MB
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                      {getFileIcon(selectedFile.name)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white max-w-xs sm:max-w-md truncate">
                        {selectedFile.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {formatFileSize(selectedFile.size)} • Siap diarsipkan
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setFileDataUrl(undefined);
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Ganti</span>
                  </button>
                </div>
              )}

              {/* Form Metadata Fields */}
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Jenis Dokumen / Berkas <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={jenis}
                    onChange={e => {
                      const newType = e.target.value as DocumentItem['jenis'];
                      setJenis(newType);
                      setNomorDokumen(generateDocNumber(newType));
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="Berita Acara">Berita Acara Rekonsiliasi / BAST</option>
                    <option value="Dokumen Perolehan">Dokumen Perolehan / Pengadaan</option>
                    <option value="Dokumen Pemindahan">Dokumen Pemindahan / Mutasi</option>
                    <option value="Dokumen Pemeliharaan">Dokumen Pemeliharaan / Perawatan</option>
                    <option value="Dokumen Penghapusan">Dokumen Usulan Penghapusan (KPKNL)</option>
                    <option value="Dokumen Stock Opname">Dokumen Berita Acara Stock Opname</option>
                    <option value="Dokumen Barang Masuk">Dokumen Penerimaan / Barang Masuk</option>
                    <option value="Dokumen Barang Keluar">Dokumen Distribusi / Barang Keluar</option>
                    <option value="Dokumen Pengadaan">Surat Pesanan / SPK Pengadaan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Judul Dokumen <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={judul}
                    onChange={e => setJudul(e.target.value)}
                    placeholder="Contoh: Berita Acara Rekonsiliasi BMN Semester I TA 2026"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">
                      Nomor Registrasi Dokumen
                    </label>
                    <input
                      type="text"
                      value={nomorDokumen}
                      onChange={e => setNomorDokumen(e.target.value)}
                      placeholder="BA-REKON/BPS-7106/2026/0014"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">
                      Tanggal Pengesahan
                    </label>
                    <input
                      type="date"
                      value={tanggal}
                      onChange={e => setTanggal(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">
                      Status Validasi
                    </label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value as DocumentItem['status'])}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="Sah">Sah / Terverifikasi</option>
                      <option value="Menunggu TTD">Menunggu TTD Pimpinan</option>
                      <option value="Arsip">Arsip Pasif</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">
                      Tag / Kata Kunci (pisahkan koma)
                    </label>
                    <input
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      placeholder="BMN, Minut, SAKTI"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
          >
            Batal
          </button>

          {!isSuccess && (
            <button
              type="submit"
              form="uploadDocForm"
              disabled={!selectedFile || !judul.trim()}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                !selectedFile || !judul.trim()
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>Simpan ke Arsip Dokumen</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
