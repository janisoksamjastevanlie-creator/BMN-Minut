import { formatter, MENU_ITEMS } from './formatter.mjs';
import { extractLinkCode } from './store.mjs';

const MAX_TEXT = 500;

const normalize = value => String(value || '').toLocaleLowerCase('id-ID').replace(/\s+/g, ' ').trim();

export function parseAssetQuery(input) {
  let rest = ` ${normalize(input)} `;
  const filter = {};
  const nup = rest.match(/\bnup\s*[:.]?\s*(\d{1,7})\b/);
  if (nup) { filter.nup = Number(nup[1]); rest = rest.replace(nup[0], ' '); }
  const code = rest.match(/\b\d+(?:\.\d+){2,}\b/);
  if (code) { filter.kodeBarang = code[0]; rest = rest.replace(code[0], ' '); }
  for (const [pattern, value] of [[/\brusak berat\b/, 'Rusak Berat'], [/\brusak ringan\b/, 'Rusak Ringan'], [/\bkondisi baik\b|\bbaik\b/, 'Baik'], [/\brusak\b/, 'Rusak']]) {
    if (pattern.test(rest)) { filter.kondisi = value; rest = rest.replace(pattern, ' '); break; }
  }
  const location = rest.match(/\b(?:lokasi|ruang(?:an)?|di)\s+([a-z0-9 ]{2,40})$/);
  if (location) { filter.lokasi = location[1].trim(); rest = rest.replace(location[0], ' '); }
  const name = rest
    .replace(/\b(cari|carikan|tampilkan|lihat|bmn|aset|barang|data|tolong|dong|berapa|jumlah|total|yang|dengan|kondisi|status)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (name) filter.nama = name.slice(0, 60);
  return filter;
}

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
      notif: 'notifikasi', notifikasi: 'notifikasi', akun: 'akun', 'akun saya': 'akun',
      bantuan: 'bantuan', help: 'bantuan'
    };
    return aliases[id] || null;
  }

  function run(intent, user, filter = {}) {
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
      case 'stok':
      case 'INVENTORY_STATUS':
        data = tools.getInventoryStatus(user);
        return data.denied ? formatter.denied() : formatter.inventory(data);
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
      const result = store.redeemLinkToken(linkCode, phone);
      if (!result.ok) {
        return { reply: result.reason === 'phone_in_use' ? formatter.linkPhoneInUse() : formatter.linkInvalid(), intent: 'LINK_ACCOUNT' };
      }
      const linkedUser = resolveUser(result.userId);
      return { reply: linkedUser.user ? formatter.linked(linkedUser.user) : formatter.linkInvalid(), intent: 'LINK_ACCOUNT', userId: result.userId };
    }

    const account = store.getAccountByPhone(phone);
    if (!account) return { reply: formatter.notLinked(), intent: 'NOT_LINKED' };

    const resolved = resolveUser(account.user_id);
    if (!resolved.user) return { reply: formatter.accountInactive(), intent: 'INACTIVE', userId: account.user_id };
    const user = resolved.user;
    const base = { userId: user.id };
    const lower = normalize(input).replace(/^[/!]/, '');

    if (!input && !interactiveId) return { ...base, reply: formatter.unsupported(), intent: 'UNSUPPORTED' };

    if (/^(putuskan|unlink|lepas)( whatsapp)?$/.test(lower)) {
      store.unlink(user.id);
      store.clearSession(phone);
      return { ...base, reply: formatter.unlinked(), intent: 'UNLINK' };
    }
    const notify = lower.match(/^notif(?:ikasi)? (on|off|aktif|nonaktif|mati)$/);
    if (notify) {
      const enabled = ['on', 'aktif'].includes(notify[1]);
      store.setNotify(user.id, enabled);
      return { ...base, reply: formatter.notifyChanged(enabled), intent: 'NOTIFY_PREFERENCE' };
    }
    if (lower === 'batal') {
      store.clearSession(phone);
      return { ...base, reply: formatter.searchCancelled(), intent: 'CANCEL' };
    }

    const session = store.getSession(phone);
    const menu = menuIntent(input, interactiveId);

    if (menu === 'cari' || /^cari( bmn| aset)?$/.test(lower)) {
      store.setSession(phone, 'awaiting_search');
      return { ...base, reply: formatter.searchPrompt(), intent: 'SEARCH_PROMPT' };
    }

    if (menu === 'akun') {
      return { ...base, reply: formatter.account(tools.getAccount(user), account), intent: 'account' };
    }

    if (menu) {
      store.clearSession(phone);
      return { ...base, reply: run(menu, user), intent: menu };
    }

    if (session?.state === 'awaiting_search') {
      store.clearSession(phone);
      const filter = parseAssetQuery(input);
      if (!hasCriteria(filter)) return { ...base, reply: formatter.searchPrompt(), intent: 'SEARCH_PROMPT' };
      return { ...base, reply: run('SEARCH_ASSET', user, filter), intent: 'SEARCH_ASSET' };
    }

    if (/^(cari|carikan|search)\b/.test(lower) || /\bnup\s*\d/.test(lower)) {
      const filter = parseAssetQuery(input);
      if (!hasCriteria(filter)) {
        store.setSession(phone, 'awaiting_search');
        return { ...base, reply: formatter.searchPrompt(), intent: 'SEARCH_PROMPT' };
      }
      return { ...base, reply: run('SEARCH_ASSET', user, filter), intent: 'SEARCH_ASSET' };
    }

    if (/\b(berapa|jumlah|total)\b/.test(lower) && /\b(aset|bmn|barang)\b/.test(lower)) {
      return { ...base, reply: run('COUNT_ASSET', user, parseAssetQuery(input)), intent: 'COUNT_ASSET' };
    }

    const ai = await classifyIntent(input);
    if (ai && ai.intent !== 'UNKNOWN') {
      return { ...base, reply: run(ai.intent, user, ai.filter || {}), intent: ai.intent };
    }
    return { ...base, reply: formatter.unknown(), intent: 'UNKNOWN' };
  }

  return { handle };
}
