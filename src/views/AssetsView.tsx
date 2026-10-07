import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { BmnAsset, AssetCondition } from '../types';
import { AssetDetailModal } from '../components/bmn/AssetDetailModal';
import { AssetFormModal } from '../components/bmn/AssetFormModal';
import { ImportAssetModal } from '../components/bmn/ImportAssetModal';
import { AssetListPrintModal } from '../components/bmn/AssetListPrintModal';
import { getAssetPhotoUrl } from '../utils/assetImages';
import {
  Search,
  Filter,
  Plus,
  Download,
  FileSpreadsheet,
  UploadCloud,
  QrCode,
  Eye,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  SlidersHorizontal,
  ArrowUpDown,
  Printer
} from 'lucide-react';

export const AssetsView: React.FC = () => {
  const { assets, deleteAsset, setSelectedAsset, rooms, setActiveView, hasPermission } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterKategori, setFilterKategori] = useState<string>('all');
  const [filterKondisi, setFilterKondisi] = useState<string>('all');
  const [filterRuangan, setFilterRuangan] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'nup' | 'nama' | 'nilai' | 'tahun'>('nup');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Modals
  const [detailModalAsset, setDetailModalAsset] = useState<BmnAsset | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<BmnAsset | null>(null);

  // Categories list
  const categories = useMemo(() => {
    return Array.from(new Set(assets.map(a => a.kategori)));
  }, [assets]);

  // Filtered & Sorted Assets
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchSearch =
        searchTerm === '' ||
        asset.namaBarang.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.kodeBarang.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(asset.nup).includes(searchTerm) ||
        asset.merkType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.penanggungJawab.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.nomorSeri.toLowerCase().includes(searchTerm.toLowerCase());

      const matchCat = filterKategori === 'all' || asset.kategori === filterKategori;
      const matchKondisi = filterKondisi === 'all' || asset.kondisi === filterKondisi;
      const matchRuang = filterRuangan === 'all' || asset.ruanganId === filterRuangan;

      return matchSearch && matchCat && matchKondisi && matchRuang;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'nup') comparison = a.nup - b.nup;
      else if (sortBy === 'nama') comparison = a.namaBarang.localeCompare(b.namaBarang);
      else if (sortBy === 'nilai') comparison = a.nilaiBuku - b.nilaiBuku;
      else if (sortBy === 'tahun') comparison = a.tahunPerolehan - b.tahunPerolehan;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [assets, searchTerm, filterKategori, filterKondisi, filterRuangan, sortBy, sortOrder]);

  const totalPages = Math.ceil(filteredAssets.length / itemsPerPage) || 1;
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAssets.slice(start, start + itemsPerPage);
  }, [filteredAssets, currentPage]);

  const handleExportCSV = () => {
    const headers = ['Kode Barang,NUP,Nama Barang,Kategori,Merk,Nomor Seri,Tahun,Nilai Perolehan,Penyusutan,Nilai Buku,Kondisi,Ruangan,Penanggung Jawab,Status'];
    const rows = filteredAssets.map(a =>
      `"${a.kodeBarang}","${a.nup}","${a.namaBarang}","${a.kategori}","${a.merkType}","${a.nomorSeri}","${a.tahunPerolehan}","${a.nilaiPerolehan}","${a.akumulasiPenyusutan}","${a.nilaiBuku}","${a.kondisi}","${a.ruanganNama}","${a.penanggungJawab}","${a.status}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daftar_BMN_BPS_Minut_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Metrics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Daftar Barang Milik Negara (BMN)</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold font-mono">
              {assets.length} Unit Terdaftar
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pengelolaan aset inventaris dinas Badan Pusat Statistik Kabupaten Minahasa Utara
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveView('office-3d')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <span>3D Asset Mapping</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export Excel / CSV</span>
          </button>

          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <Printer className="w-4 h-4 text-blue-400" />
            <span>Cetak Daftar BMN</span>
          </button>

          {hasPermission('manageAssets') && (
            <>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors border border-blue-500/40 shadow-sm"
              >
                <UploadCloud className="w-4 h-4 text-blue-400" />
                <span>Import File</span>
              </button>

              <button
                onClick={() => {
                  setEditingAsset(null);
                  setIsFormOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-blue-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Aset BMN</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari aset berdasarkan nama, kode barang, NUP, nomor seri, merk, penanggung jawab..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {/* Filter Kategori */}
            <select
              value={filterKategori}
              onChange={e => {
                setFilterKategori(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Semua Kategori</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Filter Kondisi */}
            <select
              value={filterKondisi}
              onChange={e => {
                setFilterKondisi(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Semua Kondisi</option>
              <option value="Baik">Kondisi Baik</option>
              <option value="Rusak Ringan">Rusak Ringan</option>
              <option value="Rusak Berat">Rusak Berat</option>
            </select>

            {/* Filter Ruangan */}
            <select
              value={filterRuangan}
              onChange={e => {
                setFilterRuangan(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Semua Ruangan</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.code} - {r.name}
                </option>
              ))}
            </select>

            {/* Sort Order */}
            <button
              onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
              title="Urutkan"
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Assets Content: Mobile Card View (md:hidden) & Desktop Table View (hidden md:block) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* MOBILE CARD VIEW */}
        <div className="md:hidden divide-y divide-slate-800/80">
          {paginatedAssets.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 text-xs">
              Tidak ditemukan aset BMN yang sesuai dengan kriteria filter.
            </div>
          ) : (
            paginatedAssets.map(asset => (
              <div key={asset.id} className="p-4 space-y-3 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                      NUP #{asset.nup}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 truncate max-w-[140px]">
                      {asset.kodeBarang}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      asset.kondisi === 'Baik'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : asset.kondisi === 'Rusak Ringan'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {asset.kondisi}
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <div
                    onClick={() => setDetailModalAsset(asset)}
                    className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 cursor-pointer relative"
                  >
                    <img
                      src={asset.fotoUrl || getAssetPhotoUrl(asset.namaBarang, asset.kategori)}
                      alt={asset.namaBarang}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getAssetPhotoUrl(asset.namaBarang, asset.kategori);
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3
                      onClick={() => setDetailModalAsset(asset)}
                      className="text-xs font-bold text-white hover:text-blue-400 cursor-pointer leading-snug line-clamp-2"
                    >
                      {asset.namaBarang}
                    </h3>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">{asset.merkType}</div>
                    <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="text-blue-400 font-medium">{asset.ruanganNama}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 truncate max-w-[120px]">PIC: {asset.penanggungJawab}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Nilai Buku:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      Rp {asset.nilaiBuku.toLocaleString('id-ID')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setDetailModalAsset(asset)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-medium flex items-center gap-1 min-h-[36px]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Detail</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedAsset(asset);
                        setActiveView('office-3d');
                      }}
                      title="Lihat QR & Lokasi"
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>

                    {hasPermission('manageAssets') && (
                      <>
                        <button
                          onClick={() => {
                            setEditingAsset(asset);
                            setIsFormOpen(true);
                          }}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Yakin ingin menghapus ${asset.namaBarang} (NUP: ${asset.nup}) dari SIMAN?`)) {
                              deleteAsset(asset.id);
                            }
                          }}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">NUP</th>
                <th className="py-3 px-4">Nama Barang & Spesifikasi</th>
                <th className="py-3 px-3">Kode BMN</th>
                <th className="py-3 px-3">Kategori</th>
                <th className="py-3 px-3">Ruangan & PIC</th>
                <th className="py-3 px-3">Kondisi</th>
                <th className="py-3 px-3 text-right">Nilai Buku (Rp)</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {paginatedAssets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Tidak ditemukan aset BMN yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                paginatedAssets.map(asset => (
                  <tr key={asset.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* NUP */}
                    <td className="py-3 px-3 font-mono font-bold text-cyan-400">
                      #{asset.nup}
                    </td>

                    {/* Nama Barang with Photo */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          onClick={() => setDetailModalAsset(asset)}
                          className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 cursor-pointer group/img relative hover:border-blue-500/50 transition-all shadow-sm"
                          title="Klik untuk melihat foto & rincian aset"
                        >
                          <img
                            src={asset.fotoUrl || getAssetPhotoUrl(asset.namaBarang, asset.kategori)}
                            alt={asset.namaBarang}
                            className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-200"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = getAssetPhotoUrl(asset.namaBarang, asset.kategori);
                            }}
                          />
                        </div>
                        <div>
                          <div
                            onClick={() => setDetailModalAsset(asset)}
                            className="font-semibold text-white leading-tight hover:text-blue-400 cursor-pointer transition-colors"
                          >
                            {asset.namaBarang}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {asset.merkType} • SN: {asset.nomorSeri}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Kode BMN */}
                    <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                      {asset.kodeBarang}
                    </td>

                    {/* Kategori */}
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                        {asset.kategori}
                      </span>
                    </td>

                    {/* Ruangan & PIC */}
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-200">{asset.ruanganNama}</div>
                      <div className="text-[10px] text-slate-400">{asset.penanggungJawab}</div>
                    </td>

                    {/* Kondisi */}
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        asset.kondisi === 'Baik' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        asset.kondisi === 'Rusak Ringan' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {asset.kondisi === 'Baik' && <CheckCircle2 className="w-3 h-3" />}
                        {asset.kondisi === 'Rusak Ringan' && <AlertTriangle className="w-3 h-3" />}
                        {asset.kondisi === 'Rusak Berat' && <AlertCircle className="w-3 h-3" />}
                        <span>{asset.kondisi}</span>
                      </span>
                    </td>

                    {/* Nilai Buku */}
                    <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                      Rp {asset.nilaiBuku.toLocaleString('id-ID')}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 text-center">
                      <span className="text-[10px] font-medium text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded">
                        {asset.status}
                      </span>
                    </td>

                    {/* Aksi */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setDetailModalAsset(asset)}
                          title="Lihat Detail Profil Digital & QR"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {hasPermission('manageAssets') && (
                          <>
                            <button
                              onClick={() => {
                                setEditingAsset(asset);
                                setIsFormOpen(true);
                              }}
                              title="Edit Aset"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition-colors"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Yakin ingin menghapus ${asset.namaBarang} (NUP: ${asset.nup}) dari SIMAN?`)) {
                                  deleteAsset(asset.id);
                                }
                              }}
                              title="Hapus Aset"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Menampilkan <span className="font-bold text-white">{(currentPage - 1) * itemsPerPage + 1}</span> -{' '}
            <span className="font-bold text-white">{Math.min(currentPage * itemsPerPage, filteredAssets.length)}</span> dari{' '}
            <span className="font-bold text-white">{filteredAssets.length}</span> aset BMN
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 disabled:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 bg-slate-800 rounded-lg text-white font-mono font-bold">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 disabled:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Asset Modals */}
      {detailModalAsset && (
        <AssetDetailModal
          asset={detailModalAsset}
          onClose={() => setDetailModalAsset(null)}
        />
      )}

      {isFormOpen && (
        <AssetFormModal
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingAsset(null);
          }}
          initialAsset={editingAsset}
        />
      )}

      {isImportModalOpen && (
        <ImportAssetModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
      )}

      {/* Official BMN Inventory List Print Modal */}
      {isPrintModalOpen && (
        <AssetListPrintModal
          isOpen={isPrintModalOpen}
          assets={filteredAssets}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}
    </div>
  );
};
