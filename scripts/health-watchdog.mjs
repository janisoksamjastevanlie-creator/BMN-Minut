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
import {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_STATE_FILE,
  buildAlertMessage,
  decideAlert,
  readAlertState,
  signatureOf,
  writeAlertState
} from './healthAlerts.mjs';

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
const logFile = argv.get('log') ? String(argv.get('log')) : null;
const timeoutMs = Number(argv.get('timeout-ms') || 20000);
const maxLatencyMs = Number(argv.get('max-latency-ms') || 4000);
const maxMemoryRatio = Number(argv.get('max-memory-ratio') || 0.85);
// Peringatan WhatsApp menyala lewat --notify (dipakai penjadwal tugas) atau
// WATCHDOG_NOTIFY=true. Default mati supaya pemeriksaan manual dan pemakaian di
// konsol tidak mengirim pesan yang tidak diminta.
const notifyRequested = Boolean(argv.get('notify')) ||
  String(process.env.WATCHDOG_NOTIFY || '').trim().toLowerCase() === 'true';
const dryRun = String(argv.get('notify') || '').toLowerCase() === 'dry';
const stateFile = String(argv.get('state') || process.env.WATCHDOG_ALERT_STATE || DEFAULT_STATE_FILE);
const cooldownMs = Number(argv.get('cooldown-ms') || process.env.WATCHDOG_ALERT_COOLDOWN_MS || DEFAULT_COOLDOWN_MS);
const recipientsArg = argv.get('recipient') || process.env.WATCHDOG_RECIPIENTS || '';

function catat(text) {
  const baris = `[${new Date().toISOString()}] ${text}`;
  if (!logFile) return;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${baris}\n`);
    const isi = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    if (isi.length > 5000) fs.writeFileSync(logFile, `${isi.slice(-5000).join('\n')}\n`);
  } catch {
    // Log adalah kemudahan membaca; kegagalan menulis log tidak boleh membuat
    // pemeriksaan kesehatan dianggap gagal.
  }
}


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
  // Pembilang di bawah ini kumulatif sejak proses hidup. Tanpa selisih terhadap
  // sampel sebelumnya, satu kejadian lama membuat setiap pemeriksaan berikutnya
  // berpendapat sama sehingga peringatan tidak lagi menandai kejadian baru.
  const delta = (value, before) => {
    const now = Number(value) || 0;
    if (now === 0) return 0;
    const old = Number(before);
    if (!Number.isFinite(old)) return now;
    return Math.max(0, now - old);
  };
  const newPoolErrors = delta(load.database?.pool_errors, previous?.pool_errors);
  const newRejections = delta(load.database?.queue_limit_rejections, previous?.rejections);
  const newLag = delta(load.event_loop?.breaches, previous?.lag_breaches);
  const newWriteRejects = delta(load.state_write?.rejected, previous?.write_rejected);
  if (newPoolErrors) issues.push(`pool_errors_baru=${newPoolErrors}`);
  if (newRejections) issues.push(`antrean_database_penuh_baru=${newRejections}`);
  if (newLag) issues.push(`event_loop_lag_baru=${newLag}x`);
  if (newWriteRejects) issues.push(`tulis_ditolak_baru=${newWriteRejects}`);
  if (load.memory?.limit_ratio != null && load.memory.limit_ratio > maxMemoryRatio) {
    issues.push(`memori ${Math.round(load.memory.limit_ratio * 100)}% dari batas`);
  }
  if (load.audit_retention?.has_error) issues.push('penataan audit gagal (lihat /api/health/detail)');
  const history = load.health_history || {};
  if (history.enabled && history.has_error) issues.push('riwayat kesehatan gagal ditulis');
  if (history.enabled && history.table_ready === false) {
    issues.push('riwayat kesehatan aktif tetapi tabel health_samples belum ada');
  }
  if (history.enabled && history.table_ready && history.last_write_at) {
    const ageMinutes = (Date.now() - new Date(history.last_write_at).getTime()) / 60000;
    const allowedMinutes = Math.max(15, ((Number(history.interval_ms) || 300000) / 60000) * 3);
    if (Number.isFinite(ageMinutes) && ageMinutes > allowedMinutes) {
      issues.push(`riwayat kesehatan macet (${Math.round(ageMinutes)} menit sejak sampel terakhir)`);
    }
  }
  return issues;
}

const previous = readPreviousSample();
// Kode keluar ditetapkan, bukan process.exit(): di Windows, keluar paksa ketika
// koneksi HTTPS masih dalam proses penutupan memicu assertion libuv sehingga kode
// keluar yang dilihat penjadwal cron menjadi acak.
let result = null;
let unreachableError = null;
const issues = [];
try {
  result = await probe();
} catch (error) {
  unreachableError = error;
  console.error(`MATI: ${url} tidak dapat dijangkau — ${error.message}`);
  appendSample({ at: new Date().toISOString(), unreachable: true, error: error.message });
}

let sample = null;
if (result) {
  sample = {
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
    retention_error: result.body?.load?.audit_retention?.has_error,
    history_writes: result.body?.load?.health_history?.writes,
    history_table_ready: result.body?.load?.health_history?.table_ready,
    history_last_write_at: result.body?.load?.health_history?.last_write_at,
    history_error: result.body?.load?.health_history?.has_error
  };
  appendSample(sample);
  issues.push(...evaluate(result, previous));
}

if (unreachableError) process.exitCode = 2;
else if (issues.length) {
  console.error(`PERHATIAN ${url}: ${issues.join('; ')}`);
  console.error(`sampel: ${JSON.stringify(sample)}`);
  process.exitCode = 1;
} else {
  console.log(
    `SEHAT ${url} latency=${result.latencyMs}ms uptime=${sample.uptime_seconds}s ` +
      `backend=${sample.backend} rss=${sample.rss_mb}MB retention=${sample.retention_archived}`
  );
}

catat(
  unreachableError
    ? `MATI ${url} — ${unreachableError.message}`
    : issues.length
      ? `PERHATIAN ${url} — ${issues.join('; ')}`
      : `SEHAT ${url} latency=${result.latencyMs}ms uptime=${sample.uptime_seconds}s rss=${sample.rss_mb}MB`
);

// Pengiriman peringatan hanya terjadi bila diminta. State ditulis ulang hanya
// setelah pesan benar-benar diterima provider; kegagalan kirim tidak boleh
// menandai "sudah diberi tahu" karena akan membungkam peringatan berikutnya.
if (notifyRequested) {
  const peringatan = unreachableError
    ? [`server tidak dapat dijangkau (${unreachableError.message})`]
    : issues;
  const signature = peringatan.length ? signatureOf(peringatan) : '';
  const keputusan = decideAlert({
    previous: readAlertState(stateFile),
    signature,
    issueCount: peringatan.length,
    nowMs: Date.now(),
    cooldownMs: Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : DEFAULT_COOLDOWN_MS
  });

  if (keputusan.action === 'none' || keputusan.action === 'skip') {
    console.log(`peringatan: ${keputusan.reason}`);
    if (keputusan.action === 'skip') writeAlertState(stateFile, keputusan.nextState);
  } else {
    const pesan = buildAlertMessage({
      url,
      decision: keputusan,
      issues: peringatan,
      sample,
      nowMs: Date.now(),
      unreachable: unreachableError?.message
    });
    if (dryRun) {
      console.log(`peringatan (hanya naskah, tidak dikirim):\n${pesan}`);
      catat(`DRY ${keputusan.reason}`);
    } else {
      const { kirimPeringatan } = await import('./healthNotify.mjs');
      const hasil = await kirimPeringatan({ pesan, recipientsArg, url });
      for (const item of hasil.hasil) {
        console.log(`peringatan ${item.mask}: ${item.status}${item.detail ? ` — ${item.detail}` : ''}`);
      }
      catat(`KIRIM ${keputusan.reason} ${hasil.rangkuman()}`);
      if (hasil.terkirim > 0) writeAlertState(stateFile, keputusan.nextState);
      else if (!hasil.dilewati) console.error('peringatan tidak terkirim; state tidak diubah sehingga dicoba lagi pada pemeriksaan berikutnya');
    }
  }
}

