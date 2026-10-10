import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StockInTransaction } from '../../types';
import { Inbox, X, Check } from 'lucide-react';

export const StockInModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  defaultItemId?: string;
  initialTransaction?: StockInTransaction | null;
}> = ({ isOpen, onClose, defaultItemId, initialTransaction }) => {
  const { inventoryItems, addStockIn, updateStockIn } = useApp();

  const [selectedItemId, setSelectedItemId] = useState(initialTransaction?.itemId || defaultItemId || inventoryItems[0]?.id || '');
  const [jumlah, setJumlah] = useState(String(initialTransaction?.jumlah ?? 20));
  const [nomorDokumen, setNomorDokumen] = useState(initialTransaction?.nomorDokumen || '');
  const [sumber, setSumber] = useState(initialTransaction?.sumber || 'DIPA BPS Minut TA 2026');
  const [hargaSatuan, setHargaSatuan] = useState(initialTransaction ? String(initialTransaction.hargaSatuan) : '');
  const [keterangan, setKeterangan] = useState(initialTransaction?.keterangan || 'Penerimaan pengadaan persediaan rutin kantor');
  const [tanggal, setTanggal] = useState(initialTransaction?.tanggal || (() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  })());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedItemId(initialTransaction?.itemId || defaultItemId || inventoryItems[0]?.id || '');
    setJumlah(String(initialTransaction?.jumlah ?? 20));
    setNomorDokumen(initialTransaction?.nomorDokumen || '');
    setSumber(initialTransaction?.sumber || 'DIPA BPS Minut TA 2026');
    setHargaSatuan(initialTransaction ? String(initialTransaction.hargaSatuan) : '');
    setKeterangan(initialTransaction?.keterangan || 'Penerimaan pengadaan persediaan rutin kantor');
    setTanggal(initialTransaction?.tanggal || (() => {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    })());
    setFeedback(null);
    setIsSaving(false);
    saveLock.current = false;
  }, [isOpen, initialTransaction, defaultItemId, inventoryItems]);

  if (!isOpen) return null;

  const currentItem = inventoryItems.find(i => i.id === selectedItemId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saveLock.current) return;
    const qty = Number(jumlah);
    const price = hargaSatuan === '' ? undefined : Number(hargaSatuan);
    if (!selectedItemId || !Number.isFinite(qty) || qty <= 0) {
      setFeedback({ type: 'error', message: 'Pilih barang dan isi jumlah lebih besar dari 0.' });
      return;
    }
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      setFeedback({ type: 'error', message: 'Harga satuan tidak valid.' });
      return;
    }
    saveLock.current = true;
    setIsSaving(true);
    const data = {
      itemId: selectedItemId,
      jumlah: qty,
      nomorDokumen,
      sumber,
      keterangan,
      hargaSatuan: price,
      tanggal
    };
    const res = initialTransaction
      ? updateStockIn(initialTransaction.id, data)
      : addStockIn(data);
    setFeedback({ type: res.success ? 'success' : 'error', message: res.message });
    if (res.success) {
      window.setTimeout(onClose, 1200);
    } else {
      saveLock.current = false;
      setIsSaving(false);
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
              <h3 className="text-sm font-bold text-white">{initialTransaction ? 'Edit Barang Masuk' : 'Transaksi Barang Masuk (Penerimaan)'}</h3>
              <p className="text-[11px] text-slate-400">Stok bertambah setelah pemeriksaan dan verifikasi penerimaan</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className={`mx-5 mt-4 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`} role="status">
            {feedback.type === 'success' && <Check className="w-4 h-4 text-emerald-400" />}
            <span>{feedback.message}</span>
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
              required
              onChange={e => {
                setSelectedItemId(e.target.value);
                const item = inventoryItems.find(i => i.id === e.target.value);
                if (item) setHargaSatuan(String(item.hargaSatuan));
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="" disabled>Pilih barang persediaan</option>
              {inventoryItems.map(item => (
                <option key={item.id} value={item.id}>
                  [{item.jenis}] {item.nama} - Stok saat ini: {item.stokSaatIni} {item.satuan} ({item.rak})
                </option>
              ))}
            </select>
            {inventoryItems.length === 0 && <p className="mt-1 text-[10px] text-amber-300">Tambahkan master persediaan sebelum mencatat penerimaan.</p>}
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
                step="any"
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
                min="0"
                step="any"
                value={hargaSatuan !== '' ? hargaSatuan : (currentItem ? currentItem.hargaSatuan : '')}
                onChange={e => setHargaSatuan(e.target.value)}
                placeholder="Harga pengadaan..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Tanggal Penerimaan <span className="text-rose-400">*</span></label>
              <input
                type="date"
                required
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
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
              disabled={isSaving || !inventoryItems.length}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Menyimpan...' : initialTransaction ? 'Simpan Perubahan' : 'Simpan Penerimaan Barang'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
