// Retensi audit trail: yang lama dipindahkan ke arsip, bukan dibuang, dan tidak pernah
// menyentuh catatan bertanggal tidak terbaca. Juga memastikan job latar belakang tidak
// bisa melempar error ke luar atau menimpa simpanan pengguna.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuditRetentionJob,
  retentionCutoffDate,
  splitAuditLogsByLimit,
  splitAuditLogsByRetention
} from '../server/auditRetention.mjs';
import { createAuditReplayGuard } from '../server/auditReplayGuard.mjs';
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

test('batas jumlah menahan entri terbaru dan mengarsipkan sisanya', () => {
  const logs = [
    { id: 'a', tanggal: '2026-10-01' },
    { id: 'b', tanggal: '2026-10-02' },
    { id: 'c', tanggal: '2026-10-03' },
    { id: 'tanpa-tanggal' }
  ];
  const { keep, overflow } = splitAuditLogsByLimit(logs, 2);
  assert.deepEqual(overflow.map((entry) => entry.id), ['a'], 'yang digeser adalah yang paling lama');
  assert.deepEqual(keep.map((entry) => entry.id), ['b', 'c', 'tanpa-tanggal'], 'urutan aktif dipertahankan');
  assert.deepEqual(splitAuditLogsByLimit(logs, 0).overflow, [], '0 berarti tidak dibatasi');
  assert.deepEqual(splitAuditLogsByLimit(logs, 99).overflow, [], 'di bawah batas tidak ada yang digeser');
});

test('job hanya dengan batas jumlah tetap bekerja tanpa batas umur', async () => {
  const fake = fakeDatabase({
    auditLogs: [
      { id: 'paling-lama', tanggal: '2020-01-01' },
      { id: 'tengah', tanggal: '2026-06-01' },
      { id: 'terbaru', tanggal: currentMakassarDate() }
    ]
  });
  const job = createAuditRetentionJob({ db: fake.db, dataBackend: 'legacy', activeLimit: 2 });
  const result = await job.runOnce();
  assert.equal(result.archived, 1);
  assert.equal(result.remaining, 2);
  assert.deepEqual(result.archivedIds, ['paling-lama'], 'id yang diarshif diserahkan ke gardi replay');
  assert.deepEqual(fake.state.appDataWrites[0].map((entry) => entry.id), ['tengah', 'terbaru']);
  assert.equal(job.stats().enabled, true, 'batas jumlah saja sudah mengaktifkan penataan');
  assert.equal(job.stats().retention_days, 0);
  assert.equal(job.stats().active_limit, 2);
  assert.equal(fake.getRevision(), '8');
});

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
  assert.deepEqual(result, { archived: 2, remaining: 1, archivedIds: ['log-1', 'log-3'] });
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
  assert.deepEqual(result, { archived: 0, remaining: 1, archivedIds: [] });
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

test('entri tanpa id tidak ikut terbuang saat catatan tanpa id diarshif', async () => {
  // Regression: pengeluaran entri pernah ditafsirkan lewat nilai id. Entri arsip yang
  // id-nya kosong membuat kunci '' ikut cocok, dan setiap catatan tanpa id — yang tidak
  // pernah boleh disentuh retensi — hilang dari state aktif.
  const logs = [
    { id: '', tanggal: '2020-01-01', aktivitas: 'Lama tanpa id' },
    { aktivitas: 'Tanpa id dan tanpa tanggal' },
    { aktivitas: 'Satu lagi tanpa tanggal' },
    { id: 'log-baru', tanggal: currentMakassarDate() }
  ];
  const fake = fakeDatabase({ auditLogs: logs });
  const job = createAuditRetentionJob({ db: fake.db, dataBackend: 'legacy', retentionDays: 180 });
  const result = await job.runOnce();
  assert.equal(result.archived, 1);
  assert.deepEqual(
    fake.state.appDataWrites[0].map((entry) => entry.aktivitas),
    ['Tanpa id dan tanpa tanggal', 'Satu lagi tanpa tanggal', undefined],
    'hanya entri yang benar-benar diarshif yang keluar'
  );
});

test('id hasil arsip diserahkan ke gardi replay sebelum cache diisi ulang', async () => {
  const urutan = [];
  const guard = createAuditReplayGuard();
  const stub = {
    setEnabled: (nilai) => guard.setEnabled(nilai),
    track: (ids) => {
      urutan.push('track');
      return guard.track(ids);
    },
    strip: (logs) => guard.strip(logs),
    stats: () => guard.stats()
  };
  const fake = fakeDatabase({
    auditLogs: [
      { id: 'lama-1', tanggal: '2019-01-01' },
      { id: 'lama-2', tanggal: '2019-02-01' },
      { id: 'sekarang', tanggal: currentMakassarDate() }
    ]
  });
  const job = createAuditRetentionJob({
    db: fake.db,
    dataBackend: 'legacy',
    retentionDays: 180,
    replayGuard: stub,
    refreshAfterRun: async () => urutan.push('refresh')
  });
  assert.equal(guard.stats().enabled, true, 'retensi aktif menyalakan gardi');
  const result = await job.runOnce();
  assert.deepEqual(result.archivedIds, ['lama-1', 'lama-2']);
  assert.deepEqual(urutan, ['track', 'refresh'], 'penahan dipasang sebelum state disajikan lagi');
  assert.equal(guard.has('lama-1'), true);
  assert.equal(guard.has('sekarang'), false, 'entri yang masih aktif tidak ikut ditahan');
  assert.equal(job.summary().replay_guard, true);
});

test('gardi replay tidak berbuat apa-apa selama retensi dimatikan', () => {
  const guard = createAuditReplayGuard();
  const logs = [{ id: 'a' }, { id: 'b' }];
  assert.equal(guard.track(['a']), 0, 'id tidak ditahan sebelum diizinkan');
  assert.equal(guard.has('a'), false);
  const hasil = guard.strip(logs);
  assert.equal(hasil.removed, 0);
  assert.equal(hasil.keep, logs, 'array yang sama dikembalikan, tanpa alokasi baru');
  assert.equal(guard.stats().blocked_total, 0);
});

test('gardi replay mengeluarkan id arsip dan menghitungnya', () => {
  const guard = createAuditReplayGuard();
  guard.setEnabled(true);
  assert.equal(guard.track(['arsip-1', 'arsip-2', '', 'arsip-1']), 2, 'id kosong dan duplikat tidak dihitung');
  const hasil = guard.strip([{ id: 'arsip-1', tanggal: '2019-01-01' }, { id: 'hidup' }, { tanggal: 'tanpa id' }]);
  assert.deepEqual(hasil.removedIds, ['arsip-1']);
  assert.deepEqual(hasil.keep.map((entry) => entry.id), ['hidup', undefined]);
  assert.equal(guard.stats().blocked_total, 1);
  assert.equal(typeof guard.stats().last_blocked_at, 'string');
  assert.equal(guard.strip([{ id: 'arsip-1' }]).keep.length, 0, 'id arsip tidak pernah diselamatkan');
});

test('daftar id yang ditahan dibatasi dan yang paling tua menguap lebih dulu', () => {
  const guard = createAuditReplayGuard({ maxTrackedIds: 3 });
  guard.setEnabled(true);
  guard.track(['satu', 'dua', 'tiga', 'empat']);
  assert.equal(guard.stats().tracked, 3);
  assert.equal(guard.has('satu'), false, 'yang tertua dilepas, bukan yang terbaru');
  assert.equal(guard.has('empat'), true);
  guard.setEnabled(false);
  assert.equal(guard.stats().tracked, 0, 'retensi dimatikan mengosongkan ingatan gardi');
});
