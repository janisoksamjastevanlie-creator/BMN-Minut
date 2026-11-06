// Riwayat kesehatan di dalam aplikasi.
//
// Hosting terkelola hanya menyimpan log pembangunan, bukan keluaran proses saat
// berjalan, sehingga gangguan yang terjadi tengah malam tidak meninggalkan jejak
// yang bisa dibaca pagi harinya. Recorder ini menyimpan satu ringkasan beban setiap
// beberapa menit ke database — termasuk fakta bahwa proses baru saja berganti —
// sehingga pola (restart berulang, memori naik, event loop macet) terlihat dari
// /api/health/detail tanpa perlu membuka server.
import crypto from 'node:crypto';
import { execute } from './db.mjs';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 7;
const MIN_INTERVAL_MS = 60 * 1000;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function parseMetrics(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function createHealthHistoryRecorder({
  db,
  snapshot,
  intervalMs,
  runAfterMs,
  retentionDays,
  tableName = 'health_samples'
} = {}) {
  const pollMs = positiveInteger(intervalMs, DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS);
  const firstDelayMs = positiveInteger(runAfterMs, 20 * 1000, 1000);
  const keepDays = positiveInteger(retentionDays, DEFAULT_RETENTION_DAYS, 1);
  const enabled = Number(intervalMs) !== 0;
  const table = /^[A-Za-z0-9_]+$/.test(String(tableName)) ? String(tableName) : 'health_samples';
  const stats = {
    enabled,
    interval_ms: pollMs,
    table: table,
    table_ready: false,
    writes: 0,
    pruned: 0,
    last_write_at: null,
    last_error: null
  };
  const timers = [];
  let stopped = false;

  async function ensureTable() {
    // SHOW TABLES dan LIMIT dibaca lewat koneksi tanpa prepared statement supaya
    // tidak bergantung pada dukungan server untuk pernyataan administratif.
    const [rows] = await db.query(`SHOW TABLES LIKE '${table}'`);
    stats.table_ready = rows.length > 0;
    return stats.table_ready;
  }

  // Satu baris per pemeriksaan: kolom terpisah untuk yang sering dibandingkan,
  // sisanya utuh sebagai JSON supaya tidak perlu mengubah skema tiap kali ada
  // indikator baru.
  async function record() {
    if (!stats.enabled) return { skipped: 'riwayat kesehatan dimatikan (HEALTH_HISTORY_INTERVAL_MS=0)' };
    if (!stats.table_ready && !(await ensureTable())) {
      // Mode operasional tidak menjalankan DDL saat start; pencatatan menunggu migrasi.
      stats.last_error = null;
      return { skipped: `tabel ${table} belum ada; terapkan migrasi riwayat kesehatan` };
    }
    try {
      const sample = snapshot() || {};
      await execute(db, `
        INSERT INTO ${table} (id, uptime_seconds, backend, metrics_json)
        VALUES (?, ?, ?, ?)
      `, [
        crypto.randomUUID(),
        Number.isFinite(Number(sample.uptime_seconds)) ? Math.round(Number(sample.uptime_seconds)) : null,
        typeof sample.data_backend === 'string' ? sample.data_backend.slice(0, 20) : null,
        JSON.stringify(sample)
      ]);
      stats.writes += 1;
      stats.last_write_at = new Date().toISOString();
      const removed = await execute(db, `
        DELETE FROM ${table} WHERE captured_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [keepDays]);
      stats.pruned += Number(removed?.affectedRows || 0);
      return { written: true, kept_days: keepDays };
    } catch (error) {
      // Pencatatan latar belakang tidak boleh menjatuhkan permintaan maupun proses.
      stats.last_error = error instanceof Error ? error.message : String(error);
      console.error(`[diagnostic] health_history_failed ${stats.last_error}`);
      return { skipped: stats.last_error };
    }
  }

  async function recent(limit = 50) {
    const bounded = positiveInteger(limit, 50, 1);
    if (!stats.table_ready && !(await ensureTable())) return [];
    try {
      const [rows] = await db.query(`
        SELECT captured_at, uptime_seconds, backend, metrics_json
        FROM ${table} ORDER BY captured_at DESC LIMIT ${bounded}
      `);
      return rows.map((row) => ({
        captured_at: row.captured_at,
        uptime_seconds: row.uptime_seconds,
        backend: row.backend,
        metrics: parseMetrics(row.metrics_json)
      }));
    } catch (error) {
      stats.last_error = error instanceof Error ? error.message : String(error);
      return [];
    }
  }

  function start() {
    if (!stats.enabled || timers.length) return;
    stopped = false;
    const schedule = () => {
      if (stopped) return;
      const timer = setTimeout(() => {
        void record().finally(schedule);
      }, pollMs);
      timer.unref();
      timers.length = 0;
      timers.push(timer);
    };
    const first = setTimeout(() => {
      void record().finally(schedule);
    }, firstDelayMs);
    first.unref();
    timers.push(first);
  }

  function stop() {
    // Sampah penjaga: record() yang masih berjalan memanggil schedule() pada
    // finally, jadi tanpa bendera ini pencatat bisa bangun lagi sesudah shutdown.
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.length = 0;
  }

  // Ringkasan tanpa isi pesan error: cukup untuk /api/health publik bahwa
  // pencatatan riwayat benar-benar aktif, detail lengkap tetap untuk Administrator.
  function summary() {
    return {
      enabled: stats.enabled,
      interval_ms: stats.interval_ms,
      table_ready: stats.table_ready,
      writes: stats.writes,
      pruned: stats.pruned,
      last_write_at: stats.last_write_at,
      has_error: Boolean(stats.last_error)
    };
  }

  return { stats: () => ({ ...stats }), summary, record, recent, start, stop };
}
