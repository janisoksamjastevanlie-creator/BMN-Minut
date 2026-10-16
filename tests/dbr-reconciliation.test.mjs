import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseDbrWorkbook, reconcileDbrRows } from '../src/utils/dbrReconciliation.ts';

const asset = (overrides = {}) => ({
  id: 'asset-1',
  kodeBarang: '3050201002',
  nup: 40,
  namaBarang: 'Kursi Besi/Metal',
  kategori: 'Peralatan dan Mesin',
  merkType: 'INFORMA',
  nomorSeri: '-',
  tanggalPerolehan: '2020-01-01',
  tahunPerolehan: 2020,
  jumlah: 1,
  satuan: 'Unit',
  nilaiPerolehan: 1000000,
  akumulasiPenyusutan: 0,
  nilaiBuku: 1000000,
  kondisi: 'Baik',
  gedung: 'Gedung BPS',
  ruanganId: 'room-1',
  ruanganNama: 'Ruang Kerja',
  penanggungJawab: 'Petugas',
  status: 'Aktif',
  barcode: 'BMN-0040',
  ...overrides
});

const makeDbrWorkbook = (rows) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Sheet1');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Kode Barang', 'NUP', 'Nama Barang', 'Merk', 'Tipe', 'Ruangan'],
      ...rows
    ]),
    'Daftar DBR'
  );
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
};

test('DBR reader skips an empty first sheet and reads all DBR columns', () => {
  const parsed = parseDbrWorkbook(makeDbrWorkbook([
    ['3050201002', '40', 'Kursi Besi/Metal', 'INFORMA', '', 'Ruang Kerja']
  ]));

  assert.deepEqual(parsed.sheets.map(sheet => ({
    name: sheet.name,
    empty: sheet.empty,
    columns: sheet.columns,
    dataRows: sheet.dataRows,
    recognized: sheet.recognized
  })), [
    { name: 'Sheet1', empty: true, columns: [], dataRows: 0, recognized: false },
    {
      name: 'Daftar DBR',
      empty: false,
      columns: ['Kode Barang', 'NUP', 'Nama Barang', 'Merk', 'Tipe', 'Ruangan'],
      dataRows: 1,
      recognized: true
    }
  ]);
  assert.equal(parsed.rows[0].kodeBarang, '3050201002');
  assert.equal(parsed.rows[0].nup, '40');
  assert.equal(parsed.rows[0].ruangan, 'Ruang Kerja');
});

test('DBR reconciliation keys on code and NUP and flags duplicate, unmatched, and missing room records', () => {
  const parsed = parseDbrWorkbook(makeDbrWorkbook([
    ['3050201002', '25', 'Meja Kerja Kayu', 'LOKAL', '', ''],
    ['3050201002', '25', 'Meja Kerja Kayu', 'LOKAL', '', ''],
    ['3050201002', '40', 'Kursi Besi/Metal', 'INFORMA', '', ''],
    ['3050201003', '99', 'Barang Tidak Ada', '', '', '']
  ]));
  const existing = asset();
  const unmatchedAsset = asset({ id: 'asset-2', kodeBarang: '3050201004', nup: 14, namaBarang: 'Kursi Kayu' });
  const result = reconcileDbrRows(parsed.rows, [existing, unmatchedAsset]);

  assert.deepEqual(result.rows.map(row => row.status), [
    'duplicate',
    'duplicate',
    'needs-review',
    'excel-only'
  ]);
  assert.equal(result.counts.duplicate, 2);
  assert.equal(result.counts['needs-review'], 1);
  assert.equal(result.counts['excel-only'], 1);
  assert.deepEqual(result.appOnly.map(item => item.id), ['asset-2']);
});

test('DBR reconciliation reports differing name and room without mutating application data', () => {
  const parsed = parseDbrWorkbook(makeDbrWorkbook([
    ['3050201002', '40', 'Nama Berbeda', 'INFORMA', '', 'Ruang Tujuan']
  ]));
  const existing = asset();
  const before = structuredClone(existing);
  const result = reconcileDbrRows(parsed.rows, [existing]);

  assert.equal(result.rows[0].status, 'different');
  assert.match(result.rows[0].notes[0], /Nama Barang, Ruangan/);
  assert.deepEqual(existing, before);
});

test('DBR reader rejects workbooks without the required identity and name columns', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Nama Ruangan', 'Lantai'], ['Ruang Kerja', 1]]),
    'Ruangan'
  );
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

  assert.throws(() => parseDbrWorkbook(bytes), /Tidak ditemukan data DBR/);
});
