// Kepala penyimpanan cache untuk berkas hasil build.
//
// Kerangka aplikasi pernah dikirim dengan "max-age=0" sehingga diunduh ulang
// pada setiap kunjungan, dan aset yang hilang bisa jatuh ke rute SPA lalu
// dijawab sebagai HTML 200 yang membuat layar putih tanpa pesan. Keduanya
// diuji di sini memakai express asli dan server HTTP betulan.
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { cacheControlForStaticFile, looksLikeAssetFile, registerStaticServing } from '../server/staticServing.mjs';

function minta(port, jalan) {
  return new Promise((resolve, reject) => {
    const permintaan = http.get({ host: '127.0.0.1', port, path: jalan, timeout: 5000 }, (response) => {
      const potongan = [];
      response.on('data', (bagian) => potongan.push(bagian));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(potongan).toString('utf8')
        })
      );
    });
    permintaan.on('timeout', () => {
      permintaan.destroy(new Error(`Permintaan ${jalan} menggantung`));
    });
    permintaan.on('error', reject);
  });
}

function distSementara() {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'siman-dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>SIMAN</title>');
  fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log("kerangka");');
  fs.writeFileSync(path.join(dist, 'bps-minut-logo.png'), 'isi-logo-palsu');
  return dist;
}

function jalankan(dist) {
  const app = express();
  registerStaticServing(app, { dist, express });
  // app.listen() menghasilkan http.Server yang berbeda dari app-nya, jadi port
  // dan penutup diambil dari server itu, bukan dari aplikasi express.
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () =>
      resolve({
        port: server.address().port,
        tutup: () => new Promise(selesai => server.close(selesai))
      })
    );
  });
}

async function denganSitus(tests) {
  const dist = distSementara();
  const situs = await jalankan(dist);
  try {
    await tests(situs);
  } finally {
    await situs.tutup();
    fs.rmSync(dist, { recursive: true, force: true });
  }
}

test('aset ber-hash disimpan setahun dan bersifat immutable', async () => {
  await denganSitus(async ({ port }) => {
    const jawaban = await minta(port, '/assets/index-abc123.js');
    assert.equal(jawaban.status, 200);
    assert.equal(jawaban.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(jawaban.body, 'console.log("kerangka");');
  });
});

test('aset yang hilang tidak pernah dijawab sebagai index.html', async () => {
  await denganSitus(async ({ port }) => {
    const jawaban = await minta(port, '/assets/index-hilang.js');
    assert.equal(jawaban.status, 404);
    assert.match(String(jawaban.headers['content-type']), /application\/json/);
    assert.doesNotMatch(jawaban.body, /SIMAN/, 'jawaban bukan isi index.html');
    assert.equal(jawaban.headers['cache-control'], 'no-cache', '404 tidak boleh ikut disimpan');

    const gambar = await minta(port, '/gambar-hilang.png');
    assert.equal(gambar.status, 404, 'berkas berekstensi di luar /assets juga tidak menjadi HTML');
  });
});

test('index.html dan rute SPA selalu diverifikasi ulang', async () => {
  await denganSitus(async ({ port }) => {
    for (const jalan of ['/', '/inventory', '/index.html']) {
      const jawaban = await minta(port, jalan);
      assert.equal(jawaban.status, 200, jalan);
      assert.match(String(jawaban.headers['content-type']), /text\/html/, jalan);
      assert.equal(jawaban.headers['cache-control'], 'no-cache', `${jalan} tidak boleh disimpan`);
      assert.match(jawaban.body, /SIMAN/, jalan);
    }
  });
});

test('berkas statis bernama tetap disimpan sebentar, bukan setahun', async () => {
  await denganSitus(async ({ port }) => {
    const jawaban = await minta(port, '/bps-minut-logo.png');
    assert.equal(jawaban.status, 200);
    assert.equal(jawaban.headers['cache-control'], 'public, max-age=300');
  });
});

test('kebijakan kepala cache membedakan HTML dan berkas lain', () => {
  assert.equal(cacheControlForStaticFile('/dist/index.html'), 'no-cache');
  assert.equal(cacheControlForStaticFile(path.join(os.tmpdir(), 'dist', 'logo.png')), 'public, max-age=300');
  assert.equal(cacheControlForStaticFile(undefined), 'public, max-age=300');
});

test('nama halaman tidak dikira berkas, nama berkas tidak dikira halaman', () => {
  assert.equal(looksLikeAssetFile('/inventory'), false);
  assert.equal(looksLikeAssetFile('/reports/2026'), false);
  assert.equal(looksLikeAssetFile('/assets/index-abc123.js'), true);
  assert.equal(looksLikeAssetFile('/gambar.PNG'), true);
  assert.equal(looksLikeAssetFile('/data/rekap.xlsx'), true, 'berkas dokumen tidak dijawab sebagai halaman');
  assert.equal(looksLikeAssetFile('/assets/app.js?v=2'), true, 'query string tidak mengaburkan ekstensi');
});
