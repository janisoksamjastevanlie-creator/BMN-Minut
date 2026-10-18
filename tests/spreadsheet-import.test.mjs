import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseUploadedFile } from '../src/utils/fileImporter.ts';
import {
  defaultMasterAssetCategoryMappings,
  MASTER_ASSET_HEADERS,
  parseMasterAssetFile,
  prepareMasterAssetImport
} from '../src/utils/masterAssetImporter.ts';
import { BMN_ASSET_CATEGORIES } from '../src/data/bmnAssetCategories.ts';

const makeFile = (name, content) => {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
  return {
    name,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => new TextDecoder().decode(bytes)
  };
};

test('spreadsheet import keeps XLSX and legacy XLS support', async () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Nama Barang', 'Jumlah'],
    ['Meja', 4]
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  for (const [extension, bookType] of [['xlsx', 'xlsx'], ['xls', 'biff8']]) {
    const bytes = XLSX.write(workbook, { type: 'array', bookType });
    const rows = await parseUploadedFile(makeFile(`data.${extension}`, bytes));
    assert.deepEqual(rows, [{ 'Nama Barang': 'Meja', Jumlah: 4 }]);
  }
});

test('spreadsheet import keeps CSV and TSV support', async () => {
  const csvRows = await parseUploadedFile(makeFile('data.csv', 'Nama Barang,Jumlah\nMeja,4'));
  const tsvRows = await parseUploadedFile(makeFile('data.tsv', 'Nama Barang\tJumlah\nMeja\t4'));

  assert.deepEqual(csvRows, [{ 'Nama Barang': 'Meja', Jumlah: 4 }]);
  assert.deepEqual(tsvRows, [{ 'Nama Barang': 'Meja', Jumlah: 4 }]);
});

test('JSON import still accepts supported top-level data arrays', async () => {
  const rows = await parseUploadedFile(makeFile('data.json', JSON.stringify({
    data: [{ 'Nama Barang': 'Meja', Jumlah: 4 }]
  })));

  assert.deepEqual(rows, [{ 'Nama Barang': 'Meja', Jumlah: 4 }]);
});

test('master asset category defaults match existing names or retain the source category', () => {
  assert.deepEqual(BMN_ASSET_CATEGORIES, [
    'TANAH',
    'ALAT BESAR',
    'ALAT ANGKUTAN BERMOTOR',
    'MESIN PERALATAN NON TIK',
    'MESIN PERALATAN KHUSUS TIK',
    'BANGUNAN DAN GEDUNG',
    'RUMAH NEGARA',
    'ASET TETAP LAINNYA',
    'ASET TAK BERWUJUD'
  ]);
  assert.deepEqual(
    defaultMasterAssetCategoryMappings(
      ['ALAT BESAR', 'TANAH', 'alat besar'],
      ['Peralatan dan Mesin', 'tanah', 'Alat Besar']
    ),
    {
      'ALAT BESAR': 'Alat Besar',
      TANAH: 'tanah',
      'alat besar': 'Alat Besar'
    }
  );
  assert.deepEqual(
    defaultMasterAssetCategoryMappings([...BMN_ASSET_CATEGORIES], []),
    Object.fromEntries(BMN_ASSET_CATEGORIES.map(category => [category, category]))
  );
});

const withIncorrectDimensions = (workbook) => {
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const archive = XLSX.CFB.read(bytes, { type: 'buffer' });
  const sheet = archive.FileIndex.find(entry => entry.name === 'sheet1.xml');
  assert.ok(sheet);
  sheet.content = Buffer.from(Buffer.from(sheet.content).toString('utf8')
    .replace(/<dimension ref="[^"]*"\s*\/>/, '<dimension ref="A1:F1"/>'));
  sheet.size = sheet.content.length;
  return XLSX.CFB.write(archive, { type: 'buffer', fileType: 'zip' });
};

test('spreadsheet import reads every cell despite incorrect worksheet dimensions', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Nama Barang', 'Jumlah'],
    ['Meja', 4],
    ['Kursi', 6]
  ]), 'Data');

  const rows = await parseUploadedFile(makeFile('data.xlsx', withIncorrectDimensions(workbook)));
  assert.deepEqual(rows, [
    { 'Nama Barang': 'Meja', Jumlah: 4 },
    { 'Nama Barang': 'Kursi', Jumlah: 6 }
  ]);
});

test('master asset import recovers full headers and all assets from incorrect dimensions', async () => {
  const source = {
    'Jenis BMN': 'ALAT BESAR',
    'Kode Satker': '123456',
    'Kode Barang': '3010101001',
    'NUP': 1,
    'Nama Barang': 'Mesin',
    'Kondisi': 'Baik',
    'Tanggal Perolehan': 46022,
    'Nilai Perolehan': 1000000,
    'Nilai Penyusutan': 0,
    'Nilai Buku': 1000000,
    'Status PMK': 'Aktif'
  };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    [...MASTER_ASSET_HEADERS],
    [],
    MASTER_ASSET_HEADERS.map(header => source[header] ?? null),
    MASTER_ASSET_HEADERS.map(header => header === 'NUP' ? 2 : source[header] ?? null)
  ]), 'Master Aset');

  const rows = await parseMasterAssetFile(makeFile('master.xlsx', withIncorrectDimensions(workbook)));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.rowNumber), [3, 4]);
  assert.equal(rows[1].fields['Status PMK'], 'Aktif');
  const categoryMappings = defaultMasterAssetCategoryMappings(
    rows.map(row => String(row.fields['Jenis BMN'])),
    ['Peralatan dan Mesin']
  );
  assert.equal(categoryMappings['ALAT BESAR'], 'ALAT BESAR');

  const preview = prepareMasterAssetImport(rows, categoryMappings, [], []);
  assert.equal(preview.assets.length, 2);
  assert.deepEqual(preview.invalidRows, []);
  assert.deepEqual(preview.conflicts, []);
});
