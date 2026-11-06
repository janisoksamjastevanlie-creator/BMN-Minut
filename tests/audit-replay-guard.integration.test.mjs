// Uji end-to-end retensi audit trail di MySQL sungguhan: catatan lama benar-benar
// berpindah ke audit_log_archive, dan percobaan klien menghidupkan kembali entri yang
// sudah diarshif ditahan sebelum sempat ditulis.
//
// Ini satu-satunya test yang menyentuh tiga bagian sekaligus (job retensi, gardi replay
// di jalur tulis, dan optimistic lock revision) pada database nyata, karena kegagalan
// yang ingin dicegah justru muncul dari cara ketiganya bertemu: retensi yang kelihatan
// jalan tetapi state aktifnya kembali membengkak tanpa ada yang melihat.
//
// Dijalankan hanya dengan MySQL lokal dan secara bawaan dilewati:
//   BMN_AUDIT_REPLAY_INTEGRATION=1 node --import tsx --test tests/audit-replay-guard.integration.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TANGGAL_LAMA = ['2019-01-05', '2019-02-05', '2019-03-05'];
const TANGGAL_BARU = ['2026-11-01', '2026-11-02', '2026-11-03'];

async function tunggu(batasMs, label, cek) {
  const mulai = Date.now();
  for (;;) {
    const nilai = await cek();
    if (nilai) return nilai;
    if (Date.now() - mulai > batasMs) throw new Error(`Batas waktu menunggu ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

test('retensi mengarsipkan catatan audit lama dan gardi menahan usaha penghidupan kembali', {
  skip: process.env.BMN_AUDIT_REPLAY_INTEGRATION !== '1',
  timeout: 180_000
}, async (t) => {
  const settings = dotenv.parse(await fs.readFile(path.join(root, '.env')));
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(settings.DB_HOST),
    'Uji ini hanya boleh memakai MySQL lokal.');
  const connection = await mysql.createConnection({
    host: settings.DB_HOST, port: Number(settings.DB_PORT || 3306),
    user: settings.DB_USER, password: settings.DB_PASSWORD || ''
  });
  const database = `bmn_replay_test_${crypto.randomBytes(6).toString('hex')}`;
  const nip = `replay-test-${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(18).toString('hex');
  // eslint-disable-next-line prefer-const -- nilai ditetapkan di dalam callback promise, bukan saat deklarasi
  let server;
  t.after(async () => {
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.end();
  });

  await connection.query(`CREATE DATABASE \`${database}\``);
  const portProbe = net.createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise((resolve, reject) => portProbe.close((error) => (error ? reject(error) : resolve())));

  server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATA_BACKEND: 'legacy',
      ALLOW_LEGACY_PRODUCTION: 'true',
      ACCESS_REQUIRED: 'false',
      DB_HOST: settings.DB_HOST,
      DB_PORT: settings.DB_PORT || '3306',
      DB_USER: settings.DB_USER,
      DB_PASSWORD: settings.DB_PASSWORD || '',
      DB_NAME: database,
      ADMIN_NIP: nip,
      ADMIN_PASSWORD: password,
      N8N_ENABLED: 'false',
      // Retensi dinyalakan lewat batas jumlah saja, dan run pertama dipangkas dari
      // 45 detik menjadi 12 detik — cukup panjang untuk memastikan data uji sudah
      // tertanam lebih dulu, cukup pendek untuk uji yang selesai dalam hitungan detik.
      AUDIT_RETENTION_DAYS: '0',
      AUDIT_ACTIVE_LIMIT: '3',
      AUDIT_RETENTION_RUN_AFTER_MS: '12000',
      HEALTH_HISTORY_INTERVAL_MS: '0',
      HOST: '127.0.0.1',
      PORT: String(port)
    }
  });
  let stderr = '';
  server.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-3000); });
  const base = await new Promise((resolve, reject) => {
    server.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/SIMAN server listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
    server.once('exit', (code) => reject(new Error(`Server uji berhenti (${code}): ${stderr}`)));
    server.once('error', reject);
  });

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nip, password })
  });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const api = (url, options = {}) => fetch(`${base}${url}`, {
    ...options, headers: { Cookie: cookie, ...options.headers }
  });

  async function seed(key, nilai) {
    await connection.query(`USE \`${database}\``);
    await connection.execute(
      'INSERT INTO app_data (`key`, value_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)',
      [key, JSON.stringify(nilai)]
    );
  }

  // Basis data baru punya koleksi kosong (null), dan simpanan state menuntut setiap
  // koleksi berupa array. Akun Administrator ditanamkan ke koleksi users lewat profil
  // yang sudah dibuat proses startup, supaya perjalanan klien (baca state → simpan state)
  // bisa ditiru apa adanya.
  await connection.query(`USE \`${database}\``);
  const [barisPengguna] = await connection.query('SELECT profile_json FROM auth_users');
  await seed('users', barisPengguna.map((baris) => JSON.parse(baris.profile_json)));

  const entri = (id, tanggal) => ({
    id,
    userId: 'usr-replay',
    userName: 'Petugas Uji',
    userRole: 'Administrator',
    aktivitas: `Uji retensi ${id}`,
    modul: 'SISTEM',
    tanggal,
    waktu: '10:00:00',
    detail: `enrichment ${id}`
  });
  const catatanLama = TANGGAL_LAMA.map((tanggal, index) => entri(`arsip-${index + 1}`, tanggal));
  const catatanBaru = TANGGAL_BARU.map((tanggal, index) => entri(`hidup-${index + 1}`, tanggal));

  await seed('auditLogs', [...catatanLama, ...catatanBaru]);

  const healthSelesai = await tunggu(60_000, 'job retensi memindahkan arsip', async () => {
    const health = await (await fetch(`${base}/api/health`)).json();
    return health.load?.audit_retention?.archived_total >= 3 ? health : null;
  });
  assert.equal(healthSelesai.load.audit_retention.enabled, true);
  assert.equal(healthSelesai.load.audit_retention.active_limit, 3);

  const [arsip] = await connection.query('SELECT id FROM audit_log_archive ORDER BY id');
  assert.deepEqual(arsip.map((row) => row.id), ['arsip-1', 'arsip-2', 'arsip-3'], 'catatan lama pindah ke arsip');
  const [sisa] = await connection.query("SELECT value_json FROM app_data WHERE `key` = 'auditLogs'");
  assert.deepEqual(
    JSON.parse(sisa[0].value_json).map((log) => log.id),
    ['hidup-1', 'hidup-2', 'hidup-3'],
    'state aktif hanya menyimpan yang terbaru, urutan asli utuh'
  );

  const sebelum = await (await api('/api/state')).json();
  assert.deepEqual(sebelum.state.auditLogs.map((log) => log.id), ['hidup-1', 'hidup-2', 'hidup-3']);

  // Klien lama: mengirim enam entri (termasuk yang sudah diarshif) pada revision yang
  // masih sah. Tanpa gardi, tulisan ini mengganti seluruh blob dan retensi batal.
  // Koleksi yang masih null dikembalikan sebagai array kosong: server menuntut setiap
  // koleksi berbentuk array, dan basis data baru memang belum punya ruangan/aset.
  const diisi = Object.fromEntries(
    Object.entries(sebelum.state).map(([key, nilai]) => [key, Array.isArray(nilai) ? nilai : []])
  );
  const negaraBaru = {
    ...diisi,
    auditLogs: [...catatanLama, ...catatanBaru, entri('hidup-4', '2026-11-04')]
  };
  const simpan = await api('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: negaraBaru, revision: sebelum.revision })
  });
  assert.equal(simpan.status, 200, await simpan.clone().text());

  const bacaKembali = await api('/api/state');
  assert.equal(bacaKembali.status, 200, await bacaKembali.clone().text());
  const sesudah = await bacaKembali.json();
  assert.deepEqual(
    sesudah.state.auditLogs.map((log) => log.id),
    ['hidup-1', 'hidup-2', 'hidup-3', 'hidup-4'],
    'entri arsip tidak ikut kembali; catatan baru yang sah tetap tertulis'
  );
  const [arsipKedua] = await connection.query('SELECT COUNT(*) AS total FROM audit_log_archive');
  assert.equal(Number(arsipKedua[0].total), 3, 'arsip tidak ditimpa oleh simpanan klien');

  const healthGardi = await (await fetch(`${base}/api/health`)).json();
  assert.equal(healthGardi.load.audit_retention.blocked_replays >= 3, true, 'penolakan tercatat di health');
  assert.equal(JSON.stringify(healthGardi).includes('arsip-1'), false, 'id arsip tidak dibocorkan lewat health');
});
