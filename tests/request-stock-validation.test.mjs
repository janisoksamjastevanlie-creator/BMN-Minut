import assert from 'node:assert/strict';
import test from 'node:test';
import { getRequestableStock, searchInventoryItems, validateNewRequestStock } from '../requestStockValidation.mjs';

const item = (id, stock) => ({ id, nama: `Barang ${id}`, satuan: 'Buah', stokSaatIni: stock });
const request = (id, itemId, quantity, status = 'Diajukan') => ({
  id,
  nomorPermintaan: id,
  status,
  itemId,
  namaBarang: `Barang ${itemId}`,
  jumlahDiminta: quantity,
  satuan: 'Buah'
});
const state = (items, requests = []) => ({ inventoryItems: items, requests });
const validate = (before, after) => validateNewRequestStock(before, after);

test('rejects a request for an item with zero stock', () => {
  assert.match(validate(
    state([item('item-1', 0)]),
    state([item('item-1', 0)], [request('req-1', 'item-1', 1)])
  ), /stok tersedia 0 Buah/);
});

test('rejects quantity above available stock and accepts equal quantity', () => {
  const before = state([item('item-1', 5)]);
  assert.match(validate(before, state(before.inventoryItems, [request('req-1', 'item-1', 6)])), /Stok tersedia: 5 Buah/);
  assert.equal(validate(before, state(before.inventoryItems, [request('req-1', 'item-1', 5)])), null);
});

test('accepts a request below available stock', () => {
  const before = state([item('item-1', 5)]);
  assert.equal(validate(before, state(before.inventoryItems, [request('req-1', 'item-1', 3)])), null);
});

test('uses the latest server stock when the request is submitted', () => {
  const latestServerState = state([item('item-1', 2)]);
  assert.match(
    validate(latestServerState, state([item('item-1', 5)], [request('req-1', 'item-1', 3)])),
    /Stok tersedia: 2 Buah/
  );
});

test('rejects the whole multi-item request if any item is short', () => {
  const before = state([item('item-1', 5), item('item-2', 0)]);
  const submitted = request('req-1', 'item-1', 3);
  submitted.items = [
    { itemId: 'item-1', jumlahDiminta: 3 },
    { itemId: 'item-2', jumlahDiminta: 1 }
  ];
  assert.match(validate(before, state(before.inventoryItems, [submitted])), /Barang item-2 ditolak karena stok tersedia 0 Buah/);
});

test('serially validates simultaneous requests against existing active commitments', () => {
  const before = state([item('item-1', 5)], [request('existing', 'item-1', 3)]);
  assert.match(validate(before, state(before.inventoryItems, [
    ...before.requests,
    request('new', 'item-1', 3)
  ])), /Stok tersedia: 2 Buah/);
  assert.equal(validate(before, state(before.inventoryItems, [
    ...before.requests,
    request('new', 'item-1', 2)
  ])), null);
});

test('aggregates multiple new requests for the same item', () => {
  const before = state([item('item-1', 5)]);
  assert.match(validate(before, state(before.inventoryItems, [
    request('new-1', 'item-1', 3),
    request('new-2', 'item-1', 3)
  ])), /Stok tersedia: 5 Buah/);
});

test('available request stock updates when physical stock or active requests change', () => {
  assert.equal(getRequestableStock('item-1', [item('item-1', 5)], [request('req-1', 'item-1', 2)]), 3);
  assert.equal(getRequestableStock('item-1', [item('item-1', 2)], [request('req-1', 'item-1', 2)]), 0);
});

test('closed requests no longer reserve stock and initialization is unaffected', () => {
  assert.equal(getRequestableStock('item-1', [item('item-1', 5)], [request('old', 'item-1', 5, 'Ditolak')]), 5);
  assert.equal(validateNewRequestStock({ requests: null }, state([item('item-1', 0)], [])), null);
});

test('searches inventory by partial name or item code and reports no unmatched rows', () => {
  const inventory = [
    { ...item('item-1', 5), nama: 'Kertas HVS A4', kodeBarang: 'ATK-001' },
    { ...item('item-2', 0), nama: 'Pulpen Biru', kodeBarang: 'ATK-002' }
  ];
  assert.deepEqual(searchInventoryItems(inventory, 'hvs'), [inventory[0]]);
  assert.deepEqual(searchInventoryItems(inventory, 'atk-002'), [inventory[1]]);
  assert.deepEqual(searchInventoryItems(inventory, 'tidak ada'), []);
});
