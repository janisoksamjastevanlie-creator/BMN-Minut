// Penerjemah keluaran Windows Task Scheduler.
//
// schtasks /Query /V /FO LIST memakai label yang ikut bahasa Windows dan
// schtasks /Query /XML hanya berisi definisi tugas (tidak ada waktu jalan),
// jadi ringkasan status dibaca lewat PowerShell dan diterjemahkan di sini.
// Kode hasil tugas juga perlu diuraikan: tanpa itu "2147946720" tidak berarti
// apa-apa bagi orang yang memeriksa apakah pemantau masih hidup.
const ANGKA = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/;

const NAMA_STATE = {
  0: 'tidak diketahui',
  1: 'nonaktif',
  2: 'antre',
  3: 'siap',
  4: 'berjalan sekarang',
  5: 'belum pernah dijalankan'
};

// SCHED_S_* : kondisi normal yang dilaporkan sebagai "hasil", bukan galat.
const HASIL_TUGAS = {
  0x41300: 'siap dijalankan',
  0x41301: 'sedang berjalan',
  0x41302: 'tugasnya dinonaktifkan',
  0x41303: 'belum pernah dijalankan',
  0x41304: 'tidak ada jadwal berjalan lagi',
  0x41305: 'tidak dijadwalkan',
  0x41306: 'dihentikan sebelum selesai',
  0x41307: 'tidak punya pemicu yang sah'
};

// SCHED_S_TASK_HAS_NOT_RUN — dipakai juga untuk memutuskan "jalankan terakhir".
const BELUM_PERNAH_JALAN = 0x41303;

// ERROR_* : galat Win32 yang paling sering muncul saat peluncur bermasalah.
const GALAT_WIN32 = {
  0x00000001: 'fungsi salah',
  0x00000002: 'berkas peluncur tidak ditemukan',
  0x00000005: 'akses ditolak (jalankan pemasangan jadwal ini sekali sebagai Administrator)',
  0x000010e0: 'jalannya ditolak — ada instance sebelumnya yang masih dianggap berjalan; hentikan dengan schtasks /End lalu pasang ulang jadwalnya',
  0x00000413: 'kredensial untuk tugas ini salah atau kedaluwarsa — pasang ulang jadwalnya',
  0x00000520: 'sesi logon tidak ada — mode logon jadwalnya rusak, pasang ulang dengan node scripts/install-watchdog-task.mjs'
};

export function uraikanWaktuTugas(nilai) {
  if (nilai === null || nilai === undefined || nilai === '') return null;
  if (nilai instanceof Date) return Number.isFinite(nilai.getTime()) ? nilai : null;
  const teks = String(nilai).trim();
  const dotNet = teks.match(/^\/Date\((-?\d+)\)\/$/);
  if (dotNet) {
    const ms = Number(dotNet[1]);
    return Number.isFinite(ms) ? sejak1970(ms) : null;
  }
  const sesuai = teks.match(ANGKA);
  if (sesuai) {
    const [, y, mo, d, h, mi, s] = sesuai;
    // Jadwal tugas memakai waktu lokal, jadi jangan dianggap UTC.
    const tanggal = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    return Number.isFinite(tanggal.getTime()) ? sejak1970(tanggal.getTime()) : null;
  }
  const tanggal = new Date(teks);
  return Number.isFinite(tanggal.getTime()) ? sejak1970(tanggal.getTime()) : null;
}

// Task Scheduler melaporkan "belum pernah dijalankan" sebagai tahun 1, bukan
// kosong; umur di bawah 1970 tidak berguna untuk dibaca manusia.
function sejak1970(ms) {
  if (ms < 0) return null;
  const tanggal = new Date(ms);
  return tanggal.getFullYear() < 1971 ? null : tanggal;
}

export function formatWaktuTugas(nilai) {
  const tanggal = uraikanWaktuTugas(nilai);
  if (!tanggal) return 'belum ada';
  const p = (angka) => String(angka).padStart(2, '0');
  return `${tanggal.getFullYear()}-${p(tanggal.getMonth() + 1)}-${p(tanggal.getDate())} ` +
    `${p(tanggal.getHours())}:${p(tanggal.getMinutes())}:${p(tanggal.getSeconds())}`;
}

export function namaStateTugas(nilai) {
  if (nilai === null || nilai === undefined || nilai === '') return 'tidak diketahui';
  const angka = Number(nilai);
  return NAMA_STATE[angka] || (Number.isFinite(angka) ? `kode ${angka}` : String(nilai));
}

export function jelaskanHasilTugas(nilai) {
  if (nilai === null || nilai === undefined || nilai === '') return 'belum ada catatan';
  const kode = Number(nilai);
  if (!Number.isInteger(kode)) return String(nilai);
  if (kode === 0) return 'sukses';
  if (HASIL_TUGAS[kode]) return `${HASIL_TUGAS[kode]} (${kode})`;
  if (kode >= 0x80070000 && kode <= 0x8007ffff) {
    const rendah = kode & 0xffff;
    return `${GALAT_WIN32[rendah] || `galat Windows ${rendah}`} (0x${kode.toString(16)})`;
  }
  // Kode kecil berasal dari process.exitCode health-watchdog.mjs.
  if (kode >= 1 && kode <= 255) {
    const arti = { 1: 'ditemukan gangguan pada aplikasi', 2: 'server tidak dapat dihubungi' }[kode];
    return `pemeriksaan berakhir dengan kode ${kode}${arti ? ` — ${arti}` : ''}`;
  }
  return `kode 0x${kode.toString(16)} (${kode})`;
}

export function susunBarisStatus({ namaTugas, info, berkasLog, barisLog, intervalMenit = 5, nowMs = Date.now() }) {
  // Tugas yang belum pernah dijalankan melaporkan tanggal 30-11-1999, bukan
  // kosong, jadi hasil 267011 yang dipakai sebagai penentunya.
  const belumPernah = Number(info?.LastTaskResult) === BELUM_PERNAH_JALAN;
  const terakhir = uraikanWaktuTugas(info?.LastRunTime);
  const baris = [
    ['jalankan berikutnya', formatWaktuTugas(info?.NextRunTime)],
    ['jalankan terakhir', belumPernah ? 'belum ada' : formatWaktuTugas(info?.LastRunTime)],
    ['hasil terakhir', jelaskanHasilTugas(info?.LastTaskResult)],
    ['status', namaStateTugas(info?.State)],
    ['log', berkasLog]
  ];
  if (barisLog) baris.push(['pemeriksaan terakhir', barisLog]);
  const panjang = Math.max(...baris.map(([label]) => label.length));
  const keluaran = [`Jadwal "${namaTugas}" terpasang.`, ...baris.map(([label, nilai]) => `  ${label.padEnd(panjang)} : ${nilai}`)];
  // Jadwal yang macet tetap terlihat "terpasang", jadi periksa umurnya sendiri.
  if (belumPernah || !terakhir) {
    keluaran.push('  catatan : belum pernah dijalankan — coba node scripts/install-watchdog-task.mjs --run, lalu periksa hasil terakhir.');
  } else {
    const umurMenit = (nowMs - terakhir.getTime()) / 60_000;
    if (umurMenit > Math.max(15, intervalMenit * 3)) {
      keluaran.push(`  catatan : sudah ${Math.round(umurMenit)} menit tidak berjalan — laptop mungkin mati atau jadwalnya dihentikan.`);
    }
  }
  return keluaran;
}
