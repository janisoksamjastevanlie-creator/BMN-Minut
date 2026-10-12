import { formatter, MENU_ITEMS } from './formatter.mjs';
import { extractLinkCode } from './store.mjs';
import { normalizeQuery as normalize, parseInventoryQuery, parseAssetQuery, parseDocumentQuery, parseMaintenanceQuery } from './tools.mjs';
import { sanitizeIntent } from './ai.mjs';

export { parseAssetQuery } from './tools.mjs';

const MAX_TEXT = 500;

const CONTEXT_INTENTS = new Set([
  'MY_REQUESTS', 'SEARCH_REQUESTS', 'INVENTORY_TRANSACTIONS',
  'INVENTORY_STATUS', 'SEARCH_INVENTORY', 'SEARCH_ASSET', 'COUNT_ASSET', 'MAINTENANCE_STATUS'
]);

const hasCriteria = filter => Object.keys(filter).length > 0;

export function createChatbot({ config, store, tools, resolveUser, classifyIntent, appUrl }) {
  function menuIntent(textValue, interactiveId) {
    const id = interactiveId || normalize(textValue).replace(/^[/!.]/, '');
    const byNumber = MENU_ITEMS.find(item => String(item.number) === id);
    if (byNumber) return byNumber.id;
    const direct = MENU_ITEMS.find(item => item.id === id);
    if (direct) return direct.id;
    const aliases = {
      menu: 'menu', mulai: 'menu', start: 'menu', halo: 'menu', hai: 'menu', hi: 'menu', p: 'menu',
      aset: 'data_bmn', bmn: 'data_bmn', 'data bmn': 'data_bmn', databmn: 'data_bmn',
      'cari bmn': 'cari', 'cari aset': 'cari', cari: 'cari',
      status: 'status_aset', 'status aset': 'status_aset',
      'mutasi aset': 'mutasi', stok: 'stok', persediaan: 'stok', barang: 'stok',
      pemeliharaan: 'MAINTENANCE_STATUS', perawatan: 'MAINTENANCE_STATUS', servis: 'MAINTENANCE_STATUS',
      notif: 'notifikasi', notifikasi: 'notifikasi', akun: 'akun', 'akun saya': 'akun',
      bantuan: 'bantuan', help: 'bantuan',
      permohonan: 'permohonan', 'permohonan saya': 'permohonan', 'status permohonan': 'permohonan'
    };
    return aliases[id] || null;
  }

  async function run(intent, user, filter = {}) {
    let data;
    switch (intent) {
      case 'dashboard':
      case 'DASHBOARD':
        data = tools.getDashboard(user);
        return data.denied ? formatter.denied() : formatter.dashboard(data);
      case 'data_bmn':
        data = tools.getDashboard(user);
        return data.denied ? formatter.denied() : formatter.dataBmn(data);
      case 'status_aset':
      case 'ASSET_STATUS':
        data = tools.getAssetStatus(user);
        return data.denied ? formatter.denied() : formatter.assetStatus(data);
      case 'mutasi':
      case 'MUTATION_STATUS':
        data = tools.getMutationStatus(user);
        return data.denied ? formatter.denied() : formatter.mutations(data);
      case 'MAINTENANCE_STATUS':
        data = tools.getMaintenanceStatus(user, filter);
        if (data.unavailable) return { text: data.unavailable };
        return data.denied ? formatter.denied() : formatter.maintenance(data);
      case 'stok':
      case 'INVENTORY_STATUS':
        data = tools.getInventoryStatus(user);
        return data.denied ? formatter.denied() : formatter.inventory(data);
      case 'SEARCH_INVENTORY':
        data = tools.searchInventory(user, filter);
        if (data.unavailable) return { text: data.unavailable };
        return data.denied ? formatter.denied() : formatter.inventorySearch(data);
      case 'permohonan':
      case 'MY_REQUESTS':
        data = tools.getMyRequests(user, await store.listOwnedRequestIds(user.id), filter);
        if (data.unavailable) return { text: data.unavailable };
        return data.denied ? formatter.denied() : formatter.myRequests(data);
      case 'SEARCH_REQUESTS':
        data = tools.getMyRequests(user, await store.listOwnedRequestIds(user.id), filter,
          tools.canReadAllRequests(user));
        if (data.unavailable) return { text: data.unavailable };
        return data.denied ? formatter.denied() : formatter.myRequests(data);
      case 'INVENTORY_TRANSACTIONS':
        data = tools.getInventoryTransactions(user, filter);
        if (data.unavailable) return { text: data.unavailable };
        return data.denied ? formatter.denied() : formatter.inventoryTransactions(data);
      case 'USER_DIRECTORY':
        data = tools.searchUsers(user, filter);
        return data.denied ? formatter.denied() : formatter.users(data);
      case 'REQUEST_PROCEDURE':
        return formatter.requestProcedure();
      case 'laporan':
      case 'REPORT_STATUS':
        data = tools.getReportStatus(user);
        return data.denied ? formatter.denied() : formatter.reports(data);
      case 'notifikasi':
      case 'PENDING_ACTIONS':
        return formatter.pending(tools.getPendingActions(user), appUrl);
      case 'COUNT_ASSET':
        data = tools.getAssetCount(user, filter);
        return data.denied ? formatter.denied() : formatter.assetCount(data);
      case 'SEARCH_ASSET':
        data = filter.nup !== undefined && !filter.nama && !filter.lokasi && !filter.kondisi
          ? tools.getAssetByNup(user, filter.nup, filter.kodeBarang)
          : tools.searchAsset(user, filter);
        return data.denied ? formatter.denied() : formatter.searchResults(data, appUrl);
      case 'bantuan':
      case 'HELP':
        return formatter.help();
      case 'menu':
      case 'MENU':
        return formatter.menu();
      default:
        return formatter.unknown();
    }
  }

  // Mengembalikan { reply, intent, userId } untuk satu pesan masuk yang sudah lolos validasi webhook.
  async function handle({ phone, text, interactiveId }) {
    const input = String(text || '').trim().slice(0, MAX_TEXT);

    const linkCode = extractLinkCode(input);
    if (linkCode) {
      const result = await store.redeemLinkToken(linkCode, phone);
      if (!result.ok) {
        return { reply: result.reason === 'phone_in_use' ? formatter.linkPhoneInUse() : formatter.linkInvalid(), intent: 'LINK_ACCOUNT' };
      }
      const linkedUser = await resolveUser(result.userId);
      return { reply: linkedUser.user ? formatter.linked(linkedUser.user) : formatter.linkInvalid(), intent: 'LINK_ACCOUNT', userId: result.userId };
    }

    const asksProcedure = /\b(cara|prosedur|bagaimana)\b.*\b(ajukan|mengajukan|permohonan)\b/.test(normalize(input));
    const asksHelp = (/\b(?:cara|panduan|bagaimana|bantuan)\b/.test(normalize(input)) &&
      /\b(?:menu|fitur|aplikasi|login|riwayat|transaksi)\b/.test(normalize(input))) ||
      /\bapa itu (?:bmn|aset|persediaan)\b/.test(normalize(input));
    const account = await store.getAccountByPhone(phone);
    if (!account) {
      return asksProcedure
        ? { reply: formatter.requestProcedure(), intent: 'REQUEST_PROCEDURE' }
        : asksHelp ? { reply: formatter.help(), intent: 'HELP' }
        : { reply: formatter.notLinked(), intent: 'NOT_LINKED' };
    }

    const resolved = await resolveUser(account.user_id);
    if (!resolved.user) return { reply: formatter.accountInactive(), intent: 'INACTIVE', userId: account.user_id };
    const user = resolved.user;
    const base = { userId: user.id };
    const lower = normalize(input).replace(/^[/!]/, '');

    if (!input && !interactiveId) return { ...base, reply: formatter.unsupported(), intent: 'UNSUPPORTED' };

    if (/^(putuskan|unlink|lepas)( whatsapp)?$/.test(lower)) {
      await store.unlink(user.id);
      await store.clearSession(phone);
      return { ...base, reply: formatter.unlinked(), intent: 'UNLINK' };
    }
    const notify = lower.match(/^notif(?:ikasi)? (on|off|aktif|nonaktif|mati)$/);
    if (notify) {
      const enabled = ['on', 'aktif'].includes(notify[1]);
      await store.setNotify(user.id, enabled);
      return { ...base, reply: formatter.notifyChanged(enabled), intent: 'NOTIFY_PREFERENCE' };
    }
    if (lower === 'batal') {
      await store.clearSession(phone);
      return { ...base, reply: formatter.searchCancelled(), intent: 'CANCEL' };
    }

    const session = await store.getSession(phone);
    const menu = menuIntent(input, interactiveId);
    async function answer(intent, filter = {}) {
      const reply = await run(intent, user, filter);
      let context;
      if (CONTEXT_INTENTS.has(intent) && !filter.unsupported) {
        const safe = sanitizeIntent({ ...filter, intent });
        if (safe.intent !== 'UNKNOWN') {
          context = { userId: user.id, intent: safe.intent, filter: safe.filter };
        }
      }
      if (context) await store.setSession(phone, 'read_context', context);
      else if (session?.state === 'read_context') await store.clearSession(phone);
      return { ...base, reply, intent };
    }

    if (menu === 'cari' || /^cari( bmn| aset)?$/.test(lower)) {
      await store.setSession(phone, 'awaiting_search');
      return { ...base, reply: formatter.searchPrompt(), intent: 'SEARCH_PROMPT' };
    }

    if (menu === 'akun') {
      return { ...base, reply: formatter.account(tools.getAccount(user), account), intent: 'account' };
    }

    if (menu) {
      await store.clearSession(phone);
      return answer(menu === 'permohonan' ? 'MY_REQUESTS' : menu === 'stok' ? 'INVENTORY_STATUS' : menu);
    }

    if (asksProcedure) {
      return answer('REQUEST_PROCEDURE');
    }

    if (asksHelp) {
      return answer('HELP');
    }

    if (/\b(?:pengguna|administrator|petugas yang berwenang)\b/.test(lower) &&
      !/\b(?:permohonan|aset|transaksi|pemeliharaan|stok)\b/.test(lower)) {
      const role = lower.match(/\b(administrator|pengelola bmn|operator|pimpinan)\b/)?.[1];
      return answer('USER_DIRECTORY', role ? { role } : {});
    }

    if (session?.state === 'read_context' && session.context?.userId === user.id &&
      CONTEXT_INTENTS.has(session.context.intent) &&
      /^(?:yang\b|nomor\b|no[.: ]|kalau\b|bagaimana dengan\b|bagaimana statusnya\b|statusnya\b|itu\b)/.test(lower) &&
      !/\b(?:permohonan|pemeliharaan|perawatan|servis|transaksi|riwayat|stok|persediaan|aset|bmn)\b/.test(lower)) {
      const previous = sanitizeIntent({ ...session.context.filter, intent: session.context.intent });
      if (previous.intent !== 'UNKNOWN') {
        if (/^(?:bagaimana statusnya|statusnya|itu)[?.! ]*$/.test(lower)) return answer(previous.intent, previous.filter);
        const filter = previous.intent === 'MAINTENANCE_STATUS' ? parseMaintenanceQuery(input)
          : ['MY_REQUESTS', 'SEARCH_REQUESTS', 'INVENTORY_TRANSACTIONS'].includes(previous.intent)
          ? parseDocumentQuery(input) : parseAssetQuery(input);
        if (['SEARCH_INVENTORY', 'INVENTORY_STATUS'].includes(previous.intent)) {
          const next = parseInventoryQuery(input);
          const prior = { ...previous.filter };
          if (/^(?:kalau|bagaimana dengan)\b/.test(lower) && next.nama) delete prior.nama;
          return answer('SEARCH_INVENTORY', { ...prior, ...next });
        }
        if (['SEARCH_ASSET', 'COUNT_ASSET'].includes(previous.intent) &&
          /^(?:kalau|bagaimana dengan)\b/.test(lower) && filter.nama) {
          const { nama, nup, kodeBarang, ...prior } = previous.filter;
          return answer(previous.intent, { ...prior, ...filter });
        }
        if (/^(?:kalau|bagaimana dengan)\b/.test(lower) && !hasCriteria(filter)) return answer('HELP');
        return answer(previous.intent, { ...previous.filter, ...filter });
      }
    }

    if (/\bpermohonan\b/.test(lower)) {
      const intent = /\bsaya\b/.test(lower) ? 'MY_REQUESTS' : 'SEARCH_REQUESTS';
      return answer(intent, parseDocumentQuery(input));
    }

    if (/\b(?:pemeliharaan|perawatan|servis)\b/.test(lower)) {
      return answer('MAINTENANCE_STATUS', parseMaintenanceQuery(input));
    }

    if (/\b(transaksi|riwayat)\b/.test(lower) && /\b(persediaan|barang|masuk|keluar)\b/.test(lower)) {
      return answer('INVENTORY_TRANSACTIONS', parseDocumentQuery(input));
    }

    if (/\b(stok|stock|persediaan)\b/.test(lower)) {
      const filter = parseInventoryQuery(input);
      if (hasCriteria(filter)) {
        return answer('SEARCH_INVENTORY', filter);
      }
      return answer('INVENTORY_STATUS');
    }

    if (session?.state === 'awaiting_search') {
      await store.clearSession(phone);
      const filter = parseAssetQuery(input);
      if (!hasCriteria(filter)) return { ...base, reply: formatter.searchPrompt(), intent: 'SEARCH_PROMPT' };
      return answer('SEARCH_ASSET', filter);
    }

    if (/^(cari|carikan|search)\b/.test(lower) || /\bnup\s*\d/.test(lower)) {
      const filter = parseAssetQuery(input);
      if (!hasCriteria(filter)) {
        await store.setSession(phone, 'awaiting_search');
        return { ...base, reply: formatter.searchPrompt(), intent: 'SEARCH_PROMPT' };
      }
      return answer('SEARCH_ASSET', filter);
    }

    if (/\b(berapa|jumlah|total)\b/.test(lower) && /\b(aset|bmn|barang)\b/.test(lower)) {
      return answer('COUNT_ASSET', parseAssetQuery(input));
    }

    if (/\b(aset|bmn)\b/.test(lower)) {
      return answer('SEARCH_ASSET', parseAssetQuery(input));
    }

    const ai = await classifyIntent(input);
    if (ai && ai.intent !== 'UNKNOWN') {
      return answer(ai.intent, ai.filter || {});
    }
    if (session?.state === 'read_context') await store.clearSession(phone);
    return { ...base, reply: formatter.unknown(), intent: 'UNKNOWN' };
  }

  return { handle };
}
