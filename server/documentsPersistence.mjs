// Persistensi metadata dokumen di penyimpanan backend (hostinger) ke database.
// Dibungkus transaksi revision-lock agar unggahan idempoten.
import crypto from 'node:crypto';
import { saveDocumentBackup } from '../documentFileBackup.mjs';

export function createHostDocumentPersistence({ withTransaction, queryOne, execute, readCollections, dataBackend }) {
  async function persistHostDocument(document, auditLog, fileBytes) {
    return withTransaction(async connection => {
      const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
      const revision = Number(revisionRow?.value || 0);
      const currentState = await readCollections(connection);
      const existing = (currentState.documents || []).find(item => item.idempotencyKey === document.idempotencyKey);
      if (existing) {
        await saveDocumentBackup(connection, existing, fileBytes);
        const existingAuditLog = (currentState.auditLogs || []).find(log =>
          log.userId === auditLog.userId &&
          log.aktivitas === 'Unggah Dokumen Backend' &&
          log.detail === auditLog.detail
        );
        return { document: existing, auditLog: existingAuditLog, revision };
      }

      if (dataBackend === 'operational') {
        await execute(connection, `
          INSERT INTO documents
            (id, nomor_dokumen, judul, jenis, tanggal, tahun, file_size, uploader, status, tags_json,
             storage_backend, storage_key, storage_size_bytes, sha256, file_name, mime_type, uploaded_at, description, idempotency_key,
             nama_toko, kategori_nota, total_nilai_nota)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          document.id, document.nomorDokumen, document.judul, document.jenis, document.tanggal,
          document.tahun, document.fileSize, document.uploader, document.status, JSON.stringify(document.tags),
          document.storageBackend, document.storageKey, document.storageSize, document.sha256, document.fileName, document.fileType, new Date(document.uploadedAt),
          document.description || null, document.idempotencyKey,
          document.namaToko || null, document.kategoriNota || null, document.totalNilaiNota != null ? document.totalNilaiNota : null
        ]);
        if (Array.isArray(document.items) && document.items.length > 0) {
          for (const item of document.items) {
            await execute(connection, `
              INSERT INTO document_receipt_items
                (id, document_id, item_id, nama_barang, kategori, satuan, jumlah, harga_satuan, total_harga)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              item.id || crypto.randomUUID(),
              document.id,
              item.itemId || null,
              item.namaBarang,
              item.kategori,
              item.satuan,
              item.jumlah,
              item.hargaSatuan,
              item.totalHarga
            ]);
          }
        }
        await execute(connection, `
          INSERT INTO audit_logs (id, user_id, user_name, user_role, aktivitas, modul, tanggal, waktu, ip_address, detail)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          auditLog.id, auditLog.userId, auditLog.userName, auditLog.userRole, auditLog.aktivitas,
          auditLog.modul, auditLog.tanggal, auditLog.waktu, auditLog.ipAddress, auditLog.detail
        ]);
      } else {
        const documents = [document, ...(currentState.documents || [])];
        const auditLogs = [...(currentState.auditLogs || []), auditLog];
        await execute(connection, `
          INSERT INTO app_data (\`key\`, value_json) VALUES ('documents', ?)
          ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
        `, [JSON.stringify(documents)]);
        await execute(connection, `
          INSERT INTO app_data (\`key\`, value_json) VALUES ('auditLogs', ?)
          ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
        `, [JSON.stringify(auditLogs)]);
      }
      await saveDocumentBackup(connection, document, fileBytes);
      await execute(connection, `
        INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [String(revision + 1)]);
      return { document, auditLog, revision: revision + 1 };
    });
  }

  async function persistHostDocumentDeletion(documentId, auditLog) {
    return withTransaction(async connection => {
      const revisionRow = await queryOne(connection, "SELECT value FROM app_meta WHERE `key` = 'revision' FOR UPDATE");
      const revision = Number(revisionRow?.value || 0);
      const currentState = await readCollections(connection);
      const document = (currentState.documents || []).find(item => item.id === documentId);
      if (!document) return { deleted: false, revision };
      if (dataBackend === 'operational') {
        await execute(connection, 'DELETE FROM documents WHERE id = ?', [documentId]);
        await execute(connection, `
          INSERT INTO audit_logs (id, user_id, user_name, user_role, aktivitas, modul, tanggal, waktu, ip_address, detail)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          auditLog.id, auditLog.userId, auditLog.userName, auditLog.userRole, auditLog.aktivitas,
          auditLog.modul, auditLog.tanggal, auditLog.waktu, auditLog.ipAddress, auditLog.detail
        ]);
      } else {
        await execute(connection, 'DELETE FROM document_files WHERE document_id = ?', [documentId]);
        await execute(connection, `
          INSERT INTO app_data (\`key\`, value_json) VALUES ('documents', ?)
          ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
        `, [JSON.stringify(currentState.documents.filter(item => item.id !== documentId))]);
        await execute(connection, `
          INSERT INTO app_data (\`key\`, value_json) VALUES ('auditLogs', ?)
          ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)
        `, [JSON.stringify([...(currentState.auditLogs || []), auditLog])]);
      }
      await execute(connection, `
        INSERT INTO app_meta (\`key\`, value) VALUES ('revision', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [String(revision + 1)]);
      return { deleted: true, revision: revision + 1 };
    });
  }

  return { persistHostDocument, persistHostDocumentDeletion };
}
