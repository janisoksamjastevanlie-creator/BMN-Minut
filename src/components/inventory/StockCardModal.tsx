import React from 'react';
import { useApp } from '../../context/AppContext';
import { InventoryItem } from '../../types';
import { triggerPrint } from '../../utils/printHelper';
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

  const handlePrint = () => {
    triggerPrint({ title: `Kartu_Stok_${item.kodeBarang}_${item.nama}_BPS_Minut` });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto printable-modal-overlay">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] printable-modal-card">
        {/* Header Controls (Screen only) */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between no-print">
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
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-amber-600/30"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Kartu Stok</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Content Paper */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-slate-950 text-slate-100 print:bg-white print:text-black print:p-0">
          {/* Official Kop Surat Header for Print */}
          <div className="text-center border-b-2 border-slate-700 print:border-black pb-3 space-y-1">
            <div className="text-[11px] font-bold tracking-widest text-slate-400 print:text-black uppercase">
              BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
            </div>
            <div className="text-base sm:text-lg font-black tracking-wide text-white print:text-black uppercase">
              KARTU KENDALI PERSEDIAAN BARANG HABIS PAKAI (STOCK CARD)
            </div>
            <div className="text-[11px] font-mono text-cyan-300 print:text-black">
              Kode Satker: 7106 • Lokasi: Gudang Logistik BPS ({item.rak} - Bin: {item.binCode})
            </div>
          </div>

          {/* Item Metadata Information */}
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 print:bg-gray-50 print:border-gray-300 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-slate-400 print:text-gray-600 text-[10px] block">Kode Barang:</span>
              <span className="font-mono font-bold text-cyan-300 print:text-black">{item.kodeBarang}</span>
            </div>
            <div>
              <span className="text-slate-400 print:text-gray-600 text-[10px] block">Nama Persediaan:</span>
              <span className="font-bold text-white print:text-black truncate block">{item.nama}</span>
            </div>
            <div>
              <span className="text-slate-400 print:text-gray-600 text-[10px] block">Lokasi Rak & Bin:</span>
              <span className="font-medium text-slate-200 print:text-black">{item.rak} ({item.binCode})</span>
            </div>
            <div>
              <span className="text-slate-400 print:text-gray-600 text-[10px] block">Satuan & Harga:</span>
              <span className="font-medium text-slate-200 print:text-black">
                {item.satuan} • Rp {item.hargaSatuan.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Stock Metrics summary */}
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 print:bg-gray-50 print:border-gray-300">
              <span className="text-[10px] text-slate-400 print:text-gray-600 block">Stok Saat Ini</span>
              <span className="text-base font-bold text-white print:text-black mt-0.5 block">
                {item.stokSaatIni} <span className="text-xs font-normal text-slate-400 print:text-gray-600">{item.satuan}</span>
              </span>
            </div>

            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 print:bg-gray-50 print:border-gray-300">
              <span className="text-[10px] text-slate-400 print:text-gray-600 block">Batas Minimum</span>
              <span className="text-base font-bold text-amber-400 print:text-black mt-0.5 block">
                {item.stokMinimum} <span className="text-xs font-normal text-slate-400 print:text-gray-600">{item.satuan}</span>
              </span>
            </div>

            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 print:bg-gray-50 print:border-gray-300">
              <span className="text-[10px] text-slate-400 print:text-gray-600 block">Total Nilai Persediaan</span>
              <span className="text-sm font-bold text-emerald-400 print:text-black mt-0.5 block font-mono">
                Rp {item.totalNilai.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="rounded-xl border border-slate-800 overflow-hidden print:border-black">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 print:bg-gray-100 print:border-black text-[11px] font-bold text-slate-300 print:text-black">
                  <th className="py-2.5 px-2.5 text-center w-8">No</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">No Transaksi</th>
                  <th className="py-2.5 px-3">Keterangan / Keperluan</th>
                  <th className="py-2.5 px-2 text-right">Masuk</th>
                  <th className="py-2.5 px-2 text-right">Keluar</th>
                  <th className="py-2.5 px-3 text-right">Saldo</th>
                  <th className="py-2.5 px-3">Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-gray-300 text-slate-300 print:text-black">
                {entries.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-2.5 text-center font-mono text-slate-400 print:text-black">{idx + 1}</td>
                    <td className="py-2.5 px-3 text-slate-400 print:text-black whitespace-nowrap">{entry.tanggal}</td>
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-300 print:text-black">{entry.noTransaksi}</td>
                    <td className="py-2.5 px-3 text-slate-200 print:text-black">{entry.keterangan}</td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-400 print:text-black">
                      {entry.masuk > 0 ? `+${entry.masuk}` : '-'}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-rose-400 print:text-black">
                      {entry.keluar > 0 ? `-${entry.keluar}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-white print:text-black">
                      {entry.saldo}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 print:text-black text-[11px]">{entry.petugas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Official Signatures Block */}
          <div className="pt-6 grid grid-cols-2 gap-8 text-xs text-center text-slate-300 print:text-black border-t border-slate-800 print:border-black print-signature-block">
            <div className="space-y-12">
              <div>
                <p className="text-slate-400 print:text-gray-600">Mengetahui,</p>
                <p className="font-bold">Pengelola Persediaan BPS Minut</p>
              </div>
              <div>
                <p className="font-bold underline text-white print:text-black">Christian Pangemanan, S.ST</p>
                <p className="text-[10px] text-slate-400 print:text-gray-600">NIP. 19850320 200801 1 003</p>
              </div>
            </div>

            <div className="space-y-12">
              <div>
                <p className="text-slate-400 print:text-gray-600">Petugas Gudang Logistik,</p>
                <p className="font-bold">Pencatat Kartu Stok</p>
              </div>
              <div>
                <p className="font-bold underline text-white print:text-black">Dra. Meity Sondakh</p>
                <p className="text-[10px] text-slate-400 print:text-gray-600">Petugas Gudang BPS</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer (Screen only) */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between no-print">
          <div className="text-[11px] text-slate-400">
            Kartu Kendali Persediaan Elektronik Satker 7106 BPS Kabupaten Minahasa Utara
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
