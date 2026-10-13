import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DocumentUploadError,
  DriveIntegrationError,
  getDriveConfiguration,
  validateDocumentFile
} from '../googleDrive.mjs';

test('Drive configuration is explicitly rejected until all server secrets are present', () => {
  assert.throws(
    () => getDriveConfiguration({}),
    error => error instanceof DriveIntegrationError && error.status === 503
  );
});

test('Drive configuration accepts a server-side PEM key and escaped newlines', () => {
  const configured = getDriveConfiguration({
    GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----'
  });
  assert.equal(configured.folderId, 'folder-id');
  assert.equal(configured.privateKey.includes('\n'), true);
});

test('validates a PDF using its content signature and canonical MIME type', () => {
  const info = validateDocumentFile({
    fileName: 'nota.pdf',
    mimeType: 'application/pdf',
    bytes: Buffer.from('%PDF-1.7 sample'),
    maxBytes: 1024
  });
  assert.deepEqual(info, { fileName: 'nota.pdf', mimeType: 'application/pdf', size: 15 });
});

test('rejects mismatched MIME types, spoofed extensions, and files above the configured size', () => {
  assert.throws(
    () => validateDocumentFile({
      fileName: 'nota.pdf',
      mimeType: 'image/png',
      bytes: Buffer.from('%PDF-1.7 sample'),
      maxBytes: 1024
    }),
    error => error instanceof DocumentUploadError
  );
  assert.throws(
    () => validateDocumentFile({
      fileName: 'nota.pdf',
      mimeType: 'application/pdf',
      bytes: Buffer.from('not a PDF'),
      maxBytes: 1024
    }),
    error => error instanceof DocumentUploadError
  );
  assert.throws(
    () => validateDocumentFile({
      fileName: 'nota.pdf',
      mimeType: 'application/pdf',
      bytes: Buffer.from('%PDF-1.7 sample'),
      maxBytes: 5
    }),
    error => error instanceof DocumentUploadError && error.status === 413
  );
});

test('sanitizes path separators in filenames before they reach Drive', () => {
  const info = validateDocumentFile({
    fileName: '..\\folder/nota.pdf',
    mimeType: 'application/pdf',
    bytes: Buffer.from('%PDF-1.7 sample'),
    maxBytes: 1024
  });
  assert.equal(info.fileName, '.._folder_nota.pdf');
});
