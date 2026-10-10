const PLACEHOLDER = /^(MY_|REPLACE_|YOUR_)/i;

function clean(value) {
  const text = String(value ?? '').trim();
  return text && !PLACEHOLDER.test(text) ? text : '';
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

// Dibaca saat dipanggil agar nilai .env yang dimuat dotenv selalu terpakai.
export function getWhatsAppConfig(env = process.env) {
  const provider = clean(env.WHATSAPP_PROVIDER).toLowerCase() || 'meta';
  const fonnteApiUrl = clean(env.FONNTE_API_URL) || 'https://api.fonnte.com/send';
  let validFonnteApiUrl = false;
  try {
    const url = new URL(fonnteApiUrl);
    validFonnteApiUrl = url.protocol === 'https:' &&
      url.hostname === 'api.fonnte.com' &&
      url.pathname === '/send' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;
  } catch {
    validFonnteApiUrl = false;
  }
  const meta = {
    phoneNumberId: clean(env.WHATSAPP_PHONE_NUMBER_ID),
    accessToken: clean(env.WHATSAPP_ACCESS_TOKEN),
    appSecret: clean(env.WHATSAPP_APP_SECRET),
    verifyToken: clean(env.WHATSAPP_VERIFY_TOKEN),
    graphVersion: clean(env.WHATSAPP_GRAPH_API_VERSION) || 'v23.0',
    testRecipient: clean(env.WHATSAPP_RECIPIENT_NUMBER).replace(/\D/g, '')
  };
  const twilio = {
    accountSid: clean(env.TWILIO_ACCOUNT_SID),
    apiKeySid: clean(env.TWILIO_API_KEY) || clean(env.TWILIO_API_KEY_SID),
    apiKeySecret: clean(env.TWILIO_API_KEY_SECRET),
    authToken: clean(env.TWILIO_AUTH_TOKEN),
    from: clean(env.TWILIO_WHATSAPP_FROM)
  };
  const fonnte = {
    token: clean(env.FONNTE_TOKEN),
    apiUrl: fonnteApiUrl,
    webhookSecret: clean(env.FONNTE_WEBHOOK_SECRET)
  };
  const outboundConfigured = provider === 'meta'
    ? Boolean(meta.phoneNumberId && meta.accessToken)
    : provider === 'twilio'
      ? Boolean(twilio.accountSid && twilio.apiKeySid && twilio.apiKeySecret && twilio.from)
      : Boolean(fonnte.token && validFonnteApiUrl);
  const inboundConfigured = provider === 'meta'
    ? Boolean(meta.appSecret && meta.verifyToken)
    : provider === 'twilio'
      ? Boolean(twilio.authToken)
      : fonnte.webhookSecret.length >= 32;

  return {
    provider,
    validProvider: ['meta', 'twilio', 'fonnte'].includes(provider),
    meta,
    twilio,
    fonnte,
    validFonnteApiUrl,
    outboundConfigured,
    inboundConfigured,
    webhookUrl: clean(env.WHATSAPP_WEBHOOK_URL),
    botNumber: clean(env.WHATSAPP_BOT_NUMBER).replace(/\D/g, ''),
    appBaseUrl: (clean(env.APP_PUBLIC_URL) || `http://127.0.0.1:${env.PORT || 3000}`).replace(/\/+$/, ''),
    rateLimitMax: positiveInt(env.WHATSAPP_RATE_LIMIT_MAX, 15),
    rateLimitWindowMs: positiveInt(env.WHATSAPP_RATE_LIMIT_WINDOW_SECONDS, 60) * 1000,
    geminiApiKey: clean(env.GEMINI_API_KEY),
    geminiModel: clean(env.WHATSAPP_AI_MODEL) || 'gemini-2.5-flash',
    aiEnabled: clean(env.WHATSAPP_AI_ENABLED).toLowerCase() !== 'false',
    remindersEnabled: clean(env.WHATSAPP_REMINDERS_ENABLED).toLowerCase() !== 'false',
    reminderHour: Math.min(Math.max(positiveInt(env.WHATSAPP_REMINDER_HOUR, 8), 0), 23),
    maxMessageAgeMs: 15 * 60 * 1000
  };
}
