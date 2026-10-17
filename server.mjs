import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import mysql from 'mysql2/promise';
import {
  logExternalServiceTiming,
  logSlowDatabaseQuery,
  performanceTiming
} from './performanceMetrics.mjs';
import { createCloudflareAccessMiddleware, createCloudflareAccessVerifier } from './cloudflareAccess.mjs';
import { assertOperationalSchema, readOperationalState } from './operationalStore.mjs';
import { writeOperationalState } from './operationalWrites.mjs';
import { sendWhatsAppMessage } from './whatsappService.mjs';
import { validateRequestAuthorization } from './requestAccess.mjs';
import {
  getRequestItemQuantities,
  getRequestReservedQuantity,
  normalizeRequestHandoverItems,
  validateAdditionalStockOut,
  validateNewRequestStock
} from './requestStockValidation.mjs';
import { assignNewRequestNumbers } from './requestNumber.mjs';
import { sendTwilioWhatsAppMessage } from './twilioWhatsAppService.mjs';
import { createWhatsAppService } from './whatsapp/service.mjs';
import { getWhatsAppConfig } from './whatsapp/config.mjs';
import { buildFonnteRequestNotification } from './whatsapp/request-notification.mjs';
import { createWebChat, WEB_CHAT_ERRORS } from './ai/webchat.mjs';
import { getWebChatConfig } from './ai/webchatConfig.mjs';
import { buildRequestEvents, createN8nIntegration } from './automation/n8n/integration.mjs';
import { createDocumentStorage, DocumentStorageError, validateStoredFile } from './documentStorage.mjs';
import { readDocumentWithBackup, saveDocumentBackup, verifyDocumentBytes } from './documentFileBackup.mjs';
import {
  authorizeChangedCollections,
  getChangedCollections,
  getChangedUserProfiles,
  resolveRequestUser,
  restoreRestrictedFinancialData
} from './stateAuthorization.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '.env') });
class DocumentUploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const documentMaxFileSizeMb = Number(process.env.DOCUMENT_MAX_FILE_SIZE_MB || 25);
if (!Number.isInteger(documentMaxFileSizeMb) || documentMaxFileSizeMb < 1 || documentMaxFileSizeMb > 100) {
  throw new Error('DOCUMENT_MAX_FILE_SIZE_MB harus berupa bilangan bulat antara 1 dan 100.');
}
const documentMaxFileSize = documentMaxFileSizeMb * 1024 * 1024;
const documentStorageDirectory = path.resolve(root, process.env.DOCUMENT_STORAGE_DIR || path.join(root, 'data', 'documents'));
const publicDirectories = [path.join(root, 'public'), path.join(root, 'dist')];
function assertPrivateDocumentStorageDirectory(storageDirectory) {
  for (const publicDirectory of publicDirectories) {
    const resolvedPublicDirectory = fs.existsSync(publicDirectory)
      ? fs.realpathSync(publicDirectory)
      : path.resolve(publicDirectory);
    const relative = path.relative(resolvedPublicDirectory, storageDirectory);
    if (relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) {
      throw new Error('DOCUMENT_STORAGE_DIR harus berada di luar folder public dan dist.');
    }
  }
}
assertPrivateDocumentStorageDirectory(documentStorageDirectory);
const documentStorage = createDocumentStorage(documentStorageDirectory);
await documentStorage.initialize();
const resolvedDocumentStorageDirectory = fs.realpathSync(documentStorageDirectory);
assertPrivateDocumentStorageDirectory(resolvedDocumentStorageDirectory);
const n8nIntegration = createN8nIntegration(process.env);
if (n8nIntegration.configurationError) {
  console.error(`n8n integration disabled: ${n8nIntegration.configurationError}`);
}
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST?.trim() || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const adminNip = process.env.ADMIN_NIP?.trim();
const adminPassword = process.env.ADMIN_PASSWORD;
const configuredDataBackend = process.env.DATA_BACKEND?.trim().toLowerCase();
const whatsappProvider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() || 'meta';
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const whatsappRecipientNumber = process.env.WHATSAPP_RECIPIENT_NUMBER?.trim().replace(/\D/g, '');
if (!['meta', 'twilio', 'fonnte'].includes(whatsappProvider)) {
  throw new Error('WHATSAPP_PROVIDER harus bernilai meta, twilio, atau fonnte.');
}
const dbHost = process.env.DB_HOST?.trim();
const dbUser = process.env.DB_USER?.trim();
const dbName = process.env.DB_NAME?.trim();
const dbPort = Number(process.env.DB_PORT || 3306);
const dbConnectionLimit = Number(process.env.DB_CONNECTION_LIMIT || 10);
if (!dbHost || !dbUser || !dbName ||
    (!process.env.DB_PASSWORD && process.env.NODE_ENV === 'production') ||
    !Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535 ||
    !Number.isInteger(dbConnectionLimit) || dbConnectionLimit < 1 || dbConnectionLimit > 100) {
  throw new Error('Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, and valid DB_PORT/DB_CONNECTION_LIMIT values before starting the server.');
}

// Opt-in eksplisit: mode legacy di produksi hanya jika ALLOW_LEGACY_PRODUCTION=true.
const allowLegacyProduction = process.env.ALLOW_LEGACY_PRODUCTION?.trim().toLowerCase() === 'true';
const dataBackend = configuredDataBackend || (process.env.NODE_ENV === 'production' ? '' : 'legacy');
if (!['legacy', 'operational'].includes(dataBackend) ||
    (process.env.NODE_ENV === 'production' && dataBackend !== 'operational' && !allowLegacyProduction)) {
  throw new Error('Production requires DATA_BACKEND=operational; set ALLOW_LEGACY_PRODUCTION=true to run legacy app_data mode in production.');
}
if (dataBackend === 'legacy' && (!adminNip || !adminPassword || adminPassword.length < 12)) {
  throw new Error('Set ADMIN_NIP and an ADMIN_PASSWORD of at least 12 characters in .env before starting legacy mode.');
}
if (dataBackend === 'legacy' && adminPassword.startsWith('REPLACE_WITH_')) {
  throw new Error('Replace the example ADMIN_PASSWORD in .env with a private password before starting legacy mode.');
}

// ACCESS_REQUIRED=false secara eksplisit menonaktifkan Cloudflare Access; default produksi tetap wajib.
const accessRequiredSetting = process.env.ACCESS_REQUIRED?.trim().toLowerCase();
const cloudflareAccessRequired = accessRequiredSetting
  ? accessRequiredSetting === 'true'
  : process.env.NODE_ENV === 'production';
const cloudflareAccessTeamDomain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim();
const cloudflareAccessAudience = process.env.CLOUDFLARE_ACCESS_AUD?.trim();
if (cloudflareAccessRequired && (!cloudflareAccessTeamDomain || !cloudflareAccessAudience)) {
  throw new Error('Set CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD when Cloudflare Access is required.');
}
const cloudflareAccessVerifier = cloudflareAccessRequired
  ? createCloudflareAccessVerifier({
      teamDomain: cloudflareAccessTeamDomain,
      audience: cloudflareAccessAudience
    })
  : null;
const requireCloudflareAccess = createCloudflareAccessMiddleware({
  verifier: cloudflareAccessVerifier,
  required: cloudflareAccessRequired
});

const db = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: process.env.DB_PASSWORD || '',
  database: dbName,
  waitForConnections: true,
  connectionLimit: dbConnectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4',
  enableKeepAlive: true
});

const schema = [
  `CREATE TABLE IF NOT EXISTS auth_users (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    nip VARCHAR(30) NOT NULL UNIQUE,
    profile_json LONGTEXT NOT NULL,
    salt CHAR(32) NOT NULL,
    password_hash CHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(191) NOT NULL,
    expires_at BIGINT NOT NULL,
    INDEX idx_sessions_user_id (user_id),
    INDEX idx_sessions_expires_at (expires_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS app_data (
    \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
    value_json LONGTEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
    value VARCHAR(255) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS document_files (
    document_id VARCHAR(36) NOT NULL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(127) NOT NULL,
    file_size_bytes BIGINT UNSIGNED NOT NULL,
    sha256 CHAR(64) NOT NULL,
    file_data LONGBLOB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS whatsapp_notification_events (
    event_id CHAR(36) NOT NULL PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL,
    request_status VARCHAR(40) NOT NULL,
    action VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notification_request (request_id, request_status, action, created_at),
    UNIQUE KEY uq_notification_request (request_id, request_status, action)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS whatsapp_notification_recipients (
    event_id CHAR(36) NOT NULL,
    recipient_hash CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    error VARCHAR(500),
    PRIMARY KEY (event_id, recipient_hash),
    CONSTRAINT fk_notification_recipient_event FOREIGN KEY (event_id) REFERENCES whatsapp_notification_events(event_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS whatsapp_request_owners (
    request_id VARCHAR(100) NOT NULL PRIMARY KEY,
    user_id VARCHAR(191) NOT NULL,
    INDEX idx_request_owner_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

async function initializeDatabase() {
  await db.query('SELECT 1');
  for (const statement of schema) await db.query(statement);
}

try {
  if (dataBackend === 'legacy') {
    await initializeDatabase();
    await db.execute("INSERT IGNORE INTO app_meta (`key`, value) VALUES ('revision', '0')");
  } else {
    await db.query('SELECT 1');
    await assertOperationalSchema(db);
    const [revisionRows] = await db.execute("SELECT value FROM app_meta WHERE `key` = 'revision'");
    if (!revisionRows.length || !Number.isInteger(Number(revisionRows[0].value))) {
      throw new Error('Operational app_meta revision is missing or invalid; apply the approved manual staging migration.');
    }
  }
} catch (error) {
  await db.end();
  console.error('Database startup validation failed:', error instanceof Error ? error.message : error);
  throw new Error('Could not connect to or validate the configured database.');
}

async function queryRows(executor, sql, params = []) {
  const startedAt = Date.now();
  try {
    const [rows] = await executor.execute(sql, params);
    return rows;
  } finally {
    logSlowDatabaseQuery(sql, Date.now() - startedAt);
  }
}

async function queryOne(executor, sql, params = []) {
  return (await queryRows(executor, sql, params))[0] || null;
}

async function execute(executor, sql, params = []) {
  const startedAt = Date.now();
  try {
    const [result] = await executor.execute(sql, params);
    return result;
  } finally {
    logSlowDatabaseQuery(sql, Date.now() - startedAt);
  }
}

async function measureExternalService(provider, operation) {
  const startedAt = Date.now();
  try {
    const result = await operation();
    const metrics = result && typeof result.success === 'boolean'
      ? result
      : { success: true, sentCount: 1, failedCount: 0 };
    logExternalServiceTiming(provider, startedAt, metrics);
    return result;
  } catch (error) {
    logExternalServiceTiming(provider, startedAt, null);
    throw error;
  }
}

async function withTransaction(callback) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function canManageDocuments(user) {
  return ['manageAssets', 'manageInventory', 'systemSettings']
    .some(permission => userHasPermission(user, permission));
}

function canViewDocuments(user) {
  return userHasPermission(user, 'viewReports') || canManageDocuments(user);
}

function safeDocumentName(fileName) {
  return String(fileName || 'document').replace(/[\\/\r\n"]/g, '_');
}

async function readLimitedRequest(request, maximumBytes) {
  const contentLength = Number(request.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new DocumentUploadError(`Ukuran berkas melebihi batas ${documentMaxFileSizeMb} MB.`, 413);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) {
      throw new DocumentUploadError(`Ukuran berkas melebihi batas ${documentMaxFileSizeMb} MB.`, 413);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function parseDocumentUploadMetadata(request) {
  const encoded = request.get('x-document-metadata');
  if (!encoded || encoded.length > 8192) throw new DocumentUploadError('Metadata dokumen tidak valid.');
  let metadata;
  try {
    metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new DocumentUploadError('Metadata dokumen tidak valid.');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new DocumentUploadError('Metadata dokumen tidak valid.');
  }
  const title = String(metadata.title || '').trim();
  const category = String(metadata.category || '');
  const number = String(metadata.number || '').trim();
  const date = String(metadata.date || '');
  const status = String(metadata.status || 'Draft');
  const description = String(metadata.description || '').trim();
  const tags = metadata.tags;
  const categories = new Set([
    'Nota', 'Berita Acara', 'Dokumen Lainnya', 'Dokumen Perolehan',
    'Dokumen Pemindahan', 'Dokumen Pemeliharaan', 'Dokumen Penghapusan',
    'Dokumen Barang Masuk', 'Dokumen Barang Keluar', 'Dokumen Stock Opname',
    'Dokumen Pengadaan'
  ]);
  const dateObject = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
  if (!title || title.length > 200 || !categories.has(category) ||
      !dateObject || Number.isNaN(dateObject.getTime()) || dateObject.toISOString().slice(0, 10) !== date ||
      !['Draft', 'Final', 'Sah', 'Menunggu TTD', 'Arsip'].includes(status) ||
      number.length > 100 || description.length > 2000 ||
      !Array.isArray(tags) || tags.length > 20 ||
      tags.some(tag => typeof tag !== 'string' || tag.length > 80)) {
    throw new DocumentUploadError('Lengkapi metadata dokumen dengan format yang valid.');
  }

  let namaToko;
  let kategoriNota;
  let totalNilaiNota;
  let receiptItems;
  if (category === 'Nota') {
    namaToko = String(metadata.namaToko || '').trim();
    kategoriNota = String(metadata.kategoriNota || '').trim();
    if (kategoriNota && !['ATK', 'ARK'].includes(kategoriNota)) {
      throw new DocumentUploadError('Kategori nota harus ATK atau ARK.');
    }
    if (metadata.items !== undefined) {
      if (!Array.isArray(metadata.items)) {
        throw new DocumentUploadError('Daftar barang nota tidak valid.');
      }
      receiptItems = metadata.items.map((item, idx) => {
        const namaBarang = String(item?.namaBarang || '').trim();
        const kategori = String(item?.kategori || kategoriNota || 'ATK').trim();
        const satuan = String(item?.satuan || '').trim();
        const jumlah = Number(item?.jumlah);
        const hargaSatuan = Number(item?.hargaSatuan);
        const totalHarga = Number(item?.totalHarga != null ? item.totalHarga : (jumlah * hargaSatuan));
        if (!namaBarang || namaBarang.length > 200) {
          throw new DocumentUploadError(`Nama barang pada baris ${idx + 1} tidak valid.`);
        }
        if (!['ATK', 'ARK'].includes(kategori)) {
          throw new DocumentUploadError(`Kategori barang pada baris ${idx + 1} harus ATK atau ARK.`);
        }
        if (!satuan || satuan.length > 30) {
          throw new DocumentUploadError(`Satuan barang pada baris ${idx + 1} tidak valid.`);
        }
        if (!Number.isSafeInteger(jumlah) || jumlah <= 0) {
          throw new DocumentUploadError(`Jumlah barang pada baris ${idx + 1} harus bilangan bulat positif.`);
        }
        if (!Number.isFinite(hargaSatuan) || hargaSatuan < 0) {
          throw new DocumentUploadError(`Harga satuan pada baris ${idx + 1} tidak valid.`);
        }
        return {
          id: String(item?.id || crypto.randomUUID()),
          itemId: item?.itemId ? String(item.itemId).trim() : undefined,
          namaBarang,
          kategori,
          satuan,
          jumlah,
          hargaSatuan,
          totalHarga: Number.isFinite(totalHarga) && totalHarga >= 0 ? totalHarga : (jumlah * hargaSatuan)
        };
      });
      totalNilaiNota = receiptItems.reduce((acc, it) => acc + it.totalHarga, 0);
    } else if (metadata.totalNilaiNota != null) {
      const val = Number(metadata.totalNilaiNota);
      if (Number.isFinite(val) && val >= 0) totalNilaiNota = val;
    }
  }

  return {
    title,
    category,
    number,
    date,
    status,
    description,
    tags: tags.map(tag => tag.trim()).filter(Boolean),
    namaToko: namaToko || undefined,
    kategoriNota: kategoriNota || undefined,
    totalNilaiNota: totalNilaiNota != null ? totalNilaiNota : undefined,
    items: receiptItems
  };
}

function parseUploadKey(request) {
  const uploadKey = String(request.get('x-upload-id') || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadKey)) {
    throw new DocumentUploadError('ID upload tidak valid. Pilih kembali berkas sebelum mencoba lagi.');
  }
  return uploadKey;
}

function documentAuditRecord(user, document, timestamp, ipAddress) {
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(timestamp);
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(timestamp);
  return {
    id: crypto.randomUUID(),
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    aktivitas: 'Unggah Dokumen Backend',
    modul: 'DOKUMEN',
    tanggal: localDate,
    waktu: localTime,
    ipAddress: String(ipAddress || '').slice(0, 50),
    detail: `Mengunggah ${document.judul} (${document.nomorDokumen}) ke penyimpanan backend.`
  };
}

async function persistHostDocument(document, auditLog, fileBytes) {
  return withTransaction(async connection => {
    const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
    const revision = Number(revisionRow?.value || 0);
    const currentState = await readCollections(connection);
    const existing = (currentState.documents || []).find(item => item.idempotencyKey === document.idempotencyKey);
    if (existing) {
      await saveDocumentBackup(connection, existing, fileBytes);
      const existingAuditLog = (currentState.auditLogs || []).find(log =>
        log.userId === auditLog.userId &&
        log.aktivitas === 'Unggah Dokumen Backend' &&
        log.detail === auditLog.detail
      );
      return { document: existing, auditLog: existingAuditLog, revision };
    }

    if (dataBackend === 'operational') {
      await execute(connection, `
        INSERT INTO documents
          (id, nomor_dokumen, judul, jenis, tanggal, tahun, file_size, uploader, status, tags_json,
           storage_backend, storage_key, storage_size_bytes, sha256, file_name, mime_type, uploaded_at, description, idempotency_key,
           nama_toko, kategori_nota, total_nilai_nota)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        document.id, document.nomorDokumen, document.judul, document.jenis, document.tanggal,
        document.tahun, document.fileSize, document.uploader, document.status, JSON.stringify(document.tags),
        document.storageBackend, document.storageKey, document.storageSize, document.sha256, document.fileName, document.fileType, new Date(document.uploadedAt),
        document.description || null, document.idempotencyKey,
        document.namaToko || null, document.kategoriNota || null, document.totalNilaiNota != null ? document.totalNilaiNota : null
      ]);
      if (Array.isArray(document.items) && document.items.length > 0) {
        for (const item of document.items) {
          await execute(connection, `
            INSERT INTO document_receipt_items
              (id, document_id, item_id, nama_barang, kategori, satuan, jumlah, harga_satuan, total_harga)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            item.id || crypto.randomUUID(),
            document.id,
            item.itemId || null,
            item.namaBarang,
            item.kategori,
            item.satuan,
            item.jumlah,
            item.hargaSatuan,
            item.totalHarga
          ]);
        }
      }
      await execute(connection, `
        INSERT INTO audit_logs (id, user_id, user_name, user_role, aktivitas, modul, tanggal, waktu, ip_address, detail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        auditLog.id, auditLog.userId, auditLog.userName, auditLog.userRole, auditLog.aktivitas,
        auditLog.modul, auditLog.tanggal, auditLog.waktu, auditLog.ipAddress, auditLog.detail
      ]);
    } else {
      const documents = [document, ...(currentState.documents || [])];
      const auditLogs = [...(currentState.auditLogs || []), auditLog];
      await execute(connection, `
        INSERT INTO app_data (\`key\`, value_json) VALUES ('documents', ?)
        ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
      `, [JSON.stringify(documents)]);
      await execute(connection, `
        INSERT INTO app_data (\`key\`, value_json) VALUES ('auditLogs', ?)
        ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
      `, [JSON.stringify(auditLogs)]);
    }
    await saveDocumentBackup(connection, document, fileBytes);
    await execute(connection, `
      INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value)
    `, [String(revision + 1)]);
    return { document, auditLog, revision: revision + 1 };
  });
}

async function persistHostDocumentDeletion(documentId, auditLog) {
  return withTransaction(async connection => {
    const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
    const revision = Number(revisionRow?.value || 0);
    const currentState = await readCollections(connection);
    const document = (currentState.documents || []).find(item => item.id === documentId);
    if (!document) return { deleted: false, revision };
    if (dataBackend === 'operational') {
      await execute(connection, 'DELETE FROM documents WHERE id = ?', [documentId]);
      await execute(connection, `
        INSERT INTO audit_logs (id, user_id, user_name, user_role, aktivitas, modul, tanggal, waktu, ip_address, detail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        auditLog.id, auditLog.userId, auditLog.userName, auditLog.userRole, auditLog.aktivitas,
        auditLog.modul, auditLog.tanggal, auditLog.waktu, auditLog.ipAddress, auditLog.detail
      ]);
    } else {
      await execute(connection, 'DELETE FROM document_files WHERE document_id = ?', [documentId]);
      await execute(connection, `
        INSERT INTO app_data (\`key\`, value_json) VALUES ('documents', ?)
        ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
      `, [JSON.stringify(currentState.documents.filter(item => item.id !== documentId))]);
      await execute(connection, `
        INSERT INTO app_data (\`key\`, value_json) VALUES ('auditLogs', ?)
        ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
      `, [JSON.stringify([...(currentState.auditLogs || []), auditLog])]);
    }
    await execute(connection, `
      INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value)
    `, [String(revision + 1)]);
    return { deleted: true, revision: revision + 1 };
  });
}

if (dataBackend === 'legacy') {
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
  await execute(db, `
    INSERT IGNORE INTO auth_users (id, nip, profile_json, salt, password_hash)
    VALUES (?, ?, ?, ?, ?)
  `, [adminProfile.id, adminNip, JSON.stringify(adminProfile), adminSalt.toString('hex'), adminHash.toString('hex')]);
  await execute(db, 'DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
}

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
const collectionCache = Object.fromEntries(collections.map(key => [key, null]));

function stateForUser(source, user) {
  const state = JSON.parse(JSON.stringify(source));
  if (userHasPermission(user, 'manageInventory')) return state;
  for (const item of state.inventoryItems || []) {
    delete item.hargaSatuan;
    delete item.totalNilai;
  }
  for (const transaction of state.stockInList || []) {
    delete transaction.hargaSatuan;
    delete transaction.totalHarga;
  }
  for (const document of state.documents || []) {
    delete document.totalNilaiNota;
    for (const item of document.items || []) {
      delete item.hargaSatuan;
      delete item.totalHarga;
      delete item.subtotal;
    }
  }
  return state;
}

async function refreshCollections(executor = db) {
  const state = dataBackend === 'operational'
    ? await readOperationalState(executor)
    : await readCollections(executor);
  Object.assign(collectionCache, state);
}

async function readCollections(executor = db) {
  if (dataBackend === 'operational') return readOperationalState(executor);
  const state = Object.fromEntries(collections.map(key => [key, null]));
  const rows = await queryRows(executor, 'SELECT `key`, value_json FROM app_data');
  for (const row of rows) {
    if (Object.hasOwn(state, row.key)) state[row.key] = JSON.parse(row.value_json);
  }
  return state;
}

await refreshCollections();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') || [];
  const cookie = cookies.map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function secureCookie(request) {
  return process.env.NODE_ENV === 'production' ||
    request.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
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

function accessIdentityMatches(user, claims, users) {
  if (!cloudflareAccessRequired) return true;
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !claims?.email || !Array.isArray(users)) return false;
  const matches = users.filter(candidate =>
    candidate.statusAktif !== false &&
    String(candidate.email || '').trim().toLowerCase() === String(claims.email).trim().toLowerCase()
  );
  return matches.length === 1 && matches[0].id === user.id && email === String(claims.email).trim().toLowerCase();
}

function requireUser(request, response, next) {
  return requireUserWithState(request, response, next, true);
}

function requireUserFromTransactionState(request, response, next) {
  return requireUserWithState(request, response, next, false);
}

function requireUserWithState(request, response, next, refreshState) {
  return requireCloudflareAccess(request, response, () => {
    (async () => {
      const token = readCookie(request, 'siman_session');
      if (!token) {
        response.status(401).json({ error: 'Silakan masuk kembali.' });
        return false;
      }
      const session = await queryOne(db, `
        SELECT s.user_id, u.profile_json
        FROM sessions s JOIN auth_users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
      `, [hashToken(token), Date.now()]);
      if (!session) {
        response.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' });
        return false;
      }
      const profile = JSON.parse(session.profile_json);
      if (refreshState) {
        await refreshCollections();
        const resolved = resolveRequestUser(
          profile,
          session.user_id,
          getCollection('users'),
          request.accessClaims,
          cloudflareAccessRequired
        );
        if (resolved.error) {
          response.status(403).json({ error: resolved.error });
          return false;
        }
        request.user = resolved.user;
      } else {
        if (profile.statusAktif === false) {
          response.status(403).json({ error: 'Akun dinonaktifkan.' });
          return false;
        }
        request.user = { ...profile, id: session.user_id };
      }
      return true;
    })().then(authorized => {
      if (authorized) next();
    }).catch(next);
  });
}

function bindRequestUserToState(request, state) {
  const resolved = resolveRequestUser(
    request.user,
    request.user.id,
    state.users,
    request.accessClaims,
    cloudflareAccessRequired
  );
  if (resolved.error) return resolved.error;
  request.user = resolved.user;
  return null;
}

function getCollection(key) {
  return collectionCache[key] ?? null;
}

function normalizeWhatsAppNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

function maskWhatsAppNumber(value) {
  const digits = normalizeWhatsAppNumber(value);
  return digits.length > 4 ? `***${digits.slice(-4)}` : '[invalid]';
}

function currentMakassarDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
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

function userHasPermission(user, permission, source = collectionCache) {
  if (user.role === 'Administrator') return true;
  const roles = source.roles || [];
  const role = roles.find(item => item.name?.toLowerCase() === String(user.role).toLowerCase());
  return Boolean(role?.permissions?.[permission]);
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

async function syncAccountProfiles(connection, users, previousUsers) {
  for (const user of getChangedUserProfiles(previousUsers, users)) {
    await execute(connection, 'UPDATE auth_users SET nip = ?, profile_json = ? WHERE id = ?', [
      String(user.nip).trim(), JSON.stringify(user), user.id
    ]);
  }
}

const whatsapp = await createWhatsAppService({
  db,
  getCollection,
  userHasPermission,
  requireUser,
  refreshCollections,
  initializeSchema: dataBackend === 'legacy'
});
await whatsapp.start();

const app = express();
app.disable('x-powered-by');
// Webhook harus dipasang sebelum express.json agar body mentah tersedia untuk verifikasi signature.
app.use(whatsapp.webhook);
app.use(express.json({ limit: '25mb' }));
app.use(sameOrigin);
app.use(whatsapp.api);

app.get('/api/health', asyncRoute(async (_request, response) => {
  try {
    const result = await queryOne(db, 'SELECT 1 AS ready');
    if (result?.ready !== 1) return response.status(503).json({ status: 'unavailable' });
    response.json({ status: 'ok' });
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`Health check database query failed (${code}).`);
    response.status(503).json({ status: 'unavailable' });
  }
}));

app.post('/api/auth/login', requireCloudflareAccess, asyncRoute(async (request, response) => {
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
  await refreshCollections();
  const account = await queryOne(db, 'SELECT * FROM auth_users WHERE nip = ?', [nip]);
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
  if (!accessIdentityMatches(currentUser || profile, request.accessClaims, registeredUsers)) {
    return response.status(403).json({ error: 'Identitas Cloudflare Access tidak cocok dengan akun aplikasi.' });
  }
  loginAttempts.delete(address);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = now + 12 * 60 * 60 * 1000;
  await execute(db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
    hashToken(token), account.id, expiresAt
  ]);
  response.setHeader('Set-Cookie', `siman_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookie(request) ? '; Secure' : ''}`);
  response.json({ user: profile });
}));

app.get('/api/auth/me', requireUser, (request, response) => {
  response.json({ user: request.user });
});

app.post('/api/auth/logout', requireCloudflareAccess, asyncRoute(async (request, response) => {
  const token = readCookie(request, 'siman_session');
  if (token) await execute(db, 'DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
  response.setHeader('Set-Cookie', `siman_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie(request) ? '; Secure' : ''}`);
  response.json({ success: true });
}));

app.put('/api/auth/users/:id/password', requireUser, asyncRoute(async (request, response) => {
  if (!userHasPermission(request.user, 'manageUsers')) {
    return response.status(403).json({ error: 'Tidak memiliki izin mengelola akun.' });
  }
  const user = request.body?.user;
  const password = String(request.body?.password || '');
  if (!user || user.id !== request.params.id || !String(user.nip || '').trim()) {
    return response.status(400).json({ error: 'Profil pengguna tidak valid.' });
  }
  const existing = await queryOne(db, 'SELECT profile_json FROM auth_users WHERE id = ?', [user.id]);
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
  const duplicateNip = await queryOne(db, 'SELECT id FROM auth_users WHERE nip = ? AND id != ?', [String(user.nip).trim(), user.id]);
  if (duplicateNip) return response.status(409).json({ error: 'NIP tersebut sudah digunakan oleh akun lain.' });
  const salt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync(password, salt, 64);
  const profile = { ...(canonical || user), nip: String(user.nip).trim() };
  await execute(db, `
    INSERT INTO auth_users (id, nip, profile_json, salt, password_hash)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      nip = VALUES(nip),
      profile_json = VALUES(profile_json),
      salt = VALUES(salt),
      password_hash = VALUES(password_hash)
  `, [user.id, profile.nip, JSON.stringify(profile), salt.toString('hex'), passwordHash.toString('hex')]);
  await execute(db, 'DELETE FROM sessions WHERE user_id = ?', [user.id]);
  response.json({ success: true });
}));

app.get('/api/state', performanceTiming('GET /api/state'), requireUser, asyncRoute(async (_request, response) => {
  const state = stateForUser(
    Object.fromEntries(collections.map(key => [key, getCollection(key)])),
    _request.user
  );
  if (dataBackend === 'operational') state.warehouseRacks = getCollection('warehouseRacks') || [];
  const revisionRow = await queryOne(db, "SELECT value FROM app_meta WHERE `key` = 'revision'");
  const revision = Number(revisionRow?.value || 0);
  response.json({ state, initialized: state.users !== null, revision, dataBackend });
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
    for (const [index, { item, quantity }] of issuedItems.entries()) {
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

app.post('/api/documents', requireUser, asyncRoute(async (request, response) => {
  if (!canManageDocuments(request.user)) {
    return response.status(403).json({ error: 'Tidak memiliki izin mengunggah dokumen.' });
  }

  let metadata;
  let uploadKey;
  let file;
  let fileBytes;
  try {
    metadata = parseDocumentUploadMetadata(request);
    if (metadata.category === 'Nota' && !userHasPermission(request.user, 'manageInventory')) {
      return response.status(403).json({ error: 'Hanya role yang berwenang atas persediaan dapat mengunggah nota belanja.' });
    }
    uploadKey = parseUploadKey(request);
    let fileName;
    try {
      fileName = decodeURIComponent(request.get('x-file-name') || '');
    } catch {
      throw new DocumentUploadError('Nama berkas tidak valid.');
    }
    fileBytes = await readLimitedRequest(request, documentMaxFileSize);
    file = validateStoredFile({
      fileName,
      mimeType: request.get('content-type'),
      bytes: fileBytes,
      maxBytes: documentMaxFileSize
    });
  } catch (error) {
    if (error instanceof DocumentUploadError) {
      return response.status(error.status).json({ error: error.message });
    }
    if (error instanceof DocumentStorageError) {
      return response.status(error.code === 'DOCUMENT_TOO_LARGE' ? 413 : 400).json({ error: error.message });
    }
    throw error;
  }

  const year = Number(metadata.date.slice(0, 4));
  const fileSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
  try {
    await documentStorage.save(uploadKey, fileBytes, fileSha256);
  } catch (error) {
    if (error instanceof DocumentStorageError) {
      const status = error.code === 'UPLOAD_ID_CONFLICT' ? 409 : 500;
      if (status === 500) console.error('Backend document storage failed:', error.code);
      return response.status(status).json({
        error: status === 409 ? error.message : 'Berkas tidak dapat disimpan pada penyimpanan backend.'
      });
    }
    throw error;
  }

  const document = {
    id: crypto.randomUUID(),
    nomorDokumen: metadata.number || `BMN/${year}/${uploadKey.slice(0, 8).toUpperCase()}`,
    judul: metadata.title,
    jenis: metadata.category,
    tanggal: metadata.date,
    tahun: year,
    fileSize: fileBytes.length < 1024 * 1024
      ? `${(fileBytes.length / 1024).toFixed(1)} KB`
      : `${(fileBytes.length / (1024 * 1024)).toFixed(1)} MB`,
    uploader: request.user.name,
    tags: metadata.tags,
    status: metadata.status,
    fileName: file.fileName,
    fileType: file.mimeType,
    storageBackend: 'hostinger',
    storageKey: uploadKey,
    storageSize: fileBytes.length,
    sha256: fileSha256,
    description: metadata.description || undefined,
    uploadedAt: new Date().toISOString(),
    idempotencyKey: uploadKey,
    namaToko: metadata.namaToko,
    kategoriNota: metadata.kategoriNota,
    totalNilaiNota: metadata.totalNilaiNota,
    items: metadata.items
  };
  const auditLog = documentAuditRecord(request.user, document, new Date(document.uploadedAt), request.ip);
  try {
    const result = await persistHostDocument(document, auditLog, fileBytes);
    if (result.document.id !== document.id) {
      const revisionRow = await queryOne(db, "SELECT value FROM app_meta WHERE `key` = 'revision'");
      return response.json({
        document: result.document,
        auditLog: result.auditLog,
        revision: Number(revisionRow?.value || result.revision)
      });
    }
    await refreshCollections();
    return response.status(201).json({
      document: result.document,
      auditLog: result.auditLog || auditLog,
      revision: result.revision
    });
  } catch (error) {
    console.error('Backend document metadata persistence failed:', error?.code || 'DATABASE_ERROR');
    if (error?.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({
        error: 'Nomor dokumen tersebut sudah digunakan. Perbarui nomor dokumen lalu kirim kembali.'
      });
    }
    return response.status(500).json({
      error: 'Penyimpanan metadata atau cadangan MySQL belum selesai. Berkas ada di disk backend; ulangi permintaan yang sama untuk menyelesaikan pencatatan.'
    });
  }
}));

app.put('/api/documents/:id', requireUser, asyncRoute(async (request, response) => {
  if (!canManageDocuments(request.user) || !userHasPermission(request.user, 'manageInventory')) {
    return response.status(403).json({ error: 'Tidak memiliki izin mengubah nota belanja.' });
  }

  const existing = (getCollection('documents') || []).find(item => item.id === request.params.id);
  if (!existing) return response.status(404).json({ error: 'Nota belanja tidak ditemukan.' });
  if (existing.jenis !== 'Nota') return response.status(400).json({ error: 'Dokumen ini bukan nota belanja.' });
  if (existing.status !== 'Draft' && !userHasPermission(request.user, 'systemSettings')) {
    return response.status(403).json({ error: 'Nota final/terkunci hanya dapat diubah melalui otorisasi administrator.' });
  }

  let metadata;
  let fileBytes;
  let file;
  try {
    metadata = parseDocumentUploadMetadata(request);
    if (metadata.category !== 'Nota') throw new DocumentUploadError('Kategori dokumen tidak dapat diubah dari nota.');
    fileBytes = await readLimitedRequest(request, documentMaxFileSize);
    if (fileBytes.length) {
      let fileName;
      try {
        fileName = decodeURIComponent(request.get('x-file-name') || '');
      } catch {
        throw new DocumentUploadError('Nama berkas tidak valid.');
      }
      file = validateStoredFile({
        fileName,
        mimeType: request.get('content-type'),
        bytes: fileBytes,
        maxBytes: documentMaxFileSize
      });
    }
  } catch (error) {
    if (error instanceof DocumentUploadError) {
      return response.status(error.status).json({ error: error.message });
    }
    if (error instanceof DocumentStorageError) {
      return response.status(error.code === 'DOCUMENT_TOO_LARGE' ? 413 : 400).json({ error: error.message });
    }
    throw error;
  }

  const newStorageKey = file ? crypto.randomUUID() : undefined;
  const fileSha256 = file ? crypto.createHash('sha256').update(fileBytes).digest('hex') : undefined;
  if (file && newStorageKey && fileSha256) {
    try {
      await documentStorage.save(newStorageKey, fileBytes, fileSha256);
    } catch (error) {
      if (error instanceof DocumentStorageError) {
        console.error('Backend replacement document storage failed:', error.code);
        return response.status(500).json({ error: 'Berkas pengganti tidak dapat disimpan pada penyimpanan backend.' });
      }
      throw error;
    }
  }

  const now = new Date();
  let updatedDocument;
  let auditLog;
  let revision;
  let transactionCommitted = false;
  try {
    const result = await withTransaction(async connection => {
      const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
      const currentRevision = Number(revisionRow?.value || 0);
      const currentState = await readCollections(connection);
      const current = (currentState.documents || []).find(item => item.id === request.params.id);
      if (!current || current.storageKey !== existing.storageKey || current.sha256 !== existing.sha256) {
        throw new DocumentUploadError('Nota telah berubah atau dihapus. Muat ulang halaman lalu coba kembali.', 409);
      }
      if (current.jenis !== 'Nota' ||
          (current.status !== 'Draft' && !userHasPermission(request.user, 'systemSettings'))) {
        throw new DocumentUploadError('Nota terkunci atau tidak dapat diubah dengan izin akun ini.', 403);
      }

      const year = Number(metadata.date.slice(0, 4));
      updatedDocument = {
        ...current,
        nomorDokumen: metadata.number,
        judul: metadata.title,
        tanggal: metadata.date,
        tahun: year,
        tags: metadata.tags,
        status: metadata.status,
        description: metadata.description || undefined,
        namaToko: metadata.namaToko,
        kategoriNota: metadata.kategoriNota,
        totalNilaiNota: metadata.totalNilaiNota,
        items: metadata.items
      };
      if (file && newStorageKey && fileSha256) {
        updatedDocument = {
          ...updatedDocument,
          fileName: file.fileName,
          fileType: file.mimeType,
          fileSize: fileBytes.length < 1024 * 1024
            ? `${(fileBytes.length / 1024).toFixed(1)} KB`
            : `${(fileBytes.length / (1024 * 1024)).toFixed(1)} MB`,
          storageBackend: 'hostinger',
          storageKey: newStorageKey,
          storageSize: fileBytes.length,
          sha256: fileSha256
        };
      }
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(now);
      const localTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).format(now);
      auditLog = {
        id: crypto.randomUUID(),
        userId: request.user.id,
        userName: request.user.name,
        userRole: request.user.role,
        aktivitas: 'Perubahan Nota Belanja',
        modul: 'DOKUMEN',
        tanggal: localDate,
        waktu: localTime,
        ipAddress: String(request.ip || '').slice(0, 50),
        detail: `Memperbarui nota ${current.nomorDokumen} menjadi ${updatedDocument.nomorDokumen}; rincian, nominal, atau lampiran diperbarui.`
      };
      const nextState = {
        ...currentState,
        documents: (currentState.documents || []).map(item => item.id === current.id ? updatedDocument : item),
        auditLogs: [auditLog, ...(currentState.auditLogs || [])]
      };

      if (dataBackend === 'operational') {
        await execute(connection, `
          UPDATE documents SET
            nomor_dokumen = ?, judul = ?, tanggal = ?, tahun = ?, file_size = ?, status = ?,
            tags_json = ?, storage_backend = ?, storage_key = ?, storage_size_bytes = ?, sha256 = ?,
            file_name = ?, mime_type = ?, description = ?, nama_toko = ?, kategori_nota = ?, total_nilai_nota = ?
          WHERE id = ?
        `, [
          updatedDocument.nomorDokumen, updatedDocument.judul, updatedDocument.tanggal, updatedDocument.tahun,
          updatedDocument.fileSize, updatedDocument.status, JSON.stringify(updatedDocument.tags),
          updatedDocument.storageBackend || null, updatedDocument.storageKey || null,
          updatedDocument.storageSize || null, updatedDocument.sha256 || null,
          updatedDocument.fileName || null, updatedDocument.fileType || null,
          updatedDocument.description || null, updatedDocument.namaToko || null,
          updatedDocument.kategoriNota || null, updatedDocument.totalNilaiNota ?? null, updatedDocument.id
        ]);
        await execute(connection, 'DELETE FROM document_receipt_items WHERE document_id = ?', [updatedDocument.id]);
        for (const item of updatedDocument.items || []) {
          await execute(connection, `
            INSERT INTO document_receipt_items
              (id, document_id, item_id, nama_barang, kategori, satuan, jumlah, harga_satuan, total_harga)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            item.id, updatedDocument.id, item.itemId || null, item.namaBarang, item.kategori,
            item.satuan, item.jumlah, item.hargaSatuan, item.totalHarga
          ]);
        }
        await execute(connection, `
          INSERT INTO audit_logs (id, user_id, user_name, user_role, aktivitas, modul, tanggal, waktu, ip_address, detail)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          auditLog.id, auditLog.userId, auditLog.userName, auditLog.userRole, auditLog.aktivitas,
          auditLog.modul, auditLog.tanggal, auditLog.waktu, auditLog.ipAddress, auditLog.detail
        ]);
      } else {
        for (const [key, value] of Object.entries({
          documents: nextState.documents,
          auditLogs: nextState.auditLogs
        })) {
          await execute(connection, `
            INSERT INTO app_data (\`key\`, value_json) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
          `, [key, JSON.stringify(value)]);
        }
      }
      if (file) await saveDocumentBackup(connection, updatedDocument, fileBytes);
      revision = currentRevision + 1;
      await execute(connection, `
        INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [String(revision)]);
      return { currentStorageKey: current.storageKey };
    });
    transactionCommitted = true;
    if (file && result.currentStorageKey && result.currentStorageKey !== newStorageKey) {
      try {
        const oldFile = await documentStorage.prepareDelete(result.currentStorageKey);
        await documentStorage.commitDelete(oldFile);
      } catch (error) {
        console.error('Old nota attachment cleanup failed after replacement:', error?.code || 'STORAGE_ERROR');
      }
    }
    await refreshCollections();
    return response.json({ success: true, document: updatedDocument, auditLog, revision });
  } catch (error) {
    if (newStorageKey && !transactionCommitted) {
      try {
        const newFile = await documentStorage.prepareDelete(newStorageKey);
        await documentStorage.commitDelete(newFile);
      } catch (cleanupError) {
        if (!(cleanupError instanceof DocumentStorageError && cleanupError.code === 'DOCUMENT_FILE_MISSING')) {
          console.error('Failed to clean up uncommitted nota attachment:', cleanupError?.code || 'STORAGE_ERROR');
        }
      }
    }
    if (error instanceof DocumentUploadError) {
      return response.status(error.status).json({ error: error.message });
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Nomor dokumen tersebut sudah digunakan.' });
    }
    console.error('Nota metadata update failed:', error?.code || 'DATABASE_ERROR');
    return response.status(500).json({ error: 'Perubahan nota atau lampirannya gagal disimpan.' });
  }
}));

app.get('/api/documents/:id/file', requireUser, asyncRoute(async (request, response) => {
  if (!canViewDocuments(request.user)) {
    return response.status(403).json({ error: 'Tidak memiliki izin melihat dokumen.' });
  }
  const document = (getCollection('documents') || []).find(item => item.id === request.params.id);
  if (!document || document.storageBackend !== 'hostinger' || !document.storageKey) {
    return response.status(404).json({ error: 'Berkas penyimpanan backend tidak ditemukan.' });
  }
  if (document.jenis === 'Nota' && !userHasPermission(request.user, 'manageInventory')) {
    return response.status(403).json({ error: 'Tidak memiliki izin melihat lampiran nota belanja.' });
  }
  let bytes;
  try {
    bytes = await readDocumentWithBackup(documentStorage, db, document);
  } catch (error) {
    if (error instanceof DocumentStorageError) {
      if (error.code === 'DOCUMENT_FILE_MISSING') {
        console.error(`Stored document file is missing for document ${document.id}.`);
        return response.status(404).json({
          code: 'DOCUMENT_FILE_MISSING',
          error: 'Berkas asli tidak ditemukan di disk maupun cadangan MySQL. Pulihkan folder dokumen dari backup hosting atau unggah ulang berkas asli pada nota ini.'
        });
      }
      console.error('Backend document read failed:', error.code);
      return response.status(500).json({
        error: error.code === 'DOCUMENT_INTEGRITY_ERROR'
          ? error.message : 'Berkas tidak dapat dibaca dari penyimpanan backend.'
      });
    }
    throw error;
  }
  const filename = safeDocumentName(document.fileName);
  const disposition = request.query.download === '1' ? 'attachment' : 'inline';
  response.setHeader('Content-Type', document.fileType || 'application/octet-stream');
  response.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`);
  response.setHeader('Content-Length', String(bytes.length));
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.send(bytes);
}));

app.put('/api/documents/:id/file', requireUser, asyncRoute(async (request, response) => {
  if (!canManageDocuments(request.user)) {
    return response.status(403).json({ error: 'Tidak memiliki izin memulihkan lampiran dokumen.' });
  }
  const document = (getCollection('documents') || []).find(item => item.id === request.params.id);
  if (!document || document.storageBackend !== 'hostinger' || !document.storageKey) {
    return response.status(404).json({ error: 'Dokumen backend tidak ditemukan.' });
  }
  let bytes;
  try {
    bytes = await readLimitedRequest(request, documentMaxFileSize);
    validateStoredFile({
      fileName: decodeURIComponent(request.get('x-file-name') || ''),
      mimeType: request.get('content-type'), bytes, maxBytes: documentMaxFileSize
    });
    verifyDocumentBytes(document, bytes);
  } catch (error) {
    if (error instanceof DocumentUploadError) {
      return response.status(error.status).json({ error: error.message });
    }
    if (error instanceof URIError) {
      return response.status(400).json({ error: 'Nama berkas tidak valid.' });
    }
    if (error instanceof DocumentStorageError) {
      return response.status(error.code === 'DOCUMENT_TOO_LARGE' ? 413 : 400).json({
        error: error.code === 'DOCUMENT_INTEGRITY_ERROR'
          ? 'Berkas berbeda dari lampiran asli. Pilih file asli yang sama; rincian nota tidak diubah.'
          : error.message
      });
    }
    throw error;
  }
  try {
    await withTransaction(async connection => {
      await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
      const state = await readCollections(connection);
      const current = (state.documents || []).find(item => item.id === document.id);
      if (!current || current.storageKey !== document.storageKey || current.sha256 !== document.sha256) {
        throw new DocumentUploadError('Dokumen telah berubah atau dihapus. Muat ulang halaman.', 409);
      }
      await documentStorage.save(current.storageKey, bytes, current.sha256);
      await saveDocumentBackup(connection, current, bytes);
    });
  } catch (error) {
    if (error instanceof DocumentUploadError) {
      return response.status(error.status).json({ error: error.message });
    }
    console.error('Backend document restoration failed:', error?.code || 'DATABASE_ERROR');
    return response.status(500).json({ error: 'Pemulihan lampiran atau cadangan MySQL belum selesai. Silakan coba lagi; rincian nota tidak diubah.' });
  }
  response.json({ success: true });
}));

app.delete('/api/documents/:id', requireUser, asyncRoute(async (request, response) => {
  if (!canManageDocuments(request.user)) {
    return response.status(403).json({ error: 'Tidak memiliki izin menghapus dokumen.' });
  }
  const document = (getCollection('documents') || []).find(item => item.id === request.params.id);
  if (!document) return response.status(404).json({ error: 'Dokumen tidak ditemukan.' });
  if (document.jenis === 'Nota' &&
      (!userHasPermission(request.user, 'manageInventory') ||
       (document.status !== 'Draft' && !userHasPermission(request.user, 'systemSettings')))) {
    return response.status(403).json({ error: 'Nota belanja hanya dapat dihapus oleh role berwenang; nota final memerlukan otorisasi administrator.' });
  }
  if (document.storageBackend !== 'hostinger' || !document.storageKey) {
    return response.status(400).json({ error: 'Dokumen lama harus dihapus melalui alur arsip yang tersedia.' });
  }
  let preparedFile;
  try {
    const bytes = await readDocumentWithBackup(documentStorage, db, document);
    await documentStorage.save(document.storageKey, bytes, document.sha256);
    preparedFile = await documentStorage.prepareDelete(document.storageKey);
  } catch (error) {
    if (error instanceof DocumentStorageError) {
      console.error('Backend document deletion could not stage file:', error.code);
      return response.status(500).json({
        error: 'Berkas tidak dapat dipersiapkan untuk penghapusan. Data arsip tidak diubah.'
      });
    }
    throw error;
  }
  const timestamp = new Date();
  const auditLog = documentAuditRecord(request.user, document, timestamp, request.ip);
  auditLog.aktivitas = 'Hapus Dokumen Backend';
  auditLog.detail = `Menghapus ${document.judul} (${document.nomorDokumen}) dari penyimpanan backend.`;
  let metadataDeleted = false;
  let deletionResult;
  try {
    const result = await persistHostDocumentDeletion(document.id, auditLog);
    if (!result.deleted) {
      await documentStorage.restoreDelete(preparedFile);
      return response.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    }
    metadataDeleted = true;
    deletionResult = result;
    await refreshCollections();
  } catch (error) {
    if (metadataDeleted) {
      console.error('Backend document cache refresh failed after metadata deletion:', error?.code || 'DATABASE_ERROR');
      return response.status(500).json({ error: 'Metadata arsip telah dihapus, tetapi cache belum diperbarui. Muat ulang halaman atau hubungi administrator.' });
    }
    try {
      await documentStorage.restoreDelete(preparedFile);
    } catch (restoreError) {
      console.error('Backend document rollback failed:', restoreError?.code || 'FILESYSTEM_ERROR');
      return response.status(500).json({
        error: 'Penghapusan gagal dan pemulihan berkas otomatis tidak berhasil. Hubungi administrator.'
      });
    }
    console.error('Backend document deletion failed:', error?.code || 'DATABASE_ERROR');
    return response.status(500).json({
      error: 'Penghapusan dokumen gagal. Metadata arsip tidak diubah dan berkas telah dipulihkan.'
    });
  }
  try {
    await documentStorage.commitDelete(preparedFile);
  } catch (error) {
    console.error('Backend document cleanup failed after metadata deletion:', error?.code || 'FILESYSTEM_ERROR');
    return response.status(500).json({
      error: 'Metadata arsip telah dihapus, tetapi berkas sementara tidak dapat dibersihkan. Hubungi administrator.'
    });
  }
  return response.json({ success: true, auditLog, revision: deletionResult.revision });
}));

const webChatAiConfig = getWhatsAppConfig();
const webChatConfig = { ...webChatAiConfig, ...getWebChatConfig(process.env, webChatAiConfig) };
if (webChatConfig.n8nChatConfigurationError) {
  console.error(`Web chat integration disabled: ${webChatConfig.n8nChatConfigurationError}`);
}
const webChat = createWebChat({
  config: webChatConfig,
  getCollection,
  userHasPermission,
  getOwnedRequestIds: userId => whatsapp.store.listOwnedRequestIds(userId)
});
const webChatHits = new Map();

app.post('/api/ai/chat', requireUser, asyncRoute(async (request, response) => {
  const now = Date.now();
  const recent = (webChatHits.get(request.user.id) || []).filter(time => now - time < 60000);
  if (recent.length >= 15) {
    return response.status(429).json({ error: 'Terlalu banyak pertanyaan dalam waktu singkat. Tunggu sebentar lalu coba lagi.' });
  }
  recent.push(now);
  webChatHits.set(request.user.id, recent);

  const result = await webChat.answer(request.user, request.body?.messages);
  if (result.reply) return response.json({ reply: result.reply });
  const [status, message] = WEB_CHAT_ERRORS[result.error] || WEB_CHAT_ERRORS.upstream;
  return response.status(status).json({ error: message, code: result.error });
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
  const state = JSON.parse(JSON.stringify(submittedState));
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
      const requestNumberAssignments = assignNewRequestNumbers(currentState.requests, state.requests);
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
          requestNumbers: requestNumberAssignments.assignedNumbers
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
    response.status(400).json({ error: 'Perubahan data gagal disimpan. Periksa kembali data dan coba lagi.' });
  } finally {
    if (!transactionMs && transactionStartedAt) transactionMs = Date.now() - transactionStartedAt;
    const legacyWriteCount = legacyCollectionsWritten == null ? 'n/a' : legacyCollectionsWritten;
    console.info(`[performance] state_write backend=${dataBackend} status=${response.statusCode} transaction_ms=${transactionMs} snapshot_read_ms=${stateReadMs} persistence_ms=${persistenceMs} account_profile_sync_ms=${accountProfileSyncMs} legacy_collections_written=${legacyWriteCount} request_bytes=${Number(request.get('content-length') || 0)}`);
  }
}));

app.post('/api/whatsapp/request-events', performanceTiming('POST /api/whatsapp/request-events'), requireUser, asyncRoute(async (request, response) => {
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

  const notificationEventId = eventId;
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
    if (result.success) {
      return response.json({
        success: true,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        warning: result.error
      });
    }
    return response.status(502).json({
      success: false,
      sentCount: result.sentCount,
      error: result.error || 'Permohonan berhasil disimpan, tetapi WhatsApp service temporarily unavailable.'
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
  if (finalStatus === 'sent') return response.json({ success: true, sentCount });
  return response.status(502).json({
    success: false,
    sentCount,
    error: 'Permohonan berhasil diproses, tetapi WhatsApp service temporarily unavailable.'
  });
}));

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(root, 'dist');
  app.use('/api', (_request, response) => response.status(404).json({ error: 'Endpoint API tidak ditemukan.' }));
  app.use(express.static(dist));
  app.get('*', (_request, response) => response.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom'
  });
  app.use('/api', (_request, response) => response.status(404).json({ error: 'Endpoint API tidak ditemukan.' }));
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

const server = app.listen(port, host, () => {
  console.log(`SIMAN server listening on http://${host}:${port}`);
  console.log(`MySQL database connected: ${dbHost}:${dbPort}/${dbName}`);
});

server.on('error', error => {
  console.error('HTTP server failed to start:', error instanceof Error ? error.message : error);
  void db.end().finally(() => { process.exitCode = 1; });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      void db.end().finally(() => { process.exit(0); });
    });
  });
}
