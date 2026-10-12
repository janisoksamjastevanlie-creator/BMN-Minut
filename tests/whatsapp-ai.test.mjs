import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntentClassifier, sanitizeIntent } from '../whatsapp/ai.mjs';
import { createChatbot } from '../whatsapp/chatbot.mjs';
import { getWhatsAppConfig } from '../whatsapp/config.mjs';
import { createTools, parseAssetQuery, parseInventoryQuery, parseDocumentQuery, parseMaintenanceQuery } from '../whatsapp/tools.mjs';

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
      getSession: async () => null,
      setSession: async () => {}
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
      setSession: async () => {},
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
  for (const filter of [{ nama: [] }, { nama: '' }, { lokasi: 1 }, { kategori: {} }, { nup: -1 }, { kelompok: 'SQL' }]) {
    assert.deepEqual(sanitizeIntent({ intent: 'SEARCH_ASSET', ...filter }), { intent: 'UNKNOWN' });
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
      listOwnedRequestIds: async () => ['mine'], setSession: async () => {} },
    classifyIntent: async () => assert.fail('structured document question should not need AI'),
    appUrl: 'https://example.invalid'
  });
  const deniedOther = await chatbot.handle({ phone: '6281234567890', text: 'status permohonan nomor REQ-02' });
  assert.doesNotMatch(deniedOther.reply.text, /REQ-02|Ditolak/);
  const mine = await chatbot.handle({ phone: '6281234567890', text: 'status permohonan saya nomor REQ-01' });
  assert.match(mine.reply.text, /REQ-01/);
  assert.match(mine.reply.text, /Diajukan/);
});

test('maintenance reads validated current fields only with existing permission', () => {
  const tools = createTools({
    getCollection: key => key === 'maintenances' ? [
      { nomorTiket: 'MT-01', assetName: 'Laptop Operasional', nup: 12, jenisPemeliharaan: 'Perbaikan',
        tanggalMulai: '2026-10-12', status: 'Dalam Proses', vendor: 'PRIVATE-VENDOR', biaya: 100 },
      { nomorTiket: 'MT-02', assetName: 'Printer', nup: 15, status: 'Ditunda' }
    ] : [],
    userHasPermission: (user, permission) => user.permissions.includes(permission)
  });
  const allowed = { permissions: ['manageMaintenance'] };
  assert.equal(tools.getMaintenanceStatus({ permissions: ['viewAssets'] }).denied, true);
  assert.deepEqual(parseMaintenanceQuery('status pemeliharaan laptop nup 12'), { nup: 12, nama: 'laptop' });
  assert.equal(tools.getMaintenanceStatus(allowed, { nup: 12 }).total, 1);
  const ticket = tools.getMaintenanceStatus(allowed, parseMaintenanceQuery('pemeliharaan nomor MT-01'));
  assert.equal(ticket.items[0].selesai, null);
  assert.doesNotMatch(JSON.stringify(ticket), /PRIVATE-VENDOR|biaya/);
  assert.equal(tools.getMaintenanceStatus(allowed, { nomor: 'MT-MISSING' }).total, 0);
  assert.equal(tools.getMaintenanceStatus(allowed, { statusPemeliharaan: 'invalid' }).denied, true);
  assert.equal(tools.getMaintenanceStatus(allowed, parseMaintenanceQuery('yang ditunda')).items[0].nomor, 'MT-02');
});

test('follow-up session stores only validated filters and rechecks permissions and identity', async () => {
  let user = { id: 'u1', permissions: ['requestSupplies'] };
  let session = null;
  const collections = { requests: [
    { id: 'mine', nomorPermintaan: 'REQ-01', status: 'Ditolak', catatan: 'DATA-PRIVATE', tanggal: '2026-10-12' },
    { id: 'other', nomorPermintaan: 'REQ-02', status: 'Ditolak', tanggal: '2026-10-12' }
  ] };
  const tools = createTools({
    getCollection: key => collections[key] || [],
    userHasPermission: (current, permission) => current.permissions.includes(permission)
  });
  const chatbot = createChatbot({
    config: {}, tools, appUrl: 'https://example.invalid',
    resolveUser: async () => ({ user }),
    store: {
      getAccountByPhone: async () => ({ user_id: user.id }),
      getSession: async () => session,
      setSession: async (_phone, state, context) => { session = { state, context }; },
      clearSession: async () => { session = null; },
      listOwnedRequestIds: async id => id === 'u1' ? ['mine'] : []
    },
    classifyIntent: async () => null
  });
  await chatbot.handle({ phone: '6281234567890', text: 'status permohonan saya nomor REQ-01' });
  assert.deepEqual(session.context, { userId: 'u1', intent: 'MY_REQUESTS', filter: { nomor: 'REQ-01' } });
  assert.doesNotMatch(JSON.stringify(session), /DATA-PRIVATE|catatan/);
  const followUp = await chatbot.handle({ phone: '6281234567890', text: 'yang ditolak?' });
  assert.match(followUp.reply.text, /REQ-01/);
  assert.doesNotMatch(followUp.reply.text, /REQ-02/);
  user.permissions = [];
  const revoked = await chatbot.handle({ phone: '6281234567890', text: 'statusnya?' });
  assert.match(revoked.reply.text, /tidak memiliki izin/);
  assert.doesNotMatch(revoked.reply.text, /REQ-01|DATA-PRIVATE/);
  user = { id: 'u2', permissions: ['requestSupplies'] };
  const switched = await chatbot.handle({ phone: '6281234567890', text: 'yang ditolak?' });
  assert.equal(switched.intent, 'UNKNOWN');
  assert.doesNotMatch(switched.reply.text, /REQ-01/);
  session = null;
  const expired = await chatbot.handle({ phone: '6281234567890', text: 'nomor REQ-01' });
  assert.equal(expired.intent, 'UNKNOWN');
});

test('colloquial stock queries and maintenance follow-ups need no AI call', async () => {
  let session = null;
  const user = { id: 'u1' };
  const tools = createTools({
    getCollection: key => ({
      inventoryItems: [{ nama: 'Kertas A4', stokSaatIni: 7, satuan: 'rim', status: 'Tersedia' }],
      maintenances: [{ nomorTiket: 'MT-01', assetName: 'Laptop', tanggalMulai: '2026-10-12', status: 'Ditunda' }]
    })[key] || [],
    userHasPermission: (_user, permission) => ['viewInventory', 'manageMaintenance'].includes(permission)
  });
  const chatbot = createChatbot({
    config: {}, tools, appUrl: 'https://example.invalid',
    resolveUser: async () => ({ user }),
    store: {
      getAccountByPhone: async () => ({ user_id: user.id }),
      getSession: async () => session,
      setSession: async (_phone, state, context) => { session = { state, context }; }
    },
    classifyIntent: async () => assert.fail('known shorthand must not require external AI')
  });
  const stock = await chatbot.handle({ phone: '6281234567890', text: 'brp stokk brg kertas a4 dong' });
  assert.match(stock.reply.text, /Kertas A4: 7 rim/);
  const maintenance = await chatbot.handle({ phone: '6281234567890', text: 'pemeliharaan laptop' });
  assert.match(maintenance.reply.text, /MT-01/);
  const followUp = await chatbot.handle({ phone: '6281234567890', text: 'yang ditunda?' });
  assert.match(followUp.reply.text, /MT-01/);
});

test('inactive linked users cannot read data or reuse conversation state', async () => {
  const chatbot = createChatbot({
    config: {}, appUrl: 'https://example.invalid',
    store: {
      getAccountByPhone: async () => ({ user_id: 'inactive-user' }),
      getSession: async () => assert.fail('inactive user must not reuse context')
    },
    tools: {},
    resolveUser: async () => ({ user: null }),
    classifyIntent: async () => assert.fail('inactive user must not call AI')
  });
  const result = await chatbot.handle({ phone: '6281234567890', text: 'yang ditolak?' });
  assert.equal(result.intent, 'INACTIVE');
  assert.match(result.reply.text, /tidak aktif/);
});

test('stock follow-ups change item, refresh facts, preserve identity, and can switch topics', async () => {
  let session = null;
  const user = { id: 'u1', permissions: ['viewInventory', 'viewAssets'] };
  const collections = {
    inventoryItems: [
      { nama: 'Kertas A4', stokSaatIni: 7, satuan: 'rim', status: 'Aman' },
      { nama: 'Tinta Printer', stokSaatIni: 2, satuan: 'botol', status: 'Menipis' }
    ],
    assets: [{ namaBarang: 'Laptop', nup: 12, kondisi: 'Baik', status: 'Aktif' }]
  };
  const chatbot = createChatbot({
    config: {}, appUrl: 'https://example.invalid',
    tools: createTools({ getCollection: key => collections[key] || [],
      userHasPermission: (current, permission) => current.permissions.includes(permission) }),
    resolveUser: async () => ({ user }),
    store: {
      getAccountByPhone: async () => ({ user_id: user.id }),
      getSession: async () => session,
      setSession: async (_phone, state, context) => { session = { state, context }; },
      clearSession: async () => { session = null; }
    },
    classifyIntent: async () => null
  });
  const send = text => chatbot.handle({ phone: '6281234567890', text });
  await send('berapa stok kertas a4?');
  const changed = await send('Kalau tinta printer?');
  assert.match(changed.reply.text, /Tinta Printer: 2 botol/);
  assert.doesNotMatch(changed.reply.text, /Kertas A4/);
  assert.deepEqual(session.context.filter, { nama: 'tinta printer' });
  collections.inventoryItems[1].stokSaatIni = 1;
  assert.match((await send('statusnya?')).reply.text, /Tinta Printer: 1 botol/);
  const switched = await send('Kalau aset laptop?');
  assert.equal(switched.intent, 'SEARCH_ASSET');
  assert.match(switched.reply.text, /Laptop/);
  await send('stok');
  assert.match((await send('Bagaimana dengan tinta printer?')).reply.text, /Tinta Printer: 1 botol/);
  await send('bagaimana menggunakan menu aplikasi?');
  assert.equal(session, null);
  assert.equal((await send('Kalau tinta printer?')).intent, 'UNKNOWN');
  await send('berapa stok tinta printer?');
  user.permissions = [];
  assert.match((await send('statusnya?')).reply.text, /tidak memiliki izin/);
  session = null;
  assert.equal((await send('Kalau tinta printer?')).intent, 'UNKNOWN');
});

test('inventory status filters include zero stock without inventing matches', () => {
  const tools = createTools({
    getCollection: key => key === 'inventoryItems' ? [
      { nama: 'Kertas A4', stokSaatIni: 0, status: 'Habis' },
      { nama: 'Tinta', stokSaatIni: 1, status: 'Menipis' }
    ] : [],
    userHasPermission: () => true
  });
  assert.deepEqual(parseInventoryQuery('barang apa saja yang stoknya habis'), { statusPersediaan: 'Habis' });
  assert.equal(tools.searchInventory({}, parseInventoryQuery('stok habis')).items[0].stok, 0);
  assert.equal(tools.searchInventory({}, { nama: 'Laptop', statusPersediaan: 'Habis' }).total, 0);
  assert.equal(tools.searchInventory({}, { statusPersediaan: 'invalid' }).denied, true);
  assert.match(tools.searchInventory({}, parseInventoryQuery('stok belum habis')).unavailable, /belum didukung/);
  assert.match(tools.searchInventory({}, parseInventoryQuery('stok menipis dan habis')).unavailable, /belum didukung/);
});

test('asset category and location group totals use existing records and bounded output', () => {
  const tools = createTools({
    getCollection: key => key === 'assets' ? [
      { namaBarang: 'Laptop', kategori: 'Elektronik', ruanganNama: 'TU', kondisi: 'Baik', status: 'Aktif' },
      { namaBarang: 'Printer', kategori: 'Elektronik', ruanganNama: 'TU', kondisi: 'Baik', status: 'Aktif' },
      { namaBarang: 'Meja', kategori: 'Mebel', ruanganNama: 'Rapat', kondisi: 'Baik', status: 'Aktif' },
      { namaBarang: 'Laptop Lama', kategori: 'Elektronik', status: 'Dihapuskan' }
    ] : [],
    userHasPermission: (user, permission) => user.permissions.includes(permission)
  });
  const user = { permissions: ['viewAssets'] };
  assert.deepEqual(parseAssetQuery('berapa aset kategori elektronik di TU'), { kategori: 'elektronik', lokasi: 'tu' });
  const grouped = tools.getAssetCount(user, parseAssetQuery('jumlah aset berdasarkan kategori'));
  assert.equal(grouped.count, 3);
  assert.deepEqual(grouped.kelompok, [{ nama: 'Elektronik', count: 2 }, { nama: 'Mebel', count: 1 }]);
  assert.deepEqual(tools.getAssetCount(user, parseAssetQuery('jumlah aset per lokasi')).kelompok,
    [{ nama: 'TU', count: 2 }, { nama: 'Rapat', count: 1 }]);
  assert.equal(tools.getAssetCount(user, parseAssetQuery('berapa aset kategori elektronik di TU')).count, 2);
  assert.equal(tools.getAssetCount({ permissions: [] }, { kelompok: 'kategori' }).denied, true);
  assert.equal(tools.getAssetCount(user, { kategori: [] }).denied, true);
  assert.equal(tools.searchAsset(user, { kelompok: 'SQL' }).denied, true);
});

test('document periods validate calendar dates and count headers separately from detail rows', () => {
  const tools = createTools({
    getCollection: key => ({
      stockInList: [
        { id: 'a', headerId: 'h1', nomorTransaksi: 'BM-01', tanggal: '2026-10-01', namaBarang: 'Kertas' },
        { id: 'b', headerId: 'h1', nomorTransaksi: 'BM-01', tanggal: '2026-10-01', namaBarang: 'Tinta' },
        { id: 'c', headerId: 'h2', nomorTransaksi: 'BM-02', tanggal: '2026-09-30' }
      ],
      stockOutList: [{ id: 'd', headerId: 'h3', nomorTransaksi: 'BK-01', tanggal: '2026-10-31' }],
      requests: [
        { id: 'mine', nomorPermintaan: 'REQ-01', tanggal: '2026-10-12', status: 'Disetujui' },
        { id: 'old', nomorPermintaan: 'REQ-02', tanggal: '2026-09-30', status: 'Disetujui' },
        { id: 'other', nomorPermintaan: 'REQ-03', tanggal: '2026-10-12', status: 'Disetujui' }
      ]
    })[key] || [],
    userHasPermission: (user, permission) => user.permissions.includes(permission)
  });
  const month = parseDocumentQuery('berapa transaksi barang masuk bulan Oktober 2026');
  assert.deepEqual(month, { jenisTransaksi: 'masuk', tanggalDari: '2026-10-01', tanggalSampai: '2026-10-31' });
  assert.deepEqual(parseDocumentQuery('transaksi November 2026'), { tanggalDari: '2026-11-01', tanggalSampai: '2026-11-30' });
  const transactions = tools.getInventoryTransactions({ permissions: ['manageInventory'] }, month);
  assert.equal(transactions.total, 2);
  assert.equal(transactions.totalDokumen, 1);
  assert.equal(tools.getInventoryTransactions({ permissions: ['manageInventory'] },
    parseDocumentQuery('transaksi barang masuk dan keluar Oktober 2026')).totalDokumen, 2);
  const own = tools.getMyRequests({ permissions: ['requestSupplies'] }, ['mine', 'old'],
    parseDocumentQuery('permohonan saya dari 2026-10-01 sampai 2026-10-12'));
  assert.equal(own.total, 1);
  assert.equal(own.items[0].nomor, 'REQ-01');
  assert.equal(parseDocumentQuery('permohonan nomor REQ-2026-10-12').tanggalDari, undefined);
  for (const question of ['transaksi tanggal 2026-02-30', 'transaksi dari 2026-10-12 sampai 2026-10-01',
    'transaksi bulan ini', 'transaksi sebelum 2026-10-12', 'transaksi Oktober 2026 sampai November 2026']) {
    assert.equal(parseDocumentQuery(question).unsupported, true);
    assert.match(tools.getInventoryTransactions({ permissions: ['manageInventory'] }, parseDocumentQuery(question)).unavailable, /belum didukung/);
  }
  for (const filter of [
    { tanggalDari: '2026-02-30', tanggalSampai: '2026-03-01' },
    { tanggalDari: '2026-10-12' },
    { tanggalDari: '2026-10-12', tanggalSampai: '2026-10-01' },
    { tanggalDari: 1, tanggalSampai: 2 }
  ]) assert.deepEqual(sanitizeIntent({ intent: 'INVENTORY_TRANSACTIONS', ...filter }), { intent: 'UNKNOWN' });
  assert.match(tools.getMyRequests({ permissions: ['requestSupplies'] }, ['mine'], parseDocumentQuery('permohonan saya dibatalkan')).unavailable, /dibatalkan/);
  assert.match(tools.getMyRequests({ permissions: ['requestSupplies'] }, ['mine'], parseDocumentQuery('permohonan disetujui dan ditolak')).unavailable, /belum didukung/);
});

test('user directory requires manageUsers and exposes only bounded names roles and units', async () => {
  const users = Array.from({ length: 7 }, (_, i) => ({
    name: `Pengguna ${i}`, role: i < 2 ? 'Administrator' : 'Operator', unitKerja: 'TU',
    nip: 'PRIVATE-NIP', email: 'PRIVATE-EMAIL', phone: 'PRIVATE-PHONE', password_hash: 'PRIVATE-HASH'
  }));
  users.push({ name: 'PRIVATE-INACTIVE', role: 'Administrator', statusAktif: false });
  const tools = createTools({
    getCollection: key => key === 'users' ? users : [],
    userHasPermission: (user, permission) => user.permissions.includes(permission)
  });
  assert.equal(tools.searchUsers({ permissions: ['viewDashboard'] }).denied, true);
  const admin = { id: 'admin', permissions: ['manageUsers'] };
  const result = tools.searchUsers(admin);
  assert.equal(result.total, 7);
  assert.equal(result.items.length, 5);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-|password|email|phone|nip/);
  assert.equal(tools.searchUsers(admin, { role: 'administrator' }).total, 2);
  assert.equal(tools.searchUsers(admin, { role: [] }).denied, true);
  const bot = createChatbot({
    config: {}, tools, appUrl: 'https://example.invalid', resolveUser: async () => ({ user: admin }),
    store: { getAccountByPhone: async () => ({ user_id: admin.id }), getSession: async () => null },
    classifyIntent: async () => assert.fail('directory question needs no AI')
  });
  assert.match((await bot.handle({ phone: '6281234567890', text: 'siapa Administrator?' })).reply.text, /Pengguna 0/);
  admin.permissions = [];
  assert.match((await bot.handle({ phone: '6281234567890', text: 'siapa Administrator?' })).reply.text, /tidak memiliki izin/);
});

test('unlinked users can request public application help but cannot access directory or stock', async () => {
  const bot = createChatbot({
    config: {}, tools: {}, appUrl: 'https://example.invalid',
    store: { getAccountByPhone: async () => null },
    resolveUser: async () => assert.fail('unlinked sender must not resolve a profile'),
    classifyIntent: async () => assert.fail('unlinked sender must not call AI')
  });
  const help = await bot.handle({ phone: '6281234567890', text: 'bagaimana menggunakan menu aplikasi?' });
  assert.equal(help.intent, 'HELP');
  assert.match(help.reply.text, /BANTUAN BMN/);
  assert.equal((await bot.handle({ phone: '6281234567890', text: 'apa itu BMN?' })).intent, 'HELP');
  for (const text of ['siapa Administrator?', 'berapa stok kertas a4?']) {
    assert.equal((await bot.handle({ phone: '6281234567890', text })).intent, 'NOT_LINKED');
  }
});
