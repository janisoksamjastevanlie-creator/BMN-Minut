import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import dotenv from 'dotenv';
import express from 'express';
import { sendWhatsAppMessage } from './whatsappService.mjs';
import { sendTwilioWhatsAppMessage } from './twilioWhatsAppService.mjs';
import { createWhatsAppService } from './whatsapp/service.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '.env') });
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST?.trim() || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const dataDirectory = path.resolve(root, process.env.DATA_DIRECTORY || 'data');
const databasePath = path.join(dataDirectory, 'siman.sqlite');
const adminNip = process.env.ADMIN_NIP?.trim();
const adminPassword = process.env.ADMIN_PASSWORD;
const whatsappProvider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() || 'meta';
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const whatsappRecipientNumber = process.env.WHATSAPP_RECIPIENT_NUMBER?.trim().replace(/\D/g, '');

if (!['meta', 'twilio', 'fonnte'].includes(whatsappProvider)) {
  throw new Error('WHATSAPP_PROVIDER harus bernilai meta, twilio, atau fonnte.');
}
if (!adminNip || !adminPassword || adminPassword.length < 12) {
  throw new Error('Set ADMIN_NIP and an ADMIN_PASSWORD of at least 12 characters in .env before starting the server.');
}
if (adminPassword.startsWith('REPLACE_WITH_')) {
  throw new Error('Replace the example ADMIN_PASSWORD in .env with a private password before starting the server.');
}

fs.mkdirSync(dataDirectory, { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    nip TEXT NOT NULL UNIQUE,
    profile_json TEXT NOT NULL,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_data (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS whatsapp_notification_events (
    event_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    request_status TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS whatsapp_notification_recipients (
    event_id TEXT NOT NULL REFERENCES whatsapp_notification_events(event_id) ON DELETE CASCADE,
    recipient_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    PRIMARY KEY (event_id, recipient_hash)
  );
  CREATE TABLE IF NOT EXISTS whatsapp_request_owners (
    request_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL
  );
`);

const adminProfile = {
  id: 'usr-4',
  name: 'Administrator TI BPS Minut',
  nip: adminNip,
  email: 'admin.minut@bps.go.id',
  role: 'Administrator',
  unitKerja: 'Fungsi IPDS (Integrasi Pengolahan & Diseminasi Statistik)',
  statusAktif: true
};
const adminSalt = crypto.randomBytes(16);
const adminHash = crypto.scryptSync(adminPassword, adminSalt, 64);
db.prepare(`
  INSERT OR IGNORE INTO auth_users (id, nip, profile_json, salt, password_hash)
  VALUES (?, ?, ?, ?, ?)
`).run(adminProfile.id, adminNip, JSON.stringify(adminProfile), adminSalt.toString('hex'), adminHash.toString('hex'));
db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());

const permissionsByCollection = {
  rooms: ['manageAssets', 'systemSettings'],
  assets: ['manageAssets'],
  inventoryItems: ['manageInventory'],
  stockInList: ['manageInventory'],
  stockOutList: ['manageInventory'],
  requests: ['requestSupplies', 'approveRequests'],
  opnames: ['stockOpname'],
  movements: ['manageMovements'],
  maintenances: ['manageMaintenance'],
  disposals: ['manageDisposal'],
  documents: ['manageAssets', 'manageInventory', 'systemSettings'],
  users: null,
  roles: null,
  auditLogs: ['systemSettings'],
  notifications: null
};
const collections = Object.keys(permissionsByCollection);
const loginAttempts = new Map();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') || [];
  const cookie = cookies.map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function sameOrigin(request, response, next) {
  const origin = request.get('origin');
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      return response.status(403).json({ error: 'Origin permintaan tidak valid.' });
    }
    const forwardedHost = request.get('x-forwarded-host')?.split(',')[0].trim();
    const allowedHosts = [request.get('host'), forwardedHost].filter(Boolean);
    if (!allowedHosts.includes(originHost)) {
      return response.status(403).json({ error: 'Permintaan lintas situs ditolak.' });
    }
  }
  next();
}

function requireUser(request, response, next) {
  const token = readCookie(request, 'siman_session');
  if (!token) return response.status(401).json({ error: 'Silakan masuk kembali.' });
  const session = db.prepare(`
    SELECT s.user_id, u.profile_json
    FROM sessions s JOIN auth_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashToken(token), Date.now());
  if (!session) return response.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' });
  const profile = JSON.parse(session.profile_json);
  const users = getCollection('users');
  const currentProfile = users?.find(user => user.id === session.user_id);
  if (users && !currentProfile) {
    return response.status(403).json({ error: 'Akun tidak lagi terdaftar di sistem.' });
  }
  if (currentProfile?.statusAktif === false || profile.statusAktif === false) {
    return response.status(403).json({ error: 'Akun dinonaktifkan.' });
  }
  request.user = currentProfile ? { ...profile, ...currentProfile } : profile;
  request.user.id = session.user_id;
  next();
}

function getCollection(key) {
  const row = db.prepare('SELECT value_json FROM app_data WHERE key = ?').get(key);
  return row ? JSON.parse(row.value_json) : null;
}

function normalizeWhatsAppNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

function maskWhatsAppNumber(value) {
  const digits = normalizeWhatsAppNumber(value);
  return digits.length > 4 ? `***${digits.slice(-4)}` : '[invalid]';
}

function buildTwilioRequestMessage(inventoryRequest, eventType, note) {
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

function buildFonnteRequestNotification(inventoryRequest, action) {
  const items = Array.isArray(inventoryRequest.items) && inventoryRequest.items.length
    ? inventoryRequest.items
    : [{
        namaBarang: inventoryRequest.namaBarang,
        jumlahDiminta: inventoryRequest.jumlahDiminta,
        jumlahDisetujui: inventoryRequest.jumlahDisetujui,
        satuan: inventoryRequest.satuan
      }];
  const itemLines = items.slice(0, 8).map(item => {
    const quantity = inventoryRequest.status === 'Disetujui'
      ? item.jumlahDisetujui || inventoryRequest.jumlahDisetujui || item.jumlahDiminta
      : item.jumlahDiminta;
    return `- ${String(item.namaBarang || '-').slice(0, 80)}: ${quantity ?? '-'} ${String(item.satuan || '').slice(0, 20)}`;
  });
  if (items.length > itemLines.length) itemLines.push(`- dan ${items.length - itemLines.length} jenis barang lainnya`);
  const title = action === 'submitted'
    ? 'Permohonan barang baru'
    : `Status permohonan barang: ${inventoryRequest.status}`;
  return {
    title,
    lines: [
      `Nomor Permohonan: ${String(inventoryRequest.nomorPermintaan || '-').slice(0, 100)}`,
      `Tanggal: ${String(inventoryRequest.tanggal || '-').slice(0, 40)}`,
      `Pemohon: ${String(inventoryRequest.pemohonNama || '-').slice(0, 100)}`,
      `Daftar Barang (${items.length} jenis):`,
      ...itemLines,
      `Status: ${String(inventoryRequest.status || '-').slice(0, 50)}`
    ]
  };
}

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

  const recordFailure = (key, error) => {
    const recipientHash = crypto.createHash('sha256').update(`${eventId}:${key}`).digest('hex');
    const safeError = error.slice(0, 500);
    db.prepare(`
      INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status, error)
      VALUES (?, ?, 'failed', ?)
      ON CONFLICT(event_id, recipient_hash) DO UPDATE SET status = 'failed', error = excluded.error
    `).run(eventId, recipientHash, safeError);
    console.error('Twilio WhatsApp notification failed:', safeError);
  };

  failures.forEach((failure, index) => recordFailure(`missing-${index}`, failure));
  for (const phone of recipients.keys()) {
    const recipientHash = crypto.createHash('sha256').update(phone).digest('hex');
    try {
      const result = await sendTwilioWhatsAppMessage({
        phone,
        message: buildTwilioRequestMessage(inventoryRequest, eventType, note)
      });
      db.prepare(`
        INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status)
        VALUES (?, ?, 'sent')
        ON CONFLICT(event_id, recipient_hash) DO UPDATE SET status = 'sent', error = NULL
      `).run(eventId, recipientHash);
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
      db.prepare(`
        INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status, error)
        VALUES (?, ?, 'failed', ?)
        ON CONFLICT(event_id, recipient_hash) DO UPDATE SET status = 'failed', error = excluded.error
      `).run(eventId, recipientHash, message.slice(0, 500));
      console.error('Twilio WhatsApp message failed:', JSON.stringify({
        event: eventType,
        requestNumber: inventoryRequest.nomorPermintaan,
        recipient: maskWhatsAppNumber(phone),
        error: message.slice(0, 250)
      }));
    }
  }

  const sentCount = db.prepare("SELECT COUNT(*) AS count FROM whatsapp_notification_recipients WHERE event_id = ? AND status = 'sent'").get(eventId).count;
  const finalStatus = failures.length === 0 && sentCount === recipients.size ? 'sent' : 'failed';
  db.prepare('UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?').run(finalStatus, eventId);
  return {
    success: finalStatus === 'sent',
    sentCount,
    error: failures.length ? failures.join(' ') : undefined
  };
}

function userHasPermission(user, permission) {
  if (user.role === 'Administrator') return true;
  const roles = getCollection('roles') || [];
  const role = roles.find(item => item.name?.toLowerCase() === String(user.role).toLowerCase());
  return Boolean(role?.permissions?.[permission]);
}

function authorizeChangedCollections(user, state) {
  const current = Object.fromEntries(
    collections.map(key => [key, getCollection(key)])
  );
  if (!Object.values(current).some(value => value !== null)) return user.role === 'Administrator';
  const changed = collections.filter(key => JSON.stringify(current[key]) !== JSON.stringify(state[key]));
  for (const key of changed) {
    if (key === 'notifications' || user.role === 'Administrator') continue;
    if (key === 'roles') return false;
    if (key === 'users') {
      if (!userHasPermission(user, 'manageUsers')) return false;
      const previousUsers = current.users || [];
      const nextUsers = state.users || [];
      const previousAdminIds = previousUsers.filter(item => item.role === 'Administrator').map(item => item.id);
      if (previousAdminIds.some(id => !nextUsers.some(item => item.id === id && item.role === 'Administrator'))) return false;
      for (const item of nextUsers) {
        const previous = previousUsers.find(existing => existing.id === item.id);
        if ((!previous && item.role === 'Administrator') || (previous && previous.role !== item.role)) return false;
        if (previous?.role === 'Administrator' && JSON.stringify(previous) !== JSON.stringify(item)) return false;
      }
      continue;
    }
    if (key === 'auditLogs') {
      const previousLogs = current.auditLogs || [];
      const nextLogs = state.auditLogs || [];
      if (!userHasPermission(user, 'systemSettings') &&
          previousLogs.some(log => JSON.stringify(nextLogs.find(item => item.id === log.id)) !== JSON.stringify(log))) {
        return false;
      }
      continue;
    }
    const permissions = permissionsByCollection[key];
    if (permissions === null) continue;
    if (!permissions?.some(permission => userHasPermission(user, permission))) return false;
  }
  return true;
}

function validateRoomAssetRelations(state) {
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

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateInventoryRequests(previousState, nextState) {
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
    if (!itemRowsChanged) continue;

    if (itemRows.length > 100) return `Permohonan ${number} melebihi batas 100 jenis barang.`;
    if (!isValidCalendarDate(request?.tanggal) ||
        !String(request?.pemohonNama || '').trim() ||
        !String(request?.unitKerja || '').trim() ||
        !String(request?.ruangan || '').trim() ||
        !String(request?.keperluan || '').trim() ||
        !['Rendah', 'Normal', 'Tinggi', 'Mendesak'].includes(request?.prioritas) ||
        !['Draft', 'Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Selesai', 'Ditolak'].includes(request?.status)) {
      return `Data induk permohonan ${number} tidak lengkap atau tidak valid.`;
    }
    if (!previous && previousState.requests !== null && request.status !== 'Diajukan') {
      return `Permohonan baru ${number} harus dimulai dengan status Diajukan.`;
    }

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
    }

    if (request.itemId !== itemRows[0].itemId ||
        request.namaBarang !== itemRows[0].namaBarang ||
        request.jumlahDiminta !== itemRows[0].jumlahDiminta ||
        request.satuan !== itemRows[0].satuan) {
      return `Ringkasan barang pada permohonan ${number} tidak sesuai dengan detail pertama.`;
    }
  }
  return null;
}

function validateStockInWorkflow(previousState, nextState) {
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
    } else if (old && isPosted(old)) {
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
    if (!item) return 'Transaksi Barang Masuk terverifikasi tidak dapat dihapus karena master barang terkait tidak ditemukan.';
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

function syncAccountProfiles(users) {
  const update = db.prepare('UPDATE auth_users SET nip = ?, profile_json = ? WHERE id = ?');
  for (const user of users) {
    update.run(String(user.nip).trim(), JSON.stringify(user), user.id);
  }
}

const whatsapp = createWhatsAppService({ db, getCollection, userHasPermission, requireUser });
whatsapp.start();

const app = express();
app.disable('x-powered-by');
// Webhook harus dipasang sebelum express.json agar body mentah tersedia untuk verifikasi signature.
app.use(whatsapp.webhook);
app.use(express.json({ limit: '25mb' }));
app.use(sameOrigin);
app.use(whatsapp.api);

app.get('/api/health', (_request, response) => {
  const result = db.prepare('SELECT 1 AS ready').get();
  if (result?.ready !== 1) return response.status(503).json({ status: 'unavailable' });
  response.json({ status: 'ok' });
});

app.post('/api/auth/login', (request, response) => {
  const nip = String(request.body?.nip || '').trim();
  const password = String(request.body?.password || '');
  if (!nip || nip.length > 30 || password.length > 256) {
    return response.status(400).json({ error: 'NIP atau kata sandi tidak valid.' });
  }
  const address = `${request.ip}:${nip}`;
  const now = Date.now();
  if (loginAttempts.size > 10000) {
    for (const [key, value] of loginAttempts) {
      if (now - value.startedAt >= 15 * 60 * 1000) loginAttempts.delete(key);
    }
  }
  const attempt = loginAttempts.get(address);
  if (attempt && attempt.count >= 10 && now - attempt.startedAt < 15 * 60 * 1000) {
    return response.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
  }
  const account = db.prepare('SELECT * FROM auth_users WHERE nip = ?').get(nip);
  const salt = account ? Buffer.from(account.salt, 'hex') : Buffer.alloc(16);
  const expected = account ? Buffer.from(account.password_hash, 'hex') : Buffer.alloc(64);
  const actual = crypto.scryptSync(password, salt, 64);
  const valid = account && crypto.timingSafeEqual(actual, expected);
  if (!valid) {
    const current = attempt && now - attempt.startedAt < 15 * 60 * 1000
      ? attempt
      : { count: 0, startedAt: now };
    loginAttempts.set(address, { ...current, count: current.count + 1 });
    return response.status(401).json({ error: 'NIP atau kata sandi salah.' });
  }
  const profile = JSON.parse(account.profile_json);
  const registeredUsers = getCollection('users');
  if (registeredUsers && !registeredUsers.some(user => user.id === account.id)) {
    return response.status(403).json({ error: 'Akun tidak lagi terdaftar di sistem.' });
  }
  const currentUser = registeredUsers?.find(user => user.id === account.id);
  if (currentUser?.statusAktif === false) return response.status(403).json({ error: 'Akun dinonaktifkan.' });
  if (profile.statusAktif === false) return response.status(403).json({ error: 'Akun dinonaktifkan.' });
  loginAttempts.delete(address);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = now + 12 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), account.id, expiresAt);
  const secure = request.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
  response.setHeader('Set-Cookie', `siman_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? '; Secure' : ''}`);
  response.json({ user: profile });
});

app.get('/api/auth/me', requireUser, (request, response) => {
  response.json({ user: request.user });
});

app.post('/api/auth/logout', (request, response) => {
  const token = readCookie(request, 'siman_session');
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  const secure = request.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
  response.setHeader('Set-Cookie', `siman_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`);
  response.json({ success: true });
});

app.put('/api/auth/users/:id/password', requireUser, (request, response) => {
  if (!userHasPermission(request.user, 'manageUsers')) {
    return response.status(403).json({ error: 'Tidak memiliki izin mengelola akun.' });
  }
  const user = request.body?.user;
  const password = String(request.body?.password || '');
  if (!user || user.id !== request.params.id || !String(user.nip || '').trim()) {
    return response.status(400).json({ error: 'Profil pengguna tidak valid.' });
  }
  const existing = db.prepare('SELECT profile_json FROM auth_users WHERE id = ?').get(user.id);
  const canonical = (getCollection('users') || []).find(item => item.id === user.id);
  if (canonical && canonical.role !== user.role) {
    return response.status(403).json({ error: 'Role akun hanya dapat diubah melalui penyimpanan pengguna oleh administrator.' });
  }
  if (!canonical && existing) return response.status(404).json({ error: 'Pengguna tidak lagi terdaftar di sistem.' });
  if (request.user.role !== 'Administrator' &&
      (user.role === 'Administrator' || (existing && JSON.parse(existing.profile_json).role === 'Administrator'))) {
    return response.status(403).json({ error: 'Hanya administrator yang dapat mengelola akun administrator.' });
  }
  if (password.length < 12 || password.length > 256) return response.status(400).json({ error: 'Kata sandi harus antara 12 dan 256 karakter.' });
  const duplicateNip = db.prepare('SELECT id FROM auth_users WHERE nip = ? AND id != ?').get(String(user.nip).trim(), user.id);
  if (duplicateNip) return response.status(409).json({ error: 'NIP tersebut sudah digunakan oleh akun lain.' });
  const salt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync(password, salt, 64);
  const profile = { ...(canonical || user), nip: String(user.nip).trim() };
  db.prepare(`
    INSERT INTO auth_users (id, nip, profile_json, salt, password_hash)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nip = excluded.nip,
      profile_json = excluded.profile_json,
      salt = excluded.salt,
      password_hash = excluded.password_hash
  `).run(user.id, profile.nip, JSON.stringify(profile), salt.toString('hex'), passwordHash.toString('hex'));
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  response.json({ success: true });
});

app.get('/api/state', requireUser, (_request, response) => {
  const state = Object.fromEntries(collections.map(key => [key, getCollection(key)]));
  const revision = Number(db.prepare("SELECT value FROM app_meta WHERE key = 'revision'").get()?.value || 0);
  response.json({ state, initialized: state.users !== null, revision });
});

app.put('/api/state', requireUser, (request, response) => {
  const state = request.body?.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return response.status(400).json({ error: 'Format data tidak valid.' });
  }
  const revision = Number(db.prepare("SELECT value FROM app_meta WHERE key = 'revision'").get()?.value || 0);
  if (!Number.isInteger(request.body?.revision) || request.body.revision !== revision) {
    return response.status(409).json({ error: 'Data berubah di perangkat lain. Muat ulang halaman sebelum menyimpan lagi.', revision });
  }
  if (!authorizeChangedCollections(request.user, state)) {
    return response.status(403).json({ error: 'Role Anda tidak memiliki izin untuk menyimpan perubahan ini.' });
  }
  const relationError = validateRoomAssetRelations(state);
  if (relationError) return response.status(400).json({ error: relationError });
  const currentState = Object.fromEntries(collections.map(key => [key, getCollection(key)]));
  const requestError = validateInventoryRequests(currentState, state);
  if (requestError) return response.status(400).json({ error: requestError });
  const stockInError = validateStockInWorkflow(currentState, state);
  if (stockInError) return response.status(400).json({ error: stockInError });
  const previousRequests = Array.isArray(currentState.requests) ? currentState.requests : [];
  const nextRequestIds = new Set(Array.isArray(state.requests) ? state.requests.map(item => item.id) : []);
  const removedRequests = whatsappProvider === 'twilio'
    ? previousRequests.filter(item => !nextRequestIds.has(item.id))
    : [];
  const cancellationEvents = [];
  const save = db.prepare(`
    INSERT INTO app_data (key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `);
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const key of collections) {
      if (!Array.isArray(state[key])) throw new Error(`Koleksi ${key} tidak valid.`);
      save.run(key, JSON.stringify(state[key]));
    }
    syncAccountProfiles(state.users);
    db.prepare(`
      INSERT INTO app_meta (key, value) VALUES ('revision', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(revision + 1));
    for (const inventoryRequest of removedRequests) {
      const existingEvent = db.prepare(`
        SELECT event_id FROM whatsapp_notification_events
        WHERE request_id = ? AND request_status = 'Dibatalkan' AND action = 'cancelled'
      `).get(inventoryRequest.id);
      if (existingEvent) continue;
      const eventId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO whatsapp_notification_events (event_id, request_id, request_status, action, status)
        VALUES (?, ?, 'Dibatalkan', 'cancelled', 'sending')
      `).run(eventId, inventoryRequest.id);
      cancellationEvents.push({
        eventId,
        inventoryRequest: { ...inventoryRequest, status: 'Dibatalkan' },
        users: Array.isArray(currentState.users) ? currentState.users : []
      });
    }
    db.exec('COMMIT');
    response.json({ success: true, revision: revision + 1 });
    whatsapp.onStateSaved(currentState, state, request.user.id, revision + 1);
    for (const event of cancellationEvents) {
      void sendTwilioRequestEvent({ ...event, eventType: 'cancelled', note: event.inventoryRequest.catatan })
        .catch(error => {
          db.prepare('UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?').run('failed', event.eventId);
          const message = error instanceof Error ? error.message : 'Pengiriman notifikasi pembatalan gagal.';
          console.error('Twilio WhatsApp cancellation processing failed:', message.slice(0, 250));
        });
    }
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Failed to save shared application state:', error);
    response.status(400).json({ error: 'Perubahan data gagal disimpan. Periksa kembali data dan coba lagi.' });
  }
});

app.post('/api/whatsapp/request-events', requireUser, (request, response, next) => {
  void (async () => {
  const { eventId, requestId, status, action, note } = request.body || {};
  const allowedStatuses = ['Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Selesai', 'Ditolak'];
  if (typeof eventId !== 'string' || !/^[\da-f-]{36}$/i.test(eventId) ||
      typeof requestId !== 'string' || requestId.length > 100 ||
      !allowedStatuses.includes(status) ||
      !['submitted', 'status_changed'].includes(action) ||
      (note !== undefined && typeof note !== 'string')) {
    return response.status(400).json({ success: false, error: 'Data notifikasi permohonan tidak valid.' });
  }
  if (whatsappProvider === 'fonnte') {
    const authorized = action === 'submitted'
      ? userHasPermission(request.user, 'requestSupplies')
      : userHasPermission(request.user, 'approveRequests') || userHasPermission(request.user, 'manageInventory');
    if (!authorized) return response.status(403).json({ success: false, error: 'Tidak memiliki izin mengirim notifikasi permohonan.' });
  }

  const existingEvent = db.prepare('SELECT request_id, request_status, action, status FROM whatsapp_notification_events WHERE event_id = ?').get(eventId);
  if (existingEvent) {
    if (existingEvent.request_id !== requestId || existingEvent.request_status !== status || existingEvent.action !== action) {
      return response.status(409).json({ success: false, error: 'ID notifikasi sudah digunakan untuk tindakan yang berbeda.' });
    }
    return response.json({
      success: existingEvent.status === 'sent',
      duplicate: true,
      error: existingEvent.status === 'sent' ? undefined : 'Notifikasi WhatsApp untuk tindakan ini sudah pernah dicoba dan tidak dikirim ulang.'
    });
  }

  const existingRequestEvent = db.prepare(`
    SELECT status FROM whatsapp_notification_events
    WHERE request_id = ? AND request_status = ? AND action = ?
    ORDER BY created_at LIMIT 1
  `).get(requestId, status, action);
  if (existingRequestEvent) {
    return response.json({
      success: existingRequestEvent.status === 'sent',
      duplicate: true,
      error: existingRequestEvent.status === 'sent'
        ? undefined
        : 'Notifikasi WhatsApp untuk permohonan dan status ini sudah pernah dicoba dan tidak dikirim ulang.'
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

    db.exec('BEGIN IMMEDIATE');
    try {
      const duplicateEvent = db.prepare(`
        SELECT status FROM whatsapp_notification_events
        WHERE request_id = ? AND request_status = ? AND action = ?
        ORDER BY created_at LIMIT 1
      `).get(requestId, status, action);
      if (duplicateEvent) {
        db.exec('COMMIT');
        return response.json({
          success: duplicateEvent.status === 'sent',
          duplicate: true,
          error: duplicateEvent.status === 'sent'
            ? undefined
            : 'Notifikasi WhatsApp untuk permohonan dan status ini sudah pernah dicoba dan tidak dikirim ulang.'
        });
      }
      db.prepare(`
        INSERT INTO whatsapp_notification_events (event_id, request_id, request_status, action, status)
        VALUES (?, ?, ?, ?, 'sending')
      `).run(eventId, requestId, status, action);
      if (action === 'submitted') {
        db.prepare('INSERT OR IGNORE INTO whatsapp_request_owners (request_id, user_id) VALUES (?, ?)').run(requestId, request.user.id);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    let result;
    if (whatsappProvider === 'fonnte') {
      const owner = action === 'submitted'
        ? request.user.id
        : db.prepare('SELECT user_id FROM whatsapp_request_owners WHERE request_id = ?').get(requestId)?.user_id;
      const notification = buildFonnteRequestNotification(inventoryRequest, action);
      result = await whatsapp.notifyRequestEvent({
        eventKey: `request:${requestId}:${status}:${action}:${eventId}`,
        ownerUserId: owner,
        ...notification
      });
      db.prepare('UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?')
        .run(result.success ? 'sent' : 'failed', eventId);
    } else {
      result = await sendTwilioRequestEvent({
        eventId,
        inventoryRequest,
        eventType: action === 'submitted' ? 'submitted' : 'approved',
        users: getCollection('users') || [],
        note
      });
    }
    if (result.success) {
      return response.json({ success: true, sentCount: result.sentCount });
    }
    return response.status(502).json({
      success: false,
      sentCount: result.sentCount,
      error: 'Permohonan berhasil disimpan, tetapi WhatsApp service temporarily unavailable.'
    });
  }

  const recipients = new Map();
  if (whatsappRecipientNumber) {
    recipients.set(whatsappRecipientNumber, true);
  } else {
    const users = getCollection('users') || [];
    const previousOwner = db.prepare('SELECT user_id FROM whatsapp_request_owners WHERE request_id = ?').get(requestId);
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

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO whatsapp_notification_events (event_id, request_id, request_status, action, status)
      VALUES (?, ?, ?, ?, 'sending')
    `).run(eventId, requestId, status, action);
    if (action === 'submitted') {
      db.prepare('INSERT OR IGNORE INTO whatsapp_request_owners (request_id, user_id) VALUES (?, ?)').run(requestId, request.user.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

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
        await sendMessage({ phone, message });
        db.prepare(`
          INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status)
          VALUES (?, ?, 'sent')
        `).run(eventId, recipientHash);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Pengiriman WhatsApp gagal.';
        failures.push(message);
        console.error(`${whatsappProvider} WhatsApp notification failed:`, message);
        db.prepare(`
          INSERT INTO whatsapp_notification_recipients (event_id, recipient_hash, status, error)
          VALUES (?, ?, 'failed', ?)
        `).run(eventId, recipientHash, message.slice(0, 500));
      }
    }
  }

  const sentCount = db.prepare("SELECT COUNT(*) AS count FROM whatsapp_notification_recipients WHERE event_id = ? AND status = 'sent'").get(eventId).count;
  const finalStatus = failures.length === 0 && sentCount > 0 ? 'sent' : 'failed';
  db.prepare('UPDATE whatsapp_notification_events SET status = ? WHERE event_id = ?').run(finalStatus, eventId);
  if (finalStatus === 'sent') return response.json({ success: true, sentCount });
  return response.status(502).json({
    success: false,
    sentCount,
    error: 'Permohonan berhasil diproses, tetapi WhatsApp service temporarily unavailable.'
  });
  })().catch(next);
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.get('*', (_request, response) => response.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom'
  });
  app.use(vite.middlewares);
  app.get('*', async (request, response, next) => {
    try {
      const html = await vite.transformIndexHtml(request.originalUrl, fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
      response.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (error) {
      next(error);
    }
  });
}

app.use((error, _request, response, _next) => {
  console.error(error);
  if (response.headersSent) return;
  response.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

app.listen(port, host, () => {
  console.log(`SIMAN server listening on http://${host}:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});
