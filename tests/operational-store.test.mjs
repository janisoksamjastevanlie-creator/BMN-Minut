import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  assertOperationalSchema,
  findOperationalUserByEmail,
  readOperationalState
} from '../operationalStore.mjs';

function createExecutor({ roles = [], ledger = [], usersByEmail = [] } = {}) {
  return {
    async execute(sql) {
      if (sql.includes('information_schema.columns')) return [[], []];
      if (sql.includes('FROM stock_card_ledger')) return [ledger, []];
      if (sql.includes('FROM roles')) return [roles, []];
      if (sql.includes('FROM users u')) return [usersByEmail, []];
      return [[], []];
    }
  };
}

test('operational schema validation fails closed when required tables are missing', async () => {
  await assert.rejects(
    assertOperationalSchema(createExecutor()),
    /Operational schema is incomplete; missing: app_meta \(table\)/
  );
});

test('operational role metadata does not inherit example permissions', async () => {
  const state = await readOperationalState(createExecutor({
    roles: [{
      id: 'role-admin',
      name: 'Administrator',
      description: '',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      app_metadata_json: null
    }]
  }));

  assert.equal(state.roles.length, 1);
  assert.equal(state.roles[0].code, 'role-admin');
  assert.equal(Object.values(state.roles[0].permissions).some(Boolean), false);
  assert.deepEqual(state.stockCardLedger, []);
});

test('operational stock ledger maps persisted transaction fields', async () => {
  const state = await readOperationalState(createExecutor({
    ledger: [{
      id: 'ledger-1',
      item_id: 'item-1',
      tanggal: '2026-03-01',
      nomor_transaksi: 'OPN-1',
      tipe_transaksi: 'PENYESUAIAN_OPNAME',
      masuk: 2,
      keluar: 0,
      saldo: 12,
      keterangan: 'Hasil opname',
      petugas: 'Operator'
    }]
  }));

  assert.deepEqual(state.stockCardLedger, [{
    id: 'ledger-1',
    itemId: 'item-1',
    tanggal: '2026-03-01',
    nomorTransaksi: 'OPN-1',
    jenisTransaksi: 'PENYESUAIAN_OPNAME',
    masuk: 2,
    keluar: 0,
    saldo: 12,
    keterangan: 'Hasil opname',
    petugas: 'Operator'
  }]);
});

test('operational user lookup rejects ambiguous active email mappings', async () => {
  await assert.rejects(
    findOperationalUserByEmail(createExecutor({
      usersByEmail: [{ id: 'user-1' }, { id: 'user-2' }]
    }), 'employee@example.gov'),
    /Multiple active operational users/
  );
});

test('operational state excludes host disk backups from bulk reads and keeps legacy attachments', async () => {
  const executor = {
    async execute(sql) {
      if (sql.includes('SELECT * FROM documents')) {
        return [[
          { id: 'host', nomor_dokumen: 'HOST', judul: 'Host', jenis: 'Nota',
            tanggal: '2026-10-14', tahun: 2026, uploader: 'Admin', status: 'Sah', storage_backend: 'hostinger' },
          { id: 'legacy', nomor_dokumen: 'LEGACY', judul: 'Legacy', jenis: 'Nota',
            tanggal: '2026-10-14', tahun: 2026, uploader: 'Admin', status: 'Sah' }
        ]];
      }
      if (sql.includes('FROM document_files')) {
        assert.match(sql, /JOIN documents d ON d\.id = f\.document_id/);
        assert.match(sql, /d\.storage_backend IS NULL OR d\.storage_backend <> 'hostinger'/);
        return [[{ document_id: 'legacy', file_name: 'nota.pdf',
          mime_type: 'application/pdf', file_data: Buffer.from('%PDF-1.7'),
          sha256: crypto.createHash('sha256').update('%PDF-1.7').digest('hex') }]];
      }
      return [[]];
    }
  };
  const state = await readOperationalState(executor);
  assert.equal(state.documents.find(doc => doc.id === 'host').fileDataUrl, undefined);
  assert.equal(state.documents.find(doc => doc.id === 'legacy').fileDataUrl,
    `data:application/pdf;base64,${Buffer.from('%PDF-1.7').toString('base64')}`);
});
