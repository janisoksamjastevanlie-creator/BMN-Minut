import crypto from 'node:crypto';
import { resolveRequestUser } from '../stateAuthorization.mjs';

export function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function readCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') || [];
  const cookie = cookies.map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export function secureCookie(request) {
  return process.env.NODE_ENV === 'production' ||
    request.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
}

export function sameOrigin(request, response, next) {
  const origin = request.get('origin');
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      return response.status(403).json({ error: 'Origin permintaan tidak valid.' });
    }
    const forwardedHost = request.get('x-forwarded-host')?.split(',')[0].trim();
    const allowedHosts = [request.get('host'), forwardedHost].filter(Boolean);
    if (!allowedHosts.includes(originHost)) {
      return response.status(403).json({ error: 'Permintaan lintas situs ditolak.' });
    }
  }
  next();
}

export function accessIdentityMatches(user, claims, users, cloudflareAccessRequired) {
  if (!cloudflareAccessRequired) return true;
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !claims?.email || !Array.isArray(users)) return false;
  const matches = users.filter(candidate =>
    candidate.statusAktif !== false &&
    String(candidate.email || '').trim().toLowerCase() === String(claims.email).trim().toLowerCase()
  );
  return matches.length === 1 && matches[0].id === user.id && email === String(claims.email).trim().toLowerCase();
}

export function createAuthMiddleware({
  db,
  queryOne,
  refreshCollections,
  getCollection,
  requireCloudflareAccess,
  cloudflareAccessRequired
}) {
  function requireUserWithState(request, response, next, refreshState) {
    return requireCloudflareAccess(request, response, () => {
      (async () => {
        const token = readCookie(request, 'siman_session');
        if (!token) {
          response.status(401).json({ error: 'Silakan masuk kembali.' });
          return false;
        }
        const session = await queryOne(db, `
          SELECT s.user_id, u.profile_json
          FROM sessions s JOIN auth_users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ?
        `, [hashToken(token), Date.now()]);
        if (!session) {
          response.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' });
          return false;
        }
        const profile = JSON.parse(session.profile_json);
        if (refreshState) {
          await refreshCollections();
          const resolved = resolveRequestUser(
            profile,
            session.user_id,
            getCollection('users'),
            request.accessClaims,
            cloudflareAccessRequired
          );
          if (resolved.error) {
            response.status(403).json({ error: resolved.error });
            return false;
          }
          request.user = resolved.user;
        } else {
          if (profile.statusAktif === false) {
            response.status(403).json({ error: 'Akun dinonaktifkan.' });
            return false;
          }
          request.user = { ...profile, id: session.user_id };
        }
        return true;
      })().then(authorized => {
        if (authorized) next();
      }).catch(next);
    });
  }

  function requireUser(request, response, next) {
    return requireUserWithState(request, response, next, true);
  }

  function requireUserFromTransactionState(request, response, next) {
    return requireUserWithState(request, response, next, false);
  }

  function bindRequestUserToState(request, state) {
    const resolved = resolveRequestUser(
      request.user,
      request.user.id,
      state.users,
      request.accessClaims,
      cloudflareAccessRequired
    );
    if (resolved.error) return resolved.error;
    request.user = resolved.user;
    return null;
  }

  return { requireUser, requireUserFromTransactionState, bindRequestUserToState };
}
