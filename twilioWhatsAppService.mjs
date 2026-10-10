function normalizeWhatsAppNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function toWhatsAppAddress(value) {
  const digits = normalizeWhatsAppNumber(value);
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error('Nomor WhatsApp harus menggunakan format internasional yang valid.');
  }
  return `whatsapp:+${digits}`;
}

export async function sendTwilioWhatsAppMessage({ phone, message }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid = process.env.TWILIO_API_KEY?.trim() || process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();

  if (!accountSid) throw new Error('TWILIO_ACCOUNT_SID belum tersedia di konfigurasi backend.');
  if (!apiKeySid) throw new Error('TWILIO_API_KEY_SID belum tersedia di konfigurasi backend.');
  if (!apiKeySecret) throw new Error('TWILIO_API_KEY_SECRET belum tersedia di konfigurasi backend.');
  if (!from) throw new Error('TWILIO_WHATSAPP_FROM belum tersedia di konfigurasi backend.');
  if (!/^AC[\da-f]{32}$/i.test(accountSid)) throw new Error('TWILIO_ACCOUNT_SID tidak valid.');
  if (!/^SK[\da-f]{32}$/i.test(apiKeySid)) throw new Error('TWILIO_API_KEY_SID tidak valid.');

  const recipient = toWhatsAppAddress(phone);
  if (!/^whatsapp:\+[1-9]\d{7,14}$/i.test(from)) {
    throw new Error('TWILIO_WHATSAPP_FROM tidak valid. Gunakan sender WhatsApp Twilio dengan format whatsapp:+<nomor-sender>.');
  }

  const body = new URLSearchParams({
    From: from,
    To: recipient,
    Body: message
  });
  const authorization = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');

  let response;
  try {
    response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('Permintaan ke Twilio melewati batas waktu 15 detik.');
    }
    throw new Error('Twilio tidak dapat dihubungi karena masalah jaringan.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Twilio memberikan respons yang tidak valid (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const providerMessage = typeof result?.message === 'string' ? result.message : '';
    if (response.status === 401 || /actor doesn't have any assertions/i.test(providerMessage)) {
      throw new Error('WhatsApp provider authentication failed.');
    }
    const detail = providerMessage
        .replaceAll(apiKeySecret, '[redacted]')
        .replaceAll(authorization, '[redacted]')
        .replaceAll(accountSid, '[redacted]')
        .replaceAll(apiKeySid, '[redacted]')
        .replaceAll(phone, '[number redacted]')
        .replaceAll(recipient, '[number redacted]')
        .replaceAll(`whatsapp:+${normalizeWhatsAppNumber(phone)}`, '[number redacted]')
        .slice(0, 250)
      || `HTTP ${response.status}`;
    const errorCode = Number.isInteger(result?.code) ? ` (kode Twilio ${result.code})` : '';
    throw new Error(`Twilio menolak pesan${errorCode}: ${detail}.`);
  }

  if (typeof result?.sid !== 'string' || typeof result?.status !== 'string') {
    throw new Error('Respons Twilio tidak mengonfirmasi penerimaan pesan.');
  }

  return { accepted: true, messageSid: result.sid, providerStatus: result.status };
}
