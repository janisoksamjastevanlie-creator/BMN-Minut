export class ApiResponseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const isTimeoutFailure = (error: unknown): error is Error =>
  error instanceof Error &&
  (['TimeoutError', 'AbortError'].includes(error.name) || /\bsignal timed out\b/i.test(error.message));

export const isTransientApiFailure = (error: unknown): boolean =>
  error instanceof TypeError ||
  isTimeoutFailure(error) ||
  (error instanceof ApiResponseError && [502, 503, 504].includes(error.status));

export const apiFailureMessage = (error: unknown): string => {
  if (error instanceof ApiResponseError) return error.message;
  if (isTimeoutFailure(error)) {
    return 'Server terlalu lama merespons. Perubahan belum dapat dipastikan tersimpan; periksa data server sebelum mengulangi transaksi.';
  }
  if (error instanceof TypeError) return 'Server tidak dapat dihubungi. Periksa koneksi jaringan lalu coba lagi.';
  return error instanceof Error ? error.message : 'Terjadi kesalahan saat menghubungi server.';
};

export const readApiResponse = async <T,>(
  response: Response,
  endpoint: string,
  allowErrorStatuses: number[] = []
): Promise<T> => {
  const body = await response.text();
  let result: T;
  try {
    result = JSON.parse(body) as T;
  } catch {
    const isHtml = /^\s*(?:<!doctype html\b|<html\b)/i.test(body);
    throw new ApiResponseError(
      response.status === 401
        ? 'Sesi berakhir. Silakan masuk kembali.'
        : response.status === 403
          ? 'Akses ditolak oleh server.'
          : isHtml
            ? `Endpoint ${endpoint} mengembalikan HTML, bukan JSON. Pastikan permintaan API diteruskan ke server Node.js.`
            : `Respons ${endpoint} tidak valid (HTTP ${response.status}).`,
      response.status
    );
  }
  if (!response.ok && !allowErrorStatuses.includes(response.status)) {
    const errorMessage = result && typeof result === 'object' && 'error' in result
      ? String(result.error)
      : '';
    throw new ApiResponseError(
      response.status === 401
        ? errorMessage || 'Sesi berakhir. Silakan masuk kembali.'
        : response.status === 403
          ? errorMessage || 'Akses ditolak oleh server.'
          : response.status >= 500
            ? errorMessage || `Server mengalami kesalahan (HTTP ${response.status}).`
            : errorMessage || `Permintaan gagal (HTTP ${response.status}).`,
      response.status
    );
  }
  return result;
};

export const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  policy: { timeoutMs?: number; retryDelayMs?: number } = {}
): Promise<Response> => {
  const readOnly = (options.method || 'GET').toUpperCase() === 'GET';
  const attempts = readOnly ? 3 : 1;
  // Penyimpanan state mengunggah payload besar; beri waktu lebih panjang daripada pembacaan.
  const timeoutMs = policy.timeoutMs ?? (url === '/api/state' ? (readOnly ? 60_000 : 120_000) : 30_000);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    try {
      const response = await fetch(url, { ...options, signal, ...(readOnly ? { cache: 'no-store' } : {}) });
      if (readOnly && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        throw new ApiResponseError(`Server sementara tidak tersedia (HTTP ${response.status}).`, response.status);
      }
      // Keep the deadline active until the entire response has arrived, not just its headers.
      const body = await response.arrayBuffer();
      return new Response([204, 205, 304].includes(response.status) ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (error) {
      const failure = controller.signal.aborted ? controller.signal.reason : error;
      if (options.signal?.aborted || !isTransientApiFailure(failure) || attempt + 1 === attempts) throw failure;
      console.warn(`[sync] GET ${url} terputus; mencoba kembali (${attempt + 2}/${attempts}).`);
    } finally {
      clearTimeout(timer);
    }
    await new Promise(resolve => setTimeout(resolve, (policy.retryDelayMs ?? 1_000) * (attempt + 1)));
  }
  throw new Error('Permintaan server tidak selesai.');
};

// Pesan yang dikirim server ketika body permintaan tidak dapat dibaca (lihat error handler di server.mjs).
export const UNREADABLE_REQUEST_BODY_MESSAGE = 'Format data yang dikirim tidak dapat dibaca server.';
const GZIP_MIN_BYTES = 16_384;

// null = belum diuji; false = browser tidak mendukung atau server/proxy menolak body terkompresi.
let gzipUploadSupported: boolean | null = typeof CompressionStream === 'function' ? null : false;

export const isGzipUploadEnabled = () => gzipUploadSupported !== false;

const gzipText = async (text: string): Promise<ArrayBuffer> => {
  const compressed = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(compressed).arrayBuffer();
};

const responseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const result: unknown = JSON.parse(await response.clone().text());
    return result && typeof result === 'object' && 'error' in result ? String(result.error) : '';
  } catch {
    return '';
  }
};

// Browser tidak mengompresi upload secara otomatis; state aplikasi berukuran megabyte sehingga
// dikompresi manual agar penyimpanan tidak menabrak batas waktu pada koneksi upload yang lambat.
export const sendJson = async (
  url: string,
  method: 'PUT' | 'POST',
  payload: unknown,
  policy: { timeoutMs?: number; retryDelayMs?: number } = {}
): Promise<Response> => {
  const json = JSON.stringify(payload);
  if (gzipUploadSupported !== false && json.length >= GZIP_MIN_BYTES) {
    let body: ArrayBuffer | null = null;
    try {
      body = await gzipText(json);
    } catch {
      gzipUploadSupported = false;
    }
    if (body) {
      const response = await fetchWithTimeout(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        body
      }, policy);
      const unreadable = response.status === 415 ||
        (response.status === 400 && await responseErrorMessage(response) === UNREADABLE_REQUEST_BODY_MESSAGE);
      if (!unreadable) {
        gzipUploadSupported = true;
        return response;
      }
      console.warn('[sync] Server tidak menerima body terkompresi; mengirim ulang tanpa kompresi.');
      gzipUploadSupported = false;
    }
  }
  return fetchWithTimeout(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: json
  }, policy);
};
