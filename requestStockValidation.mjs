const ACTIVE_REQUEST_STATUSES = new Set([
  'Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Menunggu Konfirmasi'
]);

function requestItems(request) {
  return Array.isArray(request.items) && request.items.length
    ? request.items
    : [{
        itemId: request.itemId,
        jumlahDiminta: request.jumlahDiminta,
        jumlahDisetujui: request.jumlahDisetujui,
        satuan: request.satuan,
        namaBarang: request.namaBarang
      }];
}

function reservedQuantity(request, itemId) {
  const rows = requestItems(request);
  return rows.reduce((total, row) => {
    if (row.itemId !== itemId) return total;
    const quantity = ['Disetujui', 'Diproses', 'Menunggu Konfirmasi'].includes(request.status)
      ? row.jumlahDisetujui ?? (rows.length === 1 ? request.jumlahDisetujui : undefined) ?? row.jumlahDiminta
      : row.jumlahDiminta;
    return total + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
}

export function getRequestableStock(itemId, inventoryItems, requests) {
  const item = inventoryItems.find(candidate => candidate.id === itemId);
  if (!item || !Number.isSafeInteger(item.stokSaatIni) || item.stokSaatIni < 0) return 0;
  const committed = requests.reduce((total, request) =>
    ACTIVE_REQUEST_STATUSES.has(request.status) ? total + reservedQuantity(request, itemId) : total, 0);
  return Math.max(0, item.stokSaatIni - committed);
}

/**
 * @typedef {{ itemId: string; jumlahDiminta?: number; jumlahDisetujui?: number }} StockRequestItem
 * @typedef {{ status: string; itemId?: string; jumlahDiminta?: number; jumlahDisetujui?: number; items?: StockRequestItem[] }} StockRequest
 */

/**
 * @template {{ id: string; jenis: string; stokSaatIni: number; nama: string; kodeBarang: string; satuan: string }} T
 * @param {T[]} inventoryItems
 * @param {StockRequest[]} requests
 * @returns {T[]}
 */
export function getStockRequestInventoryItems(inventoryItems, requests) {
  return inventoryItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.jenis === 'ATK' || item.jenis === 'ARK')
    .map(entry => ({
      ...entry,
      availableStock: getRequestableStock(entry.item.id, inventoryItems, requests)
    }))
    .sort((left, right) => right.availableStock - left.availableStock || left.index - right.index)
    .map(({ item }) => item);
}

/**
 * @template {{ nama: string; kodeBarang: string }} T
 * @param {T[]} inventoryItems
 * @param {string} query
 * @returns {T[]}
 */
export function searchInventoryItems(inventoryItems, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase('id-ID');
  if (!normalizedQuery) return inventoryItems;
  return inventoryItems.filter(item =>
    item.nama.toLocaleLowerCase('id-ID').includes(normalizedQuery) ||
    item.kodeBarang.toLocaleLowerCase('id-ID').includes(normalizedQuery)
  );
}

export function validateNewRequestStock(previousState, nextState) {
  if (!Array.isArray(previousState?.requests) || !Array.isArray(previousState?.inventoryItems) ||
      !Array.isArray(nextState?.requests)) {
    return null;
  }

  const previousIds = new Set(previousState.requests.map(request => request.id));
  const newRequests = nextState.requests.filter(request =>
    !previousIds.has(request.id) && request.status === 'Diajukan'
  );
  if (newRequests.length === 0) return null;

  const inventoryById = new Map(previousState.inventoryItems.map(item => [item.id, item]));
  const reservedByItem = new Map();
  for (const request of nextState.requests) {
    if (previousIds.has(request.id) && ACTIVE_REQUEST_STATUSES.has(request.status)) {
      const itemIds = new Set(requestItems(request).map(row => row.itemId));
      for (const itemId of itemIds) {
        const quantity = reservedQuantity(request, itemId);
        if (quantity > 0) reservedByItem.set(itemId, (reservedByItem.get(itemId) || 0) + quantity);
      }
    }
  }

  const requestedByItem = new Map();
  for (const request of newRequests) {
    for (const row of requestItems(request)) {
      const itemId = String(row.itemId || '').trim();
      const item = inventoryById.get(itemId);
      if (!item) return `Barang pada permohonan ${request.nomorPermintaan} tidak ditemukan pada data persediaan server.`;
      const quantity = row.jumlahDiminta;
      if (!Number.isSafeInteger(item.stokSaatIni) || item.stokSaatIni < 0) {
        return `Saldo stok ${item.nama} tidak valid; permohonan tidak dapat diajukan.`;
      }
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return `Jumlah permohonan untuk ${item.nama} harus bilangan bulat lebih dari nol.`;
      }
      requestedByItem.set(itemId, (requestedByItem.get(itemId) || 0) + quantity);
    }
  }

  for (const [itemId, requested] of requestedByItem) {
    const item = inventoryById.get(itemId);
    const committed = reservedByItem.get(itemId) || 0;
    const available = Math.max(0, item.stokSaatIni - committed);
    if (requested > available) {
      if (available === 0) {
        return `Permohonan ${item.nama} ditolak karena stok tersedia 0 ${item.satuan}.`;
      }
      return `Jumlah permohonan ${item.nama} melebihi stok tersedia. Stok tersedia: ${available} ${item.satuan}.`;
    }
  }
  return null;
}

export function validateAdditionalStockOut(previousState, nextState) {
  if (!Array.isArray(previousState?.stockOutList) ||
      !Array.isArray(nextState?.stockOutList) ||
      !Array.isArray(previousState?.inventoryItems) ||
      !Array.isArray(previousState?.requests)) {
    return null;
  }

  const previousById = new Map(previousState.stockOutList.map(transaction => [transaction.id, transaction]));
  const additionalByItem = new Map();
  for (const transaction of nextState.stockOutList) {
    const previous = previousById.get(transaction.id);
    const additional = previous?.itemId === transaction.itemId
      ? transaction.jumlah - previous.jumlah
      : transaction.jumlah;
    if (additional <= 0) continue;
    if (!Number.isSafeInteger(additional)) {
      return 'Jumlah Barang Keluar harus berupa bilangan bulat positif.';
    }
    additionalByItem.set(transaction.itemId, (additionalByItem.get(transaction.itemId) || 0) + additional);
  }

  for (const [itemId, additional] of additionalByItem) {
    const item = previousState.inventoryItems.find(candidate => candidate.id === itemId);
    if (!item) return 'Barang untuk transaksi Barang Keluar tidak ditemukan pada data persediaan server.';
    const available = getRequestableStock(itemId, previousState.inventoryItems, previousState.requests);
    if (!Number.isSafeInteger(additional) || additional > available) {
      return `Barang Keluar ${item.nama} melebihi stok yang tidak dipesan. Stok tersedia: ${available} ${item.satuan}.`;
    }
  }
  return null;
}
