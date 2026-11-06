import test from 'node:test';
import assert from 'node:assert/strict';
import {
  uraikanWaktuTugas,
  formatWaktuTugas,
  namaStateTugas,
  jelaskanHasilTugas,
  susunBarisStatus
} from '../scripts/watchdogStatus.mjs';

test('waktu tugas dari PowerShell, teks lokal, dan nilai kosong terurai konsisten', () => {
  const ms = Date.now();
  const tanggal = uraikanWaktuTugas(`/Date(${ms})/`);
  assert.ok(tanggal instanceof Date);
  assert.equal(tanggal.getTime(), ms);

  // Task Scheduler memakai waktu lokal; jangan sampai dibaca sebagai UTC.
  const jam = new Date(ms).getHours();
  assert.equal(Number(formatWaktuTugas(`/Date(${ms})/`).slice(11, 13)), jam);

  assert.equal(formatWaktuTugas('2026-11-07 00:28:00'), '2026-11-07 00:28:00');
  assert.equal(formatWaktuTugas('2026-11-07T00:28:00'), '2026-11-07 00:28:00');
  assert.equal(uraikanWaktuTugas(null), null);
  assert.equal(uraikanWaktuTugas(''), null);
  assert.equal(uraikanWaktuTugas('bukan tanggal'), null);
  assert.equal(formatWaktuTugas('bukan tanggal'), 'belum ada');

  // Tugas yang belum pernah dijalankan memakai tahun 1 sebagai penanda.
  assert.equal(uraikanWaktuTugas('/Date(-62135596800000)/'), null);
});

test('kode hasil tugas dijelaskan tanpa memaksa pembaca menghafal angka', () => {
  assert.equal(jelaskanHasilTugas(0), 'sukses');
  assert.equal(jelaskanHasilTugas(null), 'belum ada catatan');
  assert.equal(jelaskanHasilTugas(267009), 'sedang berjalan (267009)');
  assert.equal(jelaskanHasilTugas(267011), 'belum pernah dijalankan (267011)');
  assert.equal(jelaskanHasilTugas(1), 'kode 1 — gangguan ditemukan ATAU peluncur gagal sebelum node jalan (lihat baris log)');
  assert.equal(jelaskanHasilTugas(2), 'pemeriksaan berakhir dengan kode 2 — server tidak dapat dihubungi');
  assert.equal(jelaskanHasilTugas(4), 'pemeriksaan berakhir dengan kode 4');
  assert.match(jelaskanHasilTugas(2147946720), /instance sebelumnya/);
  assert.match(jelaskanHasilTugas(2147943712), /sesi logon tidak ada/);
  assert.match(jelaskanHasilTugas(2147942402), /berkas peluncur tidak ditemukan/);
  assert.match(jelaskanHasilTugas(2147942405), /Administrator/);
  assert.equal(jelaskanHasilTugas(3221225477), 'kode 0xc0000005 (3221225477)');
});

const cari = (baris, label) => baris.find((teks) => teks.trim().startsWith(label));

test('state tugas dan labelnya tetap terbaca walau nomornya asing', () => {
  assert.equal(namaStateTugas(3), 'siap');
  assert.equal(namaStateTugas(4), 'berjalan sekarang');
  assert.equal(namaStateTugas(1), 'nonaktif');
  assert.equal(namaStateTugas(9), 'kode 9');
  assert.equal(namaStateTugas(undefined), 'tidak diketahui');
});

test('ringkasan status tidak menyebut tanggal penanda untuk tugas yang belum jalan', () => {
  const baris = susunBarisStatus({
    namaTugas: 'SIMAN Health Watchdog',
    info: { NextRunTime: '/Date(1793982480000)/', LastRunTime: '/Date(-62135596800000)/', LastTaskResult: 267011, State: 3 },
    berkasLog: 'var/watch/watchdog.log',
    barisLog: '[x] SEHAT'
  });
  assert.equal(baris[0], 'Jadwal "SIMAN Health Watchdog" terpasang.');
  assert.match(cari(baris, 'jalankan berikutnya'), /: 2026-/);
  assert.match(cari(baris, 'jalankan terakhir'), /^ {2}jalankan terakhir\s+: belum ada$/);
  assert.match(cari(baris, 'pemeriksaan terakhir'), /: \[x\] SEHAT$/);
  assert.match(baris.at(-1), /belum pernah dijalankan/);
  assert.doesNotMatch(baris.join('\n'), /1999|0001/);
});

test('ringkasan status menegur jadwal yang macet dan diam saat masih sehat', () => {
  const info = (lastRunMs) => ({
    NextRunTime: `/Date(${lastRunMs + 300_000})/`,
    LastRunTime: `/Date(${lastRunMs})/`,
    LastTaskResult: 0,
    State: 3
  });
  const nowMs = Date.now();
  const baru = susunBarisStatus({
    namaTugas: 'W', info: info(nowMs - 60_000), berkasLog: 'log', barisLog: null, intervalMenit: 5, nowMs
  });
  assert.ok(!baru.some((baris) => baris.includes('catatan')), baru.join('\n'));

  const macet = susunBarisStatus({
    namaTugas: 'W', info: info(nowMs - 40 * 60_000), berkasLog: 'log', barisLog: null, intervalMenit: 5, nowMs
  });
  assert.match(macet.at(-1), /sudah 40 menit tidak berjalan/);

  // Tanpa baris log, label log tetap ada dan tetap rata.
  assert.match(macet.join('\n'), /^ {2}log\s+: log$/m);
});
