// Penilaian hasil pemeriksaan kesehatan (dipakai scripts/health-watchdog.mjs).
//
// Diletakkan di modul terpisah karena aturan "ini gangguan" atau "ini cuma proses
// yang baru hidup" adalah bagian yang paling sering salah dan paling mahal untuk
// dites lewat naskah end-to-end. Fungsi murni menerima hasil probe dan sampel
// sebelumnya, tanpa menyentuh jaringan maupun berkas.
//
// Dua aturan yang lahir dari log produksi:
//   1. Selisih, bukan angka mentah. Pembilang pool_errors dan kawan-kawannya
//      kumulatif sejak proses hidup, jadi tanpa selisih terhadap sampel
//      sebelumnya satu kejadian lama membuat tiap pemeriksaan berikutnya
//      berpendapat sama dan peringatan berhenti menandai kejadian baru.
//   2. Masa boot bukan gangguan. Tabel health_samples dibuat oleh proses yang
//      baru hidup, jadi table_ready=false pada menit-menit pertama hanyalah tanda
//      aplikasi sedang menyala — laporan ini terbukti salah pada sampel
//      2026-11-06T17:04Z yang mengambilnya saat uptime 0 detik.

export const DEFAULT_INTERVAL_MS = 300_000;
export const BOOT_GRACE_MS = 120_000;
export const DEFAULT_MAX_LATENCY_MS = 4000;
export const DEFAULT_MAX_MEMORY_RATIO = 0.85;

// Proses yang berumur kurang dari satu interval penulisan + tenggang belum
// seharusnya punya sampel riwayat.
export function sedangBoot(load, { graceMs = BOOT_GRACE_MS } = {}) {
  const umur = Number(load?.uptime_seconds);
  if (!Number.isFinite(umur)) return false;
  const interval = Number(load?.health_history?.interval_ms) || DEFAULT_INTERVAL_MS;
  return umur * 1000 < interval + graceMs;
}

export function evaluate(probeResult, previous, {
  nowMs = Date.now(),
  maxLatencyMs = DEFAULT_MAX_LATENCY_MS,
  maxMemoryRatio = DEFAULT_MAX_MEMORY_RATIO
} = {}) {
  const issues = [];
  const load = probeResult.body?.load || {};
  const boot = sedangBoot(load, { nowMs });
  if (probeResult.status !== 200 || probeResult.body?.status !== 'ok') {
    issues.push(`health menolak (HTTP ${probeResult.status}, status=${probeResult.body?.status})`);
  }
  if (probeResult.latencyMs > maxLatencyMs) {
    issues.push(`latency ${probeResult.latencyMs}ms melebihi ${maxLatencyMs}ms`);
  }
  // Restart sengaja tidak dinilai di sini: itu pekerjaan nilaiRestart(), yang
  // membedakan deploy yang direncanakan dari crash-loop.
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
  if (history.enabled && history.table_ready === false && !boot) {
    issues.push('riwayat kesehatan aktif tetapi tabel health_samples belum ada');
  }
  if (history.enabled && history.table_ready && history.last_write_at && !boot) {
    const ageMinutes = (nowMs - new Date(history.last_write_at).getTime()) / 60000;
    const allowedMinutes = Math.max(15, ((Number(history.interval_ms) || DEFAULT_INTERVAL_MS) / 60000) * 3);
    if (Number.isFinite(ageMinutes) && ageMinutes > allowedMinutes) {
      issues.push(`riwayat kesehatan macet (${Math.round(ageMinutes)} menit sejak sampel terakhir)`);
    }
  }
  return issues;
}
