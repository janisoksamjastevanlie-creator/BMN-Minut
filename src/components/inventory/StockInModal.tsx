import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { InventoryItem } from '../../types';
import { Inbox, X, Check, FileText, Plus, Printer } from 'lucide-react';

export const StockInModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  defaultItemId?: string;
}> = ({ isOpen, onClose, defaultItemId }) => {
  const { inventoryItems, addStockIn } = useApp();

  const [selectedItemId, setSelectedItemId] = useState(defaultItemId || inventoryItems[0]?.id || '');
  const [jumlah, setJumlah] = useState('20');
  const [nomorDokumen, setNomorDokumen] = useState(`BAST-PENGADAAN/No.241/SPK/2026`);
  const [sumber, setSumber] = useState('DIPA BPS Minut TA 2026');
  const [hargaSatuan, setHargaSatuan] = useState('');
  const [keterangan, setKeterangan] = useState('Penerimaan pengadaan persediaan rutin kantor');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentItem = inventoryItems.find(i => i.id === selectedItemId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(jumlah);
    if (!selectedItemId || qty <= 0) return;

    const res = addStockIn({
      itemId: selectedItemId,
      jumlah: qty,
      nomorDokumen,
      sumber,
      keterangan,
      hargaSatuan: hargaSatuan ? Number(hargaSatuan) : undefined
    });

    if (res.success) {
      setFeedback(res.message);
      setTimeout(() => {
        setFeedback(null);
        onClose();
      }, 1200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Transaksi Barang Masuk (Penerimaan)</h3>
              <p className="text-[11px] text-slate-400">Stok persediaan akan otomatis bertambah secara real-time</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Pilih Barang Persediaan (ATK / ARK) <span className="text-rose-400">*</span>
            </label>
            <select
              value={selectedItemId}
              onChange={e => {
                setSelectedItemId(e.target.value);
                const item = inventoryItems.find(i => i.id === e.target.value);
                if (item) setHargaSatuan(String(item.hargaSatuan));
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {inventoryItems.map(item => (
                <option key={item.id} value={item.id}>
                  [{item.jenis}] {item.nama} - Stok saat ini: {item.stokSaatIni} {item.satuan} ({item.rak})
                </option>
              ))}
            </select>
          </div>

          {currentItem && (
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Lokasi Rak & Bin:</span>
                <span className="font-mono text-cyan-400 font-bold">{currentItem.binCode} ({currentItem.rak})</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Stok Saat Ini:</span>
                <span className="font-bold text-white">{currentItem.stokSaatIni} {currentItem.satuan}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Jumlah Masuk <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={jumlah}
                onChange={e => setJumlah(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Harga Satuan (Rp)
              </label>
              <input
                type="number"
                value={hargaSatuan || (currentItem ? currentItem.hargaSatuan : '')}
                onChange={e => setHargaSatuan(e.target.value)}
                placeholder="Harga pengadaan..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Nomor Bukti / Dokumen / BAST
              </label>
              <input
                type="text"
                required
                value={nomorDokumen}
                onChange={e => setNomorDokumen(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Sumber Anggaran / Perolehan
              </label>
              <input
                type="text"
                value={sumber}
                onChange={e => setSumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Keterangan Penerimaan
            </label>
            <input
              type="text"
              value={keterangan}
              onChange={e => setKeterangan(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              <Check className="w-4 h-4" />
              <span>Simpan Penerimaan Barang</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
