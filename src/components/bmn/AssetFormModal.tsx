import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { BmnAsset, AssetCondition } from '../../types';
import { getAssetPhotoUrl, ASSET_PHOTO_PRESETS } from '../../utils/assetImages';
import { X, Box, PlusCircle, Check, Camera, Image as ImageIcon, Upload } from 'lucide-react';

export const AssetFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialAsset?: BmnAsset | null;
}> = ({ isOpen, onClose, initialAsset }) => {
  const { rooms, assets, addAsset, updateAsset } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [namaBarang, setNamaBarang] = useState(initialAsset?.namaBarang || '');
  const [kategori, setKategori] = useState(initialAsset?.kategori || 'Peralatan TI');
  const [subkategori, setSubkategori] = useState(initialAsset?.subkategori || 'Komputer Jinjing');
  const [merkType, setMerkType] = useState(initialAsset?.merkType || '');
  const [nomorSeri, setNomorSeri] = useState(initialAsset?.nomorSeri || '');
  const [nilaiPerolehan, setNilaiPerolehan] = useState(initialAsset?.nilaiPerolehan ? String(initialAsset.nilaiPerolehan) : '15000000');
  const [kondisi, setKondisi] = useState<AssetCondition>(initialAsset?.kondisi || 'Baik');
  const [ruanganId, setRuanganId] = useState(initialAsset?.ruanganId || rooms[0]?.id || '');
  const [penanggungJawab, setPenanggungJawab] = useState(initialAsset?.penanggungJawab || rooms[0]?.picName || '');
  const [tahunPerolehan, setTahunPerolehan] = useState(initialAsset?.tahunPerolehan || 2026);
  const [fotoUrl, setFotoUrl] = useState(initialAsset?.fotoUrl || '');

  if (!isOpen) return null;

  const currentPreviewPhoto = fotoUrl || (namaBarang ? getAssetPhotoUrl(namaBarang, kategori) : '');

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
    if (!namaBarang.trim()) return;

    const selectedRoom = rooms.find(r => r.id === ruanganId) || rooms[0];
    const val = Number(nilaiPerolehan) || 0;
    const nup = initialAsset ? initialAsset.nup : assets.length + 1;
    const kodeBarang = '3.10.01.02.001';
    const finalPhoto = fotoUrl.trim() || getAssetPhotoUrl(namaBarang, kategori);

    if (initialAsset) {
      updateAsset(initialAsset.id, {
        namaBarang,
        kategori,
        subkategori,
        merkType,
        nomorSeri,
        nilaiPerolehan: val,
        nilaiBuku: val - (initialAsset.akumulasiPenyusutan || 0),
        kondisi,
        ruanganId: selectedRoom.id,
        ruanganNama: selectedRoom.name,
        gedung: selectedRoom.building,
        penanggungJawab,
        fotoUrl: finalPhoto
      });
    } else {
      addAsset({
        kodeBarang,
        nup,
        namaBarang,
        kategori,
        subkategori,
        merkType,
        nomorSeri: nomorSeri || `SN-BPS7106-${Math.floor(1000 + Math.random() * 9000)}`,
        tanggalPerolehan: new Date().toISOString().split('T')[0],
        tahunPerolehan: Number(tahunPerolehan),
        jumlah: 1,
        satuan: 'Unit',
        nilaiPerolehan: val,
        akumulasiPenyusutan: 0,
        nilaiBuku: val,
        kondisi,
        gedung: selectedRoom.building,
        ruanganId: selectedRoom.id,
        ruanganNama: selectedRoom.name,
        penanggungJawab: penanggungJawab || selectedRoom.picName,
        status: 'Aktif',
        fotoUrl: finalPhoto,
        barcode: `710631001${String(nup).padStart(4, '0')}`,
        keterangan: 'Aset BMN baru terdaftar pada DIPA BPS Minut'
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
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Box className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white">
              {initialAsset ? 'Edit Data Aset BMN' : 'Tambah Aset BMN Baru'}
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
              Nama Barang / Aset BMN <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={namaBarang}
              onChange={e => setNamaBarang(e.target.value)}
              placeholder="Contoh: Laptop ASUS ExpertBook B1400"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kategori BMN</label>
              <select
                value={kategori}
                onChange={e => setKategori(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Peralatan TI">Peralatan TI</option>
                <option value="Peralatan Kantor">Peralatan Kantor</option>
                <option value="Mebel / Furnitur">Mebel / Furnitur</option>
                <option value="Kendaraan Bermotor">Kendaraan Bermotor</option>
                <option value="Peralatan Khusus">Peralatan Khusus</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Merk & Tipe</label>
              <input
                type="text"
                value={merkType}
                onChange={e => setMerkType(e.target.value)}
                placeholder="Contoh: Lenovo ThinkPad L14"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nomor Seri Pabrik</label>
              <input
                type="text"
                value={nomorSeri}
                onChange={e => setNomorSeri(e.target.value)}
                placeholder="Contoh: SN-84920491"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nilai Perolehan (Rp)</label>
              <input
                type="number"
                value={nilaiPerolehan}
                onChange={e => setNilaiPerolehan(e.target.value)}
                placeholder="15000000"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kondisi Awal</label>
              <select
                value={kondisi}
                onChange={e => setKondisi(e.target.value as AssetCondition)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Baik">Baik (100% Layak)</option>
                <option value="Rusak Ringan">Rusak Ringan</option>
                <option value="Rusak Berat">Rusak Berat</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Penempatan Ruangan</label>
              <select
                value={ruanganId}
                onChange={e => {
                  const rId = e.target.value;
                  setRuanganId(rId);
                  const room = rooms.find(r => r.id === rId);
                  if (room) setPenanggungJawab(room.picName);
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              >
                {rooms.map(room => (
                  <option key={room.id} value={room.id}>
                    {room.name} ({room.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">Penanggung Jawab Aset</label>
            <input
              type="text"
              value={penanggungJawab}
              onChange={e => setPenanggungJawab(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Foto Fisik Aset */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                <span>Foto Fisik Barang / Aset BMN</span>
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
              <div className="w-20 h-20 rounded-xl bg-slate-900 border border-slate-700/80 overflow-hidden shrink-0 flex items-center justify-center relative group">
                {currentPreviewPhoto ? (
                  <img
                    src={currentPreviewPhoto}
                    alt="Preview Aset"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80';
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
                    className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-blue-500/30"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Unggah File Foto</span>
                  </button>

                  <select
                    onChange={(e) => {
                      if (e.target.value) setFotoUrl(e.target.value);
                    }}
                    defaultValue=""
                    className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="" disabled>Pilih Preset Foto BMN...</option>
                    {ASSET_PHOTO_PRESETS.map((p, idx) => (
                      <option key={idx} value={p.url}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <input
                  type="url"
                  value={fotoUrl}
                  onChange={e => setFotoUrl(e.target.value)}
                  placeholder="Atau tempel URL foto online (https://...)"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[11px] text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
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
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
            >
              <Check className="w-4 h-4" />
              <span>{initialAsset ? 'Simpan Perubahan' : 'Tambahkan ke SIMAN'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
