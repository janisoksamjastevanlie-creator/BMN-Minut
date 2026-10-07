import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { StockOpname, StockOpnameItem } from '../types';
import { BasoPrintModal } from '../components/inventory/BasoPrintModal';
import {
  History,
  Plus,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Printer,
  FileSpreadsheet,
  Check,
  X,
  Scan,
  Sparkles
} from 'lucide-react';

export const StockOpnameView: React.FC = () => {
  const { opnames, inventoryItems, addStockOpname, approveStockOpname, currentUser } = useApp();

  const [selectedOpname, setSelectedOpname] = useState<StockOpname>(opnames[0] || null);
  const [isNewOpnameModalOpen, setIsNewOpnameModalOpen] = useState(false);
  const [isPrintBasoOpen, setIsPrintBasoOpen] = useState(false);

  // Form states for creating a new opname session
  const [periode, setPeriode] = useState('Triwulan III 2026');
  const [petugas, setPetugas] = useState(currentUser?.name || 'Siti Rahmawati Sompie, A.Md');

  // New session item physical counts map
  const [physicalCounts, setPhysicalCounts] = useState<{ [itemId: string]: number }>(() => {
    const map: { [itemId: string]: number } = {};
    inventoryItems.slice(0, 25).forEach(i => {
      map[i.id] = i.stokSaatIni; // default to system stock
    });
    return map;
  });

  const handleCreateNewOpname = (e: React.FormEvent) => {
    e.preventDefault();
    const items: StockOpnameItem[] = inventoryItems.slice(0, 25).map(item => {
      const fisik = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.stokSaatIni;
      const selisih = fisik - item.stokSaatIni;
      return {
        id: `op-it-${Date.now()}-${item.id}`,
        itemId: item.id,
        kodeBarang: item.kodeBarang,
        namaBarang: item.nama,
        satuan: item.satuan,
        stokSistem: item.stokSaatIni,
        stokFisik: fisik,
        selisih: selisih,
        kondisi: 'Baik',
        keterangan: selisih === 0 ? 'Sesuai catatan sistem' : selisih < 0 ? 'Selisih kurang' : 'Selisih lebih',
        statusPenyesuaian: 'Belum'
      };
    });

    addStockOpname({
      tanggal: new Date().toISOString().split('T')[0],
      periode,
      petugas,
      status: 'Menunggu Approval',
      items,
      catatan: 'Pemeriksaan fisik stok persediaan Gudang Utama BPS Minut'
    });

    setIsNewOpnameModalOpen(false);
  };

  const handlePrintBeritaAcara = () => {
    setIsPrintBasoOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Stock Opname Persediaan (Fisik vs Sistem)</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold font-mono">
              {opnames.length} Sesi Opname
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Rekonsiliasi saldo fisik berkala, penghitungan selisih, dan penerbitan Berita Acara Stock Opname
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintBeritaAcara}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Berita Acara</span>
          </button>

          <button
            onClick={() => setIsNewOpnameModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Mulai Sesi Opname Baru</span>
          </button>
        </div>
      </div>

      {/* Session Selector Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 bg-slate-900 p-2 rounded-2xl border border-slate-800">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">
          Pilih Sesi Opname:
        </span>
        {opnames.map(op => (
          <button
            key={op.id}
            onClick={() => setSelectedOpname(op)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 ${
              selectedOpname?.id === op.id
                ? 'bg-amber-600 text-white shadow'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span>{op.periode}</span>
            <span className="text-[10px] opacity-75">({op.nomorOpname})</span>
          </button>
        ))}
      </div>

      {/* Selected Opname Detail Card */}
      {selectedOpname && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {selectedOpname.nomorOpname}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  selectedOpname.status === 'Selesai'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  Status: {selectedOpname.status}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-1">
                Berita Acara Pemeriksaan Kas & Persediaan: {selectedOpname.periode}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Tanggal: {selectedOpname.tanggal} • Petugas Pemeriksa: {selectedOpname.petugas}
              </p>
            </div>

            {selectedOpname.status === 'Menunggu Approval' && (
              <button
                onClick={() => approveStockOpname(selectedOpname.id)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20 self-start sm:self-auto"
              >
                <Check className="w-4 h-4" />
                <span>Setujui Berita Acara & Selaraskan Saldo</span>
              </button>
            )}
          </div>

          {/* Opname Items Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Kode</th>
                  <th className="py-2.5 px-4">Nama Barang Persediaan</th>
                  <th className="py-2.5 px-3 text-right">Stok Sistem</th>
                  <th className="py-2.5 px-3 text-right">Stok Fisik</th>
                  <th className="py-2.5 px-3 text-right">Selisih</th>
                  <th className="py-2.5 px-3 text-center">Kondisi</th>
                  <th className="py-2.5 px-4">Keterangan Verifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {selectedOpname.items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">{item.kodeBarang}</td>
                    <td className="py-2.5 px-4 font-medium text-white">{item.namaBarang}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                      {item.stokSistem} {item.satuan}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                      {item.stokFisik} {item.satuan}
                    </td>
                    {/* Selisih = Stok Fisik - Stok Sistem */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      {item.selisih === 0 ? (
                        <span className="text-emerald-400">0</span>
                      ) : item.selisih > 0 ? (
                        <span className="text-cyan-400">+{item.selisih}</span>
                      ) : (
                        <span className="text-rose-400">{item.selisih}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                        {item.kondisi}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 text-[11px]">{item.keterangan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Opname Modal */}
      {isNewOpnameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Input Hasil Stock Opname Fisik</h3>
                  <p className="text-[11px] text-slate-400">Sistem otomatis menghitung Selisih = Fisik - Sistem</p>
                </div>
              </div>
              <button onClick={() => setIsNewOpnameModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewOpname} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Periode Stock Opname</label>
                  <input
                    type="text"
                    required
                    value={periode}
                    onChange={e => setPeriode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Petugas Tim Pemeriksa</label>
                  <input
                    type="text"
                    required
                    value={petugas}
                    onChange={e => setPetugas(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Input Fisik Barang (Top 25 Item Persediaan):
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {inventoryItems.slice(0, 25).map(item => {
                    const currentPhys = physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.stokSaatIni;
                    const diff = currentPhys - item.stokSaatIni;

                    return (
                      <div key={item.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs gap-3">
                        <div className="truncate flex-1">
                          <div className="font-semibold text-white truncate">{item.nama}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Stok Sistem: {item.stokSaatIni} {item.satuan} • {item.binCode}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-24">
                            <input
                              type="number"
                              min="0"
                              value={currentPhys}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setPhysicalCounts(prev => ({ ...prev, [item.id]: val }));
                              }}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono font-bold text-right focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <span className={`w-16 text-right font-mono font-bold text-[11px] ${
                            diff === 0 ? 'text-emerald-400' : diff > 0 ? 'text-cyan-400' : 'text-rose-400'
                          }`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewOpnameModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-600/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan Sesi Opname</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official BASO Printable Modal */}
      <BasoPrintModal
        isOpen={isPrintBasoOpen}
        onClose={() => setIsPrintBasoOpen(false)}
        opname={selectedOpname}
      />
    </div>
  );
};
