// Penjaga rute login: percobaan yang gagal tidak boleh memaksa pembacaan ulang
// seluruh state, dan pembatas percobaan tidak boleh bisa dilewati hanya dengan
// menuliskan alamat palsu pada X-Forwarded-For.
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

function fakeRequest(body, ip) {
  return { body, ip, headers: {}, socket: { remoteAddress: ip }, get: () => undefined, method: 'POST', path: '/api/auth/login' };
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

async function login(app, body, ip) {
  const handlers = app.routes.get('POST /api/auth/login');
  // asyncRoute dan requireCloudflareAccess dalam konteks uji ini hanya meneruskan.
  const handler = handlers[handlers.length - 1];
  const response = fakeResponse();
  await handler(fakeRequest(body, ip), response);
  return response;
}

function createHarness({ nip = '123456789012345678', password = 'rahasia-yang-kuat' } = {}) {
  const salt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const app = fakeApp();
  const calls = { refreshes: 0, inserts: 0 };
  const account = {
    id: 'usr-1',
    nip,
    salt: salt.toString('hex'),
    password_hash: passwordHash,
    profile_json: JSON.stringify({ id: 'usr-1', nama: 'Operator', role: 'Operator', statusAktif: true })
  };

  registerAuthRoutes(app, {
    db: {},
    queryOne: async (_db, sql) => (/FROM auth_users/.test(sql) ? account : null),
    execute: async (_db, sql) => {
      if (/INSERT INTO sessions/.test(sql)) calls.inserts += 1;
    },
    asyncRoute: (handler) => handler,
    scryptAsync,
    requireCloudflareAccess: (_request, _response, next) => next(),
    requireUser: (_request, _response, next) => next(),
    refreshCollections: async () => {
      calls.refreshes += 1;
    },
    diagnostics: () => ({}),
    loadSnapshot: () => ({}),
    getCollection: () => [{ id: 'usr-1', nama: 'Operator', role: 'Operator' }],
    accessIdentityMatches: () => true,
    hashToken: (token) => crypto.createHash('sha256').update(token).digest('hex'),
    readCookie: () => undefined,
    secureCookie: () => false
  });

  return { app, calls, nip, password };
}

test('percobaan login yang gagal tidak memuat ulang state penuh', async () => {
  const { app, calls, nip } = createHarness();
  for (let index = 0; index < 5; index += 1) {
    const response = await login(app, { nip, password: `salah-${index}` }, '203.0.113.1');
    assert.equal(response.statusCode, 401);
  }
  assert.equal(calls.refreshes, 0, 'tebakan salah tidak boleh memicu pembacaan seluruh koleksi');
});

test('login yang berhasil memuat ulang state sebelum membaca profil', async () => {
  const { app, calls, nip, password } = createHarness();
  const response = await login(app, { nip, password }, '203.0.113.9');
  assert.equal(response.statusCode, 200, JSON.stringify(response.payload));
  assert.equal(calls.refreshes, 1);
  assert.equal(calls.inserts, 1);
});

test('pembatas per NIP menahan tebak-tebakan meski alamat berganti-ganti', async () => {
  const { app, nip } = createHarness();
  let lastStatus = 0;
  for (let index = 0; index < 26; index += 1) {
    // Setiap percobaan memakai alamat berbeda, seperti penyerang yang menulis
    // X-Forwarded-For palsu; tanpa pencatat per NIP pembatas tidak pernah aktif.
    const response = await login(app, { nip, password: `tebakan-${index}` }, `198.51.100.${index}`);
    lastStatus = response.statusCode;
  }
  assert.equal(lastStatus, 429, '25 kegagalan terkumpul pada satu NIP lalu dibatasi');
});

test('keberhasilan menghapus pencatat percobaan sehingga pengguna sah tidak ikut terkunci', async () => {
  const { app, nip, password } = createHarness();
  for (let index = 0; index < 4; index += 1) {
    await login(app, { nip, password: 'salah' }, '203.0.113.30');
  }
  const success = await login(app, { nip, password }, '203.0.113.31');
  assert.equal(success.statusCode, 200);
  // Setelah masuk, hitungan dinolkan: lima kegagalan berikutnya tetap dilayani 401,
  // bukan langsung 429 karena sisa hitungan lama.
  for (let index = 0; index < 5; index += 1) {
    const response = await login(app, { nip, password: 'salah-lagi' }, '203.0.113.32');
    assert.equal(response.statusCode, 401);
  }
});
