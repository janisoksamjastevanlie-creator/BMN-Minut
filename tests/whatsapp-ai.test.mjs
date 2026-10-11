import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntentClassifier } from '../whatsapp/ai.mjs';
import { createChatbot } from '../whatsapp/chatbot.mjs';
import { getWhatsAppConfig } from '../whatsapp/config.mjs';
import { createTools } from '../whatsapp/tools.mjs';

test('Groq is selected when explicitly configured or when only its key is present', async () => {
  const explicit = getWhatsAppConfig({
    WHATSAPP_AI_PROVIDER: 'groq',
    GROQ_API_KEY: 'test-groq-key'
  });
  assert.equal(explicit.aiProvider, 'groq');
  assert.equal(explicit.aiConfigured, true);

  const automatic = getWhatsAppConfig({ GROQ_API_KEY: 'test-groq-key' });
  assert.equal(automatic.aiProvider, 'groq');
  assert.equal(automatic.aiConfigured, true);

  const disabled = getWhatsAppConfig({ WHATSAPP_AI_PROVIDER: 'groq' });
  assert.equal(disabled.aiProvider, 'groq');
  assert.equal(disabled.aiConfigured, false);

  let called = false;
  const classify = createIntentClassifier(disabled, {
    fetchImpl: async () => { called = true; },
    onError: () => assert.fail('provider should not be called without a key')
  });
  assert.equal(await classify('status aset'), null);
  assert.equal(called, false);
});

test('Groq classifier uses JSON mode and returns only sanitized intent fields', async () => {
  const config = getWhatsAppConfig({
    WHATSAPP_AI_PROVIDER: 'groq',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'test-model'
  });
  let request;
  const errors = [];
  const classify = createIntentClassifier(config, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          intent: 'SEARCH_ASSET',
          nama: 'Laptop BMN',
          nup: 12,
          sql: 'DROP TABLE assets'
        }) } }]
      }), { status: 200 });
    },
    onError: event => errors.push(event)
  });

  const result = await classify('Tolong cari laptop BMN NUP 12');
  const body = JSON.parse(request.options.body);

  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer test-groq-key');
  assert.equal(body.model, 'test-model');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.match(body.messages[1].content, /Tolong cari laptop BMN NUP 12/);
  assert.deepEqual(result, { intent: 'SEARCH_ASSET', filter: { nama: 'Laptop BMN', nup: 12 } });
  assert.deepEqual(errors, []);
});

test('Groq API failures fall back without logging credentials, messages, or provider response bodies', async () => {
  const config = getWhatsAppConfig({
    WHATSAPP_AI_PROVIDER: 'groq',
    GROQ_API_KEY: 'never-log-this-key'
  });
  const errors = [];
  const classify = createIntentClassifier(config, {
    fetchImpl: async () => new Response('private provider response', { status: 401 }),
    onError: event => errors.push(event)
  });

  assert.equal(await classify('private user message'), null);
  assert.deepEqual(errors, [{ provider: 'groq', reason: 'http', status: 401 }]);
  assert.equal(JSON.stringify(errors).includes('never-log-this-key'), false);
  assert.equal(JSON.stringify(errors).includes('private'), false);
});

test('Gemini remains available when selected and its key is configured', async () => {
  const config = getWhatsAppConfig({
    WHATSAPP_AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'test-gemini-key',
    WHATSAPP_AI_MODEL: 'test-gemini-model'
  });
  let request;
  const classify = createIntentClassifier(config, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"intent":"DASHBOARD"}' }] } }]
      }), { status: 200 });
    },
    onError: () => assert.fail('unexpected provider error')
  });

  assert.deepEqual(await classify('ringkasan aset'), { intent: 'DASHBOARD', filter: {} });
  assert.match(request.url, /models\/test-gemini-model:generateContent$/);
  assert.equal(request.options.headers['x-goog-api-key'], 'test-gemini-key');
});

test('AI intent answers from permission-checked application collections', async () => {
  const collections = {
    assets: [{
      namaBarang: 'Laptop Operasional',
      kodeBarang: '3.10.01.02.001',
      nup: 12,
      merkType: 'ThinkPad',
      ruanganNama: 'Seksi Keuangan',
      gedung: 'Kantor Utama',
      kondisi: 'Baik',
      status: 'Aktif'
    }]
  };
  const user = { id: 'user-1', name: 'Pengguna', role: 'Operator' };
  const tools = createTools({
    getCollection: key => collections[key] || [],
    userHasPermission: (_user, permission) => permission === 'viewAssets'
  });
  const chatbot = createChatbot({
    config: {},
    store: {
      getAccountByPhone: async () => ({ user_id: user.id }),
      getSession: async () => null
    },
    tools,
    resolveUser: async () => ({ user }),
    classifyIntent: async () => ({
      intent: 'SEARCH_ASSET',
      filter: { nama: 'Laptop Operasional' }
    }),
    appUrl: 'http://localhost:3000'
  });

  const result = await chatbot.handle({ phone: '6281234567890', text: 'Tolong temukan laptop operasional' });
  assert.equal(result.intent, 'SEARCH_ASSET');
  assert.match(result.reply.text, /Laptop Operasional/);
  assert.match(result.reply.text, /3\.10\.01\.02\.001/);
});
