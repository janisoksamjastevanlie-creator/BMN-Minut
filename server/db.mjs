// Helper kueri database dengan pencatatan kueri lambat.
// Pool dibuat di sini agar konfigurasi koneksi terpusat pada satu modul.
import mysql from 'mysql2/promise';
import { logSlowDatabaseQuery } from '../performanceMetrics.mjs';

const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 20000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createDatabasePool(config = {}) {
  // connectTimeout memastikan koneksi yang macet di jaringan/database segera
  // gagal, bukan menahan permintaan sampai browser berhenti sendiri.
  return mysql.createPool({
    ...config,
    connectTimeout: positiveInteger(config.connectTimeout, DEFAULT_CONNECT_TIMEOUT_MS)
  });
}

// acquireConnection memberi batas waktu tunggu koneksi. mysql2 hanya membatasi
// antrian lewat queueLimit; tanpa batas waktu tunggu, permintaan bisa menggantung
// selamanya ketika pool habis dan queueLimit tidak dipakai.
export async function acquireConnection(pool, { timeoutMs } = {}) {
  const limitMs = positiveInteger(
    timeoutMs,
    Number(process.env.DB_ACQUIRE_TIMEOUT_MS || DEFAULT_ACQUIRE_TIMEOUT_MS)
  );
  let timedOut = false;
  const acquisition = pool.getConnection();
  // Koneksi yang baru tiba setelah batas waktu tercapai langsung dikembalikan ke
  // pool supaya tidak ada koneksi yang bocor saat permintaan sudah dijawab gagal.
  acquisition.then(
    (connection) => {
      if (timedOut) connection.release();
    },
    () => {}
  );
  let timer;
  try {
    return await Promise.race([
      acquisition,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          const error = new Error(`Tidak dapat memperoleh koneksi database dalam ${limitMs} ms.`);
          error.code = 'DB_ACQUIRE_TIMEOUT';
          reject(error);
        }, limitMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function queryRows(executor, sql, params = []) {
  const startedAt = Date.now();
  try {
    const [rows] = await executor.execute(sql, params);
    return rows;
  } finally {
    logSlowDatabaseQuery(sql, Date.now() - startedAt);
  }
}

export async function queryOne(executor, sql, params = []) {
  return (await queryRows(executor, sql, params))[0] || null;
}

export async function execute(executor, sql, params = []) {
  const startedAt = Date.now();
  try {
    const [result] = await executor.execute(sql, params);
    return result;
  } finally {
    logSlowDatabaseQuery(sql, Date.now() - startedAt);
  }
}

export async function withTransaction(pool, callback) {
  const connection = await acquireConnection(pool);
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Rollback sedang gagal biasanya karena koneksi sudah mati; error asli lebih penting.
    }
    throw error;
  } finally {
    connection.release();
  }
}
