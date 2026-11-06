// Pemeriksaan kanal peringatan Fonnte.
//
// Pemantau mengirim peringatan lewat WhatsApp, tetapi "gagal kirim" tanpa sebab
// membuat orang menyalahkan servernya, padahal yang mati bisa jadi perangkat
// Fonnte-nya. Fonnte menyediakan POST /device yang menjawab status perangkat,
// kuota, dan tanggal kedaluwarsa. Modul ini memisahkan pembacaan jawaban itu
// (fungsi murni, bisa diuji) dari panggilan jaringannya.
//
// Nomor perangkat sengaja tidak pernah ikut dilaporkan; yang dipakai hanya
// statusnya.

const BULAN = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7,
  agustus: 8, september: 9, oktober: 10, november: 11, desember: 12
};

export function urlStatusDevice(apiUrl) {
  try {
    const dasar = new URL(String(apiUrl || 'https://api.fonnte.com/send'));
    if (dasar.hostname !== 'api.fonnte.com' || dasar.protocol !== 'https:') return null;
    dasar.pathname = '/device';
    return dasar.toString();
  } catch {
    return null;
  }
}

function tanggalFonnte(nilai) {
  const cocok = String(nilai || '')
    .toLowerCase()
    .match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (!cocok) return Number.NaN;
  const bulan = BULAN[cocok[2]];
  if (!bulan) return Number.NaN;
  return Date.UTC(Number(cocok[3]), bulan - 1, Number(cocok[1]), 23, 59, 59);
}

// Nilai murni: ubah jawaban Fonnte menjadi kesimpulan yang bisa dibaca manusia.
// Status tak dikenal dilaporkan apa adanya supaya tidak ada tebak-tebakan.
export function nilaiKanal(body, { nowMs = Date.now() } = {}) {
  if (!body || typeof body !== 'object') {
    return { siap: false, status: 'tidak_terkenal', catatan: 'jawaban Fonnte tidak dapat dibaca' };
  }
  const status = String(body.device_status || '').trim().toLowerCase();
  const kuota = Number(body.quota);
  const kedaluwarsa = tanggalFonnte(body.expired);

  if (status === 'disconnect' || status === 'disconnected') {
    const lewat = Number.isFinite(kedaluwarsa) && kedaluwarsa < nowMs;
    return {
      siap: false,
      status: 'terputus',
      catatan: lewat
        ? 'perangkat Fonnte terputus dan paketnya sudah kedaluwarsa'
        : 'perangkat Fonnte terputus — sambungkan ulang lewat dashboard Fonnte (pindai QR)'
    };
  }
  if (Number.isFinite(kuota) && kuota <= 0) {
    return { siap: false, status: 'kuota_habis', catatan: 'kuota Fonnte habis' };
  }
  if (Number.isFinite(kedaluwarsa) && kedaluwarsa < nowMs) {
    return { siap: false, status: 'kedaluwarsa', catatan: `paket Fonnte kedaluwarsa ${body.expired}` };
  }
  if (status === 'connecting' || status === 'pending') {
    return { siap: false, status: 'menyambung', catatan: `perangkat Fonnte masih ${status}` };
  }
  if (!status) {
    return { siap: false, status: 'tidak_terkenal', catatan: 'status perangkat Fonnte tidak dilaporkan' };
  }
  return { siap: true, status: 'siap', catatan: `perangkat ${status}, kuota ${Number.isFinite(kuota) ? kuota : '?'}` };
}

export async function periksaKanalFonnte({ config, fetchImpl = fetch, timeoutMs = 10000 }) {
  const url = urlStatusDevice(config?.apiUrl);
  if (!url || !config?.token) return { siap: false, status: 'tidak_terkenal', catatan: 'konfigurasi Fonnte tidak lengkap' };
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: config.token },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    return { siap: false, status: 'tidak_terkenal', catatan: `status perangkat tidak dapat dibaca (${error.message})` };
  }
  if (!response.ok) {
    return { siap: false, status: 'tidak_terkenal', catatan: `Fonnte menolak pemeriksaan perangkat (HTTP ${response.status})` };
  }
  // Jawaban yang bukan JSON (misalnya halaman galat tepi) diperlakukan sama dengan
  // jawaban tanpa status: tidak dikenal, bukan galat.
  const body = await response.json().catch(() => null);
  const hasil = nilaiKanal(body);
  return { ...hasil, kuota: Number.isFinite(Number(body?.quota)) ? Number(body.quota) : null };
}
