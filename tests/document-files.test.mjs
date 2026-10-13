import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentFileError, fetchDocumentFile } from '../src/utils/documentFiles.ts';

const document = { id: 'nota-1', storageBackend: 'hostinger', fileType: 'application/pdf' };

test('document viewer loads PDF/image blobs from authenticated endpoints', async t => {
  let contentType;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/documents/nota-1/file');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    return new Response('file bytes', { headers: { 'Content-Type': contentType } });
  });
  for (const mime of ['application/pdf', 'image/png', 'image/jpeg']) {
    contentType = mime;
    const blob = await fetchDocumentFile({ ...document, fileType: mime });
    assert.equal(blob.type, mime);
    assert.equal(await blob.text(), 'file bytes');
  }
});

test('missing backend file becomes a readable error, never a PDF viewer source', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(
    { error: 'Berkas asli tidak ditemukan.', code: 'DOCUMENT_FILE_MISSING' }, { status: 404 }
  ));
  await assert.rejects(fetchDocumentFile(document), error =>
    error instanceof DocumentFileError && error.code === 'DOCUMENT_FILE_MISSING' &&
    error.message === 'Berkas asli tidak ditemukan.');
});

test('rejects login HTML, JSON, MIME mismatch, and empty success responses', async t => {
  let content;
  t.mock.method(globalThis, 'fetch', async () => new Response(content[0], { headers: { 'Content-Type': content[1] } }));
  for (const [body, mime] of [['login', 'text/html'], ['{}', 'application/json'],
    ['wrong', 'image/png'], ['', 'application/pdf']]) {
    content = [body, mime];
    await assert.rejects(fetchDocumentFile(document), /bukan berkas lampiran yang valid/);
  }
});

test('session expiry and network failures are visible to callers', async t => {
  let networkFailed = false;
  t.mock.method(globalThis, 'fetch', async () => {
    if (networkFailed) throw new TypeError('network failed');
    return Response.json({ error: 'Silakan masuk kembali.' }, { status: 401 });
  });
  await assert.rejects(fetchDocumentFile(document), /Silakan masuk kembali/);
  networkFailed = true;
  await assert.rejects(fetchDocumentFile(document), /network failed/);
});

test('legacy data URL attachments remain supported', async () => {
  const blob = await fetchDocumentFile({ id: 'legacy', fileDataUrl: 'data:image/png;base64,aGVsbG8=', fileType: 'image/png' });
  assert.equal(blob.type, 'image/png');
  assert.equal(await blob.text(), 'hello');
});
