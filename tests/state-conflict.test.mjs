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
