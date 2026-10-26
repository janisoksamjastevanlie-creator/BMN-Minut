import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { InventoryItem } from '../types';
import type { LogAudit, PushNotification } from './types';

interface UseInventoryParams {
  inventoryItems: InventoryItem[];
  setInventoryItems: Dispatch<SetStateAction<InventoryItem[]>>;
  logAudit: LogAudit;
  pushNotification: PushNotification;
}

// Master persediaan: CRUD + impor massal.
export const useInventory = ({
  inventoryItems, setInventoryItems, logAudit, pushNotification
}: UseInventoryParams) => {
  const addInventoryItem = useCallback((itemData: Omit<InventoryItem, 'id'>) => {
    const newId = `inv-${Date.now()}`;
    const newItem: InventoryItem = {
      ...itemData,
      id: newId,
      fotoUrl: itemData.fotoUrl || undefined,
      totalNilai: itemData.stokSaatIni * itemData.hargaSatuan
    };
    setInventoryItems(prev => [newItem, ...prev]);
    logAudit('Tambah Master Persediaan', 'PERSEDIAAN', `Penambahan barang persediaan: ${newItem.nama} (${newItem.jenis}) di ${newItem.binCode}`);
  }, [setInventoryItems, logAudit]);

  const updateInventoryItem = useCallback((
    id: string,
    updates: Partial<InventoryItem>,
    options: { recordStockAdjustment?: boolean } = {}
  ) => {
    const current = inventoryItems.find(item => item.id === id);
    if (options.recordStockAdjustment && current &&
        updates.stokSaatIni !== undefined && updates.stokSaatIni !== current.stokSaatIni) {
      logAudit(
        'Penyesuaian Stok Master',
        'PERSEDIAAN',
        `Penyesuaian saldo ${current.nama} dari ${current.stokSaatIni} menjadi ${updates.stokSaatIni}.`
      );
    }
    setInventoryItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };
        updated.totalNilai = updated.stokSaatIni * updated.hargaSatuan;
        if (updated.stokSaatIni === 0) {
          updated.status = 'Habis';
        } else if (updated.stokSaatIni <= updated.stokMinimum) {
          updated.status = 'Menipis';
        } else {
          updated.status = 'Aman';
        }
        return updated;
      })
    );
  }, [inventoryItems, setInventoryItems, logAudit]);

  // DITAMBAHKAN: validasi ID sebelum menghapus satu barang persediaan.
  const deleteInventoryItem = useCallback((id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      return { success: false, message: 'ID persediaan tidak valid.' };
    }
    const target = inventoryItems.find(item => item.id === id);
    if (!target) {
      return { success: false, message: 'Data persediaan tidak ditemukan.' };
    }
    setInventoryItems(prev => prev.filter(item => item.id !== id));
    logAudit('Penghapusan Master Persediaan', 'PERSEDIAAN', `Barang persediaan ${target.nama} (${target.kodeBarang}) dihapus.`);
    return { success: true, message: `Barang "${target.nama}" berhasil dihapus.` };
  }, [inventoryItems, setInventoryItems, logAudit]);

  const importInventoryItems = useCallback((newItemsData: Omit<InventoryItem, 'id'>[], mode: 'append' | 'upsert' = 'upsert') => {
    let added = 0;
    let updated = 0;
    setInventoryItems(prev => {
      let nextList = [...prev];
      newItemsData.forEach(incoming => {
        const existingIndex = mode === 'upsert'
          ? nextList.findIndex(i => (incoming.kodeBarang && i.kodeBarang.toLowerCase() === incoming.kodeBarang.toLowerCase()) || i.nama.toLowerCase() === incoming.nama.toLowerCase())
          : -1;
        if (existingIndex >= 0) {
          const old = nextList[existingIndex];
          const newStock = incoming.stokSaatIni !== undefined ? incoming.stokSaatIni : old.stokSaatIni;
          const newPrice = incoming.hargaSatuan || old.hargaSatuan;
          const totalVal = newStock * newPrice;
          let newStatus: 'Aman' | 'Menipis' | 'Habis' = old.status;
          if (newStock === 0) newStatus = 'Habis';
          else if (newStock <= (incoming.stokMinimum ?? old.stokMinimum)) newStatus = 'Menipis';
          else newStatus = 'Aman';

          nextList[existingIndex] = {
            ...old,
            ...incoming,
            stokSaatIni: newStock,
            hargaSatuan: newPrice,
            totalNilai: totalVal,
            status: newStatus,
            id: old.id
          };
          updated++;
        } else {
          const totalVal = (incoming.stokSaatIni || 0) * (incoming.hargaSatuan || 0);
          let itemStatus: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
          if ((incoming.stokSaatIni || 0) === 0) itemStatus = 'Habis';
          else if ((incoming.stokSaatIni || 0) <= (incoming.stokMinimum || 5)) itemStatus = 'Menipis';

          const newItem: InventoryItem = {
            ...incoming,
            id: `inv-imp-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
            totalNilai: totalVal,
            status: itemStatus
          };
          nextList = [newItem, ...nextList];
          added++;
        }
      });
      return nextList;
    });
    logAudit('Import File Persediaan', 'PERSEDIAAN', `Import data persediaan: ${added} barang baru, ${updated} barang diperbarui.`);
    pushNotification('TRANSAKSI', '📥 Import Persediaan Selesai', `Berhasil memproses ${added + updated} data persediaan (${added} baru, ${updated} pembaruan).`, 'inventory');
    return { successCount: added, updatedCount: updated };
  }, [setInventoryItems, logAudit, pushNotification]);

  return {
    inventoryItems, setInventoryItems,
    addInventoryItem, updateInventoryItem, deleteInventoryItem, importInventoryItems
  };
};
