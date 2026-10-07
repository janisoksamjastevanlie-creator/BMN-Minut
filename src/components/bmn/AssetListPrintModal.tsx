import React from 'react';
import { BmnAsset } from '../../types';
import { triggerPrint } from '../../utils/printHelper';
import { X, Printer, FileText, CheckCircle2 } from 'lucide-react';

export const AssetListPrintModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  assets: BmnAsset[];
  filterInfo?: {
    category?: string;
    room?: string;
    condition?: string;
    search?: string;
  };
}> = ({ isOpen, onClose, assets, filterInfo }) => {
  if (!isOpen) return null;

  const totalNilaiPerolehan = assets.reduce((sum, a) => sum + a.nilaiPerolehan, 0);
  const totalNilaiBuku = assets.reduce((sum, a) => sum + a.nilaiBuku, 0);
  const baikCount = assets.filter(a => a.kondisi === 'Baik').length;
  const rusakRinganCount = assets.filter(a => a.kondisi === 'Rusak Ringan').length;
  const rusakBeratCount = assets.filter(a => a.kondisi === 'Rusak Berat').length;

  const handlePrint = () => {
    triggerPrint({ title: `Daftar_BMN_BPS_Minahasa_Utara_TA2026` });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto printable-modal-overlay">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] printable-modal-card">
        {/* Top Controls Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10 no-print">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Daftar Inventaris Barang Milik Negara (BMN)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                  {assets.length} Aset
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Format resmi cetak penatausahaan Kuasa Pengguna Barang BPS Kabupaten Minahasa Utara
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/30"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Daftar BMN (Print)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6 bg-slate-950 text-slate-100 print:bg-white print:text-black print:p-0">
          {/* Kop Surat Resmi */}
          <div className="text-center border-b-2 border-slate-700 print:border-black pb-4 space-y-1">
            <div className="text-[11px] font-bold tracking-widest text-slate-400 print:text-black uppercase">
              BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
            </div>
            <div className="text-base sm:text-lg font-black tracking-wide text-white print:text-black uppercase">
              DAFTAR BARANG KUASA PENGGUNA (BMN) RESMI
            </div>
            <div className="text-[11px] font-mono text-slate-400 print:text-black">
              Kode UAKPB: 054.01.7106.000000 • Tahun Anggaran 2026
            </div>
          </div>

          {/* Metadata & Rekapitulasi */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800 print:bg-gray-50 print:border-gray-300 text-xs">
            <div>
              <span className="text-slate-400 print:text-gray-600 text-[10px] block">Total Aset Tercatat:</span>
              <span className="font-bold text-white print:text-black text-sm">{assets.length} Unit</span>
            </div>
            <div>
              <span className="text-slate-400 print:text-gray-600 text-[10px] block">Kondisi Fisik:</span>
              <span className="font-semibold text-emerald-400 print:text-black text-xs">
                {baikCount} Baik • {rusakRinganCount} RR • {rusakBeratCount} RB
              </span>
            </div>
            <div>
              <span className="text-slate-400 print:text-gray-600 text-[10px] block">Total Nilai Perolehan:</span>
              <span className="font-mono font-bold text-slate-200 print:text-black text-xs">
                Rp {totalNilaiPerolehan.toLocaleString('id-ID')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 print:text-gray-600 text-[10px] block">Total Nilai Buku:</span>
              <span className="font-mono font-bold text-emerald-400 print:text-black text-xs">
                Rp {totalNilaiBuku.toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Table of Assets */}
          <div className="rounded-xl border border-slate-800 overflow-hidden print:border-black">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 print:bg-gray-100 print:border-black text-[10px] font-bold text-slate-300 print:text-black uppercase">
                  <th className="py-2 px-2 text-center w-8">No</th>
                  <th className="py-2 px-2.5">Kode Barang</th>
                  <th className="py-2 px-2 text-center">NUP</th>
                  <th className="py-2 px-3">Nama Barang / Spesifikasi</th>
                  <th className="py-2 px-2.5">Merk / Tipe</th>
                  <th className="py-2 px-2.5">Ruangan Kerja</th>
                  <th className="py-2 px-2.5">Penanggung Jawab</th>
                  <th className="py-2 px-2 text-center">Kondisi</th>
                  <th className="py-2 px-3 text-right">Nilai Buku (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-gray-300 text-slate-300 print:text-black text-[11px]">
                {assets.map((asset, idx) => (
                  <tr key={asset.id} className="hover:bg-slate-900/40">
                    <td className="py-2 px-2 text-center font-mono text-slate-400 print:text-black">{idx + 1}</td>
                    <td className="py-2 px-2.5 font-mono text-slate-300 print:text-black">{asset.kodeBarang}</td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-cyan-300 print:text-black">#{asset.nup}</td>
                    <td className="py-2 px-3 font-semibold text-white print:text-black">{asset.namaBarang}</td>
                    <td className="py-2 px-2.5">{asset.merkType || '-'}</td>
                    <td className="py-2 px-2.5">{asset.ruanganNama}</td>
                    <td className="py-2 px-2.5 text-[10px]">{asset.penanggungJawab}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                        asset.kondisi === 'Baik' ? 'text-emerald-400 print:text-black' :
                        asset.kondisi === 'Rusak Ringan' ? 'text-amber-400 print:text-black' :
                        'text-rose-400 print:text-black'
                      }`}>
                        {asset.kondisi}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400 print:text-black">
                      Rp {asset.nilaiBuku.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Official Signatures */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-xs text-center text-slate-300 print:text-black border-t border-slate-800 print:border-black print-signature-block">
            <div className="space-y-14">
              <div>
                <p className="text-slate-400 print:text-gray-600">Mengetahui,</p>
                <p className="font-bold">Kuasa Pengguna Barang (Kepala BPS Minut)</p>
              </div>
              <div>
                <p className="font-bold underline text-white print:text-black">Ir. Hendra Kawilarang, M.Si</p>
                <p className="text-[10px] text-slate-400 print:text-gray-600">NIP. 19740512 199803 1 002</p>
              </div>
            </div>

            <div className="space-y-14">
              <div>
                <p className="text-slate-400 print:text-gray-600">Airmadidi, Minahasa Utara</p>
                <p className="font-bold">Pengelola Barang Milik Negara</p>
              </div>
              <div>
                <p className="font-bold underline text-white print:text-black">Christian Pangemanan, S.ST, M.Stat</p>
                <p className="text-[10px] text-slate-400 print:text-gray-600">NIP. 19850320 200801 1 003</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer (Screen only) */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900 text-xs no-print">
          <span className="text-slate-400 text-[11px]">
            Dokumen cetak penatausahaan inventaris BMN Satuan Kerja 7106 BPS Kabupaten Minahasa Utara.
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
