import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { InventoryItem, InventoryType } from '../../types';
import { getInventoryPhotoUrl, INVENTORY_PHOTO_PRESETS } from '../../utils/assetImages';
import { X, Boxes, Check, Camera, Upload, Image as ImageIcon } from 'lucide-react';

export const InventoryFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialItem?: InventoryItem | null;
}> = ({ isOpen, onClose, initialItem }) => {
  const { addInventoryItem, updateInventoryItem, warehouseRacks } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nama, setNama] = useState(initialItem?.nama || '');
  const [jenis, setJenis] = useState<InventoryType>(initialItem?.jenis || 'ATK');
  const [kategori, setKategori] = useState(initialItem?.kategori || 'Alat Tulis Kantor');
  const [subkategori, setSubkategori] = useState(initialItem?.subkategori || 'Kertas & Kebutuhan Cetak');
  const [satuan, setSatuan] = useState(initialItem?.satuan || 'Rim');
  const [stokSaatIni, setStokSaatIni] = useState(initialItem?.stokSaatIni ? String(initialItem.stokSaatIni) : '25');
  const [stokMinimum, setStokMinimum] = useState(initialItem?.stokMinimum ? String(initialItem.stokMinimum) : '10');
  const [stokMaksimum, setStokMaksimum] = useState(initialItem?.stokMaksimum ? String(initialItem.stokMaksimum) : '100');
  const [hargaSatuan, setHargaSatuan] = useState(initialItem?.hargaSatuan ? String(initialItem.hargaSatuan) : '55000');
  const [rak, setRak] = useState(initialItem?.rak || 'Rak A');
  const [binCode, setBinCode] = useState(initialItem?.binCode || 'WH-A-01-01');
  const [fotoUrl, setFotoUrl] = useState(initialItem?.fotoUrl || '');

  if (!isOpen) return null;

  const currentPreviewPhoto = fotoUrl || (nama ? getInventoryPhotoUrl(nama, subkategori, jenis) : '');

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
    if (!nama.trim()) return;

    const currentStockNum = parseInt(stokSaatIni, 10) || 0;
    const minStockNum = parseInt(stokMinimum, 10) || 5;
    const maxStockNum = parseInt(stokMaksimum, 10) || 100;
    const priceNum = parseInt(hargaSatuan, 10) || 0;
    const finalPhoto = fotoUrl.trim() || getInventoryPhotoUrl(nama, subkategori, jenis);

    let status: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
    if (currentStockNum === 0) status = 'Habis';
    else if (currentStockNum <= minStockNum) status = 'Menipis';

    if (initialItem) {
      updateInventoryItem(initialItem.id, {
        nama,
        jenis,
        kategori,
        subkategori,
        satuan,
        stokSaatIni: currentStockNum,
        stokMinimum: minStockNum,
        stokMaksimum: maxStockNum,
        hargaSatuan: priceNum,
        rak,
        binCode,
        fotoUrl: finalPhoto
      });
    } else {
      const codeSuffix = Math.floor(1000 + Math.random() * 9000);
      addInventoryItem({
        kodeBarang: `1.1.7.01.${jenis === 'ATK' ? '01' : '02'}.${codeSuffix}`,
        nama,
        kategori: jenis === 'ATK' ? 'Alat Tulis Kantor' : 'Alat Rumah Tangga Kantor',
        subkategori,
        jenis,
        satuan,
        stokAwal: currentStockNum,
        stokSaatIni: currentStockNum,
        stokMinimum: minStockNum,
        stokMaksimum: maxStockNum,
        hargaSatuan: priceNum,
        totalNilai: currentStockNum * priceNum,
        lokasiGudang: 'Gudang Persediaan BPS Minut',
        rak,
        shelf: 'Shelf 01',
        binCode,
        barcode: `89971060${jenis === 'ATK' ? '1' : '2'}${codeSuffix}`,
        status,
        ratarataPenggunaanBulanan: Math.round(minStockNum * 1.5),
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
              placeholder="Contoh: Kertas HVS Sinar Dunia A4 80gr"
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
                  if (j === 'ATK') {
                    setKategori('Alat Tulis Kantor');
                    setSubkategori('Kertas & Kebutuhan Cetak');
                    setRak('Rak A');
                  } else {
                    setKategori('Alat Rumah Tangga Kantor');
                    setSubkategori('Perlengkapan Sanitasi');
                    setRak('Rak D');
                  }
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="ATK">ATK (Alat Tulis Kantor)</option>
                <option value="ARK">ARK (Alat Rumah Tangga / Kebersihan)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Subkategori / Kelompok</label>
              <select
                value={subkategori}
                onChange={e => setSubkategori(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
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
          </div>

          {/* Satuan & Harga Satuan */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Satuan Hitung</label>
              <select
                value={satuan}
                onChange={e => setSatuan(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
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
                value={stokSaatIni}
                onChange={e => setStokSaatIni(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Stok Minimum</label>
              <input
                type="number"
                min="1"
                value={stokMinimum}
                onChange={e => setStokMinimum(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Stok Maksimum</label>
              <input
                type="number"
                min="1"
                value={stokMaksimum}
                onChange={e => setStokMaksimum(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Lokasi Gudang & Bin */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Lokasi Rak Gudang</label>
              <select
                value={rak}
                onChange={e => setRak(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {warehouseRacks.map(r => (
                  <option key={r.id} value={r.code}>{r.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kode Bin / Baris Rak</label>
              <input
                type="text"
                value={binCode}
                onChange={e => setBinCode(e.target.value)}
                placeholder="Misal: WH-A-01-05"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
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
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80';
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

                  <select
                    onChange={(e) => {
                      if (e.target.value) setFotoUrl(e.target.value);
                    }}
                    defaultValue=""
                    className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="" disabled>Pilih Preset Foto Persediaan...</option>
                    {INVENTORY_PHOTO_PRESETS.map((p, idx) => (
                      <option key={idx} value={p.url}>{p.label}</option>
                    ))}
                  </select>
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
