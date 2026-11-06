// Kompresi respons API: harus memampat jawaban besar, melewati jawaban kecil,
// menghormati klien yang tidak menerima gzip, dan tidak pernah membuat
// permintaan gagal ketika pemampatan tidak mungkin dilakukan.
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import test from 'node:test';
import { createGzipJsonMiddleware } from '../server/gzipJson.mjs';

function fakeResponse() {
  const state = { headers: {}, chunks: [], statusCode: 200, ended: false };
  const response = {
    get headersSent() { return false; },
    get writableEnded() { return state.ended; },
    vary() {},
    setHeader(name, value) { state.headers[name.toLowerCase()] = value; },
    getHeader(name) { return state.headers[name.toLowerCase()]; },
    removeHeader(name) { delete state.headers[name.toLowerCase()]; },
    get statusCode() { return state.statusCode; },
    set statusCode(value) { state.statusCode = value; },
    end(chunk) {
      if (chunk) state.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      state.ended = true;
      return response;
    },
    json(payload) {
      state.jsonCalls = (state.jsonCalls || 0) + 1;
      try {
        state.chunks.push(Buffer.from(JSON.stringify(payload)));
      } catch {
        state.serializationFailed = true;
      }
      state.ended = true;
      return response;
    }
  };
  response.state = state;
  return response;
}

async function run(middleware, request, response) {
  await new Promise((resolve, reject) => {
    middleware(request, response, (error) => (error ? reject(error) : resolve()));
  });
  const returned = response.json(request.payload);
  if (returned && typeof returned.then === 'function') await returned;
  // Penulisan hasil kompresi terjadi pada callback zlib; tunggu sampai selesai.
  for (let i = 0; i < 100 && !response.state.ended; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return response;
}

const bigPayload = { items: Array.from({ length: 800 }, (_, index) => ({ id: `x-${index}`, nama: 'Kertas A4 80gsm', stok: index })) };
const bigBytes = Buffer.byteLength(JSON.stringify(bigPayload));

function request(overrides = {}) {
  const { headers, ...rest } = overrides;
  return {
    path: '/api/state',
    method: 'GET',
    ...rest,
    headers: { 'accept-encoding': 'gzip, deflate, br', ...headers }
  };
}

test('jawaban besar dimampatkan dan isi aslinya tetap terbaca utuh', async () => {
  const middleware = createGzipJsonMiddleware();
  const response = fakeResponse();
  await run(middleware, request({ payload: bigPayload }), response);
  assert.equal(response.getHeader('Content-Encoding'), 'gzip');
  assert.ok(bigBytes > 1024, 'payload uji memang melebihi ambang');
  const decompressed = zlib.gunzipSync(response.state.chunks[0]);
  assert.deepEqual(JSON.parse(decompressed.toString('utf8')), bigPayload);
  assert.equal(Number(response.getHeader('Content-Length')), response.state.chunks[0].length);
  assert.ok(response.state.chunks[0].length < bigBytes / 2, 'hasilnya benar-benar lebih kecil');
});

test('jawaban kecil tidak ikut dimampatkan', async () => {
  const middleware = createGzipJsonMiddleware();
  const response = fakeResponse();
  await run(middleware, request({ payload: { status: 'ok' } }), response);
  assert.equal(response.getHeader('Content-Encoding'), undefined);
  assert.deepEqual(JSON.parse(response.state.chunks[0].toString('utf8')), { status: 'ok' });
});

test('klien tanpa gzip menerima JSON biasa', async () => {
  const middleware = createGzipJsonMiddleware();
  const response = fakeResponse();
  await run(middleware, request({ headers: { 'accept-encoding': 'identity' }, payload: bigPayload }), response);
  assert.equal(response.getHeader('Content-Encoding'), undefined);
  assert.deepEqual(JSON.parse(response.state.chunks[0].toString('utf8')), bigPayload);
});

test('rute non-API dan HEAD tidak berubah perilakunya', async () => {
  const middleware = createGzipJsonMiddleware();
  const statis = fakeResponse();
  await run(middleware, request({ path: '/assets/index.js', payload: bigPayload }), statis);
  assert.equal(statis.getHeader('Content-Encoding'), undefined);

  const head = fakeResponse();
  await run(middleware, request({ method: 'HEAD', payload: bigPayload }), head);
  assert.equal(head.getHeader('Content-Encoding'), 'gzip');
  assert.equal(head.state.chunks.length, 0, 'HEAD hanya mengirim header');
});

test('If-None-Match yang cocok dijawab 304 tanpa body', async () => {
  const middleware = createGzipJsonMiddleware();
  const pertama = fakeResponse();
  await run(middleware, request({ payload: bigPayload }), pertama);
  const etag = pertama.getHeader('ETag');
  assert.ok(etag && etag.startsWith('W/"'), 'ETag lemah dibuat dari isi jawaban');

  const kedua = fakeResponse();
  await run(middleware, request({ headers: { 'if-none-match': etag }, payload: bigPayload }), kedua);
  assert.equal(kedua.statusCode, 304);
  assert.equal(kedua.state.chunks.length, 0);
});

test('payload yang tidak dapat diserialisasi tidak membuat permintaan gagal', async () => {
  const middleware = createGzipJsonMiddleware();
  const response = fakeResponse();
  const circular = { items: [] };
  circular.self = circular;
  await run(middleware, request({ payload: circular }), response);
  // Express lama juga melempar dari res.json; yang penting middleware tidak
  // menelan permintaan lebih dulu dan tidak menulis header ganda.
  assert.equal(response.getHeader('Content-Encoding'), undefined);
  assert.equal(response.state.jsonCalls, 1, 'penulisan diserahkan seperti biasa');
  assert.equal(response.state.serializationFailed, true, 'kesalahan tetap dari payload, bukan middleware');
});
