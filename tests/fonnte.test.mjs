import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getWhatsAppConfig } from '../whatsapp/config.mjs';
import { parseFonnteWebhookMessage, sendFonnteMessage } from '../whatsapp/fonnte.mjs';
import { createWhatsAppService, resolveRequestRecipients } from '../whatsapp/service.mjs';
import { formatter } from '../whatsapp/formatter.mjs';
import { buildFonnteRequestNotification } from '../whatsapp/request-notification.mjs';
import { createWhatsAppStore } from '../whatsapp/store.mjs';
import { SlidingWindowLimiter } from '../whatsapp/security.mjs';

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

test('website bot verification is opt-in and does not change notification readiness', () => {
  const env = { WHATSAPP_PROVIDER: 'fonnte', FONNTE_TOKEN: 'test-token', FONNTE_WEBHOOK_SECRET: 'a'.repeat(32), WHATSAPP_BOT_NUMBER: '6281234567890' };
  const config = getWhatsAppConfig(env);
  assert.equal(config.botNumberVerified, false);
  assert.equal(config.outboundConfigured, true);
  assert.equal(getWhatsAppConfig({ ...env, WHATSAPP_BOT_VERIFIED: 'true' }).botNumberVerified, true);
});

test('message limiter allows 15 requests, rejects the 16th, and isolates senders', () => {
  const limiter = new SlidingWindowLimiter({ limit: 15, windowMs: 60000 });
  for (let i = 0; i < 15; i += 1) assert.equal(limiter.hit('sender-a', 1000).allowed, true);
  assert.deepEqual(limiter.hit('sender-a', 1000), { allowed: false, first: true });
  assert.deepEqual(limiter.hit('sender-a', 1000), { allowed: false, first: false });
  assert.equal(limiter.hit('sender-b', 1000).allowed, true);
  assert.equal(limiter.hit('sender-a', 61000).allowed, true);
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

test('Fonnte webhook rejects malformed senders and safely handles missing timestamps', () => {
  assert.equal(parseFonnteWebhookMessage({ sender: '12345', message: 'hi', timestamp: Date.now() }), null);
  const withoutTimestamp = parseFonnteWebhookMessage(
    { sender: '6281234567890', message: 'hi' },
    1_800_000_000_000
  );
  assert.equal(withoutTimestamp.timestampMs, null);
  assert.match(withoutTimestamp.messageId, /^fonnte-/);
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

test('Fonnte webhook identifies messages originating from the connected device', () => {
  assert.equal(parseFonnteWebhookMessage({
    device: '081234567890',
    sender: '081234567890',
    message: 'outgoing'
  }).fromBot, true);
  assert.equal(parseFonnteWebhookMessage({
    device: '081234567890',
    sender: '081355555555',
    message: 'incoming'
  }).fromBot, false);
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

test('Fonnte HTML error responses are reported without exposing the response body', async () => {
  await assert.rejects(
    sendFonnteMessage(sendConfig, '6281234567890', 'Tes', async () =>
      new Response('<!DOCTYPE html><html>private gateway details</html>', { status: 502 })
    ),
    error => error.message === 'Fonnte API mengembalikan respons tidak valid (HTTP 502).' &&
      !error.message.includes('private gateway details')
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

test('submitted requests notify only active Administrator, Pengelola BMN, and Operator users', () => {
  const users = [
    { id: 'requester', role: 'Pemohon', phone: '081234567890', statusAktif: true },
    { id: 'admin', role: 'Administrator', phone: '+62 813-4567-8901', statusAktif: true },
    { id: 'manager', role: 'Pengelola BMN', phone: '081234567892', statusAktif: true },
    { id: 'operator', role: 'Operator', phone: '081234567893', statusAktif: true },
    { id: 'inactive-admin', role: 'Administrator', phone: '081999999999', statusAktif: false },
    { id: 'custom-approver', role: 'Pejabat Penyetuju', phone: '081777777777', statusAktif: true }
  ];
  const result = resolveRequestRecipients({
    users,
    accounts: [],
    ownerUserId: 'requester',
    status: 'Diajukan',
    action: 'submitted',
    userHasPermission: user => user.id === 'custom-approver'
  });

  assert.deepEqual(result.recipients.map(recipient => recipient.user.id).sort(), [
    'admin',
    'manager',
    'operator'
  ]);
  assert.equal(result.eligibleCount, 3);
  assert.equal(result.missingPhoneCount, 0);
});

test('approval notifications are sent only to the linked account of the request owner', () => {
  const users = [
    { id: 'requester', role: 'Pemohon', phone: '081234567890', statusAktif: true },
    { id: 'admin', role: 'Administrator', phone: '+62 813-4567-8901', statusAktif: true },
    { id: 'manager', role: 'Pengelola BMN', phone: '081234567892', statusAktif: true },
    { id: 'other-requester', role: 'Pemohon', phone: '081234567893', statusAktif: true }
  ];
  const result = resolveRequestRecipients({
    users,
    accounts: [
      { user_id: 'requester', phone: '628555111222', notify_enabled: 1 },
      { user_id: 'admin', phone: '628555111223', notify_enabled: 1 },
      { user_id: 'other-requester', phone: '628555111224', notify_enabled: 1 }
    ],
    ownerUserId: 'requester',
    status: 'Disetujui',
    action: 'status_changed',
    userHasPermission: user => user.role === 'Administrator' || user.role === 'Pengelola BMN'
  });

  assert.deepEqual(result.recipients.map(recipient => recipient.user.id), ['requester']);
  assert.equal(result.recipients[0].phone, '628555111222');
  assert.equal(result.eligibleCount, 1);
  assert.equal(result.missingPhoneCount, 0);
});

test('verification notifies the owner and all core BMN roles', () => {
  const users = [
    { id: 'requester', role: 'Pemohon', phone: '081234567890', statusAktif: true },
    { id: 'admin', role: 'Administrator', phone: '081234567891', statusAktif: true },
    { id: 'manager', role: 'Pengelola BMN', phone: '081234567892', statusAktif: true },
    { id: 'operator', role: 'Operator', phone: '081234567893', statusAktif: true },
    { id: 'custom-approver', role: 'Pejabat Penyetuju', phone: '081234567894', statusAktif: true }
  ];
  const result = resolveRequestRecipients({
    users,
    accounts: [],
    ownerUserId: 'requester',
    status: 'Diverifikasi',
    action: 'status_changed',
    userHasPermission: (user, permission) =>
      permission === 'approveRequests' && user.id === 'custom-approver'
  });

  assert.deepEqual(result.recipients.map(recipient => recipient.user.id).sort(), [
    'admin',
    'manager',
    'operator',
    'requester'
  ]);
  assert.equal(result.eligibleCount, 4);
  assert.equal(result.missingPhoneCount, 0);
});

test('missing numbers do not prevent other authorized recipients from being selected', () => {
  const result = resolveRequestRecipients({
    users: [
      { id: 'requester', role: 'Pemohon', phone: '', statusAktif: true },
      { id: 'admin', role: 'Administrator', phone: '', statusAktif: true },
      { id: 'manager', role: 'Pengelola BMN', phone: '081234567892', statusAktif: true },
      { id: 'operator', role: 'Operator', phone: 'invalid', statusAktif: true }
    ],
    accounts: [],
    ownerUserId: 'requester',
    status: 'Diverifikasi',
    action: 'status_changed',
    userHasPermission: () => false
  });

  assert.deepEqual(result.recipients.map(recipient => recipient.user.id), ['manager']);
  assert.equal(result.eligibleCount, 4);
  assert.equal(result.missingPhoneCount, 3);
});

test('prepared and completed requests notify the owner, core roles, and authorized related roles', () => {
  const users = [
    { id: 'requester', role: 'Pemohon', phone: '081234567890', statusAktif: true },
    { id: 'admin', role: 'Administrator', phone: '081234567891', statusAktif: true },
    { id: 'manager', role: 'Pengelola BMN', phone: '081234567892', statusAktif: true },
    { id: 'operator', role: 'Operator', phone: '081234567893', statusAktif: true },
    { id: 'warehouse', role: 'Petugas Gudang', phone: '081234567894', statusAktif: true },
    { id: 'unrelated', role: 'Pemohon', phone: '081234567895', statusAktif: true }
  ];
  for (const status of ['Diproses', 'Selesai']) {
    const result = resolveRequestRecipients({
      users,
      accounts: [],
      ownerUserId: 'requester',
      status,
      action: 'status_changed',
      userHasPermission: (user, permission) =>
        permission === 'manageInventory' && user.id === 'warehouse'
    });
    assert.deepEqual(result.recipients.map(recipient => recipient.user.id).sort(), [
      'admin',
      'manager',
      'operator',
      'requester',
      'warehouse'
    ]);
  }
});

test('request notification templates contain the required event details and common title', () => {
  const request = {
    nomorPermintaan: 'REQ-001',
    tanggal: '2026-10-12',
    pemohonNama: 'Pemohon Uji',
    status: 'Disetujui',
    items: [{
      namaBarang: 'Kertas A4',
      jumlahDiminta: 5,
      jumlahDisetujui: 3,
      satuan: 'Rim'
    }]
  };
  const approved = buildFonnteRequestNotification(request, 'status_changed', 'Disetujui sesuai stok', 'Pejabat Uji', '2026-10-13');
  const approvedMessage = formatter.notification(approved.title, approved.lines, 'https://example.test');
  assert.match(approvedMessage, /^🔔 \*NOTIFIKASI BMN-BPSMINUT\*/);
  assert.match(approvedMessage, /Nomor Permohonan: REQ-001/);
  assert.match(approvedMessage, /Nama Pemohon: Pemohon Uji/);
  assert.match(approvedMessage, /Penyetuju: Pejabat Uji/);
  assert.match(approvedMessage, /Tanggal Persetujuan: 2026-10-13/);
  assert.match(approvedMessage, /Kertas A4: 3 Rim/);
  assert.match(approvedMessage, /Status Persetujuan: DISETUJUI/);

  const submitted = buildFonnteRequestNotification(
    { ...request, status: 'Diajukan' },
    'submitted',
    undefined,
    'Pemohon Uji',
    '2026-10-12'
  );
  assert.match(submitted.lines.join('\n'), /Status: MENUNGGU VERIFIKASI/);

  const verified = buildFonnteRequestNotification(
    { ...request, status: 'Diverifikasi' },
    'status_changed',
    'Data lengkap',
    'Verifikator Uji',
    '2026-10-13'
  );
  assert.match(verified.lines.join('\n'), /Hasil Verifikasi: DIVERIFIKASI/);
  assert.match(verified.lines.join('\n'), /Petugas Verifikasi: Verifikator Uji/);
  assert.match(verified.lines.join('\n'), /Catatan\/Alasan: Data lengkap/);

  const prepared = buildFonnteRequestNotification(
    { ...request, status: 'Diproses' },
    'status_changed',
    undefined,
    'Petugas Gudang',
    '2026-10-14'
  );
  assert.match(prepared.lines.join('\n'), /Tanggal Persiapan: 2026-10-14/);

  const completed = buildFonnteRequestNotification(
    { ...request, status: 'Selesai' },
    'status_changed',
    undefined,
    'Petugas Gudang',
    '2026-10-15'
  );
  assert.match(completed.lines.join('\n'), /Status: BARANG TELAH DITERIMA/);
});

test('the same request event and recipient can be claimed only once after a successful send', async () => {
  const claimed = new Set();
  const database = {
    async execute(sql, params) {
      if (sql.includes('INSERT IGNORE INTO whatsapp_notifications')) {
        const key = `${params[0]}:${params[1]}`;
        if (claimed.has(key)) return [{ affectedRows: 0 }, []];
        claimed.add(key);
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`Unexpected database operation: ${sql}`);
    }
  };
  const store = await createWhatsAppStore(database, { initializeSchema: false });

  assert.equal(await store.claimNotification('request:req-1:Selesai:status_changed', 'requester'), true);
  assert.equal(await store.claimNotification('request:req-1:Selesai:status_changed', 'requester'), false);
});

test('a failed notification claim is not automatically retried', async () => {
  const claimed = new Set();
  const database = {
    async execute(sql, params) {
      if (sql.includes('INSERT IGNORE INTO whatsapp_notifications')) {
        const key = `${params[0]}:${params[1]}`;
        if (claimed.has(key)) return [{ affectedRows: 0 }, []];
        claimed.add(key);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('UPDATE whatsapp_notifications SET status')) return [{ affectedRows: 1 }, []];
      throw new Error(`Unexpected database operation: ${sql}`);
    }
  };
  const store = await createWhatsAppStore(database, { initializeSchema: false });

  assert.equal(await store.claimNotification('request:req-2:Diajukan:submitted', 'admin'), true);
  await store.finishNotification('request:req-2:Diajukan:submitted', 'admin', 'failed', 'timeout');
  assert.equal(await store.claimNotification('request:req-2:Diajukan:submitted', 'admin'), false);
});

test('one Fonnte recipient failure does not stop other valid recipients', async t => {
  const keys = ['WHATSAPP_PROVIDER', 'FONNTE_TOKEN', 'FONNTE_API_URL', 'FONNTE_WEBHOOK_SECRET'];
  const previousEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.WHATSAPP_PROVIDER = 'fonnte';
  process.env.FONNTE_TOKEN = 'test-token';
  process.env.FONNTE_API_URL = 'https://api.fonnte.com/send';
  process.env.FONNTE_WEBHOOK_SECRET = 'test-webhook-secret-with-32-chars';

  const claimed = new Set();
  const database = {
    async query() { return [[], []]; },
    async execute(sql, params = []) {
      if (sql === 'SELECT * FROM whatsapp_accounts') {
        return [[
          { user_id: 'admin', phone: '628111111111', notify_enabled: 1 },
          { user_id: 'operator', phone: '628222222222', notify_enabled: 1 }
        ], []];
      }
      if (sql.includes('INSERT IGNORE INTO whatsapp_notifications')) {
        const key = `${params[0]}:${params[1]}`;
        if (claimed.has(key)) return [{ affectedRows: 0 }, []];
        claimed.add(key);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('UPDATE whatsapp_notifications SET status')) return [{ affectedRows: 1 }, []];
      if (sql.includes('INSERT INTO whatsapp_messages')) return [{ affectedRows: 1 }, []];
      if (sql.includes('INSERT INTO app_meta')) return [{ affectedRows: 1 }, []];
      throw new Error(`Unexpected database operation: ${sql}`);
    }
  };
  const service = await createWhatsAppService({
    db: database,
    getCollection: key => key === 'users'
      ? [
          { id: 'admin', role: 'Administrator', statusAktif: true },
          { id: 'operator', role: 'Operator', statusAktif: true }
        ]
      : [],
    userHasPermission: () => false,
    requireUser: (_request, response) => response.sendStatus(401),
    refreshCollections: async () => {},
    initializeSchema: false
  });
  const originalFetch = globalThis.fetch;
  const attempted = [];
  globalThis.fetch = async (_url, options) => {
    const target = options.body.get('target');
    attempted.push(target);
    return target === '628111111111'
      ? new Response(JSON.stringify({ status: false }), { status: 200 })
      : new Response(JSON.stringify({ status: true, id: ['sent-operator'] }), { status: 200 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  const result = await service.notifyRequestEvent({
    eventKey: 'request-partial',
    ownerUserId: 'requester',
    status: 'Diajukan',
    action: 'submitted',
    title: 'Permohonan baru',
    lines: []
  });

  assert.deepEqual(attempted, ['628111111111', '628222222222']);
  assert.equal(result.success, true);
  assert.equal(result.sentCount, 1);
  assert.equal(result.failedCount, 1);
  assert.match(result.error, /1 penerima gagal/);
});

test('request notification explains how to configure a missing recipient number', async t => {
  const keys = ['WHATSAPP_PROVIDER', 'FONNTE_TOKEN', 'FONNTE_API_URL', 'FONNTE_WEBHOOK_SECRET'];
  const previousEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.WHATSAPP_PROVIDER = 'fonnte';
  process.env.FONNTE_TOKEN = 'test-token';
  process.env.FONNTE_API_URL = 'https://api.fonnte.com/send';
  process.env.FONNTE_WEBHOOK_SECRET = 'test-webhook-secret-with-32-chars';

  const database = {
    async query() { return [[], []]; },
    async execute(sql) {
      if (sql === 'SELECT * FROM whatsapp_accounts') return [[], []];
      throw new Error(`Unexpected database operation: ${sql}`);
    }
  };
  const service = await createWhatsAppService({
    db: database,
    getCollection: key => key === 'users'
      ? [{ id: 'user-1', role: 'Pemohon', phone: '081234567890', statusAktif: true }]
      : [],
    userHasPermission: () => false,
    requireUser: (_request, response) => response.sendStatus(401),
    refreshCollections: async () => {},
    initializeSchema: false
  });

  t.after(() => {
    for (const key of keys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  assert.deepEqual(await service.notifyRequestEvent({
    eventKey: 'request-test-event',
    ownerUserId: 'user-1',
    status: 'Disetujui',
    action: 'status_changed',
    title: 'Permohonan barang disetujui',
    lines: []
  }), {
    success: false,
    sentCount: 0,
    failedCount: 0,
    error: 'Nomor WhatsApp Pemohon belum terhubung atau tidak valid; notifikasi persetujuan tidak dialihkan kepada pengguna lain.'
  });
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

  const { secret: _omitted, ...payloadWithoutSecret } = payload;
  const deniedQuery = await fetch(`${url}?secret=${encodeURIComponent(process.env.FONNTE_WEBHOOK_SECRET)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadWithoutSecret)
  });
  assert.equal(deniedQuery.status, 401);

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
