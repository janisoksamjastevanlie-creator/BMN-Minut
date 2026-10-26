// Rute peristiwa notifikasi permohonan WhatsApp dari sisi aplikasi:
// idempotensi event, pemilihan penerima, dan pengiriman ke provider terpilih.
import crypto from 'node:crypto';
import { sendWhatsAppMessage } from '../../whatsappService.mjs';
import { sendTwilioWhatsAppMessage } from '../../twilioWhatsAppService.mjs';
import { buildFonnteRequestNotification } from '../../whatsapp/request-notification.mjs';
import { dispatchNotificationDelivery } from '../../whatsapp/notification-delivery.mjs';
import { measureExternalService } from '../serviceMetrics.mjs';
import { currentMakassarDate } from '../datetime.mjs';

export function registerWhatsAppEventRoutes(app, context) {
  const {
    db,
    queryOne,
    execute,
    withTransaction,
    asyncRoute,
    performanceTiming,
    requireUser,
    getCollection,
    userHasPermission,
    whatsappProvider,
    whatsappPhoneNumberId,
    whatsappAccessToken,
    whatsappRecipientNumber,
    whatsapp,
    sendTwilioRequestEvent
  } = context;

  app.post('/api/whatsapp/request-events', performanceTiming('POST /api/whatsapp/request-events'), requireUser, asyncRoute(async (request, response) => {
    const { eventId, requestId, status, action, note, deferDelivery } = request.body || {};
    const allowedStatuses = ['Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Menunggu Konfirmasi', 'Selesai', 'Ditolak'];
    if (typeof eventId !== 'string' || !/^[\da-f-]{36}$/i.test(eventId) ||
        typeof requestId !== 'string' || requestId.length > 100 ||
        !allowedStatuses.includes(status) ||
        !['submitted', 'status_changed'].includes(action) ||
        (note !== undefined && typeof note !== 'string') ||
        (deferDelivery !== undefined && typeof deferDelivery !== 'boolean')) {
      return response.status(400).json({ success: false, error: 'Data notifikasi permohonan tidak valid.' });
    }
    if (whatsappProvider === 'fonnte') {
      const authorized = action === 'submitted'
        ? userHasPermission(request.user, 'requestSupplies')
        : userHasPermission(request.user, 'approveRequests') || userHasPermission(request.user, 'manageInventory');
      if (!authorized) return response.status(403).json({ success: false, error: 'Tidak memiliki izin mengirim notifikasi permohonan.' });
    }

    const notificationEventId = eventId;
    const onDeliveryFailure = async () => {
      console.error(`WhatsApp request notification failed: provider=${whatsappProvider} event=${notificationEventId}`);
      await execute(db, 'UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?', ['failed', notificationEventId]);
    };
    const existingEvent = await queryOne(db, 'SELECT event_id, request_id, request_status, action, status FROM whatsapp_notification_events WHERE event_id = ?', [eventId]);
    if (existingEvent) {
      if (existingEvent.request_id !== requestId || existingEvent.request_status !== status || existingEvent.action !== action) {
        return response.status(409).json({ success: false, error: 'ID notifikasi sudah digunakan untuk tindakan yang berbeda.' });
      }
      return response.json({
        success: existingEvent.status === 'sent',
        duplicate: true,
        error: existingEvent.status === 'sent'
          ? undefined
          : existingEvent.status === 'failed'
            ? 'Notifikasi WhatsApp untuk tindakan ini sudah pernah dicoba dan tidak dikirim ulang otomatis.'
            : 'Notifikasi WhatsApp untuk tindakan ini sedang diproses.'
      });
    }

    const existingRequestEvent = await queryOne(db, `
      SELECT event_id, status FROM whatsapp_notification_events
      WHERE request_id = ? AND request_status = ? AND action = ?
      LIMIT 1
    `, [requestId, status, action]);
    if (existingRequestEvent) {
      return response.json({
        success: existingRequestEvent.status === 'sent',
        duplicate: true,
        error: existingRequestEvent.status === 'sent'
          ? undefined
          : existingRequestEvent.status === 'failed'
            ? 'Notifikasi WhatsApp untuk permohonan dan status ini sudah pernah dicoba dan tidak dikirim ulang otomatis.'
            : 'Notifikasi WhatsApp untuk permohonan dan status ini sedang diproses.'
      });
    }

    const requests = getCollection('requests') || [];
    const inventoryRequest = requests.find(item => item.id === requestId);
    if (!inventoryRequest || inventoryRequest.status !== status) {
      return response.status(409).json({ success: false, error: 'Permohonan belum tersimpan dengan status terbaru; notifikasi tidak dikirim.' });
    }
    if ((action === 'submitted' && status !== 'Diajukan') || (action === 'status_changed' && status === 'Diajukan')) {
      return response.status(400).json({ success: false, error: 'Tindakan tidak sesuai dengan status permohonan.' });
    }

    if (whatsappProvider === 'twilio' || whatsappProvider === 'fonnte') {
      if (action === 'status_changed' && status !== 'Disetujui') {
        if (whatsappProvider === 'twilio') return response.json({ success: true, skipped: true });
      }

      const duplicateEvent = await withTransaction(async connection => {
        const duplicate = await queryOne(connection, `
          SELECT status FROM whatsapp_notification_events
          WHERE request_id = ? AND request_status = ? AND action = ?
          LIMIT 1 FOR UPDATE
        `, [requestId, status, action]);
        if (duplicate) return duplicate;
        await execute(connection, `
          INSERT INTO whatsapp_notification_events (event_id, request_id, request_status, action, status)
          VALUES (?, ?, ?, ?, 'sending')
        `, [notificationEventId, requestId, status, action]);
        if (action === 'submitted') {
          await execute(connection, 'INSERT IGNORE INTO whatsapp_request_owners (request_id, user_id) VALUES (?, ?)', [requestId, request.user.id]);
        }
        return null;
      }).catch(async error => {
        if (error.code !== 'ER_DUP_ENTRY') throw error;
        return queryOne(db, `
          SELECT status FROM whatsapp_notification_events
          WHERE request_id = ? AND request_status = ? AND action = ?
          LIMIT 1
        `, [requestId, status, action]);
      });
      if (duplicateEvent) {
        return response.json({
          success: duplicateEvent.status === 'sent',
          duplicate: true,
          error: duplicateEvent.status === 'sent'
            ? undefined
            : 'Notifikasi WhatsApp untuk permohonan dan status ini sudah pernah dicoba dan tidak dikirim ulang.'
        });
      }

      return dispatchNotificationDelivery({
        response,
        deferred: deferDelivery === true,
        onFailure: onDeliveryFailure,
        deliver: async () => {
          let result;
          if (whatsappProvider === 'fonnte') {
            const owner = action === 'submitted'
              ? request.user.id
              : (await queryOne(db, 'SELECT user_id FROM whatsapp_request_owners WHERE request_id = ?', [requestId]))?.user_id
                || (getCollection('users') || []).find(user =>
                  String(user.name || '').trim().toLocaleLowerCase('id-ID') ===
                  String(inventoryRequest.pemohonNama || '').trim().toLocaleLowerCase('id-ID')
                )?.id;
            const notification = buildFonnteRequestNotification(
              inventoryRequest,
              action,
              note,
              request.user.name,
              currentMakassarDate()
            );
            result = await measureExternalService(whatsappProvider, () => whatsapp.notifyRequestEvent({
              eventKey: `request:${requestId}:${status}:${action}`,
              ownerUserId: owner,
              status,
              action,
              ...notification
            }));
            await execute(db, 'UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?', [result.success ? 'sent' : 'failed', notificationEventId]);
          } else {
            result = await measureExternalService(whatsappProvider, () => sendTwilioRequestEvent({
              eventId: notificationEventId,
              inventoryRequest,
              eventType: action === 'submitted' ? 'submitted' : 'approved',
              users: getCollection('users') || [],
              note
            }));
          }
          return {
            success: Boolean(result.success),
            sentCount: result.sentCount,
            failedCount: result.failedCount,
            ...(result.success
              ? { warning: result.error }
              : { error: result.error || 'Permohonan berhasil disimpan, tetapi WhatsApp service temporarily unavailable.' })
          };
        }
      });
    }

    const recipients = new Map();
    if (whatsappRecipientNumber) {
      recipients.set(whatsappRecipientNumber, true);
    } else {
      const users = getCollection('users') || [];
      const previousOwner = await queryOne(db, 'SELECT user_id FROM whatsapp_request_owners WHERE request_id = ?', [requestId]);
      const requester = previousOwner
        ? users.find(user => user.id === previousOwner.user_id)
        : users.find(user => String(user.name || '').trim().toLocaleLowerCase('id-ID') === String(inventoryRequest.pemohonNama || '').trim().toLocaleLowerCase('id-ID'));

      const nextRoles = status === 'Diajukan' || status === 'Disetujui'
        ? ['Operator']
        : status === 'Diverifikasi'
          ? ['Pimpinan']
          : [];
      if (action === 'status_changed' && requester?.statusAktif !== false && requester?.phone) {
        recipients.set(String(requester.phone).replace(/\D/g, ''), requester);
      }
      for (const user of users) {
        if (user.statusAktif === false || user.id === request.user.id || !nextRoles.includes(user.role) || !user.phone) continue;
        const phone = String(user.phone).replace(/\D/g, '');
        if (phone) recipients.set(phone, user);
      }
      recipients.delete('');
    }

    const actionLabel = action === 'submitted'
      ? 'Pengajuan permohonan'
      : status === 'Diverifikasi'
        ? 'Diperiksa dan diteruskan untuk persetujuan'
        : status === 'Disetujui'
          ? 'Disetujui dan diteruskan ke petugas gudang'
          : status === 'Diproses'
            ? 'Permohonan diterima dan sedang diproses'
            : status === 'Selesai'
              ? 'Barang diserahkan; permohonan selesai'
              : status === 'Ditolak'
                ? 'Permohonan ditolak'
                : `Status permohonan berubah menjadi ${status}`;
    const requestItems = Array.isArray(inventoryRequest.items) && inventoryRequest.items.length
      ? inventoryRequest.items
      : [{
          namaBarang: inventoryRequest.namaBarang,
          jumlahDiminta: inventoryRequest.jumlahDiminta,
          jumlahDisetujui: inventoryRequest.jumlahDisetujui,
          satuan: inventoryRequest.satuan
        }];
    const itemLines = requestItems.slice(0, 10).map(item => {
      const quantity = status === 'Disetujui'
        ? item.jumlahDisetujui || inventoryRequest.jumlahDisetujui || item.jumlahDiminta
        : item.jumlahDiminta;
      return `- ${item.namaBarang}: ${quantity} ${item.satuan}`;
    });
    if (requestItems.length > itemLines.length) itemLines.push(`- dan ${requestItems.length - itemLines.length} jenis barang lainnya`);
    const message = [
      ...(whatsappRecipientNumber
        ? ['TEST WHATSAPP — PERMOHONAN BARANG', 'Ini adalah pesan pengujian end-to-end.', '']
        : []),
      '📦 *PERMOHONAN BARANG BARU*',
      '',
      `Nomor Permohonan: ${inventoryRequest.nomorPermintaan}`,
      `Nama Pemohon: ${inventoryRequest.pemohonNama}`,
      `Tanggal: ${inventoryRequest.tanggal}`,
      `Daftar Barang (${requestItems.length} jenis):`,
      ...itemLines,
      `Status: ${status}`,
      '',
      'Permohonan telah berhasil diterima oleh sistem.',
      ...(action === 'status_changed' ? ['', `Tindakan: ${actionLabel}`, `Catatan: ${String(note || inventoryRequest.catatan || '-')}`] : [])
    ].join('\n');

    let duplicateEvent;
    try {
      duplicateEvent = await withTransaction(async connection => {
        const duplicate = await queryOne(connection, `
          SELECT status FROM whatsapp_notification_events
          WHERE request_id = ? AND request_status = ? AND action = ?
          LIMIT 1 FOR UPDATE
        `, [requestId, status, action]);
        if (duplicate) return duplicate;
        await execute(connection, `
          INSERT INTO whatsapp_notification_events (event_id, request_id, request_status, action, status)
          VALUES (?, ?, ?, ?, 'sending')
        `, [eventId, requestId, status, action]);
        if (action === 'submitted') {
          await execute(connection, 'INSERT IGNORE INTO whatsapp_request_owners (request_id, user_id) VALUES (?, ?)', [requestId, request.user.id]);
        }
        return null;
      });
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      const sameId = await queryOne(db, `
        SELECT request_id, request_status, action, status
        FROM whatsapp_notification_events WHERE event_id = ?
      `, [eventId]);
      if (sameId && (sameId.request_id !== requestId || sameId.request_status !== status || sameId.action !== action)) {
        return response.status(409).json({ success: false, error: 'ID notifikasi sudah digunakan untuk tindakan yang berbeda.' });
      }
      duplicateEvent = await queryOne(db, `
        SELECT status FROM whatsapp_notification_events
        WHERE request_id = ? AND request_status = ? AND action = ?
        LIMIT 1
      `, [requestId, status, action]);
    }
    if (duplicateEvent) {
      return response.json({
        success: duplicateEvent.status === 'sent',
        duplicate: true,
        error: duplicateEvent.status === 'sent'
          ? undefined
          : 'Notifikasi WhatsApp untuk permohonan dan status ini sudah pernah dicoba dan tidak dikirim ulang.'
      });
    }

    return dispatchNotificationDelivery({
      response,
      deferred: deferDelivery === true,
      onFailure: onDeliveryFailure,
      deliver: async () => {
        const failures = [];
        const providerConfigured = Boolean(whatsappPhoneNumberId && whatsappAccessToken);
        if (!providerConfigured) {
          failures.push('Konfigurasi WHATSAPP_PHONE_NUMBER_ID atau WHATSAPP_ACCESS_TOKEN belum diatur di server.');
        } else if (recipients.size === 0) {
          failures.push('Konfigurasi WHATSAPP_RECIPIENT_NUMBER belum diatur di server.');
        } else {
          for (const [phone] of recipients) {
            const recipientHash = crypto.createHash('sha256').update(phone).digest('hex');
            try {
              const sendMessage = whatsappProvider === 'twilio' ? sendTwilioWhatsAppMessage : sendWhatsAppMessage;
              await measureExternalService(whatsappProvider, () => sendMessage({ phone, message }));
              await execute(db, `
                INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status)
                VALUES (?, ?, 'sent')
              `, [eventId, recipientHash]);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Pengiriman WhatsApp gagal.';
              failures.push(message);
              console.error(`${whatsappProvider} WhatsApp notification failed:`, message);
              await execute(db, `
                INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status, error)
                VALUES (?, ?, 'failed', ?)
              `, [eventId, recipientHash, message.slice(0, 500)]);
            }
          }
        }

        const countRow = await queryOne(db, "SELECT COUNT(*) AS count FROM whatsapp_notification_recipients WHERE event_id = ? AND status = 'sent'", [eventId]);
        const sentCount = Number(countRow.count);
        const finalStatus = failures.length === 0 && sentCount > 0 ? 'sent' : 'failed';
        await execute(db, 'UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?', [finalStatus, eventId]);
        if (finalStatus === 'sent') return { success: true, sentCount };
        return {
          success: false,
          sentCount,
          error: 'Permohonan berhasil diproses, tetapi WhatsApp service temporarily unavailable.'
        };
      }
    });
  }));
}
