// Diagnostik runtime untuk gejala "server tidak merespon".
// Modul ini menyediakan pemantau event loop, pembacaan statistik pool MySQL,
// batas waktu permintaan, pembatas antrian pekerjaan berat, dan pencatatan
// kegagalan fatal supaya penyebab gangguan bisa dilihat dari log, bukan ditebak.

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

function describeError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 400);
  return String(error).slice(0, 400);
}

function requestLabel(request) {
  const url = String(request.originalUrl || request.url || '');
  return `${request.method} ${url.split('?')[0].slice(0, 90)}`;
}

// mysql2 menyimpan isi pool sebagai RingQueue (bukan Array) yang menyediakan
// length maupun size(). Pembacaan ini read-only dan diberi penjaga supaya kegagalan
// mengambil statistik tidak pernah mengganggu permintaan biasa.
function queueLength(collection) {
  if (!collection) return null;
  if (typeof collection.length === 'number') return collection.length;
  if (typeof collection.size === 'function') {
    const size = collection.size();
    return Number.isFinite(size) ? size : null;
  }
  return null;
}

export function getDatabasePoolStats(pool, { connectionLimit = null, queueLimit = null } = {}) {
  const inner = pool?.pool;
  const all = queueLength(inner?._allConnections);
  const idle = queueLength(inner?._freeConnections);
  const queued = queueLength(inner?._connectionQueue);
  return {
    connectionLimit: Number.isInteger(connectionLimit) ? connectionLimit : null,
    queueLimit: Number.isInteger(queueLimit) ? queueLimit : null,
    total: all,
    idle,
    busy: all !== null && idle !== null ? Math.max(0, all - idle) : null,
    queued
  };
}

export function isPoolQueueLimitError(error) {
  const message = String(error?.message || '');
  return (
    message.includes('Queue limit reached') ||
    error?.code === 'ER_POOL_QUEUE_LIMIT' ||
    message.includes('Pool queue limit reached')
  );
}

export function attachPoolErrorHandler(pool, { onEvent } = {}) {
  if (typeof pool?.on !== 'function') return () => {};
  const handler = (error) => {
    // Error koneksi pool datang tanpa permintaan yang menunggu; kalau tidak
    // dicatat, koneksi mati akan tampak sebagai server yang diam.
    const summary = describeError(error);
    console.error(`[diagnostic] pool_error ${summary}`);
    if (onEvent) onEvent(summary);
  };
  pool.on('error', handler);
  return () => {
    if (typeof pool.off === 'function') pool.off('error', handler);
  };
}

export function createEventLoopLagMonitor({ intervalMs, thresholdMs } = {}) {
  const sampleIntervalMs = clampInteger(intervalMs, 1000, 200, 10000);
  const breachThresholdMs = clampInteger(thresholdMs, 250, 50, 10000);
  const state = { lagMs: 0, maxLagMs: 0, breaches: 0, lastBreach: null };
  let expectedAt = Date.now() + sampleIntervalMs;
  const timer = setInterval(() => {
    const now = Date.now();
    const lagMs = Math.max(0, now - expectedAt);
    expectedAt = now + sampleIntervalMs;
    state.lagMs = lagMs;
    if (lagMs > state.maxLagMs) state.maxLagMs = lagMs;
    if (lagMs >= breachThresholdMs) {
      state.breaches += 1;
      state.lastBreach = { at: new Date(now).toISOString(), lagMs: Math.round(lagMs) };
      console.warn(
        `[diagnostic] event_loop_lag lag_ms=${Math.round(lagMs)} threshold_ms=${breachThresholdMs}`
      );
    }
  }, sampleIntervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return {
    stats: () => ({
      sampleIntervalMs,
      thresholdMs: breachThresholdMs,
      ...state,
      lagMs: Math.round(state.lagMs),
      maxLagMs: Math.round(state.maxLagMs)
    }),
    stop: () => clearInterval(timer)
  };
}

export function createRequestDeadlineMiddleware({ defaultTimeoutMs, overrides = [] } = {}) {
  const baseTimeoutMs = clampInteger(defaultTimeoutMs, 30000, 1000, 600000);
  return function requestDeadline(request, response, next) {
    const override = overrides.find((entry) => entry.match(request));
    const timeoutMs = clampInteger(override?.timeoutMs ?? baseTimeoutMs, baseTimeoutMs, 1000, 600000);
    const startedAt = Date.now();
    const label = requestLabel(request);
    let finished = false;
    const stop = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      response.removeListener('finish', stop);
      response.removeListener('close', stop);
    };
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (response.headersSent) return;
      const elapsedMs = Date.now() - startedAt;
      console.warn(
        `[diagnostic] request_timeout endpoint=${label} elapsed_ms=${elapsedMs} timeout_ms=${timeoutMs}`
      );
      response.status(504).json({
        error:
          'Server sedang terlalu sibuk untuk menyelesaikan permintaan ini. Data Anda belum pasti tersimpan; silakan coba lagi.',
        code: 'REQUEST_TIMEOUT'
      });
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    response.once('finish', stop);
    response.once('close', stop);
    next();
  };
}

// Pembatas pekerjaan berat: permintaan yang memegang transaksi penuh tidak
// boleh mengantri tanpa batas di dalam pool, kalau tidak seluruh API ikut macet.
export function createConcurrencyLimiter({ name, limit, maxPending } = {}) {
  const activeLimit = clampInteger(limit, 3, 1, 100);
  const pendingLimit = clampInteger(maxPending, 20, 0, 1000);
  const state = { active: 0, pending: 0, rejected: 0, queued: 0, maxActive: 0 };
  const waiting = [];

  function release(response) {
    if (response?.locals?.[`${name}Released`]) return;
    if (response) response.locals[`${name}Released`] = true;
    state.active = Math.max(0, state.active - 1);
    const nextHandler = waiting.shift();
    state.pending = waiting.length;
    if (nextHandler) {
      state.active += 1;
      if (state.active > state.maxActive) state.maxActive = state.active;
      nextHandler();
    }
  }

  return Object.assign(
    function concurrencyLimiter(request, response, next) {
      if (state.active >= activeLimit) {
        if (waiting.length >= pendingLimit) {
          state.rejected += 1;
          console.warn(
            `[diagnostic] limiter_rejected name=${name} active=${state.active} pending=${waiting.length}`
          );
          return response.status(503).set('Retry-After', '5').json({
            error:
              'Terlalu banyak perubahan yang sedang disimpan bersamaan. Silakan tunggu beberapa detik lalu ulangi.',
            code: 'SERVER_BUSY'
          });
        }
        state.queued += 1;
        waiting.push(() => {
          let released = false;
          const guard = () => {
            if (released) return;
            released = true;
            release(response);
          };
          response.once('finish', guard);
          response.once('close', guard);
          next();
        });
        state.pending = waiting.length;
        return undefined;
      }
      state.active += 1;
      if (state.active > state.maxActive) state.maxActive = state.active;
      let released = false;
      const guard = () => {
        if (released) return;
        released = true;
        release(response);
      };
      response.once('finish', guard);
      response.once('close', guard);
      return next();
    },
    { stats: () => ({ name, limit: activeLimit, maxPending: pendingLimit, ...state }) }
  );
}

export function installCrashGuards({ onFatal, shouldExitImmediately } = {}) {
  const counters = { unhandledRejections: 0, uncaughtExceptions: 0, lastFatal: null };
  process.on('unhandledRejection', (reason) => {
    counters.unhandledRejections += 1;
    counters.lastFatal = {
      type: 'unhandledRejection',
      at: new Date().toISOString(),
      detail: describeError(reason)
    };
    console.error(`[diagnostic] unhandled_rejection ${describeError(reason)}`);
    // Sebelum server sempat mendengarkan port, penolakan janji berarti proses ini
    // tidak akan pernah melayani permintaan: hentikan segera supaya supervisor
    // memuat ulang dan penyebabnya tetap terbaca di log.
    if (shouldExitImmediately?.()) {
      console.error('[diagnostic] kegagalan terjadi sebelum server siap; proses dihentikan.');
      process.exit(1);
    }
  });
  process.on('uncaughtException', (error) => {
    counters.uncaughtExceptions += 1;
    counters.lastFatal = {
      type: 'uncaughtException',
      at: new Date().toISOString(),
      detail: describeError(error)
    };
    console.error(`[diagnostic] uncaught_exception ${describeError(error)}`);
    // Proses yang rusak jangan dibiarkan menggantung; catat lalu tutup rapi supaya
    // supervisor (pm2) segera menyalakan ulang dengan kondisi bersih.
    if (onFatal) onFatal(error);
    else process.exit(1);
  });
  return counters;
}

export function createSlowRequestRecorder({ thresholdMs, keep = 20 } = {}) {
  const breachThresholdMs = clampInteger(thresholdMs, 2000, 250, 120000);
  const entries = [];
  const counters = new Map();
  return {
    middleware: function recordSlowRequest(request, response, next) {
      const startedAt = Date.now();
      const label = requestLabel(request);
      response.once('finish', () => {
        const durationMs = Date.now() - startedAt;
        if (durationMs < breachThresholdMs) return;
        console.warn(
          `[diagnostic] slow_request endpoint=${label} status=${response.statusCode} duration_ms=${durationMs} threshold_ms=${breachThresholdMs}`
        );
        counters.set(label, (counters.get(label) || 0) + 1);
        // Label memakai path mentah, jadi endpoint ber-ID (mis. /api/documents/42) bisa
        // menumpuk tanpa batas. Penghitung dipangkas ke label tersering agar diagnostik
        // tidak justru menjadi sumber kebocoran memori.
        if (counters.size > 100) {
          const kept = [...counters.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50);
          counters.clear();
          for (const [entryLabel, count] of kept) counters.set(entryLabel, count);
        }
        entries.unshift({
          endpoint: label,
          status: response.statusCode,
          duration_ms: durationMs,
          at: new Date().toISOString()
        });
        if (entries.length > clampInteger(keep, 20, 1, 200)) entries.length = clampInteger(keep, 20, 1, 200);
      });
      next();
    },
    stats: () => ({
      threshold_ms: breachThresholdMs,
      recent: entries.slice(0, 10),
      totals: [...counters.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([endpoint, count]) => ({ endpoint, count }))
    })
  };
}
