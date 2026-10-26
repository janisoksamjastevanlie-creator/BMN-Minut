// Rute media: proxy foto dari provider eksternal (contoh Google Drive) agar tidak diblokir ORB/CORP di browser.
import { Readable } from 'node:stream';

const ALLOWED_HOSTS = new Set([
  'drive.google.com',
  'drive.usercontent.google.com',
  'lh3.googleusercontent.com'
]);

function isAllowedHost(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  // Googleusercontent subdomains (mis. images/drive usercontent variants).
  if (host.endsWith('.googleusercontent.com')) return true;
  return false;
}

export function registerMediaRoutes(app, context) {
  const { asyncRoute, requireUser } = context;

  app.get('/api/media/proxy', requireUser, asyncRoute(async (request, response) => {
    const raw = String(request.query?.url || '').trim();
    if (!raw) return response.status(400).json({ error: 'Parameter url wajib diisi.' });

    let target;
    try {
      target = new URL(raw);
    } catch {
      return response.status(400).json({ error: 'URL tidak valid.' });
    }

    if (!isAllowedHost(target.hostname)) {
      return response.status(400).json({ error: 'Host tidak diizinkan.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const upstream = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal
      });

      if (!upstream.ok) {
        return response.status(502).json({ error: `Gagal memuat media (status ${upstream.status}).` });
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return response.status(415).json({ error: 'Media bukan gambar.' });
      }

      response.status(200);
      response.setHeader('Content-Type', contentType);
      response.setHeader('Cache-Control', 'private, max-age=3600');
      response.setHeader('X-Content-Type-Options', 'nosniff');

      if (!upstream.body) return response.end();
      Readable.fromWeb(upstream.body).pipe(response);
    } catch (error) {
      const name = error && typeof error.name === 'string' ? error.name : 'UNKNOWN';
      console.error(`Media proxy failed (${name}):`, error);
      return response.status(502).json({ error: 'Gagal memuat media.' });
    } finally {
      clearTimeout(timeout);
    }
  }));
}
