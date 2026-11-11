// Ubah kata sandi mandiri: verifikasi sandi lama, penolakan input tidak sah,
// pembatasan percobaan, serta pencabutan sesi lain sambil mempertahankan sesi aktif.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { registerAuthRoutes } from '../server/routes/auth.mjs';

const scryptAsync = (password, salt, keylen) =>
  new Promise((resolve, reject) => crypto.scrypt(password, salt, keylen, (error, result) => (error ? reject(error) : resolve(result))));

function fakeApp() {
  const routes = new Map();
  const record = (method) => (path, ...handlers) => routes.set(`${method} ${path}`, handlers);
  return { routes, get: record('GET'), post: record('POST'), put: record('PUT'), delete: record('DELETE'), use() {} };
}

function fakeResponse() {
  const response = { statusCode: 200, payload: null, headers: {} };
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.setHeader = (name, value) => {
    response.headers[name] = value;
  };
  response.json = (payload) => {
    response.payload = payload;
    return response;
  };
  return response;
}

const CURRENT_PASSWORD = 'SandiLama123!';
const CURRENT_TOKEN = 'token-sesi-aktif';

function createHarness() {
  const salt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync(CURRENT_PASSWORD, salt, 64).toString('hex');
  const account = { salt: salt.toString('hex'), password_hash: passwordHash };
  const app = fakeApp();
  const calls = { updates: [], sessionDeletes: [], otherSessionDeletes: [] };

  registerAuthRoutes(app, {
    db: {},
    queryOne: async (_db, sql) => (/SELECT salt, password_hash FROM auth_users/.test(sql) ? account : null),
    execute: async (_db, sql, params) => {
      if (/UPDATE auth_users SET salt/.test(sql)) calls.updates.push(params);
      else if (/DELETE FROM sessions WHERE user_id = \? AND token_hash <> \?/.test(sql)) calls.otherSessionDeletes.push(params);
      else if (/DELETE FROM sessions WHERE user_id = \?/.test(sql)) calls.sessionDeletes.push(params);
    },
    asyncRoute: (handler) => handler,
    scryptAsync,
    requireCloudflareAccess: (_request, _response, next) => next(),
    requireUser: (request, _response, next) => {
      request.user = { id: 'usr-1', role: 'Operator' };
      next();
    },
    refreshCollections: async () => {},
    diagnostics: () => ({}),
    loadSnapshot: () => ({}),
    getCollection: () => [],
    accessIdentityMatches: () => true,
    hashToken: (token) => crypto.createHash('sha256').update(token).digest('hex'),
    readCookie: () => CURRENT_TOKEN,
    secureCookie: () => false
  });

  return { app, calls };
}

async function changePassword(app, body) {
  const handlers = app.routes.get('PUT /api/auth/account/password');
  const request = { body, user: undefined, headers: {}, params: {} };
  const response = fakeResponse();
  handlers[0](request, response, () => {});
  await handlers[handlers.length - 1](request, response);
  return response;
}

test('menolak perubahan bila kata sandi saat ini salah', async () => {
  const { app, calls } = createHarness();
  const response = await changePassword(app, { currentPassword: 'SalahSekali123!', newPassword: 'SandiBaru12345!' });
  assert.equal(response.statusCode, 401, JSON.stringify(response.payload));
  assert.equal(calls.updates.length, 0, 'kata sandi tidak boleh tersimpan saat verifikasi gagal');
});

test('menyimpan kata sandi baru dan mencabut sesi perangkat lain', async () => {
  const { app, calls } = createHarness();
  const newPassword = 'SandiBaruSekali99!';
  const response = await changePassword(app, { currentPassword: CURRENT_PASSWORD, newPassword });
  assert.equal(response.statusCode, 200, JSON.stringify(response.payload));

  assert.equal(calls.updates.length, 1);
  const [storedSaltHex, storedHashHex, userId] = calls.updates[0];
  assert.equal(userId, 'usr-1');
  const expectedHash = crypto.scryptSync(newPassword, Buffer.from(storedSaltHex, 'hex'), 64).toString('hex');
  assert.equal(storedHashHex, expectedHash, 'hash tersimpan harus cocok dengan kata sandi baru');

  assert.equal(calls.otherSessionDeletes.length, 1);
  const [sessionUserId, currentTokenHash] = calls.otherSessionDeletes[0];
  assert.equal(sessionUserId, 'usr-1');
  assert.equal(currentTokenHash, crypto.createHash('sha256').update(CURRENT_TOKEN).digest('hex'), 'sesi aktif tidak ikut dicabut');
});

test('menolak kata sandi baru yang terlalu pendek', async () => {
  const { app, calls } = createHarness();
  const response = await changePassword(app, { currentPassword: CURRENT_PASSWORD, newPassword: 'pendek' });
  assert.equal(response.statusCode, 400, JSON.stringify(response.payload));
  assert.equal(calls.updates.length, 0);
});

test('menolak kata sandi baru yang sama dengan kata sandi saat ini', async () => {
  const { app, calls } = createHarness();
  const response = await changePassword(app, { currentPassword: CURRENT_PASSWORD, newPassword: CURRENT_PASSWORD });
  assert.equal(response.statusCode, 400, JSON.stringify(response.payload));
  assert.equal(calls.updates.length, 0);
});

test('membatasi percobaan setelah sepuluh kegagalan verifikasi', async () => {
  const { app } = createHarness();
  let lastStatus = 0;
  for (let index = 0; index < 12; index += 1) {
    const response = await changePassword(app, { currentPassword: `Salah-${index}-Panjang!`, newPassword: 'SandiBaru12345!' });
    lastStatus = response.statusCode;
  }
  assert.equal(lastStatus, 429, 'kegagalan berulang harus dibatasi');
});
