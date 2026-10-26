// Helper kueri database dengan pencatatan kueri lambat.
// Pool dibuat di sini agar konfigurasi koneksi terpusat pada satu modul.
import mysql from 'mysql2/promise';
import { logSlowDatabaseQuery } from '../performanceMetrics.mjs';

export function createDatabasePool(config) {
  return mysql.createPool(config);
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
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); }
    catch {
      // Rollback sedang gagal biasanya karena koneksi sudah mati; error asli lebih penting.
    }
    throw error;
  } finally {
    connection.release();
  }
}
