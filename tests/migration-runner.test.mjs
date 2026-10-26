import assert from 'node:assert/strict';
import test from 'node:test';
import { createMigrationRunner, listMigrationFiles, parseStatements } from '../migrate.mjs';

test('parseStatements splits plain SQL and preserves semicolons inside quotes and identifiers', () => {
  assert.deepEqual(parseStatements('CREATE TABLE a (id INT); INSERT INTO a VALUES (1);'), [
    'CREATE TABLE a (id INT)',
    'INSERT INTO a VALUES (1)'
  ]);
  assert.deepEqual(parseStatements("CREATE TABLE b (j VARCHAR(10) DEFAULT ';' );"), [
    "CREATE TABLE b (j VARCHAR(10) DEFAULT ';' )"
  ]);
  assert.deepEqual(parseStatements(''), []);
});

test('listMigrationFiles lists only sql files in a sorted order', () => {
  const files = listMigrationFiles();
  for (const file of files) assert.match(file, /\.sql$/);
  assert.deepEqual(files, [...files].sort());
});

test('migration runner applies pending files once and skips them afterwards', async () => {
  const _statements = [];
  const executed = [];
  const rows = { schema_migrations: [] };
  const client = {
    execute: async (sql, params) => {
      executed.push(sql.trim());
      if (/INSERT INTO schema_migrations/.test(sql)) rows.schema_migrations.push({ filename: params[0] });
    },
    query: async sql => {
      executed.push(sql.trim());
      if (sql.includes('SELECT filename')) return [rows.schema_migrations];
      if (sql.includes('CREATE TABLE')) return [];
      return [];
    }
  };
  const runner = createMigrationRunner({ client, log: () => {} });
  const pending = await runner.run();
  assert.equal(pending > 0, true);
  const before = executed.length;
  const second = await runner.run();
  assert.equal(second, 0);
  assert.ok(executed.length > before); // CREATE TABLE IF NOT EXISTS + SELECT tetap jalan
  assert.ok(rows.schema_migrations.length > 0);
});

test('rollbacks when a migration statement fails and records nothing', async () => {
  const rows = [];
  const client = {
    execute: async sql => {
      if (/CREATE TABLE/.test(sql) && !sql.includes('schema_migrations')) throw new Error('boom');
      return [];
    },
    query: async sql => {
      if (sql === 'ROLLBACK') throw new Error('connection gone');
      if (sql.includes('SELECT filename')) return [rows];
      return [];
    }
  };
  const runner = createMigrationRunner({ client, log: () => {} });
  await assert.rejects(
    () => runner.run(),
    /Migration failed/
  );
  assert.deepEqual(rows, [], 'tidak ada pencatatan migrasi ketika gagal');
});
