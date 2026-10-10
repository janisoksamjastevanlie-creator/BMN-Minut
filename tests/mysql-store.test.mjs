import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhatsAppStore } from '../whatsapp/store.mjs';

function mockDatabase() {
  const statements = [];
  const transactionEvents = [];
  const token = { user_id: 'user-1', expires_at: Date.now() + 60_000, used_at: null };
  const connection = {
    async beginTransaction() { transactionEvents.push('begin'); },
    async commit() { transactionEvents.push('commit'); },
    async rollback() { transactionEvents.push('rollback'); },
    release() { transactionEvents.push('release'); },
    async execute(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('FROM whatsapp_link_tokens WHERE token_hash')) return [[token], []];
      if (sql.includes('FROM whatsapp_accounts WHERE phone')) return [[], []];
      return [{ affectedRows: sql.startsWith('INSERT IGNORE') ? 1 : 0 }, []];
    }
  };
  return {
    statements,
    transactionEvents,
    async query(sql) {
      statements.push({ sql, params: [] });
      return [[], []];
    },
    async execute(sql, params = []) {
      statements.push({ sql, params });
      if (sql.startsWith('SELECT value FROM app_meta')) return [[], []];
      if (sql.includes('COUNT(*) AS count')) return [[{ count: 3 }], []];
      return [{ affectedRows: sql.startsWith('INSERT IGNORE') ? 1 : 0 }, []];
    },
    async getConnection() { return connection; }
  };
}

test('WhatsApp store initializes InnoDB schema with MySQL keys and indexes', async () => {
  const db = mockDatabase();
  await createWhatsAppStore(db);
  const ddl = db.statements.map(statement => statement.sql).join('\n');
  assert.match(ddl, /ENGINE=InnoDB/);
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS whatsapp_processed_messages/);
  assert.match(ddl, /idx_whatsapp_messages_created/);
  assert.doesNotMatch(ddl, /ON CONFLICT|INSERT OR IGNORE|AUTOINCREMENT/);
});

test('WhatsApp store awaits idempotency writes and uses MySQL transactions for token redemption', async () => {
  const db = mockDatabase();
  const store = await createWhatsAppStore(db);

  assert.equal(await store.claimMessage('message-1'), true);
  assert.equal(db.statements.at(-1).sql.startsWith('INSERT IGNORE'), true);
  assert.equal(await store.getMeta('missing'), null);
  assert.deepEqual(await store.redeemLinkToken('BMN-ABCDEFGH', '0212345678'), {
    ok: true,
    userId: 'user-1'
  });
  assert.deepEqual(db.transactionEvents, ['begin', 'commit', 'release']);
  assert.ok(db.statements.some(({ sql }) => sql.includes('FOR UPDATE')));
  assert.ok(db.statements.some(({ sql }) => sql.includes('ON DUPLICATE KEY UPDATE')));
});
