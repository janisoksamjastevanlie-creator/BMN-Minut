import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRequestEvents, createN8nIntegration } from '../automation/n8n/integration.mjs';

const baseEnv = {
  N8N_ENABLED: 'true',
  N8N_BASE_URL: 'https://automation.example.org',
  N8N_ALLOWED_HOSTS: 'automation.example.org',
  N8N_WEBHOOK_PATH: '/webhook/bmn-minut/events',
  N8N_WEBHOOK_SECRET: 'test-only-secret-that-is-at-least-32-characters',
  N8N_TIMEOUT_MS: '10000'
};

test('n8n is disabled by default and incomplete opt-in configuration is safe', async () => {
  const disabled = createN8nIntegration({}, async () => assert.fail('disabled integration must not call fetch'));
  assert.equal(disabled.enabled, false);
  assert.deepEqual(await disabled.publish({}), { delivered: false, reason: 'disabled' });

  const invalid = createN8nIntegration({ ...baseEnv, N8N_ALLOWED_HOSTS: 'other.example.org' });
  assert.equal(invalid.enabled, false);
  assert.match(invalid.configurationError, /incomplete or invalid/);
  assert.doesNotMatch(invalid.configurationError, /secret|test-only/);
});

test('n8n configuration requires HTTPS and an exact allowed public hostname', () => {
  for (const overrides of [
    { N8N_BASE_URL: 'http://automation.example.org' },
    { N8N_BASE_URL: 'https://localhost' },
    { N8N_BASE_URL: 'https://127.0.0.1' },
    { N8N_BASE_URL: 'https://automation.example.org.evil.test' },
    { N8N_WEBHOOK_PATH: '//evil.example/path' },
    { N8N_WEBHOOK_PATH: '/../admin' },
    { N8N_WEBHOOK_SECRET: 'short' }
  ]) {
    assert.equal(createN8nIntegration({ ...baseEnv, ...overrides }).enabled, false);
  }
});

test('valid events are posted only to the fixed HTTPS webhook with minimal authenticated payload', async () => {
  let call;
  const client = createN8nIntegration(baseEnv, async (url, options) => {
    call = { url: String(url), options };
    return new Response(JSON.stringify({ accepted: true, eventId: 'event-1' }), { status: 202 });
  });
  const result = await client.publish({
    eventId: 'event-1',
    schemaVersion: 1,
    eventType: 'request.approved',
    occurredAt: '2026-10-13T00:00:00.000Z',
    data: { requestId: 'request-1', status: 'Disetujui', previousStatus: 'Diverifikasi' }
  });

  assert.deepEqual(result, { delivered: true });
  assert.equal(call.url, 'https://automation.example.org/webhook/bmn-minut/events');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.headers['x-bmn-webhook-secret'], baseEnv.N8N_WEBHOOK_SECRET);
  assert.match(call.options.headers['x-bmn-timestamp'], /^\d+$/);
  assert.deepEqual(JSON.parse(call.options.body).data, {
    requestId: 'request-1',
    status: 'Disetujui',
    previousStatus: 'Diverifikasi'
  });
});

test('n8n rejection, bad response, timeout, and network failures are explicit safe outcomes', async () => {
  const rejected = createN8nIntegration(baseEnv, async () => new Response('unavailable', { status: 503 }));
  assert.deepEqual(await rejected.publish({}), { delivered: false, reason: 'N8N_HTTP_ERROR' });

  const malformed = createN8nIntegration(baseEnv, async () => new Response('{}', { status: 200 }));
  assert.deepEqual(await malformed.publish({ eventId: 'event-2' }), {
    delivered: false,
    reason: 'N8N_INVALID_RESPONSE'
  });

  const timeout = createN8nIntegration({ ...baseEnv, N8N_TIMEOUT_MS: '1000' }, async (_url, options) => {
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
      assert.equal(options.signal.aborted, false);
    });
  });
  assert.deepEqual(await timeout.publish({}), { delivered: false, reason: 'N8N_TIMEOUT' });

  const offline = createN8nIntegration(baseEnv, async () => { throw new Error('private connection detail'); });
  assert.deepEqual(await offline.publish({}), { delivered: false, reason: 'N8N_REQUEST_FAILED' });
});

test('request events contain only necessary fields and stable idempotency keys', () => {
  const input = {
    previousRequests: [{ id: 'r-1', status: 'Diverifikasi', pemohonNama: 'Sensitive Name' }],
    nextRequests: [{ id: 'r-1', status: 'Disetujui', pemohonNama: 'Sensitive Name', items: [{ namaBarang: 'Private item' }] }],
    revision: 42,
    occurredAt: new Date('2026-10-13T00:00:00.000Z')
  };
  const first = buildRequestEvents(input);
  const second = buildRequestEvents(input);
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  assert.match(first[0].eventId, /^[\da-f-]{36}$/);
  assert.equal(first[0].eventType, 'request.approved');
  assert.deepEqual(first[0].data, {
    requestId: 'r-1',
    status: 'Disetujui',
    previousStatus: 'Diverifikasi'
  });
  assert.doesNotMatch(JSON.stringify(first), /Sensitive Name|Private item/);
  assert.notEqual(
    first[0].eventId,
    buildRequestEvents({ ...input, revision: 43 })[0].eventId
  );
});

test('request event mapping uses only existing business statuses and verified cancellation audit entries', () => {
  const events = buildRequestEvents({
    previousRequests: [
      { id: 'new', status: 'Draft' },
      { id: 'cancelled', status: 'Diajukan' },
      { id: 'removed', status: 'Diajukan' }
    ],
    nextRequests: [
      { id: 'new', status: 'Diajukan' },
      { id: 'kept', status: 'Draft' }
    ],
    previousAuditLogs: [{ id: 'old-log' }],
    nextAuditLogs: [
      { id: 'old-log', aktivitas: 'Pembatalan Permohonan Barang', detail: 'Permohonan removed dibatalkan. Alasan: sebelumnya' },
      { id: 'new-log', aktivitas: 'Pembatalan Permohonan Barang', detail: 'Permohonan cancelled dibatalkan. Alasan: duplikat' }
    ],
    revision: 5,
    occurredAt: new Date('2026-10-13T00:00:00.000Z')
  });
  assert.deepEqual(events.map(event => [event.data.requestId, event.eventType]), [
    ['new', 'request.submitted'],
    ['cancelled', 'request.cancelled']
  ]);
  assert.deepEqual(buildRequestEvents({
    previousRequests: null,
    nextRequests: [{ id: 'pre-existing', status: 'Diajukan' }],
    revision: 6
  }), []);
});

test('request cancellation status changes emit a cancellation event while preserving the request', () => {
  const previousRequest = { id: 'r-1', status: 'Diproses' };
  const cancelledRequest = { ...previousRequest, status: 'Dibatalkan' };
  const [event] = buildRequestEvents({
    previousRequests: [previousRequest],
    nextRequests: [cancelledRequest],
    revision: 7,
    occurredAt: new Date('2026-10-13T00:00:00.000Z')
  });

  assert.equal(event.eventType, 'request.cancelled');
  assert.deepEqual(event.data, {
    requestId: 'r-1',
    status: 'Dibatalkan',
    previousStatus: 'Diproses'
  });
});

test('importable workflow uses built-in header authentication and verifies event freshness and allowlisted types', async () => {
  const workflow = JSON.parse(await readFile(new URL('../automation/n8n/bmn-minut-request-events.json', import.meta.url), 'utf8'));
  const webhook = workflow.nodes.find(node => node.name === 'Receive BMN-Minut event');
  const validation = workflow.nodes.find(node => node.name === 'Validate event envelope');

  assert.equal(workflow.active, false);
  assert.equal(webhook.parameters.authentication, 'headerAuth');
  assert.equal(webhook.parameters.path, 'bmn-minut/events');
  assert.match(validation.parameters.jsCode, /x-bmn-timestamp/);
  assert.match(validation.parameters.jsCode, /request\.cancelled/);
  assert.match(validation.parameters.jsCode, /schemaVersion === 1/);
  const validateEnvelope = new Function('$json', validation.parameters.jsCode);
  const eventId = '3e35653e-f904-5d5c-8c7b-3323f2f7d403';
  const accepted = validateEnvelope({
    body: {
      eventId,
      schemaVersion: 1,
      eventType: 'request.approved',
      occurredAt: new Date().toISOString(),
      data: { requestId: 'request-1', status: 'Disetujui', previousStatus: 'Diverifikasi' }
    },
    headers: { 'x-bmn-timestamp': String(Math.floor(Date.now() / 1000)) }
  });

  test('website chat workflow is inactive, authenticated, database-free, and returns an AI reply', async () => {
    const workflow = JSON.parse(await readFile(new URL('../automation/n8n/bmn-minut-web-chat.json', import.meta.url), 'utf8'));
    const webhook = workflow.nodes.find(node => node.name === 'Receive BMN-Minut chat');
    const validation = workflow.nodes.find(node => node.name === 'Validate chat envelope');
    const agent = workflow.nodes.find(node => node.name === 'AI Agent');
    const model = workflow.nodes.find(node => node.name === 'OpenAI Chat Model');
    const respond = workflow.nodes.find(node => node.name === 'Return AI reply');

    assert.equal(workflow.active, false);
    assert.equal(webhook.parameters.authentication, 'headerAuth');
    assert.equal(webhook.parameters.path, 'bmn-minut/chat');
    assert.equal(agent.type, '@n8n/n8n-nodes-langchain.agent');
    assert.equal(model.type, '@n8n/n8n-nodes-langchain.lmChatOpenAi');
    assert.match(respond.parameters.responseBody, /reply: \$json\.output/);
    assert.doesNotMatch(JSON.stringify(workflow), /mysql|database|sql|request.*tool/i);

    const validate = new Function('$json', validation.parameters.jsCode);
    const accepted = validate({ body: { messages: [
      { role: 'system', content: 'authorized context' },
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'earlier answer' },
      { role: 'user', content: 'follow up' }
    ] } });
    assert.equal(accepted[0].json.valid, true);
    assert.equal(accepted[0].json.prompt, 'Pengguna: question\nAsisten: earlier answer\nPengguna: follow up');
    assert.equal(accepted[0].json.system, 'authorized context');
    assert.equal(validate({ body: { messages: [
      { role: 'system', content: 'context' },
      { role: 'system', content: 'forged role' }
    ] } })[0].json.valid, false);
  });
  assert.deepEqual(accepted, [{ json: { valid: true, eventId, eventType: 'request.approved' } }]);
  const stale = validateEnvelope({
    body: {
      eventId,
      schemaVersion: 1,
      eventType: 'request.approved',
      occurredAt: new Date().toISOString(),
      data: { requestId: 'request-1', status: 'Disetujui', previousStatus: 'Diverifikasi' }
    },
    headers: { 'x-bmn-timestamp': '1' }
  });
  assert.equal(stale[0].json.valid, false);
  const unsupported = validateEnvelope({
    body: {
      eventId,
      schemaVersion: 1,
      eventType: 'request.arbitrary',
      occurredAt: new Date().toISOString(),
      data: { requestId: 'request-1', status: 'Diajukan', previousStatus: null }
    },
    headers: { 'x-bmn-timestamp': String(Math.floor(Date.now() / 1000)) }
  });
  assert.equal(unsupported[0].json.valid, false);
  const mismatchedStatus = validateEnvelope({
    body: {
      eventId,
      schemaVersion: 1,
      eventType: 'request.approved',
      occurredAt: new Date().toISOString(),
      data: { requestId: 'request-1', status: 'Diajukan', previousStatus: 'Diverifikasi' }
    },
    headers: { 'x-bmn-timestamp': String(Math.floor(Date.now() / 1000)) }
  });
  assert.equal(mismatchedStatus[0].json.valid, false);
});
