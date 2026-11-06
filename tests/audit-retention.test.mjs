// Retensi audit trail: yang lama dipindahkan ke arsip, bukan dibuang, dan tidak pernah
// menyentuh catatan bertanggal tidak terbaca. Juga memastikan job latar belakang tidak
// bisa melempar error ke luar atau menimpa simpanan pengguna.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuditRetentionJob,
  retentionCutoffDate,
  splitAuditLogsByRetention
} from '../server/auditRetention.mjs';
import { currentMakassarDate } from '../server/datetime.mjs';

function fakeDatabase({ auditLogs, rawAuditLogs, failOn, operationalArchiveMissing = false } = {}) {
  const calls = [];
  let appDataJson = rawAuditLogs ?? (auditLogs === undefined ? null : JSON.stringify(auditLogs));
  let revision = '7';
  const state = { archived: [], appDataWrites: [], commit: 0, rollback: 0, release: 0 };

  const connection = {
    async execute(sql, params = []) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (failOn && sql.includes(failOn)) throw new Error('koneksi database putus');
      if (sql.includes("FROM app_data WHERE `key` = 'auditLogs'")) {
        return [appDataJson === null ? [] : [{ value_json: appDataJson }]];
      }
      if (sql.includes('INSERT INTO audit_log_archive (id, entry_json')) {
        state.archived.push(...params.filter((_, index) => index % 5 === 0));
        return [{}];
      }
      if (sql.includes("VALUES ('auditLogs', ?)")) {
        state.appDataWrites.push(JSON.parse(params[0]));
        appDataJson = params[0];
        return [{}];
      }
      if (sql.includes('SELECT id FROM audit_logs')) {
        return [operationalArchiveMissing ? [{ id: 'log-1' }] : [{ id: 'log-1' }]];
      }
      if (sql.includes('INSERT IGNORE INTO audit_log_archive')) return [{}];
      if (sql.includes('DELETE FROM audit_logs')) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT COUNT(*) AS total FROM audit_logs')) return [[{ total: 0 }]];
      if (sql.includes("WHERE `key` = 'revision' FOR UPDATE")) return [[{ value: revision }]];
      if (sql.includes("VALUES ('revision', ?)")) {
        revision = params[0];
        return [{}];
      }
      return [[]];
    },
    async beginTransaction() {
      state.begin = (state.begin || 0) + 1;
    },
    async commit() {
      state.commit += 1;
    },
    async rollback() {
      state.rollback += 1;
    },
    release() {
      state.release += 1;
    }
  };

  const db = {
    async getConnection() {
      return connection;
    },
    async query(sql) {
      calls.push({ sql: sql.trim() });
      if (sql.includes("SHOW TABLES LIKE 'audit_log_archive'")) {
        return [operationalArchiveMissing ? [] : [{ table: 'audit_log_archive' }]];
      }
      return [[]];
    }
  };
  return { db, calls, state, getRevision: () => revision };
}

test('cutoff hanya ada bila retensi diaktifkan', () => {
  assert.equal(retentionCutoffDate(0), null);
  assert.equal(retentionCutoffDate(-5), null);
  assert.equal(retentionCutoffDate('abc'), null);
  const cutoff = retentionCutoffDate(30, '2026-11-06');
  assert.equal(cutoff, '2026-10-07');
  assert.equal(retentionCutoffDate(30, 'bukan-tanggal'), null);
});

test('pemisahan catatan tidak pernah menyentuh entri tanpa tanggal sah', () => {
  const logs = [
    { id: 'lama', tanggal: '2025-01-01' },
    { id: 'baru', tanggal: '2026-11-05' },
    { id: 'tanpa-tanggal' },
    { id: 'waktu-aneh', tanggal: '05-11-2026' },
    { id: 'nol', tanggal: '' }
  ];
  const { keep, archive } = splitAuditLogsByRetention(logs, '2026-11-01');
  assert.deepEqual(archive.map((entry) => entry.id), ['lama']);
  assert.deepEqual(keep.map((entry) => entry.id), ['baru', 'tanpa-tanggal', 'waktu-aneh', 'nol']);
  assert.deepEqual(splitAuditLogsByRetention(undefined, '2026-11-01'), { keep: [], archive: [] });
});

test('job dimatikan bawaan: tidak ada satu pun pertanyaan database', async () => {
  const fake = fakeDatabase({ auditLogs: [{ id: 'x', tanggal: '2020-01-01' }] });
  const job = createAuditRetentionJob({ db: fake.db, dataBackend: 'legacy', retentionDays: 0 });
  assert.equal(job.stats().enabled, false);
  const result = await job.runOnce();
  assert.match(result.skipped, /AUDIT_RETENTION_DAYS=0/);
  assert.equal(fake.calls.length, 0);
});

test('retensi legacy mengarsipkan catatan tua, memelihara urutan, dan menaikkan revision', async () => {
  const today = currentMakassarDate();
  const logs = [
    { id: 'log-1', tanggal: '2020-01-01', modul: 'PERSEDIAAN', aktivitas: 'Lama' },
    { id: 'log-2', tanggal: today, modul: 'DOKUMEN', aktivitas: 'Baru' },
    { id: 'log-3', tanggal: '2019-06-06', modul: 'ATK', aktivitas: 'Lebih lama' }
  ];
  const refreshes = [];
  const fake = fakeDatabase({ auditLogs: logs });
  const job = createAuditRetentionJob({
    db: fake.db,
    dataBackend: 'legacy',
    retentionDays: 180,
    refreshAfterRun: async () => refreshes.push('force')
  });

  const result = await job.runOnce();
  assert.deepEqual(result, { archived: 2, remaining: 1 });
  assert.deepEqual(fake.state.archived, ['log-1', 'log-3']);
  assert.deepEqual(fake.state.appDataWrites[0].map((entry) => entry.id), ['log-2'], 'urutan asli dipertahankan');
  assert.equal(fake.getRevision(), '8', 'revision dinaikkan supaya pengguna sinkron ulang');
  assert.deepEqual(refreshes, ['force']);
  assert.equal(fake.state.commit, 1);
  assert.equal(fake.state.release, 1);
  assert.equal(job.stats().archived_total, 2);
});

test('tanpa catatan tua tidak ada penulisan ulang state dan revision tetap', async () => {
  const logs = [{ id: 'log-1', tanggal: currentMakassarDate() }];
  const fake = fakeDatabase({ auditLogs: logs });
  const job = createAuditRetentionJob({ db: fake.db, dataBackend: 'legacy', retentionDays: 180 });
  const result = await job.runOnce();
  assert.deepEqual(result, { archived: 0, remaining: 1 });
  assert.equal(fake.state.appDataWrites.length, 0);
  assert.equal(fake.getRevision(), '7', 'tidak ada perubahan, tidak ada kenaikan revision');
  assert.equal(fake.state.commit, 1, 'transaksi tetap ditutup rapi');
});

test('kegagalan database hanya dicatat, tidak dilempar ke permintaan lain', async () => {
  const fake = fakeDatabase({
    auditLogs: [{ id: 'log-1', tanggal: '2019-01-01' }],
    failOn: 'INSERT INTO audit_log_archive'
  });
  const job = createAuditRetentionJob({ db: fake.db, dataBackend: 'legacy', retentionDays: 90 });
  const result = await job.runOnce();
  assert.match(result.skipped, /koneksi database putus/);
  assert.equal(job.stats().last_error, 'koneksi database putus');
  assert.equal(fake.state.rollback, 1, 'transaksi dibatalkan, state pengguna tidak tersentuh');
  assert.equal(fake.state.release, 1);
  assert.equal(fake.state.appDataWrites.length, 0);
});

test('blob auditLogs yang rusak dibiarkan apa adanya', async () => {
  const fake = fakeDatabase({ rawAuditLogs: '{bukan json' });
  const job = createAuditRetentionJob({ db: fake.db, dataBackend: 'legacy', retentionDays: 30 });
  const result = await job.runOnce();
  assert.equal(result.archived, 0);
  assert.match(result.skipped, /tidak dapat dibaca/);
  assert.equal(fake.state.appDataWrites.length, 0, 'isi rusak tidak pernah ditulis ulang');
  assert.equal(fake.state.commit, 1);
  assert.equal(fake.getRevision(), '7');
});

test('mode operasional menunggu migrasi arsip sebelum bekerja', async () => {
  const fake = fakeDatabase({ operationalArchiveMissing: true });
  const job = createAuditRetentionJob({ db: fake.db, dataBackend: 'operational', retentionDays: 90 });
  const result = await job.runOnce();
  assert.match(result.skipped, /audit_log_archive/);
  assert.equal(job.stats().pending_migration, 'migrations/audit-log-archive-v1.sql');
  assert.equal(fake.calls.filter((call) => call.sql.includes('FROM audit_logs')).length, 0);
});

test('mode operasional mengarsip lewat salinan tabel lalu menghapus baris aktif', async () => {
  const fake = fakeDatabase({});
  const job = createAuditRetentionJob({ db: fake.db, dataBackend: 'operational', retentionDays: 90 });
  const result = await job.runOnce();
  assert.equal(result.archived, 1);
  const sql = fake.calls.map((call) => call.sql).join(' | ');
  assert.match(sql, /INSERT IGNORE INTO audit_log_archive/);
  assert.match(sql, /DELETE FROM audit_logs WHERE id IN \(\?\)/);
  assert.equal(job.stats().pending_migration, null);
});

test('job berjalan berkala dan berhenti rapi saat shutdown', async () => {
  const fake = fakeDatabase({ auditLogs: [{ id: 'log-1', tanggal: currentMakassarDate() }] });
  const job = createAuditRetentionJob({
    db: fake.db,
    dataBackend: 'legacy',
    retentionDays: 180,
    runAfterMs: 20,
    intervalMs: 20
  });
  job.start();
  await new Promise((resolve) => setTimeout(resolve, 90));
  const runsWhileActive = job.stats().runs;
  assert.ok(runsWhileActive >= 2, `job berkala harus berjalan lebih dari sekali, jalan=${runsWhileActive}`);
  job.stop();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(job.stats().runs, runsWhileActive, 'stop() membatalkan jadwal yang masih tertunda');
});

test('ringkasan health tidak membocorkan teks error', async () => {
  const fake = fakeDatabase({ auditLogs: [{ id: 'log-1', tanggal: '2020-01-01' }], failOn: 'INSERT INTO audit_log_archive' });
  const job = createAuditRetentionJob({ db: fake.db, dataBackend: 'legacy', retentionDays: 180 });
  await job.runOnce();
  const summary = job.summary();
  assert.equal(summary.has_error, true, 'kegagalan tetap terdeteksi');
  assert.equal(summary.enabled, true);
  assert.equal(summary.retention_days, 180);
  assert.equal(typeof summary.last_run_at, 'string');
  assert.equal(JSON.stringify(summary).includes('koneksi database putus'), false, 'pesan error tidak ikut ke /api/health');
  assert.match(job.stats().last_error, /koneksi database putus/);
});
