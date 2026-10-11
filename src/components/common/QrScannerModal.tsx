import React, { useState, useRef, useEffect } from 'react';
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
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const sessionRef = useRef(0);
  const handledRef = useRef(false);

  const stopCamera = () => {
    sessionRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null | undefined;
    stream?.getTracks().forEach(track => track.stop());
    if (video) video.srcObject = null;
    setIsCameraOn(false);
  };

  useEffect(() => {
    if (!isQrScannerOpen) {
      stopCamera();
      setScannedResult(null);
      setNotFoundCode(null);
      setCameraError(null);
      setSimulatedCode('');
    }
  }, [isQrScannerOpen]);

  useEffect(() => () => stopCamera(), []);

  const lookupCode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const lower = code.toLowerCase();

    const foundAsset = assets.find(
      a =>
        a.barcode === code ||
        a.kodeBarang === code ||
        String(a.nup) === code ||
        a.id.toLowerCase() === lower
    );
    if (foundAsset) {
      setNotFoundCode(null);
      setScannedResult({ type: 'BMN', item: foundAsset });
      return;
    }

    const foundInv = inventoryItems.find(
      i =>
        i.barcode === code ||
        i.binCode.toLowerCase() === lower ||
        i.kodeBarang === code
    );
    if (foundInv) {
      setNotFoundCode(null);
      setScannedResult({ type: 'PERSEDIAAN', item: foundInv });
      return;
    }

    setScannedResult(null);
    setNotFoundCode(code);
  };

  const startCamera = async () => {
    setCameraError(null);
    setScannedResult(null);
    setNotFoundCode(null);
    handledRef.current = false;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Kamera tidak tersedia. Browser tidak mendukung akses kamera atau halaman tidak dibuka melalui HTTPS. Gunakan input kode manual.');
      return;
    }

    stopCamera();
    const session = ++sessionRef.current;
    setIsCameraOn(true);

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      if (session !== sessionRef.current || !videoRef.current) return;

      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result, _error, ctrl) => {
          if (!result || handledRef.current || session !== sessionRef.current) return;
          handledRef.current = true;
          ctrl.stop();
          stopCamera();
          lookupCode(result.getText());
        }
      );

      if (session !== sessionRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
    } catch (error) {
      if (session !== sessionRef.current) return;
      stopCamera();
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setCameraError('Izin kamera ditolak. Izinkan akses kamera pada pengaturan browser lalu coba lagi.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setCameraError('Kamera tidak ditemukan pada perangkat ini. Gunakan input kode manual.');
      } else if (name === 'NotReadableError') {
        setCameraError('Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.');
      } else {
        setCameraError('Pemindaian gagal dimulai. Coba lagi atau gunakan input kode manual.');
      }
    }
  };

  const closeScanner = () => {
    stopCamera();
    setIsQrScannerOpen(false);
    setScannedResult(null);
    setNotFoundCode(null);
  };

  if (!isQrScannerOpen) return null;

  const handleSimulateScan = () => lookupCode(simulatedCode);

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
            onClick={closeScanner}
            aria-label="Tutup pemindai"
            className="text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewfinder View */}
        <div className="p-4 space-y-4">
          <div className="relative aspect-video w-full rounded-xl bg-slate-950 border-2 border-dashed border-slate-700 overflow-hidden flex flex-col items-center justify-center">
            <video
              ref={videoRef}
              muted
              playsInline
              className={`absolute inset-0 w-full h-full object-cover ${isCameraOn ? '' : 'hidden'}`}
            />
            {isCameraOn ? (
              <>
                <div className="w-48 h-32 border-2 border-cyan-400/80 rounded-2xl relative z-10 pointer-events-none">
                  <div className="w-full h-0.5 bg-cyan-400/80 absolute top-1/2 shadow-sm shadow-cyan-400"></div>
                </div>
                <div className="absolute bottom-2 z-10 text-center text-[11px] text-slate-200 bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-full">
                  Kamera aktif • Arahkan ke QR Code atau Barcode
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <Camera className="w-10 h-10 text-cyan-400/50" />
                <button
                  onClick={startCamera}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{scannedResult || notFoundCode ? 'Pindai Ulang' : 'Buka Kamera'}</span>
                </button>
              </div>
            )}
          </div>

          {isCameraOn && (
            <button
              onClick={stopCamera}
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              Tutup Kamera
            </button>
          )}

          {cameraError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          {notFoundCode && (
            <div role="alert" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
              Kode <span className="font-mono font-bold">{notFoundCode}</span> tidak ditemukan pada data aset maupun persediaan. Silakan pindai ulang atau periksa kodenya.
            </div>
          )}

          {/* Manual Input */}
          <form
            onSubmit={event => {
              event.preventDefault();
              handleSimulateScan();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={simulatedCode}
              onChange={e => setSimulatedCode(e.target.value)}
              placeholder="Atau masukkan Barcode/NUP/Bin Code..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl transition-colors"
            >
              Cari
            </button>
          </form>

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
