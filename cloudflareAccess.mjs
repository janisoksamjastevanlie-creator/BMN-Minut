import crypto from 'node:crypto';

const MAX_TOKEN_LENGTH = 16_384;
const CLOCK_TOLERANCE_SECONDS = 30;
const DEFAULT_KEY_CACHE_MS = 5 * 60 * 1000;

function unavailableError(message) {
  const error = new Error(message);
  error.code = 'CLOUDFLARE_ACCESS_UNAVAILABLE';
  return error;
}

function decodePart(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Malformed Access token.');
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function normalizeIssuer(teamDomain) {
  const input = String(teamDomain || '').trim();
  const url = new URL(input.startsWith('https://') ? input : `https://${input}`);
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Cloudflare Access team domain must be an HTTPS origin.');
  }
  return url.origin;
}

export function createCloudflareAccessVerifier({
  teamDomain,
  audience,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = 5_000
}) {
  const issuer = normalizeIssuer(teamDomain);
  const expectedAudience = String(audience || '').trim();
  if (!expectedAudience || typeof fetchImpl !== 'function') {
    throw new Error('Cloudflare Access audience and fetch implementation are required.');
  }

  const keysUrl = new URL('/cdn-cgi/access/certs', issuer).href;
  let cachedKeys = null;
  let cachedUntil = 0;

  async function loadKeys(forceRefresh = false) {
    if (!forceRefresh && cachedKeys && now() < cachedUntil) return cachedKeys;

    let response;
    try {
      response = await fetchImpl(keysUrl, { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw unavailableError('Cloudflare Access signing keys could not be reached.');
    }
    if (!response.ok) {
      throw unavailableError(`Cloudflare Access signing keys returned HTTP ${response.status}.`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw unavailableError('Cloudflare Access signing keys response is invalid.');
    }
    if (!Array.isArray(body?.keys) || body.keys.length === 0) {
      throw unavailableError('Cloudflare Access signing keys response is invalid.');
    }

    const keys = new Map();
    for (const jwk of body.keys) {
      if (jwk?.kty === 'RSA' && typeof jwk.kid === 'string' &&
          (!jwk.alg || jwk.alg === 'RS256') && (!jwk.use || jwk.use === 'sig')) {
        keys.set(jwk.kid, jwk);
      }
    }
    if (keys.size === 0) throw unavailableError('Cloudflare Access returned no supported signing keys.');

    const maxAge = response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1];
    const cacheMs = maxAge ? Math.min(Number(maxAge) * 1000, DEFAULT_KEY_CACHE_MS) : DEFAULT_KEY_CACHE_MS;
    cachedKeys = keys;
    cachedUntil = now() + cacheMs;
    return keys;
  }

  async function verify(token) {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
      throw new Error('Cloudflare Access token is missing or malformed.');
    }
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Cloudflare Access token is malformed.');

    const header = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (header?.alg !== 'RS256' || typeof header.kid !== 'string' ||
        !/^[A-Za-z0-9_-]+$/.test(parts[2])) {
      throw new Error('Cloudflare Access token algorithm or key ID is invalid.');
    }

    let keys = await loadKeys();
    let jwk = keys.get(header.kid);
    if (!jwk) {
      keys = await loadKeys(true);
      jwk = keys.get(header.kid);
    }
    if (!jwk) throw new Error('Cloudflare Access signing key was not found.');

    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii');
    const signature = Buffer.from(parts[2], 'base64url');
    if (signature.toString('base64url') !== parts[2] ||
        !crypto.verify('RSA-SHA256', signedContent, publicKey, signature)) {
      throw new Error('Cloudflare Access token signature is invalid.');
    }

    const currentSeconds = Math.floor(now() / 1000);
    const audiences = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
    if (claims?.iss !== issuer ||
        !audiences.includes(expectedAudience) ||
        !Number.isFinite(claims?.exp) ||
        claims.exp <= currentSeconds - CLOCK_TOLERANCE_SECONDS ||
        (claims.nbf !== undefined &&
          (!Number.isFinite(claims.nbf) || claims.nbf > currentSeconds + CLOCK_TOLERANCE_SECONDS)) ||
        (claims.iat !== undefined &&
          (!Number.isFinite(claims.iat) || claims.iat > currentSeconds + CLOCK_TOLERANCE_SECONDS)) ||
        typeof claims.sub !== 'string' ||
        typeof claims.email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) {
      throw new Error('Cloudflare Access token claims are invalid or expired.');
    }
    return claims;
  }

  return { verify };
}

export function createCloudflareAccessMiddleware({ verifier, required = true }) {
  if (required && (!verifier || typeof verifier.verify !== 'function')) {
    throw new Error('A Cloudflare Access verifier is required when Access protection is enabled.');
  }

  return async function requireCloudflareAccess(request, response, next) {
    if (!required) return next();
    const token = request.get?.('cf-access-jwt-assertion') ||
      request.headers?.['cf-access-jwt-assertion'];
    if (!token) {
      return response.status(401).json({ error: 'Autentikasi Cloudflare Access diperlukan.' });
    }

    let claims;
    try {
      claims = await verifier.verify(token);
    } catch (error) {
      if (error?.code === 'CLOUDFLARE_ACCESS_UNAVAILABLE') {
        console.error('Cloudflare Access token verification is temporarily unavailable.');
        return response.status(503).json({ error: 'Verifikasi identitas sementara tidak tersedia.' });
      }
      return response.status(401).json({ error: 'Token Cloudflare Access tidak valid.' });
    }
    request.accessClaims = claims;
    return next();
  };
}
