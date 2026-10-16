import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeChangedCollections, restoreRestrictedFinancialData } from '../stateAuthorization.mjs';

const permissionsByCollection = {
  inventoryItems: ['manageInventory'],
  requests: ['requestSupplies'],
  documents: ['manageAssets', 'manageInventory', 'systemSettings'],
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

test('requester can sync a new request when stored documents have no financial fields', () => {
  const user = { id: 'staff-1', role: 'Staff' };
  const current = {
    inventoryItems: [{ id: 'item-1', nama: 'Kertas', hargaSatuan: 100, totalNilai: 200 }],
    requests: [],
    documents: [
      { id: 'doc-1', jenis: 'BAST', judul: 'Berita Acara' },
      { id: 'doc-2', jenis: 'Nota', totalNilaiNota: 5000, items: [{ id: 'n-1', namaBarang: 'Kertas', hargaSatuan: 5000 }] }
    ],
    users: [],
    roles: [{ name: 'Staff', permissions: { requestSupplies: true } }],
    auditLogs: [],
    notifications: []
  };
  const visible = JSON.parse(JSON.stringify(current));
  delete visible.inventoryItems[0].hargaSatuan;
  delete visible.inventoryItems[0].totalNilai;
  delete visible.documents[1].totalNilaiNota;
  delete visible.documents[1].items[0].hargaSatuan;
  const state = { ...visible, requests: [{ id: 'request-1', status: 'Menunggu' }] };

  restoreRestrictedFinancialData(state, current);

  assert.equal(Object.hasOwn(state.documents[0], 'totalNilaiNota'), false);
  assert.equal(Object.hasOwn(state.documents[1].items[0], 'subtotal'), false);
  assert.deepEqual(state.documents, current.documents);
  assert.deepEqual(state.inventoryItems, current.inventoryItems);
  assert.equal(JSON.stringify(state.documents), JSON.stringify(current.documents));
  assert.equal(JSON.stringify(state.inventoryItems), JSON.stringify(current.inventoryItems));
  assert.equal(authorize(user, state, current), true);
});

test('restricted role cannot inject financial fields that are absent in stored data', () => {
  const current = { documents: [{ id: 'doc-1', jenis: 'BAST' }] };
  const state = { documents: [{ id: 'doc-1', jenis: 'BAST', totalNilaiNota: 999 }] };

  restoreRestrictedFinancialData(state, current);

  assert.deepEqual(state.documents, current.documents);
});
