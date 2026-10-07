import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import confetti from 'canvas-confetti';
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  X,
  Send,
  Building,
  User,
  Calendar,
  AlertCircle,
  Clock,
  Sparkles,
  Boxes
} from 'lucide-react';

interface StockRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultItemId?: string;
}

export const StockRequestModal: React.FC<StockRequestModalProps> = ({
  isOpen,
  onClose,
  defaultItemId
}) => {
  const { inventoryItems, rooms, addInventoryRequest, currentUser, setActiveView } = useApp();

  const [selectedItemId, setSelectedItemId] = useState<string>(
    defaultItemId || inventoryItems[0]?.id || ''
  );
  const [jumlahDiminta, setJumlahDiminta] = useState('2');
  const [unitKerja, setUnitKerja] = useState('Fungsi Statistik Sosial');
  const [ruangan, setRuangan] = useState('Ruang Statistik Sosial');
  const [keperluan, setKeperluan] = useState('Administrasi kegiatan survei lapangan BPS Minahasa Utara');
  const [prioritas, setPrioritas] = useState<'Rendah' | 'Normal' | 'Tinggi' | 'Mendesak'>('Normal');
  const [catatan, setCatatan] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedId, setSubmittedId] = useState<string>('');

  if (!isOpen) return null;

  const selectedItem = inventoryItems.find(i => i.id === selectedItemId);
  const requestedNum = parseInt(jumlahDiminta, 10) || 0;
  const isOverStock = selectedItem ? requestedNum > selectedItem.stokSaatIni : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || requestedNum <= 0) return;

    const newReq = addInventoryRequest({
      pemohonNama: currentUser?.name || 'Pegawai BPS Minahasa Utara',
      unitKerja,
      ruangan,
      itemId: selectedItem.id,
      namaBarang: selectedItem.nama,
      jumlahDiminta: requestedNum,
      satuan: selectedItem.satuan,
      keperluan: keperluan.trim() || 'Keperluan operasional kantor',
      prioritas,
      catatan: catatan.trim() || undefined
    });

    setSubmittedId(newReq?.nomorPermintaan || 'REQ-BPS7106/2026/NEW');
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

  const handleReset = () => {
    setIsSuccess(false);
    setJumlahDiminta('2');
    setKeperluan('Administrasi kegiatan survei lapangan BPS Minahasa Utara');
    setCatatan('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl max-h-[92vh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Formulir Permohonan & Permintaan ATK/ARK</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                  Online BPS Minut
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pengajuan barang persediaan habis pakai untuk kelancaran tugas dinas
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Permohonan Berhasil Dikirim!</h3>
                <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                  Permohonan barang nomor <span className="font-mono text-cyan-400 font-bold">{submittedId}</span> telah tercatat dalam sistem dan otomatis masuk ke antrean verifikasi Pengelola BMN/Gudang.
                </p>
              </div>

              <div className="p-4 max-w-md mx-auto bg-slate-950 border border-slate-800 rounded-xl text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Barang:</span>
                  <span className="font-semibold text-white">{selectedItem?.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Jumlah Diminta:</span>
                  <span className="font-bold text-cyan-300">{requestedNum} {selectedItem?.satuan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status Alur:</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold text-[10px]">
                    Diajukan (Menunggu Verifikasi)
                  </span>
                </div>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
                >
                  Buat Permohonan Lain
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setActiveView('requests');
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30"
                >
                  Lihat Daftar Permohonan
                </button>
              </div>
            </div>
          ) : (
            <form id="stockRequestForm" onSubmit={handleSubmit} className="space-y-4">
              {/* Item selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Pilih Barang Persediaan (ATK/ARK) <span className="text-rose-400">*</span>
                </label>
                <select
                  value={selectedItemId}
                  onChange={e => setSelectedItemId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {inventoryItems.map(item => (
                    <option key={item.id} value={item.id}>
                      [{item.jenis}] {item.nama} — Stok: {item.stokSaatIni} {item.satuan} ({item.rak})
                    </option>
                  ))}
                </select>

                {/* Selected Item Detail Snapshot */}
                {selectedItem && (
                  <div className="mt-2 p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-indigo-400" />
                      <div>
                        <span className="text-slate-400 text-[11px]">Kategori:</span>{' '}
                        <span className="text-slate-200 font-medium">{selectedItem.subkategori}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[11px]">Stok Tersedia:</span>{' '}
                      <span className={`font-mono font-bold ${selectedItem.stokSaatIni === 0 ? 'text-rose-400' : selectedItem.stokSaatIni <= selectedItem.stokMinimum ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {selectedItem.stokSaatIni} {selectedItem.satuan}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quantity & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Jumlah Dibutuhkan <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      required
                      value={jumlahDiminta}
                      onChange={e => setJumlahDiminta(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono font-bold"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400">
                      {selectedItem?.satuan || 'Unit'}
                    </span>
                  </div>

                  {isOverStock && (
                    <div className="mt-1 text-[11px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Melebihi stok gudang ({selectedItem?.stokSaatIni} {selectedItem?.satuan})</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tingkat Urgensi / Prioritas
                  </label>
                  <select
                    value={prioritas}
                    onChange={e => setPrioritas(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Normal">🟢 Normal (Rutin Kantor)</option>
                    <option value="Tinggi">🟡 Tinggi (Mendekati Batas Pelaporan)</option>
                    <option value="Mendesak">🔴 Mendesak (Survei Hari Ini)</option>
                    <option value="Rendah">⚪ Rendah (Persiapan Cadangan)</option>
                  </select>
                </div>
              </div>

              {/* Unit Kerja & Ruangan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Unit Kerja Pemohon <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={unitKerja}
                    onChange={e => setUnitKerja(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Fungsi Statistik Sosial">Fungsi Statistik Sosial</option>
                    <option value="Fungsi Statistik Produksi">Fungsi Statistik Produksi</option>
                    <option value="Fungsi Statistik Distribusi">Fungsi Statistik Distribusi</option>
                    <option value="Fungsi Neraca Wilayah">Fungsi Neraca Wilayah (Nerwilis)</option>
                    <option value="Fungsi IPDS & TI">Fungsi IPDS & TI</option>
                    <option value="Subbagian Umum">Subbagian Umum (Tata Usaha)</option>
                    <option value="Pelayanan Statistik Terpadu">Pelayanan Statistik Terpadu (PST)</option>
                    <option value="Pimpinan / Kepala BPS">Pimpinan / Kepala BPS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Ruangan Kerja Tujuan
                  </label>
                  <select
                    value={ruangan}
                    onChange={e => setRuangan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {rooms.map(r => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Keperluan */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Keperluan Penggunaan / Uraian Tugas <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={keperluan}
                  onChange={e => setKeperluan(e.target.value)}
                  placeholder="Misal: Pelaksanaan Survei Biaya Hidup (SBH) / Rapat Koordinasi..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                ></textarea>
              </div>

              {/* Catatan Tambahan */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  placeholder="Dibutuhkan sebelum pukul 14.00 WITA..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                />
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
              form="stockRequestForm"
              disabled={!selectedItem || requestedNum <= 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                !selectedItem || requestedNum <= 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>Kirim Formulir Permohonan</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
