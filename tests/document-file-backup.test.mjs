import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDocumentStorage, DocumentStorageError } from '../documentStorage.mjs';
import { readDocumentWithBackup, saveDocumentBackup, verifyDocumentBytes } from '../documentFileBackup.mjs';

async function fixture(t, bytes = Buffer.from('%PDF-1.7 sample')) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bmn-document-backup-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const storage = createDocumentStorage(directory);
  await storage.initialize();
  const document = {
    id: crypto.randomUUID(), storageKey: crypto.randomUUID(),
    fileName: 'nota.pdf', fileType: 'application/pdf', storageSize: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
  const backups = new Map();
  const executor = {
    async execute(sql, params) {
      if (sql.includes('INSERT INTO document_files')) {
        const [id, file_name, mime_type, file_size_bytes, sha256, file_data] = params;
        backups.set(id, { file_name, mime_type, file_size_bytes, sha256, file_data });
        return [{ affectedRows: 1 }];
      }
      assert.match(sql, /FROM document_files WHERE document_id = \?/);
      return [backups.has(params[0]) ? [backups.get(params[0])] : []];
    }
  };
  return { storage, document, bytes, executor, backups };
}

test('PDF and PNG remain byte-identical when disk files disappear after deployment', async t => {
  for (const bytes of [Buffer.from('%PDF-1.7 sample'), Buffer.from('89504e470d0a1a0a00000000', 'hex')]) {
    const f = await fixture(t, bytes);
    await f.storage.save(f.document.storageKey, bytes, f.document.sha256);
    await saveDocumentBackup(f.executor, f.document, bytes);
    await f.storage.commitDelete({ key: f.document.storageKey });
    assert.deepEqual(await readDocumentWithBackup(f.storage, f.executor, f.document), bytes);
  }
});

test('opening an older disk-only attachment creates its first MySQL backup', async t => {
  const f = await fixture(t);
  await f.storage.save(f.document.storageKey, f.bytes, f.document.sha256);
  assert.deepEqual(await readDocumentWithBackup(f.storage, f.executor, f.document), f.bytes);
  assert.deepEqual(f.backups.get(f.document.id).file_data, f.bytes);
  await f.storage.commitDelete({ key: f.document.storageKey });
  assert.deepEqual(await readDocumentWithBackup(f.storage, f.executor, f.document), f.bytes);
});

test('missing disk and absent backup fail explicitly without fabricated bytes', async t => {
  const f = await fixture(t);
  await assert.rejects(readDocumentWithBackup(f.storage, f.executor, f.document),
    error => error.code === 'DOCUMENT_FILE_MISSING');
});

test('rejects corrupt backup data, mismatched checksum metadata, and wrong size', async t => {
  const f = await fixture(t);
  await saveDocumentBackup(f.executor, f.document, f.bytes);
  const backup = f.backups.get(f.document.id);
  backup.file_data = Buffer.alloc(f.bytes.length);
  await assert.rejects(readDocumentWithBackup(f.storage, f.executor, f.document),
    error => error.code === 'DOCUMENT_INTEGRITY_ERROR');
  backup.file_data = f.bytes;
  backup.sha256 = '0'.repeat(64);
  await assert.rejects(readDocumentWithBackup(f.storage, f.executor, f.document),
    error => error.code === 'DOCUMENT_INTEGRITY_ERROR');
  backup.sha256 = f.document.sha256;
  backup.file_size_bytes += 1;
  await assert.rejects(readDocumentWithBackup(f.storage, f.executor, f.document),
    error => error.code === 'DOCUMENT_INTEGRITY_ERROR');
});

test('backup persistence failure is not treated as successful storage', async t => {
  const f = await fixture(t);
  const executor = { execute: async () => { throw new Error('database unavailable'); } };
  await assert.rejects(saveDocumentBackup(executor, f.document, f.bytes), /database unavailable/);
  await f.storage.save(f.document.storageKey, f.bytes, f.document.sha256);
  await assert.rejects(readDocumentWithBackup(f.storage, executor, f.document), /database unavailable/);
});

test('restoration accepts only the original attachment, preserving metadata', async t => {
  const f = await fixture(t);
  const before = structuredClone(f.document);
  assert.equal(verifyDocumentBytes(f.document, f.bytes), f.bytes);
  for (const wrong of [Buffer.alloc(f.bytes.length), Buffer.concat([f.bytes, Buffer.from('extra')])]) {
    assert.throws(() => verifyDocumentBytes(f.document, wrong),
      error => error.code === 'DOCUMENT_INTEGRITY_ERROR');
  }
  await f.storage.save(f.document.storageKey, f.bytes, f.document.sha256);
  await saveDocumentBackup(f.executor, f.document, f.bytes);
  assert.deepEqual(f.document, before);
  assert.deepEqual(await readDocumentWithBackup(f.storage, f.executor, f.document), f.bytes);
});

test('non-missing disk errors cannot be hidden by a fallback', async t => {
  const f = await fixture(t);
  await saveDocumentBackup(f.executor, f.document, f.bytes);
  const storage = { read: async () => { throw new DocumentStorageError('permission denied'); } };
  await assert.rejects(readDocumentWithBackup(storage, f.executor, f.document), /permission denied/);
});
