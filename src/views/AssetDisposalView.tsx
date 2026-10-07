import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AssetDisposal, DisposalStatus } from '../types';
import {
  Trash2,
  Plus,
  CheckCircle2,
  Clock,
  FileText,
  AlertTriangle,
  X,
  Check
} from 'lucide-react';

export const AssetDisposalView: React.FC = () => {
  const { disposals, assets, addAssetDisposal, updateDisposalStatus, currentUser } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(assets.find(a => a.kondisi === 'Rusak Berat')?.id || assets[0]?.id || '');
  const [alasan, setAlasan] = useState('Kerusakan berat tidak ekonomis untuk diperbaiki dan teknologi usang');
  const [dokumen, setDokumen] = useState('Surat Usulan Penghapusan BMN Kemenkeu');

  const handleCreateDisposal = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find(a => a.id === selectedAssetId);
    if (!asset) return;

    addAssetDisposal({
      assetId: asset.id,
      assetName: asset.namaBarang,
      kodeBarang: asset.kodeBarang,
      nup: asset.nup,
      alasan,
      kondisiTerakhir: asset.kondisi,
      nilaiBuku: asset.nilaiBuku,
      dokumenPendukung: dokumen,
      status: 'Pengajuan',
      tanggalPengajuan: new Date().toISOString().split('T')[0],
      penyetuju: 'Kepala BPS Kabupaten Minahasa Utara'
    });

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Usulan Penghapusan Aset BMN</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold font-mono">
              {disposals.length} Berkas Usulan
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Penatausahaan BMN rusak berat untuk proses persetujuan penghapusan dari KPKNL dan SIMAN Kemenkeu
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-rose-600/20 w-fit"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Usulan Penghapusan</span>
        </button>
      </div>

      {/* Disposals Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">No Pengajuan</th>
                <th className="py-3 px-3">Tanggal</th>
                <th className="py-3 px-4">Aset BMN</th>
                <th className="py-3 px-3">Kondisi Terakhir</th>
                <th className="py-3 px-3 text-right">Nilai Buku (Rp)</th>
                <th className="py-3 px-3">Alasan Usulan</th>
                <th className="py-3 px-3 text-center">Status Alur</th>
                <th className="py-3 px-3 text-center">Aksi Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {disposals.map(dsp => (
                <tr key={dsp.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-slate-300">
                    {dsp.nomorPengajuan}
                  </td>
                  <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                    {dsp.tanggalPengajuan}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{dsp.assetName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      NUP {dsp.nup} • {dsp.kodeBarang}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20 text-[10px]">
                      {dsp.kondisiTerakhir}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                    Rp {dsp.nilaiBuku.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3">
                    <div className="text-slate-300 line-clamp-2">{dsp.alasan}</div>
                    {dsp.dokumenPendukung && (
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <FileText className="w-3 h-3 text-slate-400" />
                        <span>{dsp.dokumenPendukung}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      {dsp.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    {dsp.status === 'Draft' && (
                      <button
                        onClick={() => updateDisposalStatus(dsp.id, 'Pengajuan')}
                        className="px-2 py-1 bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white rounded text-[10px] font-bold"
                      >
                        Ajukan
                      </button>
                    )}
                    {dsp.status === 'Pengajuan' && (
                      <button
                        onClick={() => updateDisposalStatus(dsp.id, 'Verifikasi')}
                        className="px-2 py-1 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600 hover:text-white rounded text-[10px] font-bold"
                      >
                        Verifikasi Tim
                      </button>
                    )}
                    {dsp.status === 'Verifikasi' && (
                      <button
                        onClick={() => updateDisposalStatus(dsp.id, 'Persetujuan')}
                        className="px-2 py-1 bg-amber-600/20 text-amber-300 hover:bg-amber-600 hover:text-white rounded text-[10px] font-bold"
                      >
                        Persetujuan Pimpinan
                      </button>
                    )}
                    {dsp.status === 'Persetujuan' && (
                      <button
                        onClick={() => updateDisposalStatus(dsp.id, 'Selesai')}
                        className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold"
                      >
                        Terbitkan SK Penghapusan
                      </button>
                    )}
                    {dsp.status === 'Selesai' && (
                      <span className="text-rose-400 text-[10px] font-bold flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Dihapuskan</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Disposal Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-600/20 text-rose-400 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Buat Usulan Penghapusan BMN</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDisposal} className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Pilih Aset BMN Rusak Berat
                </label>
                <select
                  value={selectedAssetId}
                  onChange={e => setSelectedAssetId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.namaBarang} (NUP #{a.nup}) - Kondisi: {a.kondisi}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Alasan Penghapusan
                </label>
                <textarea
                  required
                  rows={3}
                  value={alasan}
                  onChange={e => setAlasan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                ></textarea>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Dokumen Pendukung / Rekomendasi Teknis
                </label>
                <input
                  type="text"
                  value={dokumen}
                  onChange={e => setDokumen(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Kirim Usulan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
