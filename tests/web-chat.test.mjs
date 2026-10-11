import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebChat, sanitizeHistory } from '../ai/webchat.mjs';

const data = {
  inventoryItems: [
    { nama: 'Kertas HVS A4', kodeBarang: 'K-01', stokSaatIni: 3, satuan: 'rim', stokMinimum: 10, status: 'Menipis', rak: 'A', binCode: 'WH-A-1' }
  ],
  assets: [],
  movements: [], maintenances: [], disposals: [], requests: []
};
const getCollection = key => data[key] ?? [];
const perms = new Set(['viewInventory', 'viewAssets', 'viewDashboard']);
const userHasPermission = (_user, permission) => perms.has(permission);
const config = { aiEnabled: true, aiProvider: 'groq', groqApiKey: 'test-key', groqModel: 'm' };
const user = { id: 'u1', name: 'Uji', role: 'Operator', unitKerja: 'TU' };
const okFetch = capture => async (_url, init) => {
  capture.body = JSON.parse(init.body);
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: ' Jawaban uji ' } }] }) };
};

test('riwayat dibatasi dan dimulai dari pesan pengguna', () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `p${i}` }));
  const result = sanitizeHistory([{ role: 'system', content: 'x' }, ...messages]);
  assert.ok(result.length <= 8);
  assert.equal(result[0].role, 'user');
  assert.deepEqual(sanitizeHistory('bukan array'), []);
});

test('jawaban memuat data stok aktual dan tanpa rahasia', async () => {
  const capture = {};
  const chat = createWebChat({ config, getCollection, userHasPermission, fetchImpl: okFetch(capture) });
  const result = await chat.answer(user, [{ role: 'user', content: 'berapa stok kertas a4?' }]);
  assert.equal(result.reply, 'Jawaban uji');
  const system = capture.body.messages[0].content;
  assert.match(system, /Kertas HVS A4/);
  assert.doesNotMatch(system, /test-key/);
});

test('tanpa izin, data tidak dikirim ke model', async () => {
  perms.clear();
  const capture = {};
  const chat = createWebChat({ config, getCollection, userHasPermission, fetchImpl: okFetch(capture) });
  await chat.answer(user, [{ role: 'user', content: 'stok kertas' }]);
  assert.doesNotMatch(capture.body.messages[0].content, /Kertas HVS A4/);
  perms.add('viewInventory');
});

test('kesalahan dipetakan tanpa membocorkan detail', async () => {
  const mk = fetchImpl => createWebChat({ config, getCollection, userHasPermission, fetchImpl });
  const msg = [{ role: 'user', content: 'halo' }];
  assert.equal((await mk(async () => ({ ok: false, status: 429 })).answer(user, msg)).error, 'quota');
  assert.equal((await mk(async () => ({ ok: false, status: 401 })).answer(user, msg)).error, 'not_configured');
  assert.equal((await mk(async () => { throw new Error('boom'); }).answer(user, msg)).error, 'unreachable');
  assert.equal((await mk(async () => ({ ok: true, json: async () => ({ choices: [] }) })).answer(user, msg)).error, 'empty');
  assert.equal((await createWebChat({ config: { ...config, groqApiKey: '' }, getCollection, userHasPermission }).answer(user, msg)).error, 'not_configured');
  assert.equal((await mk(okFetch({})).answer(user, [])).error, 'bad_request');
});
