import React, { useState } from 'react';
import { BmnAsset } from '../../types';
import { triggerPrint } from '../../utils/printHelper';
import { X, Printer, QrCode, Tag, Sparkles, Check, Layers, Copy } from 'lucide-react';

export const AssetLabelPrintModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  asset: BmnAsset | null;
}> = ({ isOpen, onClose, asset }) => {
  const [layoutMode, setLayoutMode] = useState<'single' | 'grid4' | 'grid8'>('single');

  if (!isOpen || !asset) return null;

  const handlePrint = () => {
    triggerPrint({ title: `Stiker_Label_BMN_${asset.nup}_${asset.kodeBarang}_BPS_Minut`, orientation: 'label' });
  };

  // Helper component to render an individual official BMN sticker
  const renderSticker = (keyIndex: number) => (
    <div
      key={keyIndex}
      className="bmn-label-sticker border-2 border-slate-900 bg-white text-slate-950 p-3 sm:p-4 rounded-xl flex flex-col justify-between max-w-sm w-full mx-auto shadow-sm page-break-inside-avoid"
      style={{ minHeight: '210px' }}
    >
      {/* Kop Satker BMN */}
      <div className="border-b-2 border-slate-900 pb-1.5 flex items-center justify-between">
        <div>
          <div className="text-[9px] font-extrabold uppercase tracking-tight text-slate-800">
            BADAN PUSAT STATISTIK
          </div>
          <div className="text-[10px] font-black uppercase tracking-tight text-slate-950">
            KABUPATEN MINAHASA UTARA
          </div>
        </div>
        <div className="text-right">
          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-white font-bold">
            SATKER 7106
          </span>
          <div className="text-[8px] font-bold text-slate-700 uppercase mt-0.5">
            INVENTARIS BMN
          </div>
        </div>
      </div>

      {/* Main Body: QR Code + Barcode + Information */}
      <div className="py-2 grid grid-cols-3 gap-2 items-center">
        {/* Left: Vector QR Code */}
        <div className="flex flex-col items-center justify-center p-1 border border-slate-300 rounded bg-slate-50">
          <svg viewBox="0 0 100 100" className="w-16 h-16 fill-current text-slate-950">
            {/* Position markers */}
            <rect x="5" y="5" width="26" height="26" fill="black" />
            <rect x="9" y="9" width="18" height="18" fill="white" />
            <rect x="13" y="13" width="10" height="10" fill="black" />

            <rect x="69" y="5" width="26" height="26" fill="black" />
            <rect x="73" y="9" width="18" height="18" fill="white" />
            <rect x="77" y="13" width="10" height="10" fill="black" />

            <rect x="5" y="69" width="26" height="26" fill="black" />
            <rect x="9" y="73" width="18" height="18" fill="white" />
            <rect x="13" y="77" width="10" height="10" fill="black" />

            {/* Pattern data cells */}
            <rect x="36" y="8" width="6" height="6" fill="black" />
            <rect x="46" y="8" width="6" height="6" fill="black" />
            <rect x="56" y="14" width="6" height="6" fill="black" />
            <rect x="36" y="24" width="6" height="6" fill="black" />
            <rect x="50" y="24" width="6" height="6" fill="black" />

            <rect x="8" y="38" width="6" height="6" fill="black" />
            <rect x="18" y="46" width="6" height="6" fill="black" />
            <rect x="8" y="54" width="6" height="6" fill="black" />

            <rect x="36" y="38" width="8" height="8" fill="black" />
            <rect x="48" y="38" width="6" height="6" fill="black" />
            <rect x="58" y="44" width="6" height="6" fill="black" />
            <rect x="36" y="50" width="6" height="6" fill="black" />
            <rect x="46" y="54" width="8" height="8" fill="black" />

            <rect x="70" y="38" width="6" height="6" fill="black" />
            <rect x="82" y="44" width="8" height="8" fill="black" />
            <rect x="72" y="54" width="6" height="6" fill="black" />
            <rect x="86" y="58" width="6" height="6" fill="black" />

            <rect x="38" y="72" width="6" height="6" fill="black" />
            <rect x="50" y="76" width="8" height="8" fill="black" />
            <rect x="42" y="86" width="6" height="6" fill="black" />
            <rect x="70" y="74" width="8" height="8" fill="black" />
            <rect x="84" y="82" width="8" height="8" fill="black" />
          </svg>
          <span className="text-[7px] font-mono font-black text-slate-800 mt-0.5">
            BPS-7106
          </span>
        </div>

        {/* Right: Asset Metadata details */}
        <div className="col-span-2 text-[9.5px] leading-tight space-y-0.5">
          <div className="font-extrabold text-[11px] text-slate-950 truncate border-b border-slate-200 pb-0.5">
            {asset.namaBarang}
          </div>
          <div>
            <span className="text-slate-600">Kode Barang:</span>{' '}
            <strong className="font-mono text-slate-950">{asset.kodeBarang}</strong>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-600">NUP:</span>{' '}
            <span className="px-1.5 py-0.2 rounded bg-slate-950 text-white font-mono font-black text-[10px]">
              #{asset.nup}
            </span>
            <span className="text-slate-500 text-[8px] font-mono">({asset.tahunPerolehan})</span>
          </div>
          <div className="truncate">
            <span className="text-slate-600">Merk:</span>{' '}
            <span className="font-semibold text-slate-900">{asset.merkType || '-'}</span>
          </div>
          <div className="truncate">
            <span className="text-slate-600">Ruangan:</span>{' '}
            <span className="font-semibold text-slate-900">{asset.ruanganNama}</span>
          </div>
          <div className="truncate text-[8.5px]">
            <span className="text-slate-600">PIC:</span>{' '}
            <span className="text-slate-800">{asset.penanggungJawab}</span>
          </div>
        </div>
      </div>

      {/* Vector Barcode Strip */}
      <div className="border-t border-slate-200 pt-1.5 flex flex-col items-center">
        <div className="h-4 flex items-center justify-center gap-[1.5px] w-full">
          {[
            2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 1, 2, 4, 2, 1, 3, 1
          ].map((w, idx) => (
            <span
              key={idx}
              className={`h-full bg-slate-950 ${idx % 2 === 0 ? 'opacity-100' : 'opacity-0'}`}
              style={{ width: `${w * 1.5}px` }}
            />
          ))}
        </div>
        <div className="text-[8px] font-mono font-bold text-slate-900 tracking-widest mt-0.5">
          * {asset.barcode || `${asset.kodeBarang}.${asset.nup}`} *
        </div>
      </div>
    </div>
  );

  const getStickersCount = () => {
    if (layoutMode === 'grid4') return 4;
    if (layoutMode === 'grid8') return 8;
    return 1;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto printable-modal-overlay">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] printable-modal-card">
        {/* Top Controls Bar (Screen only) */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10 no-print">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Cetak Stiker Label Barcode & QR BMN</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                  NUP #{asset.nup}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Standar label fisik penatausahaan SIMAN SAKTI Kantor BPS Kabupaten Minahasa Utara
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/30"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Stiker (Print)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Layout Options Selector (Screen only) */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2 no-print">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>Format Lembar Cetak:</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLayoutMode('single')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                layoutMode === 'single'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              1 Stiker Tunggal
            </button>
            <button
              onClick={() => setLayoutMode('grid4')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                layoutMode === 'grid4'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Lembar 4 Stiker (2x2)
            </button>
            <button
              onClick={() => setLayoutMode('grid8')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                layoutMode === 'grid8'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Lembar 8 Stiker (4x2)
            </button>
          </div>
        </div>

        {/* Printable Stiker Sheet Area */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 bg-slate-950 print:bg-white print:p-0 flex items-center justify-center">
          <div
            className={`w-full ${
              layoutMode === 'single'
                ? 'max-w-sm'
                : layoutMode === 'grid4'
                ? 'grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl'
                : 'grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl'
            }`}
          >
            {Array.from({ length: getStickersCount() }).map((_, idx) => renderSticker(idx))}
          </div>
        </div>

        {/* Bottom Helper Note (Screen only) */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-[11px] text-slate-400 no-print">
          <span>
            💡 Tips: Untuk cetak pada kertas stiker label vinil/chromo, pilih ukuran kertas A4 pada dialog printer.
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
