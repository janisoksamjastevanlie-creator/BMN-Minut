import assert from 'node:assert/strict';
import test from 'node:test';
import { writeOperationalState } from '../operationalWrites.mjs';

const writableCollections = [
  'rooms', 'assets', 'inventoryItems', 'stockInList', 'stockOutList', 'requests',
  'opnames', 'movements', 'maintenances', 'disposals', 'documents', 'auditLogs',
  'notifications', 'users', 'roles'
];

function state(overrides = {}) {
  return {
    ...Object.fromEntries(writableCollections.map(key => [key, []])),
    stockCardLedger: [],
    ...overrides
  };
}

function createExecutor({ ledger = [], locations = [] } = {}) {
  const statements = [];
  const inventoryCategories = [{ id: 'category-atk', name: 'ATK' }];
  return {
    statements,
    async execute(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('FROM buildings')) return [[], []];
      if (sql.includes('FROM rooms')) return [[], []];
      if (sql.includes('FROM asset_categories')) return [[], []];
      if (sql.includes('FROM inventory_categories')) return [inventoryCategories, []];
      if (sql.includes('FROM inventory_locations')) return [locations, []];
      if (sql.includes('FROM stock_card_ledger')) return [ledger, []];
      if (sql.includes('INSERT INTO `stock_card_ledger`')) {
        const row = {
          id: params[0],
          item_id: params[1],
          tanggal: params[2],
          masuk: params[5],
          keluar: params[6],
          saldo: params[7]
        };
        ledger.push(row);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('UPDATE stock_card_ledger SET saldo')) {
        const row = ledger.find(item => item.id === params[1]);
        if (row) row.saldo = params[0];
        return [{ affectedRows: row ? 1 : 0 }, []];
      }
      return [{ affectedRows: 1 }, []];
    }
  };
}

function inventoryItem(overrides = {}) {
  return {
    id: 'item-1',
    kodeBarang: 'ATK-001',
    nama: 'Kertas',
    merek: '',
    kategori: 'ATK',
    subkategori: '',
    jenis: 'ATK',
    satuan: 'Rim',
    stokAwal: 0,
    stokSaatIni: 0,
    stokMinimum: 1,
    stokMaksimum: 20,
    hargaSatuan: 10,
    lokasiGudang: 'Gudang A',
    rak: 'RAK-01',
    shelf: 'S1',
    binCode: 'BIN-01',
    barcode: '',
    ratarataPenggunaanBulanan: 1,
    fotoUrl: undefined,
    ...overrides
  };
}

test('operational writer rejects client changes to the read-only ledger', async () => {
  const previous = state({ stockCardLedger: [{ id: 'ledger-1', saldo: 2 }] });
  const next = state({ stockCardLedger: [{ id: 'ledger-1', saldo: 3 }] });

  await assert.rejects(
    writeOperationalState(createExecutor(), previous, next),
    /stock ledger is read-only/i
  );
});

test('permanent request deletion preserves inventory balances, posted stock-out and ledger', async () => {
  const previous = state({
    inventoryItems: [inventoryItem({
      stokAwal: 20, stokSaatIni: 16, lokasiGudang: '', rak: '', shelf: '', binCode: ''
    })],
    requests: [{ id: 'req-delivered', status: 'Diterima' }, { id: 'req-pending', status: 'Diajukan' }],
    stockOutList: [{
      id: 'out-1', requestId: 'req-delivered', itemId: 'item-1',
      nomorTransaksi: 'BK-001', tanggal: '2026-10-18', jumlah: 4, satuan: 'Rim',
      unitKerja: 'Unit Uji', ruangan: 'Ruang Uji', pemohon: 'Pemohon', petugas: 'Operator'
    }],
    stockCardLedger: [{ id: 'ledger-1', itemId: 'item-1', saldo: 16 }]
  });
  const next = { ...previous, requests: [] };
  const executor = createExecutor();
  await writeOperationalState(executor, previous, next);
  assert.deepEqual(
    executor.statements.filter(({ sql }) => sql.includes('DELETE FROM inventory_requests')).map(({ params }) => params[0]),
    ['req-delivered', 'req-pending']
  );
  assert.equal(executor.statements.some(({ sql }) =>
    /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql) && /\b(inventory_items|stock_out|stock_out_items|stock_card_ledger)\b/i.test(sql)
  ), false);
  assert.equal(next.inventoryItems[0].stokSaatIni, 16);
  assert.deepEqual(next.stockOutList, previous.stockOutList);
  assert.deepEqual(next.stockCardLedger, previous.stockCardLedger);
});

test('operational writer rejects stock balance changes without a transaction or audited adjustment', async () => {
  const previous = state({
    inventoryItems: [{ id: 'item-1', stokAwal: 2, stokSaatIni: 2 }]
  });
  const next = state({
    inventoryItems: [{ id: 'item-1', stokAwal: 2, stokSaatIni: 3 }]
  });

  await assert.rejects(
    writeOperationalState(createExecutor(), previous, next),
    /without a stock transaction or an audited import\/adjustment/
  );
});

test('operational writer derives new audit identity from the authenticated server user', async () => {
  const previous = state();
  const next = state({
    auditLogs: [{
      id: 'audit-1',
      userId: 'forged-user',
      userName: 'Forged',
      userRole: 'Administrator',
      aktivitas: 'Update',
      modul: 'INVENTARIS',
      tanggal: '2026-10-11',
      waktu: '10:00:00',
      ipAddress: '192.0.2.1',
      detail: 'Data diperbarui'
    }]
  });
  const executor = createExecutor();

  await writeOperationalState(executor, previous, next, {
    id: 'user-1',
    name: 'Operator Resmi',
    role: 'Operator',
    ipAddress: '127.0.0.1'
  });

  const insert = executor.statements.find(({ sql }) => sql.includes('INSERT INTO `audit_logs`'));
  assert.ok(insert);
  assert.equal(insert.params[1], 'user-1');
  assert.equal(insert.params[2], 'Operator Resmi');
  assert.equal(insert.params[3], 'Operator');
  assert.equal(insert.params[8], '127.0.0.1');
});

test('operational writer rejects edits and deletion of existing audit records', async () => {
  const original = {
    id: 'audit-1',
    userId: 'user-1',
    userName: 'Operator',
    userRole: 'Operator',
    aktivitas: 'Update',
    modul: 'INVENTARIS',
    tanggal: '2026-10-11',
    waktu: '10:00:00',
    ipAddress: '',
    detail: 'Data diperbarui'
  };

  await assert.rejects(
    writeOperationalState(createExecutor(), state({ auditLogs: [original] }), state()),
    /cannot be deleted/
  );
  await assert.rejects(
    writeOperationalState(
      createExecutor(),
      state({ auditLogs: [original] }),
      state({ auditLogs: [{ ...original, detail: 'Data diubah' }] })
    ),
    /cannot be changed/
  );
});

test('verified stock-in writes a relational transaction and matching ledger movement', async () => {
  const previous = state({
    inventoryItems: [{
      id: 'item-1',
      kodeBarang: 'ATK-001',
      nama: 'Kertas',
      kategori: 'ATK',
      subkategori: '',
      jenis: 'ATK',
      satuan: 'Rim',
      stokAwal: 5,
      stokSaatIni: 5,
      stokMinimum: 1,
      stokMaksimum: 20,
      hargaSatuan: 10,
      lokasiGudang: '',
      rak: '',
      shelf: '',
      binCode: '',
      barcode: '',
      ratarataPenggunaanBulanan: 1,
      fotoUrl: undefined
    }]
  });
  const next = state({
    inventoryItems: [{
      ...previous.inventoryItems[0],
      stokSaatIni: 7
    }],
    stockInList: [{
      id: 'sin-1',
      nomorTransaksi: 'BM-2026-0001',
      tanggal: '2026-10-11',
      nomorDokumen: 'BA-001',
      sumber: 'Pengadaan',
      itemId: 'item-1',
      jumlah: 2,
      hargaSatuan: 10,
      totalHarga: 20,
      lokasiRak: '',
      petugas: 'Operator',
      keterangan: '',
      status: 'Diverifikasi'
    }]
  });
  const executor = createExecutor();

  await writeOperationalState(executor, previous, next, { name: 'Operator' }, 1);

  assert.ok(executor.statements.some(({ sql }) => sql.includes('INSERT INTO `stock_in`')));
  assert.ok(executor.statements.some(({ sql }) => sql.includes('INSERT INTO `stock_in_items`')));
  const ledgerInsert = executor.statements.find(({ sql }) => sql.includes('INSERT INTO `stock_card_ledger`'));
  assert.ok(ledgerInsert);
  assert.equal(ledgerInsert.params[4], 'MASUK');
  assert.equal(ledgerInsert.params[5], 2);
  assert.equal(ledgerInsert.params[6], 0);
  assert.equal(executor.statements.some(({ sql, params }) =>
    sql.includes('UPDATE stock_card_ledger SET saldo') && params[0] === 7), true);
});

test('deleting a verified stock-in removes its rows and reverses its stock ledger effect', async () => {
  const inventoryItem = {
    id: 'item-1',
    kodeBarang: 'ATK-001',
    nama: 'Kertas',
    kategori: 'ATK',
    subkategori: '',
    jenis: 'ATK',
    satuan: 'Rim',
    stokAwal: 5,
    stokSaatIni: 7,
    stokMinimum: 1,
    stokMaksimum: 20,
    hargaSatuan: 10,
    lokasiGudang: '',
    rak: '',
    shelf: '',
    binCode: '',
    barcode: '',
    ratarataPenggunaanBulanan: 1,
    fotoUrl: undefined,
    totalNilai: 70,
    status: 'Aman'
  };
  const stockIn = {
    id: 'sin-1',
    nomorTransaksi: 'BM-2026-0001',
    tanggal: '2026-10-11',
    nomorDokumen: 'BA-001',
    sumber: 'Pengadaan',
    itemId: 'item-1',
    jumlah: 2,
    hargaSatuan: 10,
    totalHarga: 20,
    lokasiRak: '',
    petugas: 'Operator',
    keterangan: '',
    status: 'Diverifikasi'
  };
  const previous = state({ inventoryItems: [inventoryItem], stockInList: [stockIn] });
  const next = state({
    inventoryItems: [{ ...inventoryItem, stokSaatIni: 5, totalNilai: 50 }],
    stockInList: []
  });
  const executor = createExecutor();

  await writeOperationalState(executor, previous, next, { name: 'Operator' }, 2);

  assert.ok(executor.statements.some(({ sql, params }) =>
    sql.includes('DELETE FROM `stock_in_items`') && params[0] === stockIn.id));
  assert.ok(executor.statements.some(({ sql, params }) =>
    sql.includes('DELETE FROM `stock_in`') && params[0] === stockIn.id));
  const reversal = executor.statements.find(({ sql, params }) =>
    sql.includes('INSERT INTO `stock_card_ledger`') && params[4] === 'KELUAR');
  assert.ok(reversal);
  assert.equal(reversal.params[5], 0);
  assert.equal(reversal.params[6], 2);
  assert.equal(executor.statements.some(({ sql, params }) =>
    sql.includes('UPDATE stock_card_ledger SET saldo') && params[0] === 5), true);
});

test('deleting orphaned historical stock-in does not create a stock correction', async () => {
  const previous = state({
    stockInList: [{
      id: 'sin-orphan',
      nomorTransaksi: 'BM-2026-ORPHAN',
      tanggal: '2026-10-11',
      nomorDokumen: 'BA-ORPHAN',
      sumber: 'Historis',
      itemId: 'deleted-item',
      jumlah: 2,
      hargaSatuan: 10,
      totalHarga: 20,
      lokasiRak: '',
      petugas: 'Operator',
      keterangan: ''
    }]
  });
  const next = state();
  const executor = createExecutor();

  await writeOperationalState(executor, previous, next, { name: 'Operator' }, 3);

  assert.ok(executor.statements.some(({ sql, params }) =>
    sql.includes('DELETE FROM `stock_in_items`') && params[0] === 'sin-orphan'));
  assert.ok(executor.statements.some(({ sql, params }) =>
    sql.includes('DELETE FROM `stock_in`') && params[0] === 'sin-orphan'));
  assert.equal(executor.statements.some(({ sql }) =>
    sql.includes('INSERT INTO `stock_card_ledger`')), false);
});

test('inventory writer resolves locations from a normalized composite index', async () => {
  const executor = createExecutor({
    locations: [{
      id: 'location-1',
      gudang_name: ' gudang a ',
      rak_code: 'rak-01',
      shelf: 's1',
      bin_code: 'bin-01'
    }]
  });
  await writeOperationalState(executor, state(), state({
    inventoryItems: [inventoryItem()]
  }));

  const insert = executor.statements.find(({ sql }) => sql.includes('INSERT INTO `inventory_items`'));
  assert.ok(insert);
  assert.equal(insert.params[13], 'location-1');
});

test('inventory location index preserves ambiguous-location rejection', async () => {
  const location = {
    id: 'location-1',
    gudang_name: 'Gudang A',
    rak_code: 'RAK-01',
    shelf: 'S1',
    bin_code: 'BIN-01'
  };
  const executor = createExecutor({
    locations: [location, { ...location, id: 'location-2' }]
  });

  await assert.rejects(
    writeOperationalState(executor, state(), state({
      inventoryItems: [inventoryItem()]
    })),
    /Inventory location does not exist or is ambiguous/
  );
  assert.equal(executor.statements.some(({ sql }) => sql.includes('INSERT INTO `inventory_items`')), false);
});

test('unchanged inventory rows are still validated before the writer skips redundant mapping', async () => {
  const invalidItem = inventoryItem({ nama: '' });
  const current = state({ inventoryItems: [invalidItem] });

  await assert.rejects(
    writeOperationalState(createExecutor(), current, state({ inventoryItems: [{ ...invalidItem }] })),
    /Inventory item name is required/
  );
});
