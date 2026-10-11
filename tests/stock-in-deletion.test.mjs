import assert from 'node:assert/strict';
import test from 'node:test';
import { planStockInDeletion } from '../stockInDeletion.mjs';

const inventory = [{ id: 'item-1', nama: 'Kertas', stokSaatIni: 10 }];
const transaction = (id, jumlah, status = 'Diverifikasi') => ({
  id,
  nomorTransaksi: `BM-${id}`,
  itemId: 'item-1',
  jumlah,
  satuan: 'Rim',
  status
});

test('deletes a selected stock-in transaction and calculates its stock correction', () => {
  const result = planStockInDeletion(['sin-1'], [transaction('sin-1', 2)], inventory, true);
  assert.deepEqual(result.deletedIds, ['sin-1']);
  assert.equal(result.stockByItem.get('item-1'), 8);
  assert.deepEqual(result.errors, []);
});

test('deletes multiple selected transactions without touching unselected transactions', () => {
  const records = [
    transaction('sin-1', 2),
    transaction('sin-2', 3),
    transaction('sin-3', 1)
  ];
  const result = planStockInDeletion(['sin-1', 'sin-2'], records, inventory, true);
  assert.deepEqual(result.deletedIds, ['sin-1', 'sin-2']);
  assert.deepEqual(records.filter(record => !result.deletedIds.includes(record.id)).map(record => record.id), ['sin-3']);
  assert.equal(result.stockByItem.get('item-1'), 5);
});

test('returns per-ID failures while keeping successful eligible deletions', () => {
  const result = planStockInDeletion(
    ['sin-1', 'missing-id', 'sin-2'],
    [transaction('sin-1', 8), transaction('sin-2', 5)],
    inventory,
    true
  );
  assert.deepEqual(result.deletedIds, ['sin-1']);
  assert.equal(result.stockByItem.get('item-1'), 2);
  assert.deepEqual(result.errors.map(error => error.id), ['missing-id', 'sin-2']);
});

test('does not allow deletion without the existing inventory-management permission', () => {
  const result = planStockInDeletion(['sin-1'], [transaction('sin-1', 2)], inventory, false);
  assert.deepEqual(result.deletedIds, []);
  assert.match(result.errors[0].message, /tidak memiliki izin/i);
});

test('rejects invalid and duplicate IDs and does not remove unrelated transactions', () => {
  const records = [transaction('sin-1', 2), transaction('sin-2', 2, 'Menunggu Pemeriksaan')];
  const result = planStockInDeletion(['', 'sin-1', 'sin-1', 'absent'], records, inventory, true);
  assert.deepEqual(result.deletedIds, ['sin-1']);
  assert.equal(result.stockByItem.get('item-1'), 8);
  assert.deepEqual(result.errors.map(error => error.id), ['', 'sin-1', 'absent']);
});

test('refuses a posted transaction when its stock cannot be corrected', () => {
  const result = planStockInDeletion(['sin-1'], [transaction('sin-1', 12)], inventory, true);
  assert.deepEqual(result.deletedIds, []);
  assert.equal(result.stockByItem.get('item-1'), 10);
  assert.match(result.errors[0].message, /tidak mencukupi/i);
});

test('allows deleting an orphaned historical transaction without changing stock', () => {
  const historical = { ...transaction('sin-old', 5), status: undefined, itemId: 'deleted-item' };
  const result = planStockInDeletion(['sin-old'], [historical], inventory, true);
  assert.deepEqual(result.deletedIds, ['sin-old']);
  assert.deepEqual(result.errors, []);
  assert.equal(result.stockByItem.get('item-1'), 10);
});

test('still refuses a verified transaction whose inventory item is missing', () => {
  const verified = { ...transaction('sin-verified', 5), itemId: 'deleted-item' };
  const result = planStockInDeletion(['sin-verified'], [verified], inventory, true);
  assert.deepEqual(result.deletedIds, []);
  assert.match(result.errors[0].message, /barang persediaan terkait tidak ditemukan/i);
});
