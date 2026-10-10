import React from 'react';
import { AssetMovement } from '../../types';
import { triggerPrint } from '../../utils/printHelper';
import { OfficialLetterhead } from '../common/OfficialLetterhead';
import { ReportSignatureBlock } from '../common/ReportSignatureBlock';
import { X, Printer, FileText, ArrowRightLeft } from 'lucide-react';

export const BastMovementPrintModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  movement: AssetMovement | null;
}> = ({ isOpen, onClose, movement }) => {
  if (!isOpen || !movement) return null;

  const handlePrint = () => {
    triggerPrint({ title: `BAST_Mutasi_${movement.nomorTransaksi}_BPS_Minahasa_Utara`, orientation: 'landscape' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto printable-modal-overlay">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94vh] printable-modal-card">
        {/* Controls Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Berita Acara Serah Terima (BAST) Mutasi BMN</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                  {movement.nomorTransaksi}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Dokumen resmi pemindahan fisik dan pengalihan tanggung jawab ruangan BMN
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-600/30"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak BAST (Print)</span>
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
              BERITA ACARA SERAH TERIMA PEMINDAHAN / MUTASI ASET BMN
            </div>
            <div className="text-[11px] font-mono text-cyan-300 print:text-black">
              Nomor: BAST-MUTASI/7106/BMN/2026/{movement.nomorTransaksi}
            </div>
          </div>

          {/* Statement Paragraph */}
          <div className="text-xs text-slate-300 print:text-black leading-relaxed space-y-3">
            <p>
              Pada hari ini, tanggal <strong>{movement.tanggal}</strong>, bertempat di Kantor BPS Kabupaten Minahasa Utara, kami yang bertanda tangan di bawah ini:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 print:bg-gray-50 print:border-gray-300">
              <div className="space-y-1">
                <div className="font-bold text-white print:text-black border-b border-slate-800 print:border-gray-200 pb-1">
                  PIHAK PERTAMA (Yang Menyerahkan)
                </div>
                <div>Ruangan Asal: <strong>{movement.lokasiAsalNama}</strong></div>
                <div>Pemohon: <strong>{movement.pemohon}</strong></div>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-white print:text-black border-b border-slate-800 print:border-gray-200 pb-1">
                  PIHAK KEDUA (Yang Menerima)
                </div>
                <div>Ruangan Tujuan: <strong>{movement.lokasiTujuanNama}</strong></div>
                <div>Penanggung Jawab (PIC): <strong>{movement.penanggungJawab}</strong></div>
              </div>
            </div>

            <p>
              Telah melaksanakan serah terima pemindahan fisik Barang Milik Negara (BMN) dengan spesifikasi sebagai berikut:
            </p>
          </div>

          {/* Table of Transferred Asset */}
          <div className="rounded-2xl border border-slate-800 overflow-hidden print:border-black">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 print:bg-gray-100 print:border-black text-[11px] font-bold text-slate-300 print:text-black">
                  <th className="py-2.5 px-3">Kode Barang</th>
                  <th className="py-2.5 px-2 text-center">NUP</th>
                  <th className="py-2.5 px-4">Nama Barang BMN</th>
                  <th className="py-2.5 px-3">Lokasi Asal</th>
                  <th className="py-2.5 px-3">Lokasi Baru</th>
                  <th className="py-2.5 px-3 text-center">Status Mutasi</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-slate-200 print:text-black">
                  <td className="py-3 px-3 font-mono font-bold text-cyan-300 print:text-black">
                    {movement.kodeBarang}
                  </td>
                  <td className="py-3 px-2 text-center font-mono font-bold text-emerald-400 print:text-black">
                    #{movement.nup}
                  </td>
                  <td className="py-3 px-4 font-semibold text-white print:text-black">
                    {movement.assetName}
                  </td>
                  <td className="py-3 px-3">{movement.lokasiAsalNama}</td>
                  <td className="py-3 px-3 font-semibold text-cyan-300 print:text-black">
                    {movement.lokasiTujuanNama}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="font-bold text-emerald-400 print:text-black">
                      {movement.status}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Reason & Notes */}
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 print:bg-gray-50 print:border-gray-300 text-xs space-y-1">
            <div className="text-slate-400 print:text-gray-600 font-semibold">Alasan Pemindahan / Mutasi:</div>
            <div className="text-white print:text-black italic">"{movement.alasan}"</div>
          </div>

          {/* Legal Closing Statement */}
          <div className="text-[11px] text-slate-400 print:text-black leading-relaxed">
            Demikian Berita Acara Serah Terima ini dibuat dengan sebenarnya dalam rangkap secukupnya untuk dipergunakan sebagaimana mestinya. Sejak tanggal serah terima ini, pengawasan fisik dan pencatatan DBR pada ruangan baru menjadi tanggung jawab PIHAK KEDUA.
          </div>

          <ReportSignatureBlock signers={[
            { heading: 'Pemohon / Pihak Pertama', name: movement.pemohon },
            { heading: 'Penanggung Jawab / Pihak Kedua', name: movement.penanggungJawab },
            { heading: 'Kepala Sub Bagian Umum', role: 'Kepala Sub Bagian Umum' }
          ]} />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900 text-xs print:hidden">
          <span className="text-slate-400 text-[11px]">
            Arsip BAST mutasi terdaftar pada sistem penatausahaan BPS Kabupaten Minahasa Utara.
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
