// Rute sinkronisasi state: snapshot koleksi, penulisan state bersama
// (validasi, otorisasi, persistensi), dan kartu stok persediaan.
import crypto from 'node:crypto';
import { performanceTiming } from '../../performanceMetrics.mjs';
import { fillOmittedCollections } from '../../stateConflict.mjs';
import { assignNewRequestNumbers } from '../../requestNumber.mjs';
import {
  normalizeRequestHandoverItems,
  validateAdditionalStockOut,
  validateNewRequestStock
} from '../../requestStockValidation.mjs';
import { validateRequestAuthorization } from '../../requestAccess.mjs';
import { authorizeChangedCollections, getChangedCollections, getChangedUserProfiles, restoreRestrictedFinancialData } from '../../stateAuthorization.mjs';
import { writeOperationalState } from '../../operationalWrites.mjs';
import { buildRequestEvents } from '../../automation/n8n/integration.mjs';
import { buildFonnteRequestNotification } from '../../whatsapp/request-notification.mjs';
import { measureExternalService } from '../serviceMetrics.mjs';
import { currentMakassarDate } from '../datetime.mjs';
import { validateRoomAssetRelations, validateInventoryRequests, validateStockInWorkflow } from '../validators.mjs';

export function registerStateRoutes(app, context) {
  const {
    db,
    dataBackend,
    collections,
    permissionsByCollection,
    collectionCache,
    queryRows,
    queryOne,
    execute,
    withTransaction,
    asyncRoute,
    readCollections,
    userHasPermission,
    stateForUser,
    requireUser,
    requireUserFromTransactionState,
    bindRequestUserToState,
    whatsapp,
    n8nIntegration,
    whatsappProvider,
    sendTwilioRequestEvent
  } = context;

  async function syncAccountProfiles(connection, users, previousUsers) {
    for (const user of getChangedUserProfiles(previousUsers, users)) {
      await execute(connection, 'UPDATE auth_users SET nip = ?, profile_json = ? WHERE id = ?', [
        String(user.nip).trim(), JSON.stringify(user), user.id
      ]);
    }
  }

  app.get('/api/state', performanceTiming('GET /api/state'), requireUserFromTransactionState, asyncRoute(async (request, response) => {
    const snapshot = await withTransaction(async connection => {
      const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision'");
      const state = await readCollections(connection);
      const error = bindRequestUserToState(request, state);
      return { state, error, revision: Number(revisionRow?.value || 0) };
    });
    if (snapshot.error) return response.status(403).json({ error: snapshot.error });
    const state = stateForUser(snapshot.state, request.user);
    response.json({ state, initialized: state.users !== null, revision: snapshot.revision, dataBackend });
  }));

  app.get('/api/inventory/:id/stock-card', requireUser, asyncRoute(async (request, response) => {
    if (!userHasPermission(request.user, 'viewInventory') && !userHasPermission(request.user, 'manageInventory')) {
      return response.status(403).json({ error: 'Tidak memiliki izin melihat kartu stok.' });
    }
    if (dataBackend !== 'operational') {
      return response.status(404).json({ error: 'Kartu stok relasional tidak tersedia pada backend ini.' });
    }
    const rows = await queryRows(db, `
      SELECT id, tanggal, nomor_transaksi, tipe_transaksi, masuk, keluar, saldo, keterangan, petugas
      FROM stock_card_ledger
      WHERE item_id = ?
      ORDER BY tanggal, id
    `, [request.params.id]);
    response.json({
      entries: rows.map(row => ({
        id: row.id,
        tanggal: row.tanggal instanceof Date ? row.tanggal.toISOString().slice(0, 10) : String(row.tanggal).slice(0, 10),
        noTransaksi: row.nomor_transaksi,
        tipe: row.tipe_transaksi,
        masuk: Number(row.masuk),
        keluar: Number(row.keluar),
        saldo: Number(row.saldo),
        keterangan: row.keterangan || '',
        petugas: row.petugas || ''
      }))
    });
  }));

  app.put('/api/state', performanceTiming('PUT /api/state'), requireUserFromTransactionState, asyncRoute(async (request, response) => {
    const submittedState = request.body?.state;
    if (!submittedState || typeof submittedState !== 'object' || Array.isArray(submittedState)) {
      return response.status(400).json({ error: 'Format data tidak valid.' });
    }
    let state = JSON.parse(JSON.stringify(submittedState));
    let transactionStartedAt = 0;
    let transactionMs = 0;
    let stateReadMs = 0;
    let persistenceMs = 0;
    let accountProfileSyncMs = 0;
    let legacyCollectionsWritten = null;
    let currentState;
    let cancellationEvents;
    let revision;
    try {
      transactionStartedAt = Date.now();
      const outcome = await withTransaction(async connection => {
        const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
        revision = Number(revisionRow?.value || 0);
        if (!Number.isInteger(request.body?.revision) || request.body.revision !== revision) {
          return { status: 409, body: { error: 'Data berubah di perangkat lain. Muat ulang halaman sebelum menyimpan lagi.', revision } };
        }
        const stateReadStartedAt = Date.now();
        try {
          currentState = await readCollections(connection);
        } finally {
          stateReadMs += Date.now() - stateReadStartedAt;
        }
        const authorizationError = bindRequestUserToState(request, currentState);
        if (authorizationError) {
          return { status: 403, body: { error: authorizationError, revision } };
        }
        state = fillOmittedCollections(state, currentState, collections);
        const numberFloors = await queryRows(connection, "SELECT `key`, value FROM app_meta WHERE `key` LIKE 'request_number_floor:%'");
        const minimumSequences = {};
        for (const row of numberFloors) {
          const sequence = Number(row.value);
          if (!Number.isSafeInteger(sequence) || sequence < 1) {
            throw new Error('Batas nomor permohonan tersimpan tidak valid.');
          }
          minimumSequences[row.key.slice('request_number_floor:'.length)] = sequence;
        }
        const requestNumberAssignments = assignNewRequestNumbers(currentState.requests, state.requests, minimumSequences);
        state.requests = requestNumberAssignments.requests;
        if (!userHasPermission(request.user, 'manageInventory', currentState)) {
          restoreRestrictedFinancialData(state, currentState);
        }
        const previousRequestsById = new Map((currentState.requests || []).map(item => [item.id, item]));
        const canAssignAnotherRequester =
          userHasPermission(request.user, 'approveRequests', currentState) ||
          userHasPermission(request.user, 'manageInventory', currentState);
        for (const inventoryRequest of state.requests || []) {
          const previous = previousRequestsById.get(inventoryRequest.id);
          if (previous) {
            inventoryRequest.pemohonUserId = previous.pemohonUserId;
            if (inventoryRequest.status === 'Menunggu Konfirmasi' &&
                previous.status === 'Diproses' &&
                userHasPermission(request.user, 'manageInventory', currentState)) {
              const approvedItems = previous.items?.length ? previous.items : [{
                itemId: previous.itemId,
                namaBarang: previous.namaBarang,
                jumlahDiminta: previous.jumlahDiminta,
                jumlahDisetujui: previous.jumlahDisetujui || previous.jumlahDiminta,
                satuan: previous.satuan
              }];
              const submittedItems = Array.isArray(inventoryRequest.penerimaan?.items)
                ? inventoryRequest.penerimaan.items
                : inventoryRequest.items;
              const alreadyReceivedItems = previous.penerimaan?.diterimaItems || [];
              if (!Array.isArray(submittedItems) || submittedItems.length === 0 ||
                  !Array.isArray(alreadyReceivedItems)) {
                return { status: 400, body: { error: 'Rincian barang yang akan diserahkan tidak valid.' } };
              }
              const approvedById = new Map(approvedItems.map(item => [item.itemId, item]));
              const receivedById = new Map();
              for (const receivedItem of alreadyReceivedItems) {
                const approvedItem = approvedById.get(receivedItem?.itemId);
                const approvedQuantity = approvedItem?.jumlahDisetujui ?? approvedItem?.jumlahDiminta;
                if (!approvedItem || receivedById.has(receivedItem.itemId) ||
                    !Number.isSafeInteger(approvedQuantity) || approvedQuantity <= 0 ||
                    !Number.isSafeInteger(receivedItem.jumlah) || receivedItem.jumlah <= 0 ||
                    receivedItem.jumlah > approvedQuantity) {
                  return { status: 400, body: { error: 'Riwayat jumlah penerimaan permohonan tidak valid.' } };
                }
                receivedById.set(receivedItem.itemId, receivedItem.jumlah);
              }
              const handover = normalizeRequestHandoverItems(
                { ...previous, items: approvedItems },
                submittedItems
              );
              if (!handover.items) {
                return { status: 400, body: { error: handover.error || 'Rincian barang yang akan diserahkan tidak valid.' } };
              }
              const deliveredItems = handover.items;
              inventoryRequest.items = approvedItems;
              inventoryRequest.itemId = approvedItems[0].itemId;
              inventoryRequest.jumlahDiminta = previous.jumlahDiminta;
              inventoryRequest.jumlahDisetujui = previous.jumlahDisetujui;
              inventoryRequest.namaBarang = previous.namaBarang;
              inventoryRequest.satuan = previous.satuan;
              inventoryRequest.penerimaan = {
                status: 'Menunggu Konfirmasi',
                diserahkanOleh: request.user.name,
                diserahkanPada: new Date().toISOString(),
                items: deliveredItems,
                mutasiIds: [],
                diterimaItems: alreadyReceivedItems
              };
            } else {
              inventoryRequest.penerimaan = previous.penerimaan;
            }
            continue;
          }
          const requester = canAssignAnotherRequester
            ? (currentState.users || []).find(user =>
                String(user.name || '').trim().toLocaleLowerCase('id-ID') ===
                String(inventoryRequest.pemohonNama || '').trim().toLocaleLowerCase('id-ID')
              )
            : request.user;
          if (!requester ||
              (!canAssignAnotherRequester &&
               String(inventoryRequest.pemohonNama || '').trim().toLocaleLowerCase('id-ID') !==
               String(request.user.name || '').trim().toLocaleLowerCase('id-ID'))) {
            return { status: 403, body: { error: 'Permohonan baru harus diajukan atas nama pengguna yang sedang masuk.' } };
          }
          if (inventoryRequest.pemohonUserId && inventoryRequest.pemohonUserId !== requester.id) {
            return { status: 403, body: { error: 'Identitas Pemohon pada permohonan tidak valid.' } };
          }
          inventoryRequest.pemohonUserId = requester.id;
          delete inventoryRequest.penerimaan;
        }
        const currentDocuments = currentState.documents || [];
        const nextDocuments = Array.isArray(state.documents) ? state.documents : [];
        const noteFields = [
          'nomorDokumen', 'judul', 'tanggal', 'status', 'description', 'namaToko',
          'kategoriNota', 'totalNilaiNota', 'items', 'tags'
        ];
        for (const previousDocument of currentDocuments) {
          if (previousDocument.jenis !== 'Nota') continue;
          const nextDocument = nextDocuments.find(item => item?.id === previousDocument.id);
          const changed = !nextDocument || noteFields.some(field =>
            JSON.stringify(nextDocument[field]) !== JSON.stringify(previousDocument[field])
          );
          if (changed && !userHasPermission(request.user, 'manageInventory', currentState)) {
            return {
              status: 403,
              body: { error: 'Nota belanja hanya dapat diubah oleh role yang berwenang atas persediaan.', revision }
            };
          }
          if (changed && previousDocument.status !== 'Draft' &&
              !userHasPermission(request.user, 'systemSettings', currentState)) {
            return {
              status: 403,
              body: { error: 'Nota final/terkunci hanya dapat diubah melalui otorisasi administrator.', revision }
            };
          }
        }
        if (nextDocuments.some(document =>
          document?.jenis === 'Nota' &&
          !currentDocuments.some(previous => previous.id === document.id) &&
          !userHasPermission(request.user, 'manageInventory', currentState)
        )) {
          return {
            status: 403,
            body: { error: 'Nota belanja hanya dapat dibuat oleh role yang berwenang atas persediaan.', revision }
          };
        }
        for (const previousDocument of currentDocuments) {
          if (previousDocument.storageBackend !== 'hostinger') continue;
          const nextDocument = nextDocuments.find(item => item?.id === previousDocument.id);
          if (!nextDocument) {
            return {
              status: 409,
              body: { error: 'Dokumen pada penyimpanan backend harus dihapus melalui aksi Hapus agar file dan metadata tetap konsisten.', revision }
            };
          }
          for (const field of [
            'storageBackend', 'storageKey', 'storageSize', 'sha256',
            'idempotencyKey', 'fileName', 'fileType', 'uploadedAt'
          ]) {
            if (nextDocument[field] !== previousDocument[field]) {
              return { status: 403, body: { error: 'Metadata berkas penyimpanan backend hanya dapat diubah oleh server.', revision } };
            }
          }
        }
        if (nextDocuments.some(document =>
          document &&
          !currentDocuments.some(previous => previous.id === document.id) && document.storageBackend === 'hostinger'
        )) {
          return { status: 403, body: { error: 'Referensi penyimpanan backend hanya dapat dibuat melalui endpoint unggah dokumen.', revision } };
        }
        if (!authorizeChangedCollections({
          user: request.user,
          state,
          current: currentState,
          permissionsByCollection,
          userHasPermission
        })) {
          return { status: 403, body: { error: 'Role Anda tidak memiliki izin untuk menyimpan perubahan ini.' } };
        }
        const relationError = validateRoomAssetRelations(state);
        if (relationError) return { status: 400, body: { error: relationError } };
        const requestError = validateInventoryRequests(currentState, state);
        if (requestError) return { status: 400, body: { error: requestError } };
        const requestAuthError = validateRequestAuthorization(
          request.user,
          currentState.requests,
          state.requests,
          (u, p) => userHasPermission(u, p, currentState),
          currentState.auditLogs,
          state.auditLogs
        );
        if (requestAuthError) return { status: 403, body: { error: requestAuthError } };
        const requestStockError = validateNewRequestStock(currentState, state);
        if (requestStockError) return { status: 400, body: { error: requestStockError } };
        const stockOutError = validateAdditionalStockOut(currentState, state);
        if (stockOutError) return { status: 400, body: { error: stockOutError } };
        const stockInError = validateStockInWorkflow(currentState, state);
        if (stockInError) return { status: 400, body: { error: stockInError } };
        for (const key of collections) {
          if (!Array.isArray(state[key])) return { status: 400, body: { error: `Koleksi ${key} tidak valid.` } };
        }
        const previousRequests = Array.isArray(currentState.requests) ? currentState.requests : [];
        const previousAuditLogIds = new Set((currentState.auditLogs || []).map(log => log.id));
        const cancelledRequests = whatsappProvider === 'twilio' || whatsappProvider === 'fonnte'
          ? previousRequests.filter(item => {
              const nextRequest = state.requests.find(candidate => candidate.id === item.id);
              return nextRequest && item.status !== 'Dibatalkan' && nextRequest.status === 'Dibatalkan';
            })
          : [];
        cancellationEvents = [];
        const persistenceStartedAt = Date.now();
        try {
          if (dataBackend === 'operational') {
            await writeOperationalState(connection, currentState, state, {
              ...request.user,
              ipAddress: request.ip
            }, revision + 1);
          } else {
            const changedKeys = getChangedCollections(currentState, state, collections);
            legacyCollectionsWritten = changedKeys.length;
            for (const key of changedKeys) {
              await execute(connection, `
                INSERT INTO app_data (\`key\`, value_json)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
              `, [key, JSON.stringify(state[key])]);
            }
          }
        } finally {
          persistenceMs += Date.now() - persistenceStartedAt;
        }
        const accountProfileSyncStartedAt = Date.now();
        try {
          await syncAccountProfiles(connection, state.users, currentState.users);
        } finally {
          accountProfileSyncMs += Date.now() - accountProfileSyncStartedAt;
        }
        await execute(connection, `
          INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value)
        `, [String(revision + 1)]);
        for (const inventoryRequest of cancelledRequests) {
          const existingEvent = await queryOne(connection, `
            SELECT event_id FROM whatsapp_notification_events
            WHERE request_id = ? AND request_status = 'Dibatalkan' AND action = 'cancelled'
            LIMIT 1
          `, [inventoryRequest.id]);
          if (existingEvent) continue;
          const eventId = crypto.randomUUID();
          await execute(connection, `
            INSERT INTO whatsapp_notification_events (event_id, request_id, request_status, action, status)
            VALUES (?, ?, 'Dibatalkan', 'cancelled', 'sending')
          `, [eventId, inventoryRequest.id]);
          const owner = (await queryOne(connection, 'SELECT user_id FROM whatsapp_request_owners WHERE request_id = ?', [inventoryRequest.id]))?.user_id
            || inventoryRequest.pemohonUserId
            || currentState.users.find(user =>
              String(user.name || '').trim().toLocaleLowerCase('id-ID') ===
              String(inventoryRequest.pemohonNama || '').trim().toLocaleLowerCase('id-ID')
            )?.id;
          const cancellationPrefix = `Permohonan ${inventoryRequest.id} dibatalkan. Alasan: `;
          const cancellationReason = (state.auditLogs || []).find(log =>
            !previousAuditLogIds.has(log.id) &&
            log.aktivitas === 'Pembatalan Permohonan Barang' &&
            typeof log.detail === 'string' &&
            log.detail.startsWith(cancellationPrefix)
          )?.detail.slice(cancellationPrefix.length).trim();
          cancellationEvents.push({
            eventId,
            inventoryRequest: { ...inventoryRequest, status: 'Dibatalkan' },
            ownerUserId: owner,
            note: cancellationReason || inventoryRequest.catatan,
            actorName: request.user.name,
            users: Array.isArray(currentState.users) ? currentState.users : []
          });
        }
        return {
          status: 200,
          body: {
            success: true,
            revision: revision + 1,
            requestNumbers: requestNumberAssignments.assignedNumbers,
            requests: state.requests
          }
        };
      });
      transactionMs = Date.now() - transactionStartedAt;
      if (outcome.status !== 200) return response.status(outcome.status).json(outcome.body);
      const n8nEvents = n8nIntegration.enabled
        ? buildRequestEvents({
            previousRequests: currentState.requests,
            nextRequests: state.requests,
            previousAuditLogs: currentState.auditLogs,
            nextAuditLogs: state.auditLogs,
            revision: revision + 1
          })
        : [];
      Object.assign(collectionCache, state);
      response.json(outcome.body);
      whatsapp.onStateSaved(currentState, state, request.user.id, revision + 1);
      if (n8nEvents.length) {
        void (async () => {
          for (const event of n8nEvents) {
            const result = await n8nIntegration.publish(event);
            if (!result.delivered) {
              console.error(`n8n event delivery failed (${result.reason}) for ${event.eventId}.`);
            }
          }
        })().catch(() => {
          console.error('n8n event delivery loop failed.');
        });
      }
      for (const event of cancellationEvents) {
        const sendCancellation = whatsappProvider === 'fonnte'
          ? async () => {
              const notification = buildFonnteRequestNotification(
                event.inventoryRequest,
                'cancelled',
                event.note,
                event.actorName,
                currentMakassarDate()
              );
              const result = await measureExternalService(whatsappProvider, () => whatsapp.notifyRequestEvent({
                eventKey: `request:${event.inventoryRequest.id}:Dibatalkan:cancelled`,
                ownerUserId: event.ownerUserId,
                status: 'Dibatalkan',
                action: 'cancelled',
                ...notification
              }));
              await execute(db, 'UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?', [result.success ? 'sent' : 'failed', event.eventId]);
              if (!result.success) throw new Error(result.error || 'Pengiriman notifikasi pembatalan gagal.');
            }
          : () => measureExternalService(whatsappProvider,
            () => sendTwilioRequestEvent({ ...event, eventType: 'cancelled', note: event.note }));
        void sendCancellation()
          .catch(async error => {
            await execute(db, 'UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?', ['failed', event.eventId]);
            const message = error instanceof Error ? error.message : 'Pengiriman notifikasi pembatalan gagal.';
            console.error(`${whatsappProvider} WhatsApp cancellation processing failed:`, message.slice(0, 250));
          });
      }
    } catch (error) {
      console.error('Failed to save shared application state:', error);
      response.status(500).json({ error: 'Perubahan data gagal disimpan. Periksa status data di server sebelum mencoba lagi.' });
    } finally {
      if (!transactionMs && transactionStartedAt) transactionMs = Date.now() - transactionStartedAt;
      const legacyWriteCount = legacyCollectionsWritten == null ? 'n/a' : legacyCollectionsWritten;
      console.info(`[performance] state_write backend=${dataBackend} status=${response.statusCode} transaction_ms=${transactionMs} snapshot_read_ms=${stateReadMs} persistence_ms=${persistenceMs} account_profile_sync_ms=${accountProfileSyncMs} legacy_collections_written=${legacyWriteCount} request_bytes=${Number(request.get('content-length') || 0)}`);
    }
  }));
}
