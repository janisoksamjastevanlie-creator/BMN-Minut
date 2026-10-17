const SLOW_DATABASE_QUERY_MS = 250;
const SLOW_ENDPOINT_MS = 250;

export function logSlowDatabaseQuery(sql, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < SLOW_DATABASE_QUERY_MS) return;
  const operation = /^\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER)\b/i.exec(sql)?.[1]?.toUpperCase() || 'OTHER';
  const table = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+`?([A-Za-z0-9_]+)/i.exec(sql)?.[1] || 'unknown';
  console.warn(`[performance] database_query operation=${operation} table=${table} duration_ms=${Math.round(durationMs)}`);
}

export function performanceTiming(endpoint) {
  return (request, response, next) => {
    const startedAt = Date.now();
    response.once('finish', () => {
      const durationMs = Date.now() - startedAt;
      if (durationMs < SLOW_ENDPOINT_MS && response.statusCode < 400) return;
      const responseBytes = Number(response.getHeader('content-length') || 0);
      console.info(`[performance] endpoint=${endpoint} method=${request.method} status=${response.statusCode} duration_ms=${durationMs} response_bytes=${responseBytes}`);
    });
    next();
  };
}

export function logExternalServiceTiming(provider, startedAt, result) {
  const durationMs = Date.now() - startedAt;
  const outcome = result ? result.success ? 'success' : 'failure' : 'error';
  const sentCount = Number.isSafeInteger(result?.sentCount) ? result.sentCount : 0;
  const failedCount = Number.isSafeInteger(result?.failedCount) ? result.failedCount : 0;
  console.info(`[performance] external_service=whatsapp provider=${provider} outcome=${outcome} duration_ms=${durationMs} sent=${sentCount} failed=${failedCount}`);
}
