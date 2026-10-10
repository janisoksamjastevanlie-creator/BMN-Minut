import { sendWhatsAppMessage } from '../whatsappService.mjs';
import { sendTwilioWhatsAppMessage } from '../twilioWhatsAppService.mjs';
import { sendFonnteMessage } from './fonnte.mjs';
import { isValidPhone } from './security.mjs';

// Antarmuka provider: sendReply (balasan dalam percakapan, boleh interaktif) dan
// sendNotification (pesan proaktif, memakai layanan existing yang mendukung template).
// Logic chatbot hanya memakai antarmuka ini, bukan implementasi provider.

async function postMeta(config, payload) {
  const { phoneNumberId, accessToken, graphVersion } = config.meta;
  let response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
        signal: AbortSignal.timeout(15000)
      }
    );
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('Meta WhatsApp Cloud API melewati batas waktu.');
    throw new Error('Meta WhatsApp Cloud API tidak dapat dihubungi.');
  }
  let result = null;
  try { result = await response.json(); } catch { /* respons tanpa JSON */ }
  if (!response.ok) {
    const detail = typeof result?.error?.message === 'string' ? result.error.message.replaceAll(accessToken, '[redacted]').slice(0, 200) : `HTTP ${response.status}`;
    throw new Error(`Meta WhatsApp Cloud API menolak pesan: ${detail}`);
  }
  return result;
}

function buildMetaPayload(phone, reply) {
  if (reply.list) {
    return {
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: reply.text.slice(0, 1024) },
        action: {
          button: reply.list.button.slice(0, 20),
          sections: [{ title: reply.list.title.slice(0, 24), rows: reply.list.rows.slice(0, 10).map(row => ({ id: row.id, title: row.title.slice(0, 24) })) }]
        }
      }
    };
  }
  if (reply.buttons?.length && reply.text.length <= 1024) {
    return {
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: reply.text },
        action: { buttons: reply.buttons.slice(0, 3).map(button => ({ type: 'reply', reply: { id: button.id, title: button.title.slice(0, 20) } })) }
      }
    };
  }
  return { to: phone, type: 'text', text: { preview_url: false, body: reply.text.slice(0, 4000) } };
}

export function createProvider(config) {
  if (config.provider === 'twilio') {
    return {
      name: 'twilio',
      supportsInteractive: false,
      async sendReply(phone, reply) {
        if (!isValidPhone(phone)) throw new Error('Nomor tujuan tidak valid.');
        // Twilio sandbox tidak mendukung tombol; fallback ke teks yang sudah memuat perintah.
        await sendTwilioWhatsAppMessage({ phone, message: reply.text.slice(0, 1500) });
      },
      async sendNotification(phone, message) {
        await sendTwilioWhatsAppMessage({ phone, message: message.slice(0, 1500) });
      }
    };
  }
  if (config.provider === 'fonnte') {
    return {
      name: 'fonnte',
      supportsInteractive: false,
      async sendReply(phone, reply) {
        if (!isValidPhone(phone)) throw new Error('Nomor tujuan tidak valid.');
        await sendFonnteMessage(config.fonnte, phone, reply.text.slice(0, 4000));
      },
      async sendNotification(phone, message) {
        await sendFonnteMessage(config.fonnte, phone, message.slice(0, 4000));
      }
    };
  }
  return {
    name: 'meta',
    supportsInteractive: true,
    async sendReply(phone, reply) {
      if (!isValidPhone(phone)) throw new Error('Nomor tujuan tidak valid.');
      try {
        await postMeta(config, buildMetaPayload(phone, reply));
      } catch (error) {
        // Komponen interaktif ditolak (mis. di luar kebijakan): coba lagi sebagai teks biasa.
        if (!reply.list && !reply.buttons) throw error;
        await postMeta(config, { to: phone, type: 'text', text: { preview_url: false, body: reply.text.slice(0, 4000) } });
      }
    },
    async sendNotification(phone, message) {
      await sendWhatsAppMessage({ phone, message });
    }
  };
}
