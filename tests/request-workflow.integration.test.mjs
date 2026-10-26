import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('request workflow persists every stage and confirms stock exactly once', {
  skip: process.env.BMN_REQUEST_INTEGRATION !== '1',
  timeout: 120_000
}, async t => {
  const settings = process.env.BMN_REQUEST_TEST_DB_PORT
    ? {
        DB_HOST: '127.0.0.1', DB_PORT: process.env.BMN_REQUEST_TEST_DB_PORT,
        DB_USER: process.env.BMN_REQUEST_TEST_DB_USER || 'root',
        DB_PASSWORD: process.env.BMN_REQUEST_TEST_DB_PASSWORD || ''
      }
    : dotenv.parse(await fs.readFile(path.join(root, '.env')));
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(settings.DB_HOST),
    'This test only permits a local MySQL server and creates its own database.');
  const connection = await mysql.createConnection({
    host: settings.DB_HOST, port: Number(settings.DB_PORT || 3306),
    user: settings.DB_USER, password: settings.DB_PASSWORD || ''
  });
  const database = `bmn_request_test_${crypto.randomBytes(6).toString('hex')}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bmn-request-api-'));
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
    await fs.rm(directory, { recursive: true, force: true });
  });
  await connection.query(`CREATE DATABASE \`${database}\``);
  await connection.query(`USE \`${database}\``);
  const password = crypto.randomBytes(18).toString('hex');
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, NODE_ENV: 'development', DATA_BACKEND: 'legacy',
      ACCESS_REQUIRED: 'false', DB_HOST: settings.DB_HOST, DB_PORT: settings.DB_PORT || '3306',
      DB_USER: settings.DB_USER, DB_PASSWORD: settings.DB_PASSWORD || '', DB_NAME: database,
      ADMIN_NIP: 'request-test-admin', ADMIN_PASSWORD: password,
      DOCUMENT_STORAGE_DIR: directory, HOST: '127.0.0.1', PORT: String(port),
      N8N_ENABLED: 'false', WHATSAPP_PROVIDER: 'meta', WHATSAPP_PHONE_NUMBER_ID: '',
      WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_RECIPIENT_NUMBER: '', WHATSAPP_AI_ENABLED: 'false'
    }
  });
  let stderr = '';
  server.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-2000); });
  const base = await new Promise((resolve, reject) => {
    server.stdout.on('data', chunk => {
      const match = chunk.toString().match(/SIMAN server listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
    server.once('exit', code => reject(new Error(`Isolated server exited (${code}): ${stderr}`)));
    server.once('error', reject);
  });
  const login = async nip => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nip, password })
    });
    assert.equal(response.status, 200, await response.clone().text());
    return { cookie: response.headers.get('set-cookie').split(';')[0], user: (await response.json()).user };
  };
  const admin = await login('request-test-admin');
  const users = ['Pemohon', 'Operator', 'Kasubag', 'Pengelola BMN', 'Pimpinan'].map(role => ({
    id: crypto.randomUUID(), name: `Test ${role}`, nip: `request-test-${role}`,
    role, statusAktif: true, unitKerja: 'Unit Uji'
  }));
  for (const user of users) {
    const salt = crypto.randomBytes(16);
    await connection.execute(`INSERT INTO auth_users (id, nip, profile_json, salt, password_hash)
      VALUES (?, ?, ?, ?, ?)`, [user.id, user.nip, JSON.stringify(user), salt.toString('hex'),
      crypto.scryptSync(password, salt, 64).toString('hex')]);
  }
  const api = (actor, url, options = {}) => fetch(`${base}${url}`, {
    ...options, headers: { Cookie: actor.cookie, ...options.headers }
  });
  const read = async actor => {
    const response = await api(actor, '/api/state');
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const save = async (actor, state, revision) => {
    const response = await api(actor, '/api/state', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, revision })
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const state = Object.fromEntries([
    'rooms', 'assets', 'inventoryItems', 'stockInList', 'stockOutList', 'requests', 'opnames',
    'movements', 'maintenances', 'disposals', 'documents', 'auditLogs', 'notifications', 'users', 'roles'
  ].map(key => [key, []]));
  state.users = [admin.user, ...users];
  state.roles = [
    { id: 'pemohon', name: 'Pemohon', permissions: { requestSupplies: true } },
    { id: 'operator', name: 'Operator', permissions: { requestSupplies: true, manageInventory: true } },
    { id: 'kasubag', name: 'Kasubag', permissions: { approveRequests: true } },
    { id: 'pengelola', name: 'Pengelola BMN', permissions: { manageInventory: true } },
    { id: 'pimpinan', name: 'Pimpinan', permissions: { requestSupplies: true, approveRequests: true, manageInventory: true } }
  ];
  state.inventoryItems = [{
    id: crypto.randomUUID(), kodeBarang: 'TEST-ATK', nama: 'Kertas Uji', jenis: 'ATK',
    satuan: 'Rim', stokSaatIni: 20, stokMinimum: 1, hargaSatuan: 10000,
    totalNilai: 200000, status: 'Aman'
  }];
  await save(admin, state, (await read(admin)).revision);
  const [applicant, operator, approver, manager, leader] = await Promise.all(users.map(user => login(user.nip)));
  const item = state.inventoryItems[0];
  const inventoryRequest = {
    id: crypto.randomUUID(), nomorPermintaan: 'REQUEST-TEST', tanggal: '2026-10-17',
    status: 'Diajukan', pemohonNama: applicant.user.name, unitKerja: 'Unit Uji',
    ruangan: 'Ruang Uji', itemId: item.id, namaBarang: item.nama,
    jumlahDiminta: 4, satuan: item.satuan, keperluan: 'Pengujian terisolasi',
    prioritas: 'Normal', items: [{
      itemId: item.id, namaBarang: item.nama, jumlahDiminta: 4, satuan: item.satuan
    }]
  };
  let snapshot = await read(applicant);
  snapshot.state.requests.push(inventoryRequest);
  const created = await save(applicant, snapshot.state, snapshot.revision);
  assert.equal(created.requests[0].pemohonUserId, applicant.user.id);
  assert.match(created.requests[0].nomorPermintaan, /2026/);
  for (const [actor, status] of [
    [operator, 'Diverifikasi'], [approver, 'Disetujui'], [operator, 'Diproses'],
    [operator, 'Menunggu Konfirmasi']
  ]) {
    snapshot = await read(actor);
    const target = snapshot.state.requests[0];
    target.status = status;
    if (status === 'Disetujui') {
      target.jumlahDisetujui = 4;
      target.items[0].jumlahDisetujui = 4;
    }
    if (status === 'Menunggu Konfirmasi') {
      target.penerimaan = { status, items: [{ itemId: item.id, jumlah: 4 }] };
    }
    const saved = await save(actor, snapshot.state, snapshot.revision);
    assert.equal(saved.requests[0].status, status);
    assert.equal((await read(operator)).state.inventoryItems[0].stokSaatIni, 20);
    if (status === 'Menunggu Konfirmasi') {
      assert.equal(saved.requests[0].penerimaan.diserahkanOleh, operator.user.name);
      assert.ok(saved.requests[0].penerimaan.diserahkanPada);
    }
  }
  const eventId = crypto.randomUUID();
  const notification = await api(operator, '/api/whatsapp/request-events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId, requestId: inventoryRequest.id, status: 'Menunggu Konfirmasi',
      action: 'status_changed', deferDelivery: true
    })
  });
  assert.equal(notification.status, 202, await notification.clone().text());
  assert.deepEqual(await notification.json(), { success: true, queued: true });
  const receiptUrl = `/api/requests/${inventoryRequest.id}/confirm-receipt`;
  assert.equal((await api(operator, receiptUrl, { method: 'POST' })).status, 403);
  const receipts = await Promise.all([
    api(applicant, receiptUrl, { method: 'POST' }), api(applicant, receiptUrl, { method: 'POST' })
  ]);
  const results = await Promise.all(receipts.map(async response => {
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }));
  assert.equal(results.filter(result => result.alreadyConfirmed).length, 1);
  const final = await read(operator);
  assert.equal(final.state.requests[0].status, 'Diterima');
  assert.equal(final.state.inventoryItems[0].stokSaatIni, 16);
  assert.equal(final.state.stockOutList.length, 1);
  assert.equal(final.state.stockOutList[0].jumlah, 4);
  const staleSave = await api(operator, '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: snapshot.state, revision: snapshot.revision })
  });
  assert.equal(staleSave.status, 409);

  const markRevision = async () => {
    const current = await read(admin);
    current.state.notifications = [{
      id: 'snapshot-marker', type: 'SISTEM', title: 'Snapshot consistency',
      message: String(current.revision + 1), timestamp: new Date().toISOString(), read: false
    }];
    await save(admin, current.state, current.revision);
  };
  await markRevision();
  await Promise.all([
    (async () => { for (let index = 0; index < 5; index += 1) await markRevision(); })(),
    ...Array.from({ length: 12 }, async () => {
      const current = await read(admin);
      assert.equal(current.state.notifications[0].message, String(current.revision),
        'State and revision must come from the same committed snapshot');
    })
  ]);

  const beforeDeletion = await read(admin);
  const allStatuses = [
    'Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses',
    'Menunggu Konfirmasi', 'Ditolak', 'Dibatalkan', 'Selesai'
  ];
  const fixtures = [
    ...beforeDeletion.state.requests,
    ...allStatuses.map((status, index) => ({
      ...inventoryRequest, id: crypto.randomUUID(),
      nomorPermintaan: `DELETE-TEST-${index}`, pemohonUserId: applicant.user.id, status
    }))
  ];
  await connection.execute("UPDATE app_data SET value_json = ? WHERE `key` = 'requests'", [JSON.stringify(fixtures)]);
  const deletionStart = await read(admin);
  const remove = (actor, ids) => api(actor, '/api/requests/bulk-delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids })
  });
  for (const actor of [applicant, approver, leader]) {
    assert.equal((await remove(actor, [inventoryRequest.id])).status, 403);
  }
  for (const ids of [undefined, [], [''], [42], ['x'.repeat(101)]]) {
    assert.equal((await remove(admin, ids)).status, 400);
  }
  assert.deepEqual((await read(admin)).state.requests, fixtures);
  assert.equal((await read(admin)).revision, deletionStart.revision);
  const selected = [inventoryRequest.id, fixtures[1].id, inventoryRequest.id];
  await connection.query(`CREATE TRIGGER reject_test_deletion BEFORE UPDATE ON app_data
    FOR EACH ROW BEGIN
      IF NEW.\`key\` = 'auditLogs' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forced deletion persistence failure';
      END IF;
    END`);
  try {
    assert.equal((await remove(operator, selected)).status, 500);
    const rolledBack = await read(admin);
    assert.deepEqual(rolledBack.state.requests, fixtures);
    assert.equal(rolledBack.revision, deletionStart.revision);
    assert.deepEqual(rolledBack.state.stockOutList, deletionStart.state.stockOutList);
  } finally {
    await connection.query('DROP TRIGGER reject_test_deletion');
  }
  const deleted = await remove(operator, selected);
  assert.equal(deleted.status, 200, await deleted.clone().text());
  const deletedResult = await deleted.json();
  let afterDeletion = await read(admin);
  assert.equal(afterDeletion.state.requests.length, fixtures.length - 2);
  assert.equal(afterDeletion.revision, deletionStart.revision + 1);
  assert.equal(afterDeletion.state.auditLogs.filter(log => log.aktivitas === 'Penghapusan Permohonan Barang').length, 2);
  assert.deepEqual(afterDeletion.state.inventoryItems, deletionStart.state.inventoryItems);
  assert.deepEqual(afterDeletion.state.stockOutList, deletionStart.state.stockOutList);
  const retried = await remove(operator, selected);
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).revision, deletedResult.revision);
  assert.equal((await read(admin)).state.auditLogs.filter(log => log.aktivitas === 'Penghapusan Permohonan Barang').length, 2);
  assert.equal((await api(applicant, receiptUrl, { method: 'POST' })).status, 404);
  const managerDeletion = await remove(manager, [afterDeletion.state.requests[0].id]);
  assert.equal(managerDeletion.status, 200, await managerDeletion.clone().text());
  afterDeletion = await read(admin);
  const remaining = afterDeletion.state.requests.map(item => item.id);
  const deleteAll = await remove(admin, remaining);
  assert.equal(deleteAll.status, 200, await deleteAll.clone().text());
  afterDeletion = await read(admin);
  assert.deepEqual(afterDeletion.state.requests, []);
  assert.deepEqual(afterDeletion.state.inventoryItems, deletionStart.state.inventoryItems);
  assert.deepEqual(afterDeletion.state.stockOutList, deletionStart.state.stockOutList);
  assert.equal(afterDeletion.state.auditLogs.filter(log => log.aktivitas === 'Penghapusan Permohonan Barang').length, fixtures.length);
  const replacement = { ...inventoryRequest, id: crypto.randomUUID(), nomorPermintaan: final.state.requests[0].nomorPermintaan };
  afterDeletion.state.requests = [replacement];
  const recreated = await save(applicant, afterDeletion.state, afterDeletion.revision);
  assert.notEqual(recreated.requests[0].nomorPermintaan, final.state.requests[0].nomorPermintaan,
    'A deleted request number must not be recycled');
});
