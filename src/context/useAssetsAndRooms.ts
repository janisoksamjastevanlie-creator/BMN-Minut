import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { BmnAsset, OfficeRoom, WarehouseRack } from '../types';
import { linkImportedAssetsToRooms } from '../utils/assetRoomImporter';
import type { LogAudit, PushNotification } from './types';

interface UseAssetsAndRoomsParams {
  currentUser: { name: string; role: string } | null;
  rooms: OfficeRoom[];
  setRooms: Dispatch<SetStateAction<OfficeRoom[]>>;
  warehouseRacks: WarehouseRack[];
  setWarehouseRacks: Dispatch<SetStateAction<WarehouseRack[]>>;
  assets: BmnAsset[];
  setAssets: Dispatch<SetStateAction<BmnAsset[]>>;
  logAudit: LogAudit;
  pushNotification: PushNotification;
}

type ActionResult = { success: boolean; message: string };

const ALLOWED_ROOM_ROLES = ['Administrator', 'Pengelola BMN', 'Pimpinan'];

// Manajemen ruangan & aset BMN. Keduanya digabung dalam satu hook karena saling
// terkunci: updateRoom menyinkronkan tabel aset, sedangkan impor aset dapat
// membuat ruangan baru (linkImportedAssetsToRooms).
export const useAssetsAndRooms = ({
  currentUser, rooms, setRooms, warehouseRacks, setWarehouseRacks, assets, setAssets, logAudit, pushNotification
}: UseAssetsAndRoomsParams) => {
  // Room Management CRUD
  const addRoom = useCallback((roomData: Omit<OfficeRoom, 'id'>) => {
    if (currentUser && !ALLOWED_ROOM_ROLES.includes(currentUser.role)) {
      logAudit('Percobaan Akses Ditolak', 'AUTH', `Pengguna ${currentUser.name} (${currentUser.role}) mencoba menambah ruangan tanpa izin.`);
      pushNotification('PERINGATAN', 'Akses Ditolak', 'Hanya Pimpinan, Administrator, dan Pengelola BMN yang berhak membuat ruangan baru.', 'dashboard');
      throw new Error('Akses ditolak: Role Anda tidak memiliki izin untuk membuat ruangan.');
    }

    const code = roomData.code.trim();
    if (!code || !roomData.name.trim() || !roomData.building.trim() || !roomData.picName.trim() ||
        !Number.isInteger(roomData.floor) || roomData.floor < 1) {
      throw new Error('Kode, nama, gedung, lantai, dan penanggung jawab ruangan wajib diisi dengan benar.');
    }
    if (rooms.some(room => room.code.trim().toLocaleLowerCase('id-ID') === code.toLocaleLowerCase('id-ID'))) {
      throw new Error(`Kode ruangan "${code}" sudah digunakan oleh ruangan lain.`);
    }

    const newId = `rm-${Date.now()}`;
    const newRoom: OfficeRoom = {
      ...roomData,
      code,
      name: roomData.name.trim(),
      building: roomData.building.trim(),
      picName: roomData.picName.trim(),
      id: newId
    };
    setRooms(prev => [...prev, newRoom]);
    logAudit('Tambah Ruangan Baru', 'ASET_BMN', `Menambahkan unit ruangan baru: ${newRoom.name} (${newRoom.code}) di ${newRoom.building} Lt. ${newRoom.floor} - PIC: ${newRoom.picName}`);
    pushNotification('TRANSAKSI', '🏢 Ruangan Baru Ditambahkan', `Ruangan ${newRoom.name} (${newRoom.code}) berhasil didaftarkan ke master ruangan.`, 'rooms');
    return newRoom;
  }, [currentUser, rooms, setRooms, logAudit, pushNotification]);

  const updateRoom = useCallback((id: string, updates: Partial<OfficeRoom>) => {
    if (currentUser && !ALLOWED_ROOM_ROLES.includes(currentUser.role)) {
      logAudit('Percobaan Akses Ditolak', 'AUTH', `Pengguna ${currentUser.name} (${currentUser.role}) mencoba memperbarui data ruangan tanpa izin.`);
      pushNotification('PERINGATAN', 'Akses Ditolak', 'Hanya Pimpinan, Administrator, dan Pengelola BMN yang berhak mengubah data ruangan.', 'dashboard');
      throw new Error('Akses ditolak: Role Anda tidak memiliki izin untuk mengubah data ruangan.');
    }

    const existingRoom = rooms.find(room => room.id === id);
    if (!existingRoom) throw new Error('Ruangan yang akan diperbarui tidak ditemukan.');
    const updatedRoom = { ...existingRoom, ...updates };
    const code = updatedRoom.code.trim();
    if (!code || !updatedRoom.name.trim() || !updatedRoom.building.trim() || !updatedRoom.picName.trim() ||
        !Number.isInteger(updatedRoom.floor) || updatedRoom.floor < 1) {
      throw new Error('Kode, nama, gedung, lantai, dan penanggung jawab ruangan wajib diisi dengan benar.');
    }
    if (rooms.some(room => room.id !== id && room.code.trim().toLocaleLowerCase('id-ID') === code.toLocaleLowerCase('id-ID'))) {
      throw new Error(`Kode ruangan "${code}" sudah digunakan oleh ruangan lain.`);
    }

    setRooms(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)));
    // If room name, building, or PIC changed, also sync in assets table
    if (updates.name || updates.building || updates.picName) {
      setAssets(prev =>
        prev.map(a => {
          if (a.ruanganId === id) {
            return {
              ...a,
              ruanganNama: updates.name || a.ruanganNama,
              gedung: updates.building || a.gedung,
              penanggungJawab: updates.picName || a.penanggungJawab
            };
          }
          return a;
        })
      );
    }
    logAudit('Pembaruan Data Ruangan', 'ASET_BMN', `Pembaruan data ruangan ID: ${id}`);
    pushNotification('TRANSAKSI', '🏢 Data Ruangan Diperbarui', `Informasi ruangan berhasil disimpan dan disinkronkan.`, 'rooms');
  }, [currentUser, rooms, setRooms, setAssets, logAudit, pushNotification]);

  const deleteRoom = useCallback((id: string): ActionResult => {
    if (currentUser && !ALLOWED_ROOM_ROLES.includes(currentUser.role)) {
      logAudit('Percobaan Akses Ditolak', 'AUTH', `Pengguna ${currentUser.name} (${currentUser.role}) mencoba menghapus ruangan tanpa izin.`);
      pushNotification('PERINGATAN', 'Akses Ditolak', 'Hanya Pimpinan, Administrator, dan Pengelola BMN yang berhak menghapus ruangan.', 'dashboard');
      return { success: false, message: 'Akses ditolak: Hanya Pimpinan, Administrator, dan Pengelola BMN yang berhak menghapus ruangan.' };
    }

    const target = rooms.find(r => r.id === id);
    if (!target) {
      return { success: false, message: 'Ruangan tidak ditemukan dalam sistem.' };
    }
    const assignedAssetsCount = assets.filter(a => a.ruanganId === id).length;
    if (assignedAssetsCount > 0) {
      return {
        success: false,
        message: `Tidak dapat menghapus ruangan "${target.name}". Masih terdapat ${assignedAssetsCount} unit aset BMN terdaftar di ruangan ini. Silakan mutasikan atau pindahkan aset terlebih dahulu.`
      };
    }
    setRooms(prev => prev.filter(r => r.id !== id));
    logAudit('Penghapusan Ruangan', 'ASET_BMN', `Ruangan ${target.name} (${target.code}) dihapus dari master sistem.`);
    pushNotification('TRANSAKSI', '🗑️ Ruangan Dihapus', `Ruangan ${target.name} (${target.code}) berhasil dihapus.`, 'rooms');
    return { success: true, message: `Ruangan "${target.name}" berhasil dihapus.` };
  }, [currentUser, rooms, assets, setRooms, logAudit, pushNotification]);

  // Asset CRUD
  const addAsset = useCallback((assetData: Omit<BmnAsset, 'id'>) => {
    const newId = `bmn-${Date.now()}`;
    const newAsset: BmnAsset = {
      ...assetData,
      fotoUrl: assetData.fotoUrl || undefined,
      id: newId
    };
    setAssets(prev => [newAsset, ...prev]);
    logAudit('Tambah Aset BMN Baru', 'ASET_BMN', `Penambahan aset: ${newAsset.namaBarang} (Kode: ${newAsset.kodeBarang}, NUP: ${newAsset.nup}) di ${newAsset.ruanganNama}`);
    pushNotification('TRANSAKSI', '📦 Aset BMN Baru Dicatat', `${newAsset.namaBarang} berhasil ditambahkan ke inventaris ${newAsset.ruanganNama}.`, 'assets');
  }, [setAssets, logAudit, pushNotification]);

  const updateAsset = useCallback((id: string, updates: Partial<BmnAsset>) => {
    setAssets(prev => prev.map(a => (a.id === id ? { ...a, ...updates } : a)));
    logAudit('Perubahan Data Aset BMN', 'ASET_BMN', `Pembaruan data aset ID: ${id}`);
  }, [setAssets, logAudit]);

  const deleteAsset = useCallback((id: string) => {
    const target = assets.find(a => a.id === id);
    if (!target) return;
    setAssets(prev => prev.filter(a => a.id !== id));
    logAudit('Penghapusan Aset BMN', 'ASET_BMN', `Aset ${target.namaBarang} (NUP: ${target.nup}) dihapus dari database.`);
  }, [assets, setAssets, logAudit]);

  const importAssets = useCallback((newAssetsData: Omit<BmnAsset, 'id'>[], mode: 'append' | 'upsert' = 'upsert') => {
    let added = 0;
    let updated = 0;
    setAssets(prev => {
      let nextList = [...prev];
      newAssetsData.forEach(incoming => {
        const existingIndex = mode === 'upsert'
          ? nextList.findIndex(a => a.kodeBarang === incoming.kodeBarang && Number(a.nup) === Number(incoming.nup))
          : -1;
        if (existingIndex >= 0) {
          nextList[existingIndex] = {
            ...nextList[existingIndex],
            ...incoming,
            id: nextList[existingIndex].id
          };
          updated++;
        } else {
          const newAsset: BmnAsset = {
            ...incoming,
            id: `bmn-imp-${Date.now()}-${Math.floor(Math.random() * 100000)}`
          };
          nextList = [newAsset, ...nextList];
          added++;
        }
      });
      return nextList;
    });
    logAudit('Import File Aset BMN', 'ASET_BMN', `Import batch aset BMN: ${added} aset baru ditambahkan, ${updated} diperbarui.`);
    pushNotification('TRANSAKSI', '📥 Import File Aset Selesai', `Berhasil memproses ${added + updated} data aset BMN (${added} baru, ${updated} pembaruan).`, 'assets');
    return { successCount: added, updatedCount: updated };
  }, [setAssets, logAudit, pushNotification]);

  const importAssetsWithRooms = useCallback((
    newAssetsData: Omit<BmnAsset, 'id'>[],
    mode: 'append' | 'upsert' = 'upsert'
  ) => {
    const { assets: linkedAssets, newRooms } = linkImportedAssetsToRooms(newAssetsData, rooms);
    if (newRooms.length > 0) {
      setRooms(previous => [...previous, ...newRooms]);
      logAudit(
        'Tambah Ruangan dari Impor Aset',
        'ASET_BMN',
        `${newRooms.length} ruangan otomatis ditambahkan dari lokasi file impor aset.`
      );
    }

    return { ...importAssets(linkedAssets, mode), createdRooms: newRooms.length };
  }, [rooms, setRooms, importAssets, logAudit]);

  return {
    rooms, setRooms,
    warehouseRacks, setWarehouseRacks,
    assets, setAssets,
    addRoom, updateRoom, deleteRoom,
    addAsset, updateAsset, deleteAsset,
    importAssets, importAssetsWithRooms
  };
};
