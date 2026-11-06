// Alat pemulihan pencatatan internal database legacy (app_meta).
//
// Gejala nyata yang mendorong alat ini: tabel app_meta hilang dari engine MariaDB
// (error 1932 "doesn't exist in engine") sementara seluruh isi app_data masih utuh.
// Tanpa app_meta, server gagal start dan nomor permohonan tidak punya lantai pengaman,
// sehingga berisiko menghasilkan nomor ganda setelah pemulihan.
//
// Pemakaian:
//   node scripts/repair-legacy-meta.mjs            -> periksa saja (read-only)
//   node scripts/repair-legacy-meta.mjs --apply    -> bangun ulang app_meta + lantai nomor
//
// Skrip ini sengaja tidak mengubah tabel data. Yang dihapus dan dibuat ulang hanya
// app_meta, yaitu tabel pencatatan (revision dan request_number_floor:<tahun>) yang
// isinya dapat dihitung kembali dari app_data.
import dotenv from 'dotenv';
import { createDatabasePool } from '../server/db.mjs';

dotenv.config();

const LEGACY_TABLES = [
  'app_data',
  'app_meta',
  'auth_users',
  'sessions',
  'document_files',
  'whatsapp_messages',
  'whatsapp_notifications'
];

const APP_META_DDL = `CREATE TABLE app_meta (
  \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
  value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

function isMissingInEngine(error) {
  return error?.errno === 1932 || /doesn't exist in engine/i.test(String(error?.message || ''));
}

// Nomor permohonan berbentuk PREFIX/<tahun>/<urutan>. Tahun dan urutan diambil apa adanya
// supaya alat ini tetap berguna bila prefiks instansi berganti.
function requestNumberFloors(requests) {
  const floors = new Map();
  for (const request of Array.isArray(requests) ? requests : []) {
    const number = typeof request?.nomorPermintaan === 'string' ? request.nomorPermintaan.trim() : '';
    const parts = number.split('/');
    if (parts.length < 3) continue;
    const year = parts[parts.length - 2];
    const sequence = parts[parts.length - 1];
    if (!/^\d{4}$/.test(year) || !/^\d{4,}$/.test(sequence)) continue;
    floors.set(year, Math.max(floors.get(year) || 0, Number(sequence)));
  }
  return floors;
}

async function readAppDataJson(db, key) {
  const [rows] = await db.execute('SELECT value_json FROM app_data WHERE `key` = ?', [key]);
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].value_json);
  } catch {
    return null;
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = createDatabasePool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    connectionLimit: 2
  });

  try {
    console.log(`Database: ${process.env.DB_NAME}`);
    const broken = [];
    for (const table of LEGACY_TABLES) {
      try {
        const [rows] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
        console.log(`  ${table.padEnd(24)} ${String(rows[0].total).padStart(6)} baris  sehat`);
      } catch (error) {
        if (isMissingInEngine(error)) {
          broken.push(table);
          console.log(`  ${table.padEnd(24)}          RUSAK (tidak ada di engine)`);
        } else {
          console.log(`  ${table.padEnd(24)}          tidak dapat dibaca: ${error.message}`);
        }
      }
    }

    if (!broken.includes('app_meta')) {
      console.log('\napp_meta tidak perlu dibangun ulang; tidak ada tindakan.');
      return;
    }

    const requests = await readAppDataJson(db, 'requests');
    const floors = requestNumberFloors(requests);
    console.log(`\nLantai nomor yang dapat dihitung ulang dari app_data: ${floors.size} tahun`);
    for (const [year, floor] of [...floors.entries()].sort()) {
      console.log(`  request_number_floor:${year} = ${floor}`);
    }

    if (!apply) {
      console.log('\nMode periksa saja. Jalankan ulang dengan --apply untuk membangun ulang app_meta.');
      return;
    }

    // Tabel rusak masih terdaftar di kamus MariaDB, jadi DROP diperlukan sebelum CREATE;
    // IF NOT EXISTS tidak akan memperbaiki apa pun dalam kondisi ini.
    await db.query('DROP TABLE IF EXISTS app_meta');
    await db.query(APP_META_DDL);
    await db.query("INSERT INTO app_meta (`key`, value) VALUES ('revision', '0')");
    for (const [year, floor] of floors) {
      await db.execute(
        `INSERT INTO app_meta (\`key\`, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = GREATEST(CAST(value AS UNSIGNED), CAST(VALUES(value) AS UNSIGNED))`,
        [`request_number_floor:${year}`, String(floor)]
      );
    }

    const [check] = await db.execute('SELECT `key`, value FROM app_meta ORDER BY `key`');
    console.log(`\napp_meta pulih: ${check.length} baris pencatatan tertulis.`);
    console.log('Catatan: revision dimulai dari 0 sehingga pengguna dengan salinan lama akan diminta');
    console.log('sinkron ulang sekali — itu jalur aman, bukan penimpaan diam-diam.');
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('Pemeriksaan gagal:', error?.message || error);
  process.exitCode = 1;
});
