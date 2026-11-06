// Pengaman regresi untuk perbaikan gejala "server tidak merespon":
// 1) cache state ber-TTL agar satu halaman tidak membaca seluruh basis data
//    berkali-kali, dan 2) penyembunyian data finansial tanpa deep clone JSON penuh.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createStateHelpers } from '../server/collections.mjs';

function buildLegacyState() {
  return {
    inventoryItems: [
      { id: 'inv-1', nama: 'Kertas A4', stok: 10, hargaSatuan: 50000, totalNilai: 500000 },
      { id: 'inv-2', nama: 'Tinta', stok: 3, hargaSatuan: 90000, totalNilai: 270000 }
    ],
    stockInList: [{ id: 'in-1', hargaSatuan: 48000, totalHarga: 480000 }],
    stockOutList: [{ id: 'out-1', jumlah: 2 }],
    documents: [
      {
        id: 'doc-1',
        jenis: 'Nota',
        totalNilaiNota: 960000,
        items: [{ itemId: 'inv-1', hargaSatuan: 48000, totalHarga: 480000, subtotal: 480000 }]
      }
    ],
    assets: [{ id: 'ast-1', nup: 12345 }],
    auditLogs: [{ id: 'log-1' }],
    users: [
      { id: 'usr-1', name: 'Ani', role: 'Pemohon', email: 'ani@bps.go.id', statusAktif: true },
      { id: 'usr-2', name: 'Admin', role: 'Administrator', email: 'admin@bps.go.id', statusAktif: true }
    ],
    roles: [
      { name: 'Pemohon', permissions: { requestSupplies: true } },
      { name: 'Administrator', permissions: { manageAssets: true, manageInventory: true } }
    ]
  };
}

function countingExecutor(state, counter) {
  return {
    async execute(sql) {
      counter.reads += 1;
      if (!/app_data/.test(String(sql))) return [[]];
      return [Object.entries(state).map(([key, value]) => ({ key, value_json: JSON.stringify(value) }))];
    }
  };
}

test('state cache reads the database once per TTL window and coalesces concurrent callers', async () => {
  const state = buildLegacyState();
  const counter = { reads: 0 };
  const helpers = createStateHelpers({
    db: countingExecutor(state, counter),
    dataBackend: 'legacy',
    cacheTtlMs: 5000
  });

  await Promise.all([
    helpers.refreshCollections(),
    helpers.refreshCollections(),
    helpers.refreshCollections()
  ]);
  assert.equal(counter.reads, 1, 'permintaan serentak cukup satu kali baca');

  await helpers.refreshCollections();
  assert.equal(counter.reads, 1, 'pemanggil rutin memakai cache selama TTL belum lewat');

  await helpers.refreshCollections(undefined, { force: true });
  assert.equal(counter.reads, 2, 'setelah menulis data, cache wajib dibaca ulang');

  assert.deepEqual(helpers.getCollection('inventoryItems'), state.inventoryItems);
  const stats = helpers.cacheStats();
  assert.equal(stats.ttl_ms, 5000);
  assert.ok(stats.coalesced >= 2, `coalesced=${stats.coalesced}`);
  assert.ok(stats.ttl_skips >= 1, `ttl_skips=${stats.ttl_skips}`);
  assert.ok(stats.age_ms !== null && stats.age_ms < 60000, `age_ms=${stats.age_ms}`);
});

test('markCollectionsFresh adopts a written state without another database read', async () => {
  const state = buildLegacyState();
  const counter = { reads: 0 };
  const helpers = createStateHelpers({
    db: countingExecutor(state, counter),
    dataBackend: 'legacy',
    cacheTtlMs: 5000
  });
  await helpers.refreshCollections();
  assert.equal(counter.reads, 1);

  const written = { ...state, inventoryItems: [...state.inventoryItems, { id: 'inv-3', nama: 'Toner' }] };
  helpers.markCollectionsFresh(written);
  await helpers.refreshCollections();
  assert.equal(counter.reads, 1, 'cache yang baru ditulis dianggap segar');
  assert.equal(helpers.getCollection('inventoryItems').length, 3);
});

test('zero TTL always rereads and concurrent refreshes still share one read', async () => {
  const state = buildLegacyState();
  const counter = { reads: 0 };
  const helpers = createStateHelpers({
    db: countingExecutor(state, counter),
    dataBackend: 'legacy',
    cacheTtlMs: 0
  });
  await Promise.all([helpers.refreshCollections(), helpers.refreshCollections()]);
  assert.equal(counter.reads, 1);
  await helpers.refreshCollections();
  assert.equal(counter.reads, 2);
});

test('financial fields are hidden for roles without manageInventory without mutating the source', () => {
  const source = buildLegacyState();
  const snapshot = JSON.parse(JSON.stringify(source));
  const helpers = createStateHelpers({ db: {}, dataBackend: 'legacy', cacheTtlMs: 0 });
  const requester = source.users[0];

  const visible = helpers.stateForUser(source, requester);

  for (const item of visible.inventoryItems) {
    assert.ok(!('hargaSatuan' in item) && !('totalNilai' in item), `item ${item.id} masih memuat harga`);
    assert.ok('stok' in item && 'nama' in item, 'field non-finansial tetap ada');
  }
  for (const entry of visible.stockInList) {
    assert.ok(!('hargaSatuan' in entry) && !('totalHarga' in entry));
  }
  for (const document of visible.documents) {
    assert.ok(!('totalNilaiNota' in document));
    for (const item of document.items) {
      assert.ok(!('hargaSatuan' in item) && !('totalHarga' in item) && !('subtotal' in item));
    }
  }

  // Koleksi tanpa data finansial tidak boleh disalin dua kali.
  assert.equal(visible.assets, source.assets, 'assets tidak perlu disalin ulang');
  assert.equal(visible.auditLogs, source.auditLogs, 'auditLogs tidak perlu disalin ulang');

  // Sumber cache harus tetap utuh supaya pengguna berwenang masih melihat harga.
  assert.deepEqual(source, snapshot, 'state sumber tidak berubah');
  assert.equal(source.inventoryItems[0].hargaSatuan, 50000);
});

test('roles with manageInventory get the state object itself instead of a deep copy', () => {
  const source = buildLegacyState();
  const helpers = createStateHelpers({ db: {}, dataBackend: 'legacy', cacheTtlMs: 0 });
  const admin = source.users[1];
  const visible = helpers.stateForUser(source, admin);
  assert.equal(visible, source);
  assert.equal(visible.inventoryItems[0].hargaSatuan, 50000);
});
