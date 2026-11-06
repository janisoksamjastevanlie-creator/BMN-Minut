// Logika peringatan pemantau kesehatan: kapan mengirim, apa isinya, dan ke mana.
//
// Yang dijaga di sini adalah perilaku yang baru terasa setahun kemudian:
// peringatan tidak boleh hilang, tidak boleh berulang tiap lima menit, dan tidak
// boleh membungkam dirinya sendiri setelah pengiriman gagal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_COOLDOWN_MS,
  buildAlertMessage,
  decideAlert,
  nilaiRestart,
  readAlertState,
  signatureOf,
  writeAlertState
} from '../scripts/healthAlerts.mjs';
import { daftarTujuan, jelaskanKesalahan, kirimPeringatan, siapkanPeringatan } from '../scripts/healthNotify.mjs';
import { susunPeluncur, trPeluncur } from '../scripts/watchdogLauncher.mjs';

const MENIT = 60_000;

function configFonnte({ token = 'token-uji', provider = 'fonnte', testRecipient = '6281234567890' } = {}) {
  return {
    provider,
    validFonnteApiUrl: true,
    fonnte: { token, apiUrl: 'https://api.fonnte.com/send' },
    meta: { testRecipient }
  };
}

test('tanda tangan masalah mengabaikan angka sehingga kejadian sama tidak diulang', () => {
  const pertama = signatureOf(['restart terdeteksi (3 menit sejak sampel terakhir, uptime 58s)']);
  const kedua = signatureOf(['restart terdeteksi (41 menit sejak sampel terakhir, uptime 7s)']);
  const beda = signatureOf(['pool_errors_baru=2']);
  assert.equal(pertama, kedua, 'satu jenis gangguan mendapat tanda tangan yang sama');
  assert.notEqual(pertama, beda);
  assert.equal(signatureOf([]), signatureOf(['']), 'daftar kosong konsisten');
});

test('keputusan peringatan: sehat, gangguan baru, berulang, berubah, pulih', () => {
  const sekarang = Date.now();

  assert.equal(decideAlert({ previous: null, signature: 'a', issueCount: 0, nowMs: sekarang }).action, 'none');

  const baru = decideAlert({ previous: null, signature: 'a', issueCount: 1, nowMs: sekarang });
  assert.equal(baru.action, 'alert');
  assert.equal(baru.reason, 'gangguan_baru');
  assert.equal(baru.nextState.status, 'problem');

  const dalamJeda = decideAlert({
    previous: baru.nextState,
    signature: 'a',
    issueCount: 1,
    nowMs: sekarang + MENIT,
    cooldownMs: DEFAULT_COOLDOWN_MS
  });
  assert.equal(dalamJeda.action, 'skip', 'masalah yang sama tidak dikirim dua kali dalam satu jam');
  assert.equal(dalamJeda.nextState.consecutive, 2, 'jumlah pemeriksaan berturut-turut tetap dicatat');

  const lewatJeda = decideAlert({
    previous: baru.nextState,
    signature: 'a',
    issueCount: 1,
    nowMs: sekarang + DEFAULT_COOLDOWN_MS + MENIT
  });
  assert.equal(lewatJeda.action, 'alert');
  assert.equal(lewatJeda.reason, 'masih_berlangsung');

  const berubah = decideAlert({ previous: baru.nextState, signature: 'b', issueCount: 2, nowMs: sekarang + MENIT });
  assert.equal(berubah.action, 'alert', 'jenis gangguan baru langsung dilaporkan walau jeda belum lewat');
  assert.equal(berubah.reason, 'gangguan_berubah');

  const pulih = decideAlert({ previous: baru.nextState, signature: '', issueCount: 0, nowMs: sekarang + 5 * MENIT });
  assert.equal(pulih.action, 'recover');
  assert.equal(pulih.nextState.status, 'ok');

  const sehatLagi = decideAlert({ previous: pulih.nextState, signature: '', issueCount: 0, nowMs: sekarang + 10 * MENIT });
  assert.equal(sehatLagi.action, 'none', 'pulih hanya diumumkan sekali');
});

test('isi pesan menyebut gangguan, waktu WITA, dan membatasi jumlah catatan', () => {
  const issues = Array.from({ length: 7 }, (_, index) => `catatan-${index} ${index}`);
  const pesan = buildAlertMessage({
    url: 'https://bmnbpsminut.online',
    decision: { action: 'alert', reason: 'gangguan_baru' },
    issues,
    sample: { latency_ms: 463, uptime_seconds: 58, rss_mb: 146.1, backend: 'legacy' },
    nowMs: Date.parse('2026-11-07T03:00:00Z')
  });
  assert.match(pesan, /\[SIMAN GANGGUAN\] https:\/\/bmnbpsminut\.online/);
  assert.match(pesan, /1\. catatan-0 0/);
  assert.match(pesan, /4\. catatan-3 3/);
  assert.match(pesan, /\.\.\. \(3 catatan lain\)/);
  assert.match(pesan, /Waktu: /);
  assert.match(pesan, /latency 463ms/);
  assert.ok(pesan.length < 1200, `pesan harus pendek, ternyata ${pesan.length}`);

  const berlangsung = buildAlertMessage({
    url: 'x',
    decision: { action: 'alert', reason: 'masih_berlangsung' },
    issues: ['a'],
    nowMs: Date.now()
  });
  assert.match(berlangsung, /\[SIMAN MASIH BERMASALAH\]/);

  const mati = buildAlertMessage({
    url: 'x',
    decision: { action: 'alert', reason: 'gangguan_baru' },
    issues: [],
    unreachable: 'fetch failed',
    nowMs: Date.now()
  });
  assert.match(mati, /Server tidak dapat dijangkau: fetch failed/);

  const pulih = buildAlertMessage({
    url: 'x',
    decision: { action: 'recover', reason: 'pulih_setelah_peringatan' },
    issues: [],
    nowMs: Date.now()
  });
  assert.match(pulih, /\[SIMAN PULIH\]/);
  assert.match(pulih, /Tidak perlu tindakan/);
});

test('nomor tujuan digabung, dinormalkan, dan dideduplikasi', () => {
  assert.deepEqual(daftarTujuan({ recipientsArg: '0812-3456-7890, 6281234567890' , testRecipient: '' }), ['6281234567890']);
  assert.deepEqual(daftarTujuan({ recipientsArg: '; ;', testRecipient: '08111222333' }), ['628111222333']);
  assert.deepEqual(daftarTujuan({ recipientsArg: '', testRecipient: '' }), []);
});

test('peringatan dilewati dengan sebab yang jelas, bukan diam-diam', () => {
  assert.match(siapkanPeringatan({ recipientsArg: '', config: configFonnte({ testRecipient: '' }) }).alasan, /nomor tujuan/);
  assert.match(siapkanPeringatan({ recipientsArg: '081234567890', config: configFonnte({ token: '' }) }).alasan, /FONNTE_TOKEN/);
  assert.match(
    siapkanPeringatan({ recipientsArg: '081234567890', config: configFonnte({ provider: 'meta' }) }).alasan,
    /provider meta/
  );
  assert.deepEqual(siapkanPeringatan({ recipientsArg: '081234567890', config: configFonnte() }).tujuan, ['6281234567890']);
});

test('pengiriman memakai jalur Fonnte aplikasi dan hanya melaporkan nomor tersamar', async () => {
  const dicatat = [];
  const hasil = await kirimPeringatan({
    pesan: 'uji',
    recipientsArg: '0812-3456-7890',
    muatEnv: async () => {},
    bacaKonfigurasi: () => configFonnte(),
    kirim: async (config, phone, pesan) => {
      dicatat.push({ apiUrl: config.apiUrl, phone, pesan });
      return { requestId: 'req-1', messageIds: ['m-1'] };
    }
  });
  assert.equal(hasil.terkirim, 1);
  assert.equal(hasil.dilewati, false);
  assert.deepEqual(hasil.hasil[0], { mask: '***7890', status: 'terkirim', detail: 'request req-1' });
  assert.equal(dicatat[0].phone, '6281234567890', 'nomor dinormalkan sebelum dikirim');
  assert.match(hasil.rangkuman(), /terkirim=1 gagal=0 tujuan=1/);
});

test('kegagalan kirim tidak dilempar dan tercatat sebagai gagal', async () => {
  const hasil = await kirimPeringatan({
    pesan: 'uji',
    recipientsArg: '0812-3456-7890',
    muatEnv: async () => {},
    bacaKonfigurasi: () => configFonnte(),
    kirim: async () => {
      throw new Error('Fonnte API menolak pesan (HTTP 400).');
    }
  });
  assert.equal(hasil.terkirim, 0);
  assert.equal(hasil.hasil[0].status, 'gagal');
  assert.match(hasil.hasil[0].detail, /HTTP 400/);
  assert.equal(hasil.dilewati, false, 'gagal kirim bukan dilewati: state tidak boleh dianggap terberi tahu');
});

test('keadaan peringatan ditulis utuh dan terbaca kembali', () => {
  const direktori = fs.mkdtempSync(path.join(os.tmpdir(), 'siman-watch-'));
  const berkas = path.join(direktori, 'naik\\dalam\\alerts.json');
  writeAlertState(berkas, { status: 'problem', signature: 'abc', consecutive: 3 });
  assert.deepEqual(readAlertState(berkas), { status: 'problem', signature: 'abc', consecutive: 3 });
  assert.ok(!fs.existsSync(`${berkas}.tmp`), 'berkas sementara dibersihkan oleh rename');
  assert.equal(readAlertState(path.join(direktori, 'tidak-ada.json')), null);
  fs.rmSync(direktori, { recursive: true, force: true });
});

test('petunjuk kegagalan menyebut kemungkinan sebab tanpa mengutip provider', () => {
  assert.match(jelaskanKesalahan(new Error('Fonnte API tidak menerima pesan.')), /dashboard Fonnte/);
  assert.match(jelaskanKesalahan(new Error('Fonnte API menolak pesan (HTTP 400).')), /FONNTE_TOKEN/);
  assert.match(jelaskanKesalahan(new Error('Fonnte API tidak dapat dihubungi.')), /jaringan laptop/);
  assert.match(jelaskanKesalahan(new Error('Nomor tujuan tidak valid.')), /WHATSAPP_RECIPIENT_NUMBER/);
  assert.equal(jelaskanKesalahan(new Error('kesalahan lain')), 'kesalahan lain', 'pesan asing diteruskan apa adanya');
});

test('peluncur senyap menuliskan jalur ber-spasi dengan kutip yang benar', () => {
  const isi = susunPeluncur({
    root: 'C:\\xampp\\htdocs\\BMNBPSMINUT',
    node: 'C:\\Program Files\\nodejs\\node.exe',
    script: 'C:\\xampp\\htdocs\\BMNBPSMINUT\\scripts\\health-watchdog.mjs',
    logFile: 'C:\\xampp\\htdocs\\BMNBPSMINUT\\var\\watch\\watchdog.log'
  });
  const baris = isi.split('\r\n');
  assert.equal(baris[0].startsWith("'"), true, 'baris pertama harus komentar VB');
  assert.match(baris.find((teks) => teks.includes('WScript.Shell')), /Set shell = CreateObject\("WScript\.Shell"\)/);
  assert.match(baris.find((teks) => teks.includes('CurrentDirectory')), /C:\\xampp\\htdocs\\BMNBPSMINUT/);
  const jalankan = baris.find((teks) => teks.startsWith('kode = '));
  assert.match(jalankan, /^kode = shell\.Run\("""C:\\Program Files\\nodejs\\node\.exe"" --env-file-if-exists/);
  assert.match(jalankan, /--env-file-if-exists=\.env/);
  assert.match(jalankan, /--notify/);
  // wscript.exe harus menunggu node selesai; kalau tidak, Task Scheduler merasa
  // instansinya masih berjalan dan menolak semua tick berikutnya.
  assert.match(jalankan, /--log=C:\\xampp\\htdocs\\BMNBPSMINUT\\var\\watch\\watchdog\.log", 0, True\)$/);

  // Penugasan dari panggilan VBScript WAJIB berkurung. Tanpa kurung skripnya
  // gagal dikompilasi, //B menyembunyikan pesannya, dan yang tertinggal hanya
  // kode keluar 1 — cukup meyakinkan untuk dikira pemantauan yang berhasil.
  assert.doesNotMatch(isi, /^kode = shell\.Run "/m);

  // Berkas log tidak boleh dipegang selama node berjalan (FSO mengunci berkas),
  // dan tiap berkas yang dibuka harus ditutup lagi.
  const buka = baris.filter((teks) => teks.startsWith('Set aliran =')).length;
  const tutup = baris.filter((teks) => teks === 'aliran.Close').length;
  assert.equal(buka, 2);
  assert.equal(tutup, buka);
  assert.ok(!/Set \w+ = CreateObject\([^)]*\)\./.test(isi), 'metode tidak boleh dirantai langsung dari CreateObject');
  assert.match(isi, /PELUNCUR mulai/);
  assert.match(isi, /PELUNCUR selesai kode=" & kode/);
});

test('aksi jadwal memakai executable, bukan jalur skrip telanjang', () => {
  const tr = trPeluncur('C:\\xampp\\htdocs\\BMNBPSMINUT\\var\\watch\\watchdog-launch.vbs');
  assert.equal(tr, 'wscript.exe //B "C:\\xampp\\htdocs\\BMNBPSMINUT\\var\\watch\\watchdog-launch.vbs"');
  assert.match(tr, /^wscript\.exe \/\/B ".+\.vbs"$/);
  assert.ok(!tr.startsWith('"'), 'jalur .vbs tidak boleh menjadi Command');
});

test('restart tunggal dibaca sebagai deploy, crash-loop dibaca sebagai gangguan', () => {
  const nowMs = Date.parse('2026-11-07T01:00:00.000Z');
  const intervalMs = 300_000;
  const segar = '2026-11-07T00:55:00.000Z';
  const nilai = (previous, uptime = 60) => nilaiRestart({ uptime, previous, nowMs, intervalMs });

  assert.equal(nilai({ uptime_seconds: 900, at: segar }, 1000).restart, false, 'uptime naik = tidak ada restart');
  assert.equal(nilai(null).restart, false, 'sampel pertama tidak boleh menuduh apa pun');

  const deploy = nilai({ uptime_seconds: 900, at: segar });
  assert.equal(deploy.restart, true);
  assert.equal(deploy.layakDilaporkan, false, 'deploy tunggal bukan alasan mengirim WhatsApp');

  const crash = nilai({ uptime_seconds: 900, at: segar, restart_seen: true });
  assert.equal(crash.layakDilaporkan, true, 'restart dua kali berturut-turut = crash-loop');
  assert.match(crash.catatan, /uptime 60s setelah 900s/);

  const basi = nilai({ uptime_seconds: 900, at: '2026-11-06T16:00:00.000Z', restart_seen: true });
  assert.equal(basi.layakDilaporkan, false, 'sampel basi berarti pemantau yang absen, bukan aplikasinya');
  assert.match(basi.catatan, /540 menit sejak sampel terakhir/);

  assert.equal(nilai({ uptime_seconds: 900 }).layakDilaporkan, false, 'sampel tanpa waktu tidak dianggap segar');
  assert.equal(nilai({ uptime_seconds: 'tidak tentu', at: segar }).restart, false);
});
