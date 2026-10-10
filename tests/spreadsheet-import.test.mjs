import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseUploadedFile } from '../src/utils/fileImporter.ts';

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
