import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AssetMovement, MovementStatus } from '../types';
import { BastMovementPrintModal } from '../components/bmn/BastMovementPrintModal';
import {
  ArrowRightLeft,
  Plus,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
  Check,
  X,
  Building,
  User,
  Calendar,
  Printer,
  Trash2
} from 'lucide-react';

export const AssetMovementsView: React.FC = () => {
  const { movements, assets, rooms, addAssetMovement, updateMovementStatus, deleteAssetMovement, currentUser, hasPermission } = useApp();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedMovementForPrint, setSelectedMovementForPrint] = useState<AssetMovement | null>(null);
  const [selectedMovementIds, setSelectedMovementIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteNotice, setBulkDeleteNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const selectAllMovementsRef = useRef<HTMLInputElement>(null);

  // Form states
  const [selectedAssetId, setSelectedAssetId] = useState(assets[0]?.id || '');
  const [targetRoomId, setTargetRoomId] = useState(rooms[1]?.id || '');
  const [alasan, setAlasan] = useState('');
  const [pemohon, setPemohon] = useState(currentUser?.name || '');

  const filteredMovements = movements.filter(m => {
    return filterStatus === 'all' || m.status === filterStatus;
  });

  const areAllFilteredMovementsSelected =
    filteredMovements.length > 0 && filteredMovements.every(movement => selectedMovementIds.has(movement.id));
  const areSomeFilteredMovementsSelected =
    filteredMovements.some(movement => selectedMovementIds.has(movement.id)) && !areAllFilteredMovementsSelected;

  useEffect(() => {
    if (selectAllMovementsRef.current) {
      selectAllMovementsRef.current.indeterminate = areSomeFilteredMovementsSelected;
    }
  }, [areSomeFilteredMovementsSelected]);

  const toggleMovementSelection = (id: string) => {
    setSelectedMovementIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllMovementSelection = () => {
    setSelectedMovementIds(prev => {
      if (areAllFilteredMovementsSelected) return new Set();
      const next = new Set(prev);
      filteredMovements.forEach(movement => next.add(movement.id));
      return next;
    });
  };

  const handleBulkDeleteMovements = () => {
    const selectedMovements = movements.filter(movement => selectedMovementIds.has(movement.id));
    const failedIds = new Set<string>();
    const errors: string[] = [];
    let deletedCount = 0;

    selectedMovementIds.forEach(id => {
      if (!selectedMovements.some(movement => movement.id === id)) {
        failedIds.add(id);
        errors.push(`Transaksi dengan ID ${id} tidak ditemukan.`);
      }
    });

    selectedMovements.forEach(movement => {
      try {
        const result = deleteAssetMovement(movement.id);
        if (result.success) deletedCount += 1;
        else {
          failedIds.add(movement.id);
          errors.push(result.message);
        }
      } catch (error) {
        failedIds.add(movement.id);
        errors.push(error instanceof Error ? error.message : `Gagal menghapus transaksi ${movement.nomorTransaksi}.`);
      }
    });

    setSelectedMovementIds(failedIds);
    setIsBulkDeleteConfirmOpen(false);
    setBulkDeleteNotice(
      errors.length > 0
        ? { type: 'error', message: `${deletedCount} transaksi berhasil dihapus. ${errors.length} gagal: ${errors.join(' ')}` }
        : { type: 'success', message: `${deletedCount} transaksi pemindahan berhasil dihapus.` }
    );
  };

  const handleCreateMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find(a => a.id === selectedAssetId);
    const targetRoom = rooms.find(r => r.id === targetRoomId);
    if (!asset || !targetRoom || !alasan.trim()) return;

    addAssetMovement({
      assetId: asset.id,
      assetName: asset.namaBarang,
      kodeBarang: asset.kodeBarang,
      nup: asset.nup,
      lokasiAsalId: asset.ruanganId,
      lokasiAsalNama: asset.ruanganNama,
      lokasiTujuanId: targetRoom.id,
      lokasiTujuanNama: targetRoom.name,
      tanggal: new Date().toISOString().split('T')[0],
      alasan,
      pemohon: pemohon || currentUser?.name || 'Petugas',
      penanggungJawab: targetRoom.picName
    });

    setIsNewModalOpen(false);
    setAlasan('');
  };

  const getWorkflowBadge = (status: MovementStatus) => {
    switch (status) {
      case 'Pengajuan':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'Verifikasi':
        return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
      case 'Persetujuan':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'Pemindahan':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'Selesai':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Ditolak':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      default:
        return 'bg-slate-800 text-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Mutasi & Pemindahan Aset BMN</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold font-mono">
              {movements.length} Transaksi
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Alur kerja mutasi aset antar ruangan: Pengajuan → Verifikasi → Persetujuan → Pemindahan → Selesai
          </p>
        </div>

        <button
          onClick={() => setIsNewModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-blue-600/20 w-fit"
        >
          <Plus className="w-4 h-4" />
          <span>Ajukan Pemindahan Aset</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
        {(['all', 'Pengajuan', 'Verifikasi', 'Persetujuan', 'Pemindahan', 'Selesai', 'Ditolak'] as const).map(st => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              filterStatus === st
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {st === 'all' ? 'Semua Status' : st}
          </button>
        ))}
      </div>

      {/* Movements Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {hasPermission('manageMovements') && (
          <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">{selectedMovementIds.size} data dipilih</span>
            <button
              onClick={() => {
                if (selectedMovementIds.size > 0) {
                  setBulkDeleteNotice(null);
                  setIsBulkDeleteConfirmOpen(true);
                }
              }}
              disabled={selectedMovementIds.size === 0}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Hapus Terpilih ({selectedMovementIds.size})
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
                {hasPermission('manageMovements') && (
                  <th className="py-3 px-3 text-center">
                    <input
                      ref={selectAllMovementsRef}
                      type="checkbox"
                      checked={areAllFilteredMovementsSelected}
                      onChange={toggleAllMovementSelection}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
                      aria-label="Pilih semua transaksi pemindahan yang ditampilkan"
                    />
                  </th>
                )}
                <th className="py-3 px-3">No Transaksi</th>
                <th className="py-3 px-3">Tanggal</th>
                <th className="py-3 px-4">Aset BMN</th>
                <th className="py-3 px-3">Mutasi Ruangan</th>
                <th className="py-3 px-3">Alasan & Pemohon</th>
                <th className="py-3 px-3 text-center">Status Alur</th>
                <th className="py-3 px-3 text-center">Tindakan Workflow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredMovements.map(mov => (
                <tr key={mov.id} className="hover:bg-slate-800/40 transition-colors">
                  {hasPermission('manageMovements') && (
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedMovementIds.has(mov.id)}
                        onChange={() => toggleMovementSelection(mov.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
                        aria-label={`Pilih transaksi ${mov.nomorTransaksi}`}
                      />
                    </td>
                  )}
                  <td className="py-3 px-3 font-mono font-bold text-slate-300">
                    {mov.nomorTransaksi}
                  </td>

                  <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                    {mov.tanggal}
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{mov.assetName}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      NUP {mov.nup} • {mov.kodeBarang}
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-400">{mov.lokasiAsalNama}</span>
                      <ArrowRight className="w-3 h-3 text-cyan-400" />
                      <span className="font-semibold text-cyan-300">{mov.lokasiTujuanNama}</span>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <div className="text-slate-200 line-clamp-1">{mov.alasan}</div>
                    <div className="text-[10px] text-slate-400">Pemohon: {mov.pemohon}</div>
                  </td>

                  <td className="py-3 px-3 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getWorkflowBadge(mov.status)}`}>
                      {mov.status}
                    </span>
                  </td>

                  {/* Workflow Action Steps */}
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {mov.status === 'Pengajuan' && (
                        <button
                          onClick={() => updateMovementStatus(mov.id, 'Verifikasi')}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-600 hover:text-white text-[11px] font-semibold transition-colors"
                        >
                          Verifikasi
                        </button>
                      )}

                      {mov.status === 'Verifikasi' && (
                        <button
                          onClick={() => updateMovementStatus(mov.id, 'Persetujuan')}
                          className="px-2.5 py-1 rounded-lg bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600 hover:text-white text-[11px] font-semibold transition-colors"
                        >
                          Setujui Mutasi
                        </button>
                      )}

                      {mov.status === 'Persetujuan' && (
                        <button
                          onClick={() => updateMovementStatus(mov.id, 'Pemindahan')}
                          className="px-2.5 py-1 rounded-lg bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600 hover:text-white text-[11px] font-semibold transition-colors"
                        >
                          Proses Pindah
                        </button>
                      )}

                      {mov.status === 'Pemindahan' && (
                        <button
                          onClick={() => updateMovementStatus(mov.id, 'Selesai')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors shadow-sm"
                        >
                          Selesai & Update Lokasi
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedMovementForPrint(mov)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:text-white text-[11px] font-medium transition-colors flex items-center gap-1 shadow-sm"
                        title="Cetak Berita Acara Serah Terima (BAST)"
                      >
                        <Printer className="w-3 h-3 text-cyan-400" />
                        <span>Cetak BAST</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-movements-title"
            className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5"
          >
            <h3 id="bulk-delete-movements-title" className="text-sm font-bold text-white">
              Konfirmasi Hapus Transaksi Pemindahan
            </h3>
            <p className="mt-2 text-xs text-slate-300">
              Apakah Anda yakin ingin menghapus {selectedMovementIds.size} data mutasi/pemindahan aset BMN?
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
                onClick={handleBulkDeleteMovements}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Movement Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-600/20 text-cyan-400 flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Ajukan Pemindahan Aset BMN</h3>
              </div>
              <button onClick={() => setIsNewModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMovement} className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Pilih Aset yang akan Dipindahkan
                </label>
                <select
                  value={selectedAssetId}
                  onChange={e => setSelectedAssetId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {assets.slice(0, 100).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.namaBarang} (NUP #{a.nup}) - Saat ini di: {a.ruanganNama}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Ruangan Tujuan Baru
                </label>
                <select
                  value={targetRoomId}
                  onChange={e => setTargetRoomId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) - PIC: {r.picName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Alasan Pemindahan Dinas
                </label>
                <textarea
                  required
                  rows={3}
                  value={alasan}
                  onChange={e => setAlasan(e.target.value)}
                  placeholder="Contoh: Kebutuhan penambahan workstation untuk seksi Neraca Wilayah..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                ></textarea>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nama Pemohon</label>
                <input
                  type="text"
                  value={pemohon}
                  onChange={e => setPemohon(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-cyan-600/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Kirim Pengajuan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Print BAST Modal */}
      {selectedMovementForPrint && (
        <BastMovementPrintModal
          isOpen={!!selectedMovementForPrint}
          movement={selectedMovementForPrint}
          onClose={() => setSelectedMovementForPrint(null)}
        />
      )}
    </div>
  );
};
