import React from 'react';
import { useApp } from '../../context/AppContext';
import { InventoryItem } from '../../types';
import { getInventoryPhotoUrl } from '../../utils/assetImages';
import {
  FileText,
  X,
  Printer,
  Package,
  TrendingDown,
  TrendingUp,
  Boxes,
  ArrowRight
} from 'lucide-react';

export const StockCardModal: React.FC<{
  item: InventoryItem | null;
  onClose: () => void;
}> = ({ item, onClose }) => {
  const { stockInList, stockOutList } = useApp();

  if (!item) return null;

  // Build ledger entries from transactions matching item.id
  const itemIn = stockInList.filter(s => s.itemId === item.id);
  const itemOut = stockOutList.filter(s => s.itemId === item.id);

  // Combine into single chronological timeline
  interface LedgerRow {
    tanggal: string;
    noTransaksi: string;
    tipe: 'AWAL' | 'MASUK' | 'KELUAR';
    masuk: number;
    keluar: number;
    saldo: number;
    keterangan: string;
    petugas: string;
  }

  const entries: LedgerRow[] = [
    {
      tanggal: '2026-01-02',
      noTransaksi: 'INIT-2026',
      tipe: 'AWAL',
      masuk: item.stokAwal,
      keluar: 0,
      saldo: item.stokAwal,
      keterangan: 'Saldo Awal Tahun Anggaran 2026',
      petugas: 'Petugas Gudang BPS'
    }
  ];

  let currentSaldo = item.stokAwal;
  itemIn.forEach(i => {
    currentSaldo += i.jumlah;
    entries.push({
      tanggal: i.tanggal,
      noTransaksi: i.nomorTransaksi,
      tipe: 'MASUK',
      masuk: i.jumlah,
      keluar: 0,
      saldo: currentSaldo,
      keterangan: `${i.sumber} (${i.nomorDokumen})`,
      petugas: i.petugas
    });
  });

  itemOut.forEach(o => {
    currentSaldo = Math.max(0, currentSaldo - o.jumlah);
    entries.push({
      tanggal: o.tanggal,
      noTransaksi: o.nomorTransaksi,
      tipe: 'KELUAR',
      masuk: 0,
      keluar: o.jumlah,
      saldo: currentSaldo,
      keterangan: `${o.keperluan} (${o.unitKerja})`,
      petugas: o.petugas
    });
  });

  // Sort by date ascending
  entries.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {item.jenis}
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">{item.nama}</h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Kode: {item.kodeBarang} • Bin: {item.binCode} ({item.rak})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Kartu Stok</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Item Summary Cards */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 grid grid-cols-4 gap-3 text-center text-xs">
          <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Stok Saat Ini</span>
            <span className="text-base font-bold text-white mt-0.5 block">
              {item.stokSaatIni} <span className="text-xs font-normal text-slate-400">{item.satuan}</span>
            </span>
          </div>

          <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Batas Minimum</span>
            <span className="text-base font-bold text-amber-400 mt-0.5 block">
              {item.stokMinimum} <span className="text-xs font-normal text-slate-400">{item.satuan}</span>
            </span>
          </div>

          <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Harga Satuan</span>
            <span className="text-sm font-bold text-slate-200 mt-0.5 block font-mono">
              Rp {item.hargaSatuan.toLocaleString('id-ID')}
            </span>
          </div>

          <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Nilai Total Stok</span>
            <span className="text-sm font-bold text-emerald-400 mt-0.5 block font-mono">
              Rp {item.totalNilai.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Tanggal</th>
                <th className="py-2.5 px-3">No Transaksi</th>
                <th className="py-2.5 px-3">Keterangan / Keperluan</th>
                <th className="py-2.5 px-2 text-right">Masuk</th>
                <th className="py-2.5 px-2 text-right">Keluar</th>
                <th className="py-2.5 px-3 text-right">Saldo</th>
                <th className="py-2.5 px-3">Petugas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{entry.tanggal}</td>
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-300">{entry.noTransaksi}</td>
                  <td className="py-2.5 px-3 text-slate-200 max-w-xs truncate">{entry.keterangan}</td>
                  <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-400">
                    {entry.masuk > 0 ? `+${entry.masuk}` : '-'}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono font-bold text-rose-400">
                    {entry.keluar > 0 ? `-${entry.keluar}` : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-black text-white">
                    {entry.saldo}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate">{entry.petugas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Kartu Kendali Persediaan Elektronik BPS Minut
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
