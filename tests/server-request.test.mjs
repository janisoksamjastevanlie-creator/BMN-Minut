import assert from 'node:assert/strict';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import {
  UNREADABLE_REQUEST_BODY_MESSAGE,
  apiFailureMessage,
  fetchWithTimeout,
  isTransientApiFailure,
  sendJson
} from '../src/utils/serverRequest.ts';

const largePayload = () => ({ state: { auditLogs: Array.from({ length: 2000 }, (_, index) => ({ id: `log-${index}`, detail: 'x'.repeat(40) })) }, revision: 1 });

test('large JSON uploads are gzip-compressed and readable by the server', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, headers: options.headers, bodyBytes: options.body.byteLength });
    const decoded = JSON.parse(gunzipSync(Buffer.from(options.body)).toString('utf8'));
    return new Response(JSON.stringify({ revision: decoded.revision + 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const payload = largePayload();
    const response = await sendJson('/api/state', 'PUT', payload);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { revision: 2 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['Content-Encoding'], 'gzip');
    assert.ok(calls[0].bodyBytes < JSON.stringify(payload).length / 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('falls back to an uncompressed upload when the server cannot read gzip bodies', async () => {
  const originalFetch = globalThis.fetch;
  const encodings = [];
  globalThis.fetch = async (_url, options) => {
    encodings.push(options.headers['Content-Encoding'] || 'identity');
    if (options.headers['Content-Encoding'] === 'gzip') {
      return new Response(JSON.stringify({ error: UNREADABLE_REQUEST_BODY_MESSAGE }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ revision: 5 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const first = await sendJson('/api/state', 'PUT', largePayload());
    assert.equal(first.status, 200);
    const second = await sendJson('/api/state', 'PUT', largePayload());
    assert.equal(second.status, 200);
    assert.deepEqual(encodings, ['gzip', 'identity', 'identity']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('signal timeout errors are treated as transient and shown with a safe message', () => {
  const error = new Error('signal timed out');

  assert.equal(isTransientApiFailure(error), true);
  assert.equal(apiFailureMessage(error),
    'Server terlalu lama merespons. Perubahan belum dapat dipastikan tersimpan; periksa data server sebelum mengulangi transaksi.');
});

test('GET requests retry when the transport reports signal timed out as a generic error', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    throw new Error('signal timed out');
  };

  try {
    await assert.rejects(
      fetchWithTimeout('/api/state', {}, { timeoutMs: 100, retryDelayMs: 0 }),
      /signal timed out/
    );
    assert.equal(attempts, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
