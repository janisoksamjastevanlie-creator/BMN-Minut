import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeChangedCollections,
  getChangedCollections,
  getChangedUserProfiles,
  resolveRequestUser,
  restoreRestrictedFinancialData
} from '../stateAuthorization.mjs';

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

test('changed collection detection ignores object key order', () => {
  const current = {
    rooms: [{ id: 'room-1', name: 'Ruang A', floor: 1 }],
    requests: [{ id: 'request-1', status: 'Diajukan' }]
  };
  const next = {
    rooms: [{ floor: 1, name: 'Ruang A', id: 'room-1' }],
    requests: [{ id: 'request-1', status: 'Diverifikasi' }]
  };

  assert.deepEqual(getChangedCollections(current, next, ['rooms', 'requests']), ['requests']);
});

test('only new or changed user profiles need account synchronization', () => {
  const previous = [
    { id: 'user-1', name: 'Operator', role: 'Operator', phone: undefined },
    { id: 'user-2', name: 'Pemohon', role: 'User' }
  ];
  const next = [
    { id: 'user-1', name: 'Operator', role: 'Operator' },
    { id: 'user-2', name: 'Pemohon', role: 'Administrator' },
    { id: 'user-3', name: 'Gudang', role: 'Pengelola BMN' }
  ];

  assert.deepEqual(
    getChangedUserProfiles(previous, next).map(user => user.id),
    ['user-2', 'user-3']
  );
});

test('request authentication uses the current user profile from the transaction state', () => {
  const resolved = resolveRequestUser(
    { name: 'Old Name', role: 'Old Role' },
    'user-1',
    [{ id: 'user-1', name: 'Current Name', role: 'Operator', email: 'operator@example.gov' }],
    { email: 'operator@example.gov' },
    true
  );

  assert.equal(resolved.error, null);
  assert.deepEqual(resolved.user, {
    name: 'Current Name',
    role: 'Operator',
    id: 'user-1',
    email: 'operator@example.gov'
  });
});

test('request authentication rejects deleted and inactive users', () => {
  assert.equal(resolveRequestUser({}, 'missing', [], null, false).error,
    'Akun tidak lagi terdaftar di sistem.');
  assert.equal(resolveRequestUser({ statusAktif: false }, 'user-1', null, null, false).error,
    'Akun dinonaktifkan.');
  assert.equal(resolveRequestUser({}, 'user-1', [{ id: 'user-1', statusAktif: false }], null, false).error,
    'Akun dinonaktifkan.');
});

test('request authentication fails closed for an ambiguous Access email', () => {
  const users = [
    { id: 'user-1', email: 'operator@example.gov' },
    { id: 'user-2', email: 'operator@example.gov' }
  ];
  const resolved = resolveRequestUser(
    { id: 'user-1', email: 'operator@example.gov' },
    'user-1',
    users,
    { email: 'operator@example.gov' },
    true
  );

  assert.equal(resolved.user, null);
  assert.equal(resolved.error, 'Identitas Cloudflare Access tidak cocok dengan akun aplikasi.');
});

test('legacy initialization can resolve a session profile before users are stored', () => {
  const resolved = resolveRequestUser(
    { role: 'Administrator' },
    'admin-1',
    null,
    null,
    false
  );

  assert.equal(resolved.error, null);
  assert.deepEqual(resolved.user, { role: 'Administrator', id: 'admin-1' });
});
