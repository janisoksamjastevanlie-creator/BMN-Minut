import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { InventoryItem, InventoryType } from '../../types';
import { X, Boxes, Check, Camera, Upload, Image as ImageIcon } from 'lucide-react';

export const InventoryFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialItem?: InventoryItem | null;
}> = ({ isOpen, onClose, initialItem }) => {
  const { addInventoryItem, updateInventoryItem } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kodeBarang, setKodeBarang] = useState(initialItem?.kodeBarang || '');
  const [nama, setNama] = useState(initialItem?.nama || '');
  const [jenis, setJenis] = useState<InventoryType>(initialItem?.jenis || 'ATK');
  const [kategori, setKategori] = useState(initialItem?.kategori || '');
  const [subkategori, setSubkategori] = useState(initialItem?.subkategori || '');
  const [satuan, setSatuan] = useState(initialItem?.satuan || '');
  const [stokSaatIni, setStokSaatIni] = useState(initialItem ? String(initialItem.stokSaatIni) : '');
  const [stokMinimum, setStokMinimum] = useState(initialItem ? String(initialItem.stokMinimum) : '');
  const [stokMaksimum, setStokMaksimum] = useState(initialItem ? String(initialItem.stokMaksimum) : '');
  const [hargaSatuan, setHargaSatuan] = useState(initialItem ? String(initialItem.hargaSatuan) : '');
  const [rataRata, setRataRata] = useState(initialItem ? String(initialItem.ratarataPenggunaanBulanan) : '');
  const [lokasiGudang, setLokasiGudang] = useState(initialItem?.lokasiGudang || '');
  const [rak, setRak] = useState(initialItem?.rak || '');
  const [shelf, setShelf] = useState(initialItem?.shelf || '');
  const [binCode, setBinCode] = useState(initialItem?.binCode || '');
  const [barcode, setBarcode] = useState(initialItem?.barcode || '');
  const [fotoUrl, setFotoUrl] = useState(initialItem?.fotoUrl || '');

  if (!isOpen) return null;

  const currentPreviewPhoto = fotoUrl;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setFotoUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericValues = [stokSaatIni, stokMinimum, stokMaksimum, hargaSatuan, rataRata].map(Number);
    if (!kodeBarang.trim() || !nama.trim() || !kategori.trim() || !subkategori.trim() ||
        !satuan.trim() || numericValues.some(value => !Number.isFinite(value) || value < 0)) return;

    const [currentStockNum, minStockNum, maxStockNum, priceNum, averageNum] = numericValues;
    if (![currentStockNum, minStockNum, maxStockNum, averageNum].every(Number.isSafeInteger) ||
        minStockNum > maxStockNum) return;
    const finalPhoto = fotoUrl.trim() || initialItem?.fotoUrl || undefined;

    let status: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
    if (currentStockNum === 0) status = 'Habis';
    else if (currentStockNum <= minStockNum) status = 'Menipis';

    if (initialItem) {
      updateInventoryItem(initialItem.id, {
        kodeBarang: kodeBarang.trim(),
        nama,
        jenis,
        kategori,
        subkategori,
        satuan,
        stokSaatIni: currentStockNum,
        stokMinimum: minStockNum,
        stokMaksimum: maxStockNum,
        hargaSatuan: priceNum,
        ratarataPenggunaanBulanan: averageNum,
        lokasiGudang,
        rak,
        shelf,
        binCode,
        barcode: barcode.trim(),
        fotoUrl: finalPhoto
      }, { recordStockAdjustment: true });
    } else {
      addInventoryItem({
        kodeBarang: kodeBarang.trim(),
        nama,
        kategori: kategori.trim(),
        subkategori,
        jenis,
        satuan,
        stokAwal: currentStockNum,
        stokSaatIni: currentStockNum,
        stokMinimum: minStockNum,
        stokMaksimum: maxStockNum,
        hargaSatuan: priceNum,
        totalNilai: currentStockNum * priceNum,
        lokasiGudang,
        rak,
        shelf,
        binCode,
        barcode: barcode.trim(),
        status,
        ratarataPenggunaanBulanan: averageNum,
        fotoUrl: finalPhoto
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white">
              {initialItem ? 'Edit Master Barang Persediaan' : 'Tambah Barang Persediaan Baru (ATK/ARK)'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Kode Barang Persediaan <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={50}
              value={kodeBarang}
              onChange={e => setKodeBarang(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Nama Barang */}
          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Nama Barang Persediaan <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={nama}
              onChange={e => setNama(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Jenis & Subkategori */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Jenis Persediaan</label>
              <select
                value={jenis}
                onChange={e => {
                  const j = e.target.value as InventoryType;
                  setJenis(j);
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="ATK">ATK (Alat Tulis Kantor)</option>
                <option value="ARK">ARK (Alat Rumah Tangga / Kebersihan)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kategori Persediaan <span className="text-rose-400">*</span></label>
              <input
                type="text"
                required
                maxLength={100}
                value={kategori}
                onChange={e => setKategori(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">Subkategori / Kelompok <span className="text-rose-400">*</span></label>
              <select
                value={subkategori}
                required
                onChange={e => setSubkategori(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Pilih subkategori</option>
                {jenis === 'ATK' ? (
                  <>
                    <option value="Kertas & Kebutuhan Cetak">Kertas & Kebutuhan Cetak</option>
                    <option value="Alat Tulis Kantor">Alat Tulis Kantor</option>
                    <option value="Ordner & Pengarsipan">Ordner & Pengarsipan</option>
                    <option value="Perlengkapan Meja">Perlengkapan Meja</option>
                    <option value="Pita Perekat & Lakban">Pita Perekat & Lakban</option>
                    <option value="Tinta & Toner Komputer">Tinta & Toner Komputer</option>
                    <option value="Kebutuhan Surat Menyurat">Kebutuhan Surat Menyurat</option>
                  </>
                ) : (
                  <>
                    <option value="Perlengkapan Sanitasi">Perlengkapan Sanitasi</option>
                    <option value="Sabun & Disinfektan">Sabun & Disinfektan</option>
                    <option value="Kebersihan Gedung">Kebersihan Gedung</option>
                    <option value="Alat Kebersihan">Alat Kebersihan</option>
                    <option value="Pengelolaan Sampah">Pengelolaan Sampah</option>
                    <option value="Aroma & Penyegar">Aroma & Penyegar</option>
                    <option value="Pantry & Dapur Kantor">Pantry & Dapur Kantor</option>
                  </>
                )}
              </select>
          </div>

          {/* Satuan & Harga Satuan */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Satuan Hitung</label>
              <select
                value={satuan}
                required
                onChange={e => setSatuan(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Pilih satuan</option>
                <option value="Rim">Rim</option>
                <option value="Pcs">Pcs</option>
                <option value="Lusin">Lusin</option>
                <option value="Box">Box</option>
                <option value="Pak">Pak</option>
                <option value="Botol">Botol</option>
                <option value="Pouch">Pouch</option>
                <option value="Roll">Roll</option>
                <option value="Set">Set</option>
                <option value="Kg">Kg</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Harga Satuan (Rp)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={hargaSatuan}
                onChange={e => setHargaSatuan(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Stok Levels */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Stok Fisik Saat Ini</label>
              <input
                type="number"
                min="0"
                required
                value={stokSaatIni}
                onChange={e => setStokSaatIni(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Stok Minimum</label>
              <input
                type="number"
                min="0"
                required
                value={stokMinimum}
                onChange={e => setStokMinimum(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Stok Maksimum</label>
              <input
                type="number"
                min="0"
                required
                value={stokMaksimum}
                onChange={e => setStokMaksimum(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">Rata-rata Pemakaian Bulanan</label>
            <input
              type="number"
              min="0"
              required
              value={rataRata}
              onChange={e => setRataRata(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Lokasi Gudang & Bin */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nama Gudang</label>
              <input
                type="text"
                maxLength={100}
                value={lokasiGudang}
                onChange={e => setLokasiGudang(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kode Rak</label>
              <input
                type="text"
                maxLength={30}
                value={rak}
                onChange={e => setRak(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kode Shelf</label>
              <input
                type="text"
                maxLength={30}
                value={shelf}
                onChange={e => setShelf(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kode Bin</label>
              <input
                type="text"
                maxLength={50}
                value={binCode}
                onChange={e => setBinCode(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">Barcode (opsional)</label>
            <input
              type="text"
              maxLength={100}
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Foto Produk Persediaan */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Foto Produk / Barang Persediaan</span>
              </label>
              {currentPreviewPhoto && (
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>Foto Terpasang</span>
                </span>
              )}
            </div>

            <div className="flex items-start gap-3">
              {/* Photo Preview Thumbnail */}
              <div className="w-20 h-20 rounded-xl bg-slate-900 border border-slate-700/80 overflow-hidden shrink-0 flex items-center justify-center relative">
                {currentPreviewPhoto ? (
                  <img
                    src={currentPreviewPhoto}
                    alt="Preview Persediaan"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      setFotoUrl('');
                    }}
                  />
                ) : (
                  <div className="text-center p-1 text-slate-500 text-[10px] flex flex-col items-center">
                    <Camera className="w-5 h-5 mb-0.5 text-slate-600" />
                    <span>Belum ada</span>
                  </div>
                )}
              </div>

              {/* Upload & Preset Options */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-emerald-500/30"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Unggah File Foto</span>
                  </button>

                </div>

                <input
                  type="url"
                  value={fotoUrl}
                  onChange={e => setFotoUrl(e.target.value)}
                  placeholder="Atau tempel URL foto (https://...)"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-300 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
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
              <span>{initialItem ? 'Simpan Perubahan' : 'Tambahkan ke Master Persediaan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
