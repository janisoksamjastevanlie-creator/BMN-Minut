// Retensi audit trail.
//
// auditLogs ikut terkirim pada setiap sinkronisasi state whole-state, sehingga
// pertumbuhannya memperbesar payload dan waktu parsing semua pengguna. Kebijakan
// menghapus catatan resmi bukan keputusan teknis, jadi retensi dimatikan secara
// bawaan (AUDIT_RETENTION_DAYS=0). Bila diaktifkan, catatan lama tidak dibuang:
// dipindahkan ke tabel audit_log_archive dan masih dapat dibaca kembali.
//
// Prinsip aman:
// - hanya catatan bertanggal ISO yang sah yang boleh diarshif, catatan tanpa tanggal
//   terbaca tetap ditinggal;
// - perubahan dilakukan di dalam transaksi yang mengunci baris revision, sama seperti
//   penyimpanan state biasa, sehingga tidak menimpa simpanan pengguna yang berjalan;
// - urutan auditLogs yang tersisa tidak diubah, hanya entri arsip yang dikeluarkan;
// - kegagalan job hanya dicatat, tidak pernah mengganggu permintaan biasa.
import { currentMakassarDate } from './datetime.mjs';
import { execute, queryOne } from './db.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ENTRIES_PER_RUN = 5000;
const INSERT_CHUNK = 200;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Batas memakai tanggal Makassar/WITA agar satu tafsir dengan tanggal pencatatan audit.
export function retentionCutoffDate(retentionDays, today = currentMakassarDate()) {
  const days = Math.round(Number(retentionDays));
  if (!Number.isFinite(days) || days <= 0) return null;
  if (!ISO_DATE.test(String(today))) return null;
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function splitAuditLogsByRetention(logs, cutoffDate) {
  const keep = [];
  const archive = [];
  for (const entry of Array.isArray(logs) ? logs : []) {
    const tanggal = typeof entry?.tanggal === 'string' ? entry.tanggal : '';
    if (cutoffDate && ISO_DATE.test(tanggal) && tanggal < cutoffDate) archive.push(entry);
    else keep.push(entry);
  }
  return { keep, archive };
}

async function insertArchiveChunk(connection, entries) {
  const placeholders = entries.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const params = entries.flatMap((entry) => [
    String(entry.id || ''),
    JSON.stringify(entry),
    entry.tanggal,
    entry.modul || null,
    entry.aktivitas || null
  ]);
  await execute(connection, `
    INSERT INTO audit_log_archive (id, entry_json, tanggal, modul, aktivitas)
    VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE entry_json = VALUES(entry_json)
  `, params);
}

async function runLegacyRetention(connection, cutoffDate) {
  const [rows] = await connection.execute("SELECT value_json FROM app_data WHERE `key` = 'auditLogs'");
  if (!rows.length) return { archived: 0, remaining: 0 };
  let logs;
  try {
    logs = JSON.parse(rows[0].value_json);
  } catch {
    // Blob yang rusak bukan urusan retensi; jangan pernah menulis ulang.
    return { archived: 0, remaining: 0, skipped: 'auditLogs tidak dapat dibaca' };
  }
  const { keep, archive } = splitAuditLogsByRetention(logs, cutoffDate);
  const batch = archive.slice(0, MAX_ENTRIES_PER_RUN);
  if (!batch.length) return { archived: 0, remaining: keep.length };
  const archivedIds = new Set(batch.map((entry) => String(entry.id || '')));
  for (let index = 0; index < batch.length; index += INSERT_CHUNK) {
    await insertArchiveChunk(connection, batch.slice(index, index + INSERT_CHUNK));
  }
  // Urutan asli dipertahankan: hanya entri yang benar-benar sudah masuk arsip yang
  // dikeluarkan, sisa catatan lama dari batch berikutnya tetap tertinggal untuk run selanjutnya.
  await execute(connection, `
    INSERT INTO app_data (\`key\`, value_json) VALUES ('auditLogs', ?)
    ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
  `, [JSON.stringify(logs.filter((entry) => !archivedIds.has(String(entry.id || ''))))]);
  return { archived: batch.length, remaining: logs.length - batch.length };
}

async function runOperationalRetention(connection, cutoffDate) {
  const [candidates] = await connection.execute(
    'SELECT id FROM audit_logs WHERE tanggal IS NOT NULL AND tanggal < ? ORDER BY tanggal LIMIT ?',
    [cutoffDate, MAX_ENTRIES_PER_RUN]
  );
  if (!candidates.length) return { archived: 0, remaining: 0 };
  const ids = candidates.map((row) => row.id);
  const markers = ids.map(() => '?').join(',');
  await execute(connection, `
    INSERT IGNORE INTO audit_log_archive
      (id, user_id, user_name, user_role, aktivitas, modul, tanggal, waktu, ip_address, detail)
    SELECT id, user_id, user_name, user_role, aktivitas, modul, tanggal, waktu, ip_address, detail
    FROM audit_logs
    WHERE id IN (${markers})
  `, ids);
  // Hanya baris yang sudah dicoba arsipkan pada langkah sebelumnya yang dihapus.
  await execute(connection, `DELETE FROM audit_logs WHERE id IN (${markers})`, ids);
  const [rest] = await connection.execute('SELECT COUNT(*) AS total FROM audit_logs');
  return { archived: ids.length, remaining: Number(rest[0]?.total || 0) };
}

async function archiveTableExists(db) {
  try {
    const [rows] = await db.query("SHOW TABLES LIKE 'audit_log_archive'");
    return rows.length > 0;
  } catch {
    return false;
  }
}

// Revision dikunci lebih dulu agar job tidak pernah bertabrakan dengan PUT /api/state.
async function withRevisionLock(db, work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const revisionRow = await queryOne(
      connection,
      "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE"
    );
    const revision = Number(revisionRow?.value || 0);
    const result = await work(connection);
    if (result?.archived > 0) {
      await execute(connection, `
        INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [String(revision + 1)]);
    }
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Koneksi mungkin sudah mati; error asli tetap yang dilaporkan.
    }
    throw error;
  } finally {
    connection.release();
  }
}

export function createAuditRetentionJob({
  db,
  dataBackend,
  retentionDays,
  intervalMs,
  runAfterMs,
  refreshAfterRun
} = {}) {
  const days = Number.isFinite(Number(retentionDays)) ? Math.max(0, Math.round(Number(retentionDays))) : 0;
  const pollMs = positiveInteger(intervalMs, 6 * 60 * 60 * 1000);
  const firstDelayMs = positiveInteger(runAfterMs, 45 * 1000);
  const stats = {
    enabled: days > 0,
    retention_days: days,
    interval_ms: pollMs,
    backend: dataBackend === 'operational' ? 'operational' : 'legacy',
    runs: 0,
    archived_total: 0,
    last_run_at: null,
    last_archived: 0,
    last_error: null
  };
  const timers = [];

  async function runOnce() {
    if (!stats.enabled) return { skipped: 'retensi dimatikan (AUDIT_RETENTION_DAYS=0)' };
    const cutoffDate = retentionCutoffDate(days);
    stats.runs += 1;
    stats.last_run_at = new Date().toISOString();
    if (!cutoffDate) return { skipped: 'tanggal hari ini tidak terbaca' };
    if (stats.backend === 'operational' && !(await archiveTableExists(db))) {
      // Mode operasional tidak menjalankan DDL saat startup, jadi arsip harus disiapkan
      // lewat migrasi lebih dulu. Kondisi ini bukan error runtime, hanya belum aktif.
      stats.pending_migration = 'migrations/audit-log-archive-v1.sql';
      return { skipped: 'tabel audit_log_archive belum ada; terapkan migrasi retensi' };
    }
    stats.pending_migration = null;
    try {
      const result = await withRevisionLock(db, (connection) =>
        stats.backend === 'operational'
          ? runOperationalRetention(connection, cutoffDate)
          : runLegacyRetention(connection, cutoffDate)
      );
      stats.last_archived = result?.archived || 0;
      stats.archived_total += stats.last_archived;
      if (stats.last_archived > 0) {
        console.log(
          `[diagnostic] audit_retention archived=${stats.last_archived} cutoff=${cutoffDate} backend=${stats.backend}`
        );
        if (refreshAfterRun) await refreshAfterRun();
      }
      return result;
    } catch (error) {
      // Job latar belakang tidak boleh menjatuhkan permintaan; sebabnya cukup tercatat.
      stats.last_error = error instanceof Error ? error.message : String(error);
      console.error(`[diagnostic] audit_retention_failed ${stats.last_error}`);
      return { skipped: stats.last_error };
    }
  }

  function start() {
    if (!stats.enabled || timers.length) return;
    const schedule = () => {
      const timer = setTimeout(() => {
        void runOnce().finally(schedule);
      }, pollMs);
      timer.unref();
      // Hanya ada satu timer tertunda pada satu waktu, jadi daftar lama cukup diganti.
      timers.length = 0;
      timers.push(timer);
    };
    const first = setTimeout(() => {
      void runOnce().finally(schedule);
    }, firstDelayMs);
    first.unref();
    timers.push(first);
  }

  // Ringkasan aman untuk /api/health (tanpa teks error): jumlah dan kapan terakhir jalan.
  function summary() {
    return {
      enabled: stats.enabled,
      retention_days: stats.retention_days,
      runs: stats.runs,
      archived_total: stats.archived_total,
      last_run_at: stats.last_run_at,
      has_error: Boolean(stats.last_error)
    };
  }

  function stop() {
    for (const timer of timers) clearTimeout(timer);
    timers.length = 0;
  }

  return { stats: () => ({ ...stats }), summary, runOnce, start, stop };
}
