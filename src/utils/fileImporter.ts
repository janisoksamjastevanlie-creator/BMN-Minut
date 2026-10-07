import * as XLSX from 'xlsx';
import { BmnAsset, InventoryItem, AssetCondition } from '../types';

/**
 * Standardize text string for fuzzy key matching
 */
const normalizeKey = (key: string): string => {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

/**
 * Parse any uploaded file (XLSX, XLS, CSV, TSV, JSON) into an array of objects
 */
export const parseUploadedFile = async (file: File): Promise<Record<string, any>[]> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  // JSON format
  if (extension === 'json') {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.assets && Array.isArray(data.assets)) return data.assets;
    if (data.items && Array.isArray(data.items)) return data.items;
    throw new Error('Format JSON harus berupa daftar (array) objek data.');
  }

  // Excel (.xlsx, .xls) and CSV / TSV via XLSX library
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('File spreadsheet tidak memiliki sheet.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
  
  if (!jsonData || jsonData.length === 0) {
    throw new Error('File tidak berisi data atau lembar kerja kosong.');
  }

  return jsonData;
};

/**
 * Map raw imported records to BMN Assets with validation
 */
export interface ParsedAssetResult {
  validAssets: Omit<BmnAsset, 'id'>[];
  warnings: string[];
  totalRows: number;
}

export const mapRowsToBmnAssets = (
  rawRows: Record<string, any>[],
  rooms: { id: string; name: string }[]
): ParsedAssetResult => {
  const validAssets: Omit<BmnAsset, 'id'>[] = [];
  const warnings: string[] = [];

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1
    const normalizedRow: Record<string, any> = {};
    for (const key of Object.keys(row)) {
      normalizedRow[normalizeKey(key)] = row[key];
    }

    const findVal = (possibleKeys: string[]): any => {
      for (const k of possibleKeys) {
        const norm = normalizeKey(k);
        if (normalizedRow[norm] !== undefined && normalizedRow[norm] !== '') {
          return normalizedRow[norm];
        }
      }
      return undefined;
    };

    const namaBarang = String(findVal(['nama barang', 'nama_barang', 'nama', 'uraian barang', 'nama aset', 'item']) || '').trim();
    if (!namaBarang) {
      warnings.push(`Baris ${rowNum}: Nama barang kosong, baris dilewati.`);
      return;
    }

    const rawKode = findVal(['kode barang', 'kode_barang', 'kode', 'kd_brg', 'kd_barang']) || '3.10.01.02.001';
    const rawNup = findVal(['nup', 'no nup', 'nomor nup', 'no_nup', 'nup aset']) || (index + 1);
    const nup = parseInt(String(rawNup).replace(/\D/g, ''), 10) || (index + 1);

    const kategori = String(findVal(['kategori', 'golongan', 'kelompok', 'jenis']) || 'Peralatan dan Mesin').trim();
    const merkType = String(findVal(['merk', 'type', 'merk/type', 'merk / type', 'merek', 'brand']) || '-').trim();
    const nomorSeri = String(findVal(['nomor seri', 'no seri', 'serial number', 'sn', 'no_seri']) || `SN-2026-${nup}`).trim();
    
    const rawTahun = findVal(['tahun perolehan', 'tahun', 'tahun_perolehan', 'thn', 'perolehan']) || new Date().getFullYear();
    const tahunPerolehan = parseInt(String(rawTahun), 10) || 2024;
    const tanggalPerolehan = findVal(['tanggal perolehan', 'tgl perolehan', 'tanggal', 'tgl']) || `${tahunPerolehan}-01-15`;

    const rawNilai = findVal(['nilai perolehan', 'nilai_perolehan', 'harga perolehan', 'harga', 'nilai']) || 0;
    const nilaiPerolehan = typeof rawNilai === 'number' ? rawNilai : parseFloat(String(rawNilai).replace(/[^0-9.-]/g, '')) || 0;

    const rawPenyusutan = findVal(['akumulasi penyusutan', 'penyusutan', 'akumulasi_penyusutan']) || 0;
    const akumulasiPenyusutan = typeof rawPenyusutan === 'number' ? rawPenyusutan : parseFloat(String(rawPenyusutan).replace(/[^0-9.-]/g, '')) || 0;

    const rawNilaiBuku = findVal(['nilai buku', 'nilai_buku', 'saldo buku']);
    let nilaiBuku = Math.max(1, nilaiPerolehan - akumulasiPenyusutan);
    if (rawNilaiBuku !== undefined) {
      nilaiBuku = typeof rawNilaiBuku === 'number' ? rawNilaiBuku : parseFloat(String(rawNilaiBuku).replace(/[^0-9.-]/g, '')) || nilaiBuku;
    }

    // Condition mapping
    const rawKondisi = String(findVal(['kondisi', 'status kondisi', 'kondisi barang']) || 'Baik').toLowerCase();
    let kondisi: AssetCondition = 'Baik';
    if (rawKondisi.includes('rusak berat') || rawKondisi.includes('rb')) {
      kondisi = 'Rusak Berat';
    } else if (rawKondisi.includes('rusak') || rawKondisi.includes('rr') || rawKondisi.includes('ringan')) {
      kondisi = 'Rusak Ringan';
    }

    // Room mapping
    const rawRuang = String(findVal(['ruangan', 'ruang', 'nama ruangan', 'lokasi', 'tempat']) || '').trim();
    let matchedRoom = rooms.find(r => r.name.toLowerCase() === rawRuang.toLowerCase());
    if (!matchedRoom && rawRuang) {
      matchedRoom = rooms.find(r => r.name.toLowerCase().includes(rawRuang.toLowerCase()));
    }
    const ruanganId = matchedRoom?.id || (rooms[0]?.id || 'room-1');
    const ruanganNama = matchedRoom?.name || (rawRuang || rooms[0]?.name || 'Ruang Bagian Umum');

    const penanggungJawab = String(findVal(['penanggung jawab', 'penanggungjawab', 'pj', 'pic', 'pemakai']) || 'Kepala BPS Minahasa Utara').trim();
    const barcode = `BMN-7106-${String(nup).padStart(4, '0')}`;

    validAssets.push({
      kodeBarang: String(rawKode).trim(),
      nup,
      namaBarang,
      kategori,
      merkType,
      nomorSeri,
      tanggalPerolehan: String(tanggalPerolehan),
      tahunPerolehan,
      jumlah: 1,
      satuan: 'Unit',
      nilaiPerolehan,
      akumulasiPenyusutan,
      nilaiBuku,
      kondisi,
      gedung: 'Gedung Kantor BPS Minahasa Utara',
      ruanganId,
      ruanganNama,
      penanggungJawab,
      status: kondisi === 'Rusak Berat' ? 'Dalam Pemeliharaan' : 'Aktif',
      barcode,
      keterangan: String(findVal(['keterangan', 'catatan', 'ket']) || 'Diimpor dari file data')
    });
  });

  return {
    validAssets,
    warnings,
    totalRows: rawRows.length
  };
};

/**
 * Map raw imported records to Inventory Items with validation
 */
export interface ParsedInventoryResult {
  validItems: Omit<InventoryItem, 'id'>[];
  warnings: string[];
  totalRows: number;
}

export const mapRowsToInventoryItems = (
  rawRows: Record<string, any>[]
): ParsedInventoryResult => {
  const validItems: Omit<InventoryItem, 'id'>[] = [];
  const warnings: string[] = [];

  rawRows.forEach((row, index) => {
    const rowNum = index + 2;
    const normalizedRow: Record<string, any> = {};
    for (const key of Object.keys(row)) {
      normalizedRow[normalizeKey(key)] = row[key];
    }

    const findVal = (possibleKeys: string[]): any => {
      for (const k of possibleKeys) {
        const norm = normalizeKey(k);
        if (normalizedRow[norm] !== undefined && normalizedRow[norm] !== '') {
          return normalizedRow[norm];
        }
      }
      return undefined;
    };

    const nama = String(findVal(['nama', 'nama barang', 'nama_barang', 'uraian', 'item']) || '').trim();
    if (!nama) {
      warnings.push(`Baris ${rowNum}: Nama persediaan kosong, baris dilewati.`);
      return;
    }

    const rawKode = findVal(['kode barang', 'kode_barang', 'kode', 'kd_brg']) || `1.01.03.01.${String(index + 1).padStart(3, '0')}`;
    const rawJenis = String(findVal(['jenis', 'tipe', 'kelompok']) || 'ATK').toUpperCase();
    const jenis: 'ATK' | 'ARK' = rawJenis.includes('ARK') || rawJenis.includes('RUMAH TANGGA') ? 'ARK' : 'ATK';

    const subkategori = String(findVal(['subkategori', 'kategori', 'golongan']) || (jenis === 'ATK' ? 'Alat Tulis Kantor' : 'Perbekalan Rumah Tangga')).trim();
    const satuan = String(findVal(['satuan', 'unit', 'uom']) || 'Pcs').trim();

    const rawStok = findVal(['stok', 'stok saat ini', 'stok_saat_ini', 'qty', 'jumlah', 'saldo']) || 0;
    const stokSaatIni = parseInt(String(rawStok).replace(/[^0-9]/g, ''), 10) || 0;

    const rawMin = findVal(['stok minimum', 'stok min', 'min_stok', 'minimum']) || 5;
    const stokMinimum = parseInt(String(rawMin).replace(/[^0-9]/g, ''), 10) || 5;

    const rawMax = findVal(['stok maksimum', 'stok max', 'max_stok', 'maksimum']) || Math.max(50, stokMinimum * 5);
    const stokMaksimum = parseInt(String(rawMax).replace(/[^0-9]/g, ''), 10) || 50;

    const rawHarga = findVal(['harga satuan', 'harga', 'harga_satuan', 'tarif', 'unit price']) || 10000;
    const hargaSatuan = typeof rawHarga === 'number' ? rawHarga : parseFloat(String(rawHarga).replace(/[^0-9.-]/g, '')) || 10000;

    const rak = String(findVal(['rak', 'lokasi rak', 'rak gudang']) || 'Rak A').trim();
    const binCode = String(findVal(['bin code', 'kode bin', 'bin', 'posisi bin']) || `WH-${rak.replace(/\D/g, '') || 'A'}-01-01`).trim();
    const barcode = `BAR-INV-${String(index + 1).padStart(5, '0')}`;

    let status: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
    if (stokSaatIni === 0) status = 'Habis';
    else if (stokSaatIni <= stokMinimum) status = 'Menipis';

    const rawRataRata = findVal(['rata rata penggunaan', 'penggunaan bulanan', 'rata_rata', 'usage']);
    const ratarataPenggunaanBulanan = rawRataRata !== undefined ? parseInt(String(rawRataRata).replace(/[^0-9]/g, ''), 10) || 5 : Math.max(1, Math.round(stokSaatIni * 0.25));

    validItems.push({
      kodeBarang: String(rawKode).trim(),
      nama,
      kategori: 'Persediaan',
      subkategori,
      jenis,
      satuan,
      stokAwal: stokSaatIni,
      stokSaatIni,
      stokMinimum,
      stokMaksimum,
      hargaSatuan,
      totalNilai: stokSaatIni * hargaSatuan,
      lokasiGudang: 'Gudang Logistik Lt. 1 BPS Minut',
      rak,
      shelf: 'Tingkat 2',
      binCode,
      barcode,
      status,
      ratarataPenggunaanBulanan
    });
  });

  return {
    validItems,
    warnings,
    totalRows: rawRows.length
  };
};

/**
 * Generate sample templates for download
 */
export const downloadAssetTemplate = (format: 'csv' | 'xlsx' = 'xlsx') => {
  const sampleData = [
    {
      'Kode Barang': '3.10.02.01.002',
      'NUP': 101,
      'Nama Barang': 'Laptop Dell Latitude 5440 Core i7',
      'Kategori': 'Peralatan dan Mesin',
      'Merk/Type': 'Dell Latitude 5440',
      'Nomor Seri': 'DL5440-2026-X1',
      'Tahun Perolehan': 2025,
      'Nilai Perolehan': 18500000,
      'Akumulasi Penyusutan': 2312500,
      'Nilai Buku': 16187500,
      'Kondisi': 'Baik',
      'Ruangan': 'Ruang Integrasi Pengolahan & Diseminasi Statistik',
      'Penanggung Jawab': 'Vianny Tumangken, S.Si',
      'Keterangan': 'Pengadaan DIPA 2025 BPS Minahasa Utara'
    },
    {
      'Kode Barang': '3.10.01.02.001',
      'NUP': 102,
      'Nama Barang': 'PC All-in-One HP EliteOne 800 G9',
      'Kategori': 'Peralatan dan Mesin',
      'Merk/Type': 'HP EliteOne 800 G9',
      'Nomor Seri': 'HP800-MINUT-09',
      'Tahun Perolehan': 2024,
      'Nilai Perolehan': 22000000,
      'Akumulasi Penyusutan': 5500000,
      'Nilai Buku': 16500000,
      'Kondisi': 'Baik',
      'Ruangan': 'Ruang Bagian Umum',
      'Penanggung Jawab': 'Dra. Meity Sondakh',
      'Keterangan': 'Digunakan untuk operasional SAKTI/SIMAN'
    },
    {
      'Kode Barang': '3.05.02.06.002',
      'NUP': 103,
      'Nama Barang': 'AC Split 2 PK Daikin Inverter',
      'Kategori': 'Peralatan dan Mesin',
      'Merk/Type': 'Daikin FTKQ50',
      'Nomor Seri': 'DKN-AC-2023-08',
      'Tahun Perolehan': 2023,
      'Nilai Perolehan': 8500000,
      'Akumulasi Penyusutan': 3187500,
      'Nilai Buku': 5312500,
      'Kondisi': 'Rusak Ringan',
      'Ruangan': 'Ruang Rapat Utama Maesa',
      'Penanggung Jawab': 'Kepala Subbagian Umum',
      'Keterangan': 'Perlu servis berkala freon'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_BMN');

  const fileName = `Template_Import_Aset_BMN_BPS_Minut.${format}`;
  XLSX.writeFile(wb, fileName, { bookType: format });
};

export const downloadInventoryTemplate = (format: 'csv' | 'xlsx' = 'xlsx') => {
  const sampleData = [
    {
      'Kode Barang': '1.01.03.01.080',
      'Nama Barang': 'Kertas HVS A4 80gr PaperOne',
      'Jenis': 'ATK',
      'Subkategori': 'Kertas & Form Cetak',
      'Satuan': 'Rim',
      'Stok Saat Ini': 120,
      'Stok Minimum': 25,
      'Stok Maksimum': 300,
      'Harga Satuan': 56000,
      'Lokasi Rak': 'Rak A',
      'Bin Code': 'WH-A-01-01'
    },
    {
      'Kode Barang': '1.01.03.02.045',
      'Nama Barang': 'Toner Printer HP LaserJet 85A Original',
      'Jenis': 'ATK',
      'Subkategori': 'Tinta & Toner',
      'Satuan': 'Buah',
      'Stok Saat Ini': 12,
      'Stok Minimum': 4,
      'Stok Maksimum': 30,
      'Harga Satuan': 945000,
      'Lokasi Rak': 'Rak B',
      'Bin Code': 'WH-B-02-04'
    },
    {
      'Kode Barang': '1.01.04.01.012',
      'Nama Barang': 'Hand Soap Cair Antiseptik Dettol 4L',
      'Jenis': 'ARK',
      'Subkategori': 'Kebersihan & Sanitasi',
      'Satuan': 'Galon',
      'Stok Saat Ini': 8,
      'Stok Minimum': 3,
      'Stok Maksimum': 20,
      'Harga Satuan': 145000,
      'Lokasi Rak': 'Rak E',
      'Bin Code': 'WH-E-01-02'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Persediaan');

  const fileName = `Template_Import_Persediaan_BPS_Minut.${format}`;
  XLSX.writeFile(wb, fileName, { bookType: format });
};
