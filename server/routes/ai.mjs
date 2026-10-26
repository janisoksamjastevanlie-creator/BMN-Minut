// Rute AI chat (web chat internal) dengan pembatasan laju per pengguna.
import { WEB_CHAT_ERRORS } from '../../ai/webchat.mjs';

export function registerAiRoutes(app, context) {
  const {
    requireUser,
    asyncRoute,
    webChat,
    webChatHits
  } = context;

  app.post('/api/ai/chat', requireUser, asyncRoute(async (request, response) => {
    const now = Date.now();
    const recent = (webChatHits.get(request.user.id) || []).filter(time => now - time < 60000);
    if (recent.length >= 15) {
      return response.status(429).json({ error: 'Terlalu banyak pertanyaan dalam waktu singkat. Tunggu sebentar lalu coba lagi.' });
    }
    recent.push(now);
    webChatHits.set(request.user.id, recent);

    const result = await webChat.answer(request.user, request.body?.messages);
    if (result.reply) return response.json({ reply: result.reply });
    const [status, message] = WEB_CHAT_ERRORS[result.error] || WEB_CHAT_ERRORS.upstream;
    return response.status(status).json({ error: message, code: result.error });
  }));
}
