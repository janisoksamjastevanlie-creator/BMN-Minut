// Rute dokumen: unggah nota/dokumen ke penyimpanan backend, perubahan nota,
// unduhan dan pemulihan lampiran, serta penghapusan dokumen backend.
import crypto from 'node:crypto';
import {
  DocumentUploadError,
  documentAuditRecord,
  parseDocumentUploadMetadata,
  parseUploadKey,
  readLimitedRequestFactory,
  safeDocumentName
} from '../documentUpload.mjs';
import { DocumentStorageError, validateStoredFile } from '../../documentStorage.mjs';
import { readDocumentWithBackup, saveDocumentBackup, verifyDocumentBytes } from '../../documentFileBackup.mjs';

export function registerDocumentRoutes(app, context) {
  const {
    db,
    dataBackend,
    queryOne,
    execute,
    withTransaction,
    readCollections,
    refreshCollections,
    getCollection,
    userHasPermission,
    requireUser,
    asyncRoute,
    documentStorage,
    documentMaxFileSize,
    documentMaxFileSizeMb,
    persistHostDocument,
    persistHostDocumentDeletion
  } = context;

  const readLimitedRequest = readLimitedRequestFactory(documentMaxFileSizeMb);

  function canManageDocuments(user) {
    return ['manageAssets', 'manageInventory', 'systemSettings']
      .some(permission => userHasPermission(user, permission));
  }

  function canViewDocuments(user) {
    return userHasPermission(user, 'viewReports') || canManageDocuments(user);
  }

  app.post('/api/documents', requireUser, asyncRoute(async (request, response) => {
    if (!canManageDocuments(request.user)) {
      return response.status(403).json({ error: 'Tidak memiliki izin mengunggah dokumen.' });
    }

    let metadata;
    let uploadKey;
    let file;
    let fileBytes;
    try {
      metadata = parseDocumentUploadMetadata(request);
      if (metadata.category === 'Nota' && !userHasPermission(request.user, 'manageInventory')) {
        return response.status(403).json({ error: 'Hanya role yang berwenang atas persediaan dapat mengunggah nota belanja.' });
      }
      uploadKey = parseUploadKey(request);
      let fileName;
      try {
        fileName = decodeURIComponent(request.get('x-file-name') || '');
      } catch {
        throw new DocumentUploadError('Nama berkas tidak valid.');
      }
      fileBytes = await readLimitedRequest(request, documentMaxFileSize);
      file = validateStoredFile({
        fileName,
        mimeType: request.get('content-type'),
        bytes: fileBytes,
        maxBytes: documentMaxFileSize
      });
    } catch (error) {
      if (error instanceof DocumentUploadError) {
        return response.status(error.status).json({ error: error.message });
      }
      if (error instanceof DocumentStorageError) {
        return response.status(error.code === 'DOCUMENT_TOO_LARGE' ? 413 : 400).json({ error: error.message });
      }
      throw error;
    }

    const year = Number(metadata.date.slice(0, 4));
    const fileSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
    try {
      await documentStorage.save(uploadKey, fileBytes, fileSha256);
    } catch (error) {
      if (error instanceof DocumentStorageError) {
        const status = error.code === 'UPLOAD_ID_CONFLICT' ? 409 : 500;
        if (status === 500) console.error('Backend document storage failed:', error.code);
        return response.status(status).json({
          error: status === 409 ? error.message : 'Berkas tidak dapat disimpan pada penyimpanan backend.'
        });
      }
      throw error;
    }

    const document = {
      id: crypto.randomUUID(),
      nomorDokumen: metadata.number || `BMN/${year}/${uploadKey.slice(0, 8).toUpperCase()}`,
      judul: metadata.title,
      jenis: metadata.category,
      tanggal: metadata.date,
      tahun: year,
      fileSize: fileBytes.length < 1024 * 1024
        ? `${(fileBytes.length / 1024).toFixed(1)} KB`
        : `${(fileBytes.length / (1024 * 1024)).toFixed(1)} MB`,
      uploader: request.user.name,
      tags: metadata.tags,
      status: metadata.status,
      fileName: file.fileName,
      fileType: file.mimeType,
      storageBackend: 'hostinger',
      storageKey: uploadKey,
      storageSize: fileBytes.length,
      sha256: fileSha256,
      description: metadata.description || undefined,
      uploadedAt: new Date().toISOString(),
      idempotencyKey: uploadKey,
      namaToko: metadata.namaToko,
      kategoriNota: metadata.kategoriNota,
      totalNilaiNota: metadata.totalNilaiNota,
      items: metadata.items
    };
    const auditLog = documentAuditRecord(request.user, document, new Date(document.uploadedAt), request.ip);
    try {
      const result = await persistHostDocument(document, auditLog, fileBytes);
      if (result.document.id !== document.id) {
        const revisionRow = await queryOne(db, "SELECT value FROM app_meta WHERE `key` = 'revision'");
        return response.json({
          document: result.document,
          auditLog: result.auditLog,
          revision: Number(revisionRow?.value || result.revision)
        });
      }
      await refreshCollections();
      return response.status(201).json({
        document: result.document,
        auditLog: result.auditLog || auditLog,
        revision: result.revision
      });
    } catch (error) {
      console.error('Backend document metadata persistence failed:', error?.code || 'DATABASE_ERROR');
      if (error?.code === 'ER_DUP_ENTRY') {
        return response.status(409).json({
          error: 'Nomor dokumen tersebut sudah digunakan. Perbarui nomor dokumen lalu kirim kembali.'
        });
      }
      return response.status(500).json({
        error: 'Penyimpanan metadata atau cadangan MySQL belum selesai. Berkas ada di disk backend; ulangi permintaan yang sama untuk menyelesaikan pencatatan.'
      });
    }
  }));

  app.put('/api/documents/:id', requireUser, asyncRoute(async (request, response) => {
    if (!canManageDocuments(request.user) || !userHasPermission(request.user, 'manageInventory')) {
      return response.status(403).json({ error: 'Tidak memiliki izin mengubah nota belanja.' });
    }

    const existing = (getCollection('documents') || []).find(item => item.id === request.params.id);
    if (!existing) return response.status(404).json({ error: 'Nota belanja tidak ditemukan.' });
    if (existing.jenis !== 'Nota') return response.status(400).json({ error: 'Dokumen ini bukan nota belanja.' });
    if (existing.status !== 'Draft' && !userHasPermission(request.user, 'systemSettings')) {
      return response.status(403).json({ error: 'Nota final/terkunci hanya dapat diubah melalui otorisasi administrator.' });
    }

    let metadata;
    let fileBytes;
    let file;
    try {
      metadata = parseDocumentUploadMetadata(request);
      if (metadata.category !== 'Nota') throw new DocumentUploadError('Kategori dokumen tidak dapat diubah dari nota.');
      fileBytes = await readLimitedRequest(request, documentMaxFileSize);
      if (fileBytes.length) {
        let fileName;
        try {
          fileName = decodeURIComponent(request.get('x-file-name') || '');
        } catch {
          throw new DocumentUploadError('Nama berkas tidak valid.');
        }
        file = validateStoredFile({
          fileName,
          mimeType: request.get('content-type'),
          bytes: fileBytes,
          maxBytes: documentMaxFileSize
        });
      }
    } catch (error) {
      if (error instanceof DocumentUploadError) {
        return response.status(error.status).json({ error: error.message });
      }
      if (error instanceof DocumentStorageError) {
        return response.status(error.code === 'DOCUMENT_TOO_LARGE' ? 413 : 400).json({ error: error.message });
      }
      throw error;
    }

    const newStorageKey = file ? crypto.randomUUID() : undefined;
    const fileSha256 = file ? crypto.createHash('sha256').update(fileBytes).digest('hex') : undefined;
    if (file && newStorageKey && fileSha256) {
      try {
        await documentStorage.save(newStorageKey, fileBytes, fileSha256);
      } catch (error) {
        if (error instanceof DocumentStorageError) {
          console.error('Backend replacement document storage failed:', error.code);
          return response.status(500).json({ error: 'Berkas pengganti tidak dapat disimpan pada penyimpanan backend.' });
        }
        throw error;
      }
    }

    const now = new Date();
    let updatedDocument;
    let auditLog;
    let revision;
    let transactionCommitted = false;
    try {
      const result = await withTransaction(async connection => {
        const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
        const currentRevision = Number(revisionRow?.value || 0);
        const currentState = await readCollections(connection);
        const current = (currentState.documents || []).find(item => item.id === request.params.id);
        if (!current || current.storageKey !== existing.storageKey || current.sha256 !== existing.sha256) {
          throw new DocumentUploadError('Nota telah berubah atau dihapus. Muat ulang halaman lalu coba kembali.', 409);
        }
        if (current.jenis !== 'Nota' ||
            (current.status !== 'Draft' && !userHasPermission(request.user, 'systemSettings'))) {
          throw new DocumentUploadError('Nota terkunci atau tidak dapat diubah dengan izin akun ini.', 403);
        }

        const year = Number(metadata.date.slice(0, 4));
        updatedDocument = {
          ...current,
          nomorDokumen: metadata.number,
          judul: metadata.title,
          tanggal: metadata.date,
          tahun: year,
          tags: metadata.tags,
          status: metadata.status,
          description: metadata.description || undefined,
          namaToko: metadata.namaToko,
          kategoriNota: metadata.kategoriNota,
          totalNilaiNota: metadata.totalNilaiNota,
          items: metadata.items
        };
        if (file && newStorageKey && fileSha256) {
          updatedDocument = {
            ...updatedDocument,
            fileName: file.fileName,
            fileType: file.mimeType,
            fileSize: fileBytes.length < 1024 * 1024
              ? `${(fileBytes.length / 1024).toFixed(1)} KB`
              : `${(fileBytes.length / (1024 * 1024)).toFixed(1)} MB`,
            storageBackend: 'hostinger',
            storageKey: newStorageKey,
            storageSize: fileBytes.length,
            sha256: fileSha256
          };
        }
        const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(now);
        const localTime = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }).format(now);
        auditLog = {
          id: crypto.randomUUID(),
          userId: request.user.id,
          userName: request.user.name,
          userRole: request.user.role,
          aktivitas: 'Perubahan Nota Belanja',
          modul: 'DOKUMEN',
          tanggal: localDate,
          waktu: localTime,
          ipAddress: String(request.ip || '').slice(0, 50),
          detail: `Memperbarui nota ${current.nomorDokumen} menjadi ${updatedDocument.nomorDokumen}; rincian, nominal, atau lampiran diperbarui.`
        };
        const nextState = {
          ...currentState,
          documents: (currentState.documents || []).map(item => item.id === current.id ? updatedDocument : item),
          auditLogs: [auditLog, ...(currentState.auditLogs || [])]
        };

        if (dataBackend === 'operational') {
          await execute(connection, `
            UPDATE documents SET
              nomor_dokumen = ?, judul = ?, tanggal = ?, tahun = ?, file_size = ?, status = ?,
              tags_json = ?, storage_backend = ?, storage_key = ?, storage_size_bytes = ?, sha256 = ?,
              file_name = ?, mime_type = ?, description = ?, nama_toko = ?, kategori_nota = ?, total_nilai_nota = ?
            WHERE id = ?
          `, [
            updatedDocument.nomorDokumen, updatedDocument.judul, updatedDocument.tanggal, updatedDocument.tahun,
            updatedDocument.fileSize, updatedDocument.status, JSON.stringify(updatedDocument.tags),
            updatedDocument.storageBackend || null, updatedDocument.storageKey || null,
            updatedDocument.storageSize || null, updatedDocument.sha256 || null,
            updatedDocument.fileName || null, updatedDocument.fileType || null,
            updatedDocument.description || null, updatedDocument.namaToko || null,
            updatedDocument.kategoriNota || null, updatedDocument.totalNilaiNota ?? null, updatedDocument.id
          ]);
          await execute(connection, 'DELETE FROM document_receipt_items WHERE document_id = ?', [updatedDocument.id]);
          for (const item of updatedDocument.items || []) {
            await execute(connection, `
              INSERT INTO document_receipt_items
                (id, document_id, item_id, nama_barang, kategori, satuan, jumlah, harga_satuan, total_harga)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              item.id, updatedDocument.id, item.itemId || null, item.namaBarang, item.kategori,
              item.satuan, item.jumlah, item.hargaSatuan, item.totalHarga
            ]);
          }
          await execute(connection, `
            INSERT INTO audit_logs (id, user_id, user_name, user_role, aktivitas, modul, tanggal, waktu, ip_address, detail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            auditLog.id, auditLog.userId, auditLog.userName, auditLog.userRole, auditLog.aktivitas,
            auditLog.modul, auditLog.tanggal, auditLog.waktu, auditLog.ipAddress, auditLog.detail
          ]);
        } else {
          for (const [key, value] of Object.entries({
            documents: nextState.documents,
            auditLogs: nextState.auditLogs
          })) {
            await execute(connection, `
              INSERT INTO app_data (\`key\`, value_json) VALUES (?, ?)
              ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
            `, [key, JSON.stringify(value)]);
          }
        }
        if (file) await saveDocumentBackup(connection, updatedDocument, fileBytes);
        revision = currentRevision + 1;
        await execute(connection, `
          INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value)
        `, [String(revision)]);
        return { currentStorageKey: current.storageKey };
      });
      transactionCommitted = true;
      if (file && result.currentStorageKey && result.currentStorageKey !== newStorageKey) {
        try {
          const oldFile = await documentStorage.prepareDelete(result.currentStorageKey);
          await documentStorage.commitDelete(oldFile);
        } catch (error) {
          console.error('Old nota attachment cleanup failed after replacement:', error?.code || 'STORAGE_ERROR');
        }
      }
      await refreshCollections();
      return response.json({ success: true, document: updatedDocument, auditLog, revision });
    } catch (error) {
      if (newStorageKey && !transactionCommitted) {
        try {
          const newFile = await documentStorage.prepareDelete(newStorageKey);
          await documentStorage.commitDelete(newFile);
        } catch (cleanupError) {
          if (!(cleanupError instanceof DocumentStorageError && cleanupError.code === 'DOCUMENT_FILE_MISSING')) {
            console.error('Failed to clean up uncommitted nota attachment:', cleanupError?.code || 'STORAGE_ERROR');
          }
        }
      }
      if (error instanceof DocumentUploadError) {
        return response.status(error.status).json({ error: error.message });
      }
      if (error?.code === 'ER_DUP_ENTRY') {
        return response.status(409).json({ error: 'Nomor dokumen tersebut sudah digunakan.' });
      }
      console.error('Nota metadata update failed:', error?.code || 'DATABASE_ERROR');
      return response.status(500).json({ error: 'Perubahan nota atau lampirannya gagal disimpan.' });
    }
  }));

  app.get('/api/documents/:id/file', requireUser, asyncRoute(async (request, response) => {
    if (!canViewDocuments(request.user)) {
      return response.status(403).json({ error: 'Tidak memiliki izin melihat dokumen.' });
    }
    const document = (getCollection('documents') || []).find(item => item.id === request.params.id);
    if (!document || document.storageBackend !== 'hostinger' || !document.storageKey) {
      return response.status(404).json({ error: 'Berkas penyimpanan backend tidak ditemukan.' });
    }
    if (document.jenis === 'Nota' && !userHasPermission(request.user, 'manageInventory')) {
      return response.status(403).json({ error: 'Tidak memiliki izin melihat lampiran nota belanja.' });
    }
    let bytes;
    try {
      bytes = await readDocumentWithBackup(documentStorage, db, document);
    } catch (error) {
      if (error instanceof DocumentStorageError) {
        if (error.code === 'DOCUMENT_FILE_MISSING') {
          console.error(`Stored document file is missing for document ${document.id}.`);
          return response.status(404).json({
            code: 'DOCUMENT_FILE_MISSING',
            error: 'Berkas asli tidak ditemukan di disk maupun cadangan MySQL. Pulihkan folder dokumen dari backup hosting atau unggah ulang berkas asli pada nota ini.'
          });
        }
        console.error('Backend document read failed:', error.code);
        return response.status(500).json({
          error: error.code === 'DOCUMENT_INTEGRITY_ERROR'
            ? error.message : 'Berkas tidak dapat dibaca dari penyimpanan backend.'
        });
      }
      throw error;
    }
    const filename = safeDocumentName(document.fileName);
    const disposition = request.query.download === '1' ? 'attachment' : 'inline';
    response.setHeader('Content-Type', document.fileType || 'application/octet-stream');
    response.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`);
    response.setHeader('Content-Length', String(bytes.length));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(bytes);
  }));

  app.put('/api/documents/:id/file', requireUser, asyncRoute(async (request, response) => {
    if (!canManageDocuments(request.user)) {
      return response.status(403).json({ error: 'Tidak memiliki izin memulihkan lampiran dokumen.' });
    }
    const document = (getCollection('documents') || []).find(item => item.id === request.params.id);
    if (!document || document.storageBackend !== 'hostinger' || !document.storageKey) {
      return response.status(404).json({ error: 'Dokumen backend tidak ditemukan.' });
    }
    let bytes;
    try {
      bytes = await readLimitedRequest(request, documentMaxFileSize);
      validateStoredFile({
        fileName: decodeURIComponent(request.get('x-file-name') || ''),
        mimeType: request.get('content-type'), bytes, maxBytes: documentMaxFileSize
      });
      verifyDocumentBytes(document, bytes);
    } catch (error) {
      if (error instanceof DocumentUploadError) {
        return response.status(error.status).json({ error: error.message });
      }
      if (error instanceof URIError) {
        return response.status(400).json({ error: 'Nama berkas tidak valid.' });
      }
      if (error instanceof DocumentStorageError) {
        return response.status(error.code === 'DOCUMENT_TOO_LARGE' ? 413 : 400).json({
          error: error.code === 'DOCUMENT_INTEGRITY_ERROR'
            ? 'Berkas berbeda dari lampiran asli. Pilih file asli yang sama; rincian nota tidak diubah.'
            : error.message
        });
      }
      throw error;
    }
    try {
      await withTransaction(async connection => {
        await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
        const state = await readCollections(connection);
        const current = (state.documents || []).find(item => item.id === document.id);
        if (!current || current.storageKey !== document.storageKey || current.sha256 !== document.sha256) {
          throw new DocumentUploadError('Dokumen telah berubah atau dihapus. Muat ulang halaman.', 409);
        }
        await documentStorage.save(current.storageKey, bytes, current.sha256);
        await saveDocumentBackup(connection, current, bytes);
      });
    } catch (error) {
      if (error instanceof DocumentUploadError) {
        return response.status(error.status).json({ error: error.message });
      }
      console.error('Backend document restoration failed:', error?.code || 'DATABASE_ERROR');
      return response.status(500).json({ error: 'Pemulihan lampiran atau cadangan MySQL belum selesai. Silakan coba lagi; rincian nota tidak diubah.' });
    }
    response.json({ success: true });
  }));

  app.delete('/api/documents/:id', requireUser, asyncRoute(async (request, response) => {
    if (!canManageDocuments(request.user)) {
      return response.status(403).json({ error: 'Tidak memiliki izin menghapus dokumen.' });
    }
    const document = (getCollection('documents') || []).find(item => item.id === request.params.id);
    if (!document) return response.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    if (document.jenis === 'Nota' &&
        (!userHasPermission(request.user, 'manageInventory') ||
         (document.status !== 'Draft' && !userHasPermission(request.user, 'systemSettings')))) {
      return response.status(403).json({ error: 'Nota belanja hanya dapat dihapus oleh role berwenang; nota final memerlukan otorisasi administrator.' });
    }
    if (document.storageBackend !== 'hostinger' || !document.storageKey) {
      return response.status(400).json({ error: 'Dokumen lama harus dihapus melalui alur arsip yang tersedia.' });
    }
    let preparedFile;
    try {
      const bytes = await readDocumentWithBackup(documentStorage, db, document);
      await documentStorage.save(document.storageKey, bytes, document.sha256);
      preparedFile = await documentStorage.prepareDelete(document.storageKey);
    } catch (error) {
      if (error instanceof DocumentStorageError) {
        console.error('Backend document deletion could not stage file:', error.code);
        return response.status(500).json({
          error: 'Berkas tidak dapat dipersiapkan untuk penghapusan. Data arsip tidak diubah.'
        });
      }
      throw error;
    }
    const timestamp = new Date();
    const auditLog = documentAuditRecord(request.user, document, timestamp, request.ip);
    auditLog.aktivitas = 'Hapus Dokumen Backend';
    auditLog.detail = `Menghapus ${document.judul} (${document.nomorDokumen}) dari penyimpanan backend.`;
    let metadataDeleted = false;
    let deletionResult;
    try {
      const result = await persistHostDocumentDeletion(document.id, auditLog);
      if (!result.deleted) {
        await documentStorage.restoreDelete(preparedFile);
        return response.status(404).json({ error: 'Dokumen tidak ditemukan.' });
      }
      metadataDeleted = true;
      deletionResult = result;
      await refreshCollections();
    } catch (error) {
      if (metadataDeleted) {
        console.error('Backend document cache refresh failed after metadata deletion:', error?.code || 'DATABASE_ERROR');
        return response.status(500).json({ error: 'Metadata arsip telah dihapus, tetapi cache belum diperbarui. Muat ulang halaman atau hubungi administrator.' });
      }
      try {
        await documentStorage.restoreDelete(preparedFile);
      } catch (restoreError) {
        console.error('Backend document rollback failed:', restoreError?.code || 'FILESYSTEM_ERROR');
        return response.status(500).json({
          error: 'Penghapusan gagal dan pemulihan berkas otomatis tidak berhasil. Hubungi administrator.'
        });
      }
      console.error('Backend document deletion failed:', error?.code || 'DATABASE_ERROR');
      return response.status(500).json({
        error: 'Penghapusan dokumen gagal. Metadata arsip tidak diubah dan berkas telah dipulihkan.'
      });
    }
    try {
      await documentStorage.commitDelete(preparedFile);
    } catch (error) {
      console.error('Backend document cleanup failed after metadata deletion:', error?.code || 'FILESYSTEM_ERROR');
      return response.status(500).json({
        error: 'Metadata arsip telah dihapus, tetapi berkas sementara tidak dapat dibersihkan. Hubungi administrator.'
      });
    }
    return response.json({ success: true, auditLog, revision: deletionResult.revision });
  }));
}
