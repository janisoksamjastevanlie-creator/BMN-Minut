import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { InventoryItem, InventoryRequest, RolePermissions, StockInTransaction, StockOutTransaction, User } from '../types';
import { planStockInDeletion } from '../../stockInDeletion.mjs';
import { getRequestableStock } from '../../requestStockValidation.mjs';
import type { LogAudit, PushNotification, StockInDetails } from './types';

interface UseStockParams {
  inventoryItems: InventoryItem[];
  setInventoryItems: Dispatch<SetStateAction<InventoryItem[]>>;
  stockInList: StockInTransaction[];
  setStockInList: Dispatch<SetStateAction<StockInTransaction[]>>;
  stockOutList: StockOutTransaction[];
  setStockOutList: Dispatch<SetStateAction<StockOutTransaction[]>>;
  requests: InventoryRequest[];
  currentUser: User | null;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>, options?: { recordStockAdjustment?: boolean }) => void;
  hasPermission: (permission: keyof RolePermissions) => boolean;
  logAudit: LogAudit;
  pushNotification: PushNotification;
  requestImmediateStateSync: () => void;
}

// Barang masuk & keluar (gudang): transaksi, pemeriksaan, verifikasi, penghapusan.
export const useStock = ({
  inventoryItems, setInventoryItems, stockInList, setStockInList, stockOutList, setStockOutList,
  requests, currentUser, updateInventoryItem, hasPermission, logAudit, pushNotification, requestImmediateStateSync
}: UseStockParams) => {
  const validateStockInDetails = useCallback((data: StockInDetails) => {
    const item = inventoryItems.find(candidate => candidate.id === data.itemId);
    if (!item) {
      return 'Barang persediaan tidak ditemukan.';
    }
    if (!Number.isFinite(data.jumlah) || data.jumlah <= 0) return 'Jumlah harus lebih besar dari 0.';
    if (data.hargaSatuan !== undefined && (!Number.isFinite(data.hargaSatuan) || data.hargaSatuan < 0)) {
      return 'Harga satuan tidak valid.';
    }
    if (!Number.isFinite(data.jumlah * (data.hargaSatuan ?? item.hargaSatuan))) {
      return 'Nilai transaksi terlalu besar atau tidak valid.';
    }
    if (!data.nomorDokumen.trim() || !data.sumber.trim()) return 'Nomor dokumen dan sumber perolehan wajib diisi.';
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(data.tanggal)
      ? new Date(`${data.tanggal}T00:00:00`)
      : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) ||
        `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}` !== data.tanggal) {
      return 'Tanggal transaksi tidak valid.';
    }
    return null;
  }, [inventoryItems]);

  const addStockIn = useCallback((data: StockInDetails) => {
    const validationError = validateStockInDetails(data);
    if (validationError) return { success: false, message: validationError };
    const item = inventoryItems.find(i => i.id === data.itemId);
    if (!item) return { success: false, message: 'Barang persediaan tidak ditemukan.' };
    const finalPrice = data.hargaSatuan ?? item.hargaSatuan;
    const totalHarga = data.jumlah * finalPrice;
    const year = data.tanggal.slice(0, 4);
    const sequence = stockInList.reduce((max, tx) => {
      if (!tx.nomorTransaksi?.startsWith(`BM-BPS7106/${year}/`)) return max;
      const suffix = Number(tx.nomorTransaksi.split('/').pop());
      return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
    }, 0) + 1;
    let id = `sin-${Date.now()}`;
    while (stockInList.some(tx => tx.id === id)) id = `sin-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const nomorTx = `BM-BPS7106/${year}/${String(sequence).padStart(4, '0')}`;

    const newTx: StockInTransaction = {
      id,
      nomorTransaksi: nomorTx,
      tanggal: data.tanggal,
      nomorDokumen: data.nomorDokumen.trim(),
      sumber: data.sumber.trim(),
      itemId: item.id,
      namaBarang: item.nama,
      kategori: item.kategori,
      jenis: item.jenis,
      jumlah: data.jumlah,
      satuan: item.satuan,
      hargaSatuan: finalPrice,
      totalHarga: totalHarga,
      lokasiRak: item.rak,
      petugas: currentUser?.name || 'Petugas Gudang',
      keterangan: data.keterangan.trim(),
      status: 'Menunggu Pemeriksaan'
    };

    requestImmediateStateSync();
    setStockInList(prev => [newTx, ...prev]);
    logAudit('Pencatatan Barang Masuk', 'PERSEDIAAN', `Penerimaan ${data.jumlah} ${item.satuan} ${item.nama} dicatat dan menunggu pemeriksaan. No: ${nomorTx}`);
    pushNotification('TRANSAKSI', '📥 Barang Masuk Menunggu Pemeriksaan', `${item.nama} (${data.jumlah} ${item.satuan}) menunggu pemeriksaan sebelum stok diperbarui.`, 'inventory');
    return { success: true, message: `Penerimaan ${nomorTx} tersimpan dan menunggu pemeriksaan. Stok belum berubah.` };
  }, [validateStockInDetails, inventoryItems, stockInList, currentUser, requestImmediateStateSync, setStockInList, logAudit, pushNotification]);

  const updateStockIn = useCallback((id: string, data: StockInDetails) => {
    const target = stockInList.find(tx => tx.id === id);
    if (!target) return { success: false, message: 'Transaksi Barang Masuk tidak ditemukan.' };
    if (target.status !== 'Menunggu Pemeriksaan' && target.status !== 'Ditolak') {
      return { success: false, message: 'Transaksi yang sudah diperiksa atau diverifikasi tidak dapat diedit.' };
    }
    const validationError = validateStockInDetails(data);
    if (validationError) return { success: false, message: validationError };
    const item = inventoryItems.find(i => i.id === data.itemId);
    if (!item) return { success: false, message: 'Barang persediaan tidak ditemukan.' };
    const updated: StockInTransaction = {
      ...target,
      tanggal: data.tanggal,
      nomorDokumen: data.nomorDokumen.trim(),
      sumber: data.sumber.trim(),
      itemId: item.id,
      namaBarang: item.nama,
      kategori: item.kategori,
      jenis: item.jenis,
      jumlah: data.jumlah,
      satuan: item.satuan,
      hargaSatuan: data.hargaSatuan ?? item.hargaSatuan,
      totalHarga: data.jumlah * (data.hargaSatuan ?? item.hargaSatuan),
      lokasiRak: item.rak,
      keterangan: data.keterangan.trim(),
      status: 'Menunggu Pemeriksaan',
      pemeriksaan: undefined,
      diverifikasiOleh: undefined,
      diverifikasiPada: undefined
    };
    requestImmediateStateSync();
    setStockInList(prev => prev.map(tx => tx.id === id ? updated : tx));
    logAudit('Perubahan Barang Masuk', 'PERSEDIAAN', `Transaksi ${target.nomorTransaksi} diperbarui dan kembali menunggu pemeriksaan.`);
    return { success: true, message: 'Transaksi diperbarui dan menunggu pemeriksaan ulang.' };
  }, [stockInList, validateStockInDetails, inventoryItems, requestImmediateStateSync, setStockInList, logAudit]);

  const inspectStockIn = useCallback((id: string, pemeriksaan: NonNullable<StockInTransaction['pemeriksaan']>) => {
    const target = stockInList.find(tx => tx.id === id);
    if (!target) return { success: false, message: 'Transaksi Barang Masuk tidak ditemukan.' };
    if (target.status !== 'Menunggu Pemeriksaan') return { success: false, message: 'Transaksi ini tidak sedang menunggu pemeriksaan.' };
    if (!pemeriksaan.diperiksaOleh.trim() || !pemeriksaan.diperiksaPada ||
        !['Baik', 'Rusak Ringan', 'Rusak Berat'].includes(pemeriksaan.kondisi)) {
      return { success: false, message: 'Data pemeriksaan belum lengkap.' };
    }
    requestImmediateStateSync();
    setStockInList(prev => prev.map(tx => tx.id === id
      ? { ...tx, status: 'Sudah Diperiksa', pemeriksaan }
      : tx));
    logAudit('Pemeriksaan Barang Masuk', 'PERSEDIAAN', `Transaksi ${target.nomorTransaksi} diperiksa oleh ${pemeriksaan.diperiksaOleh}.`);
    return { success: true, message: 'Pemeriksaan tersimpan. Lanjutkan dengan verifikasi diterima atau ditolak.' };
  }, [stockInList, requestImmediateStateSync, setStockInList, logAudit]);

  const verifyStockIn = useCallback((id: string, diterima: boolean, catatan = '') => {
    const target = stockInList.find(tx => tx.id === id);
    if (!target) return { success: false, message: 'Transaksi Barang Masuk tidak ditemukan.' };
    if (target.status !== 'Sudah Diperiksa' || !target.pemeriksaan) {
      return { success: false, message: 'Transaksi harus diperiksa sebelum diverifikasi.' };
    }
    if (diterima && (!target.pemeriksaan.jumlahSesuai || !target.pemeriksaan.dokumenSesuai ||
        !target.pemeriksaan.barangSesuai || target.pemeriksaan.kondisi === 'Rusak Berat')) {
      return { success: false, message: 'Penerimaan dengan hasil pemeriksaan tidak sesuai atau kondisi rusak berat harus ditolak.' };
    }
    const item = inventoryItems.find(i => i.id === target.itemId);
    if (diterima && !item) return { success: false, message: 'Barang persediaan terkait tidak ditemukan; stok tidak dapat diperbarui.' };
    if (diterima && item && !Number.isFinite(item.stokSaatIni + target.jumlah)) {
      return { success: false, message: 'Perubahan stok menghasilkan nilai yang tidak valid.' };
    }
    const status = diterima ? 'Diverifikasi' : 'Ditolak';
    requestImmediateStateSync();
    if (diterima && item) {
      updateInventoryItem(item.id, {
        stokSaatIni: item.stokSaatIni + target.jumlah,
        hargaSatuan: target.hargaSatuan
      });
    }
    setStockInList(prev => prev.map(tx => tx.id === id
      ? {
          ...tx,
          status,
          keterangan: catatan.trim() ? `${tx.keterangan}${tx.keterangan ? ' | ' : ''}Verifikasi: ${catatan.trim()}` : tx.keterangan,
          diverifikasiOleh: currentUser?.name || 'Petugas Gudang',
          diverifikasiPada: new Date().toISOString()
        }
      : tx));
    const auditDetail = `Transaksi ${target.nomorTransaksi} ${diterima ? 'diterima dan stok ditambahkan' : 'ditolak'}${catatan.trim() ? `: ${catatan.trim()}` : '.'}`;
    logAudit('Verifikasi Barang Masuk', 'PERSEDIAAN', auditDetail);
    if (diterima && item) {
      pushNotification('TRANSAKSI', '✅ Barang Masuk Diverifikasi', `${target.jumlah} ${item.satuan} ${item.nama} telah ditambahkan ke stok.`, 'inventory');
    }
    return {
      success: true,
      message: diterima ? `Transaksi diverifikasi; stok ${item?.nama} bertambah ${target.jumlah} ${target.satuan}.` : 'Transaksi ditolak dan tidak mengubah stok.'
    };
  }, [stockInList, inventoryItems, requestImmediateStateSync, updateInventoryItem, currentUser, setStockInList, logAudit, pushNotification]);

  const deleteStockInMany = useCallback((ids: string[]) => {
    const result = planStockInDeletion(ids, stockInList, inventoryItems, hasPermission('manageInventory'));
    if (result.deletedIds.length > 0) {
      const affectedItems = new Set(
        result.deletedTransactions
          .filter(tx =>
            (tx.status == null || tx.status === '' || tx.status === 'Diverifikasi')
            && result.stockByItem.has(tx.itemId)
          )
          .map(tx => tx.itemId)
      );
      setInventoryItems(previous => previous.map(item => {
        if (!affectedItems.has(item.id)) return item;
        const stock = result.stockByItem.get(item.id);
        if (stock === undefined) return item;
        const updated = { ...item, stokSaatIni: stock, totalNilai: stock * item.hargaSatuan };
        updated.status = stock === 0 ? 'Habis' : stock <= item.stokMinimum ? 'Menipis' : 'Aman';
        return updated;
      }));
      requestImmediateStateSync();
      setStockInList(previous => previous.filter(tx => !result.deletedIds.includes(tx.id)));
      for (const transaction of result.deletedTransactions) {
        const isPosted = (transaction.status == null || transaction.status === 'Diverifikasi')
          && result.stockByItem.has(transaction.itemId);
        logAudit(
          'Penghapusan Barang Masuk',
          'PERSEDIAAN',
          `Transaksi ${transaction.nomorTransaksi} dihapus${
            isPosted
              ? ' dan jumlah stoknya dikoreksi'
              : transaction.status == null || transaction.status === ''
                ? ' tanpa koreksi stok karena barang master terkait sudah tidak tersedia'
                : ''
          }.`
        );
      }
    }

    return { deletedIds: result.deletedIds, errors: result.errors };
  }, [stockInList, inventoryItems, hasPermission, setInventoryItems, requestImmediateStateSync, setStockInList, logAudit]);

  const deleteStockIn = useCallback((id: string) => {
    const result = deleteStockInMany([id]);
    const error = result.errors[0];
    if (error) return { success: false, message: error.message };
    const target = stockInList.find(tx => tx.id === id);
    return {
      success: result.deletedIds.includes(id),
      message: target ? `Transaksi ${target.nomorTransaksi} berhasil dihapus.` : 'Transaksi Barang Masuk tidak ditemukan.'
    };
  }, [deleteStockInMany, stockInList]);

  // Stock Out Automation (STOK OTOMATIS BERKURANG)
  const addStockOut = useCallback((data: {
    itemId: string;
    jumlah: number;
    unitKerja: string;
    ruangan: string;
    pemohon: string;
    keperluan: string;
  }, sequenceOffset = 0) => {
    const item = inventoryItems.find(i => i.id === data.itemId);
    if (!item) return { success: false, message: 'Barang tidak ditemukan' };

    const availableStock = getRequestableStock(item.id, inventoryItems, requests);
    if (!Number.isSafeInteger(data.jumlah) || data.jumlah <= 0 || data.jumlah > availableStock) {
      return {
        success: false,
        message: `Gagal! Stok yang belum dialokasikan hanya ${availableStock} ${item.satuan}, permintaan: ${data.jumlah} ${item.satuan}.`
      };
    }

    const newStock = item.stokSaatIni - data.jumlah;
    const now = new Date();
    const tgl = now.toISOString().split('T')[0];
    const nomorTx = `BK-BPS7106/2026/${String(stockOutList.length + sequenceOffset + 1).padStart(4, '0')}`;

    const newTx: StockOutTransaction = {
      id: crypto.randomUUID(),
      nomorTransaksi: nomorTx,
      tanggal: tgl,
      unitKerja: data.unitKerja,
      ruangan: data.ruangan,
      pemohon: data.pemohon,
      itemId: item.id,
      namaBarang: item.nama,
      jenis: item.jenis,
      jumlah: data.jumlah,
      satuan: item.satuan,
      keperluan: data.keperluan,
      petugas: currentUser?.name || 'Petugas Gudang',
      keterangan: 'Barang diserahkan dalam keadaan baik.'
    };

    setStockOutList(prev => [newTx, ...prev]);

    // Update item stock
    updateInventoryItem(item.id, {
      stokSaatIni: newStock
    });

    // Check minimum threshold
    if (newStock === 0) {
      pushNotification('HABIS_STOK', '🔴 Stok Habis!', `${item.nama} telah habis (0 ${item.satuan}). Segera lakukan pengadaan darurat.`, 'inventory');
    } else if (newStock <= item.stokMinimum) {
      pushNotification('WARNING_STOK', '⚠️ Stok Menipis!', `${item.nama} tersisa ${newStock} ${item.satuan} (Batas minimum: ${item.stokMinimum}).`, 'inventory');
    }

    logAudit('Pengeluaran Barang Keluar', 'PERSEDIAAN', `Barang keluar: ${data.jumlah} ${item.satuan} ${item.nama} untuk ${data.pemohon} (${data.unitKerja}). Sisa stok: ${newStock}.`);

    return { success: true, message: `Barang keluar berhasil dicatat! Sisa stok sekarang ${newStock} ${item.satuan}.` };
  }, [inventoryItems, requests, stockOutList, currentUser, setStockOutList, updateInventoryItem, logAudit, pushNotification]);

  return {
    stockInList, setStockInList,
    stockOutList, setStockOutList,
    addStockIn, updateStockIn, inspectStockIn, verifyStockIn,
    deleteStockIn, deleteStockInMany, addStockOut
  };
};
