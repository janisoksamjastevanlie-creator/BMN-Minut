import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { InventoryRequestItem } from '../../types';
import confetti from 'canvas-confetti';
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  X,
  Send,
  Building,
  User,
  Calendar,
  AlertCircle,
  Clock,
  Sparkles,
  Boxes,
  Plus,
  Trash2
} from 'lucide-react';

interface StockRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultItemId?: string;
}

interface RequestItemDraft {
  key: string;
  itemId: string;
  jumlahDiminta: string;
  spesifikasi: string;
  catatan: string;
}

export const StockRequestModal: React.FC<StockRequestModalProps> = ({
  isOpen,
  onClose,
  defaultItemId
}) => {
  const { inventoryItems, rooms, addInventoryRequest, currentUser, setActiveView } = useApp();

  const initialItemId = defaultItemId || inventoryItems[0]?.id || '';
  const [requestItems, setRequestItems] = useState<RequestItemDraft[]>([
    { key: crypto.randomUUID(), itemId: initialItemId, jumlahDiminta: '2', spesifikasi: '', catatan: '' }
  ]);
  const [unitKerja, setUnitKerja] = useState('Fungsi Statistik Sosial');
  const [ruangan, setRuangan] = useState('Ruang Statistik Sosial');
  const [keperluan, setKeperluan] = useState('Administrasi kegiatan survei lapangan BPS Minahasa Utara');
  const [prioritas, setPrioritas] = useState<'Rendah' | 'Normal' | 'Tinggi' | 'Mendesak'>('Normal');
  const [catatan, setCatatan] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedId, setSubmittedId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  if (!isOpen) return null;

  const requestLines = requestItems.map(line => ({
    ...line,
    item: inventoryItems.find(item => item.id === line.itemId),
    quantity: Number(line.jumlahDiminta)
  }));
  const invalidLines = requestLines.flatMap((line, index) => {
    const errors: string[] = [];
    if (!line.item) errors.push(`Baris ${index + 1}: pilih barang dari master persediaan.`);
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) errors.push(`Baris ${index + 1}: jumlah harus bilangan bulat lebih dari nol.`);
    return errors;
  });
  const hasDuplicateItem = requestItems.some((line, index) =>
    line.itemId && requestItems.some((otherLine, otherIndex) => otherIndex !== index && otherLine.itemId === line.itemId)
  );
  const requestedItemCount = requestLines.filter(line => line.item).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (requestLines.length === 0) {
      setFormError('Tambahkan minimal satu barang ke dalam permohonan.');
      return;
    }
    if (requestLines.length > 100) {
      setFormError('Satu permohonan maksimal berisi 100 jenis barang.');
      return;
    }
    if (hasDuplicateItem) {
      setFormError('Barang yang sama tidak boleh ditambahkan lebih dari satu kali. Ubah jumlah pada baris barang tersebut.');
      return;
    }
    if (invalidLines.length > 0) {
      setFormError(invalidLines.join(' '));
      return;
    }
    if (!unitKerja.trim() || !keperluan.trim()) {
      setFormError('Unit kerja dan keperluan wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const items: InventoryRequestItem[] = requestLines.map(line => ({
        itemId: line.item!.id,
        namaBarang: line.item!.nama,
        kodeBarang: line.item!.kodeBarang,
        jumlahDiminta: line.quantity,
        satuan: line.item!.satuan,
        spesifikasi: line.spesifikasi.trim() || undefined,
        catatan: line.catatan.trim() || undefined
      }));
      const firstItem = items[0];
      const newReq = addInventoryRequest({
        pemohonNama: currentUser?.name || 'Pegawai BPS Minahasa Utara',
        unitKerja,
        ruangan,
        itemId: firstItem.itemId,
        namaBarang: firstItem.namaBarang,
        jumlahDiminta: firstItem.jumlahDiminta,
        satuan: firstItem.satuan,
        items,
        keperluan: keperluan.trim(),
        prioritas,
        catatan: catatan.trim() || undefined
      });

      setSubmittedId(newReq.nomorPermintaan);
      setIsSuccess(true);
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch {
        // Confetti is decorative; a rendering failure should not affect submission.
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Permohonan gagal disimpan. Silakan coba kembali.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setIsSuccess(false);
    setRequestItems([{ key: crypto.randomUUID(), itemId: defaultItemId || inventoryItems[0]?.id || '', jumlahDiminta: '2', spesifikasi: '', catatan: '' }]);
    setKeperluan('Administrasi kegiatan survei lapangan BPS Minahasa Utara');
    setCatatan('');
    setFormError('');
  };

  const updateLine = (key: string, updates: Partial<RequestItemDraft>) => {
    setFormError('');
    setRequestItems(current => current.map(line => line.key === key ? { ...line, ...updates } : line));
  };

  const addLine = () => {
    if (requestItems.length >= 100) {
      setFormError('Satu permohonan maksimal berisi 100 jenis barang.');
      return;
    }
    setFormError('');
    setRequestItems(current => [...current, {
      key: crypto.randomUUID(),
      itemId: '',
      jumlahDiminta: '1',
      spesifikasi: '',
      catatan: ''
    }]);
  };

  const removeLine = (key: string) => {
    setFormError('');
    setRequestItems(current => current.filter(line => line.key !== key));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Formulir Permohonan & Permintaan ATK/ARK</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                  Online BPS Minut
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pengajuan barang persediaan habis pakai untuk kelancaran tugas dinas
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Permohonan Berhasil Dikirim!</h3>
                <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                  Permohonan barang nomor <span className="font-mono text-cyan-400 font-bold">{submittedId}</span> telah tercatat dalam sistem dan otomatis masuk ke antrean verifikasi Pengelola BMN/Gudang.
                </p>
              </div>

              <div className="p-4 max-w-md mx-auto bg-slate-950 border border-slate-800 rounded-xl text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Jumlah jenis barang:</span>
                  <span className="font-semibold text-white">{requestItems.length}</span>
                </div>
                <div className="border-t border-slate-800 pt-2">
                  {requestItems.map((line, index) => {
                    const item = inventoryItems.find(candidate => candidate.id === line.itemId);
                    return (
                      <div key={line.key} className="flex justify-between gap-3 py-1">
                        <span className="text-slate-300">{index + 1}. {item?.nama}</span>
                        <span className="shrink-0 font-bold text-cyan-300">{line.jumlahDiminta} {item?.satuan}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status Alur:</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold text-[10px]">
                    Diajukan (Menunggu Verifikasi)
                  </span>
                </div>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
                >
                  Buat Permohonan Lain
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setActiveView('requests');
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30"
                >
                  Lihat Daftar Permohonan
                </button>
              </div>
            </div>
          ) : (
            <form id="stockRequestForm" onSubmit={handleSubmit} className="space-y-4">
              {/* Request item rows */}
              <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-white">Daftar Barang yang Dimohon</h3>
                  <p className="mt-0.5 text-[10px] text-slate-400">Pilih barang dari master; kode dan satuan mengikuti data persediaan.</p>
                </div>
                <button type="button" onClick={addLine} disabled={requestItems.length >= 100} className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[11px] font-bold text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                  <Plus className="h-3.5 w-3.5" /> Tambah Barang
                </button>
              </div>
              <div className="space-y-3">
                {requestItems.map((line, index) => {
                  const item = inventoryItems.find(candidate => candidate.id === line.itemId);
                  const isDuplicate = Boolean(line.itemId && requestItems.some((candidate, candidateIndex) => candidateIndex !== index && candidate.itemId === line.itemId));
                  const hasInvalidQuantity = line.jumlahDiminta !== '' && (!Number.isSafeInteger(Number(line.jumlahDiminta)) || Number(line.jumlahDiminta) <= 0);
                  const overStock = item && Number(line.jumlahDiminta) > item.stokSaatIni;
                  return (
                    <div key={line.key} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-800 bg-slate-900/80 p-3 md:grid-cols-[2.5rem_minmax(0,1fr)] lg:grid-cols-[2.5rem_minmax(0,2fr)_minmax(7rem,0.8fr)_minmax(0,1.6fr)_2.5rem] lg:items-center lg:gap-4">
                      <div className="text-[10px] font-bold text-indigo-300 md:col-span-1">#{index + 1}</div>
                      <label className="min-w-0 text-[10px] font-semibold text-slate-300 md:col-span-1 lg:col-span-1">
                        Nama barang <span className="text-rose-400">*</span>
                        <select value={line.itemId} onChange={event => {
                          const chosen = event.target.value;
                          if (chosen && requestItems.some(candidate => candidate.key !== line.key && candidate.itemId === chosen)) {
                            setFormError('Barang yang sama tidak dapat ditambahkan lebih dari sekali. Silakan ubah jumlah pada baris yang sudah ada.');
                            return;
                          }
                          updateLine(line.key, { itemId: chosen });
                        }} className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-white focus:border-indigo-500 focus:outline-none">
                          <option value="">Pilih barang persediaan</option>
                          {inventoryItems.map(candidate => <option key={candidate.id} value={candidate.id}>[{candidate.jenis}] {candidate.nama}</option>)}
                        </select>
                        {item && <span className="mt-1 block break-words font-mono font-normal leading-4 text-slate-500">Kode: {item.kodeBarang} • {item.subkategori}</span>}
                        {!item && <span className="mt-1 block font-normal text-rose-300">Baris {index + 1}: barang wajib dipilih dari master persediaan.</span>}
                      </label>
                      <label className="min-w-0 text-[10px] font-semibold text-slate-300">
                        Jumlah <span className="text-rose-400">*</span>
                        <input type="number" min="1" step="1" value={line.jumlahDiminta} onChange={event => updateLine(line.key, { jumlahDiminta: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs font-mono font-bold text-white focus:border-indigo-500 focus:outline-none" />
                        {item && <span className="mt-1 block break-words font-normal leading-4 text-slate-500">{item.satuan} • stok {item.stokSaatIni}</span>}
                      </label>
                      <label className="min-w-0 text-[10px] font-semibold text-slate-300">
                        Spesifikasi / catatan barang
                        <input type="text" maxLength={250} value={line.spesifikasi} onChange={event => updateLine(line.key, { spesifikasi: event.target.value })} placeholder="Spesifikasi (opsional)" className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" />
                        <input type="text" maxLength={250} value={line.catatan} onChange={event => updateLine(line.key, { catatan: event.target.value })} placeholder="Catatan khusus (opsional)" className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none" />
                      </label>
                      <div className="flex items-center justify-end md:col-span-2 lg:col-span-1">
                        <button type="button" onClick={() => removeLine(line.key)} disabled={requestItems.length === 1} aria-label={`Hapus barang baris ${index + 1}`} className="rounded-lg p-2 text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-30">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {isDuplicate && <p className="text-[10px] text-rose-300 md:col-span-2 lg:col-span-4">Barang ini sudah ada pada baris lain.</p>}
                      {hasInvalidQuantity && <p className="text-[10px] text-rose-300 md:col-span-2 lg:col-span-4">Jumlah harus bilangan bulat lebih besar dari nol.</p>}
                      {overStock && <p className="flex items-center gap-1 text-[10px] text-amber-300 md:col-span-2 lg:col-span-4"><AlertTriangle className="h-3 w-3 shrink-0" />Jumlah melebihi stok tersedia ({item.stokSaatIni} {item.satuan}); permohonan tetap dapat diajukan.</p>}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-right text-[10px] text-slate-400">{requestedItemCount} barang dipilih</p>
              </section>

              {/* Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tingkat Urgensi / Prioritas</label>
                  <select
                    value={prioritas}
                    onChange={e => setPrioritas(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Normal">🟢 Normal (Rutin Kantor)</option>
                    <option value="Tinggi">🟡 Tinggi (Mendekati Batas Pelaporan)</option>
                    <option value="Mendesak">🔴 Mendesak (Survei Hari Ini)</option>
                    <option value="Rendah">⚪ Rendah (Persiapan Cadangan)</option>
                  </select>
                </div>
              </div>

              {/* Unit Kerja & Ruangan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Unit Kerja Pemohon <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={unitKerja}
                    onChange={e => setUnitKerja(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Fungsi Statistik Sosial">Fungsi Statistik Sosial</option>
                    <option value="Fungsi Statistik Produksi">Fungsi Statistik Produksi</option>
                    <option value="Fungsi Statistik Distribusi">Fungsi Statistik Distribusi</option>
                    <option value="Fungsi Neraca Wilayah">Fungsi Neraca Wilayah (Nerwilis)</option>
                    <option value="Fungsi IPDS & TI">Fungsi IPDS & TI</option>
                    <option value="Subbagian Umum">Subbagian Umum (Tata Usaha)</option>
                    <option value="Pelayanan Statistik Terpadu">Pelayanan Statistik Terpadu (PST)</option>
                    <option value="Pimpinan / Kepala BPS">Pimpinan / Kepala BPS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Ruangan Kerja Tujuan
                  </label>
                  <select
                    value={ruangan}
                    onChange={e => setRuangan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {rooms.map(r => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Keperluan */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Keperluan Penggunaan / Uraian Tugas <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={keperluan}
                  onChange={e => setKeperluan(e.target.value)}
                  placeholder="Misal: Pelaksanaan Survei Biaya Hidup (SBH) / Rapat Koordinasi..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                ></textarea>
              </div>

              {/* Catatan Tambahan */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  placeholder="Dibutuhkan sebelum pukul 14.00 WITA..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                />
              </div>

              {formError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{formError}</div>}
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
          >
            Batal
          </button>

          {!isSuccess && (
            <button
              type="submit"
              form="stockRequestForm"
              disabled={isSubmitting || requestItems.length === 0 || hasDuplicateItem || invalidLines.length > 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                isSubmitting || requestItems.length === 0 || hasDuplicateItem || invalidLines.length > 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Mengirim Permohonan...' : 'Kirim Formulir Permohonan'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
