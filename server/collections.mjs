import { readOperationalState } from '../operationalStore.mjs';
import { queryRows } from './db.mjs';

export const permissionsByCollection = {
  rooms: ['manageAssets', 'systemSettings'],
  assets: ['manageAssets'],
  inventoryItems: ['manageInventory'],
  stockInList: ['manageInventory'],
  stockOutList: ['manageInventory'],
  requests: ['requestSupplies', 'approveRequests'],
  opnames: ['stockOpname'],
  movements: ['manageMovements'],
  maintenances: ['manageMaintenance'],
  disposals: ['manageDisposal'],
  documents: ['manageAssets', 'manageInventory', 'systemSettings'],
  users: null,
  roles: null,
  auditLogs: ['systemSettings'],
  notifications: null
};
export const collections = Object.keys(permissionsByCollection);

export function createStateHelpers({ db, dataBackend, cacheTtlMs } = {}) {
  const collectionCache = Object.fromEntries(collections.map((key) => [key, null]));
  const ttlMs = Number.isFinite(Number(cacheTtlMs))
    ? Math.min(15000, Math.max(0, Math.round(Number(cacheTtlMs))))
    : 2000;
  const cacheStats = { refreshes: 0, coalesced: 0, ttlSkips: 0, lastRefreshMs: 0, refreshedAt: 0 };
  let inFlightRefresh = null;

  async function readCollections(executor = db) {
    if (dataBackend === 'operational') return readOperationalState(executor);
    const state = Object.fromEntries(collections.map((key) => [key, null]));
    const rows = await queryRows(executor, 'SELECT `key`, value_json FROM app_data');
    for (const row of rows) {
      if (Object.hasOwn(state, row.key)) state[row.key] = JSON.parse(row.value_json);
    }
    return state;
  }

  async function loadCollectionsIntoCache(executor) {
    const startedAt = Date.now();
    try {
      const state =
        dataBackend === 'operational'
          ? await readOperationalState(executor)
          : await readCollections(executor);
      Object.assign(collectionCache, state);
      return state;
    } finally {
      cacheStats.refreshes += 1;
      cacheStats.refreshedAt = Date.now();
      cacheStats.lastRefreshMs = Date.now() - startedAt;
      if (cacheStats.lastRefreshMs >= 250) {
        console.warn(
          `[performance] state_cache_refresh backend=${dataBackend} duration_ms=${cacheStats.lastRefreshMs}`
        );
      }
    }
  }

  // Pemanggil rutin (middleware autentikasi) memakai TTL + penggandaan permintaan
  // serentak: satu halaman yang menembak banyak endpoint cukup membaca seluruh
  // basis data sekali, bukan sekali per permintaan. Setelah aplikasi menulis data,
  // pemanggil memakai force agar cache langsung mencerminkan hasil tulis tersebut.
  async function refreshCollections(executor = db, { force = false } = {}) {
    if (!force) {
      if (ttlMs > 0 && cacheStats.refreshedAt && Date.now() - cacheStats.refreshedAt < ttlMs) {
        cacheStats.ttlSkips += 1;
        return collectionCache;
      }
      if (inFlightRefresh) {
        cacheStats.coalesced += 1;
        return inFlightRefresh;
      }
    }
    const run = loadCollectionsIntoCache(executor).finally(() => {
      if (inFlightRefresh === run) inFlightRefresh = null;
    });
    if (!force) inFlightRefresh = run;
    return run;
  }

  function markCollectionsFresh(state) {
    Object.assign(collectionCache, state);
    cacheStats.refreshedAt = Date.now();
  }

  function getCollection(key) {
    return collectionCache[key] ?? null;
  }

  function userHasPermission(user, permission, source = collectionCache) {
    if (user.role === 'Administrator') return true;
    const roles = source.roles || [];
    const role = roles.find((item) => item.name?.toLowerCase() === String(user.role).toLowerCase());
    return Boolean(role?.permissions?.[permission]);
  }

  function withoutFields(entries, fields) {
    if (!Array.isArray(entries)) return entries;
    return entries.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const copy = { ...entry };
      for (const field of fields) delete copy[field];
      return copy;
    });
  }

  // Salin hanya koleksi yang memuat data finansial. Deep clone JSON penuh
  // (JSON.parse(JSON.stringify(...))) memblokir event loop seukuran seluruh state
  // dan menjadi sumber utama server tampak tidak merespon saat data membesar.
  function stateForUser(source, user) {
    if (userHasPermission(user, 'manageInventory', source)) return source;
    const state = { ...source };
    state.inventoryItems = withoutFields(source.inventoryItems, ['hargaSatuan', 'totalNilai']);
    state.stockInList = withoutFields(source.stockInList, ['hargaSatuan', 'totalHarga']);
    state.documents = Array.isArray(source.documents)
      ? source.documents.map((document) => {
          if (!document || typeof document !== 'object') return document;
          const copy = { ...document };
          delete copy.totalNilaiNota;
          if (Array.isArray(document.items)) {
            copy.items = withoutFields(document.items, ['hargaSatuan', 'totalHarga', 'subtotal']);
          }
          return copy;
        })
      : source.documents;
    return state;
  }

  return {
    collectionCache,
    readCollections,
    refreshCollections,
    markCollectionsFresh,
    getCollection,
    userHasPermission,
    stateForUser,
    cacheStats: () => ({
      ttl_ms: ttlMs,
      refreshes: cacheStats.refreshes,
      coalesced: cacheStats.coalesced,
      ttl_skips: cacheStats.ttlSkips,
      last_refresh_ms: cacheStats.lastRefreshMs,
      age_ms: cacheStats.refreshedAt ? Date.now() - cacheStats.refreshedAt : null
    })
  };
}
