import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { parseUploadedFile, mapRowsToBmnAssets, downloadAssetTemplate } from '../../utils/fileImporter';
import { BmnAsset } from '../../types';
import confetti from 'canvas-confetti';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  AlertTriangle,
  Layers,
  RefreshCw,
  ArrowRight,
  Database
} from 'lucide-react';

interface ImportAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportAssetModal: React.FC<ImportAssetModalProps> = ({ isOpen, onClose }) => {
  const { rooms, importAssets } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewAssets, setPreviewAssets] = useState<Omit<BmnAsset, 'id'>[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<'upsert' | 'append'>('upsert');
  const [importSuccess, setImportSuccess] = useState<{ added: number; updated: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = async (file: File) => {
    setSelectedFile(file);
    setErrorMsg(null);
    setWarnings([]);
    setPreviewAssets([]);
    setImportSuccess(null);
    setIsLoading(true);

    try {
      const rawRows = await parseUploadedFile(file);
      const { validAssets, warnings: parsingWarnings } = mapRowsToBmnAssets(rawRows, rooms);

      if (validAssets.length === 0) {
        throw new Error('Tidak ditemukan baris data aset BMN yang valid dalam file ini. Periksa kesesuaian kolom template.');
      }

      setPreviewAssets(validAssets);
      setWarnings(parsingWarnings);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses file. Pastikan format file sesuai.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileChange(file);
    }
  };

  const handleProcessImport = () => {
    if (previewAssets.length === 0) return;

    const result = importAssets(previewAssets, importMode);
    setImportSuccess({
      added: result.successCount,
      updated: result.updatedCount
    });

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch {
      // fallback
    }
  };

  const resetAll = () => {
    setSelectedFile(null);
    setPreviewAssets([]);
    setWarnings([]);
    setErrorMsg(null);
    setImportSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Import File Aset BMN</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                  SIMAN & SAKTI Ready
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Impor data inventaris dari Excel (.xlsx, .xls), CSV, TSV, atau JSON ke database BPS Minahasa Utara
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
          {/* Download Template Banner */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-blue-950/30 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-blue-200">Format Rekomendasi Format SIMAN/SAKTI:</span>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Kolom: Kode Barang, NUP, Nama Barang, Kategori, Merk/Type, Nomor Seri, Tahun Perolehan, Nilai Perolehan, Kondisi, Ruangan.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => downloadAssetTemplate('xlsx')}
                className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Template Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => downloadAssetTemplate('csv')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Template CSV</span>
              </button>
            </div>
          </div>

          {/* Success State View */}
          {importSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Import File Aset Berhasil!</h3>
                <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                  Data telah tersimpan ke sistem SIMAN-BMN BPS Minahasa Utara, tercatat dalam audit log, dan disinkronkan ke penyimpanan lokal.
                </p>
              </div>

              <div className="flex items-center justify-center gap-4 text-xs font-semibold">
                <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-400 block text-[10px]">ASET BARU DITAMBAHKAN</span>
                  <span className="text-emerald-400 text-lg font-bold font-mono">+{importSuccess.added}</span>
                </div>
                <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-400 block text-[10px]">ASET DIPERBARUI</span>
                  <span className="text-cyan-400 text-lg font-bold font-mono">{importSuccess.updated}</span>
                </div>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={resetAll}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
                >
                  Import File Lainnya
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-colors"
                >
                  Tutup & Lihat Data Aset
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Drag and Drop Upload Area */}
              {!selectedFile ? (
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-600/10 scale-[1.005]'
                      : 'border-slate-700 hover:border-slate-600 bg-slate-950/60 hover:bg-slate-950'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.tsv,.json"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileChange(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-3">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-white">
                    Pilih atau Seret (Drag & Drop) File Aset ke Sini
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Mendukung format spreadsheet Excel (<span className="text-slate-300 font-mono">.xlsx, .xls</span>), CSV (<span className="text-slate-300 font-mono">.csv</span>), TSV, dan JSON
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span>Klik untuk Telusuri File</span>
                  </div>
                </div>
              ) : (
                /* Selected File Header */
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>{selectedFile.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {previewAssets.length} baris data berhasil terbaca & divalidasi
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={resetAll}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Ganti File</span>
                  </button>
                </div>
              )}

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div>
                    <span className="font-bold">Terjadi Kesalahan:</span> {errorMsg}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Peringatan Pembacaan Data ({warnings.length}):</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-200/90 space-y-0.5 pl-2 max-h-24 overflow-y-auto">
                    {warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview Table & Mode Options */}
              {previewAssets.length > 0 && (
                <div className="space-y-4">
                  {/* Mode Option */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-300 font-semibold">
                      <Layers className="w-4 h-4 text-blue-400" />
                      <span>Metode Penyimpanan Data:</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label
                        className={`cursor-pointer px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${
                          importMode === 'upsert'
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'upsert'}
                          onChange={() => setImportMode('upsert')}
                          className="hidden"
                        />
                        <span>Sinkronisasi / Upsert (Rekomendasi)</span>
                      </label>

                      <label
                        className={`cursor-pointer px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${
                          importMode === 'append'
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'append'}
                          onChange={() => setImportMode('append')}
                          className="hidden"
                        />
                        <span>Tambah Selalu Baru (Append)</span>
                      </label>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>Pratinjau Data Aset ({previewAssets.length} baris)</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Pastikan kolom telah terpetakan dengan benar
                      </span>
                    </div>

                    <div className="border border-slate-800 rounded-xl overflow-x-auto max-h-72 bg-slate-950">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-900/90 sticky top-0 border-b border-slate-800 text-slate-400 text-[11px]">
                          <tr>
                            <th className="p-2.5">No</th>
                            <th className="p-2.5">Kode Barang</th>
                            <th className="p-2.5">NUP</th>
                            <th className="p-2.5">Nama Barang</th>
                            <th className="p-2.5">Merk / Type</th>
                            <th className="p-2.5">Kondisi</th>
                            <th className="p-2.5">Tahun</th>
                            <th className="p-2.5">Nilai Perolehan</th>
                            <th className="p-2.5">Ruangan Tujuan</th>
                            <th className="p-2.5">Penanggung Jawab</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {previewAssets.map((asset, i) => (
                            <tr key={i} className="hover:bg-slate-900/50">
                              <td className="p-2.5 text-slate-500 font-mono">{i + 1}</td>
                              <td className="p-2.5 font-mono text-cyan-300">{asset.kodeBarang}</td>
                              <td className="p-2.5 font-mono font-bold text-white">{asset.nup}</td>
                              <td className="p-2.5 font-semibold text-white max-w-xs truncate">{asset.namaBarang}</td>
                              <td className="p-2.5 text-slate-400">{asset.merkType}</td>
                              <td className="p-2.5">
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                    asset.kondisi === 'Baik'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : asset.kondisi === 'Rusak Ringan'
                                      ? 'bg-amber-500/10 text-amber-400'
                                      : 'bg-rose-500/10 text-rose-400'
                                  }`}
                                >
                                  {asset.kondisi}
                                </span>
                              </td>
                              <td className="p-2.5 font-mono">{asset.tahunPerolehan}</td>
                              <td className="p-2.5 font-mono text-emerald-400">
                                Rp {asset.nilaiPerolehan.toLocaleString('id-ID')}
                              </td>
                              <td className="p-2.5 text-blue-300 max-w-[180px] truncate">{asset.ruanganNama}</td>
                              <td className="p-2.5 text-slate-400 max-w-[150px] truncate">{asset.penanggungJawab}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
          >
            Tutup
          </button>

          {!importSuccess && (
            <button
              type="button"
              disabled={isLoading || previewAssets.length === 0}
              onClick={handleProcessImport}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                isLoading || previewAssets.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memproses File...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Simpan {previewAssets.length} Aset ke Database</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
