// Penataan audit trail yang dijalankan sendiri, dengan rencana lebih dulu.
//
// Angka produksi yang mendorong alat ini: auditLogs 3,6 MB untuk 11.161 entri, di
// mana 11.077 di antaranya tercipta pada satu bulan impor data. Payload itu dibaca
// ulang setiap login dan ditulis ulang setiap kali pengguna menyimpan, sehingga
// memotongnya adalah perbaikan terbesar yang tersedia untuk backend legacy.
//
// Pemakaian:
//   node scripts/audit-trim.mjs --limit=2000                 -> rencana saja (read-only)
//   node scripts/audit-trim.mjs --limit=2000 --days=365      -> rencana dengan batas umur
//   node scripts/audit-trim.mjs --limit=2000 --apply         -> jalankan lewat job retensi
//
// Skrip ini tidak pernah menghapus catatan: entri yang digeser masuk ke tabel
// audit_log_archive dan tetap dapat dibaca kembali.
import process from 'node:process';
import dotenv from 'dotenv';
import { createDatabasePool, queryOne } from '../server/db.mjs';
import {
  createAuditRetentionJob,
  retentionCutoffDate,
  splitAuditLogsByLimit,
  splitAuditLogsByRetention
} from '../server/auditRetention.mjs';
import { currentMakassarDate } from '../server/datetime.mjs';

dotenv.config();

const argv = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  })
);

function positiveIntegerOrZero(value) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const activeLimit = positiveIntegerOrZero(argv.get('limit'));
const retentionDays = positiveIntegerOrZero(argv.get('days'));
const apply = Boolean(argv.get('apply'));

if (!activeLimit && !retentionDays) {
  console.error('Tentukan --limit=<jumlah entri> dan/atau --days=<umur hari>. Tanpa keduanya tidak ada yang perlu ditata.');
  process.exitCode = 2;
  process.exit(2);
}

const db = createDatabasePool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bmnbpsminut',
  connectionLimit: 2
});

try {
  const row = await queryOne(db, "SELECT value_json FROM app_data WHERE `key` = 'auditLogs'");
  if (!row) {
    console.error('Tabel app_data tidak memiliki kunci auditLogs; backend ini bukan mode legacy.');
    process.exitCode = 1;
  } else {
    let logs;
    try {
      logs = JSON.parse(row.value_json);
    } catch {
      logs = null;
    }
    if (!Array.isArray(logs)) {
      console.error('Blob auditLogs tidak dapat dibaca sebagai array; tidak ada yang diubah.');
      process.exitCode = 1;
    } else {
      const beforeBytes = Buffer.byteLength(row.value_json, 'utf8');
      const cutoffDate = retentionCutoffDate(retentionDays, currentMakassarDate());
      const byAge = splitAuditLogsByRetention(logs, cutoffDate);
      const byCount = splitAuditLogsByLimit(byAge.keep, activeLimit);
      const moving = [...byAge.archive, ...byCount.overflow];
      const keptBytes = Buffer.byteLength(JSON.stringify(byCount.keep), 'utf8');
      const archivedRow = await queryOne(db, "SELECT COUNT(*) AS total FROM audit_log_archive").catch(() => null);

      console.log(`Batas umur   : ${retentionDays ? `${retentionDays} hari (sebelum ${cutoffDate})` : 'tidak dibatasi'}`);
      console.log(`Batas jumlah : ${activeLimit ? `${activeLimit} entri terbaru` : 'tidak dibatasi'}`);
      console.log(`Sebelum      : ${logs.length} entri, ${Math.round(beforeBytes / 1024)} KB`);
      console.log(`Sesudah      : ${byCount.keep.length} entri, ${Math.round(keptBytes / 1024)} KB`);
      console.log(`Digeser      : ${moving.length} entri ke audit_log_archive${archivedRow ? ` (arsip sekarang ${archivedRow.total} baris)` : ''}`);

      if (!moving.length) {
        console.log('Tidak ada yang perlu digeser.');
      } else if (!apply) {
        console.log('Rencana saja; tambahkan --apply untuk menjalankan penataan.');
      } else {
        const job = createAuditRetentionJob({ db, dataBackend: 'legacy', retentionDays, activeLimit });
        const result = await job.runOnce();
        console.log(`Tereksekusi  : ${JSON.stringify(result)}`);
        if (result?.archived !== moving.length) {
          console.warn(
            `Catatan: job mengarsipkan ${result?.archived} entri dari rencana ${moving.length}; ` +
              'sisa akan tuntas pada jalankan berikutnya (dibatasi per putaran).'
          );
        }
      }
    }
  }
} finally {
  await db.end();
}
