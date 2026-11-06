// Pemantau kesehatan mandiri untuk bmnbpsminut.online.
//
// Dipanggil sekali per eksekusi supaya gampang dijadwalkan (cron hPanel setiap 5 menit).
// Hasil tiap pemeriksaan ditambahkan ke berkas riwayat sehingga pola gangguan — proses
// yang diam-diam berulang, permintaan lambat, memori mendekati batas — bisa dilihat
// sebelum pengguna melapor.
//
// Pemakaian:
//   node scripts/health-watchdog.mjs
//   node scripts/health-watchdog.mjs --url=https://bmnbpsminut.online --history=var/watch/health.jsonl
//
// Kode keluar: 0 sehat, 1 ada pelanggaran ambang, 2 server tidak dapat dijangkau.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  })
);

const url = String(argv.get('url') || process.env.HEALTH_WATCHDOG_URL || 'https://bmnbpsminut.online');
const historyFile = String(
  argv.get('history') || process.env.HEALTH_WATCHDOG_HISTORY || 'var/watch/health.jsonl'
);
const timeoutMs = Number(argv.get('timeout-ms') || 20000);
const maxLatencyMs = Number(argv.get('max-latency-ms') || 4000);
const maxMemoryRatio = Number(argv.get('max-memory-ratio') || 0.85);

function readPreviousSample() {
  try {
    const lines = fs
      .readFileSync(historyFile, 'utf8')
      .split('\n')
      .filter(Boolean);
    return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
  } catch {
    return null;
  }
}

function appendSample(sample) {
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.appendFileSync(historyFile, `${JSON.stringify(sample)}\n`);
  // Riwayat dibatasi agar berkas pemeriksaan tidak tumbuh tanpa batas.
  const lines = fs.readFileSync(historyFile, 'utf8').split('\n').filter(Boolean);
  if (lines.length > 2000) fs.writeFileSync(historyFile, `${lines.slice(-2000).join('\n')}\n`);
}

async function probe() {
  const startedAt = Date.now();
  const response = await fetch(`${url.replace(/\/$/, '')}/api/health`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'cache-control': 'no-store' }
  });
  const body = await response.json();
  return { latencyMs: Date.now() - startedAt, status: response.status, body };
}

function evaluate(probeResult, previous) {
  const issues = [];
  const load = probeResult.body?.load || {};
  if (probeResult.status !== 200 || probeResult.body?.status !== 'ok') {
    issues.push(`health menolak (HTTP ${probeResult.status}, status=${probeResult.body?.status})`);
  }
  if (probeResult.latencyMs > maxLatencyMs) {
    issues.push(`latency ${probeResult.latencyMs}ms melebihi ${maxLatencyMs}ms`);
  }
  const uptime = Number(load.uptime_seconds);
  if (previous && Number.isFinite(uptime)) {
    const previousUptime = Number(previous.uptime_seconds);
    // Uptime yang turun berarti proses baru; restart berulang adalah tanda gangguan.
    if (Number.isFinite(previousUptime) && uptime < previousUptime) {
      const gapMinutes = Math.round((Date.now() - new Date(previous.at).getTime()) / 60000);
      issues.push(`restart terdeteksi (${gapMinutes} menit sejak sampel terakhir, uptime ${uptime}s)`);
    }
  }
  if (load.database?.pool_errors) issues.push(`pool_errors=${load.database.pool_errors}`);
  if (load.database?.queue_limit_rejections)
    issues.push(`antrean_database_penuh=${load.database.queue_limit_rejections}`);
  if (load.event_loop?.breaches) issues.push(`event_loop_lag=${load.event_loop.breaches}x`);
  if (load.state_write?.rejected) issues.push(`tulis_ditolak=${load.state_write.rejected}`);
  if (load.memory?.limit_ratio != null && load.memory.limit_ratio > maxMemoryRatio) {
    issues.push(`memori ${Math.round(load.memory.limit_ratio * 100)}% dari batas`);
  }
  if (load.audit_retention?.has_error) issues.push('penataan audit gagal (lihat /api/health/detail)');
  return issues;
}

const previous = readPreviousSample();
let result;
try {
  result = await probe();
} catch (error) {
  console.error(`MAUN: ${url} tidak dapat dijangkau — ${error.message}`);
  appendSample({ at: new Date().toISOString(), unreachable: true, error: error.message });
  process.exit(2);
}

const sample = {
  at: new Date().toISOString(),
  latency_ms: result.latencyMs,
  status: result.body?.status,
  uptime_seconds: result.body?.load?.uptime_seconds,
  backend: result.body?.load?.data_backend,
  pool_errors: result.body?.load?.database?.pool_errors,
  rejections: result.body?.load?.database?.queue_limit_rejections,
  lag_breaches: result.body?.load?.event_loop?.breaches,
  write_rejected: result.body?.load?.state_write?.rejected,
  cache_refreshes: result.body?.load?.state_cache?.refreshes,
  cache_ttl_skips: result.body?.load?.state_cache?.ttl_skips,
  rss_mb: result.body?.load?.memory?.rss_mb,
  limit_ratio: result.body?.load?.memory?.limit_ratio,
  retention_archived: result.body?.load?.audit_retention?.archived_total,
  retention_error: result.body?.load?.audit_retention?.has_error
};
appendSample(sample);

const issues = evaluate(result, previous);
if (issues.length) {
  console.error(`PERHATIAN ${url}: ${issues.join('; ')}`);
  console.error(`sampel: ${JSON.stringify(sample)}`);
  process.exit(1);
}
console.log(
  `SEHAT ${url} latency=${result.latencyMs}ms uptime=${sample.uptime_seconds}s ` +
    `backend=${sample.backend} rss=${sample.rss_mb}MB cache_skips=${sample.cache_ttl_skips}`
);
