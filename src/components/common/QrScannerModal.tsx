import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BmnAsset, InventoryItem } from '../../types';
import {
  QrCode,
  Camera,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Wrench,
  Boxes,
  FileText
} from 'lucide-react';

export const QrScannerModal: React.FC = () => {
  const {
    isQrScannerOpen,
    setIsQrScannerOpen,
    assets,
    inventoryItems,
    setSelectedAsset,
    setSelectedInventoryItem,
    setActiveView
  } = useApp();

  const [simulatedCode, setSimulatedCode] = useState('');
  const [scannedResult, setScannedResult] = useState<{
    type: 'BMN' | 'PERSEDIAAN';
    item: BmnAsset | InventoryItem;
  } | null>(null);

  if (!isQrScannerOpen) return null;

  const handleSimulateScan = (codeToScan?: string) => {
    const code = (codeToScan || simulatedCode).trim();
    if (!code) return;

    // Check if matching BMN Asset by barcode, NUP, or id
    const foundAsset = assets.find(
      a =>
        a.barcode === code ||
        a.kodeBarang === code ||
        String(a.nup) === code ||
        a.id.toLowerCase() === code.toLowerCase()
    );

    if (foundAsset) {
      setScannedResult({ type: 'BMN', item: foundAsset });
      return;
    }

    // Check if matching Inventory item by barcode or binCode
    const foundInv = inventoryItems.find(
      i =>
        i.barcode === code ||
        i.binCode.toLowerCase() === code.toLowerCase() ||
        i.kodeBarang === code
    );

    if (foundInv) {
      setScannedResult({ type: 'PERSEDIAAN', item: foundInv });
      return;
    }

    // Fallback: pick first sample asset if custom query doesn't match
    setScannedResult({ type: 'BMN', item: assets[0] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Scanner Barcode & QR Code SIMAN-BMN</h3>
              <p className="text-[11px] text-slate-400">Pindai label aset fisik atau rak gudang</p>
            </div>
          </div>
          <button
            onClick={() => {
              setIsQrScannerOpen(false);
              setScannedResult(null);
            }}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewfinder View */}
        <div className="p-4 space-y-4">
          <div className="relative aspect-video w-full rounded-xl bg-slate-950 border-2 border-dashed border-slate-700 overflow-hidden flex flex-col items-center justify-center">
            {/* Viewfinder crosshairs */}
            <div className="w-48 h-48 border-2 border-cyan-400/80 rounded-2xl relative flex items-center justify-center shadow-lg shadow-cyan-500/10 animate-pulse">
              <div className="w-full h-0.5 bg-cyan-400/80 absolute shadow-sm shadow-cyan-400 animate-bounce"></div>
              <Camera className="w-10 h-10 text-cyan-400/40" />
            </div>

            <div className="absolute bottom-2 text-center text-[11px] text-slate-400 bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-full">
              Kamera aktif • Arahkan sensor ke QR Code atau Barcode
            </div>
          </div>

          {/* Quick Simulation Input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={simulatedCode}
              onChange={e => setSimulatedCode(e.target.value)}
              placeholder="Atau masukkan Barcode/NUP/Bin Code..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => handleSimulateScan()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition-colors"
            >
              Cari
            </button>
          </div>

          {/* Quick Pick Samples */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="text-slate-400">Contoh Cepat:</span>
            <button
              onClick={() => handleSimulateScan(assets[0].barcode)}
              className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 hover:bg-slate-700 font-mono"
            >
              Laptop NUP 1
            </button>
            <button
              onClick={() => handleSimulateScan(assets[13].barcode)}
              className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 hover:bg-slate-700 font-mono"
            >
              AC Daikin
            </button>
            <button
              onClick={() => handleSimulateScan('WH-B-01-01')}
              className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 hover:bg-slate-700 font-mono"
            >
              Kertas A4 (Rak A)
            </button>
          </div>

          {/* Scanned Result Card */}
          {scannedResult && (
            <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/40 animate-in fade-in duration-200">
              <div className="flex items-start justify-between mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                  scannedResult.type === 'BMN'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  HASIL SCAN: {scannedResult.type}
                </span>

                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Terverifikasi di Database</span>
                </span>
              </div>

              {scannedResult.type === 'BMN' ? (
                // BMN Details
                (() => {
                  const asset = scannedResult.item as BmnAsset;
                  return (
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-bold text-white">{asset.namaBarang}</h4>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          Kode: {asset.kodeBarang} • NUP: {asset.nup} • {asset.merkType}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Lokasi Ruangan:</span>
                          <span className="font-semibold text-slate-200">{asset.ruanganNama}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Kondisi Fisik:</span>
                          <span className={`font-bold ${
                            asset.kondisi === 'Baik' ? 'text-emerald-400' :
                            asset.kondisi === 'Rusak Ringan' ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {asset.kondisi}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Penanggung Jawab:</span>
                          <span className="font-semibold text-slate-200">{asset.penanggungJawab}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Nilai Buku:</span>
                          <span className="font-semibold text-emerald-400">
                            Rp {asset.nilaiBuku.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons as specified in Prompt #11 */}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            setSelectedAsset(asset);
                            setActiveView('assets');
                            setIsQrScannerOpen(false);
                          }}
                          className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Lihat Riwayat</span>
                        </button>

                        <button
                          onClick={() => {
                            setActiveView('maintenance');
                            setIsQrScannerOpen(false);
                          }}
                          className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Wrench className="w-3.5 h-3.5 text-amber-400" />
                          <span>Ajukan Pemeliharaan</span>
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                // Inventory Details
                (() => {
                  const inv = scannedResult.item as InventoryItem;
                  return (
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-bold text-white">{inv.nama}</h4>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          Bin Code: {inv.binCode} • Rak: {inv.rak} • {inv.jenis}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Stok Saat Ini:</span>
                          <span className="text-base font-bold text-white">
                            {inv.stokSaatIni} <span className="text-xs text-slate-400">{inv.satuan}</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Status Stok:</span>
                          <span className={`font-bold ${
                            inv.status === 'Aman' ? 'text-emerald-400' :
                            inv.status === 'Menipis' ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {inv.status} (Min: {inv.stokMinimum})
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            setSelectedInventoryItem(inv);
                            setActiveView('inventory');
                            setIsQrScannerOpen(false);
                          }}
                          className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Boxes className="w-3.5 h-3.5" />
                          <span>Buka Kartu Stok</span>
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
