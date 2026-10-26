// Rute permohonan persediaan: penghapusan massal, konfirmasi penerimaan,
// pelaporan selisih, dan pengembalian ke tahap penyerahan.
import crypto from 'node:crypto';
import { canDeleteInventoryRequests } from '../../requestAccess.mjs';
import {
  getRequestItemQuantities,
  getRequestReservedQuantity,
  normalizeRequestHandoverItems
} from '../../requestStockValidation.mjs';
import { getChangedCollections } from '../../stateAuthorization.mjs';
import { writeOperationalState } from '../../operationalWrites.mjs';

export function registerRequestRoutes(app, context) {
  const {
    dataBackend,
    collections,
    collectionCache,
    queryOne,
    execute,
    withTransaction,
    asyncRoute,
    readCollections,
    userHasPermission,
    requireUserFromTransactionState,
    bindRequestUserToState,
    whatsapp
  } = context;

  app.post('/api/requests/bulk-delete', requireUserFromTransactionState, asyncRoute(async (request, response) => {
    const ids = request.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 ||
        ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 100)) {
      return response.status(400).json({ error: 'Pilih setidaknya satu permohonan dengan ID yang valid.' });
    }
    const selectedIds = new Set(ids);
    let nextState;
    const outcome = await withTransaction(async connection => {
      const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
      const revision = Number(revisionRow?.value || 0);
      const currentState = await readCollections(connection);
      const authorizationError = bindRequestUserToState(request, currentState);
      if (authorizationError) return { status: 403, error: authorizationError };
      if (!canDeleteInventoryRequests(request.user, (user, permission) => userHasPermission(user, permission, currentState))) {
        return { status: 403, error: 'Hanya Administrator dan Operator/Pengelola BMN yang berwenang dapat menghapus permohonan.' };
      }
      const deletedRequests = (currentState.requests || []).filter(item => selectedIds.has(item.id));
      if (deletedRequests.length === 0) return { status: 200, revision };
      const numberFloors = new Map();
      for (const item of deletedRequests) {
        const match = /^REQ-BPS7106\/(\d{4})\/(\d+)$/.exec(item.nomorPermintaan || '');
        if (match && Number.isSafeInteger(Number(match[2]) + 1)) {
          numberFloors.set(match[1], Math.max(numberFloors.get(match[1]) || 1, Number(match[2]) + 1));
        }
      }
      for (const [year, floor] of numberFloors) {
        await execute(connection, `
          INSERT INTO app_meta (\`key\`, value) VALUES (?, ?)
          ON DUPLICATE KEY UPDATE value = GREATEST(CAST(value AS UNSIGNED), CAST(VALUES(value) AS UNSIGNED))
        `, [`request_number_floor:${year}`, String(floor)]);
      }
      nextState = JSON.parse(JSON.stringify(currentState));
      nextState.requests = nextState.requests.filter(item => !selectedIds.has(item.id));
      const now = new Date();
      const tanggal = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(now);
      const waktu = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).format(now);
      nextState.auditLogs = [
        ...deletedRequests.map(item => ({
          id: crypto.randomUUID(),
          userId: request.user.id,
          userName: request.user.name,
          userRole: request.user.role,
          aktivitas: 'Penghapusan Permohonan Barang',
          modul: 'PERSEDIAAN',
          tanggal,
          waktu,
          ipAddress: String(request.ip || '').slice(0, 50),
          detail: `Permohonan ${item.nomorPermintaan} (${item.id}), status ${item.status}, dihapus permanen. Stok dan transaksi barang keluar yang sudah tercatat tidak diubah.`
        })),
        ...(nextState.auditLogs || [])
      ];
      nextState.notifications = [{
        id: crypto.randomUUID(),
        type: 'TRANSAKSI',
        title: 'Permohonan Barang Dihapus',
        message: `${request.user.name} menghapus ${deletedRequests.length} permohonan barang secara permanen.`,
        timestamp: now.toISOString(),
        read: false,
        link: 'requests'
      }, ...(nextState.notifications || [])];
      if (dataBackend === 'operational') {
        await writeOperationalState(connection, currentState, nextState, {
          ...request.user,
          ipAddress: request.ip
        }, revision + 1);
      } else {
        for (const key of getChangedCollections(currentState, nextState, collections)) {
          await execute(connection, `
            INSERT INTO app_data (\`key\`, value_json)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
          `, [key, JSON.stringify(nextState[key])]);
        }
      }
      await execute(connection, `
        INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [String(revision + 1)]);
      return { status: 200, revision: revision + 1 };
    });
    if (outcome.status !== 200) return response.status(outcome.status).json({ error: outcome.error });
    if (nextState) Object.assign(collectionCache, nextState);
    response.json({ success: true, revision: outcome.revision });
  }));

  app.post('/api/requests/:id/confirm-receipt', requireUserFromTransactionState, asyncRoute(async (request, response) => {
    let currentState;
    let nextState;
    let nextRevision;
    const outcome = await withTransaction(async connection => {
      const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
      const revision = Number(revisionRow?.value || 0);
      currentState = await readCollections(connection);
      const authorizationError = bindRequestUserToState(request, currentState);
      if (authorizationError) return { status: 403, error: authorizationError };
      if (!userHasPermission(request.user, 'requestSupplies', currentState) ||
          String(request.user.role || '').trim().toLowerCase() === 'pimpinan') {
        return { status: 403, error: 'Hanya Pemohon yang berwenang dapat mengonfirmasi penerimaan.' };
      }
      const requests = Array.isArray(currentState.requests) ? currentState.requests : [];
      const target = requests.find(item => item.id === request.params.id);
      if (!target) return { status: 404, error: 'Permohonan tidak ditemukan.' };
      if (target.pemohonUserId !== request.user.id) {
        return { status: 403, error: 'Anda hanya dapat mengonfirmasi permohonan milik akun Anda.' };
      }
      if (target.status === 'Diterima' && target.penerimaan?.status === 'Diterima') {
        return { status: 200, alreadyConfirmed: true, revision };
      }
      if (target.status !== 'Menunggu Konfirmasi' ||
          target.penerimaan?.status !== 'Menunggu Konfirmasi' ||
          target.penerimaan.catatanSelisih) {
        return { status: 409, error: 'Barang belum diserahkan atau permohonan tidak menunggu konfirmasi penerimaan.' };
      }

      const requestedItems = Array.isArray(target.items) && target.items.length
        ? target.items
        : [{
            itemId: target.itemId,
            namaBarang: target.namaBarang,
            jumlahDiminta: target.jumlahDiminta,
            jumlahDisetujui: target.jumlahDisetujui,
            satuan: target.satuan
          }];
      const handover = normalizeRequestHandoverItems(target, target.penerimaan.items);
      if (!handover.items) {
          return { status: 400, error: handover.error || 'Rincian jumlah barang yang diserahkan tidak valid.' };
      }
      const handedItems = handover.items;
      const stockById = new Map((currentState.inventoryItems || []).map(item => [item.id, item]));
      const requestedById = new Map(requestedItems.map(item => [item.itemId, item]));
      const quantityById = new Map(getRequestItemQuantities(target).map(item => [item.itemId, item]));
      const receivedById = new Map();
      const receivedRows = target.penerimaan.diterimaItems ?? [];
      if (!Array.isArray(receivedRows)) {
          return { status: 400, error: 'Riwayat jumlah penerimaan tidak valid.' };
      }
      for (const receivedItem of receivedRows) {
          const requestedItem = requestedById.get(receivedItem?.itemId);
          const approvedQuantity = quantityById.get(receivedItem?.itemId)?.jumlahDisetujui;
          if (!requestedItem || receivedById.has(receivedItem.itemId) ||
              !Number.isSafeInteger(approvedQuantity) || !Number.isSafeInteger(receivedItem.jumlah) ||
              receivedItem.jumlah <= 0 || receivedItem.jumlah > approvedQuantity) {
            return { status: 400, error: 'Riwayat jumlah penerimaan tidak valid.' };
          }
          receivedById.set(receivedItem.itemId, receivedItem.jumlah);
      }
      const handedIds = new Set();
      const now = new Date();
      const transactionHeaderId = crypto.randomUUID();
      const transactionNumber = `BK-BPS7106/${now.getFullYear()}/${String((currentState.stockOutList || []).length + 1).padStart(4, '0')}`;
      const issuedItems = [];
      for (const handedItem of handedItems) {
        const requestedItem = requestedById.get(handedItem.itemId);
        if (!requestedItem || handedIds.has(handedItem.itemId)) {
          return { status: 400, error: 'Rincian barang yang diserahkan tidak sesuai dengan permohonan.' };
        }
        handedIds.add(handedItem.itemId);
        const item = stockById.get(handedItem.itemId);
        const approvedQuantity = quantityById.get(handedItem.itemId)?.jumlahDisetujui;
        const alreadyReceived = quantityById.get(handedItem.itemId)?.jumlahDiterima || 0;
        const quantity = handedItem.jumlah;
        if (!item || !Number.isSafeInteger(quantity) || quantity <= 0 ||
            !Number.isSafeInteger(approvedQuantity) || approvedQuantity <= 0 ||
            approvedQuantity > requestedItem.jumlahDiminta ||
            alreadyReceived > approvedQuantity ||
            quantity > approvedQuantity - alreadyReceived) {
          return { status: 400, error: `Jumlah penerimaan untuk ${requestedItem.namaBarang || 'barang'} tidak valid.` };
        }
        if (dataBackend === 'operational') {
          const locked = await queryOne(connection,
            'SELECT stok_saat_ini FROM inventory_items WHERE id = ? FOR UPDATE',
            [item.id]);
          if (!locked || Number(locked.stok_saat_ini) !== Number(item.stokSaatIni)) {
            return { status: 409, error: 'Saldo persediaan berubah. Muat ulang data lalu coba lagi.' };
          }
        }
        const reservedByOthers = requests
          .filter(other => other.id !== target.id &&
            ['Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Menunggu Konfirmasi'].includes(other.status))
          .reduce((sum, other) => sum + getRequestReservedQuantity(other, item.id), 0);
        if (!Number.isSafeInteger(item.stokSaatIni) || item.stokSaatIni < quantity ||
            item.stokSaatIni - quantity < reservedByOthers) {
          return { status: 409, error: `Stok ${item.nama} tidak mencukupi setelah mempertahankan reservasi permohonan lain.` };
        }
        issuedItems.push({ item, quantity, requestedItem       });
      }

      nextState = JSON.parse(JSON.stringify(currentState));
      const nextRequest = nextState.requests.find(item => item.id === target.id);
      const mutationIds = [];
      for (const { item, quantity } of issuedItems.entries()) {
        const mutableItem = nextState.inventoryItems.find(candidate => candidate.id === item.id);
        mutableItem.stokSaatIni -= quantity;
        mutableItem.totalNilai = mutableItem.stokSaatIni * Number(mutableItem.hargaSatuan || 0);
        mutableItem.status = mutableItem.stokSaatIni <= 0
          ? 'Habis'
          : mutableItem.stokSaatIni <= mutableItem.stokMinimum ? 'Menipis' : 'Aman';
        const transactionId = crypto.randomUUID();
        mutationIds.push(transactionId);
        nextState.stockOutList.unshift({
          id: transactionId,
          headerId: transactionHeaderId,
          requestId: target.id,
          nomorTransaksi: transactionNumber,
          tanggal: now.toISOString().slice(0, 10),
          unitKerja: target.unitKerja,
          ruangan: target.ruangan,
          pemohon: target.pemohonNama,
          itemId: item.id,
          namaBarang: item.nama,
          jenis: item.jenis,
          jumlah: quantity,
          satuan: item.satuan,
          keperluan: target.keperluan,
          petugas: target.penerimaan.diserahkanOleh,
          keterangan: `Penerimaan dikonfirmasi oleh ${request.user.name}; permohonan ${target.nomorPermintaan}.`
        });
      }
      const cumulativeReceivedById = new Map(receivedById);
      for (const { item, quantity } of issuedItems) {
        cumulativeReceivedById.set(item.id, (cumulativeReceivedById.get(item.id) || 0) + quantity);
      }
      const cumulativeReceivedItems = requestedItems
        .map(item => ({ itemId: item.itemId, jumlah: cumulativeReceivedById.get(item.itemId) || 0 }))
        .filter(item => item.jumlah > 0);
      const allApprovedQuantitiesReceived = getRequestItemQuantities({
        ...target,
        penerimaan: { ...target.penerimaan, diterimaItems: cumulativeReceivedItems }
      }).every(item => item.jumlahTersisa === 0);
      nextRequest.status = allApprovedQuantitiesReceived ? 'Diterima' : 'Diproses';
      nextRequest.penerimaan = {
        ...nextRequest.penerimaan,
        status: 'Diterima',
        dikonfirmasiOlehId: request.user.id,
        dikonfirmasiOleh: request.user.name,
        dikonfirmasiPada: now.toISOString(),
        mutasiIds: mutationIds,
        diterimaItems: cumulativeReceivedItems
      };
      const makassarDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(now);
      const makassarTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).format(now);
      const detail = `Permohonan ${target.nomorPermintaan} dikonfirmasi diterima oleh ${request.user.name}; mutasi ${transactionNumber}; ${issuedItems.map(({ item, quantity }) => `${item.nama} ${quantity} ${item.satuan}`).join(', ')}.`;
      nextState.auditLogs = [{
        id: crypto.randomUUID(),
        userId: request.user.id,
        userName: request.user.name,
        userRole: request.user.role,
        aktivitas: 'Konfirmasi Penerimaan Barang',
        modul: 'PERSEDIAAN',
        tanggal: makassarDate,
        waktu: makassarTime,
        ipAddress: String(request.ip || '').slice(0, 50),
        detail
      }, ...(nextState.auditLogs || [])];
      nextState.notifications = [{
        id: crypto.randomUUID(),
        type: 'TRANSAKSI',
        title: 'Barang Diterima Pemohon',
        message: `${target.nomorPermintaan}: ${request.user.name} mengonfirmasi penerimaan ${issuedItems.map(({ item, quantity }) => `${item.nama} (${quantity} ${item.satuan})`).join(', ')} pada ${makassarDate} ${makassarTime} WITA.`,
        timestamp: now.toISOString(),
        read: false,
        link: 'requests'
      }, ...(nextState.notifications || [])];

      nextRevision = revision + 1;
      if (dataBackend === 'operational') {
        await writeOperationalState(connection, currentState, nextState, {
          ...request.user,
          ipAddress: request.ip
        }, nextRevision);
      } else {
        for (const key of getChangedCollections(currentState, nextState, collections)) {
          await execute(connection, `
            INSERT INTO app_data (\`key\`, value_json)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
          `, [key, JSON.stringify(nextState[key])]);
        }
      }
      await execute(connection, `
        INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [String(nextRevision)]);
      return { status: 200, alreadyConfirmed: false, revision: nextRevision };
    });

    if (outcome.status !== 200) return response.status(outcome.status).json({ error: outcome.error });
    if (outcome.alreadyConfirmed) {
      return response.json({ success: true, alreadyConfirmed: true, revision: outcome.revision });
    }
    Object.assign(collectionCache, nextState);
    response.json({ success: true, revision: nextRevision });
    whatsapp.onStateSaved(currentState, nextState, request.user.id, nextRevision);
  }));

  app.post('/api/requests/:id/receipt-discrepancy', requireUserFromTransactionState, asyncRoute(async (request, response) => {
    const reason = String(request.body?.reason || '').trim();
    if (reason.length < 5 || reason.length > 500) {
      return response.status(400).json({ error: 'Jelaskan selisih barang dalam 5 sampai 500 karakter.' });
    }

    let currentState;
    let nextState;
    let revision;
    const outcome = await withTransaction(async connection => {
      const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
      revision = Number(revisionRow?.value || 0);
      currentState = await readCollections(connection);
      const authorizationError = bindRequestUserToState(request, currentState);
      if (authorizationError) return { status: 403, error: authorizationError };
      if (!userHasPermission(request.user, 'requestSupplies', currentState) ||
          String(request.user.role || '').trim().toLowerCase() === 'pimpinan') {
        return { status: 403, error: 'Hanya Pemohon yang berwenang melaporkan selisih penerimaan.' };
      }
      const target = (currentState.requests || []).find(item => item.id === request.params.id);
      if (!target) return { status: 404, error: 'Permohonan tidak ditemukan.' };
      if (target.pemohonUserId !== request.user.id) {
        return { status: 403, error: 'Anda hanya dapat melaporkan selisih permohonan milik akun Anda.' };
      }
      if (target.status !== 'Menunggu Konfirmasi' ||
          target.penerimaan?.status !== 'Menunggu Konfirmasi') {
        return { status: 409, error: 'Permohonan tidak menunggu konfirmasi penerimaan.' };
      }
      if (target.penerimaan.catatanSelisih === reason) return { status: 200, unchanged: true };
      nextState = JSON.parse(JSON.stringify(currentState));
      const nextRequest = nextState.requests.find(item => item.id === target.id);
      nextRequest.penerimaan.catatanSelisih = reason;
      const now = new Date();
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(now);
      const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).format(now);
      nextState.auditLogs = [{
        id: crypto.randomUUID(),
        userId: request.user.id,
        userName: request.user.name,
        userRole: request.user.role,
        aktivitas: 'Pelaporan Selisih Penerimaan Barang',
        modul: 'PERSEDIAAN',
        tanggal: date,
        waktu: time,
        ipAddress: String(request.ip || '').slice(0, 50),
        detail: `Permohonan ${target.nomorPermintaan}: ${reason}`
      }, ...(nextState.auditLogs || [])];
      nextState.notifications = [{
        id: crypto.randomUUID(),
        type: 'PERINGATAN',
        title: 'Selisih Penerimaan Barang Dilaporkan',
        message: `${target.nomorPermintaan} oleh ${request.user.name}: ${reason}`,
        timestamp: now.toISOString(),
        read: false,
        link: 'requests'
      }, ...(nextState.notifications || [])];
      revision += 1;
      if (dataBackend === 'operational') {
        await writeOperationalState(connection, currentState, nextState, {
          ...request.user,
          ipAddress: request.ip
        }, revision);
      } else {
        for (const key of getChangedCollections(currentState, nextState, collections)) {
          await execute(connection, `
            INSERT INTO app_data (\`key\`, value_json)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
          `, [key, JSON.stringify(nextState[key])]);
        }
      }
      await execute(connection, `
        INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [String(revision)]);
      return { status: 200, unchanged: false };
    });
    if (outcome.status !== 200) return response.status(outcome.status).json({ error: outcome.error });
    if (!outcome.unchanged) Object.assign(collectionCache, nextState);
    response.json({ success: true, revision });
  }));

  app.post('/api/requests/:id/reopen-handover', requireUserFromTransactionState, asyncRoute(async (request, response) => {
    let currentState;
    let nextState;
    let revision;
    const outcome = await withTransaction(async connection => {
      const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
      revision = Number(revisionRow?.value || 0);
      currentState = await readCollections(connection);
      const authorizationError = bindRequestUserToState(request, currentState);
      if (authorizationError) return { status: 403, error: authorizationError };
      if (!userHasPermission(request.user, 'manageInventory', currentState)) {
        return { status: 403, error: 'Tidak memiliki izin mengelola penyerahan barang.' };
      }
      const target = (currentState.requests || []).find(item => item.id === request.params.id);
      if (!target) return { status: 404, error: 'Permohonan tidak ditemukan.' };
      if (target.status !== 'Menunggu Konfirmasi' ||
          target.penerimaan?.status !== 'Menunggu Konfirmasi' ||
          !target.penerimaan.catatanSelisih) {
        return { status: 409, error: 'Hanya laporan selisih yang belum selesai dapat dikembalikan ke tahap penyerahan.' };
      }
      nextState = JSON.parse(JSON.stringify(currentState));
      const nextRequest = nextState.requests.find(item => item.id === target.id);
      nextRequest.status = 'Diproses';
      nextRequest.penerimaan = {
        status: 'Diproses',
        diterimaItems: target.penerimaan.diterimaItems || [],
        mutasiIds: []
      };
      const now = new Date();
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(now);
      const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).format(now);
      nextState.auditLogs = [{
        id: crypto.randomUUID(),
        userId: request.user.id,
        userName: request.user.name,
        userRole: request.user.role,
        aktivitas: 'Penanganan Selisih Penyerahan Barang',
        modul: 'PERSEDIAAN',
        tanggal: date,
        waktu: time,
        ipAddress: String(request.ip || '').slice(0, 50),
        detail: `Permohonan ${target.nomorPermintaan} dikembalikan ke tahap Diproses untuk menindaklanjuti laporan: ${target.penerimaan.catatanSelisih}`
      }, ...(nextState.auditLogs || [])];
      revision += 1;
      if (dataBackend === 'operational') {
        await writeOperationalState(connection, currentState, nextState, {
          ...request.user,
          ipAddress: request.ip
        }, revision);
      } else {
        for (const key of getChangedCollections(currentState, nextState, collections)) {
          await execute(connection, `
            INSERT INTO app_data (\`key\`, value_json)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
          `, [key, JSON.stringify(nextState[key])]);
        }
      }
      await execute(connection, `
        INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [String(revision)]);
      return { status: 200 };
    });
    if (outcome.status !== 200) return response.status(outcome.status).json({ error: outcome.error });
    Object.assign(collectionCache, nextState);
    response.json({ success: true, revision });
  }));
}
