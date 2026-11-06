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
//   node scripts/health-watchdog.mjs --notify            # peringatan WhatsApp + cadangan lokal
//   node scripts/health-watchdog.mjs --notify=dry        # cetak naskah, tidak mengirim apa pun
//
// Batas nilai dapat diubah lewat --max-latency-ms, --max-memory-ratio,
// --probe-retry, --probe-delay-ms, --local-cooldown-ms, dan --no-local-notify.
// Kode keluar: 0 sehat, 1 ada pelanggaran ambang, 2 server tidak dapat dijangkau.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_LOKAL_COOLDOWN_MS,
  DEFAULT_STATE_FILE,
  buildAlertMessage,
  decideAlert,
  nilaiRestart,
  perluLokal,
  readAlertState,
  signatureOf,
  writeAlertState
} from './healthAlerts.mjs';
import { evaluate, sebabKegagalan } from './watchdogEvaluate.mjs';
import { tampilkanToast } from './notifyLocal.mjs';

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
// Percobaan probe. Satu permintaan yang melampui batas waktu pernah tercatat
// sebagai "MATI" sementara pemeriksaan berikutnya sehat kembali, jadi kegagalan
// transportasi dan galat tepi 5xx dicoba sekali lagi sebelum dinyatakan mati.
const percobaanProbe = Math.max(1, Number(argv.get('probe-retry') || 2));
const jedaProbeMs = Math.max(0, Number(argv.get('probe-delay-ms') ?? 4000));
// Notifikasi Windows menyala sendiri saat peringatan WhatsApp tidak ada yang
// menerima, supaya pemantau tidak berubah bisu bersamaan dengan perangkat
// Fonnte yang terputus. Bisa dimatikan dengan --no-local-notify.
const notifikasiLokal = !argv.get('no-local-notify');
const cooldownLokalMs = Math.max(60_000, Number(argv.get('local-cooldown-ms') || DEFAULT_LOKAL_COOLDOWN_MS));
// Rujukan untuk memeriksa apakah laptop sendiri masih punya jalur ke luar ketika
// server tidak menjawab. Hostinger selalu hidup untuk endpoint ini dan tidak
// perlu token; kosongkan dengan --reference-url= untuk mematikan pemeriksaan.
const referenceUrl = String(argv.get('reference-url') ?? 'https://api.fonnte.com/');
const referenceTimeoutMs = Math.max(2000, Number(argv.get('reference-timeout-ms') || 8000));

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

async function probeSekali() {
  const startedAt = Date.now();
  const response = await fetch(`${url.replace(/\/$/, '')}/api/health`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'cache-control': 'no-store' }
  });
  const teks = await response.text();
  let body = null;
  let bukanJson = '';
  try {
    body = JSON.parse(teks);
  } catch {
    bukanJson = teks.replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  return { latencyMs: Date.now() - startedAt, status: response.status, body, bukanJson };
}

// Jeda antar percobaan, supaya proses yang sedang restart tidak langsung
// dinyatakan mati.
function tunggu(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Satu permintaan yang kebetulan melewati batas waktu pernah tercatat sebagai
// "MATI" padahal pemeriksaan berikutnya sehat kembali — dan itu memicu
// peringatan palsu. Percobaan kedua hanya dijalankan untuk kegagalan
// transportasi dan galat tepi (5xx), bukan untuk jawaban sehat yang lambat.
async function probeBerulang({ percobaan = 2, jedaMs = 4000 } = {}) {
  let terakhir = null;
  for (let index = 0; index < percobaan; index += 1) {
    try {
      const hasil = await probeSekali();
      if (hasil.status >= 500 && index + 1 < percobaan) {
        terakhir = { hasil, percobaan: index + 1 };
        await tunggu(jedaMs);
        continue;
      }
      return hasil;
    } catch (error) {
      terakhir = { error, percobaan: index + 1 };
      if (index + 1 < percobaan) await tunggu(jedaMs);
    }
  }
  if (terakhir?.error) throw terakhir.error;
  return terakhir.hasil;
}

async function probeRujukan() {
  if (!referenceUrl) return null;
  try {
    const response = await fetch(referenceUrl, {
      signal: AbortSignal.timeout(referenceTimeoutMs),
      cache: 'no-store'
    });
    return response.ok ? null : new Error(`rujukan menjawab HTTP ${response.status}`);
  } catch (error) {
    return error;
  }
}

const previous = readPreviousSample();
// Kode keluar ditetapkan, bukan process.exit(): di Windows, keluar paksa ketika
// koneksi HTTPS masih dalam proses penutupan memicu assertion libuv sehingga kode
// keluar yang dilihat penjadwal cron menjadi acak.
let result = null;
let unreachableError = null;
let kegagalan = null;
const issues = [];
try {
  result = await probeBerulang({ percobaan: percobaanProbe, jedaMs: jedaProbeMs });
} catch (error) {
  unreachableError = error;
  // Laptop pernah kehilangan Wi-Fi selama ±20 menit dan setiap tick ketika itu
  // melaporkan "server MATI". Satu permintaan rujukan memisahkan keduanya, jadi
  // yang dibunyikan adalah gangguan yang sebenarnya.
  const rujukanError = await probeRujukan();
  kegagalan = sebabKegagalan({ error, rujukanError, rujukanUrl: referenceUrl });
  console.error(`${kegagalan.lokal ? 'SINYAL' : 'MATI'}: ${kegagalan.label}`);
  appendSample({
    at: new Date().toISOString(),
    unreachable: true,
    local_offline: kegagalan.lokal,
    error: kegagalan.pesan
  });
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
  // Tanda restart ditulis sebelum sampel disimpan supaya pemeriksaan berikutnya
  // tahu apakah proses berganti lagi atau ini hanya satu deploy yang direncanakan.
  const restart = nilaiRestart({
    uptime: sample.uptime_seconds,
    previous,
    nowMs: Date.now(),
    intervalMs: Number(argv.get('sample-interval-ms') || 300_000)
  });
  sample.restart_seen = restart.restart;
  appendSample(sample);
  issues.push(...evaluate(result, previous, { maxLatencyMs, maxMemoryRatio }));
  if (result.bukanJson) {
    issues.push(`health menjawab bukan JSON (HTTP ${result.status}): ${result.bukanJson}`);
  }
  if (restart.layakDilaporkan) issues.push(`restart berulang — ${restart.catatan}`);
  else if (restart.restart) console.log(`catatan: proses berganti (kemungkinan deploy) — ${restart.catatan}`);
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
    ? `${kegagalan.lokal ? 'SINYAL' : 'MATI'} ${url} — ${kegagalan.label}`
    : issues.length
      ? `PERHATIAN ${url} — ${issues.join('; ')}`
      : `SEHAT ${url} latency=${result.latencyMs}ms uptime=${sample.uptime_seconds}s rss=${sample.rss_mb}MB`
);

// Pengiriman peringatan hanya terjadi bila diminta. State WhatsApp ditulis ulang
// hanya setelah pesan benar-benar diterima provider; kegagalan kirim tidak boleh
// menandai "sudah diberi tahu" karena akan membungkam peringatan berikutnya.
if (notifyRequested) {
  const peringatan = unreachableError ? [kegagalan.label] : issues;
  const signature = peringatan.length ? signatureOf(peringatan) : '';
  const stateSemula = readAlertState(stateFile);
  const sekarang = Date.now();
  const keputusan = decideAlert({
    previous: stateSemula,
    signature,
    issueCount: peringatan.length,
    nowMs: sekarang,
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
      nowMs: sekarang
      // Sebab kegagalan sudah ada di daftar issues (label sebabKegagalan), jadi
      // baris "unreachable" tidak dipakai lagi: kalimatnya selalu menyebut
      // server, padahal yang bisa mati adalah jaringan laptop sendiri.
    });
    const judulLokal = keputusan.action === 'recover' ? 'SIMAN pulih' : 'SIMAN gangguan';

    if (dryRun) {
      console.log(`peringatan (hanya naskah, tidak dikirim):\n${pesan}`);
      catat(`DRY ${keputusan.reason}`);
    } else {
      const { kirimPeringatan } = await import('./healthNotify.mjs');
      const hasil = await kirimPeringatan({ pesan, recipientsArg, url });
      for (const item of hasil.hasil) {
        // Keluaran konsol tidak tertangkap Task Scheduler, jadi sebab galat ikut
        // ditulis ke berkas log; tanpa baris ini log hanya berisi "gagal=1".
        const baris = `peringatan ${item.mask}: ${item.status}${item.detail ? ` — ${item.detail}` : ''}`;
        console.log(baris);
        catat(baris);
      }
      catat(`KIRIM ${keputusan.reason} ${hasil.rangkuman()}`);

      if (hasil.terkirim > 0) {
        writeAlertState(stateFile, { ...keputusan.nextState, lokal: stateSemula?.lokal ?? null });
      } else {
        if (hasil.kanal) {
          const baris = `KANAL ${hasil.kanal.status} — ${hasil.kanal.catatan}`;
          console.error(baris);
          catat(baris);
        }
        // Saluran utama bisu: bunyikan saluran lokal dengan jedanya sendiri,
        // supaya gangguan tetap terlihat tanpa mengirim WhatsApp tiap lima menit.
        const keputLokal = perluLokal({
          previous: stateSemula,
          signature: keputusan.action === 'recover' ? '' : signature,
          nowMs: sekarang,
          cooldownMs: cooldownLokalMs
        });
        if (!notifikasiLokal) {
          console.error('peringatan tidak terkirim dan notifikasi lokal dimatikan (--no-local-notify)');
        } else if (!keputLokal.kirim) {
          console.log(`notifikasi lokal: ${keputLokal.alasan}`);
        } else {
          const lokal = await tampilkanToast({
            judul: `${judulLokal} — ${url}`,
            pesan: pesan.replace(/\n/g, ' · ')
          });
          catat(`LOKAL ${keputLokal.alasan} ${lokal.berhasil ? 'tampil' : 'gagal'}${lokal.catatan ? ` — ${lokal.catatan}` : ''}`);
          console.log(`notifikasi lokal (${keputLokal.alasan}): ${lokal.catatan}`);
          if (lokal.berhasil) {
            writeAlertState(stateFile, { ...stateSemula, lokal: keputLokal.nextState });
          }
        }
        if (!hasil.dilewati) {
          console.error('peringatan WhatsApp tidak terkirim; state WhatsApp tidak diubah sehingga dicoba lagi pada pemeriksaan berikutnya');
        }
      }
    }
  }
}

