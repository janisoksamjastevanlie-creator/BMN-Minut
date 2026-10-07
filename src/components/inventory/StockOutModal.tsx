import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Send, X, Check, AlertTriangle } from 'lucide-react';

export const StockOutModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  defaultItemId?: string;
}> = ({ isOpen, onClose, defaultItemId }) => {
  const { inventoryItems, addStockOut, rooms } = useApp();

  const [selectedItemId, setSelectedItemId] = useState(defaultItemId || inventoryItems[0]?.id || '');
  const [jumlah, setJumlah] = useState('5');
  const [unitKerja, setUnitKerja] = useState('Fungsi Statistik Sosial');
  const [ruangan, setRuangan] = useState('Ruang Statistik Sosial');
  const [pemohon, setPemohon] = useState('Michael Wowor, S.Si');
  const [keperluan, setKeperluan] = useState('Pelaksanaan survei lapangan Susenas Maret 2026');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentItem = inventoryItems.find(i => i.id === selectedItemId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const qty = Number(jumlah);
    if (!selectedItemId || qty <= 0) return;

    if (currentItem && qty > currentItem.stokSaatIni) {
      setErrorMessage(`Gagal! Stok ${currentItem.nama} hanya ${currentItem.stokSaatIni} ${currentItem.satuan}. Pengeluaran ${qty} melebihi batas.`);
      return;
    }

    const res = addStockOut({
      itemId: selectedItemId,
      jumlah: qty,
      unitKerja,
      ruangan,
      pemohon,
      keperluan
    });

    if (res.success) {
      setSuccessMessage(res.message);
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } else {
      setErrorMessage(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Transaksi Barang Keluar (Pengeluaran)</h3>
              <p className="text-[11px] text-slate-400">Stok persediaan akan otomatis berkurang secara real-time</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Pilih Barang yang Dikeluarkan <span className="text-rose-400">*</span>
            </label>
            <select
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {inventoryItems.map(item => (
                <option key={item.id} value={item.id} disabled={item.stokSaatIni === 0}>
                  [{item.jenis}] {item.nama} - Stok: {item.stokSaatIni} {item.satuan} {item.stokSaatIni === 0 ? '(HABIS)' : ''}
                </option>
              ))}
            </select>
          </div>

          {currentItem && (
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Lokasi Penyimpanan:</span>
                <span className="font-mono text-cyan-400 font-bold">{currentItem.binCode} ({currentItem.rak})</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Stok Tersedia:</span>
                <span className={`font-bold ${currentItem.stokSaatIni <= currentItem.stokMinimum ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {currentItem.stokSaatIni} {currentItem.satuan}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Jumlah Dikeluarkan <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={currentItem ? currentItem.stokSaatIni : undefined}
                required
                value={jumlah}
                onChange={e => setJumlah(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Unit Kerja / Seksi Penerima
              </label>
              <select
                value={unitKerja}
                onChange={e => setUnitKerja(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Bagian Tata Usaha">Bagian Tata Usaha</option>
                <option value="Subbagian Umum">Subbagian Umum</option>
                <option value="Fungsi Statistik Sosial">Fungsi Statistik Sosial</option>
                <option value="Fungsi Statistik Produksi">Fungsi Statistik Produksi</option>
                <option value="Fungsi Statistik Distribusi">Fungsi Statistik Distribusi</option>
                <option value="Fungsi Neraca Wilayah">Fungsi Neraca Wilayah</option>
                <option value="Fungsi IPDS & TI">Fungsi IPDS & TI</option>
                <option value="Pelayanan Statistik Terpadu">Pelayanan Statistik Terpadu</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Ruangan Penempatan
              </label>
              <select
                value={ruangan}
                onChange={e => setRuangan(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              >
                {rooms.map(r => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Nama Pemohon / Penerima
              </label>
              <input
                type="text"
                required
                value={pemohon}
                onChange={e => setPemohon(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Keperluan Penggunaan Barang
            </label>
            <input
              type="text"
              required
              value={keperluan}
              onChange={e => setKeperluan(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
            >
              <Check className="w-4 h-4" />
              <span>Proses Barang Keluar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
