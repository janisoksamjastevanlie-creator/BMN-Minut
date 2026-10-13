import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('document API persists MySQL backups, recovers lost files, and preserves receipt metadata', {
  skip: process.env.BMN_DOCUMENT_INTEGRATION !== '1',
  timeout: 120_000
}, async t => {
  const settings = dotenv.parse(await fs.readFile(path.join(root, '.env')));
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(settings.DB_HOST),
    'This integration test only permits a local MySQL server.');
  const connection = await mysql.createConnection({
    host: settings.DB_HOST, port: Number(settings.DB_PORT || 3306),
    user: settings.DB_USER, password: settings.DB_PASSWORD || ''
  });
  const database = `bmn_doc_test_${crypto.randomBytes(6).toString('hex')}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bmn-document-api-'));
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
  const nip = 'document-test-admin';
  const password = crypto.randomBytes(18).toString('hex');
  const portProbe = net.createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, NODE_ENV: 'development', DATA_BACKEND: 'legacy',
      ALLOW_LEGACY_PRODUCTION: 'true', ACCESS_REQUIRED: 'false',
      DB_HOST: settings.DB_HOST, DB_PORT: settings.DB_PORT || '3306',
      DB_USER: settings.DB_USER, DB_PASSWORD: settings.DB_PASSWORD || '',
      DB_NAME: database, ADMIN_NIP: nip, ADMIN_PASSWORD: password,
      DOCUMENT_STORAGE_DIR: directory, DOCUMENT_MAX_FILE_SIZE_MB: '1',
      HOST: '127.0.0.1', PORT: String(port), N8N_ENABLED: 'false'
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
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nip, password })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const viewer = { id: crypto.randomUUID(), name: 'Test Viewer', nip: 'document-test-viewer',
    role: 'Test Viewer', statusAktif: true };
  const salt = crypto.randomBytes(16);
  await connection.execute(`INSERT INTO auth_users (id, nip, profile_json, salt, password_hash)
    VALUES (?, ?, ?, ?, ?)`, [viewer.id, viewer.nip, JSON.stringify(viewer), salt.toString('hex'),
    crypto.scryptSync(password, salt, 64).toString('hex')]);
  await connection.execute("INSERT INTO app_data (`key`, value_json) VALUES ('roles', ?)",
    [JSON.stringify([{ name: viewer.role, permissions: { viewReports: true } }])]);
  const viewerLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nip: viewer.nip, password })
  });
  assert.equal(viewerLogin.status, 200);
  const viewerCookie = viewerLogin.headers.get('set-cookie').split(';')[0];
  const api = (url, options = {}) => fetch(`${base}${url}`, {
    ...options, headers: { Cookie: cookie, ...options.headers }
  });
  const pdf = Buffer.from('%PDF-1.7 integration-test');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNAAAAABJRU5ErkJggg==', 'base64');
  const metadata = {
    title: 'Nota uji pemulihan', category: 'Nota', number: 'TEST-NOTA',
    date: '2026-10-14', status: 'Sah', tags: [], namaToko: 'Toko Uji',
    kategoriNota: 'ATK', totalNilaiNota: 5000,
    items: [{ id: crypto.randomUUID(), namaBarang: 'Kertas', kategori: 'ATK',
      satuan: 'Rim', jumlah: 1, hargaSatuan: 5000, totalHarga: 5000 }]
  };
  const upload = (bytes, name, mime, number) => api('/api/documents', {
    method: 'POST',
    headers: {
      'Content-Type': mime, 'X-File-Name': encodeURIComponent(name),
      'X-Upload-Id': crypto.randomUUID(),
      'X-Document-Metadata': Buffer.from(JSON.stringify({ ...metadata, number })).toString('base64url')
    }, body: bytes
  });
  for (const [bytes, name, mime] of [[pdf, 'nota.pdf', 'application/pdf'], [png, 'nota.png', 'image/png']]) {
    const uploaded = await upload(bytes, name, mime, `TEST-${name}`);
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    const { document } = await uploaded.json();
    const [backups] = await connection.execute('SELECT file_data FROM document_files WHERE document_id = ?', [document.id]);
    assert.deepEqual(backups[0].file_data, bytes);
    await fs.unlink(path.join(directory, `${document.storageKey}.document`));
    const reopened = await api(`/api/documents/${document.id}/file`);
    assert.equal(reopened.status, 200);
    assert.equal(reopened.headers.get('content-type'), mime);
    assert.deepEqual(Buffer.from(await reopened.arrayBuffer()), bytes);
    assert.equal((await fetch(`${base}/api/documents/${document.id}/file`)).status, 401);
    assert.equal((await fetch(`${base}/api/documents/${document.id}/file`, {
      headers: { Cookie: viewerCookie }
    })).status, 200);
    assert.equal((await fetch(`${base}/api/documents/${document.id}/file`, {
      method: 'PUT', headers: { Cookie: viewerCookie, 'Content-Type': mime, 'X-File-Name': name }, body: bytes
    })).status, 403);
    const download = await api(`/api/documents/${document.id}/file?download=1`);
    assert.match(download.headers.get('content-disposition'), /^attachment;/);
    await connection.execute('DELETE FROM document_files WHERE document_id = ?', [document.id]);
    const missing = await api(`/api/documents/${document.id}/file`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, 'DOCUMENT_FILE_MISSING');
    const before = await (await api('/api/state')).json();
    const put = body => api(`/api/documents/${document.id}/file`, {
      method: 'PUT', headers: { 'Content-Type': mime, 'X-File-Name': name }, body
    });
    assert.equal((await put(Buffer.alloc(bytes.length))).status, 400);
    assert.equal((await put(Buffer.alloc(1024 * 1024 + 1))).status, 413);
    const restored = await put(bytes);
    assert.equal(restored.status, 200, await restored.clone().text());
    assert.equal((await restored.json()).success, true);
    const after = await (await api('/api/state')).json();
    assert.deepEqual(after.state.documents, before.state.documents);
    assert.equal(after.revision, before.revision);
    assert.deepEqual(Buffer.from(await (await api(`/api/documents/${document.id}/file`)).arrayBuffer()), bytes);
    // Reading an existing old disk-only file also creates a backup.
    await connection.execute('DELETE FROM document_files WHERE document_id = ?', [document.id]);
    assert.equal((await api(`/api/documents/${document.id}/file`)).status, 200);
    await fs.unlink(path.join(directory, `${document.storageKey}.document`));
    assert.equal((await api(`/api/documents/${document.id}`, { method: 'DELETE' })).status, 200);
    const [deletedBackups] = await connection.execute('SELECT document_id FROM document_files WHERE document_id = ?', [document.id]);
    assert.equal(deletedBackups.length, 0);
  }
  const before = await (await api('/api/state')).json();
  await connection.query('RENAME TABLE document_files TO document_files_unavailable');
  const failedUpload = await upload(pdf, 'failed.pdf', 'application/pdf', 'TEST-FAILED');
  assert.equal(failedUpload.status, 500);
  const after = await (await api('/api/state')).json();
  assert.deepEqual(after.state.documents, before.state.documents);
  assert.equal(after.revision, before.revision);
  await connection.query('RENAME TABLE document_files_unavailable TO document_files');
});
