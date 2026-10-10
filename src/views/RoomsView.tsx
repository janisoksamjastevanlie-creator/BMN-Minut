import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { OfficeRoom } from '../types';
import { RoomModal } from '../components/rooms/RoomModal';
import { DbrModal } from '../components/rooms/DbrModal';
import {
  Building2,
  Plus,
  Search,
  Filter,
  FileText,
  Boxes,
  UserCheck,
  Edit2,
  Trash2,
  Sparkles,
  Layers,
  LayoutGrid,
  List,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Eye,
  Building,
  ShieldAlert,
  Printer
} from 'lucide-react';

export const RoomsView: React.FC = () => {
  const {
    rooms,
    assets,
    deleteRoom,
    isRoomModalOpen,
    setIsRoomModalOpen,
    editingRoom,
    setEditingRoom,
    setActiveView
  } = useApp();

  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'assets' | 'value'>('code');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // DBR View Modal state
  const [selectedDbrRoom, setSelectedDbrRoom] = useState<OfficeRoom | null>(null);

  // Delete feedback state
  const [deleteStatus, setDeleteStatus] = useState<{ message: string; isError: boolean } | null>(null);

  // Filter buildings list
  const buildingsList = Array.from(new Set(rooms.map(r => r.building))).filter(Boolean);

  // Filtered rooms
  const filteredRooms = rooms.filter(room => {
    const query = searchTerm.trim().toLocaleLowerCase('id-ID');
    const matchesSearch = !query || [room.name, room.code, room.picName, room.picNip || '', room.building]
      .some(value => value.toLocaleLowerCase('id-ID').includes(query));

    const matchesBuilding = selectedBuilding === 'all' || room.building === selectedBuilding;
    const matchesFloor = selectedFloor === 'all' || String(room.floor) === selectedFloor;
    const matchesType = selectedType === 'all' || room.roomType === selectedType;

    return matchesSearch && matchesBuilding && matchesFloor && matchesType;
  }).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'id-ID');
    if (sortBy === 'assets') {
      return assets.filter(asset => asset.ruanganId === b.id).length - assets.filter(asset => asset.ruanganId === a.id).length;
    }
    if (sortBy === 'value') {
      const valueA = assets.filter(asset => asset.ruanganId === a.id).reduce((sum, asset) => sum + asset.nilaiBuku, 0);
      const valueB = assets.filter(asset => asset.ruanganId === b.id).reduce((sum, asset) => sum + asset.nilaiBuku, 0);
      return valueB - valueA;
    }
    return a.code.localeCompare(b.code, 'id-ID', { numeric: true });
  });

  // Calculate global summary stats
  const roomIds = new Set(rooms.map(room => room.id));
  const distributedAssets = assets.filter(asset => roomIds.has(asset.ruanganId));
  const unassignedAssetsCount = assets.length - distributedAssets.length;
  const totalAssetsCount = distributedAssets.length;
  const totalAssetsValue = distributedAssets.reduce((sum, a) => sum + a.nilaiBuku, 0);
  const totalBaikCount = distributedAssets.filter(a => a.kondisi === 'Baik').length;
  const percentBaik = totalAssetsCount > 0 ? Math.round((totalBaikCount / totalAssetsCount) * 100) : 100;

  const handleOpenAddRoom = () => {
    setEditingRoom(null);
    setIsRoomModalOpen(true);
  };

  const handleOpenEditRoom = (room: OfficeRoom) => {
    setEditingRoom(room);
    setIsRoomModalOpen(true);
  };

  const handleDeleteRoom = (room: OfficeRoom) => {
    const assignedAssets = assets.filter(a => a.ruanganId === room.id);
    if (assignedAssets.length > 0) {
      setDeleteStatus({
        message: `Tidak dapat menghapus ruangan "${room.name}". Terdapat ${assignedAssets.length} unit aset BMN terdaftar. Pindahkan aset terlebih dahulu.`,
        isError: true
      });
      setTimeout(() => setDeleteStatus(null), 5000);
      return;
    }

    if (window.confirm(`Yakin ingin menghapus ruangan "${room.name} (${room.code})"?`)) {
      const res = deleteRoom(room.id);
      setDeleteStatus({
        message: res.message,
        isError: !res.success
      });
      setTimeout(() => setDeleteStatus(null), 4000);
    }
  };

  const areAllVisibleRoomsSelected =
    filteredRooms.length > 0 && filteredRooms.every(room => selectedRoomIds.has(room.id));

  const toggleRoomSelection = (id: string) => {
    setSelectedRoomIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRoomSelection = () => {
    setSelectedRoomIds(areAllVisibleRoomsSelected ? new Set() : new Set(filteredRooms.map(room => room.id)));
  };

  const handleBulkDeleteRooms = () => {
    const selectedRooms = rooms.filter(room => selectedRoomIds.has(room.id));
    if (selectedRooms.length === 0) {
      setDeleteStatus({ message: 'Pilih data ruangan yang ingin dihapus terlebih dahulu.', isError: true });
      setTimeout(() => setDeleteStatus(null), 4000);
      return;
    }
    if (!window.confirm('Apakah Anda yakin ingin menghapus data yang dipilih?')) return;

    let deletedCount = 0;
    const errors: string[] = [];
    selectedRooms.forEach(room => {
      try {
        const result = deleteRoom(room.id);
        if (result.success) deletedCount += 1;
        else errors.push(result.message);
      } catch (error) {
        errors.push(`Ruangan "${room.name}": ${error instanceof Error ? error.message : 'terjadi kesalahan saat menghapus.'}`);
      }
    });
    setSelectedRoomIds(new Set());
    setDeleteStatus({
      message: errors.length > 0
        ? `${deletedCount} ruangan berhasil dihapus. ${errors.length} gagal: ${errors.join(' ')}`
        : `${deletedCount} ruangan berhasil dihapus.`,
      isError: errors.length > 0
    });
    setTimeout(() => setDeleteStatus(null), 5000);
  };

  const handleView3D = (room: OfficeRoom) => {
    setActiveView('office-3d');
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert for action status */}
      {deleteStatus && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between shadow-xl transition-all ${
            deleteStatus.isError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {deleteStatus.isError ? (
              <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            )}
            <span>{deleteStatus.message}</span>
          </div>
          <button
            onClick={() => setDeleteStatus(null)}
            className="text-slate-400 hover:text-white px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">Manajemen Ruangan & DBR</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
              {rooms.length} Ruangan Terdaftar
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pengelolaan unit kerja kantor BPS Kabupaten Minahasa Utara, penanggung jawab BMN (PIC), dan lembar DBR resmi
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setActiveView('office-3d')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors border border-slate-700"
          >
            <Building2 className="w-4 h-4 text-cyan-400" />
            <span>Denah 3D Digital Twin</span>
          </button>

          <button
            onClick={handleOpenAddRoom}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>+ Buat Ruangan Baru</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Ruangan</div>
            <div className="text-xl font-black text-white mt-1">{rooms.length} Ruangan</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Semua lantai & gedung</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Aset Ditempatkan</div>
            <div className="text-xl font-black text-cyan-300 mt-1">{totalAssetsCount} Unit</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Inventaris BMN tercatat</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Nilai Buku</div>
            <div className="text-lg font-black text-emerald-400 font-mono mt-1">
              Rp {Math.round(totalAssetsValue / 1000000)} Jt
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Nilai aset di ruangan</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Aset Belum Berlokasi</div>
            <div className="text-xl font-black text-amber-300 mt-1">{unassignedAssetsCount} Unit</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Belum terhubung ke ruangan terdaftar</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Kondisi Prima</div>
            <div className="text-xl font-black text-purple-300 mt-1">{percentBaik}% Baik</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{totalBaikCount} unit kondisi baik</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search Control Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari kode, nama, gedung, atau penanggung jawab..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Tampilan Kartu"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Kartu</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Tampilan Tabel"
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">Tabel</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-1 text-slate-400 text-[11px] font-semibold">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <span>Filter:</span>
          </div>

          {/* Gedung Filter */}
          <select
            value={selectedBuilding}
            onChange={e => setSelectedBuilding(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">Semua Gedung</option>
            {buildingsList.map(b => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Lantai Filter */}
          <select
            value={selectedFloor}
            onChange={e => setSelectedFloor(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">Semua Lantai</option>
            <option value="1">Lantai 1</option>
            <option value="2">Lantai 2</option>
            <option value="3">Lantai 3</option>
          </select>

          {/* Room Type Filter */}
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">Semua Tipe Ruang</option>
            <option value="Ruang Kerja">Ruang Kerja</option>
            <option value="Ruang Rapat">Ruang Rapat</option>
            <option value="Ruang Server">Ruang Server / TI</option>
            <option value="Gudang">Gudang</option>
            <option value="Layanan Publik">Layanan Publik (PST)</option>
            <option value="Arsip & Dokumen">Arsip & Dokumen</option>
          </select>

          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            Urutkan:
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="code">Kode ruangan</option>
              <option value="name">Nama ruangan</option>
              <option value="assets">Jumlah aset terbanyak</option>
              <option value="value">Nilai BMN tertinggi</option>
            </select>
          </label>

          {(selectedBuilding !== 'all' || selectedFloor !== 'all' || selectedType !== 'all' || searchTerm) && (
            <button
              onClick={() => {
                setSelectedBuilding('all');
                setSelectedFloor('all');
                setSelectedType('all');
                setSearchTerm('');
              }}
              className="text-[11px] text-blue-400 hover:underline px-2 py-1"
            >
              Reset Filter
            </button>
          )}

          <span className="text-[11px] text-slate-500 ml-auto">
            Menampilkan {filteredRooms.length} dari {rooms.length} ruangan
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={areAllVisibleRoomsSelected}
            onChange={toggleAllRoomSelection}
            className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500"
            aria-label="Pilih semua ruangan yang ditampilkan"
          />
          Pilih Semua
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{selectedRoomIds.size} ruangan dipilih</span>
          <button
            onClick={handleBulkDeleteRooms}
            disabled={selectedRoomIds.size === 0}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Hapus Terpilih
          </button>
        </div>
      </div>

      {/* Main Content: Grid or Table View */}
      {filteredRooms.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">Tidak ada ruangan yang cocok</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Coba sesuaikan kata kunci pencarian atau ubah filter gedung/lantai untuk menemukan ruangan yang dicari.
          </p>
          <button
            onClick={handleOpenAddRoom}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-lg shadow-blue-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Ruangan Baru</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map(room => {
            const roomAssets = assets.filter(a => a.ruanganId === room.id);
            const totalNilai = roomAssets.reduce((sum, a) => sum + a.nilaiBuku, 0);
            const baikCount = roomAssets.filter(a => a.kondisi === 'Baik').length;
            const rusakCount = roomAssets.filter(a => a.kondisi !== 'Baik').length;

            return (
              <div
                key={room.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 shadow-xl group relative overflow-hidden"
              >
                {/* Top colored accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{ backgroundColor: room.color || '#3b82f6' }}
                />

                {/* Card Top: Code, Name, Floor */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedRoomIds.has(room.id)}
                        onChange={() => toggleRoomSelection(room.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500"
                        aria-label={`Pilih ruangan ${room.name}`}
                      />
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: room.color || '#3b82f6' }}
                      />
                      <span className="font-mono font-bold text-xs text-cyan-300">
                        {room.code}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        Lt. {room.floor}
                      </span>
                      {room.roomType && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                          {room.roomType}
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-white mt-2 group-hover:text-blue-300 transition-colors">
                    {room.name}
                  </h3>
                  <div className="text-[11px] text-slate-400 mt-0.5">{room.building}</div>

                  {room.description && (
                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-2 italic bg-slate-950/40 p-2 rounded-xl border border-slate-800/60">
                      "{room.description}"
                    </p>
                  )}
                </div>

                {/* PIC Info Block */}
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Penanggung Jawab:</span>
                    </span>
                  </div>
                  <div className="font-semibold text-white truncate">{room.picName}</div>
                  <div className="text-[10px] font-mono text-slate-400">
                    NIP: {room.picNip || '-'}
                  </div>
                </div>

                {/* Assets Summary Stats */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
                  <div className="p-2 rounded-xl bg-slate-950/50">
                    <span className="text-[10px] text-slate-400 block">Total Aset BMN:</span>
                    <span className="font-bold text-white text-xs">{roomAssets.length} Unit</span>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      <span className="text-emerald-400 font-semibold">{baikCount} Baik</span>
                      {rusakCount > 0 && <span className="text-rose-400 ml-1">({rusakCount} Servis)</span>}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-950/50">
                    <span className="text-[10px] text-slate-400 block">Nilai Buku BMN:</span>
                    <span className="font-bold text-emerald-400 font-mono text-xs">
                      Rp {roomAssets.length > 0 ? (totalNilai / 1000000).toFixed(1) + ' Jt' : '0'}
                    </span>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                      {room.areaSqm ? `${room.areaSqm} m²` : 'BPS Minut'}
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1.5">
                  <button
                    onClick={() => setSelectedDbrRoom(room)}
                    className="flex-1 py-1.5 px-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-blue-500/20 transition-all"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Format DBR</span>
                  </button>

                  <button
                    onClick={() => handleView3D(room)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Lihat Denah 3D Twin"
                  >
                    <Eye className="w-4 h-4 text-cyan-400" />
                  </button>

                  <button
                    onClick={() => handleOpenEditRoom(room)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Ubah Data Ruangan"
                  >
                    <Edit2 className="w-4 h-4 text-amber-400" />
                  </button>

                  <button
                    onClick={() => handleDeleteRoom(room)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Hapus Ruangan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW (High-Density) */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={areAllVisibleRoomsSelected}
                      onChange={toggleAllRoomSelection}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500"
                      aria-label="Pilih semua ruangan yang ditampilkan"
                    />
                  </th>
                  <th className="py-3 px-4">Kode & Ruangan</th>
                  <th className="py-3 px-4">Gedung & Lantai</th>
                  <th className="py-3 px-4">Tipe Ruang</th>
                  <th className="py-3 px-4">Penanggung Jawab (PIC)</th>
                  <th className="py-3 px-4 text-center">Jumlah Aset</th>
                  <th className="py-3 px-4 text-right">Nilai Buku BMN</th>
                  <th className="py-3 px-4 text-center">Aksi & DBR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredRooms.map(room => {
                  const roomAssets = assets.filter(a => a.ruanganId === room.id);
                  const totalNilai = roomAssets.reduce((sum, a) => sum + a.nilaiBuku, 0);

                  return (
                    <tr key={room.id} className="hover:bg-slate-800/40 transition-colors text-slate-200">
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRoomIds.has(room.id)}
                          onChange={() => toggleRoomSelection(room.id)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500"
                          aria-label={`Pilih ruangan ${room.name}`}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: room.color || '#3b82f6' }}
                          />
                          <div>
                            <span className="font-mono font-bold text-cyan-300 text-xs">
                              {room.code}
                            </span>
                            <div className="font-bold text-white text-xs mt-0.5">{room.name}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{room.building}</div>
                        <div className="text-[11px] text-slate-400">Lantai {room.floor}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                          {room.roomType || 'Ruang Kerja'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{room.picName}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          NIP: {room.picNip || '-'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="font-bold text-white px-2 py-0.5 rounded bg-slate-800 font-mono">
                          {roomAssets.length} unit
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        Rp {totalNilai.toLocaleString('id-ID')}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedDbrRoom(room)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-xs font-semibold flex items-center gap-1 border border-blue-500/20"
                            title="Buka Lembar DBR Resmi"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>DBR</span>
                          </button>

                          <button
                            onClick={() => handleOpenEditRoom(room)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400"
                            title="Edit Ruangan"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteRoom(room)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                            title="Hapus Ruangan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Official Guidelines Info Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/20 to-slate-900 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-white">Standar DBR BMN Kantor BPS</div>
            <div className="text-slate-400 text-[11px] mt-0.5">
              Setiap ruangan kerja wajib mencantumkan lembar DBR dan memiliki PIC pegawai yang ditetapkan secara kedinasan.
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenAddRoom}
          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors w-fit shrink-0"
        >
          + Buat Ruangan
        </button>
      </div>

      {/* Room Modal (Tambah / Edit) */}
      <RoomModal
        isOpen={isRoomModalOpen}
        onClose={() => {
          setIsRoomModalOpen(false);
          setEditingRoom(null);
        }}
        initialRoom={editingRoom}
      />

      {/* DBR Printable Modal */}
      {selectedDbrRoom && (
        <DbrModal
          isOpen={!!selectedDbrRoom}
          onClose={() => setSelectedDbrRoom(null)}
          room={selectedDbrRoom}
          assets={assets}
        />
      )}
    </div>
  );
};
