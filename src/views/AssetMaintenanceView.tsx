import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AssetMaintenance, MaintenanceStatus } from '../types';
import {
  Wrench,
  Plus,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Building,
  DollarSign,
  User,
  X,
  Check,
  Trash2
} from 'lucide-react';

export const AssetMaintenanceView: React.FC = () => {
  const { maintenances, assets, addAssetMaintenance, updateMaintenanceStatus, deleteAssetMaintenance, hasPermission } = useApp();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMaintenanceIds, setSelectedMaintenanceIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteNotice, setBulkDeleteNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states
  const [selectedAssetId, setSelectedAssetId] = useState(assets[0]?.id || '');
  const [jenisPemeliharaan, setJenisPemeliharaan] = useState('Perawatan Rutin & Pembersihan');
  const [teknisi, setTeknisi] = useState('Teknisi Spesialis Mitra BPS');
  const [vendor, setVendor] = useState('CV. Sulut Multi Graha Servis');
  const [biaya, setBiaya] = useState('450000');
  const [keterangan, setKeterangan] = useState('');

  const filtered = maintenances.filter(m => filterStatus === 'all' || m.status === filterStatus);

  const areAllFilteredMaintenanceSelected =
    filtered.length > 0 && filtered.every(item => selectedMaintenanceIds.has(item.id));

  const toggleMaintenanceSelection = (id: string) => {
    setSelectedMaintenanceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllMaintenanceSelection = () => {
    setSelectedMaintenanceIds(prev => {
      if (areAllFilteredMaintenanceSelected) return new Set();
      const next = new Set(prev);
      filtered.forEach(item => next.add(item.id));
      return next;
    });
  };

  const handleBulkDeleteMaintenance = () => {
    const targets = maintenances.filter(item => selectedMaintenanceIds.has(item.id));
    if (targets.length === 0) {
      setBulkDeleteNotice({ type: 'error', message: 'Pilih tiket pemeliharaan yang ingin dihapus terlebih dahulu.' });
      setIsBulkDeleteConfirmOpen(false);
      return;
    }

    let deletedCount = 0;
    const errors: string[] = [];
    targets.forEach(item => {
      try {
        const result = deleteAssetMaintenance(item.id);
        if (result.success) deletedCount += 1;
        else errors.push(result.message);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Gagal menghapus tiket ${item.nomorTiket}.`);
      }
    });

    setSelectedMaintenanceIds(new Set());
    setIsBulkDeleteConfirmOpen(false);
    setBulkDeleteNotice(
      errors.length > 0
        ? { type: 'error', message: `${deletedCount} tiket berhasil dihapus. ${errors.length} tiket gagal: ${errors.join(' ')}` }
        : { type: 'success', message: `${deletedCount} tiket pemeliharaan berhasil dihapus.` }
    );
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find(a => a.id === selectedAssetId);
    if (!asset) return;

    addAssetMaintenance({
      assetId: asset.id,
      assetName: asset.namaBarang,
      kodeBarang: asset.kodeBarang,
      nup: asset.nup,
      jenisPemeliharaan,
      tanggalMulai: new Date().toISOString().split('T')[0],
      teknisi,
      vendor,
      biaya: Number(biaya) || 0,
      keterangan: keterangan || 'Pemeliharaan berkala sarana kerja BMN',
      status: 'Terjadwal',
      ruanganNama: asset.ruanganNama
    });

    setIsModalOpen(false);
    setKeterangan('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Pemeliharaan & Perawatan BMN</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold font-mono">
              {maintenances.length} Tiket
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Jadwal servis preventif, perbaikan korektif, dan pencatatan biaya pemeliharaan DIPA
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-600/20 w-fit"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Tiket Pemeliharaan</span>
        </button>
      </div>

      {/* Reminder Banner for Scheduled Services */}
      <div className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900 border border-amber-500/30 p-4 rounded-2xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-200">
              Reminder: Jadwal Servis Rutin Minggu Ini
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Kendaraan dinas operasional lapangan & AC ruang server memerlukan jadwal perawatan berkala.
            </p>
          </div>
        </div>
        <div className="text-right whitespace-nowrap">
          <span className="text-xs font-mono font-bold text-amber-300">
            {maintenances.filter(m => m.status === 'Terjadwal').length} Tiket Menunggu
          </span>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
        {(['all', 'Terjadwal', 'Dalam Proses', 'Selesai', 'Ditunda'] as const).map(st => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              filterStatus === st
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {st === 'all' ? 'Semua Tiket' : st}
          </button>
        ))}
      </div>

      {/* Maintenance Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {hasPermission('manageMaintenance') && (
          <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">{selectedMaintenanceIds.size} data dipilih</span>
            <button
              onClick={() => {
                if (selectedMaintenanceIds.size > 0) {
                  setBulkDeleteNotice(null);
                  setIsBulkDeleteConfirmOpen(true);
                }
              }}
              disabled={selectedMaintenanceIds.size === 0}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Hapus Terpilih ({selectedMaintenanceIds.size})
            </button>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                {hasPermission('manageMaintenance') && (
                  <th className="py-3 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={areAllFilteredMaintenanceSelected}
                      onChange={toggleAllMaintenanceSelection}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                      aria-label="Pilih semua tiket pemeliharaan yang ditampilkan"
                    />
                  </th>
                )}
                <th className="py-3 px-3">No Tiket</th>
                <th className="py-3 px-3">Tanggal</th>
                <th className="py-3 px-4">Aset BMN</th>
                <th className="py-3 px-3">Jenis Pekerjaan</th>
                <th className="py-3 px-3">Vendor / Teknisi</th>
                <th className="py-3 px-3 text-right">Biaya (Rp)</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Aksi Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                  {hasPermission('manageMaintenance') && (
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedMaintenanceIds.has(m.id)}
                        onChange={() => toggleMaintenanceSelection(m.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                        aria-label={`Pilih tiket pemeliharaan ${m.nomorTiket}`}
                      />
                    </td>
                  )}
                  <td className="py-3 px-3 font-mono font-bold text-slate-300">
                    {m.nomorTiket}
                  </td>
                  <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                    {m.tanggalMulai}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{m.assetName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      NUP {m.nup} • {m.ruanganNama}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="text-slate-200">{m.jenisPemeliharaan}</div>
                    <div className="text-[10px] text-slate-400">{m.keterangan}</div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-slate-200">{m.vendor}</div>
                    <div className="text-[10px] text-slate-400">{m.teknisi}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-amber-400">
                    Rp {m.biaya.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${
                      m.status === 'Selesai' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      m.status === 'Dalam Proses' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      m.status === 'Terjadwal' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {m.status === 'Terjadwal' && (
                      <button
                        onClick={() => updateMaintenanceStatus(m.id, 'Dalam Proses')}
                        className="px-2.5 py-1 rounded bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white text-[10px] font-bold"
                      >
                        Mulai Servis
                      </button>
                    )}
                    {m.status === 'Dalam Proses' && (
                      <button
                        onClick={() => updateMaintenanceStatus(m.id, 'Selesai')}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-sm"
                      >
                        Tandai Selesai
                      </button>
                    )}
                    {m.status === 'Selesai' && (
                      <span className="text-emerald-400 text-[10px] font-semibold flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Tuntas</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-maintenance-title"
            className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5"
          >
            <h3 id="bulk-delete-maintenance-title" className="text-sm font-bold text-white">
              Konfirmasi Hapus Tiket Pemeliharaan
            </h3>
            <p className="mt-2 text-xs text-slate-300">
              Apakah Anda yakin ingin menghapus {selectedMaintenanceIds.size} data yang dipilih?
            </p>
            <p className="mt-1 text-xs text-slate-400">Data yang sudah dihapus tidak dapat dikembalikan.</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleBulkDeleteMaintenance}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Maintenance Ticket Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center">
                  <Wrench className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Buat Tiket Perawatan BMN</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Pilih Aset yang Dirawat
                </label>
                <select
                  value={selectedAssetId}
                  onChange={e => setSelectedAssetId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {assets.slice(0, 100).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.namaBarang} (NUP #{a.nup}) - {a.kondisi}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Jenis Pemeliharaan
                </label>
                <input
                  type="text"
                  required
                  value={jenisPemeliharaan}
                  onChange={e => setJenisPemeliharaan(e.target.value)}
                  placeholder="Contoh: Perawatan Rutin AC / Ganti Oli Kendaraan"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Vendor Servis</label>
                  <input
                    type="text"
                    value={vendor}
                    onChange={e => setVendor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Estimasi Biaya (Rp)</label>
                  <input
                    type="number"
                    value={biaya}
                    onChange={e => setBiaya(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Keterangan Tambahan</label>
                <textarea
                  rows={2}
                  value={keterangan}
                  onChange={e => setKeterangan(e.target.value)}
                  placeholder="Keluhan teknis atau suku cadang yang diganti..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-600/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan Tiket</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
