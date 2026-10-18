import * as XLSX from 'xlsx';
import { BmnAsset, AssetCondition } from '../types';

export const MASTER_ASSET_SHEET = 'Master Aset';

export const MASTER_ASSET_HEADERS = [
  'No', 'Jenis BMN', 'Kode Satker', 'Nama Satker', 'Kode Barang', 'NUP', 'Nama Barang',
  'Status BMN', 'Merk', 'Tipe', 'Kondisi', 'Umur Aset', 'Intra / Extra', 'Henti Guna',
  'Status SBSN', 'Status BMN Idle', 'Status Kemitraan', 'BPYBDS', 'Usulan Barang Hilang',
  'Usulan Barang RB', 'Usul Hapus', 'Hibah DKTP', 'Konsensi Jasa', 'Properti Investasi',
  'Jenis Dokumen', 'No Dokumen', 'No BPKP', 'No Polisi', 'Status Sertifikasi',
  'Jenis Sertipikat', 'No Sertifikat', 'Nama', 'Tanggal Buku Pertama', 'Tanggal Perolehan',
  'Tanggal Pengapusan', 'Nilai Perolehan Pertama', 'Nilai Mutasi', 'Nilai Perolehan',
  'Nilai Penyusutan', 'Nilai Buku', 'Luas Tanah Seluruhnya', 'Luas Tanah Untuk Bangunan',
  'Luas Tanah Untuk Sarana Lingkungan', 'Luas Lahan Kosong', 'Luas Bangunan',
  'Luas Tapak Bangunan', 'Luas Pemanfataan', 'Jumlah Lantai', 'Jumlah Foto',
  'Status Penggunaan', 'No PSP', 'Tanggal PSP', 'Alamat', 'RT/RW', 'Kelurahan/Desa',
  'Kecamatan', 'Kab/Kota', 'Kode Kab/Kota', 'Provinsi', 'Kode Provinsi', 'Kode Pos',
  'SBSK', 'Optimalisasi', 'Penghuni', 'Pengguna', 'Kode KPKNL', 'Uraian KPKNL',
  'Uraian Kanwil DJKN', 'Nama K/L', 'Nama E1', 'Nama Korwil', 'Kode Register',
  'Lokasi Ruang', 'Jenis Identitas', 'No Identitas', 'No STNK', 'Nama Pengguna',
  'Status PMK'
] as const;

export interface MasterAssetSourceRow {
  rowNumber: number;
  fields: Record<string, string | number | boolean | null>;
}

export interface MasterAssetImportIssue {
  rowNumber: number;
  reason: string;
}

export interface MasterAssetImportPreview {
  assets: Omit<BmnAsset, 'id'>[];
  conflicts: MasterAssetImportIssue[];
  invalidRows: MasterAssetImportIssue[];
  sourceCategories: string[];
}

const textValue = (value: string | number | boolean | null | undefined): string =>
  value == null ? '' : String(value).trim();

const numberValue = (value: string | number | boolean | null | undefined, label: string): number => {
  if (value == null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} bukan angka yang valid.`);
  return parsed;
};

const excelDate = (value: string | number | boolean | null | undefined): string => {
  if (typeof value === 'number') {
    const parts = XLSX.SSF.parse_date_code(value);
    if (!parts) throw new Error('Tanggal Perolehan bukan tanggal Excel yang valid.');
    return `${String(parts.y).padStart(4, '0')}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
  }

  const text = textValue(value);
  if (!text) throw new Error('Tanggal Perolehan wajib diisi.');
  const isoDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (isoDate) {
    const normalized = `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`;
    const date = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
      throw new Error('Tanggal Perolehan bukan tanggal yang valid.');
    }
    return normalized;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error('Tanggal Perolehan bukan tanggal yang valid.');
  return parsed.toISOString().slice(0, 10);
};

const sourceField = (
  fields: Record<string, string | number | boolean | null>,
  key: string
) => fields[key];

export const defaultMasterAssetCategoryMappings = (
  sourceCategories: string[],
  availableCategories: string[]
): Record<string, string> => {
  const existingByNormalizedName = new Map(
    availableCategories.map(category => [category.trim().toLocaleLowerCase('id-ID'), category.trim()])
  );

  return Object.fromEntries([...new Set(sourceCategories.map(category => category.trim()).filter(Boolean))]
    .map(category => [
      category,
      existingByNormalizedName.get(category.toLocaleLowerCase('id-ID')) || category
    ]));
};

export const parseMasterAssetFile = async (file: File): Promise<MasterAssetSourceRow[]> => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, nodim: true });
  const worksheet = workbook.Sheets[MASTER_ASSET_SHEET];
  if (!worksheet) throw new Error(`File harus memiliki sheet bernama "${MASTER_ASSET_SHEET}".`);

  const cellRefs = Object.keys(worksheet).filter(key => /^[A-Z]+[0-9]+$/.test(key));
  if (cellRefs.length === 0) throw new Error('Sheet Master Aset tidak berisi data.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true
  });
  const header = rows[0]?.map(value => value == null ? '' : String(value).trim());
  if (!header || header.length !== MASTER_ASSET_HEADERS.length ||
      MASTER_ASSET_HEADERS.some((name, index) => header[index] !== name)) {
    throw new Error('Urutan atau nama kolom tidak sesuai dengan template Master Aset.');
  }

  return rows.slice(2).flatMap((row, index) => {
    if (row.every(value => value == null || value === '')) return [];
    const fields = Object.fromEntries(MASTER_ASSET_HEADERS.map((name, column) => [
      name,
      (row[column] == null || row[column] === '') ? null : row[column] as string | number | boolean
    ]));
    return [{ rowNumber: index + 3, fields }];
  });
};

export const prepareMasterAssetImport = (
  rows: MasterAssetSourceRow[],
  categoryMappings: Record<string, string>,
  rooms: { id: string; name: string; building?: string }[],
  existingAssets: BmnAsset[]
): MasterAssetImportPreview => {
  const assets: Omit<BmnAsset, 'id'>[] = [];
  const conflicts: MasterAssetImportIssue[] = [];
  const invalidRows: MasterAssetImportIssue[] = [];
  const sourceCategories = [...new Set(rows.map(row => textValue(sourceField(row.fields, 'Jenis BMN'))).filter(Boolean))];
  const keyCounts = new Map<string, number>();
  const existingAssetKeys = new Set(existingAssets.map(asset => `${asset.kodeBarang}\u0000${Number(asset.nup)}`));

  rows.forEach(row => {
    const code = textValue(sourceField(row.fields, 'Kode Barang'));
    const nup = Number(sourceField(row.fields, 'NUP'));
    keyCounts.set(`${code}\u0000${nup}`, (keyCounts.get(`${code}\u0000${nup}`) || 0) + 1);
  });

  rows.forEach(row => {
    const fields = row.fields;
    const code = textValue(sourceField(fields, 'Kode Barang'));
    const nupRaw = sourceField(fields, 'NUP');
    const nupText = textValue(nupRaw);
    const nup = typeof nupRaw === 'number' ? nupRaw : Number(textValue(nupRaw));
    const satker = textValue(sourceField(fields, 'Kode Satker'));
    const name = textValue(sourceField(fields, 'Nama Barang'));
    const categorySource = textValue(sourceField(fields, 'Jenis BMN'));

    if (!code || code.length > 50 || !nupText || !Number.isSafeInteger(nup) || nup < 0 ||
        !satker || !name || name.length > 200) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: 'Kode Satker, Kode Barang, NUP, atau Nama Barang kosong/tidak valid.' });
      return;
    }
    if (!categoryMappings[categorySource]) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: `Kategori sumber "${categorySource}" belum dipetakan ke kategori yang tersedia.` });
      return;
    }

    if ((keyCounts.get(`${code}\u0000${nup}`) || 0) > 1) {
      conflicts.push({ rowNumber: row.rowNumber, reason: 'Kode Barang dan NUP berulang di dalam file; baris tidak diimpor.' });
      return;
    }
    if (existingAssetKeys.has(`${code}\u0000${nup}`)) {
      conflicts.push({ rowNumber: row.rowNumber, reason: 'Kode Barang dan NUP sudah ada; data lama tidak ditimpa.' });
      return;
    }

    let tanggalPerolehan: string;
    let nilaiPerolehan: number;
    let akumulasiPenyusutan: number;
    let nilaiBuku: number;
    try {
      tanggalPerolehan = excelDate(sourceField(fields, 'Tanggal Perolehan'));
      nilaiPerolehan = numberValue(sourceField(fields, 'Nilai Perolehan'), 'Nilai Perolehan');
      akumulasiPenyusutan = numberValue(sourceField(fields, 'Nilai Penyusutan'), 'Nilai Penyusutan');
      nilaiBuku = numberValue(sourceField(fields, 'Nilai Buku'), 'Nilai Buku');
    } catch (error) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: error instanceof Error ? error.message : 'Nilai aset tidak valid.' });
      return;
    }

    const rawCondition = textValue(sourceField(fields, 'Kondisi')).toLocaleLowerCase('id-ID');
    let kondisi: AssetCondition;
    if (rawCondition === 'baik') kondisi = 'Baik';
    else if (rawCondition.includes('ringan')) kondisi = 'Rusak Ringan';
    else if (rawCondition.includes('berat')) kondisi = 'Rusak Berat';
    else {
      invalidRows.push({ rowNumber: row.rowNumber, reason: 'Kondisi harus Baik, Rusak Ringan, atau Rusak Berat.' });
      return;
    }

    const lokasi = textValue(sourceField(fields, 'Lokasi Ruang'));
    const isUnlocated = /^(belum berlokasi|belum ditentukan|tidak diketahui)$/i.test(lokasi);
    const matchedRoom = isUnlocated
      ? undefined
      : rooms.find(room => room.name.trim().toLocaleLowerCase('id-ID') === lokasi.toLocaleLowerCase('id-ID'));
    const merk = textValue(sourceField(fields, 'Merk'));
    const tipe = textValue(sourceField(fields, 'Tipe'));
    const pengguna = textValue(sourceField(fields, 'Nama Pengguna')) || textValue(sourceField(fields, 'Pengguna'));

    assets.push({
      kodeBarang: code,
      nup,
      namaBarang: name,
      kategori: categoryMappings[categorySource],
      merkType: [merk, tipe].filter(Boolean).join(' ') || '',
      nomorSeri: '',
      tanggalPerolehan,
      tahunPerolehan: Number(tanggalPerolehan.slice(0, 4)),
      jumlah: 1,
      satuan: 'Unit',
      nilaiPerolehan,
      akumulasiPenyusutan,
      nilaiBuku,
      kondisi,
      gedung: matchedRoom?.building || '',
      ruanganId: matchedRoom?.id || '',
      ruanganNama: matchedRoom?.name || lokasi,
      penanggungJawab: pengguna,
      status: kondisi === 'Rusak Berat' ? 'Dalam Pemeliharaan' : 'Aktif',
      barcode: '',
      masterFields: fields
    });
  });

  return { assets, conflicts, invalidRows, sourceCategories };
};

export const downloadMasterAssetExport = (assets: BmnAsset[]) => {
  const rows = assets.map((asset, index) => {
    const fields = asset.masterFields || {};
    const fallback: Record<string, string | number> = {
      'No': index + 1,
      'Kode Barang': asset.kodeBarang,
      'NUP': asset.nup,
      'Nama Barang': asset.namaBarang,
      'Merk': asset.merkType,
      'Kondisi': asset.kondisi,
      'Tanggal Perolehan': asset.tanggalPerolehan,
      'Nilai Perolehan': asset.nilaiPerolehan,
      'Nilai Penyusutan': asset.akumulasiPenyusutan,
      'Nilai Buku': asset.nilaiBuku,
      'Lokasi Ruang': asset.ruanganNama,
      'Nama Pengguna': asset.penanggungJawab
    };
    return MASTER_ASSET_HEADERS.map(header =>
      fields[header] ?? fallback[header] ?? null
    );
  });
  const worksheet = XLSX.utils.aoa_to_sheet([[...MASTER_ASSET_HEADERS], [], ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, MASTER_ASSET_SHEET);
  XLSX.writeFile(workbook, `Ekspor_Master_Aset_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
