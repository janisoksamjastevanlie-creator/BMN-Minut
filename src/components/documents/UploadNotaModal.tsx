import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { DocumentItem, InventoryType, ReceiptItem } from '../../types';
import confetti from 'canvas-confetti';
import {
  Receipt,
  UploadCloud,
  FileText,
  FileImage,
  CheckCircle2,
  X,
  Plus,
  Trash2,
  Store,
  Calendar,
  AlertCircle,
  HelpCircle,
  Tag,
  DollarSign
} from 'lucide-react';

interface UploadNotaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ItemRow {
  id: string;
  itemId?: string;
  namaBarang: string;
  kategori: InventoryType;
  satuan: string;
  customSatuan?: string;
  jumlah: number;
  hargaSatuan: number;
}

const COMMON_UNITS = [
  'Rim',
  'Pcs',
  'Buah',
  'Kotak',
  'Dus',
  'Pak',
  'Lusin',
  'Botol',
  'Roll',
  'Set',
  'Batang',
  'Lembar',
  'Galon',
  'Unit',
  '+ Tambah Satuan Baru'
];

export const UploadNotaModal: React.FC<UploadNotaModalProps> = ({ isOpen, onClose }) => {
  const { registerUploadedDocument, inventoryItems } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadKeyRef = useRef('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const [tanggal, setTanggal] = useState(today);
  const [nomorNota, setNomorNota] = useState('');
  const [namaToko, setNamaToko] = useState('');
  const [kategoriNota, setKategoriNota] = useState<InventoryType>('ATK');
  const [keterangan, setKeterangan] = useState('');
  const [status, setStatus] = useState<DocumentItem['status']>('Sah');

  // Dynamic Item Rows
  const [rows, setRows] = useState<ItemRow[]>([
    {
      id: crypto.randomUUID(),
      namaBarang: '',
      kategori: 'ATK',
      satuan: 'Pcs',
      jumlah: 1,
      hargaSatuan: 0
    }
  ]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Suggestions from master inventory
  const inventorySuggestions = useMemo(() => {
    return inventoryItems.map(item => ({
      id: item.id,
      nama: item.nama,
      jenis: item.jenis,
      satuan: item.satuan,
      hargaSatuan: item.hargaSatuan
    }));
  }, [inventoryItems]);

  if (!isOpen) return null;

  const totalNilaiNota = rows.reduce((sum, r) => sum + (Number(r.jumlah) || 0) * (Number(r.hargaSatuan) || 0), 0);

  const handleAddRow = () => {
    setRows(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        namaBarang: '',
        kategori: kategoriNota,
        satuan: 'Pcs',
        jumlah: 1,
        hargaSatuan: 0
      }
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length === 1) {
      setRows([
        {
          id: crypto.randomUUID(),
          namaBarang: '',
          kategori: kategoriNota,
          satuan: 'Pcs',
          jumlah: 1,
          hargaSatuan: 0
        }
      ]);
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleRowChange = (id: string, field: keyof ItemRow, value: any) => {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        return updated;
      })
    );
  };

  const handleSelectMasterItem = (rowId: string, itemName: string) => {
    const matched = inventorySuggestions.find(i => i.nama.toLowerCase() === itemName.toLowerCase());
    setRows(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r;
        if (matched) {
          return {
            ...r,
            itemId: matched.id,
            namaBarang: matched.nama,
            kategori: matched.jenis,
            satuan: matched.satuan,
            hargaSatuan: matched.hargaSatuan || r.hargaSatuan
          };
        }
        return {
          ...r,
          itemId: undefined,
          namaBarang: itemName
        };
      })
    );
  };

  const handleFile = (file: File) => {
    setSelectedFile(file);
    uploadKeyRef.current = crypto.randomUUID();
    setUploadError('');
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Lampirkan berkas bukti fisik nota (PDF atau Foto).');
      return;
    }
    if (!namaToko.trim()) {
      setUploadError('Nama toko / vendor wajib diisi.');
      return;
    }
    if (rows.length === 0) {
      setUploadError('Tambahkan minimal satu baris rincian barang nota belanja.');
      return;
    }

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.namaBarang.trim()) {
        setUploadError(`Baris ${i + 1}: Nama barang belum diisi.`);
        return;
      }
      const finalUnit = r.satuan === '+ Tambah Satuan Baru' ? (r.customSatuan || '').trim() : r.satuan.trim();
      if (!finalUnit) {
        setUploadError(`Baris ${i + 1}: Satuan barang belum ditentukan.`);
        return;
      }
      if (Number(r.jumlah) <= 0 || !Number.isSafeInteger(Number(r.jumlah))) {
        setUploadError(`Baris ${i + 1}: Jumlah harus berupa bilangan bulat positif.`);
        return;
      }
      if (Number(r.hargaSatuan) < 0 || isNaN(Number(r.hargaSatuan))) {
        setUploadError(`Baris ${i + 1}: Harga satuan tidak valid.`);
        return;
      }
    }

    const receiptItemsPayload: ReceiptItem[] = rows.map(r => {
      const finalUnit = r.satuan === '+ Tambah Satuan Baru' ? (r.customSatuan || '').trim() : r.satuan.trim();
      const qty = Number(r.jumlah);
      const price = Number(r.hargaSatuan);
      return {
        id: crypto.randomUUID(),
        itemId: r.itemId || undefined,
        namaBarang: r.namaBarang.trim(),
        kategori: r.kategori,
        satuan: finalUnit,
        jumlah: qty,
        hargaSatuan: price,
        totalHarga: qty * price
      };
    });

    const docTitle = `Nota Belanja ${kategoriNota} - ${namaToko.trim()}`;
    const generatedNumber = nomorNota.trim() || `NOTA/${kategoriNota}/${tanggal.replace(/-/g, '')}/${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    const metadata = {
      title: docTitle,
      category: 'Nota',
      number: generatedNumber,
      date: tanggal,
      status,
      description: keterangan.trim(),
      tags: ['Nota Belanja', kategoriNota, namaToko.trim()],
      namaToko: namaToko.trim(),
      kategoriNota,
      totalNilaiNota,
      items: receiptItemsPayload
    };

    const encodedMetadata = btoa(
      Array.from(new TextEncoder().encode(JSON.stringify(metadata)), byte => String.fromCharCode(byte)).join('')
    ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    setIsUploading(true);
    setUploadError('');

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': selectedFile.type || 'application/octet-stream',
          'X-Document-Metadata': encodedMetadata,
          'X-File-Name': encodeURIComponent(selectedFile.name),
          'X-Upload-Id': uploadKeyRef.current
        },
        body: selectedFile
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unggah nota belanja gagal.');
      if (!result.document || !Number.isInteger(result.revision)) {
        throw new Error('Respons server untuk dokumen tidak valid.');
      }
      registerUploadedDocument(result.document, result.revision, result.auditLog);
      setIsSuccess(true);
      try {
        confetti({
          particleCount: 75,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch {
        // Confetti optional
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Unggah nota belanja gagal.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[94vh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Upload Nota Belanja ATK / ARK</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                  Pencatatan Belanja
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pengarsipan bukti kuitansi & rincian belanja operasional tanpa mengubah saldo fisik stok persediaan
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {isSuccess ? (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Nota Belanja Berhasil Diarsipkan!</h3>
                <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                  Nota belanja senilai <span className="text-emerald-400 font-bold">{formatRupiah(totalNilaiNota)}</span> dari{' '}
                  <span className="text-white font-semibold">"{namaToko}"</span> beserta bukti berkas fisik telah tercatat secara permanen di arsip dokumen.
                </p>
                <div className="mt-3 inline-block px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-[11px] text-slate-400">
                  ℹ️ Sesuai SOP, transaksi ini tidak mengubah saldo fisik barang persediaan.
                </div>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    uploadKeyRef.current = '';
                    setNomorNota('');
                    setNamaToko('');
                    setKeterangan('');
                    setRows([
                      {
                        id: crypto.randomUUID(),
                        namaBarang: '',
                        kategori: 'ATK',
                        satuan: 'Pcs',
                        jumlah: 1,
                        hargaSatuan: 0
                      }
                    ]);
                    setUploadError('');
                    setIsSuccess(false);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
                >
                  Upload Nota Lainnya
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-600/30"
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>
          ) : (
            <form id="uploadNotaForm" onSubmit={handleSubmit} className="space-y-5">
              {/* Info Banner: Non-mutating Stock */}
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2.5 text-xs text-blue-300">
                <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Catatan Aturan Sistem: </span>
                  Pengunggahan Nota Belanja ini khusus untuk pengarsipan dokumen pertanggungjawaban belanja dan rincian kuitansi.{' '}
                  <span className="underline font-medium">Tidak ada mutasi otomatis terhadap stok persediaan gudang.</span> Jika barang akan dimasukkan ke saldo fisik, lakukan melalui menu Barang Masuk.
                </div>
              </div>

              {/* Form Header Nota */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Tanggal Nota <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggal}
                    onChange={e => setTanggal(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Nomor Nota / Bukti
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: NOTA-2026/04/001"
                    value={nomorNota}
                    onChange={e => setNomorNota(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Nama Toko / Vendor <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Toko Buku Gramedia"
                    value={namaToko}
                    onChange={e => setNamaToko(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Kategori Utama <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={kategoriNota}
                    onChange={e => {
                      const newCat = e.target.value as InventoryType;
                      setKategoriNota(newCat);
                      setRows(prev => prev.map(r => ({ ...r, kategori: newCat })));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="ATK">ATK (Alat Tulis Kantor)</option>
                    <option value="ARK">ARK (Alat Rumah Tangga & Kebersihan)</option>
                  </select>
                </div>
              </div>

              {/* Rincian Barang (Line Items) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Rincian Barang yang Dibelanjakan
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {rows.length} Barang
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Baris</span>
                  </button>
                </div>

                <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950/40">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-slate-900/80 text-[11px] text-slate-400 border-b border-slate-800">
                        <th className="p-2.5 font-semibold w-10 text-center">No</th>
                        <th className="p-2.5 font-semibold min-w-[200px]">Nama Barang</th>
                        <th className="p-2.5 font-semibold w-24">Kategori</th>
                        <th className="p-2.5 font-semibold w-36">Satuan</th>
                        <th className="p-2.5 font-semibold w-24 text-right">Jumlah</th>
                        <th className="p-2.5 font-semibold w-32 text-right">Harga Satuan (Rp)</th>
                        <th className="p-2.5 font-semibold w-36 text-right">Subtotal (Rp)</th>
                        <th className="p-2.5 font-semibold w-12 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {rows.map((row, idx) => {
                        const subtotal = (Number(row.jumlah) || 0) * (Number(row.hargaSatuan) || 0);
                        const isCustomUnit = row.satuan === '+ Tambah Satuan Baru';
                        return (
                          <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-2 text-center text-slate-500 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="p-2">
                              <div>
                                <input
                                  type="text"
                                  list={`inventory-list-${row.id}`}
                                  value={row.namaBarang}
                                  placeholder="Ketik atau pilih barang..."
                                  onChange={e => handleSelectMasterItem(row.id, e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                                />
                                <datalist id={`inventory-list-${row.id}`}>
                                  {inventorySuggestions.map(item => (
                                    <option key={item.id} value={item.nama}>
                                      {item.jenis} - {item.satuan}
                                    </option>
                                  ))}
                                </datalist>
                                {row.itemId && (
                                  <span className="text-[10px] text-emerald-400 mt-0.5 block">
                                    ✓ Terhubung dengan master persediaan
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <select
                                value={row.kategori}
                                onChange={e => handleRowChange(row.id, 'kategori', e.target.value as InventoryType)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                              >
                                <option value="ATK">ATK</option>
                                <option value="ARK">ARK</option>
                              </select>
                            </td>
                            <td className="p-2 space-y-1">
                              <select
                                value={row.satuan}
                                onChange={e => handleRowChange(row.id, 'satuan', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                              >
                                {COMMON_UNITS.map(u => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                              {isCustomUnit && (
                                <input
                                  type="text"
                                  placeholder="Nama satuan baru..."
                                  value={row.customSatuan || ''}
                                  onChange={e => handleRowChange(row.id, 'customSatuan', e.target.value)}
                                  className="w-full bg-slate-900 border border-amber-500/50 rounded px-2 py-1 text-[11px] text-amber-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                                />
                              )}
                            </td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={row.jumlah}
                                onChange={e => handleRowChange(row.id, 'jumlah', parseInt(e.target.value) || 0)}
                                className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-amber-500 font-mono"
                              />
                            </td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={row.hargaSatuan}
                                onChange={e => handleRowChange(row.id, 'hargaSatuan', parseFloat(e.target.value) || 0)}
                                className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-amber-500 font-mono"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-semibold text-amber-300">
                              {formatRupiah(subtotal)}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(row.id)}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Hapus Baris"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900/90 border-t border-slate-700 font-bold text-xs">
                        <td colSpan={6} className="p-3 text-right text-slate-300">
                          Total Nilai Nota Belanja:
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-400 text-sm">
                          {formatRupiah(totalNilaiNota)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Upload Bukti Berkas Fisik Nota */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Bukti Berkas Fisik Nota / Kuitansi (PDF / Gambar) <span className="text-rose-400">*</span>
                </label>
                {!selectedFile ? (
                  <div
                    onDragOver={e => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleFile(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-5 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-slate-700 hover:border-slate-600 bg-slate-950/60 hover:bg-slate-950'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleFile(e.target.files[0]);
                        }
                      }}
                    />
                    <UploadCloud className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-white">
                      Klik untuk memilih berkas foto/scan nota atau seret ke sini
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Mendukung PDF, JPG, PNG (Maksimal 15 MB)
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950 border border-slate-700 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {selectedFile.type.includes('pdf') ? (
                        <FileText className="w-6 h-6 text-rose-400" />
                      ) : (
                        <FileImage className="w-6 h-6 text-amber-400" />
                      )}
                      <div>
                        <div className="text-xs font-bold text-white truncate max-w-sm">
                          {selectedFile.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {(selectedFile.size / 1024).toFixed(1)} KB • Siap diunggah
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        uploadKeyRef.current = '';
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Keterangan Tambahan */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Keterangan Tambahan
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan belanja, keperluan penggunaan, nomor SPJ jika ada..."
                  value={keterangan}
                  onChange={e => setKeterangan(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {uploadError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-xs text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isUploading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-amber-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Mengunggah Nota...</span>
                    </>
                  ) : (
                    <>
                      <Receipt className="w-4 h-4" />
                      <span>Simpan & Arsipkan Nota</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
