import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { OfficeRoom } from '../../types';
import {
  X,
  Building2,
  Check,
  UserCheck,
  Sparkles,
  Layers,
  Palette,
  Maximize2,
  Sliders,
  Info
} from 'lucide-react';

const COLOR_PRESETS = [
  { name: 'Biru BPS', value: '#3b82f6' },
  { name: 'Cyan Modern', value: '#06b6d4' },
  { name: 'Hijau Emerald', value: '#10b981' },
  { name: 'Ungu Indigo', value: '#6366f1' },
  { name: 'Violet Elegan', value: '#8b5cf6' },
  { name: 'Pink Magenta', value: '#ec4899' },
  { name: 'Kuning Amber', value: '#f59e0b' },
  { name: 'Teal Aqua', value: '#14b8a6' },
  { name: 'Emas Gold', value: '#eab308' },
  { name: 'Merah Coral', value: '#f43f5e' }
];

const ROOM_NAME_SUGGESTIONS = [
  'Ruang Rapat Utama (Vicon)',
  'Ruang Pelayanan Statistik Terpadu (PST)',
  'Ruang Pojok Statistik',
  'Ruang Arsip & Dokumen Sensus',
  'Ruang Tim Neraca & Analisis',
  'Ruang Server Cadangan (DRC)',
  'Ruang Pantry & Istirahat Pegawai',
  'Ruang Aula Serbaguna BPS'
];

export const RoomModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialRoom?: OfficeRoom | null;
}> = ({ isOpen, onClose, initialRoom }) => {
  const { rooms, users, addRoom, updateRoom, currentUser } = useApp();
  const ALLOWED_ROOM_ROLES = ['Administrator', 'Pengelola BMN', 'Pimpinan'];

  // Helper to generate next room code
  const getSuggestedCode = () => {
    const existingCodes = rooms.map(r => {
      const match = r.code.match(/R-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 100;
    return `R-${maxCode + 1}`;
  };

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('Gedung Utama Lt. 1');
  const [floor, setFloor] = useState<number>(1);
  const [roomType, setRoomType] = useState<OfficeRoom['roomType']>('Ruang Kerja');
  const [picName, setPicName] = useState('');
  const [picNip, setPicNip] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [capacity, setCapacity] = useState<number>(10);
  const [areaSqm, setAreaSqm] = useState<number>(35);
  const [description, setDescription] = useState('');

  // 3D parameters
  const [show3dAdvanced, setShow3dAdvanced] = useState(false);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0.9);
  const [posZ, setPosZ] = useState(0);
  const [sizeW, setSizeW] = useState(4.0);
  const [sizeH, setSizeH] = useState(1.8);
  const [sizeD, setSizeD] = useState(3.5);

  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialRoom) {
      setCode(initialRoom.code);
      setName(initialRoom.name);
      setBuilding(initialRoom.building);
      setFloor(initialRoom.floor);
      setRoomType(initialRoom.roomType || 'Ruang Kerja');
      setPicName(initialRoom.picName);
      setPicNip(initialRoom.picNip);
      setColor(initialRoom.color || '#3b82f6');
      setCapacity(initialRoom.capacity || 10);
      setAreaSqm(initialRoom.areaSqm || 35);
      setDescription(initialRoom.description || '');

      setPosX(initialRoom.position3D[0]);
      setPosY(initialRoom.position3D[1]);
      setPosZ(initialRoom.position3D[2]);
      setSizeW(initialRoom.size3D[0]);
      setSizeH(initialRoom.size3D[1]);
      setSizeD(initialRoom.size3D[2]);
    } else {
      // Default new room
      const nextCode = getSuggestedCode();
      setCode(nextCode);
      setName('');
      setBuilding('Gedung Utama Lt. 1');
      setFloor(1);
      setRoomType('Ruang Kerja');
      const defaultPic = users[0] || { name: 'Christian Pangemanan, S.ST', nip: '198503202008011003' };
      setPicName(defaultPic.name);
      setPicNip(defaultPic.nip);
      setColor(COLOR_PRESETS[(rooms.length) % COLOR_PRESETS.length].value);
      setCapacity(12);
      setAreaSqm(40);
      setDescription('');

      // Auto 3D placement based on room count
      const offset = (rooms.length % 4) * 2 - 3;
      setPosX(offset);
      setPosY(1 === 1 ? 0.9 : 2.5);
      setPosZ(rooms.length % 2 === 0 ? 3 : -3);
      setSizeW(4.0);
      setSizeH(1.8);
      setSizeD(3.5);
    }
    setErrorMsg('');
  }, [initialRoom, isOpen]);

  // Adjust Y coordinate when floor changes
  const handleFloorChange = (newFloor: number) => {
    setFloor(newFloor);
    if (!initialRoom) {
      setPosY(newFloor === 1 ? 0.9 : newFloor === 2 ? 2.5 : 4.0);
      if (building.includes('Lt.')) {
        setBuilding(building.replace(/Lt\.\s*\d+/, `Lt. ${newFloor}`));
      }
    }
  };

  const handleSelectUser = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = users.find(u => u.name === e.target.value);
    if (selected) {
      setPicName(selected.name);
      setPicNip(selected.nip);
    } else {
      setPicName(e.target.value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!code.trim()) {
      setErrorMsg('Kode ruangan wajib diisi.');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('Nama ruangan wajib diisi.');
      return;
    }
    if (!picName.trim()) {
      setErrorMsg('Penanggung jawab ruangan (PIC) wajib diisi.');
      return;
    }

    // Check duplicate code if adding new
    if (!initialRoom) {
      const isDuplicate = rooms.some(r => r.code.toLowerCase() === code.trim().toLowerCase());
      if (isDuplicate) {
        setErrorMsg(`Kode ruangan "${code.trim()}" sudah digunakan oleh ruangan lain.`);
        return;
      }
    } else {
      const isDuplicate = rooms.some(r => r.id !== initialRoom.id && r.code.toLowerCase() === code.trim().toLowerCase());
      if (isDuplicate) {
        setErrorMsg(`Kode ruangan "${code.trim()}" sudah digunakan oleh ruangan lain.`);
        return;
      }
    }

    const roomPayload: Omit<OfficeRoom, 'id'> = {
      code: code.trim(),
      name: name.trim(),
      floor,
      building: building.trim(),
      picName: picName.trim(),
      picNip: picNip.trim(),
      color,
      roomType,
      capacity: Number(capacity) || 0,
      areaSqm: Number(areaSqm) || 0,
      description: description.trim() || `Ruangan unit kerja ${name.trim()} BPS Kabupaten Minahasa Utara`,
      position3D: [Number(posX) || 0, Number(posY) || 0.9, Number(posZ) || 0],
      size3D: [Math.max(1, Number(sizeW) || 3), Math.max(1, Number(sizeH) || 1.8), Math.max(1, Number(sizeD) || 3)]
    };

    if (initialRoom) {
      updateRoom(initialRoom.id, roomPayload);
    } else {
      addRoom(roomPayload);
    }

    onClose();
  };

  if (!isOpen || (currentUser && !ALLOWED_ROOM_ROLES.includes(currentUser.role))) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{initialRoom ? 'Ubah Data Ruangan' : 'Buat Ruangan Baru'}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                  {code || 'BPS Minut'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Konfigurasi lokasi, PIC penanggung jawab, dan pemetaan 3D Digital Twin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick Suggestions for new room */}
          {!initialRoom && (
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Rekomendasi Nama Ruangan Kantor BPS:</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ROOM_NAME_SUGGESTIONS.slice(0, 4).map(sug => (
                  <button
                    type="button"
                    key={sug}
                    onClick={() => setName(sug)}
                    className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[11px] transition-colors"
                  >
                    + {sug}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Basic Info: Code & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Kode Ruangan <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="misal: R-110"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-slate-300 font-semibold block mb-1">
                Nama Ruangan <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="misal: Ruang Rapat Vicon / Ruang Konsultasi Statistik"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Building, Floor & Room Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Gedung / Wilayah <span className="text-rose-400">*</span>
              </label>
              <select
                value={building}
                onChange={e => setBuilding(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Gedung Utama Lt. 1">Gedung Utama Lt. 1</option>
                <option value="Gedung Utama Lt. 2">Gedung Utama Lt. 2</option>
                <option value="Gedung Logistik Lt. 1">Gedung Logistik Lt. 1</option>
                <option value="Gedung Pelayanan Terpadu">Gedung Pelayanan Terpadu</option>
                <option value="Gedung Arsip BPS">Gedung Arsip BPS</option>
              </select>
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Tingkat Lantai
              </label>
              <div className="flex gap-1.5">
                {[1, 2, 3].map(fl => (
                  <button
                    key={fl}
                    type="button"
                    onClick={() => handleFloorChange(fl)}
                    className={`flex-1 py-2 rounded-xl font-semibold border transition-all ${
                      floor === fl
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    Lt. {fl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Fungsi / Tipe Ruang
              </label>
              <select
                value={roomType}
                onChange={e => setRoomType(e.target.value as OfficeRoom['roomType'])}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Ruang Kerja">Ruang Kerja</option>
                <option value="Ruang Rapat">Ruang Rapat</option>
                <option value="Ruang Server">Ruang Server / TI</option>
                <option value="Gudang">Gudang Persediaan</option>
                <option value="Layanan Publik">Pelayanan Publik (PST)</option>
                <option value="Arsip & Dokumen">Arsip & Dokumen</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
          </div>

          {/* PIC (Penanggung Jawab Ruangan) */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5 text-xs">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Penanggung Jawab Ruangan (PIC BMN)</span>
              </span>
              <span className="text-[10px] text-slate-400">Pilih dari pegawai atau isi manual</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">
                  Pilih Pegawai BPS Minut
                </label>
                <select
                  value={picName}
                  onChange={handleSelectUser}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.name}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                  <option value="__custom__">-- Ketik Nama Lainnya --</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 text-[11px] block mb-1">
                  NIP Penanggung Jawab
                </label>
                <input
                  type="text"
                  value={picNip}
                  onChange={e => setPicNip(e.target.value)}
                  placeholder="19xxxxxxxxxxxxxxxx"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {picName === '__custom__' && (
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">
                  Nama Lengkap & Gelar PIC
                </label>
                <input
                  type="text"
                  required
                  onChange={e => setPicName(e.target.value)}
                  placeholder="Nama Lengkap Penanggung Jawab"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* Color & Visual Identification */}
          <div>
            <label className="text-slate-300 font-semibold block mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-blue-400" />
              <span>Warna Penanda Ruangan (Identitas 3D Twin & Denah):</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map(cp => {
                const isSelected = color.toLowerCase() === cp.value.toLowerCase();
                return (
                  <button
                    key={cp.value}
                    type="button"
                    onClick={() => setColor(cp.value)}
                    title={cp.name}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-[11px] ${
                      isSelected
                        ? 'border-white text-white font-bold bg-slate-800 shadow-md ring-2 ring-blue-500/50'
                        : 'border-slate-800 text-slate-400 bg-slate-950 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full inline-block shadow-inner"
                      style={{ backgroundColor: cp.value }}
                    />
                    <span>{cp.name}</span>
                  </button>
                );
              })}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] text-slate-400">Kustom:</span>
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                />
              </div>
            </div>
          </div>

          {/* Capacity, Area & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Kapasitas Orang
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={capacity}
                onChange={e => setCapacity(Number(e.target.value))}
                placeholder="10"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Estimasi Luas Ruangan (m²)
              </label>
              <input
                type="number"
                min="5"
                max="500"
                value={areaSqm}
                onChange={e => setAreaSqm(Number(e.target.value))}
                placeholder="35"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-300 font-semibold block mb-1">
              Deskripsi & Catatan Fungsi Ruangan
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Deskripsi kegiatan operasional, peruntukan ruangan, atau batas kewenangan BPS..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Collapsible 3D Twin Digital Parameters */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
            <button
              type="button"
              onClick={() => setShow3dAdvanced(!show3dAdvanced)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span>Pengaturan Lanjutan 3D Digital Twin (Koordinat & Ukuran)</span>
              </div>
              <span className="text-[10px] text-cyan-400 hover:underline">
                {show3dAdvanced ? 'Tutup Pengaturan' : 'Sesuaikan Koordinat'}
              </span>
            </button>

            {show3dAdvanced && (
              <div className="p-4 border-t border-slate-800/80 space-y-3 bg-slate-950/80">
                <div className="text-[11px] text-slate-400">
                  Koordinat (X, Y, Z) dan dimensi kotak visualisasi 3D di model denah kantor:
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Posisi X</label>
                    <input
                      type="number"
                      step="0.5"
                      value={posX}
                      onChange={e => setPosX(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Posisi Y (Lantai)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={posY}
                      onChange={e => setPosY(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Posisi Z</label>
                    <input
                      type="number"
                      step="0.5"
                      value={posZ}
                      onChange={e => setPosZ(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Lebar (W)</label>
                    <input
                      type="number"
                      step="0.2"
                      min="1"
                      value={sizeW}
                      onChange={e => setSizeW(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Tinggi (H)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      value={sizeH}
                      onChange={e => setSizeH(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Panjang (D)</label>
                    <input
                      type="number"
                      step="0.2"
                      min="1"
                      value={sizeD}
                      onChange={e => setSizeD(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3 sticky bottom-0 bg-slate-900/90 py-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{initialRoom ? 'Simpan Perubahan' : 'Buat Ruangan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
