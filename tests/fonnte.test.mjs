import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getWhatsAppConfig } from '../whatsapp/config.mjs';
import { parseFonnteWebhookMessage, sendFonnteMessage } from '../whatsapp/fonnte.mjs';
import { createWhatsAppService } from '../whatsapp/service.mjs';

const sendConfig = {
  token: 'test-token',
  apiUrl: 'https://api.fonnte.com/send'
};

test('Fonnte config requires a token, HTTPS endpoint, and sufficiently long webhook secret', () => {
  const ready = getWhatsAppConfig({
    WHATSAPP_PROVIDER: 'fonnte',
    FONNTE_TOKEN: 'test-token',
    FONNTE_WEBHOOK_SECRET: 'a'.repeat(32)
  });
  assert.equal(ready.validProvider, true);
  assert.equal(ready.outboundConfigured, true);
  assert.equal(ready.inboundConfigured, true);

  const invalidEndpoint = getWhatsAppConfig({
    WHATSAPP_PROVIDER: 'fonnte',
    FONNTE_TOKEN: 'test-token',
    FONNTE_API_URL: 'http://example.invalid/send',
    FONNTE_WEBHOOK_SECRET: 'short'
  });
  assert.equal(invalidEndpoint.outboundConfigured, false);
  assert.equal(invalidEndpoint.inboundConfigured, false);
});

test('Fonnte webhook payload is normalized and gets a stable id without inboxid', () => {
  const payload = {
    sender: '081234567890',
    message: 'status permohonan',
    timestamp: 1_800_000_000,
    secret: 'not-used-here'
  };

  const first = parseFonnteWebhookMessage(payload);
  const second = parseFonnteWebhookMessage(payload);
  assert.equal(first.phone, '6281234567890');
  assert.equal(first.text, 'status permohonan');
  assert.equal(first.timestampMs, 1_800_000_000_000);
  assert.equal(first.messageId, second.messageId);
});

test('Fonnte webhook rejects malformed senders and missing timestamps', () => {
  assert.equal(parseFonnteWebhookMessage({ sender: '12345', message: 'hi', timestamp: Date.now() }), null);
  assert.equal(parseFonnteWebhookMessage({ sender: '6281234567890', message: 'hi' }), null);
  assert.equal(
    parseFonnteWebhookMessage({
      sender: '6281234567890',
      message: 'interactive',
      text: 'Status permohonan',
      timestamp: Date.now()
    }).text,
    'Status permohonan'
  );
});

test('Fonnte sends internationalized targets as form-data and recognizes provider acceptance', async () => {
  let call;
  const result = await sendFonnteMessage(sendConfig, '+62 812-3456-7890', 'Tes BMN', async (url, options) => {
    call = { url, options };
    return new Response(JSON.stringify({
      status: true,
      requestid: 'request-1',
      id: ['message-1'],
      detail: [{ processing: true, sent: false, failed: false }]
    }), { status: 200 });
  });

  assert.equal(call.url, sendConfig.apiUrl);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers.Authorization, sendConfig.token);
  assert.equal(call.options.body.get('target'), '6281234567890');
  assert.equal(call.options.body.get('message'), 'Tes BMN');
  assert.equal(Object.hasOwn(call.options.headers, 'Content-Type'), false);
  assert.equal(result.requestId, 'request-1');
  assert.deepEqual(result.messageIds, ['message-1']);
});

test('Fonnte rejection and transport errors do not expose credentials or provider response content', async () => {
  await assert.rejects(
    sendFonnteMessage(sendConfig, '6281234567890', 'Tes', async () =>
      new Response(JSON.stringify({ status: false, detail: 'sensitive provider response' }), { status: 200 })
    ),
    error => error.message === 'Fonnte API tidak menerima pesan.' && !error.message.includes(sendConfig.token)
  );
  await assert.rejects(
    sendFonnteMessage(sendConfig, '6281234567890', 'Tes', async () => {
      throw new Error(`transport leaked ${sendConfig.token}`);
    }),
    error => error.message === 'Fonnte API tidak dapat dihubungi.' && !error.message.includes(sendConfig.token)
  );
});

test('Fonnte rejects invalid recipient numbers before making a network call', async () => {
  let called = false;
  await assert.rejects(
    sendFonnteMessage(sendConfig, 'not-a-number', 'Tes', async () => { called = true; }),
    /Nomor tujuan tidak valid/
  );
  assert.equal(called, false);
});

test('Fonnte webhook checks its shared secret and processes an inbox message only once', async t => {
  const keys = ['WHATSAPP_PROVIDER', 'FONNTE_TOKEN', 'FONNTE_API_URL', 'FONNTE_WEBHOOK_SECRET'];
  const previousEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.WHATSAPP_PROVIDER = 'fonnte';
  process.env.FONNTE_TOKEN = 'test-token';
  process.env.FONNTE_API_URL = 'https://api.fonnte.com/send';
  process.env.FONNTE_WEBHOOK_SECRET = 'test-webhook-secret-with-32-chars';

  const processed = new Set();
  const metadata = new Map();
  const database = {
    async query() { return [[], []]; },
    async execute(sql, params = []) {
      if (sql.startsWith('SELECT value FROM app_meta')) {
        const value = metadata.get(params[0]);
        return [value === undefined ? [] : [{ value }], []];
      }
      if (sql.startsWith('INSERT IGNORE INTO whatsapp_processed_messages')) {
        const before = processed.size;
        processed.add(params[0]);
        return [{ affectedRows: processed.size - before }, []];
      }
      if (sql.startsWith('INSERT INTO app_meta')) {
        metadata.set(params[0], params[1]);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('FROM whatsapp_accounts WHERE phone')) return [[], []];
      return [{ affectedRows: 1 }, []];
    }
  };
  const service = await createWhatsAppService({
    db: database,
    getCollection: () => null,
    userHasPermission: () => false,
    requireUser: (_request, response) => response.sendStatus(401),
    refreshCollections: async () => {}
  });
  const app = express();
  app.use(service.webhook);
  const server = http.createServer(app);
  const originalFetch = globalThis.fetch;
  let outboundCount = 0;
  globalThis.fetch = async (url, options) => {
    if (url === sendConfig.apiUrl) {
      outboundCount += 1;
      assert.equal(options.headers.Authorization, 'test-token');
      return new Response(JSON.stringify({ status: true, id: ['sent-1'] }), { status: 200 });
    }
    return originalFetch(url, options);
  };

  t.after(async () => {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    await new Promise(resolve => server.close(resolve));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/api/whatsapp/webhook`;
  const payload = {
    secret: process.env.FONNTE_WEBHOOK_SECRET,
    sender: '081234567890',
    message: 'halo',
    timestamp: Math.floor(Date.now() / 1000),
    inboxid: 'inbox-test-1'
  };

  const denied = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, secret: 'wrong-secret' })
  });
  assert.equal(denied.status, 401);

  const accepted = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(accepted.status, 200);
  for (let attempt = 0; attempt < 50 && outboundCount === 0; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(outboundCount, 1);

  const duplicate = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(duplicate.status, 200);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(outboundCount, 1);
  assert.equal(processed.size, 1);
});
