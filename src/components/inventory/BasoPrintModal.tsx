import React from 'react';
import { StockOpname } from '../../types';
import { triggerPrint } from '../../utils/printHelper';
import { OfficialLetterhead } from '../common/OfficialLetterhead';
import { ReportSignatureBlock } from '../common/ReportSignatureBlock';
import { X, Printer, FileText, CheckCircle2 } from 'lucide-react';

export const BasoPrintModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  opname: StockOpname | null;
}> = ({ isOpen, onClose, opname }) => {
  if (!isOpen || !opname) return null;

  const totalItems = opname.items.length;
  const matchItems = opname.items.filter(i => i.selisih === 0).length;
  const diffItems = opname.items.filter(i => i.selisih !== 0).length;

  const handlePrint = () => {
    triggerPrint({ title: `BASO_${opname.nomorOpname}_BPS_Minahasa_Utara`, orientation: 'landscape' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto printable-modal-overlay">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94vh] printable-modal-card">
        {/* Controls Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Berita Acara Stock Opname Fisik (BASO)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  {opname.nomorOpname}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Dokumen rekonsiliasi fisik persediaan resmi BPS Kabupaten Minahasa Utara
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-600/30"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Berita Acara (Print)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Paper */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6 bg-slate-950 text-slate-100 print:bg-white print:text-black print:p-0">
          <OfficialLetterhead />
          <div className="text-center pb-1 space-y-1">
            <div className="text-base sm:text-lg font-black tracking-wide text-white print:text-black uppercase">
              BERITA ACARA PEMERIKSAAN FISIK & STOCK OPNAME PERSEDIAAN
            </div>
            <div className="text-[11px] font-mono text-cyan-300 print:text-black">
              Nomor: {opname.nomorOpname} • Periode: {opname.periode}
            </div>
          </div>

          {/* Opening Paragraph */}
          <div className="text-xs text-slate-300 print:text-black leading-relaxed space-y-2">
            <p>
              Pada hari ini, tanggal <strong>{opname.tanggal}</strong>, telah dilaksanakan pemeriksaan fisik kas dan barang persediaan habis pakai (ATK/ARK) pada Gudang Logistik BPS Kabupaten Minahasa Utara oleh Tim Pemeriksa Fisik.
            </p>
            <div className="grid grid-cols-2 gap-4 p-3 rounded-xl bg-slate-900 border border-slate-800 print:bg-gray-50 print:border-gray-300 text-[11px]">
              <div>
                <span className="text-slate-400 print:text-gray-600 block">Petugas Pemeriksa:</span>
                <span className="font-bold text-white print:text-black">{opname.petugas}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block">Status Rekonsiliasi:</span>
                <span className="font-bold text-emerald-400 print:text-black">{opname.status}</span>
              </div>
            </div>
          </div>

          {/* Table of Items */}
          <div className="rounded-2xl border border-slate-800 overflow-hidden print:border-black">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 print:bg-gray-100 print:border-black text-[11px] font-bold text-slate-300 print:text-black">
                  <th className="py-2.5 px-2 text-center w-8">No</th>
                  <th className="py-2.5 px-3">Kode Barang</th>
                  <th className="py-2.5 px-3">Nama Persediaan</th>
                  <th className="py-2.5 px-2 text-center">Satuan</th>
                  <th className="py-2.5 px-3 text-right">Stok Buku</th>
                  <th className="py-2.5 px-3 text-right">Stok Fisik</th>
                  <th className="py-2.5 px-3 text-right">Selisih</th>
                  <th className="py-2.5 px-2 text-center">Kondisi</th>
                  <th className="py-2.5 px-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-gray-300">
                {opname.items.map((item, idx) => (
                  <tr key={item.id} className="text-slate-200 print:text-black hover:bg-slate-900/40">
                    <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-400 print:text-black">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-300 print:text-black">
                      {item.kodeBarang}
                    </td>
                    <td className="py-2 px-3 font-semibold text-white print:text-black">
                      {item.namaBarang}
                    </td>
                    <td className="py-2 px-2 text-center">{item.satuan}</td>
                    <td className="py-2 px-3 text-right font-mono">{item.stokSistem}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">{item.stokFisik}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {item.selisih === 0 ? (
                        <span className="text-emerald-400 print:text-black">0</span>
                      ) : item.selisih > 0 ? (
                        <span className="text-cyan-400 print:text-black">+{item.selisih}</span>
                      ) : (
                        <span className="text-rose-400 print:text-black">{item.selisih}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">{item.kondisi}</td>
                    <td className="py-2 px-3 text-[11px] text-slate-400 print:text-black">{item.keterangan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Box */}
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 print:bg-gray-50 print:border-gray-300 text-xs flex justify-between">
            <div>
              Total Item Diperiksa: <strong>{totalItems} Item</strong>
            </div>
            <div>
              Item Sesuai: <strong className="text-emerald-400 print:text-black">{matchItems}</strong> • 
              Item Selisih: <strong className="text-amber-400 print:text-black">{diffItems}</strong>
            </div>
          </div>

          <ReportSignatureBlock signers={[
            { heading: 'Petugas Tim Pemeriksa', name: opname.petugas },
            { heading: 'Pengelola Persediaan & BMN', role: 'Pengelola BMN' },
            { heading: 'Kepala Sub Bagian Umum', role: 'Kepala Sub Bagian Umum' }
          ]} />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900 text-xs print:hidden">
          <span className="text-slate-400 text-[11px]">
            Berita Acara ini merupakan dokumen penatausahaan persediaan resmi satker 7106.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
