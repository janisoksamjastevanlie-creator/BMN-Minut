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

export function createStateHelpers({ db, dataBackend }) {
  const collectionCache = Object.fromEntries(collections.map(key => [key, null]));

  async function readCollections(executor = db) {
    if (dataBackend === 'operational') return readOperationalState(executor);
    const state = Object.fromEntries(collections.map(key => [key, null]));
    const rows = await queryRows(executor, 'SELECT `key`, value_json FROM app_data');
    for (const row of rows) {
      if (Object.hasOwn(state, row.key)) state[row.key] = JSON.parse(row.value_json);
    }
    return state;
  }

  async function refreshCollections(executor = db) {
    const state = dataBackend === 'operational'
      ? await readOperationalState(executor)
      : await readCollections(executor);
    Object.assign(collectionCache, state);
  }

  function getCollection(key) {
    return collectionCache[key] ?? null;
  }

  function userHasPermission(user, permission, source = collectionCache) {
    if (user.role === 'Administrator') return true;
    const roles = source.roles || [];
    const role = roles.find(item => item.name?.toLowerCase() === String(user.role).toLowerCase());
    return Boolean(role?.permissions?.[permission]);
  }

  function stateForUser(source, user) {
    const state = JSON.parse(JSON.stringify(source));
    if (userHasPermission(user, 'manageInventory', source)) return state;
    for (const item of state.inventoryItems || []) {
      delete item.hargaSatuan;
      delete item.totalNilai;
    }
    for (const transaction of state.stockInList || []) {
      delete transaction.hargaSatuan;
      delete transaction.totalHarga;
    }
    for (const document of state.documents || []) {
      delete document.totalNilaiNota;
      for (const item of document.items || []) {
        delete item.hargaSatuan;
        delete item.totalHarga;
        delete item.subtotal;
      }
    }
    return state;
  }

  return { collectionCache, readCollections, refreshCollections, getCollection, userHasPermission, stateForUser };
}
