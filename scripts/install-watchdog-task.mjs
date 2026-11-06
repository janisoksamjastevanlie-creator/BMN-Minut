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
//   node scripts/install-watchdog-task.mjs --status            # lihat jadwal + hasil
//   node scripts/install-watchdog-task.mjs --remove            # buka jadwalnya
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { susunPeluncur as susun } from './watchdogLauncher.mjs';
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

// Laptop yang tidak tercolok listrik secara bawaan menghentikan jadwal, sehingga
// pemantau berhenti justru saat gangguan paling mungkin terjadi. Pengaturan ini
// membuat tugas tetap jalan saat baterai, bangun dari tidur, dan mengejar tick
// yang terlewat begitu laptop menyala lagi.
function longgarkanBaterai(nama) {
  const cmdlet = `$ErrorActionPreference='Stop'; ` +
    `$t=Get-ScheduledTask -TaskName ${kutipPowerShell(nama)}; ` +
    `$t.Settings.DisallowStartIfOnBatteries=$false; ` +
    `$t.Settings.StopIfGoingOnBatteries=$false; ` +
    `$t.Settings.WakeToRun=$true; ` +
    `$t.Settings.StartWhenAvailable=$true; ` +
    `$t.Settings.ExecutionTimeLimit='PT1H'; ` +
    `Set-ScheduledTask -InputObject $t | Out-Null; 'ok'`;
  return jalankanPowerShell(cmdlet);
}

function barisLogTerakhir() {
  if (!fs.existsSync(berkasLog)) return '(belum ada isi)';
  const baris = fs.readFileSync(berkasLog, 'utf8').split(/\r?\n/).filter(Boolean);
  return baris.at(-1) || '(kosong)';
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
    // Tugas yang macet di state "berjalan" akan membuat tiap tick berikutnya
    // dilewati, jadi tunjukkan cara membukanya.
    if (namaStateTugas(info.data?.State) === 'berjalan sekarang') {
      console.log('  catatan : instance lama masih dianggap berjalan; hentikan dengan schtasks /End /TN "' + namaTugas + '" bila tidak kunjung selesai.');
    }
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
    const hasil = jalankanSchtasks(['/Create', '/F', '/TN', namaTugas, '/SC', 'MINUTE', '/MO', String(menit), '/TR', `"${berkasVbs}"`]);
    if (!hasil.berhasil) {
      console.error(`Gagal memasang jadwal: ${hasil.keluaran}`);
      console.error(`Peluncur dibuat di ${berkasVbs} — isinya:`);
      console.error(isi);
      process.exitCode = 1;
    } else {
      const baterai = longgarkanBaterai(namaTugas);
      console.log(`Jadwal "${namaTugas}" terpasang: setiap ${menit} menit, senyap, tanpa jendela konsol.`);
      console.log(`  peluncur : ${berkasVbs}`);
      console.log(`  log      : ${berkasLog}`);
      console.log(`  baterai  : ${baterai.berhasil
        ? 'tetap jalan saat laptop tidak tercolok, tick yang terlewat dikejar saat menyala'
        : `GAGAL — jadwal hanya jalan saat tercolok listrik (${baterai.keluaran || baterai.catatan})`}`);
      console.log(`  periksa  : node scripts/install-watchdog-task.mjs --status`);
      if (!baterai.berhasil) process.exitCode = 1;
    }
  }
}
