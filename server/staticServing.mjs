// Penyajian berkas hasil build di produksi.
//
// Kerangka aplikasi (JS + CSS) pernah terukur 122 kB terkompresi dan server
// mengirimnya dengan "max-age=0", sehingga setiap admin yang membuka ulang situs
// mengunduh ulang semuanya dan ikut membebani server — salah satu gejala yang
// terasa seperti "server tidak merespon". Nama berkas hasil build mengandung hash
// isi, jadi aman disimpan setahun; hanya index.html yang tidak boleh disimpan
// karena dialah yang menunjuk ke berkas-hash versi berikutnya.
import path from 'node:path';
import fs from 'node:fs';

export const IMMUTABLE_MAX_AGE = '365d';
export const MUTABLE_MAX_AGE_MS = 300_000;

// Alamat SPA hanya memakai huruf dan garis miring; berkas selalu berekstensi.
// Ekstensi di bawah ini tidak pernah menjadi nama halaman, jadi kalau tidak ada
// di cakram harus dijawab 404, bukan index.html.
const FILE_EXTENSIONS = new Set([
  'js', 'mjs', 'css', 'map', 'json', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
  'ico', 'txt', 'xml', 'woff', 'woff2', 'ttf', 'otf', 'pdf', 'zip', 'wasm',
  'xlsx', 'xls', 'xlsm', 'doc', 'docx', 'csv', 'ppt', 'pptx'
]);

export function looksLikeAssetFile(urlPath) {
  const name = String(urlPath || '').split('?')[0].split('#')[0].split('/').pop() || '';
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return FILE_EXTENSIONS.has(extension);
}

export function cacheControlForStaticFile(filePath) {
  return String(filePath).endsWith('.html') ? 'no-cache' : `public, max-age=${MUTABLE_MAX_AGE_MS / 1000}`;
}

export function registerStaticServing(app, { dist, express }) {
  const indexHtmlPath = path.join(dist, 'index.html');

  app.use(
    '/assets',
    express.static(path.join(dist, 'assets'), {
      maxAge: IMMUTABLE_MAX_AGE,
      immutable: true,
      index: false
    })
  );
  // Aset berhash yang hilang (misalnya peramban masih meminta berkas dari versi
  // sebelum deploy) dijawab 404 bersih. Dibiarkan jatuh ke rute SPA akan
  // mengirim index.html berstatus 200 yang oleh peramban dianggap skrip, dan
  // hasilnya layar putih tanpa satu pun pesan kesalahan.
  app.use('/assets', (_request, response) =>
    response.status(404).set('Cache-Control', 'no-cache').json({ error: 'Berkas aset tidak ditemukan.' })
  );

  app.use(
    express.static(dist, {
      index: false,
      setHeaders(response, filePath) {
        response.setHeader('Cache-Control', cacheControlForStaticFile(filePath));
      }
    })
  );

  // sendFile selalu menulis Cache-Control "public, max-age=0" miliknya sendiri dan
  // tidak menerima kepala kustom, jadi index.html dibaca lalu dikirim langsung.
  app.get('*', (request, response, next) => {
    if (looksLikeAssetFile(request.path)) {
      return response.status(404).set('Cache-Control', 'no-cache').json({ error: 'Berkas tidak ditemukan.' });
    }
    fs.promises
      .readFile(indexHtmlPath, 'utf8')
      .then(html => {
        response
          .status(200)
          .set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
          .send(html);
      })
      .catch(next);
  });

  return { indexHtmlPath };
}
