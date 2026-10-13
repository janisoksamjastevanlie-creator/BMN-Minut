import crypto from 'node:crypto';
import { DocumentStorageError } from './documentStorage.mjs';

export function verifyDocumentBytes(document, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== document.storageSize ||
      crypto.createHash('sha256').update(bytes).digest('hex') !== document.sha256) {
    throw new DocumentStorageError('Pemeriksaan integritas berkas gagal. Hubungi administrator.', 'DOCUMENT_INTEGRITY_ERROR');
  }
  return bytes;
}

export async function saveDocumentBackup(executor, document, bytes) {
  verifyDocumentBytes(document, bytes);
  await executor.execute(`
    INSERT INTO document_files (document_id, file_name, mime_type, file_size_bytes, sha256, file_data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      file_name = VALUES(file_name), mime_type = VALUES(mime_type),
      file_size_bytes = VALUES(file_size_bytes), sha256 = VALUES(sha256), file_data = VALUES(file_data)
  `, [document.id, document.fileName, document.fileType, bytes.length, document.sha256, bytes]);
}

export async function readDocumentWithBackup(storage, executor, document) {
  let bytes;
  try {
    bytes = await storage.read(document.storageKey);
  } catch (error) {
    if (!(error instanceof DocumentStorageError) || error.code !== 'DOCUMENT_FILE_MISSING') throw error;
    const [rows] = await executor.execute(
      'SELECT file_data, sha256, file_size_bytes FROM document_files WHERE document_id = ?',
      [document.id]
    );
    const backup = rows[0];
    if (!backup) throw error;
    if (backup.sha256 !== document.sha256 || Number(backup.file_size_bytes) !== document.storageSize) {
      throw new DocumentStorageError('Metadata cadangan berkas tidak sesuai dengan arsip.', 'DOCUMENT_INTEGRITY_ERROR');
    }
    return verifyDocumentBytes(document, backup.file_data);
  }
  verifyDocumentBytes(document, bytes);
  const [rows] = await executor.execute(
    'SELECT sha256, file_size_bytes FROM document_files WHERE document_id = ?', [document.id]
  );
  if (!rows[0]) {
    await saveDocumentBackup(executor, document, bytes);
  } else if (rows[0].sha256 !== document.sha256 || Number(rows[0].file_size_bytes) !== document.storageSize) {
    throw new DocumentStorageError('Metadata cadangan berkas tidak sesuai dengan arsip.', 'DOCUMENT_INTEGRITY_ERROR');
  }
  return bytes;
}
