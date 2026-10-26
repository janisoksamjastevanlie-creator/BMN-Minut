// Runner migrasi database sederhana.
// - Terhubung memakai DB_* dari .env (sama seperti server.mjs).
// - Terapkan file .sql di migrations/ secara alfabetis (urutan bawaan disengaja:
//   nama file diakhiri suffix versi).
// - Sudah diterapkan dicatat di tabel schema_migrations, aman dijalankan berulang.
// - Untuk unit test, gunakan createMigrationRunner({ client }) dengan client impl.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const TRACKING_TABLE = 'schema_migrations';

export function parseStatements(sql) {
  // Pemisah sederhana: pisah di ';' di luar string/identifier ber-flash. Cukup untuk
  // file migrasi proyek ini yang polos (tanpa stored procedure).
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const prev = sql[i - 1];
    if (char === "'" && !inDouble && !inBacktick) {
      if (!inSingle || prev !== '\\') inSingle = !inSingle;
    } else if (char === '"' && !inSingle && !inBacktick) {
      if (!inDouble || prev !== '\\') inDouble = !inDouble;
    } else if (char === '`' && !inSingle && !inDouble) {
      inBacktick = !inBacktick;
    }
    if (char === ';' && !inSingle && !inDouble && !inBacktick) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export function listMigrationFiles(dir = MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.sql'))
    .sort();
}

export function createMigrationRunner({ client, log = console.log }) {
  const exec = async (sql, params) => client.execute(sql, params);
  return {
    async ensureTrackingTable() {
      await exec(`
        CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
          filename VARCHAR(190) PRIMARY KEY,
          applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    },
    async appliedFiles() {
      const [rows] = await client.query(`SELECT filename FROM ${TRACKING_TABLE}`);
      return new Set(rows.map(row => row.filename));
    },
    async apply(filename, sql, dir = MIGRATIONS_DIR) {
      const statements = parseStatements(fs.readFileSync(path.join(dir, filename), 'utf8'));
      if (!statements.length) return false;
      await client.query('START TRANSACTION');
      try {
        for (const statement of statements) await exec(statement, []);
        await exec(`INSERT INTO ${TRACKING_TABLE} (filename) VALUES (?)`, [filename]);
        await client.query('COMMIT');
        return true;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* koneksi sudah mati */ }
        throw new Error(`Migration failed: ${filename}`, { cause: error });
      }
    },
    async run(dir = MIGRATIONS_DIR) {
      const files = listMigrationFiles(dir);
      await this.ensureTrackingTable();
      const applied = await this.appliedFiles();
      for (const filename of files) {
        if (applied.has(filename)) {
          log(`= ${filename} (sudah diterapkan)`);
          continue;
        }
        await this.apply(filename, fs.readFileSync(path.join(dir, filename), 'utf8'), dir);
        log(`> ${filename} diterapkan`);
      }
      return files.filter(filename => !applied.has(filename)).length;
    }
  };
}

export async function main() {
  dotenv.config();
  const dbHost = process.env.DB_HOST || '127.0.0.1';
  const dbPort = Number(process.env.DB_PORT || 3306);
  const dbName = process.env.DB_NAME || 'bmnbpsminut';
  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || '';
  const connection = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    database: dbName,
    user: dbUser,
    password: dbPassword,
    multipleStatements: false
  });
  try {
    const runner = createMigrationRunner({ client: connection });
    const applied = await runner.run();
    if (!applied) console.log('Semua migrasi sudah diterapkan.');
    else console.log(`${applied} migrasi diterapkan.`);
  } finally {
    await connection.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Migration gagal:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
