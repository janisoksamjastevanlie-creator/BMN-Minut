import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { triggerPrint } from '../utils/printHelper';
import {
  FileText,
  Printer,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Box,
  Boxes,
  Calendar,
  Building,
  User,
  ArrowRight
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { assets, inventoryItems, stockInList, stockOutList, movements, maintenances, rooms } = useApp();

  const [activeReport, setActiveReport] = useState<
    | 'DAFTAR_BMN'
    | 'KONDISI_BMN'
    | 'PENYUSUTAN_BMN'
    | 'SALDO_PERSEDIAAN'
    | 'MUTASI_PERSEDIAAN'
    | 'STOK_MINIMUM'
  >('DAFTAR_BMN');

  const handlePrint = () => {
    triggerPrint({ title: `Laporan_${activeReport}_BPS_Minahasa_Utara` });
  };

  const handleExportCSV = () => {
    let headers = '';
    let rows: string[] = [];
    let filename = '';

    if (activeReport === 'DAFTAR_BMN') {
      headers = 'NUP,Nama Barang,Kode Barang,Merk,Ruangan,Kondisi,Nilai Buku';
      rows = assets.map(a => `"${a.nup}","${a.namaBarang}","${a.kodeBarang}","${a.merkType}","${a.ruanganNama}","${a.kondisi}","${a.nilaiBuku}"`);
      filename = 'Laporan_Daftar_BMN_BPS_Minut.csv';
    } else if (activeReport === 'KONDISI_BMN') {
      headers = 'NUP,Nama Barang,Kode Barang,Ruangan,Kondisi,Penanggung Jawab,Status';
      rows = assets.map(a => `"${a.nup}","${a.namaBarang}","${a.kodeBarang}","${a.ruanganNama}","${a.kondisi}","${a.penanggungJawab}","${a.status}"`);
      filename = 'Laporan_Rekapitulasi_Kondisi_BMN_BPS_Minut.csv';
    } else if (activeReport === 'PENYUSUTAN_BMN') {
      headers = 'NUP,Nama Barang,Kode Barang,Tahun,Nilai Perolehan,Akumulasi Penyusutan,Nilai Buku';
      rows = assets.map(a => `"${a.nup}","${a.namaBarang}","${a.kodeBarang}","${a.tahunPerolehan}","${a.nilaiPerolehan}","${a.akumulasiPenyusutan}","${a.nilaiBuku}"`);
      filename = 'Laporan_Penyusutan_Nilai_Buku_BMN_BPS_Minut.csv';
    } else if (activeReport === 'SALDO_PERSEDIAAN') {
      headers = 'Kode Barang,Nama Persediaan,Jenis,Rak,Bin Code,Stok,Satuan,Harga,Total Nilai';
      rows = inventoryItems.map(i => `"${i.kodeBarang}","${i.nama}","${i.jenis}","${i.rak}","${i.binCode}","${i.stokSaatIni}","${i.satuan}","${i.hargaSatuan}","${i.totalNilai}"`);
      filename = 'Laporan_Saldo_Persediaan_BPS_Minut.csv';
    } else {
      headers = 'Barang,Jenis,Stok,Minimum,Status';
      rows = inventoryItems.filter(i => i.status !== 'Aman').map(i => `"${i.nama}","${i.jenis}","${i.stokSaatIni}","${i.stokMinimum}","${i.status}"`);
      filename = 'Laporan_Stok_Kritis_BPS_Minut.csv';
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Laporan Eksekutif BMN & Persediaan</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
              Format Resmi SAKTI / SIMAN
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Generate laporan penatausahaan BMN dan posisi saldo persediaan untuk audit BPK / Inspektorat
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-blue-600/20"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Dokumen Resmi</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector Tabs (No print) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bg-slate-900 p-2 rounded-2xl border border-slate-800 no-print">
        <button
          onClick={() => setActiveReport('DAFTAR_BMN')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            activeReport === 'DAFTAR_BMN' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Laporan Daftar BMN
        </button>

        <button
          onClick={() => setActiveReport('KONDISI_BMN')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            activeReport === 'KONDISI_BMN' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Laporan Kondisi Aset
        </button>

        <button
          onClick={() => setActiveReport('PENYUSUTAN_BMN')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            activeReport === 'PENYUSUTAN_BMN' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Laporan Nilai & Penyusutan
        </button>

        <button
          onClick={() => setActiveReport('SALDO_PERSEDIAAN')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            activeReport === 'SALDO_PERSEDIAAN' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Laporan Saldo Persediaan
        </button>

        <button
          onClick={() => setActiveReport('STOK_MINIMUM')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            activeReport === 'STOK_MINIMUM' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Laporan Stok Menipis & Kritis
        </button>
      </div>

      {/* Official Printable Report Paper Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl print-page">
        {/* Official Kop Surat BPS Minahasa Utara */}
        <div className="border-b-2 border-slate-700 pb-4 text-center">
          <div className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">
            BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
          </div>
          <h2 className="text-lg md:text-xl font-extrabold text-white mt-1 uppercase tracking-wide">
            {activeReport === 'DAFTAR_BMN' && 'DAFTAR BARANG KUASA PENGGUNA (BMN)'}
            {activeReport === 'KONDISI_BMN' && 'LAPORAN REKAPITULASI KONDISI FISIK BMN'}
            {activeReport === 'PENYUSUTAN_BMN' && 'LAPORAN PENYUSUTAN & NILAI BUKU BMN'}
            {activeReport === 'SALDO_PERSEDIAAN' && 'LAPORAN REKAPITULASI SALDO PERSEDIAAN ATK & ARK'}
            {activeReport === 'STOK_MINIMUM' && 'LAPORAN PERINGATAN DINI PERSEDIAAN DI BAWAH BATAS MINIMUM'}
          </h2>
          <div className="text-xs text-slate-400 font-mono mt-1">
            KODE SATKER: 7106 • TAHUN ANGGARAN 2026 • PERIODE: SEMESTER I 2026
          </div>
        </div>

        {/* Report Content Table */}
        <div className="overflow-x-auto">
          {activeReport === 'DAFTAR_BMN' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase text-[10px]">
                  <th className="py-2 px-2">No</th>
                  <th className="py-2 px-2">Kode Barang</th>
                  <th className="py-2 px-2">NUP</th>
                  <th className="py-2 px-4">Nama Barang</th>
                  <th className="py-2 px-2">Merk/Type</th>
                  <th className="py-2 px-2">Ruangan</th>
                  <th className="py-2 px-2">Kondisi</th>
                  <th className="py-2 px-3 text-right">Nilai Buku (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {assets.map((a, idx) => (
                  <tr key={a.id}>
                    <td className="py-2 px-2 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-2 font-mono text-slate-300">{a.kodeBarang}</td>
                    <td className="py-2 px-2 font-mono font-bold text-cyan-400">#{a.nup}</td>
                    <td className="py-2 px-4 font-semibold text-white">{a.namaBarang}</td>
                    <td className="py-2 px-2">{a.merkType}</td>
                    <td className="py-2 px-2">{a.ruanganNama}</td>
                    <td className="py-2 px-2 font-semibold">{a.kondisi}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                      Rp {a.nilaiBuku.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReport === 'KONDISI_BMN' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase text-[10px]">
                  <th className="py-2 px-2">No</th>
                  <th className="py-2 px-2">NUP</th>
                  <th className="py-2 px-4">Nama Barang & Merk</th>
                  <th className="py-2 px-2">Lokasi Ruangan</th>
                  <th className="py-2 px-2">Penanggung Jawab</th>
                  <th className="py-2 px-2 text-center">Kondisi Fisik</th>
                  <th className="py-2 px-2 text-center">Status Operasional</th>
                  <th className="py-2 px-3 text-right">Nilai Buku (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {assets.map((a, idx) => (
                  <tr key={a.id}>
                    <td className="py-2 px-2 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-2 font-mono font-bold text-cyan-400">#{a.nup}</td>
                    <td className="py-2 px-4">
                      <div className="font-semibold text-white">{a.namaBarang}</div>
                      <div className="text-[10px] text-slate-400">{a.merkType}</div>
                    </td>
                    <td className="py-2 px-2">{a.ruanganNama}</td>
                    <td className="py-2 px-2">{a.penanggungJawab}</td>
                    <td className="py-2 px-2 text-center font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        a.kondisi === 'Baik' ? 'bg-emerald-500/10 text-emerald-400' :
                        a.kondisi === 'Rusak Ringan' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-rose-500/10 text-rose-400'
                      }`}>
                        {a.kondisi}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center text-[11px]">{a.status}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                      Rp {a.nilaiBuku.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReport === 'PENYUSUTAN_BMN' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase text-[10px]">
                  <th className="py-2 px-2">No</th>
                  <th className="py-2 px-2">NUP</th>
                  <th className="py-2 px-4">Nama Barang BMN</th>
                  <th className="py-2 px-2 text-center">Tahun Perolehan</th>
                  <th className="py-2 px-3 text-right">Nilai Perolehan (Rp)</th>
                  <th className="py-2 px-3 text-right">Akumulasi Penyusutan (Rp)</th>
                  <th className="py-2 px-3 text-right">Nilai Buku Sisa (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {assets.map((a, idx) => (
                  <tr key={a.id}>
                    <td className="py-2 px-2 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-2 font-mono font-bold text-cyan-400">#{a.nup}</td>
                    <td className="py-2 px-4 font-semibold text-white">{a.namaBarang}</td>
                    <td className="py-2 px-2 text-center font-mono">{a.tahunPerolehan}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      Rp {a.nilaiPerolehan.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-rose-300">
                      Rp {(a.akumulasiPenyusutan || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                      Rp {a.nilaiBuku.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReport === 'SALDO_PERSEDIAAN' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase text-[10px]">
                  <th className="py-2 px-2">No</th>
                  <th className="py-2 px-2">Kode Barang</th>
                  <th className="py-2 px-4">Nama Persediaan</th>
                  <th className="py-2 px-2">Jenis</th>
                  <th className="py-2 px-2">Lokasi Rak</th>
                  <th className="py-2 px-2 text-right">Stok Fisik</th>
                  <th className="py-2 px-2 text-right">Harga Satuan (Rp)</th>
                  <th className="py-2 px-3 text-right">Total Nilai (Rp)</th>
                  <th className="py-2 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {inventoryItems.map((i, idx) => (
                  <tr key={i.id}>
                    <td className="py-2 px-2 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-2 font-mono text-slate-300">{i.kodeBarang}</td>
                    <td className="py-2 px-4 font-semibold text-white">{i.nama}</td>
                    <td className="py-2 px-2">{i.jenis}</td>
                    <td className="py-2 px-2 font-mono text-cyan-400">{i.binCode}</td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-white">
                      {i.stokSaatIni} {i.satuan}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-slate-300">
                      Rp {i.hargaSatuan.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                      Rp {i.totalNilai.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-2 text-center font-bold">{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeReport === 'STOK_MINIMUM' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase text-[10px]">
                  <th className="py-2 px-2">No</th>
                  <th className="py-2 px-4">Nama Barang Persediaan</th>
                  <th className="py-2 px-2">Jenis</th>
                  <th className="py-2 px-2">Rak & Bin</th>
                  <th className="py-2 px-2 text-right">Stok Saat Ini</th>
                  <th className="py-2 px-2 text-right">Batas Minimum</th>
                  <th className="py-2 px-2 text-right">Rekomendasi Pengadaan</th>
                  <th className="py-2 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {inventoryItems.filter(i => i.status !== 'Aman').map((i, idx) => (
                  <tr key={i.id}>
                    <td className="py-2 px-2 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-4 font-semibold text-white">{i.nama}</td>
                    <td className="py-2 px-2">{i.jenis}</td>
                    <td className="py-2 px-2 font-mono text-cyan-400">{i.binCode}</td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-rose-400">
                      {i.stokSaatIni} {i.satuan}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">{i.stokMinimum} {i.satuan}</td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-emerald-400">
                      +{(i.ratarataPenggunaanBulanan * 2)} {i.satuan}
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-amber-400">{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Tanda Tangan Pejabat Pengesah (Official Signatures) */}
        <div className="pt-8 border-t border-slate-800 grid grid-cols-2 text-xs text-center text-slate-300 print:text-black print-signature-block">
          <div>
            <div>Mengetahui,</div>
            <div className="font-semibold text-white mt-0.5">Kuasa Pengguna Barang</div>
            <div className="font-bold text-white mt-14 underline">Ir. Hendra Kawilarang, M.Si</div>
            <div className="font-mono text-[11px] text-slate-400">NIP: 197405121998031002</div>
          </div>

          <div>
            <div>Airmadidi, Minahasa Utara</div>
            <div className="font-semibold text-white mt-0.5">Pengelola Barang Milik Negara & Persediaan</div>
            <div className="font-bold text-white mt-14 underline">Christian Pangemanan, S.ST</div>
            <div className="font-mono text-[11px] text-slate-400">NIP: 198503202008011003</div>
          </div>
        </div>
      </div>
    </div>
  );
};
