// Perekam riwayat beban runtime: harus diam bila tabel belum ada, tidak boleh
// menjatuhkan permintaan ketika database bermasalah, dan memangkas baris tua.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHealthHistoryRecorder } from '../server/healthHistory.mjs';

function fakeDatabase({ tableMissing = false, failOn = null, rowCount = 0 } = {}) {
  const calls = [];
  const db = {
    // Tiruan semantik mysql2: setiap panggilan mengembalikan [rows, fields].
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (failOn && sql.includes(failOn)) throw new Error('koneksi database putus');
      if (/^SHOW TABLES/i.test(normalized)) return [tableMissing ? [] : [{ table: 'health_samples' }], []];
      if (/^SELECT captured_at/i.test(normalized)) {
        return [[{
          captured_at: '2026-11-06 00:00:00',
          uptime_seconds: 12,
          backend: 'legacy',
          metrics_json: '{"uptime_seconds":12,"data_backend":"legacy"}'
        }], []];
      }
      if (/^(INSERT|DELETE)/i.test(normalized)) return [{ affectedRows: rowCount }, []];
      return [[], []];
    },
    async query(sql, params = []) {
      return db.execute(sql, params);
    }
  };
  const recorder = createHealthHistoryRecorder({
    db,
    intervalMs: 60000,
    snapshot: () => ({
      uptime_seconds: 12.6,
      data_backend: 'legacy',
      memory: { rss_mb: 120.5 },
      database: { pool_errors: 0 }
    })
  });
  return { db, calls, recorder };
}

test('riwayat mencatat satu baris dan memangkas baris tua', async () => {
  const { calls, recorder } = fakeDatabase({ rowCount: 3 });
  const result = await recorder.record();
  assert.equal(result.written, true);
  assert.equal(recorder.stats().writes, 1);
  assert.equal(recorder.stats().pruned, 3);
  const insert = calls.find((call) => call.sql.includes('INSERT INTO health_samples'));
  assert.ok(insert, 'baris riwayat ditulis');
  assert.equal(insert.params[1], 13, 'uptime dibulatkan');
  assert.equal(insert.params[2], 'legacy');
  assert.equal(JSON.parse(insert.params[3]).memory.rss_mb, 120.5);
  assert.ok(calls.some((call) => call.sql.includes('DELETE FROM health_samples WHERE captured_at')));
});

test('tabel yang belum ada hanya dilewati, tidak dianggap error', async () => {
  const { calls, recorder } = fakeDatabase({ tableMissing: true });
  const result = await recorder.record();
  assert.match(result.skipped, /health_samples/);
  assert.equal(recorder.stats().table_ready, false);
  assert.equal(recorder.stats().last_error, null);
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO health_samples')).length, 0);
});

test('kegagalan database dicatat dan tidak dilempar keluar', async () => {
  const { recorder } = fakeDatabase({ failOn: 'INSERT INTO health_samples' });
  const result = await recorder.record();
  assert.match(result.skipped, /koneksi database putus/);
  assert.equal(recorder.stats().writes, 0);
  assert.match(recorder.stats().last_error, /koneksi database putus/);
});

test('perekam yang dimatikan tidak menyentuh database sama sekali', async () => {
  const { db, calls } = fakeDatabase({});
  const disabled = createHealthHistoryRecorder({ db, intervalMs: 0, snapshot: () => ({}) });
  assert.equal(disabled.stats().enabled, false);
  const result = await disabled.record();
  assert.match(result.skipped, /dimatikan/);
  assert.equal(calls.length, 0);
});

test('riwayat terakhir terbaca untuk diagnostik', async () => {
  const { recorder } = fakeDatabase({});
  const recent = await recorder.recent(5);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].metrics.data_backend, 'legacy');
  assert.equal(recorder.stats().table_ready, true);
});

test('ringkasan publik menyembunyikan pesan error asli', async () => {
  const { recorder } = fakeDatabase({ failOn: 'INSERT INTO health_samples' });
  await recorder.record();
  const summary = recorder.summary();
  assert.equal(summary.enabled, true);
  assert.equal(summary.interval_ms, 60000);
  assert.equal(summary.has_error, true, 'keberadaan error tetap terlihat');
  assert.equal(summary.last_error, undefined, 'isi error hanya lewat stats() untuk Administrator');
  assert.equal(summary.table_ready, true);
});

test('riwayat kesehatan ikut pada ringkasan beban', async () => {
  const { recorder } = fakeDatabase({});
  const summary = recorder.summary();
  assert.equal(summary.table_ready, false, 'tabel belum diperiksa sampai ada permintaan');
  await recorder.record();
  assert.equal(recorder.summary().writes, 1);
  assert.ok(recorder.summary().last_write_at, 'waktu tulisan terakhir tercatat');
});

test('setelah stop pencatatan tidak bangkit sendiri, dan start mengaktifkannya lagi', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const { calls, recorder } = fakeDatabase({});

  recorder.start();
  t.mock.timers.tick(20000);
  await flush();
  const writtenAfterFirst = calls.filter((call) => call.sql.includes('INSERT INTO health_samples')).length;
  assert.equal(writtenAfterFirst, 1, 'sampel pertama tertulis');

  recorder.stop();
  t.mock.timers.tick(10 * 60 * 1000);
  await flush();
  assert.equal(
    calls.filter((call) => call.sql.includes('INSERT INTO health_samples')).length,
    1,
    'record() yang tertunda tidak boleh menjadwalkan ulang sesudah stop'
  );

  recorder.start();
  t.mock.timers.tick(20000);
  await flush();
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO health_samples')).length, 2);
});

test('nama tabel asing tidak pernah disisipkan apa adanya', async () => {
  const calls = [];
  const recorder = createHealthHistoryRecorder({
    db: {
      async execute(sql) {
        calls.push(sql.replace(/\s+/g, ' ').trim());
        if (/^SHOW TABLES/i.test(calls[calls.length - 1])) return [[{ table: 'x' }], []];
        return [[], [{ affectedRows: 0 }]];
      },
      async query(sql) {
        return this.execute(sql);
      }
    },
    tableName: 'health_samples; DROP TABLE app_data',
    intervalMs: 60000,
    snapshot: () => ({ uptime_seconds: 1 })
  });
  await recorder.record();
  const insert = calls.find((sql) => sql.includes('INSERT INTO'));
  assert.match(insert, /INSERT INTO health_samples /, 'nama tabel dipatok ke bawaan yang aman');
  assert.equal(insert.includes('DROP'), false);
});
