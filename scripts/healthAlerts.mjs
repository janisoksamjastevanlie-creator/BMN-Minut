// Penanda waktu dan peringatan untuk pemantau kesehatan (health-watchdog).
//
// Pemantau yang hanya mencetak ke konsol tidak ada gunanya saat tidak ada yang
// melihatnya — hosting terkelola Hostinger juga tidak menyimpan keluaran proses.
// Modul ini memutuskan KAPAN sebuah gangguan layak dikirim ke WhatsApp dan
// merangkai isinya, dengan tiga aturan agar tidak menjadi spam:
//   1. transisi sehat -> bermasalah selalu mengirim satu peringatan;
//   2. masalah yang sama tidak diulang sebelum cooldown lewat;
//   3. pemulihan diumumkan sekali supaya pengguna tahu gangguan berakhir.
// Tanda tangan masalah sengaja membuang angka (uptime, milidetik, jumlah) sehingga
// "restart terdeteksi" yang berulang dianggap kejadian yang sama.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;
export const DEFAULT_STATE_FILE = 'var/watch/alerts.json';
export const MAX_ISSUES_IN_MESSAGE = 4;

export function signatureOf(issues) {
  const kelas = (Array.isArray(issues) ? issues : [])
    .map(issue => String(issue).replace(/\d+/g, '#').trim().toLowerCase())
    .sort();
  return crypto.createHash('sha256').update(kelas.join('|')).digest('hex').slice(0, 16);
}

// Keputusan murni: tanpa jaringan dan tanpa jam sistem, supaya mudah diuji.
export function decideAlert({ previous, signature, issueCount, nowMs, cooldownMs = DEFAULT_COOLDOWN_MS }) {
  const masalah = Number(issueCount) > 0;
  if (!masalah) {
    if (previous?.status === 'problem') {
      return {
        action: 'recover',
        reason: 'pulih_setelah_peringatan',
        nextState: { status: 'ok', last_recovered_at: new Date(nowMs).toISOString() }
      };
    }
    return { action: 'none', reason: 'sehat_tanpa_peringatan_aktif', nextState: { status: 'ok' } };
  }

  const consecutive = (Number(previous?.consecutive) || 0) + 1;
  if (previous?.status !== 'problem') {
    return {
      action: 'alert',
      reason: 'gangguan_baru',
      nextState: { status: 'problem', signature, alerted_at: new Date(nowMs).toISOString(), consecutive }
    };
  }
  if (previous.signature && previous.signature !== signature) {
    return {
      action: 'alert',
      reason: 'gangguan_berubah',
      nextState: { status: 'problem', signature, alerted_at: new Date(nowMs).toISOString(), consecutive }
    };
  }
  const terakhir = Date.parse(previous.alerted_at || '');
  if (!Number.isFinite(terakhir) || nowMs - terakhir >= cooldownMs) {
    return {
      action: 'alert',
      reason: 'masih_berlangsung',
      nextState: { status: 'problem', signature, alerted_at: new Date(nowMs).toISOString(), consecutive }
    };
  }
  return {
    action: 'skip',
    reason: 'sudah_diperingatkan_dalam_jeda',
    nextState: { ...previous, consecutive }
  };
}

const WIB = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Makassar',
  dateStyle: 'medium',
  timeStyle: 'medium'
});

function ringkasanTeknis(sample) {
  if (!sample) return '';
  const bagian = [];
  if (sample.latency_ms != null) bagian.push(`latency ${sample.latency_ms}ms`);
  if (sample.uptime_seconds != null) bagian.push(`uptime ${sample.uptime_seconds}s`);
  if (sample.rss_mb != null) bagian.push(`memori ${sample.rss_mb}MB`);
  if (sample.backend) bagian.push(`backend ${sample.backend}`);
  return bagian.join(', ');
}

export function buildAlertMessage({ url, decision, issues, sample, nowMs, unreachable }) {
  const waktu = WIB.format(new Date(nowMs));
  if (decision.action === 'recover') {
    return [`[SIMAN PULIH] ${url}`, `Status: sehat kembali pada ${waktu}.`, 'Tidak perlu tindakan.'].join('\n');
  }
  const judul = decision.reason === 'masih_berlangsung'
    ? `[SIMAN MASIH BERMASALAH] ${url}`
    : `[SIMAN GANGGUAN] ${url}`;
  const baris = [judul, `Waktu: ${waktu}`];
  const daftar = Array.isArray(issues) ? issues : [];
  if (unreachable) {
    baris.push(`Server tidak dapat dijangkau: ${String(unreachable).slice(0, 160)}`);
  } else if (daftar.length) {
    baris.push(...daftar.slice(0, MAX_ISSUES_IN_MESSAGE).map((issue, index) => `${index + 1}. ${String(issue).slice(0, 200)}`));
    if (daftar.length > MAX_ISSUES_IN_MESSAGE) {
      baris.push(`... (${daftar.length - MAX_ISSUES_IN_MESSAGE} catatan lain)`);
    }
  }
  const teknis = ringkasanTeknis(sample);
  if (teknis) baris.push(`Terakhir: ${teknis}`);
  return baris.join('\n');
}

export function readAlertState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Ditulis lewat berkas sementara supaya proses yang mati di tengah jalan tidak
// meninggalkan keadaan setengah tertulis untuk pemeriksaan berikutnya.
export function writeAlertState(file, state) {
  const isi = `${JSON.stringify(state, null, 2)}\n`;
  const direktori = path.dirname(file);
  fs.mkdirSync(direktori, { recursive: true });
  const sementara = `${file}.tmp`;
  fs.writeFileSync(sementara, isi);
  fs.renameSync(sementara, file);
}
