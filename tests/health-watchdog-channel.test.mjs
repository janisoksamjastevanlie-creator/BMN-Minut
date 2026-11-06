// Saluran peringatan pemantau kesehatan: sebab galat, status perangkat Fonnte,
// jeda notifikasi lokal, dan penilaian hasil probe.
//
// Alasan modul-modul ini diuji terpisah: pada November 2026 pemantau menemukan
// server MATI dan PERHATIAN betulan, tetapi tidak ada satu pun peringatan yang
// sampai — perangkat Fonnte ternyata "disconnect" dan log hanya mencatat
// "gagal=1". Tanpa sebab yang terbaca dan tanpa saluran kedua, pemantau menjadi
// bisu justru saat paling dibutuhkan.
import assert from 'node:assert/strict';
import test from 'node:test';
import { perluLokal, signatureOf } from '../scripts/healthAlerts.mjs';
import { jelaskanKesalahan, kirimPeringatan } from '../scripts/healthNotify.mjs';
import { nilaiKanal, urlStatusDevice } from '../scripts/fonnteChannel.mjs';
import { kutipPowerShell, susunPerintahToast } from '../scripts/notifyLocal.mjs';
import { evaluate, sebabKegagalan, sedangBoot } from '../scripts/watchdogEvaluate.mjs';

const KONFIG = {
  provider: 'fonnte',
  fonnte: { token: 'token-uji', apiUrl: 'https://api.fonnte.com/send' },
  validFonnteApiUrl: true,
  meta: { testRecipient: '6285182000000' }
};

test('sebab galat Fonnte diterjemahkan menjadi tindakan yang jelas', () => {
  const salah = Object.assign(new Error('Fonnte API tidak menerima pesan.'), {
    sebab: 'request invalid on disconnected device'
  });
  const teks = jelaskanKesalahan(salah);
  assert.match(teks, /sebab: request invalid on disconnected device/);
  assert.match(teks, /dashboard Fonnte/, 'petunjuk harus menyebut tempat memperbaikinya');

  const kuota = Object.assign(new Error('Fonnte API tidak menerima pesan.'), { sebab: 'credit habis' });
  assert.match(jelaskanKesalahan(kuota), /top up/);

  // Tanpa sebab, perilaku lama tetap: petunjuk dari kalimat galat saja.
  assert.match(jelaskanKesalahan(new Error('Fonnte API tidak menerima pesan.')), /kemungkinan kredit habis/);
});

test('status perangkat Fonnte dinilai tanpa menyentuh nomor dan jaringan', () => {
  const sekarang = Date.UTC(2026, 10, 7);
  const terputus = nilaiKanal({ device_status: 'disconnect', quota: 9959, expired: '11 November 2026' }, { nowMs: sekarang });
  assert.equal(terputus.status, 'terputus');
  assert.match(terputus.catatan, /pindai QR/);
  assert.equal(nilaiKanal({ device_status: 'active', quota: 9959 }, { nowMs: sekarang }).siap, true);
  assert.equal(nilaiKanal({ device_status: 'active', quota: 0 }, { nowMs: sekarang }).status, 'kuota_habis');
  assert.equal(nilaiKanal({ device_status: 'active', expired: '1 Januari 2026' }, { nowMs: sekarang }).status, 'kedaluwarsa');
  assert.equal(nilaiKanal({ device_status: 'connecting' }, { nowMs: sekarang }).siap, false);
  assert.equal(nilaiKanal(null, { nowMs: sekarang }).status, 'tidak_terkenal');
  assert.equal(nilaiKanal({}, { nowMs: sekarang }).status, 'tidak_terkenal');
  // Format tanggal lain tidak boleh dibaca sebagai sudah kedaluwarsa.
  assert.equal(nilaiKanal({ device_status: 'active', expired: '2026-11-11' }, { nowMs: sekarang }).siap, true);
  assert.equal(nilaiKanal({ device_status: 'active', expired: '11 Nov 2026' }, { nowMs: sekarang }).siap, true);
});

test('pemeriksaan kanal hanya memakai host api.fonnte.com', () => {
  assert.equal(urlStatusDevice('https://api.fonnte.com/send'), 'https://api.fonnte.com/device');
  assert.equal(urlStatusDevice('https://example.com/send'), null);
  assert.equal(urlStatusDevice('http://api.fonnte.com/send'), null);
  assert.equal(urlStatusDevice('bukan url'), null);
});

test('kanal diperiksa hanya ketika semua pengiriman gagal', async () => {
  const dipanggil = [];
  const hasil = await kirimPeringatan({
    pesan: 'uji',
    kirim: async () => {
      throw Object.assign(new Error('Fonnte API tidak menerima pesan.'), {
        sebab: 'request invalid on disconnected device'
      });
    },
    periksaKanal: async ({ config }) => {
      // Bentuk yang diterima harus sama dengan yang dipakai periksaKanalFonnte
      // sungguhan: token + apiUrl, bukan konfigurasi WhatsApp utuh.
      assert.equal(config.token, 'token-uji');
      dipanggil.push(config.apiUrl);
      return { siap: false, status: 'terputus', catatan: 'perangkat Fonnte terputus' };
    },
    muatEnv: async () => {},
    bacaKonfigurasi: () => KONFIG
  });
  assert.equal(hasil.terkirim, 0);
  assert.equal(hasil.gagal, 1);
  assert.equal(hasil.kanal.status, 'terputus');
  assert.deepEqual(dipanggil, ['https://api.fonnte.com/send']);
  assert.match(hasil.hasil[0].detail, /disconnected device/);

  const sehat = await kirimPeringatan({
    pesan: 'uji',
    kirim: async () => ({ requestId: 'abc' }),
    periksaKanal: async () => {
      throw new Error('tidak boleh dipanggil saat pengiriman berhasil');
    },
    muatEnv: async () => {},
    bacaKonfigurasi: () => KONFIG
  });
  assert.equal(sehat.kanal, null);
  assert.equal(sehat.gagal, 0);
});

test('notifikasi Windows dibentuk dengan kutip yang aman', () => {
  assert.equal(kutipPowerShell("it's works"), "'it''s works'");
  assert.equal(kutipPowerShell('a' + String.fromCharCode(13) + String.fromCharCode(10) + 'b'), "'a / b'", 'CR-LF hanya satu pemisah');
  assert.equal(kutipPowerShell('a' + String.fromCharCode(7) + 'b'), "'a b'");
  const perintah = susunPerintahToast({ judul: "SIMAN 'gagal'", pesan: 'baris satu' + String.fromCharCode(10) + 'baris dua' });
  assert.match(perintah, /Add-Type -AssemblyName System\.Windows\.Forms/);
  assert.match(perintah, /\$n\.BalloonTipTitle = 'SIMAN ''gagal'''/);
  assert.match(perintah, /baris satu · baris dua/, 'baris baru menjadi pemisah, bukan memutus perintah');
  assert.equal(perintah.includes(String.fromCharCode(10)), false, 'satu baris perintah');
  assert.match(perintah, /ShowBalloonTip\(12000\)/);
  assert.match(susunPerintahToast({ judul: 'a', pesan: 'b', detikTampil: 999 }), /ShowBalloonTip\(30000\)/);
  assert.match(susunPerintahToast({ judul: 'a', pesan: 'b', detikTampil: 0 }), /ShowBalloonTip\(12000\)/, 'nol memakai durasi baku, bukan tanpa jeda');
  assert.ok(panjangKecil(susunPerintahToast({ judul: 'x'.repeat(400), pesan: 'y'.repeat(4000) })), 'pesan panjang dipotong');
  // Karakter kontrol tidak boleh lolos ke perintah.
  const tersusup = susunPerintahToast({ judul: 'a' + String.fromCharCode(0) + 'b', pesan: 'c' + String.fromCharCode(7) + 'd' });
  assert.equal(tersusup.includes(String.fromCharCode(0)), false);
  assert.equal(tersusup.includes(String.fromCharCode(7)), false);
});

function panjangKecil(perintah) {
  return perintah.length < 1500;
}

test('saluran lokal punya jedanya sendiri dan tidak menimpa state WhatsApp', () => {
  const sekarang = Date.UTC(2026, 10, 7, 10, 0, 0);
  const baru = perluLokal({ previous: null, signature: 'abc', nowMs: sekarang });
  assert.equal(baru.kirim, true);
  assert.equal(baru.alasan, 'baru');

  const state = { status: 'ok', last_recovered_at: 'x', lokal: baru.nextState };
  const dalamJeda = perluLokal({ previous: state, signature: 'abc', nowMs: sekarang + 5 * 60_000 });
  assert.equal(dalamJeda.kirim, false, 'masalah yang sama tidak dibunyikan tiap lima menit');
  const lewatJeda = perluLokal({ previous: state, signature: 'abc', nowMs: sekarang + 31 * 60_000 });
  assert.equal(lewatJeda.kirim, true);
  assert.equal(lewatJeda.alasan, 'masih_berlangsung');
  const berubah = perluLokal({ previous: state, signature: 'def', nowMs: sekarang + 60_000 });
  assert.equal(berubah.alasan, 'berubah');

  const pulih = perluLokal({ previous: state, signature: '', nowMs: sekarang + 60_000 });
  assert.equal(pulih.kirim, true);
  assert.equal(pulih.alasan, 'pulih');
  assert.equal(pulih.nextState.status, 'ok');
  assert.equal(pulih.nextState.last_recovered_at, undefined, 'state lokal tidak mengarang field state WhatsApp');
  const sehat = perluLokal({ previous: { status: 'ok' }, signature: '', nowMs: sekarang });
  assert.equal(sehat.kirim, false);
  assert.equal(sehat.alasan, 'sehat');
});

function probeBaik(load, extra = {}) {
  return { latencyMs: 400, status: 200, body: { status: 'ok', load }, ...extra };
}

test('riwayat kesehatan yang belum siap saat boot bukan gangguan', () => {
  const boot = { uptime_seconds: 0, health_history: { enabled: true, interval_ms: 300000, table_ready: false } };
  assert.deepEqual(evaluate(probeBaik(boot), null), []);
  assert.equal(sedangBoot(boot), true);
  assert.equal(sedangBoot({ uptime_seconds: 900, health_history: { interval_ms: 300000 } }), false);

  const matang = { uptime_seconds: 1200, health_history: { enabled: true, interval_ms: 300000, table_ready: false } };
  const daftar = evaluate(probeBaik(matang), null);
  assert.equal(daftar.length, 1);
  assert.match(daftar[0], /health_samples/);
});

test('riwayat yang macet tetap dilaporkan, tetapi tidak saat proses baru hidup', () => {
  const sekarang = Date.UTC(2026, 10, 7, 10);
  const lama = {
    uptime_seconds: 1800,
    health_history: {
      enabled: true,
      interval_ms: 300000,
      table_ready: true,
      last_write_at: new Date(sekarang - 40 * 60_000).toISOString()
    }
  };
  assert.match(evaluate(probeBaik(lama), null, { nowMs: sekarang })[0], /macet/);

  const baru = { ...lama, uptime_seconds: 30 };
  assert.deepEqual(evaluate(probeBaik(baru), null, { nowMs: sekarang }), []);
});

test('penilaian lain tetap berjalan setelah pemindahan modul', () => {
  const sekarang = Date.UTC(2026, 10, 7, 10);
  const load = {
    uptime_seconds: 2000,
    memory: { limit_ratio: 0.9 },
    database: { pool_errors: 4 },
    health_history: { enabled: true, interval_ms: 300000, table_ready: true, last_write_at: new Date(sekarang).toISOString() }
  };
  const sebelumnya = { pool_errors: 2, uptime_seconds: 1500 };
  const daftar = evaluate(probeBaik(load, { latencyMs: 9000 }), sebelumnya, { nowMs: sekarang });
  assert.match(daftar.join('; '), /pool_errors_baru=2/);
  assert.match(daftar.join('; '), /latency 9000ms/);
  assert.match(daftar.join('; '), /memori 90%/);

  const ditolak = evaluate({ latencyMs: 100, status: 502, body: null }, null);
  assert.match(ditolak[0], /health menolak \(HTTP 502/);
});

test('server mati dan laptop mati sinyal tidak lagi dilaporkan sama', () => {
  const galat = new Error('fetch failed');
  const rujukan = 'https://api.fonnte.com/';

  const server = sebabKegagalan({ error: galat, rujukanError: null, rujukanUrl: rujukan });
  assert.equal(server.lokal, false);
  assert.match(server.label, /^server tidak dapat dijangkau \(fetch failed\)/);

  const laptop = sebabKegagalan({ error: galat, rujukanError: new Error('timeout'), rujukanUrl: rujukan });
  assert.equal(laptop.lokal, true);
  assert.match(laptop.label, /koneksi laptop terputus/);
  assert.match(laptop.label, /api\.fonnte\.com/, 'rujukan disebut supaya sebabnya terbaca');

  // Tanda tangan berbeda: peringatan "laptop tanpa jaringan" tidak boleh
  // dianggap kejadian yang sama dengan gangguan server saat menentukan jeda.
  assert.notEqual(signatureOf([server.label]), signatureOf([laptop.label]));

  const tanpaRujukan = sebabKegagalan({ error: galat, rujukanError: new Error('x'), rujukanUrl: '' });
  assert.match(tanpaRujukan.label, /rujukan juga tidak dapat dijangkau/);
  assert.equal(sebabKegagalan({}).lokal, false, 'galat tanpa informasi apa pun tetap dianggap gangguan server');
});
