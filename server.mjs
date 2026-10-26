import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { promisify } from 'node:util';
const scryptAsync = promisify(crypto.scrypt);
import { createDatabasePool, queryRows, queryOne, execute, withTransaction as withPoolTransaction } from './server/db.mjs';
import { measureExternalService } from './server/serviceMetrics.mjs';
import { currentMakassarDate } from './server/datetime.mjs';
import {
  asyncRoute,
  hashToken,
  readCookie,
  secureCookie,
  sameOrigin,
  accessIdentityMatches as accessIdentityMatchesRaw,
  createAuthMiddleware
} from './server/middleware.mjs';
import { permissionsByCollection, collections, createStateHelpers } from './server/collections.mjs';
import { createHostDocumentPersistence } from './server/documentsPersistence.mjs';
import {
  createTwilioRequestNotification
} from './server/whatsappRequestEvents.mjs';
import { registerAuthRoutes } from './server/routes/auth.mjs';
import { registerMediaRoutes } from './server/routes/media.mjs';
import { registerStateRoutes } from './server/routes/stateRoute.mjs';
import { registerRequestRoutes } from './server/routes/requests.mjs';
import { registerDocumentRoutes } from './server/routes/documents.mjs';
import { registerAiRoutes } from './server/routes/ai.mjs';
import { registerWhatsAppEventRoutes } from './server/routes/whatsappEvents.mjs';
import { performanceTiming } from './performanceMetrics.mjs';
import { createCloudflareAccessMiddleware, createCloudflareAccessVerifier } from './cloudflareAccess.mjs';
import { assertOperationalSchema } from './operationalStore.mjs';
import { createWhatsAppService } from './whatsapp/service.mjs';
import { getWhatsAppConfig } from './whatsapp/config.mjs';
import { createWebChat } from './ai/webchat.mjs';
import { getWebChatConfig } from './ai/webchatConfig.mjs';
import { createN8nIntegration } from './automation/n8n/integration.mjs';
import { createDocumentStorage } from './documentStorage.mjs';
import { securityHeaders } from './securityHeaders.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, '.env') });

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
const UNREADABLE_REQUEST_BODY_MESSAGE = 'Format data yang dikirim tidak dapat dibaca server.';
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

const db = createDatabasePool({
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
  throw new Error('Could not connect to or validate the configured database.', { cause: error });
}


const withTransaction = callback => withPoolTransaction(db, callback);

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
  const adminHash = await scryptAsync(adminPassword, adminSalt, 64);
  await execute(db, `
    INSERT IGNORE INTO auth_users (id, nip, profile_json, salt, password_hash)
    VALUES (?, ?, ?, ?, ?)
  `, [adminProfile.id, adminNip, JSON.stringify(adminProfile), adminSalt.toString('hex'), adminHash.toString('hex')]);
  await execute(db, 'DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
}

function accessIdentityMatches(user, claims, users) {
  return accessIdentityMatchesRaw(user, claims, users, cloudflareAccessRequired);
}
const {
  collectionCache,
  readCollections,
  refreshCollections,
  getCollection,
  userHasPermission,
  stateForUser
} = createStateHelpers({ db, dataBackend });

const { sendTwilioRequestEvent } = createTwilioRequestNotification({ db });

const { persistHostDocument, persistHostDocumentDeletion } = createHostDocumentPersistence({
  withTransaction,
  queryOne,
  execute,
  readCollections,
  dataBackend
});

await refreshCollections();

const {
  requireUser,
  requireUserFromTransactionState,
  bindRequestUserToState
} = createAuthMiddleware({
  db,
  queryOne,
  accessIdentityMatches: (user, claims, users) => accessIdentityMatches(user, claims, users, cloudflareAccessRequired),
  refreshCollections,
  getCollection,
  requireCloudflareAccess,
  cloudflareAccessRequired
});

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

// Proxy (Hostinger/CDN) meneruskan protokol asli via X-Forwarded-Proto.
// Ini membuat req.protocol akurat untuk redirect kanonik.
app.set('trust proxy', true);

// Redirect kanonik: www -> non-www untuk domain produksi.
app.use((request, response, next) => {
  const hostHeader = request.headers.host || '';
  const host = hostHeader.split(':')[0].toLowerCase();

  const shouldRedirectToApex =
    host === 'www.bmnbpsminut.online' || host.endsWith('.hostingersite.com');

  if (shouldRedirectToApex) {
    // Paksa HTTPS untuk host kanonik.
    const target = `https://bmnbpsminut.online${request.originalUrl}`;

    // 308 menjaga method (mis. POST) agar tidak berubah menjadi GET.
    return response.redirect(308, target);
  }

  next();
});
// Webhook harus dipasang sebelum express.json agar body mentah tersedia untuk verifikasi signature.
app.use(whatsapp.webhook);

// Security headers dasar (setara subset helmet) - diterapkan sebelum parser body.
app.use(securityHeaders);

app.use(express.json({ limit: '25mb' }));
app.use(sameOrigin);
app.use(whatsapp.api);

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

const context = {
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
  measureExternalService,
  currentMakassarDate,
  refreshCollections,
  readCollections,
  getCollection,
  userHasPermission,
  stateForUser,
  requireUser,
  requireUserFromTransactionState,
  bindRequestUserToState,
  requireCloudflareAccess,
  hashToken,
  readCookie,
  secureCookie,
  accessIdentityMatches,
  scryptAsync,
  performanceTiming,
  whatsapp,
  n8nIntegration,
  whatsappProvider,
  whatsappPhoneNumberId,
  whatsappAccessToken,
  whatsappRecipientNumber,
  webChat,
  webChatHits,
  documentStorage,
  documentMaxFileSize,
  documentMaxFileSizeMb,
  persistHostDocument,
  persistHostDocumentDeletion,
  sendTwilioRequestEvent
};

registerAuthRoutes(app, context);
registerMediaRoutes(app, context);
registerStateRoutes(app, context);
registerRequestRoutes(app, context);
registerDocumentRoutes(app, context);
registerAiRoutes(app, context);
registerWhatsAppEventRoutes(app, context);

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
  if (response.headersSent) return;
  // Kesalahan body-parser (JSON rusak, body terkompresi tidak terbaca, terlalu besar) membawa
  // status 4xx dan bukan kesalahan server; jangan laporkan sebagai 500.
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return response.status(413).json({ error: 'Ukuran data yang dikirim melebihi batas server.' });
  }
  if (error?.type === 'entity.parse.failed' || error?.type === 'encoding.unsupported' ||
      error?.status === 400 || error?.status === 415) {
    return response.status(400).json({ error: UNREADABLE_REQUEST_BODY_MESSAGE });
  }
  console.error(error);
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


