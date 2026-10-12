import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntentClassifier, sanitizeIntent } from '../whatsapp/ai.mjs';
import { createChatbot } from '../whatsapp/chatbot.mjs';
import { getWhatsAppConfig } from '../whatsapp/config.mjs';
import { createTools, parseDocumentQuery } from '../whatsapp/tools.mjs';

test('Groq is selected when explicitly configured or when only its key is present', async () => {
  const explicit = getWhatsAppConfig({
    WHATSAPP_AI_PROVIDER: 'groq',
    GROQ_API_KEY: 'test-groq-key'
  });
  assert.equal(explicit.aiProvider, 'groq');
  assert.equal(explicit.aiConfigured, true);

  const automatic = getWhatsAppConfig({ GROQ_API_KEY: 'test-groq-key' });
  assert.equal(automatic.aiProvider, 'groq');
  assert.equal(automatic.aiConfigured, true);

  const disabled = getWhatsAppConfig({ WHATSAPP_AI_PROVIDER: 'groq' });
  assert.equal(disabled.aiProvider, 'groq');
  assert.equal(disabled.aiConfigured, false);

  let called = false;
  const classify = createIntentClassifier(disabled, {
    fetchImpl: async () => { called = true; },
    onError: () => assert.fail('provider should not be called without a key')
  });
  assert.equal(await classify('status aset'), null);
  assert.equal(called, false);
});

test('Groq classifier uses JSON mode and returns only sanitized intent fields', async () => {
  const config = getWhatsAppConfig({
    WHATSAPP_AI_PROVIDER: 'groq',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'test-model'
  });
  let request;
  const errors = [];
  const classify = createIntentClassifier(config, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          intent: 'SEARCH_ASSET',
          nama: 'Laptop BMN',
          nup: 12,
          sql: 'DROP TABLE assets'
        }) } }]
      }), { status: 200 });
    },
    onError: event => errors.push(event)
  });

  const result = await classify('Tolong cari laptop BMN NUP 12');
  const body = JSON.parse(request.options.body);

  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer test-groq-key');
  assert.equal(body.model, 'test-model');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.match(body.messages[1].content, /Tolong cari laptop BMN NUP 12/);
  assert.deepEqual(result, { intent: 'SEARCH_ASSET', filter: { nama: 'Laptop BMN', nup: 12 } });
  assert.deepEqual(errors, []);
});

test('Groq API failures fall back without logging credentials, messages, or provider response bodies', async () => {
  const config = getWhatsAppConfig({
    WHATSAPP_AI_PROVIDER: 'groq',
    GROQ_API_KEY: 'never-log-this-key'
  });
  const errors = [];
  const classify = createIntentClassifier(config, {
    fetchImpl: async () => new Response('private provider response', { status: 401 }),
    onError: event => errors.push(event)
  });

  assert.equal(await classify('private user message'), null);
  assert.deepEqual(errors, [{ provider: 'groq', reason: 'http', status: 401 }]);
  assert.equal(JSON.stringify(errors).includes('never-log-this-key'), false);
  assert.equal(JSON.stringify(errors).includes('private'), false);
});

test('Gemini remains available when selected and its key is configured', async () => {
  const config = getWhatsAppConfig({
    WHATSAPP_AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'test-gemini-key',
    WHATSAPP_AI_MODEL: 'test-gemini-model'
  });
  let request;
  const classify = createIntentClassifier(config, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"intent":"DASHBOARD"}' }] } }]
      }), { status: 200 });
    },
    onError: () => assert.fail('unexpected provider error')
  });

  assert.deepEqual(await classify('ringkasan aset'), { intent: 'DASHBOARD', filter: {} });
  assert.match(request.url, /models\/test-gemini-model:generateContent$/);
  assert.equal(request.options.headers['x-goog-api-key'], 'test-gemini-key');
});

test('AI intent answers from permission-checked application collections', async () => {
  const collections = {
    assets: [{
      namaBarang: 'Laptop Operasional',
      kodeBarang: '3.10.01.02.001',
      nup: 12,
      merkType: 'ThinkPad',
      ruanganNama: 'Seksi Keuangan',
      gedung: 'Kantor Utama',
      kondisi: 'Baik',
      status: 'Aktif'
    }]
  };
  const user = { id: 'user-1', name: 'Pengguna', role: 'Operator' };
  const tools = createTools({
    getCollection: key => collections[key] || [],
    userHasPermission: (_user, permission) => permission === 'viewAssets'
  });
  const chatbot = createChatbot({
    config: {},
    store: {
      getAccountByPhone: async () => ({ user_id: user.id }),
      getSession: async () => null
    },
    tools,
    resolveUser: async () => ({ user }),
    classifyIntent: async () => ({
      intent: 'SEARCH_ASSET',
      filter: { nama: 'Laptop Operasional' }
    }),
    appUrl: 'http://localhost:3000'
  });

  const result = await chatbot.handle({ phone: '6281234567890', text: 'Tolong temukan laptop operasional' });
  assert.equal(result.intent, 'SEARCH_ASSET');
  assert.match(result.reply.text, /Laptop Operasional/);
  assert.match(result.reply.text, /3\.10\.01\.02\.001/);
});

test('request status exposes only requests owned by the linked user', async () => {
  const collections = {
    requests: [
      {
        id: 'owned',
        nomorPermintaan: 'REQ-MINE',
        tanggal: '2026-10-12',
        status: 'Ditolak',
        catatan: 'Stok belum tersedia',
        items: [{ namaBarang: 'Kertas A4', jumlahDiminta: 2, satuan: 'rim' }]
      },
      {
        id: 'other',
        nomorPermintaan: 'REQ-OTHER',
        tanggal: '2026-10-11',
        status: 'Disetujui',
        catatan: 'Catatan milik pengguna lain',
        items: [{ namaBarang: 'Tinta Printer', jumlahDiminta: 1, satuan: 'unit' }]
      }
    ]
  };
  const user = { id: 'user-1', name: 'Pemohon', role: 'Pemohon' };
  const tools = createTools({
    getCollection: key => collections[key] || [],
    userHasPermission: (_user, permission) => permission === 'requestSupplies'
  });
  const chatbot = createChatbot({
    config: {},
    store: {
      getAccountByPhone: async () => ({ user_id: user.id }),
      getSession: async () => null,
      clearSession: async () => {},
      listOwnedRequestIds: async () => ['owned']
    },
    tools,
    resolveUser: async () => ({ user }),
    classifyIntent: async () => null,
    appUrl: 'http://localhost:3000'
  });

  const result = await chatbot.handle({ phone: '6281234567890', text: 'status permohonan saya' });
  assert.equal(result.intent, 'MY_REQUESTS');
  assert.match(result.reply.text, /REQ-MINE/);
  assert.match(result.reply.text, /Kertas A4: 2 rim/);
  assert.match(result.reply.text, /Alasan penolakan: Stok belum tersedia/);
  assert.doesNotMatch(result.reply.text, /REQ-OTHER/);
  assert.doesNotMatch(result.reply.text, /Tinta Printer|Catatan milik pengguna lain/);
});

test('unlinked numbers receive only public procedure information', async () => {
  const chatbot = createChatbot({
    config: {},
    store: { getAccountByPhone: async () => null },
    tools: {},
    resolveUser: async () => ({ user: null }),
    classifyIntent: async () => assert.fail('AI must not receive messages from an unlinked number'),
    appUrl: 'http://localhost:3000'
  });

  const publicResult = await chatbot.handle({
    phone: '628999999999',
    text: 'Bagaimana prosedur mengajukan permohonan?'
  });
  assert.equal(publicResult.intent, 'REQUEST_PROCEDURE');
  assert.match(publicResult.reply.text, /PROSEDUR PERMOHONAN BARANG/);

  const privateResult = await chatbot.handle({
    phone: '628999999999',
    text: 'Berapa stok dan status permohonan pengguna lain?'
  });
  assert.equal(privateResult.intent, 'NOT_LINKED');
  assert.match(privateResult.reply.text, /belum terhubung/);
});

test('document filters are bounded and invalid AI filters cannot broaden a search', () => {
  assert.deepEqual(parseDocumentQuery('status permohonan nomor REQ-01 Ditolak'), {
    nomor: 'REQ-01', statusPermohonan: 'Ditolak'
  });
  assert.deepEqual(parseDocumentQuery('riwayat transaksi barang keluar BK/2026/01'), {
    nomor: 'BK/2026/01', jenisTransaksi: 'keluar'
  });
  assert.deepEqual(parseDocumentQuery('permohonan saya belum disetujui'), { unsupported: true });
  for (const filter of [{ nomor: 'x'.repeat(61) }, { nomor: "' OR 1=1" }, { statusPermohonan: 'Semua' }, { jenisTransaksi: 'hapus' }]) {
    assert.deepEqual(sanitizeIntent({ intent: 'SEARCH_REQUESTS', ...filter }), { intent: 'UNKNOWN' });
  }
});

test('request searches enforce ownership even when a requester asks for the staff scope', () => {
  const collections = { requests: [
    { id: 'mine', nomorPermintaan: 'REQ-01', tanggal: '2026-10-12', status: 'Disetujui', items: [
      { namaBarang: 'Kertas', jumlahDiminta: 4, jumlahDisetujui: 2, satuan: 'rim' }
    ] },
    { id: 'other', nomorPermintaan: 'REQ-02', tanggal: '2026-10-12', status: 'Ditolak', catatan: 'Rahasia pengguna lain' }
  ] };
  const tools = createTools({
    getCollection: key => collections[key] || [],
    userHasPermission: (user, permission) => user.permissions.includes(permission)
  });
  const requester = { permissions: ['requestSupplies'] };
  assert.equal(tools.getMyRequests(requester, ['mine'], {}, true).denied, true);
  assert.equal(tools.getMyRequests(requester, ['mine'], { nomor: 'REQ-02' }).total, 0);
  const mine = tools.getMyRequests(requester, ['mine'], { statusPermohonan: 'Disetujui' });
  assert.equal(mine.items[0].barang[0].disetujui, 2);
  assert.equal(tools.getMyRequests(requester, ['mine'], { nomor: 'bad number' }).denied, true);
  const staff = { permissions: ['approveRequests'] };
  const other = tools.getMyRequests(staff, [], { nomor: 'REQ-02' }, true);
  assert.equal(other.scope, 'petugas');
  assert.equal(other.total, 1);
  assert.equal(other.items[0].catatan, 'Rahasia pengguna lain');
  assert.equal(tools.getMyRequests(requester, []).total, 0);
});

test('inventory transactions use existing permissions and never invent missing status', () => {
  const collections = {
    stockInList: [{ nomorTransaksi: 'BM-01', tanggal: '2026-10-11', namaBarang: 'Kertas', jumlah: 5, satuan: 'rim', status: 'Diverifikasi' }],
    stockOutList: [{ nomorTransaksi: 'BK-01', tanggal: '2026-10-12', namaBarang: 'Kertas', jumlah: 1, satuan: 'rim' }]
  };
  const tools = createTools({
    getCollection: key => collections[key] || [],
    userHasPermission: (user, permission) => user.permissions.includes(permission)
  });
  assert.equal(tools.getInventoryTransactions({ permissions: ['requestSupplies'] }).denied, true);
  assert.equal(tools.getInventoryTransactions({ permissions: ['viewInventory'] }).denied, true);
  const staff = { permissions: ['manageInventory'] };
  const result = tools.getInventoryTransactions(staff, { jenisTransaksi: 'keluar', nomor: 'BK-01' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].status, 'Status tidak tercatat');
  assert.equal(tools.getInventoryTransactions(staff, { nomor: 'missing' }).total, 0);
  assert.equal(tools.getInventoryTransactions(staff, { jenisTransaksi: 'hapus' }).denied, true);
});

test('WhatsApp document questions work without AI and staff requests do not bypass requester scope', async () => {
  const user = { id: 'u1', permissions: ['requestSupplies'] };
  const tools = createTools({
    getCollection: key => key === 'requests' ? [
      { id: 'mine', nomorPermintaan: 'REQ-01', tanggal: '2026-10-12', status: 'Diajukan' },
      { id: 'other', nomorPermintaan: 'REQ-02', tanggal: '2026-10-12', status: 'Ditolak' }
    ] : [],
    userHasPermission: (current, permission) => current.permissions.includes(permission)
  });
  const chatbot = createChatbot({
    config: {}, tools, resolveUser: async () => ({ user }),
    store: { getAccountByPhone: async () => ({ user_id: user.id }), getSession: async () => null,
      listOwnedRequestIds: async () => ['mine'] },
    classifyIntent: async () => assert.fail('structured document question should not need AI'),
    appUrl: 'https://example.invalid'
  });
  const deniedOther = await chatbot.handle({ phone: '6281234567890', text: 'status permohonan nomor REQ-02' });
  assert.doesNotMatch(deniedOther.reply.text, /REQ-02|Ditolak/);
  const mine = await chatbot.handle({ phone: '6281234567890', text: 'status permohonan saya nomor REQ-01' });
  assert.match(mine.reply.text, /REQ-01/);
  assert.match(mine.reply.text, /Diajukan/);
});
