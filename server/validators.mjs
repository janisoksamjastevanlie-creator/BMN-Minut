// Validasi konsistensi state bersama; hanya menerima dan membandingkan state,
// tanpa bergantung pada cache koleksi maupun koneksi database.

export function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateRoomAssetRelations(state) {
  const rooms = state.rooms;
  const assets = state.assets;
  if (!Array.isArray(rooms) || !Array.isArray(assets)) {
    return 'Data ruangan atau aset tidak valid.';
  }

  const roomIds = new Set();
  const roomCodes = new Set();
  for (const room of rooms) {
    const id = String(room?.id || '').trim();
    const code = String(room?.code || '').trim();
    const name = String(room?.name || '').trim();
    const building = String(room?.building || '').trim();
    const picName = String(room?.picName || '').trim();
    const floor = Number(room?.floor);
    if (!id || !code || !name || !building || !picName || !Number.isInteger(floor) || floor < 1) {
      return 'Setiap ruangan harus memiliki ID, kode, nama, gedung, lantai, dan penanggung jawab yang valid.';
    }
    if (roomIds.has(id)) return 'ID ruangan tidak boleh duplikat.';
    if (roomCodes.has(code.toLocaleLowerCase('id-ID'))) return `Kode ruangan "${code}" sudah digunakan.`;
    roomIds.add(id);
    roomCodes.add(code.toLocaleLowerCase('id-ID'));
  }

  const assetIds = new Set();
  for (const asset of assets) {
    const id = String(asset?.id || '').trim();
    if (!id || assetIds.has(id)) return 'ID aset tidak valid atau duplikat.';
    assetIds.add(id);
    const roomId = String(asset?.ruanganId || '').trim();
    if (roomId && !roomIds.has(roomId)) {
      return 'Ruangan yang masih terhubung dengan aset tidak dapat dihapus. Pindahkan aset terlebih dahulu.';
    }
  }
  return null;
}

export function validateInventoryRequests(previousState, nextState) {
  if (!Array.isArray(nextState.requests) || !Array.isArray(nextState.inventoryItems)) {
    return 'Data permohonan atau master persediaan tidak valid.';
  }
  const previousRequests = Array.isArray(previousState.requests) ? previousState.requests : [];
  const previousById = new Map(previousRequests.map(item => [item.id, item]));
  const inventoryById = new Map(nextState.inventoryItems.map(item => [item.id, item]));
  const requestIds = new Set();
  const requestNumbers = new Set();

  for (const request of nextState.requests) {
    const id = String(request?.id || '').trim();
    const number = String(request?.nomorPermintaan || '').trim();
    if (!id || requestIds.has(id)) return 'ID permohonan tidak valid atau duplikat.';
    if (!number || requestNumbers.has(number)) return 'Nomor permohonan tidak valid atau duplikat.';
    requestIds.add(id);
    requestNumbers.add(number);

    const previous = previousById.get(id);
    const itemRows = Array.isArray(request?.items) && request.items.length
      ? request.items
      : [{
          itemId: request?.itemId,
          namaBarang: request?.namaBarang,
          jumlahDiminta: request?.jumlahDiminta,
          satuan: request?.satuan
        }];
    const oldRows = Array.isArray(previous?.items) && previous.items.length
      ? previous.items
      : previous ? [{
          itemId: previous.itemId,
          namaBarang: previous.namaBarang,
          jumlahDiminta: previous.jumlahDiminta,
          satuan: previous.satuan
        }] : [];
    const itemRowsChanged = !previous || JSON.stringify(itemRows) !== JSON.stringify(oldRows);
    const parentFieldsChanged = !previous || [
      'tanggal', 'pemohonNama', 'unitKerja', 'ruangan', 'keperluan', 'prioritas', 'status'
    ].some(field => request[field] !== previous[field]);
    const summaryFieldsChanged = !previous || [
      'itemId', 'namaBarang', 'jumlahDiminta', 'satuan'
    ].some(field => request[field] !== previous[field]);
    const approvalChanged = !previous || request.jumlahDisetujui !== previous.jumlahDisetujui;
    const receiptChanged = !previous || JSON.stringify(request.penerimaan) !== JSON.stringify(previous.penerimaan);
    if (!itemRowsChanged && !parentFieldsChanged && !summaryFieldsChanged && !approvalChanged && !receiptChanged) continue;

    if (!isValidCalendarDate(request?.tanggal) ||
        !String(request?.pemohonNama || '').trim() ||
        !String(request?.unitKerja || '').trim() ||
        !String(request?.ruangan || '').trim() ||
        !String(request?.keperluan || '').trim() ||
        !['Rendah', 'Normal', 'Tinggi', 'Mendesak'].includes(request?.prioritas) ||
        !['Draft', 'Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Menunggu Konfirmasi', 'Diterima', 'Selesai', 'Ditolak', 'Dibatalkan'].includes(request?.status)) {
      return `Data induk permohonan ${number} tidak lengkap atau tidak valid.`;
    }
    if (!Number.isSafeInteger(request.jumlahDiminta) || request.jumlahDiminta <= 0 ||
        (request.jumlahDisetujui !== undefined &&
         (!Number.isSafeInteger(request.jumlahDisetujui) || request.jumlahDisetujui <= 0 || request.jumlahDisetujui > request.jumlahDiminta))) {
      return `Jumlah permohonan ${number} tidak valid.`;
    }
    if (!previous && previousState.requests !== null && request.status !== 'Diajukan') {
      return `Permohonan baru ${number} harus dimulai dengan status Diajukan.`;
    }

    if (request.status === 'Menunggu Konfirmasi') {
      const handoverRows = request.penerimaan?.items;
      if (request.penerimaan?.status !== 'Menunggu Konfirmasi' ||
          !String(request.penerimaan.diserahkanOleh || '').trim() ||
          !Number.isFinite(Date.parse(request.penerimaan.diserahkanPada)) ||
          !Array.isArray(handoverRows) || handoverRows.length === 0) {
        return `Data penyerahan barang permohonan ${number} tidak valid.`;
      }
      const approvedById = new Map(itemRows.map(item => [
        item.itemId,
        item.jumlahDisetujui ?? (itemRows.length === 1 ? request.jumlahDisetujui : undefined) ?? item.jumlahDiminta
      ]));
      for (const item of itemRows) {
        const approved = approvedById.get(item.itemId);
        if (!Number.isSafeInteger(approved) || approved <= 0 || approved > item.jumlahDiminta) {
          return `Jumlah disetujui pada permohonan ${number} tidak valid.`;
        }
      }
      const receivedById = new Map();
      const receivedRows = request.penerimaan.diterimaItems ?? [];
      if (!Array.isArray(receivedRows)) {
        return `Riwayat penerimaan barang permohonan ${number} tidak valid.`;
      }
      for (const receivedItem of receivedRows) {
        const approved = approvedById.get(receivedItem?.itemId);
        if (approved === undefined || receivedById.has(receivedItem.itemId) ||
            !Number.isSafeInteger(receivedItem.jumlah) || receivedItem.jumlah <= 0 ||
            receivedItem.jumlah > approved) {
          return `Riwayat penerimaan barang permohonan ${number} tidak valid.`;
        }
        receivedById.set(receivedItem.itemId, receivedItem.jumlah);
      }
      const handedIds = new Set();
      for (const handedItem of handoverRows) {
        const approved = approvedById.get(handedItem?.itemId);
        const alreadyReceived = receivedById.get(handedItem?.itemId) || 0;
        if (approved === undefined || handedIds.has(handedItem.itemId) ||
            !Number.isSafeInteger(handedItem.jumlah) || handedItem.jumlah <= 0 ||
            handedItem.jumlah > Math.max(0, approved - alreadyReceived)) {
          return `Jumlah penyerahan barang permohonan ${number} tidak valid.`;
        }
        handedIds.add(handedItem.itemId);
      }
    }

    if (itemRowsChanged) {
      if (itemRows.length > 100) return `Permohonan ${number} melebihi batas 100 jenis barang.`;

      const itemIds = new Set();
      for (let index = 0; index < itemRows.length; index += 1) {
        const item = itemRows[index];
        const itemId = String(item?.itemId || '').trim();
        const masterItem = inventoryById.get(itemId);
        if (!itemId || !masterItem) return `Barang pada baris ${index + 1} permohonan ${number} tidak ditemukan dalam master persediaan.`;
        if (itemIds.has(itemId)) return `Barang yang sama tidak boleh berulang pada permohonan ${number}.`;
        itemIds.add(itemId);
        if (item.namaBarang !== masterItem.nama || item.satuan !== masterItem.satuan ||
            (item.kodeBarang !== undefined && item.kodeBarang !== masterItem.kodeBarang) ||
            !Number.isSafeInteger(item.jumlahDiminta) || item.jumlahDiminta <= 0) {
          return `Nama, satuan, atau jumlah barang pada baris ${index + 1} permohonan ${number} tidak valid.`;
        }
        if (!previous && previousState.requests !== null && item.jumlahDisetujui !== undefined) {
          return `Permohonan baru ${number} belum boleh memiliki jumlah yang disetujui.`;
        }
        if ((item.spesifikasi !== undefined && (typeof item.spesifikasi !== 'string' || item.spesifikasi.length > 250)) ||
            (item.catatan !== undefined && (typeof item.catatan !== 'string' || item.catatan.length > 250))) {
          return `Spesifikasi atau catatan pada baris ${index + 1} permohonan ${number} tidak valid.`;
        }
        if (item.jumlahDisetujui !== undefined &&
            (!Number.isSafeInteger(item.jumlahDisetujui) || item.jumlahDisetujui <= 0 || item.jumlahDisetujui > item.jumlahDiminta)) {
          return `Jumlah disetujui pada baris ${index + 1} permohonan ${number} tidak valid.`;
        }
        if (['Disetujui', 'Diproses', 'Menunggu Konfirmasi', 'Diterima', 'Selesai'].includes(request.status)) {
          const approved = item.jumlahDisetujui
            ?? (itemRows.length === 1 ? request.jumlahDisetujui : undefined)
            ?? item.jumlahDiminta;
          if (!Number.isSafeInteger(approved) || approved <= 0 || approved > item.jumlahDiminta) {
            return `Jumlah disetujui pada baris ${index + 1} permohonan ${number} tidak valid.`;
          }
        }
      }
    }

    if (itemRowsChanged || summaryFieldsChanged) {
      if (request.itemId !== itemRows[0].itemId ||
          request.namaBarang !== itemRows[0].namaBarang ||
          request.jumlahDiminta !== itemRows[0].jumlahDiminta ||
          request.satuan !== itemRows[0].satuan) {
        return `Ringkasan barang pada permohonan ${number} tidak sesuai dengan detail pertama.`;
      }
    }
    if (!itemRowsChanged && (approvalChanged || parentFieldsChanged) &&
        ['Disetujui', 'Diproses', 'Menunggu Konfirmasi', 'Diterima', 'Selesai'].includes(request.status) &&
        itemRows.length === 1) {
      const approved = request.jumlahDisetujui ?? itemRows[0].jumlahDiminta;
      if (!Number.isSafeInteger(approved) || approved <= 0 || approved > itemRows[0].jumlahDiminta) {
        return `Jumlah disetujui pada permohonan ${number} tidak valid.`;
      }
    }
  }
  return null;
}

export function validateStockInWorkflow(previousState, nextState) {
  if (previousState.stockInList === null) return null;
  const previous = previousState.stockInList || [];
  const next = nextState.stockInList;
  if (!Array.isArray(next) || !Array.isArray(nextState.inventoryItems)) {
    return 'Data Barang Masuk atau persediaan tidak valid.';
  }

  const knownStatuses = new Set(['Menunggu Pemeriksaan', 'Sudah Diperiksa', 'Diverifikasi', 'Ditolak']);
  const previousById = new Map(previous.map(item => [item.id, item]));
  const nextById = new Map();
  for (const item of next) {
    const id = String(item?.id || '').trim();
    if (!id || nextById.has(id)) return 'ID transaksi Barang Masuk tidak valid atau duplikat.';
    nextById.set(id, item);
  }
  const numberCounts = new Map();
  for (const item of next) {
    const number = String(item?.nomorTransaksi || '').trim();
    if (number) numberCounts.set(number, (numberCounts.get(number) || 0) + 1);
  }

  const validTransaction = item =>
    String(item?.nomorTransaksi || '').trim() &&
    isValidCalendarDate(item?.tanggal) &&
    String(item?.nomorDokumen || '').trim() &&
    String(item?.sumber || '').trim() &&
    String(item?.itemId || '').trim() &&
    Number.isFinite(item?.jumlah) && item.jumlah > 0 &&
    Number.isFinite(item?.hargaSatuan) && item.hargaSatuan >= 0 &&
    Number.isFinite(item?.totalHarga) && item.totalHarga >= 0;

  for (const item of next) {
    const old = previousById.get(item.id);
    if (old && JSON.stringify(old) === JSON.stringify(item)) continue;
    if ((numberCounts.get(String(item?.nomorTransaksi || '').trim()) || 0) > 1) {
      return 'Nomor transaksi Barang Masuk tidak boleh duplikat.';
    }
    if (!validTransaction(item)) return 'Data transaksi Barang Masuk tidak lengkap atau tidak valid.';
    if (item.status && !knownStatuses.has(item.status)) return 'Status transaksi Barang Masuk tidak valid.';
    if (!old) {
      if (item.status !== 'Menunggu Pemeriksaan' || item.pemeriksaan || item.diverifikasiOleh || item.diverifikasiPada) {
        return 'Transaksi baru harus menunggu pemeriksaan dan belum boleh mengubah stok.';
      }
      continue;
    }
    if (!old.status) return 'Transaksi historis Barang Masuk tidak dapat diubah.';
    const allowedTransition =
      old.status === item.status ||
      (old.status === 'Menunggu Pemeriksaan' && item.status === 'Sudah Diperiksa') ||
      (old.status === 'Sudah Diperiksa' && (item.status === 'Diverifikasi' || item.status === 'Ditolak')) ||
      (old.status === 'Ditolak' && item.status === 'Menunggu Pemeriksaan');
    if (!allowedTransition) return 'Urutan pemeriksaan dan verifikasi Barang Masuk tidak valid.';
    if (old.status === 'Diverifikasi' && JSON.stringify(old) !== JSON.stringify(item)) {
      return 'Transaksi yang sudah diverifikasi tidak dapat diubah.';
    }
    if (item.status === 'Sudah Diperiksa' || item.status === 'Diverifikasi' || item.status === 'Ditolak') {
      const inspection = item.pemeriksaan;
      if (!inspection || !['Baik', 'Rusak Ringan', 'Rusak Berat'].includes(inspection.kondisi) ||
          typeof inspection.jumlahSesuai !== 'boolean' ||
          typeof inspection.dokumenSesuai !== 'boolean' ||
          typeof inspection.barangSesuai !== 'boolean' ||
          !String(inspection.diperiksaOleh || '').trim() ||
          !Number.isFinite(Date.parse(inspection.diperiksaPada))) {
        return 'Data pemeriksaan Barang Masuk tidak lengkap.';
      }
    }
    if ((item.status === 'Diverifikasi' || item.status === 'Ditolak') &&
        (!String(item.diverifikasiOleh || '').trim() || !Number.isFinite(Date.parse(item.diverifikasiPada)))) {
      return 'Data verifikasi Barang Masuk tidak lengkap.';
    }
    if (old.status === 'Sudah Diperiksa' && item.status === 'Diverifikasi') {
      const inspection = item.pemeriksaan;
      if (!inspection.jumlahSesuai || !inspection.dokumenSesuai || !inspection.barangSesuai ||
          inspection.kondisi === 'Rusak Berat') {
        return 'Penerimaan dengan hasil pemeriksaan tidak sesuai atau kondisi rusak berat tidak dapat diterima.';
      }
    }
  }

  const isPosted = item => !item.status || item.status === 'Diverifikasi';
  const previousTotals = new Map();
  const nextTotals = new Map();
  const touchedItems = new Set();
  const changedIds = new Set();
  for (const item of previous) {
    const incoming = nextById.get(item.id);
    if (!incoming || JSON.stringify(item) !== JSON.stringify(incoming)) changedIds.add(item.id);
  }
  for (const item of next) {
    const old = previousById.get(item.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(item)) changedIds.add(item.id);
  }
  for (const id of changedIds) {
    const old = previousById.get(id);
    const incoming = nextById.get(id);
    if (old && incoming) touchedItems.add(old.itemId);
    if (incoming) {
      if (!nextState.inventoryItems.some(item => item.id === incoming.itemId)) {
        return 'Barang persediaan untuk transaksi Barang Masuk tidak ditemukan.';
      }
      touchedItems.add(incoming.itemId);
    } else if (old && isPosted(old) && nextState.inventoryItems.some(item => item.id === old.itemId)) {
      touchedItems.add(old.itemId);
    }
  }
  for (const item of previous) {
    if (isPosted(item)) previousTotals.set(item.itemId, (previousTotals.get(item.itemId) || 0) + item.jumlah);
  }
  for (const item of next) {
    if (isPosted(item)) nextTotals.set(item.itemId, (nextTotals.get(item.itemId) || 0) + item.jumlah);
  }
  const stockEffects = new Map();
  for (const itemId of touchedItems) {
    const effect = (nextTotals.get(itemId) || 0) - (previousTotals.get(itemId) || 0);
    stockEffects.set(itemId, effect);
  }

  for (const [id, old] of previousById) {
    if (nextById.has(id) || !isPosted(old)) continue;
    const item = nextState.inventoryItems.find(entry => entry.id === old.itemId);
    if (!item && old.status) {
      return 'Transaksi Barang Masuk terverifikasi tidak dapat dihapus karena master barang terkait tidak ditemukan.';
    }
  }

  if (stockEffects.size > 0 && JSON.stringify(previousState.opnames || []) === JSON.stringify(nextState.opnames || [])) {
    const oldStock = new Map((previousState.inventoryItems || []).map(item => [item.id, item.stokSaatIni]));
    const newStock = new Map(nextState.inventoryItems.map(item => [item.id, item.stokSaatIni]));
    const oldOut = new Map();
    const newOut = new Map();
    for (const transaction of previousState.stockOutList || []) {
      oldOut.set(transaction.itemId, (oldOut.get(transaction.itemId) || 0) + transaction.jumlah);
    }
    for (const transaction of nextState.stockOutList || []) {
      newOut.set(transaction.itemId, (newOut.get(transaction.itemId) || 0) + transaction.jumlah);
    }
    for (const [itemId, effect] of stockEffects) {
      if (!oldStock.has(itemId)) {
        if (effect !== 0) return 'Barang terkait harus tersedia untuk memperbarui stok dari transaksi Barang Masuk.';
        continue;
      }
      if (!newStock.has(itemId)) {
        if (effect !== 0) return 'Barang terkait harus tersedia untuk memperbarui stok dari transaksi Barang Masuk.';
        continue;
      }
      if (!Number.isFinite(oldStock.get(itemId)) || !Number.isFinite(newStock.get(itemId))) {
        return 'Barang terkait harus tersedia untuk memperbarui stok dari transaksi Barang Masuk.';
      }
      const stockOutEffect = (newOut.get(itemId) || 0) - (oldOut.get(itemId) || 0);
      const expected = effect - stockOutEffect;
      if (Math.abs(newStock.get(itemId) - oldStock.get(itemId) - expected) > 1e-9 || newStock.get(itemId) < -1e-9) {
        return 'Perubahan stok tidak sesuai dengan transaksi Barang Masuk yang diverifikasi.';
      }
    }
  }
  return null;
}
