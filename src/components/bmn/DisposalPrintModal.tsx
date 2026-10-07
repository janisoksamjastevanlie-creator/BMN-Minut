import React from 'react';
import { AssetDisposal } from '../../types';
import { triggerPrint } from '../../utils/printHelper';
import { X, Printer, FileText, Trash2 } from 'lucide-react';

export const DisposalPrintModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  disposal: AssetDisposal | null;
}> = ({ isOpen, onClose, disposal }) => {
  if (!isOpen || !disposal) return null;

  const handlePrint = () => {
    triggerPrint({ title: `Usulan_Penghapusan_${disposal.nomorPengajuan}_BPS_Minahasa_Utara` });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto printable-modal-overlay">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94vh] printable-modal-card">
        {/* Controls Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Surat Usulan Penghapusan BMN Resmi</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                  {disposal.nomorPengajuan}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Format surat usulan ke Pengelola Barang / KPKNL sesuai PMK No. 83/PMK.06/2016
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-rose-600/30"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Surat Usulan (Print)</span>
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
          {/* Kop Surat Resmi */}
          <div className="text-center border-b-2 border-slate-700 print:border-black pb-4 space-y-1">
            <div className="text-[11px] font-bold tracking-widest text-slate-400 print:text-black uppercase">
              BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
            </div>
            <div className="text-base sm:text-lg font-black tracking-wide text-white print:text-black uppercase">
              SURAT USULAN PENGHAPUSAN BARANG MILIK NEGARA (BMN)
            </div>
            <div className="text-[11px] font-mono text-rose-300 print:text-black">
              Nomor: {disposal.nomorPengajuan} • Tanggal: {disposal.tanggalPengajuan}
            </div>
          </div>

          {/* Letter Details */}
          <div className="text-xs text-slate-300 print:text-black space-y-3 leading-relaxed">
            <div className="grid grid-cols-2 gap-4 pb-2 border-b border-slate-800 print:border-gray-300">
              <div>
                <p><strong>Kepada Yth.</strong></p>
                <p>Kepala Kantor Pelayanan Kekayaan Negara dan Lelang (KPKNL) Manado</p>
                <p className="text-slate-400 print:text-gray-600">di Tempat</p>
              </div>
              <div className="text-right">
                <p><strong>Perihal:</strong></p>
                <p>Usulan Penghapusan BMN Karena Rusak Berat / Usang</p>
                <p className="font-mono text-[11px] text-cyan-300 print:text-black">Satker: 7106 BPS Minut</p>
              </div>
            </div>

            <p>
              Berdasarkan hasil pemeriksaan tim inventarisasi dan verifikasi fisik BMN pada satuan kerja BPS Kabupaten Minahasa Utara, bersama ini kami mengajukan usulan penghapusan atas aset BMN yang telah memenuhi kriteria teknis dan ekonomis sebagai berikut:
            </p>
          </div>

          {/* Table of Disposed Item */}
          <div className="rounded-2xl border border-slate-800 overflow-hidden print:border-black">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 print:bg-gray-100 print:border-black text-[11px] font-bold text-slate-300 print:text-black">
                  <th className="py-2.5 px-3">Kode Barang</th>
                  <th className="py-2.5 px-2 text-center">NUP</th>
                  <th className="py-2.5 px-4">Nama Barang BMN</th>
                  <th className="py-2.5 px-3 text-center">Kondisi Terakhir</th>
                  <th className="py-2.5 px-3 text-right">Nilai Buku (Rp)</th>
                  <th className="py-2.5 px-3 text-center">Status Usulan</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-slate-200 print:text-black">
                  <td className="py-3 px-3 font-mono font-bold text-cyan-300 print:text-black">
                    {disposal.kodeBarang}
                  </td>
                  <td className="py-3 px-2 text-center font-mono font-bold text-rose-400 print:text-black">
                    #{disposal.nup}
                  </td>
                  <td className="py-3 px-4 font-semibold text-white print:text-black">
                    {disposal.assetName}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="font-bold text-rose-400 print:text-black px-2 py-0.5 rounded bg-rose-500/10">
                      {disposal.kondisiTerakhir}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400 print:text-black">
                    Rp {disposal.nilaiBuku.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3 text-center font-semibold text-amber-400 print:text-black">
                    {disposal.status}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Reasoning */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 print:bg-gray-50 print:border-gray-300 text-xs space-y-1.5">
            <div className="font-bold text-white print:text-black">Pertimbangan & Alasan Teknis Penghapusan:</div>
            <div className="text-slate-300 print:text-black italic leading-relaxed">
              "{disposal.alasan}"
            </div>
            {disposal.dokumenPendukung && (
              <div className="text-[11px] text-slate-400 print:text-gray-600 pt-1">
                Lampiran / Dokumen Pendukung: <span className="font-mono text-cyan-300 print:text-black">{disposal.dokumenPendukung}</span>
              </div>
            )}
          </div>

          {/* Legal statement */}
          <div className="text-[11px] text-slate-400 print:text-black leading-relaxed">
            Demikian surat usulan penghapusan ini kami sampaikan, kiranya dapat diproses untuk penerbitan Keputusan Penghapusan BMN sesuai ketentuan perundang-undangan yang berlaku.
          </div>

          {/* Signatures Block */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-xs text-center text-slate-300 print:text-black border-t border-slate-800 print:border-black print-signature-block">
            <div className="space-y-14">
              <div>
                <p className="text-slate-400 print:text-gray-600">Disiapkan oleh,</p>
                <p className="font-bold">Pengelola BMN BPS Minahasa Utara</p>
              </div>
              <div>
                <p className="font-bold underline text-white print:text-black">Christian Pangemanan, S.ST, M.Stat</p>
                <p className="text-[10px] text-slate-400 print:text-gray-600">NIP. 19850320 200801 1 003</p>
              </div>
            </div>

            <div className="space-y-14">
              <div>
                <p className="text-slate-400 print:text-gray-600">Airmadidi, {disposal.tanggalPengajuan}</p>
                <p className="font-bold">Kuasa Pengguna Barang (Kepala BPS Minut)</p>
              </div>
              <div>
                <p className="font-bold underline text-white print:text-black">Ir. Hendra Kawilarang, M.Si</p>
                <p className="text-[10px] text-slate-400 print:text-gray-600">NIP. 19740512 199803 1 002</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900 text-xs print:hidden">
          <span className="text-slate-400 text-[11px]">
            Dokumen resmi usulan penghapusan SIMAN BMN BPS Kabupaten Minahasa Utara.
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
