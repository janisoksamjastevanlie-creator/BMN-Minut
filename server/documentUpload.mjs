// Helper unggahan dokumen: metadata, validasi berkas, dan catatan audit.
import crypto from 'node:crypto';

export class DocumentUploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function readLimitedRequestFactory(documentMaxFileSizeMb) {
  return async function readLimitedRequest(request, maximumBytes) {
    const contentLength = Number(request.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
      throw new DocumentUploadError(`Ukuran berkas melebihi batas ${documentMaxFileSizeMb} MB.`, 413);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maximumBytes) {
        throw new DocumentUploadError(`Ukuran berkas melebihi batas ${documentMaxFileSizeMb} MB.`, 413);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
  };
}

export function parseDocumentUploadMetadata(request) {
  const encoded = request.get('x-document-metadata');
  if (!encoded || encoded.length > 8192) throw new DocumentUploadError('Metadata dokumen tidak valid.');
  let metadata;
  try {
    metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new DocumentUploadError('Metadata dokumen tidak valid.');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new DocumentUploadError('Metadata dokumen tidak valid.');
  }
  const title = String(metadata.title || '').trim();
  const category = String(metadata.category || '');
  const number = String(metadata.number || '').trim();
  const date = String(metadata.date || '');
  const status = String(metadata.status || 'Draft');
  const description = String(metadata.description || '').trim();
  const tags = metadata.tags;
  const categories = new Set([
    'Nota', 'Berita Acara', 'Dokumen Lainnya', 'Dokumen Perolehan',
    'Dokumen Pemindahan', 'Dokumen Pemeliharaan', 'Dokumen Penghapusan',
    'Dokumen Barang Masuk', 'Dokumen Barang Keluar', 'Dokumen Stock Opname',
    'Dokumen Pengadaan'
  ]);
  const dateObject = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
  if (!title || title.length > 200 || !categories.has(category) ||
      !dateObject || Number.isNaN(dateObject.getTime()) || dateObject.toISOString().slice(0, 10) !== date ||
      !['Draft', 'Final', 'Sah', 'Menunggu TTD', 'Arsip'].includes(status) ||
      number.length > 100 || description.length > 2000 ||
      !Array.isArray(tags) || tags.length > 20 ||
      tags.some(tag => typeof tag !== 'string' || tag.length > 80)) {
    throw new DocumentUploadError('Lengkapi metadata dokumen dengan format yang valid.');
  }

  let namaToko;
  let kategoriNota;
  let totalNilaiNota;
  let receiptItems;
  if (category === 'Nota') {
    namaToko = String(metadata.namaToko || '').trim();
    kategoriNota = String(metadata.kategoriNota || '').trim();
    if (kategoriNota && !['ATK', 'ARK'].includes(kategoriNota)) {
      throw new DocumentUploadError('Kategori nota harus ATK atau ARK.');
    }
    if (metadata.items !== undefined) {
      if (!Array.isArray(metadata.items)) {
        throw new DocumentUploadError('Daftar barang nota tidak valid.');
      }
      receiptItems = metadata.items.map((item, idx) => {
        const namaBarang = String(item?.namaBarang || '').trim();
        const kategori = String(item?.kategori || kategoriNota || 'ATK').trim();
        const satuan = String(item?.satuan || '').trim();
        const jumlah = Number(item?.jumlah);
        const hargaSatuan = Number(item?.hargaSatuan);
        const totalHarga = Number(item?.totalHarga != null ? item.totalHarga : (jumlah * hargaSatuan));
        if (!namaBarang || namaBarang.length > 200) {
          throw new DocumentUploadError(`Nama barang pada baris ${idx + 1} tidak valid.`);
        }
        if (!['ATK', 'ARK'].includes(kategori)) {
          throw new DocumentUploadError(`Kategori barang pada baris ${idx + 1} harus ATK atau ARK.`);
        }
        if (!satuan || satuan.length > 30) {
          throw new DocumentUploadError(`Satuan barang pada baris ${idx + 1} tidak valid.`);
        }
        if (!Number.isSafeInteger(jumlah) || jumlah <= 0) {
          throw new DocumentUploadError(`Jumlah barang pada baris ${idx + 1} harus bilangan bulat positif.`);
        }
        if (!Number.isFinite(hargaSatuan) || hargaSatuan < 0) {
          throw new DocumentUploadError(`Harga satuan pada baris ${idx + 1} tidak valid.`);
        }
        return {
          id: String(item?.id || crypto.randomUUID()),
          itemId: item?.itemId ? String(item.itemId).trim() : undefined,
          namaBarang,
          kategori,
          satuan,
          jumlah,
          hargaSatuan,
          totalHarga: Number.isFinite(totalHarga) && totalHarga >= 0 ? totalHarga : (jumlah * hargaSatuan)
        };
      });
      totalNilaiNota = receiptItems.reduce((acc, it) => acc + it.totalHarga, 0);
    } else if (metadata.totalNilaiNota != null) {
      const val = Number(metadata.totalNilaiNota);
      if (Number.isFinite(val) && val >= 0) totalNilaiNota = val;
    }
  }

  return {
    title,
    category,
    number,
    date,
    status,
    description,
    tags: tags.map(tag => tag.trim()).filter(Boolean),
    namaToko: namaToko || undefined,
    kategoriNota: kategoriNota || undefined,
    totalNilaiNota: totalNilaiNota != null ? totalNilaiNota : undefined,
    items: receiptItems
  };
}

export function parseUploadKey(request) {
  const uploadKey = String(request.get('x-upload-id') || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadKey)) {
    throw new DocumentUploadError('ID upload tidak valid. Pilih kembali berkas sebelum mencoba lagi.');
  }
  return uploadKey;
}

export function documentAuditRecord(user, document, timestamp, ipAddress) {
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(timestamp);
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(timestamp);
  return {
    id: crypto.randomUUID(),
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    aktivitas: 'Unggah Dokumen Backend',
    modul: 'DOKUMEN',
    tanggal: localDate,
    waktu: localTime,
    ipAddress: String(ipAddress || '').slice(0, 50),
    detail: `Mengunggah ${document.judul} (${document.nomorDokumen}) ke penyimpanan backend.`
  };
}

export function safeDocumentName(fileName) {
  return String(fileName || 'document').replace(/[\\/\r\n"]/g, '_');
}
