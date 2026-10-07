import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { BmnAsset } from '../../types';
import { getAssetPhotoUrl } from '../../utils/assetImages';
import {
  X,
  Printer,
  QrCode,
  ShieldCheck,
  Calendar,
  Building,
  User,
  Wrench,
  ArrowRightLeft,
  FileText,
  Clock,
  Sparkles,
  Camera,
  UploadCloud,
  Image as ImageIcon,
  Check
} from 'lucide-react';

export const AssetDetailModal: React.FC<{
  asset: BmnAsset | null;
  onClose: () => void;
  onOpenMaintenance?: (asset: BmnAsset) => void;
  onOpenMovement?: (asset: BmnAsset) => void;
}> = ({ asset, onClose, onOpenMaintenance, onOpenMovement }) => {
  const { movements, maintenances, updateAsset } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoUpdated, setIsPhotoUpdated] = useState(false);

  if (!asset) return null;

  const currentPhoto = photoPreview || asset.fotoUrl || getAssetPhotoUrl(asset.namaBarang, asset.kategori);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPhotoPreview(result);
      updateAsset(asset.id, { fotoUrl: result });
      setIsPhotoUpdated(true);
      setTimeout(() => setIsPhotoUpdated(false), 2500);
    };
    reader.readAsDataURL(file);
  };

  const assetMovements = movements.filter(m => m.assetId === asset.id || m.nup === asset.nup);
  const assetMaintenances = maintenances.filter(m => m.assetId === asset.id || m.nup === asset.nup);

  const handlePrintLabel = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              NUP {asset.nup}
            </span>
            <h3 className="text-sm font-bold text-white truncate max-w-md">{asset.namaBarang}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintLabel}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Label BMN</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left: Photo & QR/Barcode Card */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex flex-col items-center space-y-4">
              {/* Asset Real Photo Card */}
              <div className="w-full relative group">
                <div className="w-full h-44 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center relative">
                  <img
                    src={currentPhoto}
                    alt={asset.namaBarang}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getAssetPhotoUrl(asset.namaBarang, asset.kategori);
                    }}
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 text-[10px] font-semibold text-slate-200">
                    Foto Fisik BMN
                  </div>
                  <div className="absolute bottom-2 right-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shadow-md ${
                      asset.kondisi === 'Baik' ? 'bg-emerald-500/90 text-white' :
                      asset.kondisi === 'Rusak Ringan' ? 'bg-amber-500/90 text-white' :
                      'bg-rose-500/90 text-white'
                    }`}>
                      {asset.kondisi}
                    </span>
                  </div>
                </div>

                {/* Upload / Change Photo Action */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 w-full py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
                >
                  <Camera className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isPhotoUpdated ? '✓ Foto Diperbarui' : 'Ganti / Unggah Foto'}</span>
                </button>
              </div>

              {/* Simulated QR Code with BPS Branding */}
              <div className="w-32 h-32 bg-white p-2 rounded-xl flex flex-col items-center justify-center shadow-md relative">
                <div className="w-full h-full border-2 border-slate-900 p-1 flex flex-col justify-between">
                  <div className="flex justify-between">
                    <div className="w-6 h-6 bg-slate-950 border border-white"></div>
                    <div className="w-6 h-6 bg-slate-950 border border-white"></div>
                  </div>
                  <div className="text-[7px] font-mono font-black text-slate-900 text-center tracking-tight">
                    BPS 7106
                  </div>
                  <div className="flex justify-between">
                    <div className="w-6 h-6 bg-slate-950 border border-white"></div>
                    <div className="w-3 h-3 bg-slate-950 self-end"></div>
                  </div>
                </div>
              </div>

              {/* Barcode representation */}
              <div className="w-full bg-white text-slate-950 p-2 rounded-lg font-mono text-center">
                <div className="h-5 flex items-center justify-center gap-0.5">
                  <span className="w-0.5 h-full bg-slate-950"></span>
                  <span className="w-1.5 h-full bg-slate-950"></span>
                  <span className="w-0.5 h-full bg-slate-950"></span>
                  <span className="w-1 h-full bg-slate-950"></span>
                  <span className="w-0.5 h-full bg-slate-950"></span>
                  <span className="w-2 h-full bg-slate-950"></span>
                  <span className="w-1 h-full bg-slate-950"></span>
                  <span className="w-0.5 h-full bg-slate-950"></span>
                  <span className="w-1.5 h-full bg-slate-950"></span>
                  <span className="w-0.5 h-full bg-slate-950"></span>
                </div>
                <div className="text-[9px] tracking-widest mt-0.5 font-bold">{asset.barcode}</div>
              </div>
            </div>

            {/* Right: Technical Specifications */}
            <div className="md:col-span-2 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Kode Barang</span>
                  <span className="font-mono text-white font-bold mt-0.5 block">{asset.kodeBarang}</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Nomor Urut Pendaftaran</span>
                  <span className="font-mono text-cyan-400 font-bold mt-0.5 block">NUP {asset.nup}</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Merk / Tipe</span>
                  <span className="text-white font-medium mt-0.5 block">{asset.merkType}</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Nomor Seri Pabrik</span>
                  <span className="font-mono text-slate-300 mt-0.5 block">{asset.nomorSeri}</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Kondisi Fisik</span>
                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold ${
                    asset.kondisi === 'Baik' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    asset.kondisi === 'Rusak Ringan' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {asset.kondisi}
                  </span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Status Operasional</span>
                  <span className="text-blue-300 font-medium mt-0.5 block">{asset.status}</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Lokasi Gedung & Ruang</span>
                  <span className="text-white font-medium mt-0.5 block">{asset.ruanganNama}</span>
                  <span className="text-[10px] text-slate-400">{asset.gedung}</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Penanggung Jawab</span>
                  <span className="text-white font-medium mt-0.5 block">{asset.penanggungJawab}</span>
                </div>
              </div>

              {/* Valuation Row */}
              <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 grid grid-cols-3 gap-2 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 block">Nilai Perolehan</span>
                  <span className="text-xs font-bold text-white mt-0.5 block">
                    Rp {asset.nilaiPerolehan.toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Akumulasi Penyusutan</span>
                  <span className="text-xs font-bold text-rose-400 mt-0.5 block">
                    - Rp {asset.akumulasiPenyusutan.toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Nilai Buku Saat Ini</span>
                  <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                    Rp {asset.nilaiBuku.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabbed Activity Histories */}
          <div className="space-y-4 pt-2">
            {/* History 1: Pemeliharaan */}
            <div>
              <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-300">
                <Wrench className="w-4 h-4 text-amber-400" />
                <span>Riwayat Pemeliharaan & Perawatan ({assetMaintenances.length})</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {assetMaintenances.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400 bg-slate-950/40 rounded-xl">
                    Belum ada catatan pemeliharaan untuk aset ini.
                  </div>
                ) : (
                  assetMaintenances.map(m => (
                    <div key={m.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">{m.jenisPemeliharaan}</div>
                        <div className="text-[10px] text-slate-400">
                          {m.tanggalMulai} • Vendor: {m.vendor} • Teknisi: {m.teknisi}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-amber-400 font-bold block">Rp {m.biaya.toLocaleString('id-ID')}</span>
                        <span className="text-[10px] text-slate-400">{m.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* History 2: Mutasi / Pemindahan */}
            <div>
              <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-300">
                <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                <span>Riwayat Pemindahan Ruangan ({assetMovements.length})</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {assetMovements.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400 bg-slate-950/40 rounded-xl">
                    Aset belum pernah mengalami pemindahan ruangan.
                  </div>
                ) : (
                  assetMovements.map(m => (
                    <div key={m.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">
                          {m.lokasiAsalNama} → <span className="text-cyan-400">{m.lokasiTujuanNama}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {m.tanggal} • Pemohon: {m.pemohon} • {m.alasan}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {m.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Terdaftar di SIMAN BPS Minahasa Utara
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
