import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createDocumentStorage,
  DocumentStorageError,
  validateStoredFile
} from '../documentStorage.mjs';

async function createTestStorage(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bmn-document-storage-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const storage = createDocumentStorage(directory);
  await storage.initialize();
  return storage;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

test('stores, reads, and verifies the content of a private backend file', async t => {
  const storage = await createTestStorage(t);
  const key = crypto.randomUUID();
  const bytes = Buffer.from('%PDF-1.7 sample');
  const digest = sha256(bytes);

  assert.deepEqual(await storage.save(key, bytes, digest), { size: bytes.length, sha256: digest });
  assert.deepEqual(await storage.read(key), bytes);
  assert.deepEqual(await storage.save(key, bytes, digest), { size: bytes.length, sha256: digest });
  await assert.rejects(
    storage.save(key, Buffer.from('%PDF-1.7 different'), sha256(Buffer.from('%PDF-1.7 different'))),
    error => error instanceof DocumentStorageError && error.code === 'UPLOAD_ID_CONFLICT'
  );
});

test('concurrent retries are idempotent and cannot overwrite a different upload', async t => {
  const storage = await createTestStorage(t);
  const key = crypto.randomUUID();
  const bytes = Buffer.from('%PDF-1.7 same');
  const digest = sha256(bytes);
  const results = await Promise.all([
    storage.save(key, bytes, digest),
    storage.save(key, bytes, digest)
  ]);
  assert.equal(results.length, 2);
  await assert.rejects(
    storage.save(key, Buffer.from('%PDF-1.7 different'), sha256(Buffer.from('%PDF-1.7 different'))),
    error => error instanceof DocumentStorageError && error.code === 'UPLOAD_ID_CONFLICT'
  );
  assert.deepEqual(await storage.read(key), bytes);
});

test('stages deletions so failed database writes can restore the original file', async t => {
  const storage = await createTestStorage(t);
  const key = crypto.randomUUID();
  const bytes = Buffer.from('%PDF-1.7 sample');
  await storage.save(key, bytes, sha256(bytes));

  const staged = await storage.prepareDelete(key);
  assert.deepEqual(await storage.read(key), bytes);
  await storage.restoreDelete(staged);
  assert.deepEqual(await storage.read(key), bytes);

  const committed = await storage.prepareDelete(key);
  await storage.commitDelete(committed);
  await assert.rejects(storage.read(key), error => error.code === 'DOCUMENT_FILE_MISSING');
});

test('validates known document signatures and rejects spoofed extensions and size overflow', () => {
  assert.deepEqual(
    validateStoredFile({
      fileName: 'nota.pdf',
      mimeType: 'application/pdf',
      bytes: Buffer.from('%PDF-1.7 sample'),
      maxBytes: 1024
    }),
    { fileName: 'nota.pdf', mimeType: 'application/pdf', size: 15 }
  );
  assert.throws(
    () => validateStoredFile({
      fileName: 'nota.pdf',
      mimeType: 'application/pdf',
      bytes: Buffer.from('not a PDF'),
      maxBytes: 1024
    }),
    error => error instanceof DocumentStorageError && error.code === 'INVALID_DOCUMENT_FILE'
  );
  assert.throws(
    () => validateStoredFile({
      fileName: 'nota.pdf',
      mimeType: 'application/pdf',
      bytes: Buffer.from('%PDF-1.7 sample'),
      maxBytes: 5
    }),
    error => error instanceof DocumentStorageError && error.code === 'DOCUMENT_TOO_LARGE'
  );
});

test('rejects non-opaque storage keys and mismatched MIME types', async t => {
  const storage = await createTestStorage(t);
  await assert.rejects(
    storage.read('../secrets'),
    error => error instanceof DocumentStorageError && error.code === 'INVALID_STORAGE_KEY'
  );
  assert.throws(
    () => validateStoredFile({
      fileName: 'nota.pdf',
      mimeType: 'image/png',
      bytes: Buffer.from('%PDF-1.7 sample'),
      maxBytes: 1024
    }),
    error => error instanceof DocumentStorageError && error.code === 'INVALID_DOCUMENT_FILE'
  );
});
