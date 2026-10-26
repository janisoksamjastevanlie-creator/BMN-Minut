import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AssetDisposal, AssetMaintenance, AssetMovement, BmnAsset, OfficeRoom } from '../types';
import type { LogAudit, PushNotification } from './types';

interface UseAssetLifecycleParams {
  movements: AssetMovement[];
  setMovements: Dispatch<SetStateAction<AssetMovement[]>>;
  maintenances: AssetMaintenance[];
  setMaintenances: Dispatch<SetStateAction<AssetMaintenance[]>>;
  disposals: AssetDisposal[];
  setDisposals: Dispatch<SetStateAction<AssetDisposal[]>>;
  rooms: OfficeRoom[];
  updateAsset: (id: string, updates: Partial<BmnAsset>) => void;
  logAudit: LogAudit;
  pushNotification: PushNotification;
}

// Daur hidup aset BMN: pemindahan (mutasi), pemeliharaan, dan usulan penghapusan.
// Semua workflow memakai updateAsset untuk mengubah status aset terkait.
export const useAssetLifecycle = ({
  movements, setMovements, maintenances, setMaintenances, disposals, setDisposals,
  rooms, updateAsset, logAudit, pushNotification
}: UseAssetLifecycleParams) => {
  // Asset Movement Workflow (SETELAH SELESAI LOKASI ASET OTOMATIS BERUBAH)
  const addAssetMovement = useCallback((movData: Omit<AssetMovement, 'id' | 'nomorTransaksi' | 'status' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString().split('T')[0];
    const newMov: AssetMovement = {
      ...movData,
      id: `mov-${Date.now()}`,
      nomorTransaksi: `MUT-BMN/7106/2026/${String(movements.length + 1).padStart(4, '0')}`,
      status: 'Pengajuan',
      createdAt: now,
      updatedAt: now
    };

    setMovements(prev => [newMov, ...prev]);

    // Mark asset as 'Dalam Proses Pemindahan'
    updateAsset(movData.assetId, { status: 'Dalam Proses Pemindahan' });

    logAudit('Pengajuan Pemindahan Aset', 'ASET_BMN', `Pengajuan mutasi aset ${movData.assetName} dari ${movData.lokasiAsalNama} ke ${movData.lokasiTujuanNama}`);
  }, [movements, setMovements, updateAsset, logAudit]);

  const updateMovementStatus = useCallback((id: string, status: AssetMovement['status'], catatan?: string) => {
    const target = movements.find(m => m.id === id);
    if (!target) return;

    setMovements(prev =>
      prev.map(m =>
        m.id === id
          ? {
              ...m,
              status,
              catatan: catatan || m.catatan,
              updatedAt: new Date().toISOString().split('T')[0]
            }
          : m
      )
    );

    // Automation: if Selesai -> LOKASI ASET OTOMATIS BERUBAH!
    if (status === 'Selesai') {
      const room = rooms.find(r => r.id === target.lokasiTujuanId);
      updateAsset(target.assetId, {
        ruanganId: target.lokasiTujuanId,
        ruanganNama: target.lokasiTujuanNama,
        gedung: room?.building || 'Gedung Utama Lt. 1',
        penanggungJawab: target.pemohon || room?.picName || 'Penanggung Jawab Ruangan',
        status: 'Aktif'
      });
      logAudit('Pemindahan Aset Selesai', 'ASET_BMN', `Aset ${target.assetName} telah resmi dipindahkan ke ${target.lokasiTujuanNama}. Lokasi diperbarui.`);
      pushNotification('TRANSAKSI', '✅ Pemindahan Aset Selesai', `${target.assetName} kini berada di ${target.lokasiTujuanNama}.`, 'assets');
    } else if (status === 'Ditolak') {
      updateAsset(target.assetId, { status: 'Aktif' });
    }
  }, [movements, setMovements, rooms, updateAsset, logAudit, pushNotification]);

  const deleteAssetMovement = useCallback((id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      return { success: false, message: 'ID transaksi pemindahan tidak valid.' };
    }
    const target = movements.find(m => m.id === id);
    if (!target) {
      return { success: false, message: 'Transaksi pemindahan tidak ditemukan.' };
    }
    setMovements(prev => prev.filter(m => m.id !== id));
    logAudit('Penghapusan Transaksi Pemindahan Aset', 'ASET_BMN', `Transaksi ${target.nomorTransaksi} untuk ${target.assetName} dihapus.`);
    return { success: true, message: `Transaksi ${target.nomorTransaksi} berhasil dihapus.` };
  }, [movements, setMovements, logAudit]);

  // Asset Maintenance
  const addAssetMaintenance = useCallback((mntData: Omit<AssetMaintenance, 'id' | 'nomorTiket'>) => {
    const newMnt: AssetMaintenance = {
      ...mntData,
      id: `mnt-${Date.now()}`,
      nomorTiket: `MNT-BMN/2026/${String(maintenances.length + 1).padStart(4, '0')}`
    };
    setMaintenances(prev => [newMnt, ...prev]);
    updateAsset(mntData.assetId, { status: 'Dalam Pemeliharaan' });
    logAudit('Input Pemeliharaan BMN', 'ASET_BMN', `Tiket perawatan ${newMnt.nomorTiket} untuk ${mntData.assetName} (${mntData.jenisPemeliharaan})`);
  }, [maintenances, setMaintenances, updateAsset, logAudit]);

  const updateMaintenanceStatus = useCallback((id: string, status: AssetMaintenance['status']) => {
    const target = maintenances.find(m => m.id === id);
    if (!target) return;
    setMaintenances(prev => prev.map(m => (m.id === id ? { ...m, status } : m)));
    if (status === 'Selesai') {
      updateAsset(target.assetId, { status: 'Aktif', kondisi: 'Baik' });
    }
    logAudit('Update Status Pemeliharaan BMN', 'ASET_BMN', `Tiket ${target.nomorTiket} status diubah menjadi ${status}`);
  }, [maintenances, setMaintenances, updateAsset, logAudit]);

  const deleteAssetMaintenance = useCallback((id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      return { success: false, message: 'ID tiket pemeliharaan tidak valid.' };
    }
    const target = maintenances.find(m => m.id === id);
    if (!target) {
      return { success: false, message: 'Tiket pemeliharaan tidak ditemukan.' };
    }
    setMaintenances(prev => prev.filter(m => m.id !== id));
    logAudit('Penghapusan Tiket Pemeliharaan BMN', 'ASET_BMN', `Tiket ${target.nomorTiket} untuk ${target.assetName} dihapus.`);
    return { success: true, message: `Tiket ${target.nomorTiket} berhasil dihapus.` };
  }, [maintenances, setMaintenances, logAudit]);

  // Asset Disposal
  const addAssetDisposal = useCallback((dispData: Omit<AssetDisposal, 'id' | 'nomorPengajuan'>) => {
    const newDisp: AssetDisposal = {
      ...dispData,
      id: `dsp-${Date.now()}`,
      nomorPengajuan: `DSP-BMN/2026/${String(disposals.length + 1).padStart(4, '0')}`
    };
    setDisposals(prev => [newDisp, ...prev]);
    updateAsset(dispData.assetId, { status: 'Diusulkan Hapus' });
    logAudit('Pengajuan Penghapusan Aset BMN', 'ASET_BMN', `Usulan penghapusan BMN ${dispData.assetName}`);
  }, [disposals, setDisposals, updateAsset, logAudit]);

  const updateDisposalStatus = useCallback((id: string, status: AssetDisposal['status']) => {
    const target = disposals.find(d => d.id === id);
    if (!target) return;
    setDisposals(prev => prev.map(d => (d.id === id ? { ...d, status } : d)));
    if (status === 'Selesai') {
      updateAsset(target.assetId, { status: 'Dihapuskan' });
    }
    logAudit('Update Status Usulan Penghapusan', 'ASET_BMN', `Pengajuan ${target.nomorPengajuan} status menjadi ${status}`);
  }, [disposals, setDisposals, updateAsset, logAudit]);

  return {
    movements, setMovements,
    maintenances, setMaintenances,
    disposals, setDisposals,
    addAssetMovement, updateMovementStatus, deleteAssetMovement,
    addAssetMaintenance, updateMaintenanceStatus, deleteAssetMaintenance,
    addAssetDisposal, updateDisposalStatus
  };
};
