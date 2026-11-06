// Laporan kesiapan mode operasional (read-only).
//
// Produksi sampai kini berjalan di mode legacy sementara README mewajibkan mode
// operasional. Keputusan itu tidak bisa diambil tanpa angka: berapa banyak tabel/kolom
// yang belum ada, dan berapa banyak catatan yang harus dipindahkan. Skrip ini mengukur
// keduanya tanpa menulis apa pun.
//
// Pemakaian:
//   node scripts/operational-readiness.mjs            -> database dari .env
//   node scripts/operational-readiness.mjs --db=nama  -> database lain (mis. salinan uji)
//   node scripts/operational-readiness.mjs --json     -> keluaran machine-readable
import process from 'node:process';
import dotenv from 'dotenv';
import { assertOperationalSchema, readOperationalState } from '../operationalStore.mjs';
import { createDatabasePool, queryRows } from '../server/db.mjs';

dotenv.config();

const argv = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  })
);

function listFromError(error) {
  const message = String(error?.message || '');
  const marker = 'missing: ';
  const index = message.indexOf(marker);
  if (index === -1) return [message];
  return message.slice(index + marker.length).split(', ');
}

async function readLegacyCounts(db) {
  try {
    const rows = await queryRows(db, "SELECT `key`, value_json, CHAR_LENGTH(value_json) AS bytes FROM app_data");
    const counts = {};
    for (const row of rows) {
      let size = 0;
      try {
        const parsed = JSON.parse(row.value_json);
        size = Array.isArray(parsed) ? parsed.length : 1;
      } catch {
        size = -1;
      }
      counts[row.key] = { records: size, bytes: Number(row.bytes) };
    }
    return counts;
  } catch {
    return null;
  }
}

const db = createDatabasePool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: String(argv.get('db') || process.env.DB_NAME),
  connectionLimit: 2
});

try {
  const report = { database: String(argv.get('db') || process.env.DB_NAME), schema_gaps: [], relationships_gaps: [], legacy_data: null, operational_readable: null };

  try {
    await assertOperationalSchema(db);
    report.schema_complete = true;
  } catch (error) {
    report.schema_complete = false;
    const gaps = listFromError(error);
    if (/relationships are incomplete/.test(String(error.message))) report.relationships_gaps = gaps;
    else report.schema_gaps = gaps;
    // Bila tabel dasar belum lengkap, pemeriksaan relasi tidak dapat dijalankan;
    // laporkan keduanya sekaligus dengan estimasi jumlah.
    if (!report.relationships_gaps.length && report.schema_gaps.length) {
      report.relationships_gaps = ['(belum dapat diperiksa: tabel dasar belum lengkap)'];
    }
  }

  report.legacy_data = await readLegacyCounts(db);

  if (report.schema_complete) {
    try {
      const state = await readOperationalState(db);
      report.operational_readable = Object.fromEntries(
        Object.entries(state).map(([key, value]) => [key, Array.isArray(value) ? value.length : typeof value])
      );
    } catch (error) {
      report.operational_readable = `gagal: ${error.message}`;
    }
  }

  if (argv.get('json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const totalLegacyBytes = Object.values(report.legacy_data || {}).reduce(
      (total, entry) => total + (entry.bytes || 0),
      0
    );
    console.log(`Database: ${report.database}`);
    console.log(`Skema operasional lengkap: ${report.schema_complete ? 'YA' : 'BELUM'}`);
    if (report.schema_gaps.length) {
      console.log(`  kolom/tabel belum ada (${report.schema_gaps.length}): ${report.schema_gaps.slice(0, 12).join(', ')}${report.schema_gaps.length > 12 ? ', ...' : ''}`);
    }
    if (report.relationships_gaps.length) {
      console.log(`  relasi belum ada (${report.relationships_gaps.length}): ${report.relationships_gaps.slice(0, 8).join(', ')}${report.relationships_gaps.length > 8 ? ', ...' : ''}`);
    }
    if (report.legacy_data) {
      const rows = Object.entries(report.legacy_data).sort((a, b) => b[1].bytes - a[1].bytes);
      console.log(`  data legacy yang harus dipindah: ${rows.length} koleksi, ${Math.round(totalLegacyBytes / 1024)} KB`);
      for (const [key, value] of rows.slice(0, 8)) {
        console.log(`    ${key.padEnd(16)} ${String(value.records).padStart(6)} catatan  ${String(Math.round(value.bytes / 1024)).padStart(5)} KB`);
      }
    } else {
      console.log('  tabel app_data tidak ditemukan (bukan database mode legacy).');
    }
    if (report.operational_readable && report.operational_readable !== null && typeof report.operational_readable === 'object') {
      console.log('  pembacaan state operasional berhasil:', JSON.stringify(report.operational_readable));
    }
  }
} finally {
  await db.end();
}
