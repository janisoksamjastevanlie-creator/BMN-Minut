// Pemasang jadwal pemantau kesehatan pada Windows Task Scheduler.
//
// Hosting terkelola Hostinger tidak menyediakan cron untuk rencana Node.js, jadi
// pemeriksaan dijalankan dari laptop ini tiap 5 menit. Peluncurannya memakai
// berkas .vbs kecil agar proses node berjalan tanpa jendela konsol yang berkedip
// setiap lima menit; berkas itu dibuat di var/watch (tidak ikut ke Git) karena
// isinya jalur absolut mesin ini.
//
// Pemakaian:
//   node scripts/install-watchdog-task.mjs                     # pasang / perbarui
//   node scripts/install-watchdog-task.mjs --run               # jalankan sekarang
//   node scripts/install-watchdog-task.mjs --verify            # buktikan tick tercatat di log
//   node scripts/install-watchdog-task.mjs --status            # lihat jadwal + hasil
//   node scripts/install-watchdog-task.mjs --remove            # buka jadwalnya
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { susunPeluncur as susun, trPeluncur } from './watchdogLauncher.mjs';
import { susunBarisStatus, namaStateTugas } from './watchdogStatus.mjs';

const sini = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(sini, '..');
const argv = process.argv.slice(2);
const ada = (flag) => argv.includes(flag);

const namaTugas = (() => {
  const indeks = argv.indexOf('--name');
  return indeks >= 0 && argv[indeks + 1] ? String(argv[indeks + 1]) : 'SIMAN Health Watchdog';
})();
const menit = (() => {
  const indeks = argv.indexOf('--every-minutes');
  const nilai = Number(indeks >= 0 ? argv[indeks + 1] : 5);
  return Number.isInteger(nilai) && nilai >= 1 && nilai <= 59 ? nilai : 5;
})();

const berkasVbs = path.join(root, 'var', 'watch', 'watchdog-launch.vbs');
const berkasLog = path.join(root, 'var', 'watch', 'watchdog.log');

function jalankanSchtasks(argumen) {
  const hasil = spawnSync('schtasks.exe', argumen, { encoding: 'utf8' });
  if (hasil.error) return { berhasil: false, keluaran: String(hasil.error.message) };
  const keluaran = `${hasil.stdout || ''}${hasil.stderr || ''}`.trim();
  return { berhasil: hasil.status === 0, keluaran, status: hasil.status };
}

// Label keluaran schtasks /V ikut bahasa Windows dan schtasks /Query /XML hanya
// berisi definisi tugas (tanpa waktu jalan), jadi jadwal dibaca lewat PowerShell
// yang nama propertinya selalu sama di semua locale.
function kutipPowerShell(teks) {
  return `'${String(teks).replace(/'/g, "''")}'`;
}

function jalankanPowerShell(cmdlet, { butuhJson = false } = {}) {
  const hasil = spawnSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmdlet],
    { encoding: 'utf8' });
  if (hasil.error) return { berhasil: false, keluaran: String(hasil.error.message), data: null };
  const keluaran = `${hasil.stdout || ''}`.trim();
  let data = null;
  if (butuhJson) {
    try {
      data = JSON.parse(keluaran);
    } catch {
      data = null;
    }
  }
  const berhasil = butuhJson ? hasil.status === 0 && data !== null : hasil.status === 0;
  return { berhasil, keluaran, data, catatan: `${hasil.stderr || ''}`.trim() };
}

function bacaInfoTugas(nama) {
  const cmdlet = `$ErrorActionPreference='Stop'; ` +
    `$i=Get-ScheduledTaskInfo -TaskName ${kutipPowerShell(nama)}; ` +
    `$t=Get-ScheduledTask -TaskName ${kutipPowerShell(nama)}; ` +
    `[pscustomobject]@{NextRunTime=$i.NextRunTime;LastRunTime=$i.LastRunTime;` +
    `LastTaskResult=$i.LastTaskResult;State=$t.State} | ConvertTo-Json -Compress`;
  return jalankanPowerShell(cmdlet, { butuhJson: true });
}

// Dua bawaan schtasks membuat jadwal terlihat terpasang padahal tidak pernah
// memeriksa apa pun, jadi keduanya dilawan di sini:
// 1) aksinya harus wscript.exe dengan argumen, bukan jalur .vbs telanjang —
//    jalur berkas tanpa executable membuat Task Scheduler kehilangan jejak
//    proses, instansinya menggantung sebagai "berjalan", dan setiap tick
//    berikutnya ditolak (0x800710E0) tanpa suara;
// 2) laptop yang tidak tercolok listrik secara bawaan menghentikan jadwal dan
//    tick yang terlewat tidak dikejar, padahal pemantau justru dibutuhkan saat
//    gangguan.
function perbaikanTugasCmd(nama) {
  return `$ErrorActionPreference='Stop'; ` +
    `$t=Get-ScheduledTask -TaskName ${kutipPowerShell(nama)}; ` +
    `$s=$t.Settings; ` +
    `$s.DisallowStartIfOnBatteries=$false; ` +
    `$s.StopIfGoingOnBatteries=$false; ` +
    `$s.WakeToRun=$true; ` +
    `$s.StartWhenAvailable=$true; ` +
    `$s.ExecutionTimeLimit='PT1H'; ` +
    `Set-ScheduledTask -InputObject $t | Out-Null; 'ok'`;
}

function perbaikiTugas(nama) {
  return jalankanPowerShell(perbaikanTugasCmd(nama));
}

function barisLog() {
  if (!fs.existsSync(berkasLog)) return [];
  return fs.readFileSync(berkasLog, 'utf8').split(/\r?\n/).filter(Boolean);
}

function barisLogTerakhir() {
  return barisLog().at(-1) || '(belum ada isi)';
}

const tunggu = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Bukti bahwa jadwal benar-benar hidup: satu tick dipicu, hasilnya dibaca lagi.
// Instance lama yang menggantung dibersihkan lebih dulu supaya tick tidak
// ditolak dan menyebabkan verifikasinya sendiri yang gagal.
async function verifikasi(nama) {
  jalankanSchtasks(['/End', '/TN', nama]);
  const sebelum = barisLog().length;
  const jalankan = jalankanSchtasks(['/Run', '/TN', nama]);
  if (!jalankan.berhasil) {
    console.error(`Gagal memicu pemeriksaan: ${jalankan.keluaran}`);
    return 1;
  }
  console.log(`Instance lama dibersihkan, pemeriksaan dipicu, menunggu baris log baru (${sebelum} baris sudah ada)...`);
  const batasMs = Date.now() + 90_000;
  while (Date.now() < batasMs) {
    const isi = barisLog();
    if (isi.length > sebelum) {
      for (const baris of isi.slice(sebelum)) console.log(`  log : ${baris}`);
      break;
    }
    await tunggu(2000);
  }
  const info = bacaInfoTugas(nama);
  const baru = barisLog().length - sebelum;
  for (const baris of susunBarisStatus({
    namaTugas: nama, info: info.data, berkasLog, barisLog: barisLogTerakhir(), intervalMenit: menit
  }).slice(1)) console.log(baris);
  if (baru > 0) {
    console.log(`HASIL: jadwal benar-benar menjalankan pemeriksaan (baris log bertambah ${baru}).`);
    return 0;
  }
  console.log('HASIL: pemeriksaan tidak tercatat — jadwalnya tidak menjalankan peluncur.');
  return 1;
}

if (ada('--remove')) {
  const hasil = jalankanSchtasks(['/Delete', '/TN', namaTugas, '/F']);
  console.log(hasil.berhasil ? `Jadwal "${namaTugas}" dibuka.` : `Gagal membuka jadwal: ${hasil.keluaran}`);
  if (hasil.berhasil && fs.existsSync(berkasVbs)) fs.rmSync(berkasVbs);
  process.exitCode = hasil.berhasil ? 0 : 1;
} else if (ada('--status')) {
  const info = bacaInfoTugas(namaTugas);
  if (!info.berhasil) {
    console.log(`Jadwal "${namaTugas}" belum terpasang.`);
    console.log('  pasang dengan: node scripts/install-watchdog-task.mjs');
    process.exitCode = 1;
  } else {
    for (const baris of susunBarisStatus({
      namaTugas, info: info.data, berkasLog, barisLog: barisLogTerakhir(), intervalMenit: menit
    })) console.log(baris);
    // Tugas yang macet di state "berjalan" membuat tiap tick berikutnya
    // ditolak, jadi tunjukkan cara menyembuhkannya.
    if (namaStateTugas(info.data?.State) === 'berjalan sekarang') {
      console.log('  catatan : instance lama masih dianggap berjalan — jalankan node scripts/install-watchdog-task.mjs --verify');
    }
  }
} else if (ada('--verify')) {
  if (process.platform !== 'win32') {
    console.error('Penjadwalan ini khusus Windows; di hosting lain gunakan cron sistem.');
    process.exitCode = 1;
  } else {
    process.exitCode = await verifikasi(namaTugas);
  }
} else if (ada('--run')) {
  const hasil = jalankanSchtasks(['/Run', '/TN', namaTugas]);
  console.log(hasil.berhasil ? `Pemantauan dijalankan sekarang (${namaTugas}).` : `Gagal menjalankan: ${hasil.keluaran}`);
  if (hasil.berhasil) console.log('  hasil pemeriksaan masuk ke log; periksa dengan: node scripts/install-watchdog-task.mjs --status');
  process.exitCode = hasil.berhasil ? 0 : 1;
} else {
  if (process.platform !== 'win32') {
    console.error('Penjadwalan ini khusus Windows; di hosting lain gunakan cron sistem.');
    process.exitCode = 1;
  } else {
    fs.mkdirSync(path.dirname(berkasVbs), { recursive: true });
    const isi = susun({
      root,
      node: process.execPath,
      script: path.join(root, 'scripts', 'health-watchdog.mjs'),
      logFile: berkasLog
    });
    fs.writeFileSync(berkasVbs, isi);
    const hasil = jalankanSchtasks(['/Create', '/F', '/TN', namaTugas, '/SC', 'MINUTE', '/MO', String(menit),
      '/TR', trPeluncur(berkasVbs)]);
    if (!hasil.berhasil) {
      console.error(`Gagal memasang jadwal: ${hasil.keluaran}`);
      console.error(`Peluncur dibuat di ${berkasVbs} — isinya:`);
      console.error(isi);
      process.exitCode = 1;
    } else {
      const rapikan = perbaikiTugas(namaTugas);
      console.log(`Jadwal "${namaTugas}" terpasang: setiap ${menit} menit, senyap, tanpa jendela konsol.`);
      console.log(`  peluncur : ${berkasVbs}`);
      console.log(`  log      : ${berkasLog}`);
      console.log(`  baterai  : ${rapikan.berhasil
        ? 'tetap jalan saat laptop tidak tercolok, tick yang terlewat dikejar saat menyala'
        : `GAGAL — jadwal hanya jalan saat tercolok listrik (${rapikan.keluaran || rapikan.catatan})`}`);
      console.log(`  buktikan : node scripts/install-watchdog-task.mjs --verify`);
      console.log(`  periksa  : node scripts/install-watchdog-task.mjs --status`);
      if (!rapikan.berhasil) process.exitCode = 1;
    }
  }
}
