import React, { useEffect, useRef, useState } from 'react';
import { OfficeRoom, BmnAsset } from '../../types';
import { triggerPrint } from '../../utils/printHelper';
import { OfficialLetterhead } from '../common/OfficialLetterhead';
import { ReportSignatureBlock } from '../common/ReportSignatureBlock';
import {
  X,
  Printer,
  Building2,
  FileText,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  QrCode,
  Download,
  Search
} from 'lucide-react';

export const DbrModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  room: OfficeRoom | null;
  assets: BmnAsset[];
}> = ({ isOpen, onClose, room, assets }) => {
  const printContentRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setSearchTerm('');
    setConditionFilter('all');
    setYearFilter('all');
    setStatusFilter('all');
  }, [room?.id, isOpen]);

  if (!isOpen || !room) return null;

  const roomAssets = assets.filter(a => a.ruanganId === room.id);
  const query = searchTerm.trim().toLocaleLowerCase('id-ID');
  const filteredAssets = roomAssets.filter(asset => {
    const matchesSearch = !query || [
      asset.kodeBarang,
      asset.namaBarang,
      String(asset.nup),
      asset.merkType,
      asset.nomorSeri
    ].some(value => value.toLocaleLowerCase('id-ID').includes(query));
    return matchesSearch &&
      (conditionFilter === 'all' || asset.kondisi === conditionFilter) &&
      (yearFilter === 'all' || String(asset.tahunPerolehan) === yearFilter) &&
      (statusFilter === 'all' || asset.status === statusFilter);
  });
  const acquisitionYears = Array.from(new Set(roomAssets.map(asset => asset.tahunPerolehan))).sort((a, b) => b - a);
  const assetStatuses = Array.from(new Set(roomAssets.map(asset => asset.status))).sort((a, b) => a.localeCompare(b, 'id-ID'));
  const totalNilaiPerolehan = roomAssets.reduce((sum, a) => sum + a.nilaiPerolehan, 0);
  const totalNilaiBuku = roomAssets.reduce((sum, a) => sum + a.nilaiBuku, 0);
  const baikCount = roomAssets.filter(a => a.kondisi === 'Baik').length;
  const rusakRinganCount = roomAssets.filter(a => a.kondisi === 'Rusak Ringan').length;
  const rusakBeratCount = roomAssets.filter(a => a.kondisi === 'Rusak Berat').length;

  const handlePrint = () => {
    triggerPrint({ title: `DBR_${room.code}_BPS_Minahasa_Utara`, orientation: 'landscape' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto printable-modal-overlay">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94vh] printable-modal-card">
        {/* Top Controls Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Daftar Barang Ruangan (DBR) Resmi</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                  {room.code}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Format standar penatausahaan BMN Kantor BPS Kabupaten Minahasa Utara
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/30"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / Print DBR</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable DBR Sheet */}
        <div
          ref={printContentRef}
          className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6 bg-slate-950 text-slate-100 print:bg-white print:text-black print:p-0"
        >
          <OfficialLetterhead />
          <div className="text-center pb-1 space-y-1">
            <div className="text-base sm:text-lg font-black tracking-wide text-white print:text-black uppercase">
              DAFTAR BARANG RUANGAN (DBR)
            </div>
            <div className="text-[11px] font-mono text-slate-400 print:text-black">
              Kode UAKPB: 054.01.7106.000000 • Subkelompok Inventaris Kantor
            </div>
          </div>

          {/* Room Metadata Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800 print:bg-gray-50 print:border-gray-300 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-800/80 print:border-gray-200 pb-1">
                <span className="text-slate-400 print:text-gray-600">Kode Ruangan:</span>
                <span className="font-mono font-bold text-cyan-300 print:text-black">{room.code}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/80 print:border-gray-200 pb-1">
                <span className="text-slate-400 print:text-gray-600">Nama Ruangan:</span>
                <span className="font-bold text-white print:text-black">{room.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 print:text-gray-600">Lokasi / Lantai:</span>
                <span className="font-semibold text-slate-200 print:text-black">
                  {room.building} (Lt. {room.floor})
                </span>
              </div>
              {room.description && (
                <div className="flex items-start justify-between gap-4 pt-1">
                  <span className="text-slate-400 print:text-gray-600 shrink-0">Keterangan:</span>
                  <span className="text-right text-slate-200 print:text-black">{room.description}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-800/80 print:border-gray-200 pb-1">
                <span className="text-slate-400 print:text-gray-600">Penanggung Jawab (PIC):</span>
                <span className="font-bold text-white print:text-black">{room.picName}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/80 print:border-gray-200 pb-1">
                <span className="text-slate-400 print:text-gray-600">NIP PIC:</span>
                <span className="font-mono text-slate-300 print:text-black">{room.picNip || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 print:text-gray-600">Total BMN Tercatat:</span>
                <span className="font-bold text-emerald-400 print:text-black">
                  {roomAssets.length} Unit Aset
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 print:hidden">
            <label className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari kode, nama, NUP, merk, atau nomor seri..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                aria-label="Cari aset di DBR"
              />
            </label>
            <select
              value={conditionFilter}
              onChange={e => setConditionFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              aria-label="Filter kondisi aset di DBR"
            >
              <option value="all">Semua Kondisi</option>
              <option value="Baik">Baik</option>
              <option value="Rusak Ringan">Rusak Ringan</option>
              <option value="Rusak Berat">Rusak Berat</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              aria-label="Filter status aset di DBR"
            >
              <option value="all">Semua Status</option>
              {assetStatuses.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              aria-label="Filter tahun perolehan aset di DBR"
            >
              <option value="all">Semua Tahun</option>
              {acquisitionYears.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
            <span className="text-[11px] text-slate-400 self-center">
              Menampilkan {filteredAssets.length} dari {roomAssets.length} aset
            </span>
          </div>

          {/* Table of Assets */}
          <div className="rounded-2xl border border-slate-800 overflow-x-auto print:border-black">
            <table className="w-full min-w-[1050px] print:min-w-0 text-left text-xs print:text-[8px] border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 print:bg-gray-100 print:border-black text-[11px] font-bold text-slate-300 print:text-black">
                  <th className="py-2.5 px-3 text-center w-10">No</th>
                  <th className="py-2.5 px-3">Kode Barang & NUP</th>
                  <th className="py-2.5 px-3">Nama Barang / Spesifikasi</th>
                  <th className="py-2.5 px-3">Merk / Type & Nomor Seri</th>
                  <th className="py-2.5 px-3 text-center">Tahun</th>
                  <th className="py-2.5 px-3 text-center">Kondisi</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Nilai Perolehan (Rp)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Nilai Buku (Rp)</th>
                  <th className="py-2.5 px-3">Penanggung Jawab</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-gray-300">
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-500 print:text-gray-500 text-xs print:hidden">
                      {roomAssets.length === 0 ? 'Belum ada aset BMN yang ditempatkan di ruangan ini.' : 'Tidak ada aset yang sesuai dengan pencarian atau filter.'}
                    </td>
                  </tr>
                ) : (
                  roomAssets.map((asset, idx) => {
                    const matchesSearch = filteredAssets.some(filteredAsset => filteredAsset.id === asset.id);
                    return (
                    <tr
                      key={asset.id}
                      className={`hover:bg-slate-900/50 print:hover:bg-transparent text-slate-200 print:text-black ${matchesSearch ? '' : 'hidden print:table-row'}`}
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400 print:text-gray-600">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-bold text-cyan-300 print:text-black text-[11px]">
                          {asset.kodeBarang}
                        </div>
                        <div className="text-[10px] text-slate-400 print:text-gray-600 font-mono">
                          NUP #{asset.nup}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white print:text-black">{asset.namaBarang}</div>
                        <div className="text-[10px] text-slate-400 print:text-gray-600">
                          {asset.kategori} {asset.subkategori ? `• ${asset.subkategori}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-black">
                        <div>{asset.merkType || '-'}</div>
                        {asset.nomorSeri && (
                          <div className="text-[10px] text-slate-500 print:text-gray-500 font-mono">
                            SN: {asset.nomorSeri}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                        {asset.tahunPerolehan}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            asset.kondisi === 'Baik'
                              ? 'bg-emerald-500/10 text-emerald-400 print:text-black'
                              : asset.kondisi === 'Rusak Ringan'
                              ? 'bg-amber-500/10 text-amber-400 print:text-black'
                              : 'bg-rose-500/10 text-rose-400 print:text-black'
                          }`}
                        >
                          {asset.kondisi}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400 print:text-black">
                        Rp {asset.nilaiPerolehan.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400 print:text-black">
                        Rp {asset.nilaiBuku.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3">{asset.penanggungJawab || '-'}</td>
                      <td className="py-2.5 px-3">{asset.status}</td>
                      <td className="py-2.5 px-3 min-w-40 whitespace-normal">{asset.keterangan || '-'}</td>
                    </tr>
                    );
                  })
                )}
              </tbody>
              {roomAssets.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-900 border-t border-slate-700 print:bg-gray-100 print:border-black font-bold">
                    <td colSpan={6} className="py-2.5 px-3 text-right text-xs text-slate-300 print:text-black">
                      Total BMN di Ruangan ({roomAssets.length} unit):
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-300 print:text-black text-xs font-bold">
                      Rp {totalNilaiPerolehan.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-300 print:text-black text-xs font-bold">
                      Rp {totalNilaiBuku.toLocaleString('id-ID')}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Condition Breakdown */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 print:text-black border-t border-slate-800 print:border-gray-300 pt-3">
            <div className="flex items-center gap-4">
              <span>Rekap Kondisi:</span>
              <span className="text-emerald-400 print:text-black font-semibold">Baik: {baikCount} unit</span>
              <span className="text-amber-400 print:text-black font-semibold">Rusak Ringan: {rusakRinganCount} unit</span>
              <span className="text-rose-400 print:text-black font-semibold">Rusak Berat: {rusakBeratCount} unit</span>
            </div>
            <div className="font-mono text-[11px]">
              Dicetak pada: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          <ReportSignatureBlock signers={[
            { heading: 'Penanggung Jawab Ruangan', name: room.picName, nip: room.picNip },
            { heading: 'Kepala Sub Bagian Umum', role: 'Kepala Sub Bagian Umum' }
          ]} />
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900 text-xs print:hidden">
          <span className="text-slate-400 text-[11px]">
            Lembar DBR wajib dipasang di setiap ruangan kerja sesuai PMK No. 181/PMK.06/2016.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
