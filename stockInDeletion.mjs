export function planStockInDeletion(ids, stockInList, inventoryItems, canManageInventory) {
  if (!Array.isArray(ids)) {
    return { deletedIds: [], deletedTransactions: [], stockByItem: new Map(), errors: [{ id: '', message: 'Daftar ID transaksi tidak valid.' }] };
  }
  if (!canManageInventory) {
    return {
      deletedIds: [],
      deletedTransactions: [],
      stockByItem: new Map(),
      errors: ids.map(id => ({ id: String(id ?? ''), message: 'Anda tidak memiliki izin menghapus transaksi Barang Masuk.' }))
    };
  }

  const transactionsById = new Map((Array.isArray(stockInList) ? stockInList : []).map(transaction => [transaction.id, transaction]));
  const inventoryById = new Map((Array.isArray(inventoryItems) ? inventoryItems : []).map(item => [item.id, item]));
  const stockByItem = new Map(Array.from(inventoryById, ([id, item]) => [id, item.stokSaatIni]));
  const deletedIds = [];
  const deletedTransactions = [];
  const errors = [];
  const seenIds = new Set();

  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim()) {
      errors.push({ id: String(id ?? ''), message: 'ID transaksi tidak valid.' });
      continue;
    }
    if (seenIds.has(id)) {
      errors.push({ id, message: 'ID transaksi duplikat dalam permintaan penghapusan.' });
      continue;
    }
    seenIds.add(id);
    const transaction = transactionsById.get(id);
    if (!transaction) {
      errors.push({ id, message: 'Transaksi Barang Masuk tidak ditemukan.' });
      continue;
    }

    const isPosted = transaction.status === undefined || transaction.status === 'Diverifikasi';
    if (isPosted) {
      const item = inventoryById.get(transaction.itemId);
      const availableStock = stockByItem.get(transaction.itemId);
      if (!item || availableStock === undefined) {
        errors.push({ id, message: 'Barang persediaan terkait tidak ditemukan; transaksi historis tidak dapat dihapus dengan aman.' });
        continue;
      }
      if (!Number.isFinite(transaction.jumlah) || transaction.jumlah <= 0) {
        errors.push({ id, message: 'Jumlah transaksi tidak valid sehingga stok tidak dapat dikoreksi.' });
        continue;
      }
      if (availableStock < transaction.jumlah) {
        errors.push({ id, message: `Stok ${item.nama} tidak mencukupi untuk mengoreksi penerimaan ${transaction.jumlah} ${transaction.satuan}.` });
        continue;
      }
      stockByItem.set(transaction.itemId, availableStock - transaction.jumlah);
    }

    deletedIds.push(id);
    deletedTransactions.push(transaction);
  }

  return { deletedIds, deletedTransactions, stockByItem, errors };
}
