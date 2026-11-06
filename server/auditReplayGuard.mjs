// Penahan "kebangkitan" catatan audit yang sudah diarshif.
//
// Retensi audit trail memindahkan entri lama ke audit_log_archive lalu menulis ulang
// blob auditLogs yang lebih kecil. Pada backend legacy, PUT /api/state menulis array
// yang dikirim klien apa adanya, jadi satu-satunya pemisah antara "pemakaian lama" dan
// "catatan arsip ikut terkirim kembali" adalah gembok optimistic revision. Gembok itu
// sudah ada (job retensi menaikkan revision saat mengarsip), tetapi pengguna
// Administrator yang mengirim array utuh pada revision yang sah masih dapat menulis
// kembali entri yang barusan diarshif — dan retensi pun batal sendiri tanpa ada yang
// melihatnya.
//
// Gardinya dijaga di memori proses: id yang baru saja dipindahkan diingat, lalu id itu
// dikeluarkan dari auditLogs sebelum simpanan apa pun ditulis. Tidak ada permintaan
// tambahan ke tabel arsip, jadi jalur tulis yang padat tidak ikut melambat.
//
// Aturan aman:
// - hanya aktif bila retensi genuinely dinyalakan (AUDIT_RETENTION_DAYS atau
//   AUDIT_ACTIVE_LIMIT > 0); saat mati, strip() mengembalikan array yang sama sehingga
//   perilaku aplikasi persis seperti sebelumnya;
// - yang diingat hanya id, bukan isinya, dan jumlahnya dibatasi; yang menguap dari
//   memori hanya kehilangan penahanan, tidak pernah membuat catatan terbuang;
// - catatan tanpa id terbaca tidak pernah dikeluarkan, supaya entri format lama yang
//   tanpa tanggal maupun id tidak disentuh.
export const DEFAULT_MAX_TRACKED_IDS = 50_000;

function positiveInteger(value, fallback) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createAuditReplayGuard({ maxTrackedIds = DEFAULT_MAX_TRACKED_IDS } = {}) {
  const batas = positiveInteger(maxTrackedIds, DEFAULT_MAX_TRACKED_IDS);
  // Map menjaga urutan penyisipan, jadi saat penuh yang dikeluarkan yang paling tua.
  const tracked = new Map();
  let enabled = false;
  let blockedTotal = 0;
  let lastBlockedAt = null;

  function setEnabled(nilai) {
    enabled = Boolean(nilai);
    if (!enabled) tracked.clear();
  }

  function track(ids) {
    if (!enabled) return 0;
    let added = 0;
    for (const id of Array.isArray(ids) ? ids : []) {
      const key = String(id ?? '');
      if (!key) continue;
      if (tracked.has(key)) continue;
      tracked.set(key, true);
      added += 1;
      while (tracked.size > batas) {
        const tertua = tracked.keys().next();
        if (tertua.done) break;
        tracked.delete(tertua.value);
      }
    }
    return added;
  }

  // Tidak ada yang dikeluarkan → array asli dikembalikan apa adanya. Pembanding koleksi
  // memakai perbandingan dalam, jadi salinan baru tanpa perbedaan tidak berbahaya, tetapi
  // jalur tulis yang padat tidak perlu ikut mengalokasikan array baru tiap simpanan.
  function strip(logs) {
    if (!enabled || !Array.isArray(logs) || tracked.size === 0) return { keep: logs, removed: 0 };
    const keep = [];
    const removed = [];
    for (const entry of logs) {
      const key = String(entry?.id ?? '');
      if (key && tracked.has(key)) removed.push(key);
      else keep.push(entry);
    }
    if (!removed.length) return { keep: logs, removed: 0 };
    blockedTotal += removed.length;
    lastBlockedAt = new Date().toISOString();
    return { keep, removed: removed.length, removedIds: removed };
  }

  function has(id) {
    return tracked.has(String(id ?? ''));
  }

  function stats() {
    return {
      enabled,
      tracked: tracked.size,
      max_tracked: batas,
      blocked_total: blockedTotal,
      last_blocked_at: lastBlockedAt
    };
  }

  return { setEnabled, track, strip, has, stats };
}
