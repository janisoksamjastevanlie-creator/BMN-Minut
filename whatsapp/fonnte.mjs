import { isValidPhone, normalizePhone, sha256 } from './security.mjs';

const FONNTE_TIMEOUT_MS = 15000;
const MAX_INBOUND_TEXT = 500;

function parseTimestamp(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFonnteWebhookMessage(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (typeof payload.sender !== 'string') return null;

  const phone = normalizePhone(payload.sender);
  const timestampMs = parseTimestamp(payload.timestamp);
  if (!isValidPhone(phone) || !timestampMs) return null;

  const buttonText = typeof payload.text === 'string' ? payload.text.trim() : '';
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const text = (buttonText || message).slice(0, MAX_INBOUND_TEXT);
  const inboxId = typeof payload.inboxid === 'string' || typeof payload.inboxid === 'number'
    ? String(payload.inboxid).trim().slice(0, 180)
    : '';
  const messageId = inboxId || `fonnte-${sha256(JSON.stringify({
    sender: phone,
    timestamp: timestampMs,
    buttonText: buttonText.slice(0, MAX_INBOUND_TEXT),
    message: message.slice(0, MAX_INBOUND_TEXT),
    location: typeof payload.location === 'string' ? payload.location.slice(0, 100) : '',
    pollname: typeof payload.pollname === 'string' ? payload.pollname.slice(0, 100) : '',
    choices: typeof payload.choices === 'string' ? payload.choices.slice(0, 100) : ''
  }))}`;

  return {
    messageId,
    phone,
    text,
    timestampMs,
    unsupported: !text
  };
}

export async function sendFonnteMessage(config, phone, message, fetchImpl = fetch) {
  const target = normalizePhone(phone);
  if (!isValidPhone(target)) throw new Error('Nomor tujuan tidak valid.');
  if (!config?.token || !config?.apiUrl) throw new Error('Konfigurasi Fonnte belum lengkap.');
  if (typeof message !== 'string' || !message.trim() || message.length > 60000) {
    throw new Error('Isi pesan Fonnte tidak valid.');
  }

  const data = new FormData();
  data.set('target', target);
  data.set('message', message);

  let response;
  try {
    response = await fetchImpl(config.apiUrl, {
      method: 'POST',
      headers: { Authorization: config.token },
      body: data,
      signal: AbortSignal.timeout(FONNTE_TIMEOUT_MS)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('Fonnte API melewati batas waktu.');
    }
    throw new Error('Fonnte API tidak dapat dihubungi.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Fonnte API mengembalikan respons tidak valid (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(`Fonnte API menolak pesan (HTTP ${response.status}).`);
  if (result?.status !== true) throw new Error('Fonnte API tidak menerima pesan.');
  if (Array.isArray(result.detail) && result.detail.some(item =>
    item && (item.failed === true || item.status === 'failed' || item.status === 'Invalid')
  )) {
    throw new Error('Fonnte gagal memproses pesan untuk nomor tujuan.');
  }

  return {
    requestId: typeof result.requestid === 'string' ? result.requestid.slice(0, 100) : null,
    messageIds: Array.isArray(result.id) ? result.id.filter(id => typeof id === 'string' || typeof id === 'number').map(String).slice(0, 10) : []
  };
}
