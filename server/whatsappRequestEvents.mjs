// Helper notifikasi permohonan untuk provider Twilio (dan penelepon umum).
import crypto from 'node:crypto';
import { execute, queryOne } from './db.mjs';
import { sendTwilioWhatsAppMessage } from '../twilioWhatsAppService.mjs';

export function normalizeWhatsAppNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

export function maskWhatsAppNumber(value) {
  const digits = normalizeWhatsAppNumber(value);
  return digits.length > 4 ? `***${digits.slice(-4)}` : '[invalid]';
}

export function buildTwilioRequestMessage(inventoryRequest, eventType, note) {
  const items = Array.isArray(inventoryRequest.items) && inventoryRequest.items.length
    ? inventoryRequest.items
    : [{
        namaBarang: inventoryRequest.namaBarang,
        jumlahDiminta: inventoryRequest.jumlahDiminta,
        jumlahDisetujui: inventoryRequest.jumlahDisetujui,
        satuan: inventoryRequest.satuan
      }];
  const itemLines = items.slice(0, 10).map(item => {
    const quantity = eventType === 'approved'
      ? item.jumlahDisetujui || inventoryRequest.jumlahDisetujui || item.jumlahDiminta
      : item.jumlahDiminta;
    return `- ${item.namaBarang}: ${quantity} ${item.satuan}`;
  });
  if (items.length > itemLines.length) itemLines.push(`- dan ${items.length - itemLines.length} jenis barang lainnya`);
  const fields = [
    `Nomor Permohonan: ${inventoryRequest.nomorPermintaan}`,
    `Nama Pemohon: ${inventoryRequest.pemohonNama}`,
    `Tanggal: ${inventoryRequest.tanggal}`,
    `Daftar Barang (${items.length} jenis):`,
    ...itemLines,
    `Status: ${eventType === 'cancelled' ? 'Dibatalkan' : inventoryRequest.status}`,
    `Keterangan: ${String(note || inventoryRequest.catatan || inventoryRequest.keperluan || '-')}`
  ];
  const heading = eventType === 'approved'
    ? '✅ PERMOHONAN BARANG DISETUJUI'
    : eventType === 'cancelled'
      ? '❌ PERMOHONAN BARANG DIBATALKAN'
      : '📥 PERMOHONAN BARANG BARU';
  const closing = eventType === 'approved'
    ? 'Permohonan Barang tersebut telah disetujui. Informasi ini dikirim kepada Administrator.'
    : eventType === 'cancelled'
      ? 'Permohonan Barang tersebut telah dibatalkan. Informasi ini dikirim kepada Administrator.'
      : 'Permohonan Barang baru telah diterima oleh Sistem BMN. Mohon Administrator melakukan pemeriksaan melalui sistem.';
  return [heading, '', ...fields, '', closing].join('\n');
}

export function createTwilioRequestNotification({ db }) {
  async function sendTwilioRequestEvent({ eventId, inventoryRequest, eventType, users, note }) {
    const failures = [];
    const adminUsers = users.filter(user => user.role === 'Administrator');
    if (adminUsers.length === 0) {
      failures.push('Pengguna dengan role Administrator tidak ditemukan pada data pengguna backend.');
    }
    const recipients = new Map();
    for (const admin of adminUsers) {
      const phone = normalizeWhatsAppNumber(admin.phone);
      if (!phone || !/^[1-9]\d{7,14}$/.test(phone)) {
        failures.push(`Nomor WhatsApp Administrator ${admin.id} belum tersedia atau tidak valid.`);
        continue;
      }
      recipients.set(phone, true);
    }
    if (recipients.size === 0 && failures.length === 0) failures.push('Tidak ada nomor WhatsApp Administrator yang valid.');

    const recordFailure = async (key, error) => {
      const recipientHash = crypto.createHash('sha256').update(`${eventId}:${key}`).digest('hex');
      const safeError = error.slice(0, 500);
      await execute(db, `
        INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status, error)
        VALUES (?, ?, 'failed', ?)
        ON DUPLICATE KEY UPDATE status = 'failed', error = VALUES(error)
      `, [eventId, recipientHash, safeError]);
      console.error('Twilio WhatsApp notification failed:', safeError);
    };

    for (const [index, failure] of failures.entries()) await recordFailure(`missing-${index}`, failure);
    for (const phone of recipients.keys()) {
      const recipientHash = crypto.createHash('sha256').update(phone).digest('hex');
      try {
        const result = await sendTwilioWhatsAppMessage({
          phone,
          message: buildTwilioRequestMessage(inventoryRequest, eventType, note)
        });
        await execute(db, `
          INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status)
          VALUES (?, ?, 'sent')
          ON DUPLICATE KEY UPDATE status = 'sent', error = NULL
        `, [eventId, recipientHash]);
        console.info('Twilio WhatsApp message accepted:', JSON.stringify({
          event: eventType,
          requestNumber: inventoryRequest.nomorPermintaan,
          recipient: maskWhatsAppNumber(phone),
          status: result.providerStatus,
          messageSid: result.messageSid
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Pengiriman WhatsApp gagal.';
        failures.push(message);
        await execute(db, `
          INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status, error)
          VALUES (?, ?, 'failed', ?)
          ON DUPLICATE KEY UPDATE status = 'failed', error = VALUES(error)
        `, [eventId, recipientHash, message.slice(0, 500)]);
        console.error('Twilio WhatsApp message failed:', JSON.stringify({
          event: eventType,
          requestNumber: inventoryRequest.nomorPermintaan,
          recipient: maskWhatsAppNumber(phone),
          error: message.slice(0, 250)
        }));
      }
    }

    const count = await queryOne(db, "SELECT COUNT(*) AS count FROM whatsapp_notification_recipients WHERE event_id = ? AND status = 'sent'", [eventId]);
    const sentCount = Number(count.count);
    const finalStatus = failures.length === 0 && sentCount === recipients.size ? 'sent' : 'failed';
    await execute(db, 'UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?', [finalStatus, eventId]);
    return {
      success: finalStatus === 'sent',
      sentCount,
      error: failures.length ? failures.join(' ') : undefined
    };
  }

  return { sendTwilioRequestEvent };
}
