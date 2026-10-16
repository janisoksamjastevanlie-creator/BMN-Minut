import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  downloadMasterAssetExport,
  MASTER_ASSET_HEADERS,
  parseMasterAssetFile,
  prepareMasterAssetImport,
  MasterAssetSourceRow
} from '../../utils/masterAssetImporter';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  UploadCloud,
  X
} from 'lucide-react';

interface MasterAssetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  canImport: boolean;
}

export const MasterAssetImportModal: React.FC<MasterAssetImportModalProps> = ({ isOpen, onClose, canImport }) => {
  const { assets, rooms, importAssets } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceRows, setSourceRows] = useState<MasterAssetSourceRow[] | null>(null);
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const availableCategories = useMemo(
    () => [...new Set(assets.map(asset => asset.kategori.trim()).filter(Boolean))].sort(),
    [assets]
  );
  const preview = useMemo(
    () => sourceRows
      ? prepareMasterAssetImport(sourceRows, categoryMappings, rooms, assets)
      : null,
    [sourceRows, categoryMappings, rooms, assets]
  );

  if (!isOpen) return null;

  const handleFile = async (file?: File) => {
    if (!file) return;
    setSelectedFile(file.name);
    setSourceRows(null);
    setSuccessCount(null);
    setErrorMessage('');
    setIsLoading(true);
    try {
      const parsedRows = await parseMasterAssetFile(file);
      setSourceRows(parsedRows);
      setCategoryMappings(Object.fromEntries(
        [...new Set(parsedRows.map(row => String(row.fields['Jenis BMN'] || '').trim()).filter(Boolean))]
          .map(category => [category, availableCategories.includes(category) ? category : ''])
      ));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'File Master Aset gagal dibaca.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = () => {
    if (!preview || preview.assets.length === 0) return;
    try {
      importAssets(preview.assets, 'append');
      setSuccessCount(preview.assets.length);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Data Master Aset gagal disimpan.');
    }
  };

  const reset = () => {
    setSourceRows(null);
    setSelectedFile('');
    setCategoryMappings({});
    setSuccessCount(null);
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-6xl max-h-[94vh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Impor / Ekspor Master Aset</h2>
              <p className="text-xs text-slate-400 mt-0.5">Mempertahankan seluruh 78 kolom sumber Master Aset.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Download className="w-5 h-5 text-cyan-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-white">Template Master Aset</div>
                <p className="text-[11px] text-slate-400 mt-0.5">Template bersih sesuai sheet dan susunan kolom sumber.</p>
              </div>
            </div>
            <a
              href="/templates/daftar-aset-1-template.xlsx"
              download
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Template
            </a>
          </div>

          {successCount == null && (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Pilih file sumber</div>
                <p className="text-[11px] text-slate-400 mt-0.5">Hanya file dengan sheet “Master Aset” dan header lengkap yang diterima.</p>
                {selectedFile && <p className="text-[11px] text-cyan-300 mt-1">{selectedFile}</p>}
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={event => void handleFile(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || !canImport}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2"
                >
                  <UploadCloud className="w-4 h-4" />
                  {!canImport ? 'Tidak memiliki izin impor' : isLoading ? 'Membaca file...' : 'Pilih Excel'}
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successCount != null && (
            <div className="p-8 text-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white">Impor Master Aset selesai</h3>
              <p className="text-sm text-slate-300 mt-1">{successCount} aset baru telah dikirim ke penyimpanan aplikasi.</p>
              <button onClick={reset} className="mt-5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold">
                Impor file lain
              </button>
            </div>
          )}

          {preview && successCount == null && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800"><span className="text-slate-400 block">Baris sumber</span><b className="text-white text-lg">{sourceRows?.length}</b></div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800"><span className="text-slate-400 block">Siap ditambahkan</span><b className="text-emerald-400 text-lg">{preview.assets.length}</b></div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800"><span className="text-slate-400 block">Konflik, tidak ditimpa</span><b className="text-amber-300 text-lg">{preview.conflicts.length}</b></div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800"><span className="text-slate-400 block">Baris perlu diperiksa</span><b className="text-rose-300 text-lg">{preview.invalidRows.length}</b></div>
              </div>

              <section className="space-y-2">
                <div>
                  <h3 className="text-sm font-bold text-white">Pemetaan kategori</h3>
                  <p className="text-[11px] text-slate-400">Setiap jenis BMN harus dipetakan ke kategori yang sudah tersedia. Kategori atau ruang baru tidak dibuat otomatis.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {preview.sourceCategories.map(category => (
                    <label key={category} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[11px] text-slate-300 block mb-1">{category}</span>
                      <select
                        value={categoryMappings[category] || ''}
                        onChange={event => setCategoryMappings(current => ({ ...current, [category]: event.target.value }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-white"
                      >
                        <option value="">Pilih kategori yang tersedia</option>
                        {availableCategories.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {availableCategories.length === 0 && (
                  <p className="text-xs text-amber-300">Belum ada kategori aset yang tersedia untuk pemetaan.</p>
                )}
              </section>

              <div className="border border-slate-800 rounded-xl overflow-x-auto max-h-72 bg-slate-950">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-900 sticky top-0 text-slate-400">
                    <tr>
                      <th className="p-2.5">Baris</th><th className="p-2.5">Jenis BMN</th><th className="p-2.5">Kode Barang</th>
                      <th className="p-2.5">NUP</th><th className="p-2.5">Nama Barang</th><th className="p-2.5">Lokasi Ruang</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {sourceRows?.slice(0, 30).map(row => {
                      const isInvalid = preview.invalidRows.some(issue => issue.rowNumber === row.rowNumber);
                      const isConflict = preview.conflicts.some(issue => issue.rowNumber === row.rowNumber);
                      return (
                        <tr key={row.rowNumber}>
                          <td className="p-2.5">{row.rowNumber}</td>
                          <td className="p-2.5">{String(row.fields['Jenis BMN'] || '')}</td>
                          <td className="p-2.5 font-mono">{String(row.fields['Kode Barang'] || '')}</td>
                          <td className="p-2.5">{String(row.fields.NUP ?? '')}</td>
                          <td className="p-2.5 max-w-xs truncate">{String(row.fields['Nama Barang'] || '')}</td>
                          <td className="p-2.5">{String(row.fields['Lokasi Ruang'] || '')}</td>
                          <td className={`p-2.5 ${isInvalid ? 'text-rose-300' : isConflict ? 'text-amber-300' : 'text-emerald-300'}`}>
                            {isInvalid ? 'Perlu diperiksa' : isConflict ? 'Konflik' : 'Siap'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(sourceRows?.length || 0) > 30 && <div className="p-2 text-center text-[11px] text-slate-400">Menampilkan 30 baris pertama dari {sourceRows?.length}.</div>}
              </div>

              {(preview.invalidRows.length > 0 || preview.conflicts.length > 0) && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-amber-200">
                    <AlertTriangle className="w-4 h-4" /> Perhatian: baris bermasalah tidak akan ditambahkan.
                  </div>
                  <ul className="max-h-28 overflow-y-auto text-[11px] text-amber-100/90 space-y-0.5">
                    {[...preview.invalidRows, ...preview.conflicts].slice(0, 30).map((issue, index) => (
                      <li key={`${issue.rowNumber}-${index}`}>Baris {issue.rowNumber}: {issue.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[10px] text-slate-500">{MASTER_ASSET_HEADERS.length} kolom sumber • konflik tidak pernah di-upsert otomatis</p>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => downloadMasterAssetExport(assets)} className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Ekspor Master Aset
            </button>
            <button onClick={onClose} className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold">Tutup</button>
            {successCount == null && canImport && (
              <button
                onClick={handleImport}
                disabled={!preview || preview.assets.length === 0 || isLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold"
              >
                Simpan {preview?.assets.length || 0} aset baru
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
