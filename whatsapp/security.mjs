import crypto from 'node:crypto';

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

export function isValidPhone(value) {
  return /^[1-9]\d{7,14}$/.test(String(value || ''));
}

export function maskPhone(value) {
  const digits = normalizePhone(value);
  return digits.length > 4 ? `***${digits.slice(-4)}` : '[invalid]';
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Membandingkan hash agar panjang input tidak membocorkan informasi lewat timing.
export function safeEqual(a, b) {
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(a)).digest(),
    crypto.createHash('sha256').update(String(b)).digest()
  );
}

export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!appSecret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqual(header.slice(7), expected);
}

export function verifyTwilioSignature(url, params, header, authToken) {
  if (!authToken || typeof header !== 'string' || !header) return false;
  const payload = Object.keys(params).sort().reduce((text, key) => text + key + params[key], url);
  const expected = crypto.createHmac('sha1', authToken).update(payload, 'utf8').digest('base64');
  return safeEqual(header, expected);
}

export class SlidingWindowLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  // `first` bernilai true hanya pada penolakan pertama dalam satu jendela, supaya balasan peringatan tidak berulang.
  hit(key, now = Date.now()) {
    if (this.hits.size > 10000) {
      for (const [entryKey, entry] of this.hits) {
        if (entry.times.every(time => now - time >= this.windowMs)) this.hits.delete(entryKey);
      }
    }
    const entry = this.hits.get(key) || { times: [], warned: false };
    entry.times = entry.times.filter(time => now - time < this.windowMs);
    if (entry.times.length >= this.limit) {
      const first = !entry.warned;
      entry.warned = true;
      this.hits.set(key, entry);
      return { allowed: false, first };
    }
    entry.times.push(now);
    entry.warned = false;
    this.hits.set(key, entry);
    return { allowed: true, first: false };
  }
}

export function redactSecrets(text) {
  return String(text ?? '').replace(/BMN-[A-Z2-9]{8}/gi, 'BMN-********');
}
