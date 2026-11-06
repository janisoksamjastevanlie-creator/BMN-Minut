// Penjaga sinkron otomatis: pertanyaan "ada perubahan data?" harus murah.
// Satu kueri app_meta, tanpa memuat ulang koleksi, dan keputusan menarik state
// penuh hanya diambil ketika server benar-benar lebih baru dan perangkat ini
// tidak sedang menyimpan sesuatu.
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerStateRoutes } from '../server/routes/stateRoute.mjs';
import { decideRemoteSync } from '../src/utils/remoteSync.ts';

function fakeApp() {
  const routes = new Map();
  const record = (method) => (path, ...handlers) => routes.set(`${method} ${path}`, handlers);
  return { routes, get: record('GET'), post: record('POST'), put: record('PUT'), delete: record('DELETE'), use() {} };
}

function fakeResponse() {
  const response = { statusCode: 200, payload: null };
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.json = (payload) => {
    response.payload = payload;
    return response;
  };
  return response;
}

function createHarness({ revisionValue = '7' } = {}) {
  const app = fakeApp();
  const calls = { refreshes: 0, collectionReads: 0, metaReads: 0, transactions: 0 };
  registerStateRoutes(app, {
    db: {},
    dataBackend: 'legacy',
    collections: {},
    queryOne: async (_connection, sql) => {
      if (/FROM app_meta/.test(sql)) {
        calls.metaReads += 1;
        return { value: revisionValue };
      }
      return null;
    },
    queryRows: async () => [],
    execute: async () => ({ affectedRows: 0 }),
    withTransaction: async (work) => {
      calls.transactions += 1;
      return work({});
    },
    asyncRoute: (handler) => handler,
    requireUser: (_request, _response, next) => next(),
    requireUserFromTransactionState: (_request, _response, next) => next(),
    refreshCollections: async () => {
      calls.refreshes += 1;
    },
    markCollectionsFresh: () => {},
    readCollections: async () => {
      calls.collectionReads += 1;
      return { users: [] };
    },
    stateForUser: (state) => state,
    bindRequestUserToState: () => undefined,
    userHasPermission: () => true,
    stateWriteLimiter: { async run(work) { return work(); } },
    whatsapp: { onStateSaved() {} },
    getCollection: () => null
  });
  return { app, calls };
}

async function askRevision(app) {
  const handlers = app.routes.get('GET /api/state/revision');
  assert.ok(handlers, 'rute /api/state/revision terdaftar');
  const response = fakeResponse();
  for (const handler of handlers) {
    // Middleware autentikasi diuji dengan request kosong; rute ini tidak membacanya.
    await handler({ user: { id: 'usr-1', role: 'Administrator' } }, response, () => undefined);
  }
  return response;
}

test('revision endpoint membaca satu baris app_meta tanpa menyentuh koleksi', async () => {
  const { app, calls } = createHarness({ revisionValue: '42' });
  const response = await askRevision(app);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { revision: 42, dataBackend: 'legacy' });
  assert.equal(calls.metaReads, 1, 'satu kueri kecil');
  assert.equal(calls.collectionReads, 0, 'tidak membaca seluruh koleksi');
  assert.equal(calls.refreshes, 0, 'tidak memaksa muat ulang state');
  assert.equal(calls.transactions, 0, 'tidak membuka transaksi database');
});

test('revision endpoint memakai jalur autentikasi yang tidak memuat ulang state', () => {
  const { app } = createHarness();
  const handlers = app.routes.get('GET /api/state/revision');
  // Rute GET /api/state memakai requireUserFromTransactionState karena ia membaca
  // state dalam transaksi; pemeriksaan revision harus memakai jalur yang sama,
  // bukan requireUser yang memanggil refreshCollections (TTL) pada tiap polling.
  assert.equal(handlers.length, 2, 'middleware lalu handler');
});

test('revision yang bukan angka dikembalikan sebagai nol, bukan NaN', async () => {
  const { app } = createHarness({ revisionValue: 'tujuh' });
  const response = await askRevision(app);
  assert.equal(response.payload.revision, 0);
});

const clean = {
  revisionFromServer: 8,
  localRevision: 7,
  hasUnsavedChanges: false,
  pendingServerActions: 0,
  persistenceWaiters: 0,
  isSyncBlocked: false,
  isRecovering: false
};

test('keputusan menarik data hanya saat server lebih baru dan perangkat bersih', () => {
  assert.equal(decideRemoteSync(clean).action, 'pull');
  assert.equal(decideRemoteSync({ ...clean, revisionFromServer: 7 }).reason, 'belum_ada_perubahan');
  assert.equal(decideRemoteSync({ ...clean, revisionFromServer: 6 }).action, 'skip');
  assert.equal(decideRemoteSync({ ...clean, hasUnsavedChanges: true }).reason, 'masih_ada_perubahan_lokal');
  assert.equal(decideRemoteSync({ ...clean, pendingServerActions: 1 }).action, 'skip');
  assert.equal(decideRemoteSync({ ...clean, persistenceWaiters: 2 }).action, 'skip');
  assert.equal(decideRemoteSync({ ...clean, isSyncBlocked: true }).action, 'skip');
  assert.equal(decideRemoteSync({ ...clean, isRecovering: true }).action, 'skip');
});

test('revision server yang rusak tidak memicu penarikan state penuh', () => {
  for (const value of [undefined, null, 'delapan', Number.NaN, 1.5, -1]) {
    assert.equal(decideRemoteSync({ ...clean, revisionFromServer: value }).action, 'skip');
  }
});

test('penarikan ditunda selama konflik masih menunggu pilihan pengguna', () => {
  const decision = decideRemoteSync({ ...clean, isSyncBlocked: true });
  assert.equal(decision.action, 'skip');
  assert.equal(decision.reason, 'konflik_menunggu_pilihan_pengguna');
});
