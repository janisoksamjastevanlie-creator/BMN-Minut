import crypto from 'node:crypto';
import { maskPhone, normalizePhone, redactSecrets, sha256 } from './security.mjs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const LOG_RETENTION_DAYS = 90;
const SESSION_TTL_MS = 10 * 60 * 1000;

export function generateLinkCode() {
  let code = '';
  for (let index = 0; index < 8; index += 1) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `BMN-${code}`;
}

export function extractLinkCode(text) {
  const match = String(text || '').toUpperCase().match(/\bBMN-?([A-Z2-9]{8})\b/);
  return match ? `BMN-${match[1]}` : null;
}

// Semua tabel baru bersifat aditif; tabel dan data lama tidak disentuh.
export function createWhatsAppStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_accounts (
      user_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      linked_at TEXT NOT NULL,
      notify_enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS whatsapp_link_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT,
      phone_number TEXT NOT NULL,
      user_id TEXT,
      direction TEXT NOT NULL,
      message TEXT,
      intent TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created ON whatsapp_messages(created_at);
    CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
      message_id TEXT PRIMARY KEY,
      received_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      phone_hash TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      context_json TEXT,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS whatsapp_notifications (
      event_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (event_key, user_id)
    );
  `);

  const now = () => new Date().toISOString();

  function getMeta(key) {
    return db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value ?? null;
  }
  function setMeta(key, value) {
    db.prepare(`
      INSERT INTO app_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
  }

  function prune() {
    const cutoffDate = new Date(Date.now() - LOG_RETENTION_DAYS * 86400000).toISOString();
    db.prepare('DELETE FROM whatsapp_messages WHERE created_at < ?').run(cutoffDate);
    db.prepare('DELETE FROM whatsapp_processed_messages WHERE received_at < ?').run(Date.now() - 7 * 86400000);
    db.prepare('DELETE FROM whatsapp_link_tokens WHERE expires_at < ?').run(Date.now() - 86400000);
    db.prepare('DELETE FROM whatsapp_sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('DELETE FROM whatsapp_notifications WHERE created_at < ?').run(cutoffDate);
  }

  return {
    getMeta,
    setMeta,
    prune,

    // true bila pesan baru; false bila sudah pernah diproses (idempotency).
    claimMessage(messageId) {
      const result = db.prepare('INSERT OR IGNORE INTO whatsapp_processed_messages (message_id, received_at) VALUES (?, ?)')
        .run(String(messageId).slice(0, 200), Date.now());
      return Number(result.changes) === 1;
    },

    logMessage({ messageId, phone, userId, direction, message, intent, status }) {
      db.prepare(`
        INSERT INTO whatsapp_messages (message_id, phone_number, user_id, direction, message, intent, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        messageId ? String(messageId).slice(0, 200) : null,
        maskPhone(phone),
        userId || null,
        direction,
        message == null ? null : redactSecrets(message).slice(0, 200),
        intent || null,
        status,
        now()
      );
    },

    getAccountByPhone(phone) {
      return db.prepare('SELECT * FROM whatsapp_accounts WHERE phone = ?').get(normalizePhone(phone)) || null;
    },
    getAccountByUser(userId) {
      return db.prepare('SELECT * FROM whatsapp_accounts WHERE user_id = ?').get(userId) || null;
    },
    listAccounts() {
      return db.prepare('SELECT * FROM whatsapp_accounts').all();
    },
    setNotify(userId, enabled) {
      db.prepare('UPDATE whatsapp_accounts SET notify_enabled = ? WHERE user_id = ?').run(enabled ? 1 : 0, userId);
    },
    unlink(userId) {
      return Number(db.prepare('DELETE FROM whatsapp_accounts WHERE user_id = ?').run(userId).changes) > 0;
    },

    createLinkToken(userId) {
      const code = generateLinkCode();
      const expiresAt = Date.now() + LINK_CODE_TTL_MS;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM whatsapp_link_tokens WHERE user_id = ? AND used_at IS NULL').run(userId);
        db.prepare('INSERT INTO whatsapp_link_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
          .run(sha256(code), userId, expiresAt);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return { code, expiresAt };
    },

    // Mengonsumsi token sekali pakai lalu menghubungkan nomor ke akun.
    redeemLinkToken(code, phone) {
      const normalized = normalizePhone(phone);
      db.exec('BEGIN IMMEDIATE');
      try {
        const token = db.prepare('SELECT user_id, expires_at, used_at FROM whatsapp_link_tokens WHERE token_hash = ?').get(sha256(code));
        if (!token || token.used_at || token.expires_at <= Date.now()) {
          db.exec('ROLLBACK');
          return { ok: false, reason: 'invalid' };
        }
        const occupant = db.prepare('SELECT user_id FROM whatsapp_accounts WHERE phone = ?').get(normalized);
        if (occupant && occupant.user_id !== token.user_id) {
          db.exec('ROLLBACK');
          return { ok: false, reason: 'phone_in_use' };
        }
        db.prepare('UPDATE whatsapp_link_tokens SET used_at = ? WHERE token_hash = ?').run(Date.now(), sha256(code));
        db.prepare(`
          INSERT INTO whatsapp_accounts (user_id, phone, linked_at, notify_enabled) VALUES (?, ?, ?, 1)
          ON CONFLICT(user_id) DO UPDATE SET phone = excluded.phone, linked_at = excluded.linked_at
        `).run(token.user_id, normalized, now());
        db.exec('COMMIT');
        return { ok: true, userId: token.user_id };
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* transaksi sudah selesai */ }
        throw error;
      }
    },

    getSession(phone) {
      const row = db.prepare('SELECT state, context_json, expires_at FROM whatsapp_sessions WHERE phone_hash = ?').get(sha256(normalizePhone(phone)));
      if (!row || row.expires_at <= Date.now()) return null;
      return { state: row.state, context: row.context_json ? JSON.parse(row.context_json) : {} };
    },
    setSession(phone, state, context = {}) {
      db.prepare(`
        INSERT INTO whatsapp_sessions (phone_hash, state, context_json, expires_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(phone_hash) DO UPDATE SET state = excluded.state, context_json = excluded.context_json, expires_at = excluded.expires_at
      `).run(sha256(normalizePhone(phone)), state, JSON.stringify(context), Date.now() + SESSION_TTL_MS);
    },
    clearSession(phone) {
      db.prepare('DELETE FROM whatsapp_sessions WHERE phone_hash = ?').run(sha256(normalizePhone(phone)));
    },

    // true bila notifikasi belum pernah dicatat untuk pengguna ini.
    claimNotification(eventKey, userId) {
      const result = db.prepare(`
        INSERT OR IGNORE INTO whatsapp_notifications (event_key, user_id, status, created_at) VALUES (?, ?, 'sending', ?)
      `).run(eventKey, userId, now());
      return Number(result.changes) === 1;
    },
    finishNotification(eventKey, userId, status, error) {
      db.prepare('UPDATE whatsapp_notifications SET status = ?, error = ? WHERE event_key = ? AND user_id = ?')
        .run(status, error ? String(error).slice(0, 300) : null, eventKey, userId);
    },

    stats() {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const count = sql => Number(db.prepare(sql).get(start).count);
      return {
        messagesToday: count("SELECT COUNT(*) AS count FROM whatsapp_messages WHERE created_at >= ?"),
        failedToday: count("SELECT COUNT(*) AS count FROM whatsapp_messages WHERE created_at >= ? AND status IN ('failed','rejected')"),
        linkedAccounts: Number(db.prepare('SELECT COUNT(*) AS count FROM whatsapp_accounts').get().count)
      };
    }
  };
}
