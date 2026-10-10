export async function sendWhatsAppMessage({ phone, message }) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const recipientNumber = process.env.WHATSAPP_RECIPIENT_NUMBER?.trim().replace(/\D/g, '');
  const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v23.0';
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
  const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'id';

  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID belum tersedia di konfigurasi server.');
  if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN belum tersedia di konfigurasi server.');
  if (recipientNumber && phone !== recipientNumber) {
    throw new Error('Penerima WhatsApp tidak sesuai dengan nomor uji yang dikonfigurasi.');
  }
  if (typeof phone !== 'string' || !/^[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('Nomor penerima WhatsApp harus menggunakan kode negara, misalnya 6281234567890.');
  }

  const payload = templateName
    ? {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }]
        }
      }
    : {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { preview_url: false, body: message }
      };

  let response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphApiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      }
    );
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('Permintaan ke Meta WhatsApp Cloud API melewati batas waktu 15 detik.');
    }
    const detail = error instanceof Error ? error.message : 'koneksi tidak dapat dibuat';
    throw new Error(`Meta WhatsApp Cloud API tidak dapat dihubungi: ${detail.replaceAll(accessToken, '[redacted]').slice(0, 250)}`);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Meta WhatsApp Cloud API memberikan respons yang tidak valid (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const apiError = typeof result?.error?.message === 'string'
      ? result.error.message.replaceAll(accessToken, '[redacted]').slice(0, 250)
      : `HTTP ${response.status}`;
    throw new Error(`Meta WhatsApp Cloud API menolak pesan: ${apiError} (HTTP ${response.status}).`);
  }

  if (!Array.isArray(result?.messages) || typeof result.messages[0]?.id !== 'string') {
    throw new Error('Respons Meta WhatsApp Cloud API tidak mengonfirmasi penerimaan pesan.');
  }

  return { accepted: true };
}
