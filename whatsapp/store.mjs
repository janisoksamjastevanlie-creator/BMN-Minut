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

export async function createWhatsAppStore(db) {
  const schema = [
    `CREATE TABLE IF NOT EXISTS whatsapp_accounts (
      user_id VARCHAR(191) NOT NULL PRIMARY KEY,
      phone VARCHAR(30) NOT NULL UNIQUE,
      linked_at VARCHAR(35) NOT NULL,
      notify_enabled TINYINT NOT NULL DEFAULT 1,
      CONSTRAINT fk_whatsapp_account_user FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS whatsapp_link_tokens (
      token_hash CHAR(64) NOT NULL PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL,
      expires_at BIGINT NOT NULL,
      used_at BIGINT,
      INDEX idx_whatsapp_link_user (user_id),
      INDEX idx_whatsapp_link_expiry (expires_at),
      CONSTRAINT fk_whatsapp_link_user FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      message_id VARCHAR(200),
      phone_number VARCHAR(30) NOT NULL,
      user_id VARCHAR(191),
      direction VARCHAR(10) NOT NULL,
      message VARCHAR(200),
      intent VARCHAR(80),
      status VARCHAR(20) NOT NULL,
      created_at VARCHAR(35) NOT NULL,
      INDEX idx_whatsapp_messages_created (created_at),
      INDEX idx_whatsapp_messages_user_created (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
      message_id VARCHAR(200) NOT NULL PRIMARY KEY,
      received_at BIGINT NOT NULL,
      INDEX idx_whatsapp_processed_received (received_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      phone_hash CHAR(64) NOT NULL PRIMARY KEY,
      state VARCHAR(100) NOT NULL,
      context_json LONGTEXT,
      expires_at BIGINT NOT NULL,
      INDEX idx_whatsapp_sessions_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS whatsapp_notifications (
      event_key VARCHAR(191) NOT NULL,
      user_id VARCHAR(191) NOT NULL,
      status VARCHAR(20) NOT NULL,
      error VARCHAR(300),
      created_at VARCHAR(35) NOT NULL,
      PRIMARY KEY (event_key, user_id),
      INDEX idx_whatsapp_notifications_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  ];
  for (const statement of schema) await db.query(statement);

  const queryRows = async (executor, sql, params = []) => {
    const [rows] = await executor.execute(sql, params);
    return rows;
  };
  const queryOne = async (executor, sql, params = []) => (await queryRows(executor, sql, params))[0] || null;
  const execute = async (executor, sql, params = []) => {
    const [result] = await executor.execute(sql, params);
    return result;
  };
  const transaction = async callback => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      connection.release();
    }
  };

  const now = () => new Date().toISOString();

  return {
    async getMeta(key) {
      return (await queryOne(db, 'SELECT value FROM app_meta WHERE `key` = ?', [key]))?.value ?? null;
    },
    async setMeta(key, value) {
      await execute(db, `
        INSERT INTO app_meta (\`key\`, value) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [key, String(value)]);
    },
    async incrementMeta(key, amount = 1) {
      await execute(db, `
        INSERT INTO app_meta (\`key\`, value) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE value = CAST(value AS UNSIGNED) + VALUES(value)
      `, [key, String(amount)]);
    },

    async prune() {
      const cutoffDate = new Date(Date.now() - LOG_RETENTION_DAYS * 86400000).toISOString();
      await execute(db, 'DELETE FROM whatsapp_messages WHERE created_at < ?', [cutoffDate]);
      await execute(db, 'DELETE FROM whatsapp_processed_messages WHERE received_at < ?', [Date.now() - 7 * 86400000]);
      await execute(db, 'DELETE FROM whatsapp_link_tokens WHERE expires_at < ?', [Date.now() - 86400000]);
      await execute(db, 'DELETE FROM whatsapp_sessions WHERE expires_at < ?', [Date.now()]);
      await execute(db, 'DELETE FROM whatsapp_notifications WHERE created_at < ?', [cutoffDate]);
    },

    async claimMessage(messageId) {
      const result = await execute(db, 'INSERT IGNORE INTO whatsapp_processed_messages (message_id, received_at) VALUES (?, ?)', [
        String(messageId).slice(0, 200), Date.now()
      ]);
      return Number(result.affectedRows) === 1;
    },

    async logMessage({ messageId, phone, userId, direction, message, intent, status }) {
      await execute(db, `
        INSERT INTO whatsapp_messages (message_id, phone_number, user_id, direction, message, intent, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        messageId ? String(messageId).slice(0, 200) : null,
        maskPhone(phone),
        userId || null,
        direction,
        message == null ? null : redactSecrets(message).slice(0, 200),
        intent || null,
        status,
        now()
      ]);
    },

    async getAccountByPhone(phone) {
      return await queryOne(db, 'SELECT * FROM whatsapp_accounts WHERE phone = ?', [normalizePhone(phone)]);
    },
    async getAccountByUser(userId) {
      return await queryOne(db, 'SELECT * FROM whatsapp_accounts WHERE user_id = ?', [userId]);
    },
    async listAccounts() {
      return queryRows(db, 'SELECT * FROM whatsapp_accounts');
    },
    async setNotify(userId, enabled) {
      await execute(db, 'UPDATE whatsapp_accounts SET notify_enabled = ? WHERE user_id = ?', [enabled ? 1 : 0, userId]);
    },
    async unlink(userId) {
      const result = await execute(db, 'DELETE FROM whatsapp_accounts WHERE user_id = ?', [userId]);
      return Number(result.affectedRows) > 0;
    },

    async createLinkToken(userId) {
      const code = generateLinkCode();
      const expiresAt = Date.now() + LINK_CODE_TTL_MS;
      await transaction(async connection => {
        await execute(connection, 'DELETE FROM whatsapp_link_tokens WHERE user_id = ? AND used_at IS NULL', [userId]);
        await execute(connection, 'INSERT INTO whatsapp_link_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
          sha256(code), userId, expiresAt
        ]);
      });
      return { code, expiresAt };
    },

    async redeemLinkToken(code, phone) {
      const normalized = normalizePhone(phone);
      try {
        return await transaction(async connection => {
          const tokenHash = sha256(code);
          const token = await queryOne(connection, `
            SELECT user_id, expires_at, used_at FROM whatsapp_link_tokens WHERE token_hash = ? FOR UPDATE
          `, [tokenHash]);
          if (!token || token.used_at || Number(token.expires_at) <= Date.now()) {
            return { ok: false, reason: 'invalid' };
          }
          const occupant = await queryOne(connection, `
            SELECT user_id FROM whatsapp_accounts WHERE phone = ? FOR UPDATE
          `, [normalized]);
          if (occupant && occupant.user_id !== token.user_id) {
            return { ok: false, reason: 'phone_in_use' };
          }
          await execute(connection, 'UPDATE whatsapp_link_tokens SET used_at = ? WHERE token_hash = ?', [Date.now(), tokenHash]);
          await execute(connection, `
            INSERT INTO whatsapp_accounts (user_id, phone, linked_at, notify_enabled) VALUES (?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE phone = VALUES(phone), linked_at = VALUES(linked_at)
          `, [token.user_id, normalized, now()]);
          return { ok: true, userId: token.user_id };
        });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return { ok: false, reason: 'phone_in_use' };
        throw error;
      }
    },

    async getSession(phone) {
      const row = await queryOne(db, `
        SELECT state, context_json, expires_at FROM whatsapp_sessions WHERE phone_hash = ?
      `, [sha256(normalizePhone(phone))]);
      if (!row || Number(row.expires_at) <= Date.now()) return null;
      return { state: row.state, context: row.context_json ? JSON.parse(row.context_json) : {} };
    },
    async setSession(phone, state, context = {}) {
      await execute(db, `
        INSERT INTO whatsapp_sessions (phone_hash, state, context_json, expires_at) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE state = VALUES(state), context_json = VALUES(context_json), expires_at = VALUES(expires_at)
      `, [sha256(normalizePhone(phone)), state, JSON.stringify(context), Date.now() + SESSION_TTL_MS]);
    },
    async clearSession(phone) {
      await execute(db, 'DELETE FROM whatsapp_sessions WHERE phone_hash = ?', [sha256(normalizePhone(phone))]);
    },

    async claimNotification(eventKey, userId) {
      const result = await execute(db, `
        INSERT IGNORE INTO whatsapp_notifications (event_key, user_id, status, created_at) VALUES (?, ?, 'sending', ?)
      `, [eventKey, userId, now()]);
      return Number(result.affectedRows) === 1;
    },
    async finishNotification(eventKey, userId, status, error) {
      await execute(db, 'UPDATE whatsapp_notifications SET status = ?, error = ? WHERE event_key = ? AND user_id = ?', [
        status, error ? String(error).slice(0, 300) : null, eventKey, userId
      ]);
    },

    async stats() {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const count = async sql => Number((await queryOne(db, sql, [start])).count);
      const linked = await queryOne(db, 'SELECT COUNT(*) AS count FROM whatsapp_accounts');
      return {
        messagesToday: await count('SELECT COUNT(*) AS count FROM whatsapp_messages WHERE created_at >= ?'),
        failedToday: await count("SELECT COUNT(*) AS count FROM whatsapp_messages WHERE created_at >= ? AND status IN ('failed','rejected')"),
        linkedAccounts: Number(linked.count)
      };
    }
  };
}
