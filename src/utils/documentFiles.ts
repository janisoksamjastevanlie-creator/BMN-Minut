import type { DocumentItem } from '../types';

export class DocumentFileError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
  }
}

export async function fetchDocumentFile(doc: DocumentItem, signal?: AbortSignal): Promise<Blob> {
  const source = doc.storageBackend === 'hostinger'
    ? `/api/documents/${encodeURIComponent(doc.id)}/file`
    : doc.fileDataUrl;
  if (!source) throw new DocumentFileError('Dokumen ini tidak memiliki berkas terlampir.');
  const response = await fetch(source, { signal, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const result: unknown = await response.json();
      if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'string') {
        throw new DocumentFileError(result.error,
          'code' in result && typeof result.code === 'string' ? result.code : undefined);
      }
    }
    throw new DocumentFileError(`Berkas tidak dapat dibuka (HTTP ${response.status}). Silakan masuk kembali atau coba lagi.`);
  }
  const blob = await response.blob();
  const mimeType = blob.type.split(';')[0];
  if (!blob.size || mimeType === 'application/json' || mimeType === 'text/html' ||
      (doc.fileType && mimeType !== doc.fileType)) {
    throw new DocumentFileError('Respons server bukan berkas lampiran yang valid. Silakan coba lagi atau hubungi administrator.');
  }
  return blob;
}
