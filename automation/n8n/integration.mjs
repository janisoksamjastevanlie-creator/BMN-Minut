import crypto from 'node:crypto';

const REQUEST_EVENT_TYPES = new Map([
  ['Diajukan', 'request.submitted'],
  ['Diverifikasi', 'request.verified'],
  ['Disetujui', 'request.approved'],
  ['Ditolak', 'request.rejected'],
  ['Diproses', 'request.processing'],
  ['Selesai', 'request.completed'],
  ['Dibatalkan', 'request.cancelled']
]);

function makeEventId(requestId, eventType, previousStatus, status, revision) {
  const hash = crypto.createHash('sha256')
    .update(`${requestId}\0${eventType}\0${previousStatus || ''}\0${status}\0${revision}`)
    .digest()
    .subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createRequestEvent({ requestId, eventType, previousStatus, status, revision, occurredAt }) {
  return {
    eventId: makeEventId(requestId, eventType, previousStatus, status, revision),
    schemaVersion: 1,
    eventType,
    occurredAt: occurredAt.toISOString(),
    data: {
      requestId,
      status,
      previousStatus: previousStatus || null
    }
  };
}

export function buildRequestEvents({
  previousRequests,
  nextRequests,
  previousAuditLogs = [],
  nextAuditLogs = [],
  revision,
  occurredAt = new Date()
}) {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new TypeError('revision must be a positive safe integer');
  }
  const canDetectNewRequests = Array.isArray(previousRequests);
  const previousById = new Map((Array.isArray(previousRequests) ? previousRequests : []).map(item => [item.id, item]));
  const nextById = new Map((Array.isArray(nextRequests) ? nextRequests : []).map(item => [item.id, item]));
  const events = [];

  for (const request of nextById.values()) {
    const previous = previousById.get(request.id);
    if (canDetectNewRequests && !previous && request.status === 'Diajukan') {
      events.push(createRequestEvent({
        requestId: request.id,
        eventType: REQUEST_EVENT_TYPES.get(request.status),
        previousStatus: null,
        status: request.status,
        revision,
        occurredAt
      }));
      continue;
    }
    if (previous && previous.status !== request.status && REQUEST_EVENT_TYPES.has(request.status)) {
      events.push(createRequestEvent({
        requestId: request.id,
        eventType: REQUEST_EVENT_TYPES.get(request.status),
        previousStatus: previous.status,
        status: request.status,
        revision,
        occurredAt
      }));
    }
  }

  const previousAuditIds = new Set((Array.isArray(previousAuditLogs) ? previousAuditLogs : []).map(log => log.id));
  const cancellations = new Set(
    (Array.isArray(nextAuditLogs) ? nextAuditLogs : [])
      .filter(log => !previousAuditIds.has(log.id) &&
        log.aktivitas === 'Pembatalan Permohonan Barang' &&
        typeof log.detail === 'string')
      .map(log => {
        const match = /^Permohonan (.+) dibatalkan\. Alasan: /.exec(log.detail);
        return match?.[1];
      })
      .filter(Boolean)
  );
  for (const request of previousById.values()) {
    if (!nextById.has(request.id) && cancellations.has(request.id)) {
      events.push(createRequestEvent({
        requestId: request.id,
        eventType: 'request.cancelled',
        previousStatus: request.status,
        status: 'Dibatalkan',
        revision,
        occurredAt
      }));
    }
  }

  return events;
}

function getConfiguration(env) {
  const enabledSetting = env.N8N_ENABLED?.trim().toLowerCase();
  if (!enabledSetting || enabledSetting === 'false') {
    return { enabled: false, configurationError: null };
  }
  if (enabledSetting !== 'true') {
    return { enabled: false, configurationError: 'N8N configuration is incomplete or invalid.' };
  }

  const rawBaseUrl = env.N8N_BASE_URL?.trim();
  const rawWebhookPath = env.N8N_WEBHOOK_PATH?.trim();
  const secret = env.N8N_WEBHOOK_SECRET;
  const allowedHosts = (env.N8N_ALLOWED_HOSTS || '')
    .split(',')
    .map(hostname => hostname.trim().toLowerCase())
    .filter(Boolean);
  const timeoutMs = Number(env.N8N_TIMEOUT_MS || 10000);

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    return { enabled: false, configurationError: 'N8N configuration is incomplete or invalid.' };
  }
  const host = baseUrl.hostname.toLowerCase();
  const validHost = /^[a-z0-9.-]+$/.test(host) &&
    !host.includes('..') &&
    !host.endsWith('.local') &&
    !host.endsWith('.internal') &&
    host !== 'localhost' &&
    !host.endsWith('.localhost') &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) &&
    allowedHosts.includes(host);
  const webhookPath = rawWebhookPath || '';
  const validPath = /^\/[A-Za-z0-9/_-]+$/.test(webhookPath) &&
    !webhookPath.startsWith('//') &&
    !webhookPath.split('/').some(segment => segment === '.' || segment === '..');

  if (baseUrl.protocol !== 'https:' ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.port && baseUrl.port !== '443' ||
      baseUrl.pathname !== '/' ||
      baseUrl.search ||
      baseUrl.hash ||
      !validHost ||
      !validPath ||
      typeof secret !== 'string' ||
      secret.length < 32 ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1000 ||
      timeoutMs > 60000) {
    return { enabled: false, configurationError: 'N8N configuration is incomplete or invalid.' };
  }

  return {
    enabled: true,
    configurationError: null,
    baseUrl: baseUrl.origin,
    webhookPath,
    secret,
    timeoutMs
  };
}

export function createN8nIntegration(env = process.env, fetchImpl = globalThis.fetch) {
  const config = getConfiguration(env);
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required');
  }

  return {
    enabled: config.enabled,
    configurationError: config.configurationError,
    async publish(event) {
      if (!config.enabled) return { delivered: false, reason: config.configurationError || 'disabled' };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl(new URL(config.webhookPath, config.baseUrl), {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            'x-bmn-webhook-secret': config.secret,
            'x-bmn-timestamp': String(Math.floor(Date.now() / 1000))
          },
          body: JSON.stringify(event)
        });
        if (!response.ok) return { delivered: false, reason: 'N8N_HTTP_ERROR' };

        let result;
        try {
          result = await response.json();
        } catch {
          return { delivered: false, reason: 'N8N_INVALID_RESPONSE' };
        }
        if (result?.accepted !== true || result?.eventId !== event.eventId) {
          return { delivered: false, reason: 'N8N_INVALID_RESPONSE' };
        }
        return { delivered: true };
      } catch (error) {
        return {
          delivered: false,
          reason: error?.name === 'AbortError' ? 'N8N_TIMEOUT' : 'N8N_REQUEST_FAILED'
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
