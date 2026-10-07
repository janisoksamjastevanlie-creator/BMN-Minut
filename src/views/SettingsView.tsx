import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Settings,
  Database,
  HardDrive,
  ShieldCheck,
  RefreshCw,
  Cpu,
  Download,
  UploadCloud,
  FileCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    performance3D,
    setPerformance3D,
    assets,
    inventoryItems,
    documents,
    importSystemBackup,
    setActiveView
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  const handleExportBackup = () => {
    const backupData = {
      appName: 'SIMAN-BMN Minahasa Utara',
      satker: 'BPS Kabupaten Minahasa Utara (7106)',
      exportedAt: new Date().toISOString(),
      assets,
      inventoryItems,
      documents
    };

    const jsonString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `BACKUP_SIMAN_BMN_BPS7106_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.assets && !parsed.inventoryItems && !parsed.documents) {
          throw new Error('File tidak memiliki struktur data SIMAN yang valid.');
        }

        importSystemBackup({
          assets: parsed.assets,
          inventoryItems: parsed.inventoryItems,
          documents: parsed.documents
        });

        setRestoreStatus(`Berhasil memulihkan ${parsed.assets?.length || 0} aset, ${parsed.inventoryItems?.length || 0} persediaan, dan ${parsed.documents?.length || 0} arsip.`);
        setTimeout(() => setRestoreStatus(null), 6000);
      } catch (err: any) {
        alert('Gagal membaca file cadangan: ' + (err.message || 'Format tidak sesuai'));
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = () => {
    if (confirm('Apakah Anda yakin ingin menyetel ulang data kembali ke sampel awal?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-white">Pengaturan Sistem SIMAN-BMN</h1>
        <p className="text-xs text-slate-400 mt-1">
          Konfigurasi Satker BPS Minahasa Utara, performa 3D twin, dan manajemen database
        </p>
      </div>

      {/* Satker Config */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span>Informasi Satuan Kerja (Satker)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Nama Satker:</label>
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-semibold text-white">
              BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Kode Satker Kemenkeu/SAKTI:</label>
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono font-bold text-cyan-400">
              7106
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Wilayah / Provinsi:</label>
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-semibold text-white">
              Kabupaten Minahasa Utara, Sulawesi Utara (71)
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">KPKNL Mitra Pengelolaan BMN:</label>
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-semibold text-white">
              KPKNL Manado
            </div>
          </div>
        </div>
      </div>

      {/* 3D Performance Configuration */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>Pengaturan Kinerja Rendering 3D Digital Twin</span>
        </h3>
        <p className="text-xs text-slate-400">
          Sesuaikan mode rendering grafis 3D untuk gedung kantor dan rak gudang sesuai kemampuan perangkat.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {(['normal', 'performance', 'low'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setPerformance3D(mode)}
              className={`p-3 rounded-xl border text-left transition-all ${
                performance3D === mode
                  ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <div className="font-bold text-xs capitalize">{mode} Mode</div>
              <div className="text-[10px] text-slate-400 mt-1">
                {mode === 'normal' && 'Shadows aktif, anti-aliasing penuh (Desktop)'}
                {mode === 'performance' && 'FPS stabil, pencahayaan optimal (Laptop)'}
                {mode === 'low' && 'Hemat daya, wireframe low-poly (Mobile)'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Database & Storage */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" />
          <span>Status Database, Backup & Import File Cadangan</span>
        </h3>

        <div className="text-xs text-slate-300 space-y-1">
          <div>• Aset BMN tersimpan: <span className="font-bold text-white">{assets.length} unit</span></div>
          <div>• Persediaan tersimpan: <span className="font-bold text-white">{inventoryItems.length} jenis</span></div>
          <div>• Arsip dokumen digital: <span className="font-bold text-white">{documents.length} berkas</span></div>
          <div>• Skema relasional PostgreSQL Supabase: <span className="font-mono text-cyan-400">/src/db/schema.sql (23 tabel)</span></div>
        </div>

        {/* Restore Status Banner */}
        {restoreStatus && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{restoreStatus}</span>
          </div>
        )}

        {/* Backup & Import Buttons */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportBackup}
            className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-white text-xs font-bold rounded-xl transition-colors border border-emerald-500/30 flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export & Cadangkan Seluruh Database (JSON)</span>
          </button>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportBackup}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white text-xs font-bold rounded-xl transition-colors border border-blue-500/30 flex items-center gap-2"
            >
              <UploadCloud className="w-4 h-4 text-blue-400" />
              <span>Import & Restore File Backup (JSON)</span>
            </button>
          </div>

          <button
            onClick={handleResetData}
            className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold rounded-xl transition-colors border border-rose-500/30 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reset Database ke Sampel Awal BPS</span>
          </button>
        </div>

        {/* Shortcut links to Aset & Persediaan import */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Pintasan Import Cepat:</span>
          <button
            onClick={() => setActiveView('assets')}
            className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-blue-400 font-semibold border border-slate-800"
          >
            Ke Menu Import Aset BMN (.xlsx/.csv) →
          </button>
          <button
            onClick={() => setActiveView('inventory')}
            className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-amber-400 font-semibold border border-slate-800"
          >
            Ke Menu Import Persediaan ATK (.xlsx/.csv) →
          </button>
          <button
            onClick={() => setActiveView('documents')}
            className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-purple-400 font-semibold border border-slate-800"
          >
            Ke Menu Unggah Berkas Dokumen →
          </button>
        </div>
      </div>
    </div>
  );
};
