// Kompresi respons JSON API.
//
// State penuh aplikasi pernah terukur 6,85 MB dan dikirim apa adanya ke setiap
// tab yang sinkron, sehingga bandwidth dan waktu tunggu ikut menjadi gejala
// "server tidak merespon". JSON seperti ini memampai kira-kira delapan kali, dan
// pemampatan sengaja memakai zlib.gzip (masuk thread pool) supaya tidak memblokir
// event loop — gzipSync untuk beberapa megabyte menahan satu putaran penuh
// ratusan milidetik, yaitu persis macet yang ingin dihindari.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const DEFAULT_MINIMUM_BYTES = 1024;
const DEFAULT_LEVEL = 6;

function weakEtag(buffer) {
  return `W/"${crypto.createHash('sha1').update(buffer).digest('base64url')}"`;
}

export function createGzipJsonMiddleware({
  minimumBytes = DEFAULT_MINIMUM_BYTES,
  level = DEFAULT_LEVEL
} = {}) {
  const threshold = Number.isFinite(Number(minimumBytes)) ? Math.max(0, Number(minimumBytes)) : DEFAULT_MINIMUM_BYTES;
  const compressionLevel = Math.min(9, Math.max(1, Math.round(Number(level) || DEFAULT_LEVEL)));

  return function gzipJson(request, response, next) {
    const path = String(request.path || '');
    if (!path.startsWith('/api/')) return next();
    const accepts = String(request.headers['accept-encoding'] || '').toLowerCase();
    if (!accepts.includes('gzip')) return next();
    if (typeof response.vary === 'function') response.vary('Accept-Encoding');

    const originalJson = response.json.bind(response);
    response.json = function compressedJson(payload) {
      let body;
      try {
        body = Buffer.from(JSON.stringify(payload));
      } catch {
        // Payload yang tidak dapat diubah menjadi teks dibiarkan Express menangani
        // kesalahannya seperti sebelumnya.
        return originalJson(payload);
      }
      if (body.length < threshold) return originalJson(payload);
      if (response.headersSent || response.writableEnded) return originalJson(payload);

      const etag = weakEtag(body);
      if (request.method === 'GET' && request.headers['if-none-match'] === etag) {
        response.setHeader('ETag', etag);
        response.statusCode = 304;
        return response.end();
      }

      zlib.gzip(body, { level: compressionLevel }, (error, compressed) => {
        if (error || !Buffer.isBuffer(compressed) || !compressed.length) {
          // Kegagalan kompresi tidak boleh membuat permintaan gagal: kirim seperti biasa.
          return originalJson(payload);
        }
        if (response.headersSent || response.writableEnded) return undefined;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Content-Encoding', 'gzip');
        response.setHeader('ETag', etag);
        response.setHeader('Content-Length', String(compressed.length));
        if (request.method === 'HEAD') return response.end();
        return response.end(compressed);
      });
      return response;
    };
    return next();
  };
}
