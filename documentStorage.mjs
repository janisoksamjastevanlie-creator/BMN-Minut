import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DocumentStorageError extends Error {
  constructor(message, code = 'DOCUMENT_STORAGE_ERROR') {
    super(message);
    this.code = code;
  }
}

export function createDocumentStorage(directory) {
  const storageDirectory = path.resolve(directory);

  function filePath(key) {
    if (typeof key !== 'string' || !UUID_PATTERN.test(key)) {
      throw new DocumentStorageError('ID penyimpanan dokumen tidak valid.', 'INVALID_STORAGE_KEY');
    }
    return path.join(storageDirectory, `${key.toLowerCase()}.document`);
  }

  async function existingFile(key) {
    const target = filePath(key);
    try {
      return await fs.readFile(target);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new DocumentStorageError('Berkas penyimpanan dokumen tidak dapat dibaca.');
    }
  }

  return {
    directory: storageDirectory,

    async initialize() {
      await fs.mkdir(storageDirectory, { recursive: true, mode: 0o700 });
      await fs.chmod(storageDirectory, 0o700);
      const probe = path.join(storageDirectory, `.write-test-${crypto.randomUUID()}`);
      try {
        await fs.writeFile(probe, '', { flag: 'wx', mode: 0o600 });
        await fs.unlink(probe);
      } catch {
        throw new DocumentStorageError('Folder penyimpanan dokumen tidak dapat ditulis oleh backend.');
      }
    },

    async save(key, bytes, expectedSha256) {
      if (!Buffer.isBuffer(bytes) ||
          !/^[0-9a-f]{64}$/i.test(expectedSha256 || '') ||
          crypto.createHash('sha256').update(bytes).digest('hex') !== expectedSha256) {
        throw new DocumentStorageError('Checksum berkas tidak valid.', 'INVALID_FILE_CHECKSUM');
      }
      const target = filePath(key);
      const existing = await existingFile(key);
      if (existing) {
        const digest = crypto.createHash('sha256').update(existing).digest('hex');
        if (digest !== expectedSha256) {
          throw new DocumentStorageError('ID upload sudah dipakai untuk isi berkas yang berbeda.', 'UPLOAD_ID_CONFLICT');
        }
        return { size: existing.length, sha256: digest };
      }

      const temporary = path.join(storageDirectory, `.${key.toLowerCase()}.${crypto.randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
        try {
          await fs.link(temporary, target);
        } catch (error) {
          if (error?.code !== 'EEXIST') throw error;
          const concurrentlyWritten = await existingFile(key);
          if (!concurrentlyWritten) throw error;
          const digest = crypto.createHash('sha256').update(concurrentlyWritten).digest('hex');
          if (digest !== expectedSha256) {
            throw new DocumentStorageError('ID upload sudah dipakai untuk isi berkas yang berbeda.', 'UPLOAD_ID_CONFLICT');
          }
        }
        return { size: bytes.length, sha256: expectedSha256 };
      } catch (error) {
        if (error instanceof DocumentStorageError) throw error;
        throw new DocumentStorageError('Berkas tidak dapat disimpan pada disk backend.');
      } finally {
        await fs.unlink(temporary).catch(error => {
          if (error?.code !== 'ENOENT') throw error;
        });
      }
    },

    async read(key) {
      const bytes = await existingFile(key);
      if (!bytes) throw new DocumentStorageError('Berkas tidak ditemukan pada penyimpanan backend.', 'DOCUMENT_FILE_MISSING');
      return bytes;
    },

    async prepareDelete(key) {
      const original = filePath(key);
      try {
        await fs.access(original);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          throw new DocumentStorageError('Berkas dokumen tidak ditemukan pada penyimpanan backend.', 'DOCUMENT_FILE_MISSING');
        }
        throw new DocumentStorageError('Berkas tidak dapat dipersiapkan untuk penghapusan.');
      }
      return { key };
    },

    async restoreDelete(preparedFile) {
      await fs.access(filePath(preparedFile.key));
    },

    async commitDelete(preparedFile) {
      await fs.unlink(filePath(preparedFile.key));
    }
  };
}

export function validateStoredFile({ fileName, mimeType, bytes, maxBytes }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new DocumentStorageError('Pilih berkas yang tidak kosong.', 'INVALID_DOCUMENT_FILE');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || bytes.length > maxBytes) {
    throw new DocumentStorageError('Ukuran berkas melebihi batas yang diizinkan.', 'DOCUMENT_TOO_LARGE');
  }
  if (typeof fileName !== 'string' || fileName.length > 255) {
    throw new DocumentStorageError('Nama berkas tidak valid.', 'INVALID_DOCUMENT_FILE');
  }
  const safeName = fileName.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const extension = safeName.slice(safeName.lastIndexOf('.')).toLowerCase();
  const formats = {
    '.pdf': { mime: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
    '.doc': { mime: 'application/msword', signature: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
    '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: [0x50, 0x4b, 0x03, 0x04] },
    '.xls': { mime: 'application/vnd.ms-excel', signature: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
    '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: [0x50, 0x4b, 0x03, 0x04] },
    '.csv': { mime: 'text/csv', signature: null },
    '.jpg': { mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
    '.jpeg': { mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
    '.png': { mime: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }
  };
  const format = formats[extension];
  if (!safeName || safeName === '.' || safeName === '..' || !format) {
    throw new DocumentStorageError('Format berkas tidak didukung.', 'INVALID_DOCUMENT_FILE');
  }
  const suppliedMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (suppliedMime && suppliedMime !== 'application/octet-stream' && suppliedMime !== format.mime) {
    throw new DocumentStorageError('Tipe berkas tidak sesuai dengan ekstensi nama berkas.', 'INVALID_DOCUMENT_FILE');
  }
  if (format.signature && !bytes.subarray(0, format.signature.length).equals(Buffer.from(format.signature))) {
    throw new DocumentStorageError('Isi berkas tidak sesuai dengan format yang dipilih.', 'INVALID_DOCUMENT_FILE');
  }
  if (extension === '.docx' && !bytes.includes(Buffer.from('word/document.xml'))) {
    throw new DocumentStorageError('Isi berkas bukan dokumen DOCX yang valid.', 'INVALID_DOCUMENT_FILE');
  }
  if (extension === '.xlsx' && !bytes.includes(Buffer.from('xl/workbook.xml'))) {
    throw new DocumentStorageError('Isi berkas bukan dokumen XLSX yang valid.', 'INVALID_DOCUMENT_FILE');
  }
  if (extension === '.csv' &&
      (bytes.includes(0) || bytes.subarray(0, Math.min(bytes.length, 4096)).toString('utf8').includes('\uFFFD'))) {
    throw new DocumentStorageError('Isi berkas CSV tidak valid.', 'INVALID_DOCUMENT_FILE');
  }
  return { fileName: safeName, mimeType: format.mime, size: bytes.length };
}
