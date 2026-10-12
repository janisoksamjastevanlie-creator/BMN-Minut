const clean = value => String(value ?? '').trim();
const CHAT_WEBHOOK_PATH = '/webhook/bmn-minut/chat';

function validHost(hostname) {
  return /^[a-z0-9.-]+$/.test(hostname) &&
    !hostname.includes('..') &&
    !hostname.endsWith('.local') &&
    !hostname.endsWith('.internal') &&
    hostname !== 'localhost' &&
    !hostname.endsWith('.localhost') &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

export function getWebChatConfig(env = process.env, aiConfig = {}) {
  const provider = clean(env.WEB_CHAT_AI_PROVIDER).toLowerCase() || aiConfig.aiProvider || 'gemini';
  const enabledSetting = clean(env.WEB_CHAT_AI_ENABLED).toLowerCase();
  const enabled = enabledSetting ? enabledSetting === 'true' : aiConfig.aiEnabled !== false;
  const timeoutMs = Number(env.N8N_CHAT_TIMEOUT_MS || 25000);
  const webhookUrl = clean(env.N8N_CHAT_WEBHOOK_URL);
  const secret = env.N8N_CHAT_WEBHOOK_SECRET || '';
  const allowedHosts = clean(env.N8N_ALLOWED_HOSTS).split(',').map(host => host.trim().toLowerCase()).filter(Boolean);

  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    parsedUrl = null;
  }

  const validWebhookUrl = parsedUrl &&
    parsedUrl.protocol === 'https:' &&
    !parsedUrl.username &&
    !parsedUrl.password &&
    (!parsedUrl.port || parsedUrl.port === '443') &&
    parsedUrl.pathname === CHAT_WEBHOOK_PATH &&
    !parsedUrl.search &&
    !parsedUrl.hash &&
    validHost(parsedUrl.hostname.toLowerCase()) &&
    allowedHosts.includes(parsedUrl.hostname.toLowerCase());
  const validN8nConfig = Boolean(
    webhookUrl &&
    validWebhookUrl &&
    typeof secret === 'string' &&
    secret.length >= 32 &&
    Number.isInteger(timeoutMs) &&
    timeoutMs >= 1000 &&
    timeoutMs <= 60000
  );

  return {
    webChatProvider: provider,
    webChatEnabled: enabled,
    n8nChatWebhookUrl: validN8nConfig ? parsedUrl.href : '',
    n8nChatSecret: validN8nConfig ? secret : '',
    n8nChatTimeoutMs: Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 60000 ? timeoutMs : 25000,
    n8nChatConfigured: validN8nConfig,
    n8nChatConfigurationError: provider === 'n8n' && enabled && !validN8nConfig
      ? 'n8n chat configuration is incomplete or invalid.'
      : null
  };
}
