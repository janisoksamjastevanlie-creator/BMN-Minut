import express from 'express';
import { getWhatsAppConfig } from './config.mjs';
import { createProvider } from './client.mjs';
import { createWhatsAppStore } from './store.mjs';
import { createTools } from './tools.mjs';
import { createChatbot } from './chatbot.mjs';
import { createIntentClassifier } from './ai.mjs';
import { formatter } from './formatter.mjs';
import { parseFonnteWebhookMessage } from './fonnte.mjs';
import {
  SlidingWindowLimiter, isValidPhone, maskPhone, normalizePhone, safeEqual,
  verifyMetaSignature, verifyTwilioSignature
} from './security.mjs';

const WEBHOOK_PATH = '/api/whatsapp/webhook';
const TIMEZONE = 'Asia/Makassar';
const asyncHandler = handler => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);

function nowIso() {
  return new Date().toISOString();
}

function localDateAndHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

export async function createWhatsAppService({ db, getCollection, userHasPermission, requireUser, refreshCollections }) {
  const config = getWhatsAppConfig();
  const store = await createWhatsAppStore(db);
  const provider = createProvider(config);
  const tools = createTools({ getCollection, userHasPermission });
  const classifyIntent = createIntentClassifier(config);
  const messageLimiter = new SlidingWindowLimiter({ limit: config.rateLimitMax, windowMs: config.rateLimitWindowMs });
  const requestLimiter = new SlidingWindowLimiter({ limit: 300, windowMs: 60_000 });
  const responseTimes = [];

  async function resolveUser(userId) {
    const [rows] = await db.execute('SELECT profile_json FROM auth_users WHERE id = ?', [userId]);
    const row = rows[0];
    if (!row) return { user: null };
    const profile = JSON.parse(row.profile_json);
    const users = getCollection('users');
    const current = users?.find(item => item.id === userId);
    if (users && !current) return { user: null };
    if (current?.statusAktif === false || profile.statusAktif === false) return { user: null };
    return { user: { ...profile, ...(current || {}), id: userId } };
  }

  const chatbot = createChatbot({ config, store, tools, resolveUser, classifyIntent, appUrl: config.appBaseUrl });

  async function recordSuccess(startedAt) {
    await store.setMeta('whatsapp_last_success_at', nowIso());
    responseTimes.push(Date.now() - startedAt);
    if (responseTimes.length > 50) responseTimes.shift();
  }

  async function recordFailure(error) {
    try {
      await store.setMeta('whatsapp_last_failure_at', nowIso());
      await store.incrementMeta('whatsapp_error_count');
    } catch (storageError) {
      console.error('WhatsApp failure could not be recorded:', String(storageError).slice(0, 200));
    }
    console.error('WhatsApp error:', String(error instanceof Error ? error.message : error).slice(0, 250));
  }

  async function sendReply(phone, reply, context) {
    try {
      await provider.sendReply(phone, reply);
      await store.logMessage({ phone, userId: context.userId, direction: 'out', message: reply.text, intent: context.intent, status: 'sent' });
      return true;
    } catch (error) {
      await store.logMessage({ phone, userId: context.userId, direction: 'out', message: null, intent: context.intent, status: 'failed' });
      await recordFailure(error);
      return false;
    }
  }

  async function notifyRequestEvent({ eventKey, ownerUserId, title, lines }) {
    if (!config.validProvider || !config.outboundConfigured) {
      return { success: false, sentCount: 0, error: 'Integrasi WhatsApp belum dikonfigurasi.' };
    }
    await refreshCollections();
    const message = formatter.notification(title, lines, config.appBaseUrl);
    let sentCount = 0;
    let failedCount = 0;
    for (const account of await store.listAccounts()) {
      if (!account.notify_enabled) continue;
      const { user } = await resolveUser(account.user_id);
      if (!user) continue;
      const isOwner = user.id === ownerUserId;
      const canManageRequests = userHasPermission(user, 'approveRequests') ||
        userHasPermission(user, 'manageInventory');
      if (!isOwner && !canManageRequests) continue;
      if (!await store.claimNotification(eventKey, user.id)) continue;
      try {
        await provider.sendNotification(account.phone, message);
        await store.finishNotification(eventKey, user.id, 'sent');
        await store.logMessage({ phone: account.phone, userId: user.id, direction: 'out', message: title, intent: 'REQUEST_NOTIFICATION', status: 'sent' });
        sentCount += 1;
      } catch (error) {
        await store.finishNotification(eventKey, user.id, 'failed', error instanceof Error ? error.message : 'gagal');
        await store.logMessage({ phone: account.phone, userId: user.id, direction: 'out', message: title, intent: 'REQUEST_NOTIFICATION', status: 'failed' });
        await recordFailure(error);
        failedCount += 1;
      }
    }
    return {
      success: sentCount > 0 && failedCount === 0,
      sentCount,
      error: sentCount === 0 ? 'Tidak ada penerima WhatsApp yang tertaut dan berwenang.' : undefined
    };
  }

  async function processMessage({ messageId, phone, text, interactiveId, timestampMs }) {
    const startedAt = Date.now();
    try {
      await refreshCollections();
      if (!isValidPhone(phone)) return;
      if (timestampMs && (startedAt - timestampMs > config.maxMessageAgeMs || timestampMs - startedAt > 5 * 60_000)) {
        await store.logMessage({ messageId, phone, direction: 'in', message: null, status: 'rejected' });
        return;
      }
      if (!await store.claimMessage(messageId)) return;
      await store.logMessage({ messageId, phone, direction: 'in', message: text || interactiveId, status: 'received' });

      const limit = messageLimiter.hit(normalizePhone(phone));
      if (!limit.allowed) {
        if (limit.first) await sendReply(phone, formatter.rateLimited(), { intent: 'RATE_LIMITED' });
        return;
      }

      const result = await chatbot.handle({ phone, text, interactiveId });
      const sent = await sendReply(phone, result.reply, result);
      if (sent) await recordSuccess(startedAt);
    } catch (error) {
      await recordFailure(error);
      await sendReply(phone, formatter.failure(), { intent: 'ERROR' });
    }
  }

  function parseMetaMessages(payload) {
    const messages = [];
    if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return null;
    for (const entry of payload.entry) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        for (const message of Array.isArray(change?.value?.messages) ? change.value.messages : []) {
          if (typeof message?.id !== 'string' || typeof message?.from !== 'string') continue;
          const item = {
            messageId: message.id,
            phone: normalizePhone(message.from),
            timestampMs: Number(message.timestamp) * 1000 || undefined
          };
          if (message.type === 'text' && typeof message.text?.body === 'string') item.text = message.text.body;
          else if (message.type === 'interactive') {
            item.interactiveId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
          } else item.unsupported = true;
          messages.push(item);
        }
      }
    }
    return messages;
  }

  const webhook = express.Router();
  webhook.use(WEBHOOK_PATH, express.raw({ type: () => true, limit: '256kb' }));

  webhook.get(WEBHOOK_PATH, (request, response) => {
    if (config.provider !== 'meta' || !config.meta.verifyToken) return response.sendStatus(403);
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];
    if (mode === 'subscribe' && typeof token === 'string' && safeEqual(token, config.meta.verifyToken) && typeof challenge === 'string') {
      return response.status(200).type('text/plain').send(challenge.slice(0, 200));
    }
    return response.sendStatus(403);
  });

  webhook.post(WEBHOOK_PATH, (request, response) => {
    if (!requestLimiter.hit(request.ip).allowed) return response.sendStatus(429);
    if (!config.validProvider || !config.inboundConfigured) return response.sendStatus(503);
    const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    let messages;

    if (config.provider === 'fonnte') {
      if (!request.is('application/json')) return response.sendStatus(415);
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); } catch { return response.sendStatus(400); }
      if (typeof payload?.secret !== 'string' || !safeEqual(payload.secret, config.fonnte.webhookSecret)) {
        return response.sendStatus(401);
      }
      const message = parseFonnteWebhookMessage(payload);
      if (!message) return response.sendStatus(400);
      messages = [message];
    } else if (config.provider === 'meta') {
      if (!verifyMetaSignature(raw, request.get('x-hub-signature-256'), config.meta.appSecret)) return response.sendStatus(401);
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); } catch { return response.sendStatus(400); }
      messages = parseMetaMessages(payload);
      if (!messages) return response.sendStatus(400);
    } else if (config.provider === 'twilio') {
      const params = Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
      const proto = request.get('x-forwarded-proto')?.split(',')[0].trim() || request.protocol;
      const url = config.webhookUrl || `${proto}://${request.get('host')}${request.originalUrl}`;
      if (!verifyTwilioSignature(url, params, request.get('x-twilio-signature'), config.twilio.authToken)) return response.sendStatus(401);
      if (typeof params.MessageSid !== 'string' || typeof params.From !== 'string') return response.sendStatus(400);
      messages = [{
        messageId: params.MessageSid,
        phone: normalizePhone(params.From),
        ...(params.NumMedia && params.NumMedia !== '0' ? { unsupported: true } : { text: params.Body || '' })
      }];
    } else {
      return response.sendStatus(503);
    }

    void store.setMeta('whatsapp_last_webhook_at', nowIso()).catch(recordFailure);
    if (config.provider === 'twilio') response.status(200).type('text/xml').send('<Response/>');
    else response.sendStatus(200);

    for (const message of messages) {
      void (message.unsupported
        ? handleUnsupported(message)
        : processMessage(message)).catch(recordFailure);
    }
  });

  async function handleUnsupported(message) {
    await refreshCollections();
    if (!isValidPhone(message.phone) || !await store.claimMessage(message.messageId)) return;
    if (message.timestampMs && (Date.now() - message.timestampMs > config.maxMessageAgeMs || message.timestampMs - Date.now() > 5 * 60_000)) {
      await store.logMessage({ messageId: message.messageId, phone: message.phone, direction: 'in', message: null, status: 'rejected' });
      return;
    }
    await store.logMessage({ messageId: message.messageId, phone: message.phone, direction: 'in', message: null, status: 'received' });
    if (!messageLimiter.hit(normalizePhone(message.phone)).allowed) return;
    await sendReply(message.phone, formatter.unsupported(), { intent: 'UNSUPPORTED' });
  }

  const api = express.Router();

  api.get('/api/whatsapp/me', requireUser, asyncHandler(async (request, response) => {
    const account = await store.getAccountByUser(request.user.id);
    response.json({
      linked: Boolean(account),
      phone: account ? maskPhone(account.phone) : null,
      notifyEnabled: account ? Boolean(account.notify_enabled) : false,
      linkedAt: account?.linked_at ?? null,
      botNumber: config.botNumber || null,
      provider: config.provider,
      available: config.validProvider && config.inboundConfigured && config.outboundConfigured
    });
  }));

  api.post('/api/whatsapp/link-token', requireUser, asyncHandler(async (request, response) => {
    if (!config.validProvider || !config.inboundConfigured || !config.outboundConfigured) {
      return response.status(503).json({ error: 'Integrasi WhatsApp belum dikonfigurasi oleh administrator.' });
    }
    const { code, expiresAt } = await store.createLinkToken(request.user.id);
    response.json({ code, expiresAt, botNumber: config.botNumber || null });
  }));

  api.delete('/api/whatsapp/me', requireUser, asyncHandler(async (request, response) => {
    await store.unlink(request.user.id);
    response.json({ success: true });
  }));

  api.put('/api/whatsapp/me/notifications', requireUser, asyncHandler(async (request, response) => {
    if (typeof request.body?.enabled !== 'boolean') return response.status(400).json({ error: 'Data tidak valid.' });
    if (!await store.getAccountByUser(request.user.id)) return response.status(409).json({ error: 'WhatsApp belum terhubung.' });
    await store.setNotify(request.user.id, request.body.enabled);
    response.json({ success: true });
  }));

  api.get('/api/whatsapp/status', requireUser, asyncHandler(async (request, response) => {
    if (!userHasPermission(request.user, 'systemSettings')) {
      return response.status(403).json({ error: 'Tidak memiliki izin melihat status integrasi.' });
    }
    const stats = await store.stats();
    const lastSuccess = await store.getMeta('whatsapp_last_success_at');
    const lastFailure = await store.getMeta('whatsapp_last_failure_at');
    const configured = config.validProvider && config.inboundConfigured && config.outboundConfigured;
    const healthy = configured && (!lastFailure || (lastSuccess && lastSuccess >= lastFailure));
    response.json({
      provider: config.provider,
      configured,
      connected: Boolean(healthy),
      botStatus: configured ? 'Aktif' : 'Belum dikonfigurasi',
      webhookPath: WEBHOOK_PATH,
      webhookStatus: config.inboundConfigured ? 'Siap menerima' : 'Belum dikonfigurasi',
      botNumber: config.botNumber ? maskPhone(config.botNumber) : null,
      aiEnabled: config.aiEnabled && Boolean(config.geminiApiKey),
      lastWebhookAt: await store.getMeta('whatsapp_last_webhook_at'),
      lastSuccessAt: lastSuccess,
      lastFailureAt: lastFailure,
      errorCount: Number(await store.getMeta('whatsapp_error_count') || 0),
      avgResponseMs: responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null,
      ...stats
    });
  }));

  // Mengirim notifikasi proaktif hanya kepada pengguna yang tertaut, aktif, mengaktifkan notifikasi,
  // dan memiliki salah satu izin terkait. Tidak pernah melempar error.
  async function notify({ eventKey, permissions, title, lines, excludeUserId }) {
    try {
      if (!config.validProvider || !config.outboundConfigured) return;
      await refreshCollections();
      const message = formatter.notification(title, lines, config.appBaseUrl);
      for (const account of await store.listAccounts()) {
        if (!account.notify_enabled || account.user_id === excludeUserId) continue;
        const { user } = await resolveUser(account.user_id);
        if (!user || !permissions.some(permission => userHasPermission(user, permission))) continue;
        if (!await store.claimNotification(eventKey, user.id)) continue;
        try {
          await provider.sendNotification(account.phone, message);
          await store.finishNotification(eventKey, user.id, 'sent');
          await store.logMessage({ phone: account.phone, userId: user.id, direction: 'out', message: title, intent: 'NOTIFICATION', status: 'sent' });
          await store.setMeta('whatsapp_last_success_at', nowIso());
        } catch (error) {
          await store.finishNotification(eventKey, user.id, 'failed', error instanceof Error ? error.message : 'gagal');
          await store.logMessage({ phone: account.phone, userId: user.id, direction: 'out', message: title, intent: 'NOTIFICATION', status: 'failed' });
          await recordFailure(error);
        }
      }
    } catch (error) {
      await recordFailure(error);
    }
  }

  const byId = items => new Map((Array.isArray(items) ? items : []).map(item => [item.id, item]));

  // Dipanggil setelah state tersimpan: mendeteksi kejadian penting dengan membandingkan state lama dan baru.
  function onStateSaved(previous, next, actorId, revision) {
    try {
      const events = [];
      const diff = (key, describe) => {
        if (!Array.isArray(previous[key]) || !Array.isArray(next[key])) return;
        const before = byId(previous[key]);
        for (const item of next[key]) {
          const old = before.get(item.id);
          const event = describe(item, old);
          if (event) events.push(event);
        }
      };

      const newAssets = (next.assets || []).filter(asset => Array.isArray(previous.assets) && !byId(previous.assets).has(asset.id));
      if (newAssets.length > 3) {
        events.push({ eventKey: `assets-new:${revision}`, permissions: ['manageAssets'], title: 'Aset baru ditambahkan', lines: [`${newAssets.length} aset baru telah ditambahkan.`] });
      } else {
        for (const asset of newAssets) {
          events.push({ eventKey: `asset-new:${asset.id}`, permissions: ['manageAssets'], title: 'Aset baru ditambahkan', lines: [`${asset.namaBarang} (NUP ${asset.nup})`, `Lokasi: ${asset.ruanganNama || '-'}`] });
        }
      }
      diff('assets', (asset, old) => old && (old.kondisi !== asset.kondisi || old.status !== asset.status)
        ? { eventKey: `asset-change:${asset.id}:${asset.kondisi}:${asset.status}`, permissions: ['manageAssets'], title: 'Perubahan status aset', lines: [`${asset.namaBarang} (NUP ${asset.nup})`, `Kondisi: ${asset.kondisi}`, `Status: ${asset.status}`] }
        : null);
      diff('movements', (item, old) => !old || old.status !== item.status
        ? { eventKey: `movement:${item.id}:${item.status}`, permissions: ['manageMovements'], title: old ? 'Perubahan status mutasi aset' : 'Pengajuan mutasi aset baru', lines: [`${item.nomorTransaksi} — ${item.assetName}`, `${item.lokasiAsalNama} → ${item.lokasiTujuanNama}`, `Status: ${item.status}`] }
        : null);
      diff('disposals', (item, old) => !old || old.status !== item.status
        ? { eventKey: `disposal:${item.id}:${item.status}`, permissions: ['manageDisposal'], title: old ? 'Perubahan status penghapusan aset' : 'Usulan penghapusan aset baru', lines: [`${item.nomorPengajuan} — ${item.assetName}`, `Status: ${item.status}`] }
        : null);
      diff('maintenances', (item, old) => !old || old.status !== item.status
        ? { eventKey: `maintenance:${item.id}:${item.status}`, permissions: ['manageMaintenance'], title: old ? 'Perubahan status pemeliharaan' : 'Tiket pemeliharaan baru', lines: [`${item.nomorTiket} — ${item.assetName}`, `Status: ${item.status}`] }
        : null);
      diff('inventoryItems', (item, old) => old && old.status !== item.status && (item.status === 'Menipis' || item.status === 'Habis')
        ? { eventKey: `stock:${item.id}:${item.status}:${item.stokSaatIni}`, permissions: ['manageInventory'], title: `Persediaan ${item.status.toLowerCase()}`, lines: [`${item.nama}: ${item.stokSaatIni} ${item.satuan}`] }
        : null);

      for (const event of events.slice(0, 20)) void notify({ ...event, excludeUserId: actorId }).catch(recordFailure);
    } catch (error) {
      recordFailure(error);
    }
  }

  async function sendDailyReminders() {
    await refreshCollections();
    const { date, hour } = localDateAndHour();
    if (hour !== config.reminderHour || await store.getMeta('whatsapp_last_reminder') === date) return;
    await store.setMeta('whatsapp_last_reminder', date);
    for (const account of await store.listAccounts()) {
      if (!account.notify_enabled) continue;
      const { user } = await resolveUser(account.user_id);
      if (!user) continue;
      const pending = tools.getPendingActions(user);
      if (!pending.items.length) continue;
      if (!await store.claimNotification(`reminder:${date}`, user.id)) continue;
      try {
        await provider.sendNotification(account.phone, formatter.reminder(pending.items, config.appBaseUrl));
        await store.finishNotification(`reminder:${date}`, user.id, 'sent');
      } catch (error) {
        await store.finishNotification(`reminder:${date}`, user.id, 'failed', error instanceof Error ? error.message : 'gagal');
        await recordFailure(error);
      }
    }
  }

  async function start() {
    await store.prune();
    if (!config.validProvider) console.warn('WHATSAPP_PROVIDER tidak valid; chatbot WhatsApp dinonaktifkan.');
    else if (!config.inboundConfigured) console.warn('Chatbot WhatsApp belum aktif: webhook secret/verify token belum dikonfigurasi di .env.');
    if (config.remindersEnabled && config.outboundConfigured) {
      const timer = setInterval(() => { void sendDailyReminders().catch(recordFailure); }, 5 * 60_000);
      timer.unref();
    }
    const pruneTimer = setInterval(() => { void store.prune().catch(recordFailure); }, 6 * 3600_000);
    pruneTimer.unref();
  }

  return { webhook, api, onStateSaved, notify, notifyRequestEvent, start, store, config, processMessage, sendDailyReminders };
}
