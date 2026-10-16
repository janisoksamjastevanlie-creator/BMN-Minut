import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeChangedCollections } from '../stateAuthorization.mjs';

const permissionsByCollection = {
  inventoryItems: ['manageInventory'],
  requests: ['requestSupplies'],
  users: null,
  roles: null,
  auditLogs: ['systemSettings'],
  notifications: null
};

function authorize(user, state, current) {
  return authorizeChangedCollections({
    user,
    state,
    current,
    permissionsByCollection,
    userHasPermission: (candidate, permission, source) => Boolean(
      source.roles.find(role => role.name === candidate.role)?.permissions[permission]
    )
  });
}

test('role without inventory permission can sync restored restricted fields despite key order', () => {
  const user = { id: 'staff-1', role: 'Staff' };
  const current = {
    inventoryItems: [{ id: 'item-1', hargaSatuan: 100, totalNilai: 200, nama: 'Kertas', stokSaatIni: 2 }],
    requests: [{ id: 'request-1', status: 'Menunggu' }],
    users: [],
    roles: [{ name: 'Staff', permissions: { requestSupplies: true } }],
    auditLogs: [],
    notifications: []
  };
  const state = {
    ...current,
    inventoryItems: [{
      id: 'item-1',
      nama: 'Kertas',
      stokSaatIni: 2,
      hargaSatuan: 100,
      totalNilai: 200
    }],
    requests: [{ id: 'request-1', status: 'Disetujui' }]
  };

  assert.equal(authorize(user, state, current), true);
});

test('role without inventory permission cannot change inventory values', () => {
  const user = { id: 'staff-1', role: 'Staff' };
  const current = {
    inventoryItems: [{ id: 'item-1', nama: 'Kertas', stokSaatIni: 2, hargaSatuan: 100 }],
    requests: [],
    users: [],
    roles: [{ name: 'Staff', permissions: { requestSupplies: true } }],
    auditLogs: [],
    notifications: []
  };
  const state = {
    ...current,
    inventoryItems: [{ ...current.inventoryItems[0], stokSaatIni: 3 }]
  };

  assert.equal(authorize(user, state, current), false);
});
