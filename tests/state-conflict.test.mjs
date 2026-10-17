import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeStateAfterConflict } from '../stateConflict.mjs';

test('merges local stock-in deletion with a remote edit to another collection', () => {
  const base = {
    stockInList: [{ id: 'sin-1' }, { id: 'sin-2' }],
    inventoryItems: [{ id: 'item-1', stokSaatIni: 5 }],
    users: [{ id: 'user-1', name: 'Before' }]
  };
  const local = {
    ...base,
    stockInList: [{ id: 'sin-2' }],
    inventoryItems: [{ id: 'item-1', stokSaatIni: 4 }]
  };
  const remote = {
    ...base,
    users: [{ id: 'user-1', name: 'Updated remotely' }]
  };

  const { mergedState, conflicts } = mergeStateAfterConflict(base, local, remote);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(mergedState.stockInList, [{ id: 'sin-2' }]);
  assert.deepEqual(mergedState.inventoryItems, [{ id: 'item-1', stokSaatIni: 4 }]);
  assert.deepEqual(mergedState.users, remote.users);
});

test('reports a conflict when the same transaction changed remotely', () => {
  const base = { stockInList: [{ id: 'sin-1', status: 'Menunggu Pemeriksaan' }] };
  const local = { stockInList: [] };
  const remote = { stockInList: [{ id: 'sin-1', status: 'Diverifikasi' }] };

  const { conflicts } = mergeStateAfterConflict(base, local, remote);
  assert.deepEqual(conflicts, ['stockInList (sin-1)']);
});

test('treats an identical remote deletion as already applied', () => {
  const base = { stockInList: [{ id: 'sin-1' }] };
  const local = { stockInList: [] };
  const remote = { stockInList: [] };

  const { mergedState, conflicts } = mergeStateAfterConflict(base, local, remote);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(mergedState.stockInList, []);
});

test('reports conflicts for collections without stable IDs when both sides changed', () => {
  const base = { data: [{ value: 1 }] };
  const local = { data: [{ value: 2 }] };
  const remote = { data: [{ value: 3 }] };

  const { conflicts } = mergeStateAfterConflict(base, local, remote);
  assert.deepEqual(conflicts, ['data']);
});

test('rebases later local changes without reverting the canonical saved request', () => {
  const submitted = {
    requests: [{ id: 'req-1', status: 'Menunggu Konfirmasi', penerimaan: { diserahkanPada: 'client-time' } }],
    notifications: []
  };
  const local = { ...submitted, notifications: [{ id: 'new-notification' }] };
  const saved = {
    ...submitted,
    requests: [{ id: 'req-1', status: 'Menunggu Konfirmasi', penerimaan: { diserahkanPada: 'server-time' } }]
  };
  const result = mergeStateAfterConflict(submitted, local, saved);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.mergedState.requests, saved.requests);
  assert.deepEqual(result.mergedState.notifications, local.notifications);
});

test('retains the next workflow status queued while a prior save completes', () => {
  const submitted = { requests: [{ id: 'req-1', status: 'Diverifikasi' }] };
  const local = { requests: [{ id: 'req-1', status: 'Disetujui' }] };
  const result = mergeStateAfterConflict(submitted, local, structuredClone(submitted));
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.mergedState.requests[0].status, 'Disetujui');
});

test('applies a confirmed staged request without treating the unchanged visible status as a rollback', () => {
  const visible = {
    requests: [{ id: 'req-1', status: 'Diverifikasi' }],
    notifications: [],
    inventoryItems: [{ id: 'item-1', stokSaatIni: 5 }]
  };
  const saved = {
    ...visible,
    requests: [{ id: 'req-1', status: 'Disetujui' }],
    notifications: [{ id: 'success-notification' }]
  };
  const current = {
    ...visible,
    inventoryItems: [{ id: 'item-1', stokSaatIni: 6 }]
  };
  const result = mergeStateAfterConflict(visible, current, saved);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.mergedState.requests, saved.requests);
  assert.deepEqual(result.mergedState.notifications, saved.notifications);
  assert.deepEqual(result.mergedState.inventoryItems, current.inventoryItems);
});
