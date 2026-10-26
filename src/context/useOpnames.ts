import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { InventoryItem, StockOpname } from '../types';
import type { LogAudit, PushNotification } from './types';

interface UseOpnamesParams {
  opnames: StockOpname[];
  setOpnames: Dispatch<SetStateAction<StockOpname[]>>;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>, options?: { recordStockAdjustment?: boolean }) => void;
  logAudit: LogAudit;
  pushNotification: PushNotification;
}

// Stock opname persediaan: pencatatan berita acara + persetujuan (koreksi saldo).
export const useOpnames = ({
  opnames, setOpnames, updateInventoryItem, logAudit, pushNotification
}: UseOpnamesParams) => {
  const addStockOpname = useCallback((opnameData: Omit<StockOpname, 'id' | 'nomorOpname'>) => {
    const newOp: StockOpname = {
      ...opnameData,
      id: `opname-${Date.now()}`,
      nomorOpname: `BA-SO/BPS7106/2026/${String(opnames.length + 1).padStart(3, '0')}`
    };
    setOpnames(prev => [newOp, ...prev]);
    logAudit('Pencatatan Stock Opname', 'PERSEDIAAN', `Stock opname ${newOp.nomorOpname} periode ${newOp.periode} oleh ${newOp.petugas}`);
  }, [opnames, setOpnames, logAudit]);

  const approveStockOpname = useCallback((id: string) => {
    const target = opnames.find(o => o.id === id);
    if (!target) return;

    // Apply adjustments to inventory items
    target.items.forEach(it => {
      if (it.selisih !== 0) {
        updateInventoryItem(it.itemId, { stokSaatIni: it.stokFisik });
      }
    });

    setOpnames(prev =>
      prev.map(o => (o.id === id ? { ...o, status: 'Selesai', items: o.items.map(i => ({ ...i, statusPenyesuaian: 'Disesuaikan' })) } : o))
    );

    logAudit('Persetujuan Stock Opname', 'PERSEDIAAN', `Stock opname ${target.nomorOpname} disetujui. Selisih stok telah dikoreksi ke saldo fisik.`);
    pushNotification('TRANSAKSI', '✅ Berita Acara Stock Opname Disetujui', `Seluruh saldo persediaan telah diselaraskan dengan hasil opname fisik.`, 'stock-opname');
  }, [opnames, updateInventoryItem, setOpnames, logAudit, pushNotification]);

  return {
    addStockOpname, approveStockOpname, opnames, setOpnames
  };
};
