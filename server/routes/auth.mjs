// Rute autentikasi dan pemeriksaan kesehatan: login, sesi, keluar, kata sandi akun.
import crypto from 'node:crypto';

export function registerAuthRoutes(app, context) {
  const {
    db,
    healthQueryOne: queryOne,
    execute,
    asyncRoute,
    scryptAsync,
    requireCloudflareAccess,
    requireUser,
    refreshCollections,
    getCollection,
    accessIdentityMatches,
    hashToken,
    readCookie,
    secureCookie
  } = context;

  const loginAttempts = new Map();

  app.get('/api/health', asyncRoute(async (_request, response) => {
    try {
      const result = await queryOne(db, 'SELECT 1 AS ready');
      const ready = result?.ready;
      if (ready !== 1) {
        console.error(`Health check database query returned unexpected ready=${String(ready)} (${typeof ready}).`);
        return response.status(503).json({ status: 'unavailable' });
      }
      response.json({ status: 'ok' });
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
      console.error(`Health check database query failed (${code}):`, error);
      response.status(503).json({ status: 'unavailable' });
    }
  }));

  app.post('/api/auth/login', requireCloudflareAccess, asyncRoute(async (request, response) => {
    const nip = String(request.body?.nip || '').trim();
    const password = String(request.body?.password || '');
    if (!nip || nip.length > 30 || password.length > 256) {
      return response.status(400).json({ error: 'NIP atau kata sandi tidak valid.' });
    }
    const address = `${request.ip}:${nip}`;
    const now = Date.now();
    if (loginAttempts.size > 10000) {
      for (const [key, value] of loginAttempts) {
        if (now - value.startedAt >= 15 * 60 * 1000) loginAttempts.delete(key);
      }
    }
    const attempt = loginAttempts.get(address);
    if (attempt && attempt.count >= 10 && now - attempt.startedAt < 15 * 60 * 1000) {
      return response.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
    }
    await refreshCollections();
    const account = await queryOne(db, 'SELECT * FROM auth_users WHERE nip = ?', [nip]);
    const salt = account ? Buffer.from(account.salt, 'hex') : Buffer.alloc(16);
    const expected = account ? Buffer.from(account.password_hash, 'hex') : Buffer.alloc(64);
    const actual = await scryptAsync(password, salt, 64);
    const valid = account && crypto.timingSafeEqual(actual, expected);
    if (!valid) {
      const current = attempt && now - attempt.startedAt < 15 * 60 * 1000
        ? attempt
        : { count: 0, startedAt: now };
      loginAttempts.set(address, { ...current, count: current.count + 1 });
      return response.status(401).json({ error: 'NIP atau kata sandi salah.' });
    }
    const profile = JSON.parse(account.profile_json);
    const registeredUsers = getCollection('users');
    if (registeredUsers && !registeredUsers.some(user => user.id === account.id)) {
      return response.status(403).json({ error: 'Akun tidak lagi terdaftar di sistem.' });
    }
    const currentUser = registeredUsers?.find(user => user.id === account.id);
    if (currentUser?.statusAktif === false) return response.status(403).json({ error: 'Akun dinonaktifkan.' });
    if (profile.statusAktif === false) return response.status(403).json({ error: 'Akun dinonaktifkan.' });
    if (!accessIdentityMatches(currentUser || profile, request.accessClaims, registeredUsers)) {
      return response.status(403).json({ error: 'Identitas Cloudflare Access tidak cocok dengan akun aplikasi.' });
    }
    loginAttempts.delete(address);
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = now + 12 * 60 * 60 * 1000;
    await execute(db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
      hashToken(token), account.id, expiresAt
    ]);
    response.setHeader('Set-Cookie', `siman_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookie(request) ? '; Secure' : ''}`);
    response.json({ user: profile });
  }));

  app.get('/api/auth/me', requireUser, (request, response) => {
    response.json({ user: request.user });
  });

  app.post('/api/auth/logout', requireCloudflareAccess, asyncRoute(async (request, response) => {
    const token = readCookie(request, 'siman_session');
    if (token) await execute(db, 'DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
    response.setHeader('Set-Cookie', `siman_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie(request) ? '; Secure' : ''}`);
    response.json({ success: true });
  }));

  app.put('/api/auth/users/:id/password', requireUser, asyncRoute(async (request, response) => {
    const { userHasPermission } = context;
    if (!userHasPermission(request.user, 'manageUsers')) {
      return response.status(403).json({ error: 'Tidak memiliki izin mengelola akun.' });
    }
    const user = request.body?.user;
    const password = String(request.body?.password || '');
    if (!user || user.id !== request.params.id || !String(user.nip || '').trim()) {
      return response.status(400).json({ error: 'Profil pengguna tidak valid.' });
    }
    const existing = await queryOne(db, 'SELECT profile_json FROM auth_users WHERE id = ?', [user.id]);
    const canonical = (getCollection('users') || []).find(item => item.id === user.id);
    if (canonical && canonical.role !== user.role) {
      return response.status(403).json({ error: 'Role akun hanya dapat diubah melalui penyimpanan pengguna oleh administrator.' });
    }
    if (!canonical && existing) return response.status(404).json({ error: 'Pengguna tidak lagi terdaftar di sistem.' });
    if (request.user.role !== 'Administrator' &&
        (user.role === 'Administrator' || (existing && JSON.parse(existing.profile_json).role === 'Administrator'))) {
      return response.status(403).json({ error: 'Hanya administrator yang dapat mengelola akun administrator.' });
    }
    if (password.length < 12 || password.length > 256) return response.status(400).json({ error: 'Kata sandi harus antara 12 dan 256 karakter.' });
    const duplicateNip = await queryOne(db, 'SELECT id FROM auth_users WHERE nip = ? AND id != ?', [String(user.nip).trim(), user.id]);
    if (duplicateNip) return response.status(409).json({ error: 'NIP tersebut sudah digunakan oleh akun lain.' });
    const salt = crypto.randomBytes(16);
    const passwordHash = await scryptAsync(password, salt, 64);
    const profile = { ...(canonical || user), nip: String(user.nip).trim() };
    await execute(db, `
      INSERT INTO auth_users (id, nip, profile_json, salt, password_hash)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        nip = VALUES(nip),
        profile_json = VALUES(profile_json),
        salt = VALUES(salt),
        password_hash = VALUES(password_hash)
    `, [user.id, profile.nip, JSON.stringify(profile), salt.toString('hex'), passwordHash.toString('hex')]);
    await execute(db, 'DELETE FROM sessions WHERE user_id = ?', [user.id]);
    response.json({ success: true });
  }));
}
