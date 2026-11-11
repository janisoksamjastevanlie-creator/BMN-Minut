/**
 * Foto aset BMN dan persediaan memakai gambar putih polos sampai foto asli
 * diunggah. Preset hanya menjadi label jenis barang, bukan foto stok internet.
 */
import { normalizePhotoUrl } from './normalizeUrl';

/** Gambar putih polos di /public, dipakai untuk semua foto aset & persediaan. */
export const FOTO_PUTIH = '/foto-putih.svg';

export const isStockPhotoUrl = (url?: string | null): boolean => {
  if (!url) return false;
  try {
    return new URL(url).hostname === 'images.unsplash.com';
  } catch {
    return false;
  }
};

/**
 * URL foto untuk ditampilkan. Foto unggahan/tautan asli dipertahankan,
 * sedangkan foto stok lama dan foto kosong diganti gambar putih polos.
 */
export const resolvePhotoUrl = (url?: string | null): string => {
  const normalized = normalizePhotoUrl(url);
  if (!normalized || isStockPhotoUrl(normalized)) return FOTO_PUTIH;
  return normalized;
};

export const getAssetPhotoUrl = (_namaBarang: string, _kategori?: string): string => FOTO_PUTIH;

export const getInventoryPhotoUrl = (_nama: string, _subkategori?: string, _jenis?: string): string => FOTO_PUTIH;

const withWhitePhoto = (labels: string[]) => labels.map(label => ({ label, url: FOTO_PUTIH }));

export const ASSET_PHOTO_PRESETS = withWhitePhoto([
  'Laptop Lenovo / Dell / Asus',
  'PC Desktop & Monitor',
  'PC All-in-One',
  'Printer HP / Canon Laser',
  'Printer Epson Inkjet',
  'Scanner Dokumen Fujitsu',
  'Proyektor Epson LCD',
  'Kamera DSLR Canon EOS',
  'Server Dell PowerEdge',
  'AC Daikin / Panasonic',
  'Meja Kerja Eselon / Staf',
  'Kursi Kerja Ergonomis',
  'Lemari Arsip & Filing Cabinet',
  'Mobil Dinas Operasional',
  'Motor Dinas Honda Vario',
  'Drone DJI Pemetaan'
]);

export const INVENTORY_PHOTO_PRESETS = withWhitePhoto([
  'Kertas HVS A4 / F4',
  'Pulpen / Bolpoin / Gel Pen',
  'Spidol / Highlighter',
  'Map / Ordner / Box File',
  'Stapler / Staples / Cutter',
  'Tinta & Toner Printer',
  'Lakban & Selotip',
  'Tisu Kotak / Roll Paseo',
  'Sabun Cuci Tangan & Disinfektan',
  'Pembersih Lantai Karbol & Kaca',
  'Sapu & Pel Lantai',
  'Plastik Sampah Hitam',
  'Pengharum Ruangan Glade',
  'Kopi, Teh & Gula Pantry'
]);
