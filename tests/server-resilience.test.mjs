// Pengaman regresi untuk mekanisme anti "server tidak merespon":
// batas waktu permintaan, pembatas pekerjaan berat, statistik pool, dan pencatatan
// permintaan lambat. Semua memakai request/response tiruan agar tidak butuh database.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  createConcurrencyLimiter,
  createRequestDeadlineMiddleware,
  createSlowRequestRecorder,
  getDatabasePoolStats,
  isPoolQueueLimitError
} from '../server/observability.mjs';

function fakeResponse() {
  const response = new EventEmitter();
  response.headersSent = false;
  response.statusCode = 200;
  response.locals = {};
  response.payload = null;
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.set = () => response;
  response.json = (payload) => {
    response.headersSent = true;
    response.payload = payload;
    setImmediate(() => response.emit('finish'));
    return response;
  };
  response.finish = (statusCode = 200) => {
    response.statusCode = statusCode;
    response.headersSent = true;
    setImmediate(() => response.emit('finish'));
  };
  return response;
}

function fakeRequest(path = '/api/test', method = 'GET') {
  const request = new EventEmitter();
  request.method = method;
  request.path = path;
  request.originalUrl = path;
  request.url = path;
  return request;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Batas waktu permintaan tidak boleh lebih kecil dari 1 detik (lihat clampInteger di
// observability.mjs), jadi test memakai durasi minimum yang sah + margin toleransi.
test('request deadline answers 504 instead of hanging when a handler never completes', async () => {
  const middleware = createRequestDeadlineMiddleware({ defaultTimeoutMs: 1000 });
  const response = fakeResponse();
  let handlerStarted = false;
  await middleware(fakeRequest('/api/slow'), response, () => {
    handlerStarted = true;
    // handler sengaja tidak pernah menyelesaikan respons
  });
  assert.equal(handlerStarted, true);
  assert.equal(response.statusCode, 200);
  await delay(600);
  assert.equal(response.statusCode, 200, 'batas minimum 1 detik belum terlewat');
  await delay(700);
  assert.equal(response.statusCode, 504);
  assert.equal(response.payload.code, 'REQUEST_TIMEOUT');
  assert.match(response.payload.error, /belum pasti tersimpan/);
});

test('request deadline stops counting once the response is finished', async () => {
  const middleware = createRequestDeadlineMiddleware({ defaultTimeoutMs: 1000 });
  const response = fakeResponse();
  await middleware(fakeRequest(), response, () => {});
  response.finish(200);
  await delay(1300);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload, null);
});

test('request deadline honours per-path overrides such as the long state sync', async () => {
  const middleware = createRequestDeadlineMiddleware({
    defaultTimeoutMs: 1000,
    overrides: [{ match: (request) => request.path === '/api/state', timeoutMs: 2200 }]
  });
  const response = fakeResponse();
  await middleware(fakeRequest('/api/state', 'PUT'), response, () => {});
  await delay(1300);
  assert.equal(response.statusCode, 200, 'jalur state memakai timeout panjang, bukan default');
  await delay(1100);
  assert.equal(response.statusCode, 504, 'batas panjang tetap ditegakkan, tidak menggantung');
});

test('concurrency limiter queues heavy writes and sheds overflow with 503', async () => {
  const limiter = createConcurrencyLimiter({ name: 'unit_write', limit: 1, maxPending: 1 });
  const gates = [];
  const admitted = [];

  function attempt() {
    const response = fakeResponse();
    let admittedNow = false;
    let settled;
    const result = new Promise((resolve) => {
      settled = resolve;
    });
    limiter(fakeRequest('/api/state', 'PUT'), response, () => {
      admittedNow = true;
      admitted.push(response);
      gates.push(() => {
        response.finish(200);
        settled({ status: 200 });
      });
    });
    if (!admittedNow) settled({ status: response.statusCode, payload: response.payload });
    return result;
  }

  const first = attempt();
  const second = attempt();
  const third = await attempt();

  assert.deepEqual(
    { active: limiter.stats().active, pending: limiter.stats().pending, admitted: admitted.length },
    { active: 1, pending: 1, admitted: 1 }
  );
  assert.equal(third.status, 503, 'permintaan ketiga ditolak karena antrian penuh');
  assert.equal(third.payload.code, 'SERVER_BUSY');

  gates[0]();
  await delay(20);
  await first;
  assert.equal(limiter.stats().active, 1, 'slot pindah ke permintaan yang mengantre');
  assert.equal(limiter.stats().pending, 0);

  gates[1]();
  await delay(20);
  await second;
  assert.equal(limiter.stats().active, 0);
  assert.equal(limiter.stats().maxActive, 1);
});

test('pool statistics read mysql2 RingQueue fields', () => {
  const ringQueue = (size) => ({ length: size, size: () => size });
  const stats = getDatabasePoolStats(
    {
      pool: {
        _allConnections: ringQueue(6),
        _freeConnections: ringQueue(2),
        _connectionQueue: ringQueue(11)
      }
    },
    { connectionLimit: 10, queueLimit: 50 }
  );
  assert.deepEqual(stats, {
    connectionLimit: 10,
    queueLimit: 50,
    total: 6,
    idle: 2,
    busy: 4,
    queued: 11
  });
});

test('pool statistics stay null for an unexpected shape instead of throwing', () => {
  assert.equal(getDatabasePoolStats(undefined).total, null);
  assert.equal(getDatabasePoolStats({ pool: {} }).busy, null);
});

test('queue saturation errors are recognised by message and code', () => {
  assert.equal(isPoolQueueLimitError(new Error('Queue limit reached.')), true);
  assert.equal(isPoolQueueLimitError({ code: 'ER_POOL_QUEUE_LIMIT' }), true);
  assert.equal(isPoolQueueLimitError(new Error('connect ECONNREFUSED')), false);
  assert.equal(isPoolQueueLimitError(undefined), false);
});

test('slow request recorder keeps bounded recent entries', async () => {
  // Ambang batas minimum yang sah adalah 250 ms; nilai di bawahnya dipatok, bukan diabaikan.
  const recorder = createSlowRequestRecorder({ thresholdMs: 50, keep: 2 });
  assert.equal(recorder.stats().threshold_ms, 250);
  for (let index = 0; index < 4; index += 1) {
    const response = fakeResponse();
    await recorder.middleware(fakeRequest(`/api/slow-${index}`), response, () => {});
    await delay(320);
    response.finish(200);
    await delay(10);
  }
  const stats = recorder.stats();
  assert.ok(stats.recent.length <= 2, `recent=${stats.recent.length}`);
  assert.equal(stats.recent.length, 2, 'semua permintaan lambat tercatat sampai batas keep');
  assert.equal(stats.totals.length, 4, 'penghitung per endpoint tetap menyimpan semua label');
});

test('fast requests are not recorded', async () => {
  const recorder = createSlowRequestRecorder({ thresholdMs: 500 });
  const response = fakeResponse();
  await recorder.middleware(fakeRequest('/api/health'), response, () => {});
  response.finish(200);
  await delay(20);
  assert.equal(recorder.stats().recent.length, 0);
});
