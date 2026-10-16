import React, { useRef, useState } from 'react';
import { BmnAsset } from '../../types';
import {
  DbrReconciliationResult,
  DbrWorkbookResult,
  parseDbrWorkbook,
  reconcileDbrRows
} from '../../utils/dbrReconciliation';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Search, UploadCloud, X } from 'lucide-react';

const statusLabels: Record<keyof Omit<DbrReconciliationResult['counts'], 'appOnly'>, string> = {
  matched: 'Cocok',
  different: 'Berbeda',
  'excel-only': 'Hanya di Excel',
  duplicate: 'Duplikat',
  'needs-review': 'Perlu verifikasi'
};

const statusClassNames: Record<keyof Omit<DbrReconciliationResult['counts'], 'appOnly'>, string> = {
  matched: 'bg-emerald-500/10 text-emerald-300',
  different: 'bg-amber-500/10 text-amber-300',
  'excel-only': 'bg-blue-500/10 text-blue-300',
  duplicate: 'bg-rose-500/10 text-rose-300',
  'needs-review': 'bg-orange-500/10 text-orange-300'
};

export const DbrReconciliationModal: React.FC<{
  assets: BmnAsset[];
  onClose: () => void;
}> = ({ assets, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState('');
  const [workbook, setWorkbook] = useState<DbrWorkbookResult | null>(null);
  const [report, setReport] = useState<DbrReconciliationResult | null>(null);
  const [fileName, setFileName] = useState('');

  const handleFile = async (file?: File) => {
    if (!file) return;
    setIsReading(true);
    setError('');
    setWorkbook(null);
    setReport(null);
    setFileName(file.name);
    try {
      const parsed = parseDbrWorkbook(await file.arrayBuffer());
      setWorkbook(parsed);
      setReport(reconcileDbrRows(parsed.rows, assets));
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Gagal membaca file DBR.');
    } finally {
      setIsReading(false);
    }
  };

  const resetFile = () => {
    setWorkbook(null);
    setReport(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-md sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dbr-reconciliation-title"
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 id="dbr-reconciliation-title" className="text-sm font-bold text-white">Rekonsiliasi Referensi DBR</h2>
              <p className="mt-1 text-[11px] text-slate-400">Pratinjau baca-saja terhadap aset yang sedang dimuat di aplikasi.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup rekonsiliasi DBR" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="flex flex-col gap-3 rounded-xl border border-blue-500/20 bg-blue-950/20 p-3 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-3xl leading-relaxed">
              Kunci pencocokan adalah pasangan Kode Barang + NUP. Tidak ada data yang disimpan atau diperbarui. Atribut yang tidak tersedia pada workbook tidak akan dibuat.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                aria-label="Pilih file Excel DBR"
                onChange={event => void handleFile(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isReading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
              >
                <UploadCloud className="h-4 w-4" />
                {isReading ? 'Membaca...' : fileName ? 'Pilih file lain' : 'Pilih file DBR'}
              </button>
              {fileName && (
                <button type="button" onClick={resetFile} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-300 hover:bg-slate-800">
                  Reset
                </button>
              )}
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          {workbook && report && (
            <>
              <div className="text-xs text-slate-300">
                File: <span className="font-semibold text-white">{fileName}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {(Object.keys(statusLabels) as Array<keyof typeof statusLabels>).map(status => (
                  <div key={status} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="text-[10px] text-slate-400">{statusLabels[status]}</div>
                    <div className={`mt-1 inline-flex rounded-md px-2 py-1 font-mono text-sm font-bold ${statusClassNames[status]}`}>
                      {report.counts[status]}
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] text-slate-400">Hanya di aplikasi</div>
                  <div className="mt-1 inline-flex rounded-md bg-slate-800 px-2 py-1 font-mono text-sm font-bold text-slate-200">
                    {report.counts.appOnly}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="bg-slate-950 text-[10px] text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">Sheet / Baris</th>
                      <th className="px-3 py-2.5">Kode Barang + NUP</th>
                      <th className="px-3 py-2.5">Nama DBR</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {report.rows.map((row, index) => (
                      <tr key={`${row.reference.sheetName}-${row.reference.rowNumber}-${index}`} className="align-top text-slate-300">
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{row.reference.sheetName} · {row.reference.rowNumber}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono">{row.reference.kodeBarang} · {row.reference.nup}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-white">{row.reference.namaBarang}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            Excel: {[row.reference.merk, row.reference.tipe].filter(Boolean).join(' / ') || '-'}
                            {' · Ruangan: '}{row.reference.ruangan || 'kosong'}
                          </div>
                          {row.asset && (
                            <div className="mt-1 text-[10px] text-slate-500">
                              Aplikasi: {row.asset.namaBarang} · {row.asset.ruanganNama || 'tanpa ruangan'}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${statusClassNames[row.status]}`}>
                            {statusLabels[row.status]}
                          </span>
                        </td>
                        <td className="max-w-xs px-3 py-2.5 text-[10px] leading-relaxed text-slate-400">
                          {row.notes.length ? row.notes.join(' ') : 'Seluruh kolom yang dapat dibandingkan cocok.'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <h3 className="text-xs font-bold text-white">Ringkasan sheet dan kolom</h3>
                {workbook.sheets.map(sheet => (
                  <div key={sheet.name} className="flex flex-col gap-1 text-[10px] text-slate-400 sm:flex-row sm:items-start sm:justify-between">
                    <span className="font-semibold text-slate-300">
                      {sheet.name}: {sheet.empty ? 'kosong' : `${sheet.dataRows} baris data`}
                    </span>
                    <span className="sm:text-right">
                      {sheet.columns.length ? sheet.columns.join(' · ') : 'Tidak ada kolom'}
                      {sheet.recognized ? ' · format DBR dikenali' : ''}
                    </span>
                  </div>
                ))}
                {workbook.warnings.map((warning, index) => (
                  <p key={`${index}-${warning}`} className="flex items-start gap-1.5 text-[10px] text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {warning}
                  </p>
                ))}
              </section>

              {report.appOnly.length > 0 && (
                <details className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-300">
                    Aset aplikasi yang tidak tercantum di DBR ({report.appOnly.length})
                  </summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[10px] text-slate-400">
                    {report.appOnly.map(asset => (
                      <li key={asset.id} className="flex items-start gap-1.5">
                        <Search className="mt-0.5 h-3 w-3 shrink-0" />
                        {asset.kodeBarang} · NUP {asset.nup} · {asset.namaBarang}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {report.counts.matched > 0 && (
                <p className="flex items-center gap-1.5 text-[10px] text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Data berstatus cocok menggunakan identitas dan informasi yang tersedia saja.
                </p>
              )}
            </>
          )}
        </div>

        <footer className="flex justify-end border-t border-slate-800 p-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white">
            Tutup
          </button>
        </footer>
      </section>
    </div>
  );
};
