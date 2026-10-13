import crypto from 'node:crypto';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_API = 'https://oauth2.googleapis.com/token';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const SUPPORTED_TYPES = {
  '.pdf': { mimeType: 'application/pdf', signatures: [Buffer.from('%PDF-')] },
  '.doc': { mimeType: 'application/msword', signatures: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])] },
  '.docx': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signatures: [Buffer.from([0x50, 0x4b, 0x03, 0x04])] },
  '.xls': { mimeType: 'application/vnd.ms-excel', signatures: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])] },
  '.xlsx': { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signatures: [Buffer.from([0x50, 0x4b, 0x03, 0x04])] },
  '.csv': { mimeType: 'text/csv', signatures: [] },
  '.jpg': { mimeType: 'image/jpeg', signatures: [Buffer.from([0xff, 0xd8, 0xff])] },
  '.jpeg': { mimeType: 'image/jpeg', signatures: [Buffer.from([0xff, 0xd8, 0xff])] },
  '.png': { mimeType: 'image/png', signatures: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])] }
};

let tokenCache;
const folderLookups = new Map();

export class DriveIntegrationError extends Error {
  constructor(message, status = 502, code = 'DRIVE_UNAVAILABLE') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class DocumentUploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function getDriveConfiguration(environment = process.env) {
  const folderId = environment.GOOGLE_DRIVE_FOLDER_ID?.trim();
  const serviceAccountEmail = environment.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = environment.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!folderId || !serviceAccountEmail || !privateKey) {
    throw new DriveIntegrationError('Google Drive belum dikonfigurasi di server.', 503, 'DRIVE_NOT_CONFIGURED');
  }
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(serviceAccountEmail) ||
      !privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
      !privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new DriveIntegrationError('Konfigurasi akun layanan Google Drive tidak valid.', 503, 'DRIVE_CONFIGURATION_INVALID');
  }
  return { folderId, serviceAccountEmail, privateKey };
}

export function validateDocumentFile({ fileName, mimeType, bytes, maxBytes }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new DocumentUploadError('Pilih berkas yang tidak kosong.');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || bytes.length > maxBytes) {
    throw new DocumentUploadError(`Ukuran berkas melebihi batas ${Math.round(maxBytes / (1024 * 1024))} MB.`, 413);
  }
  if (typeof fileName !== 'string' || fileName.length > 255) {
    throw new DocumentUploadError('Nama berkas tidak valid.');
  }
  const safeName = fileName.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const extension = safeName.slice(safeName.lastIndexOf('.')).toLowerCase();
  const type = SUPPORTED_TYPES[extension];
  if (!safeName || safeName === '.' || safeName === '..' || !type) {
    throw new DocumentUploadError('Format berkas tidak didukung. Gunakan PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG, atau CSV.');
  }
  const declaredMimeType = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (declaredMimeType && declaredMimeType !== 'application/octet-stream' && declaredMimeType !== type.mimeType) {
    throw new DocumentUploadError('Tipe berkas tidak sesuai dengan ekstensi nama berkas.');
  }
  const hasSignature = type.signatures.length === 0 || type.signatures.some(signature =>
    bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature)
  );
  if (!hasSignature) throw new DocumentUploadError('Isi berkas tidak sesuai dengan format yang dipilih.');
  if (extension === '.docx' && !bytes.includes(Buffer.from('word/document.xml'))) {
    throw new DocumentUploadError('Isi berkas bukan dokumen DOCX yang valid.');
  }
  if (extension === '.xlsx' && !bytes.includes(Buffer.from('xl/workbook.xml'))) {
    throw new DocumentUploadError('Isi berkas bukan dokumen XLSX yang valid.');
  }
  if (extension === '.csv' && (bytes.includes(0) || bytes.subarray(0, Math.min(bytes.length, 4096)).toString('utf8').includes('\uFFFD'))) {
    throw new DocumentUploadError('Isi berkas CSV tidak valid.');
  }
  return { fileName: safeName, mimeType: type.mimeType, size: bytes.length };
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function configuration() {
  return getDriveConfiguration();
}

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const { serviceAccountEmail, privateKey } = configuration();
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(JSON.stringify({
    iss: serviceAccountEmail,
    scope: DRIVE_SCOPE,
    aud: TOKEN_API,
    iat: issuedAt,
    exp: issuedAt + 3600
  }))}`;
  let signature;
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
  } catch {
    throw new DriveIntegrationError('Kunci akun layanan Google Drive tidak dapat digunakan.', 503, 'DRIVE_CONFIGURATION_INVALID');
  }
  const response = await fetch(TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`
    }),
    signal: AbortSignal.timeout(20_000)
  }).catch(() => {
    throw new DriveIntegrationError('Tidak dapat terhubung ke layanan autentikasi Google Drive.');
  });
  if (!response.ok) {
    throw new DriveIntegrationError('Autentikasi akun layanan Google Drive gagal. Periksa kredensial server.');
  }
  const result = await response.json().catch(() => null);
  if (typeof result?.access_token !== 'string' || !Number.isFinite(Number(result.expires_in))) {
    throw new DriveIntegrationError('Google Drive mengembalikan respons autentikasi yang tidak valid.');
  }
  tokenCache = { token: result.access_token, expiresAt: Date.now() + Number(result.expires_in) * 1000 };
  return tokenCache.token;
}

async function driveRequest(url, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
    signal: options.signal || AbortSignal.timeout(120_000)
  }).catch(() => {
    throw new DriveIntegrationError('Permintaan ke Google Drive gagal karena gangguan jaringan atau timeout.');
  });
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 403 ? 403 : 502;
    throw new DriveIntegrationError(
      status === 404
        ? 'Berkas Google Drive tidak ditemukan.'
        : status === 403
          ? 'Akun layanan tidak memiliki izin pada folder Google Drive tujuan.'
          : 'Google Drive menolak permintaan. Periksa konfigurasi dan izin folder.',
      status,
      status === 403 ? 'DRIVE_PERMISSION_DENIED' : 'DRIVE_API_FAILED'
    );
  }
  return response;
}

function escapeDriveQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFile(query) {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set('q', query);
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,createdTime,appProperties)');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  url.searchParams.set('corpora', 'allDrives');
  const matches = [];
  let pageToken;
  do {
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    else url.searchParams.delete('pageToken');
    const response = await driveRequest(url);
    const result = await response.json().catch(() => null);
    if (!Array.isArray(result?.files)) throw new DriveIntegrationError('Google Drive mengembalikan daftar berkas yang tidak valid.');
    matches.push(...result.files);
    pageToken = result.nextPageToken;
  } while (pageToken);
  return matches;
}

async function createFolder(parentId, name) {
  const metadata = { name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] };
  const response = await driveRequest(`${DRIVE_API}/files?supportsAllDrives=true&fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });
  const folder = await response.json().catch(() => null);
  if (typeof folder?.id !== 'string') throw new DriveIntegrationError('Google Drive gagal membuat folder arsip.');
  return folder.id;
}

async function getOrCreateFolder(parentId, name) {
  const key = `${parentId}\0${name}`;
  if (folderLookups.has(key)) return folderLookups.get(key);
  const lookup = (async () => {
    const matches = await findFile(
      `'${escapeDriveQuery(parentId)}' in parents and name = '${escapeDriveQuery(name)}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`
    );
    return matches[0]?.id || createFolder(parentId, name);
  })();
  folderLookups.set(key, lookup);
  try {
    return await lookup;
  } finally {
    folderLookups.delete(key);
  }
}

async function getDestinationFolder(category, year) {
  const { folderId } = configuration();
  const categoryFolder = await getOrCreateFolder(folderId, category);
  return getOrCreateFolder(categoryFolder, String(year));
}

async function findUpload(uploadKey) {
  const matches = await findFile(`appProperties has { key='uploadKey' and value='${uploadKey}' } and trashed = false`);
  return matches[0] || null;
}

async function uploadNewFile({ uploadKey, sha256, folderId, fileName, mimeType, bytes }) {
  const boundary = `bmn-${crypto.randomBytes(18).toString('hex')}`;
  const metadata = {
    name: fileName,
    mimeType,
    parents: [folderId],
    appProperties: { uploadKey, sha256 }
  };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const response = await driveRequest(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,createdTime`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}`, 'Content-Length': String(body.length) },
      body
    }
  );
  const uploaded = await response.json().catch(() => null);
  if (typeof uploaded?.id !== 'string') throw new DriveIntegrationError('Google Drive tidak mengembalikan ID berkas.');
  return uploaded;
}

export async function createOrFindDriveFile(options) {
  const existing = await findUpload(options.uploadKey);
  if (existing) {
    if (existing.appProperties?.sha256 !== options.sha256) {
      throw new DriveIntegrationError('ID upload ini sudah digunakan untuk berkas yang berbeda. Pilih ulang berkas sebelum mengirim.', 409, 'UPLOAD_ID_CONFLICT');
    }
    return existing;
  }
  const folderId = await getDestinationFolder(options.category, options.year);
  return uploadNewFile({ ...options, folderId });
}

export async function downloadDriveFile(fileId) {
  const safeId = encodeURIComponent(fileId);
  return driveRequest(`${DRIVE_API}/files/${safeId}?alt=media&supportsAllDrives=true`);
}

export async function deleteDriveFile(fileId) {
  const safeId = encodeURIComponent(fileId);
  await driveRequest(`${DRIVE_API}/files/${safeId}?supportsAllDrives=true`, { method: 'DELETE' });
}
