import * as XLSX from 'xlsx';
import { BmnAsset } from '../types';

export interface DbrSheetSummary {
  name: string;
  columns: string[];
  dataRows: number;
  empty: boolean;
  recognized: boolean;
}

export interface DbrReferenceRow {
  rowNumber: number;
  sheetName: string;
  kodeBarang: string;
  nup: string;
  namaBarang: string;
  merk: string;
  tipe: string;
  ruangan: string;
}

export interface DbrWorkbookResult {
  sheets: DbrSheetSummary[];
  rows: DbrReferenceRow[];
  warnings: string[];
}

export type DbrReconciliationStatus =
  | 'matched'
  | 'different'
  | 'excel-only'
  | 'duplicate'
  | 'needs-review';

export interface DbrReconciliationRow {
  reference: DbrReferenceRow;
  asset?: BmnAsset;
  status: DbrReconciliationStatus;
  notes: string[];
}

export interface DbrReconciliationResult {
  rows: DbrReconciliationRow[];
  appOnly: BmnAsset[];
  counts: Record<DbrReconciliationStatus, number> & { appOnly: number };
}

const normalizeHeader = (value: unknown): string =>
  String(value ?? '').toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g, '');

const cellText = (value: unknown): string => String(value ?? '').trim();

const normalizeCode = (value: string): string =>
  value.toLocaleUpperCase('id-ID').replace(/[^A-Z0-9]/g, '');

const normalizeNup = (value: string): string =>
  value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');

const normalizeText = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');

const getAssetKey = (kodeBarang: string, nup: string): string => {
  const normalizedCode = normalizeCode(kodeBarang);
  const normalizedNup = normalizeNup(nup);
  return normalizedCode && normalizedNup ? `${normalizedCode}:${normalizedNup}` : '';
};

export function parseDbrWorkbook(data: ArrayBuffer | Uint8Array): DbrWorkbookResult {
  const workbook = XLSX.read(data, { type: 'array', raw: false });
  const sheets: DbrSheetSummary[] = [];
  const rows: DbrReferenceRow[] = [];
  const warnings: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false
    });
    const nonEmptyRows = sheetRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.some(value => cellText(value) !== ''));

    if (nonEmptyRows.length === 0) {
      sheets.push({ name: sheetName, columns: [], dataRows: 0, empty: true, recognized: false });
      continue;
    }

    const headerMatch = nonEmptyRows.find(({ row }) => {
      const headers = row.map(normalizeHeader);
      return ['kodebarang', 'nup', 'namabarang'].every(required => headers.includes(required));
    });

    if (!headerMatch) {
      sheets.push({
        name: sheetName,
        columns: nonEmptyRows[0].row.map(cellText).filter(Boolean),
        dataRows: Math.max(0, nonEmptyRows.length - 1),
        empty: false,
        recognized: false
      });
      continue;
    }

    const headers = headerMatch.row.map(normalizeHeader);
    const columnIndex = (header: string) => headers.indexOf(header);
    const columns = headerMatch.row.map(cellText);
    const dataRows = nonEmptyRows.filter(({ index }) => index > headerMatch.index);
    sheets.push({
      name: sheetName,
      columns,
      dataRows: dataRows.length,
      empty: false,
      recognized: true
    });

    for (const { row, index } of dataRows) {
      const getValue = (header: string) => cellText(row[columnIndex(header)]);
      const reference: DbrReferenceRow = {
        rowNumber: index + 1,
        sheetName,
        kodeBarang: getValue('kodebarang'),
        nup: getValue('nup'),
        namaBarang: getValue('namabarang'),
        merk: getValue('merk'),
        tipe: getValue('tipe'),
        ruangan: getValue('ruangan')
      };

      if (!reference.kodeBarang || !reference.nup || !reference.namaBarang) {
        warnings.push(`${sheetName} baris ${reference.rowNumber}: Kode Barang, NUP, dan Nama Barang wajib diisi.`);
        continue;
      }
      rows.push(reference);
    }
  }

  if (rows.length === 0) {
    throw new Error('Tidak ditemukan data DBR dengan kolom Kode Barang, NUP, dan Nama Barang.');
  }

  return { sheets, rows, warnings };
}

export function reconcileDbrRows(
  references: DbrReferenceRow[],
  assets: BmnAsset[]
): DbrReconciliationResult {
  const referenceKeys = references.map(row => getAssetKey(row.kodeBarang, row.nup));
  const referenceCounts = new Map<string, number>();
  referenceKeys.forEach(key => {
    if (key) referenceCounts.set(key, (referenceCounts.get(key) || 0) + 1);
  });

  const assetsByKey = new Map<string, BmnAsset[]>();
  assets.forEach(asset => {
    const key = getAssetKey(asset.kodeBarang, String(asset.nup));
    if (!key) return;
    assetsByKey.set(key, [...(assetsByKey.get(key) || []), asset]);
  });

  const rows = references.map((reference, index): DbrReconciliationRow => {
    const key = referenceKeys[index];
    const matchingAssets = assetsByKey.get(key) || [];
    const notes: string[] = [];

    if (referenceCounts.get(key)! > 1 || matchingAssets.length > 1) {
      return { reference, status: 'duplicate', notes: ['Pasangan Kode Barang + NUP terduplikasi pada Excel atau data aplikasi.'] };
    }

    const asset = matchingAssets[0];
    if (!asset) {
      if (!reference.ruangan) notes.push('Ruangan tidak tersedia di Excel.');
      return { reference, status: 'excel-only', notes };
    }

    const differentFields: string[] = [];
    if (normalizeText(reference.namaBarang) !== normalizeText(asset.namaBarang)) {
      differentFields.push('Nama Barang');
    }

    const sourceBrandType = [reference.merk, reference.tipe].filter(Boolean);
    if (sourceBrandType.length === 1 && normalizeText(sourceBrandType[0]) !== normalizeText(asset.merkType)) {
      differentFields.push(reference.merk ? 'Merk' : 'Tipe');
    } else if (sourceBrandType.length > 1) {
      notes.push('Merk dan Tipe terpisah di Excel, sedangkan data aset memakai satu kolom Merk/Type.');
    }

    if (reference.ruangan && normalizeText(reference.ruangan) !== normalizeText(asset.ruanganNama)) {
      differentFields.push('Ruangan');
    } else if (!reference.ruangan) {
      notes.push('Ruangan tidak tersedia di Excel; lokasi tidak dapat direkonsiliasi.');
    }

    if (differentFields.length > 0) {
      notes.unshift(`Perbedaan perlu diverifikasi: ${differentFields.join(', ')}.`);
      return { reference, asset, status: 'different', notes };
    }

    if (notes.length > 0) {
      return { reference, asset, status: 'needs-review', notes };
    }
    return { reference, asset, status: 'matched', notes: [] };
  });

  const referenceKeySet = new Set(referenceKeys.filter(Boolean));
  const appOnly = assets.filter(asset =>
    !referenceKeySet.has(getAssetKey(asset.kodeBarang, String(asset.nup)))
  );
  const counts: DbrReconciliationResult['counts'] = {
    matched: 0,
    different: 0,
    'excel-only': 0,
    duplicate: 0,
    'needs-review': 0,
    appOnly: appOnly.length
  };
  rows.forEach(row => { counts[row.status] += 1; });

  return { rows, appOnly, counts };
}
