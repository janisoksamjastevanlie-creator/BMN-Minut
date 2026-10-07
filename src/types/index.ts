export type SystemRoleName = 'Administrator' | 'Pengelola BMN' | 'Operator' | 'Pimpinan';
export type UserRole = SystemRoleName | string;

export interface RolePermissions {
  viewDashboard: boolean;
  viewAssets: boolean;
  manageAssets: boolean;
  manageMovements: boolean;
  manageMaintenance: boolean;
  manageDisposal: boolean;
  viewInventory: boolean;
  manageInventory: boolean;
  requestSupplies: boolean;
  approveRequests: boolean;
  stockOpname: boolean;
  roomBooking: boolean;
  viewReports: boolean;
  manageUsers: boolean;
  manageRoles: boolean;
  systemSettings: boolean;
}

export interface RoleDefinition {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  badgeClass?: string;
  isSystem: boolean;
  permissions: RolePermissions;
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  nip: string;
  email: string;
  role: UserRole;
  avatar?: string;
  unitKerja: string;
  phone?: string;
  statusAktif?: boolean;
}

export type AssetCondition = 'Baik' | 'Rusak Ringan' | 'Rusak Berat';
export type AssetStatus = 'Aktif' | 'Dalam Pemeliharaan' | 'Dalam Proses Pemindahan' | 'Diusulkan Hapus' | 'Dihapuskan';

export interface OfficeRoom {
  id: string;
  code: string;
  name: string;
  floor: number;
  building: string;
  picName: string;
  picNip: string;
  color: string;
  position3D: [number, number, number];
  size3D: [number, number, number];
  description: string;
  roomType?: 'Ruang Kerja' | 'Ruang Rapat' | 'Ruang Server' | 'Gudang' | 'Layanan Publik' | 'Arsip & Dokumen' | 'Lainnya';
  capacity?: number;
  areaSqm?: number;
}

export interface BmnAsset {
  id: string;
  kodeBarang: string;
  nup: number;
  namaBarang: string;
  kategori: string;
  subkategori?: string;
  merkType: string;
  nomorSeri: string;
  tanggalPerolehan: string;
  tahunPerolehan: number;
  jumlah: number;
  satuan: string;
  nilaiPerolehan: number;
  akumulasiPenyusutan: number;
  nilaiBuku: number;
  kondisi: AssetCondition;
  gedung: string;
  ruanganId: string;
  ruanganNama: string;
  penanggungJawab: string;
  status: AssetStatus;
  fotoUrl?: string;
  keterangan?: string;
  qrCodeUrl?: string;
  barcode: string;
}

export type MovementStatus = 'Pengajuan' | 'Verifikasi' | 'Persetujuan' | 'Pemindahan' | 'Selesai' | 'Ditolak';

export interface AssetMovement {
  id: string;
  nomorTransaksi: string;
  assetId: string;
  assetName: string;
  kodeBarang: string;
  nup: number;
  lokasiAsalId: string;
  lokasiAsalNama: string;
  lokasiTujuanId: string;
  lokasiTujuanNama: string;
  tanggal: string;
  alasan: string;
  pemohon: string;
  penanggungJawab: string;
  status: MovementStatus;
  catatan?: string;
  createdAt: string;
  updatedAt: string;
}

export type MaintenanceStatus = 'Terjadwal' | 'Dalam Proses' | 'Selesai' | 'Ditunda' | 'Dibatalkan';

export interface AssetMaintenance {
  id: string;
  nomorTiket: string;
  assetId: string;
  assetName: string;
  kodeBarang: string;
  nup: number;
  jenisPemeliharaan: string;
  tanggalMulai: string;
  tanggalSelesai?: string;
  teknisi: string;
  vendor: string;
  biaya: number;
  keterangan: string;
  status: MaintenanceStatus;
  ruanganNama: string;
}

export type DisposalStatus = 'Draft' | 'Pengajuan' | 'Verifikasi' | 'Persetujuan' | 'Selesai' | 'Ditolak';

export interface AssetDisposal {
  id: string;
  nomorPengajuan: string;
  assetId: string;
  assetName: string;
  kodeBarang: string;
  nup: number;
  alasan: string;
  kondisiTerakhir: AssetCondition;
  nilaiBuku: number;
  dokumenPendukung?: string;
  status: DisposalStatus;
  tanggalPengajuan: string;
  penyetuju?: string;
}

export type InventoryType = 'ATK' | 'ARK';

export interface InventoryItem {
  id: string;
  kodeBarang: string;
  nama: string;
  kategori: string;
  subkategori: string;
  jenis: InventoryType;
  satuan: string;
  stokAwal: number;
  stokSaatIni: number;
  stokMinimum: number;
  stokMaksimum: number;
  hargaSatuan: number;
  totalNilai: number;
  lokasiGudang: string;
  rak: string;
  shelf: string;
  binCode: string; // e.g. WH-A-02-05
  barcode: string;
  status: 'Aman' | 'Menipis' | 'Habis';
  ratarataPenggunaanBulanan: number;
  fotoUrl?: string;
}

export interface StockInTransaction {
  id: string;
  nomorTransaksi: string;
  tanggal: string;
  nomorDokumen: string;
  sumber: string; // e.g. 'DIPA BPS 2026', 'Pengadaan Mandiri'
  itemId: string;
  namaBarang: string;
  kategori: string;
  jenis: InventoryType;
  jumlah: number;
  satuan: string;
  hargaSatuan: number;
  totalHarga: number;
  lokasiRak: string;
  petugas: string;
  keterangan: string;
  dokumenUrl?: string;
}

export interface StockOutTransaction {
  id: string;
  nomorTransaksi: string;
  tanggal: string;
  unitKerja: string;
  ruangan: string;
  pemohon: string;
  itemId: string;
  namaBarang: string;
  jenis: InventoryType;
  jumlah: number;
  satuan: string;
  keperluan: string;
  petugas: string;
  keterangan?: string;
}

export type RequestStatus = 'Draft' | 'Diajukan' | 'Diverifikasi' | 'Disetujui' | 'Diproses' | 'Selesai' | 'Ditolak';

export interface InventoryRequest {
  id: string;
  nomorPermintaan: string;
  tanggal: string;
  pemohonNama: string;
  unitKerja: string;
  ruangan: string;
  itemId: string;
  namaBarang: string;
  jumlahDiminta: number;
  jumlahDisetujui?: number;
  satuan: string;
  keperluan: string;
  prioritas: 'Rendah' | 'Normal' | 'Tinggi' | 'Mendesak';
  catatan?: string;
  status: RequestStatus;
}

export interface StockCardEntry {
  id: string;
  itemId: string;
  tanggal: string;
  nomorTransaksi: string;
  jenisTransaksi: 'SALDO_AWAL' | 'MASUK' | 'KELUAR' | 'PENYESUAIAN_OPNAME';
  masuk: number;
  keluar: number;
  saldo: number;
  keterangan: string;
  petugas: string;
}

export interface StockOpname {
  id: string;
  nomorOpname: string;
  tanggal: string;
  periode: string; // e.g. 'Triwulan I 2026'
  petugas: string;
  status: 'Draft' | 'Dalam Proses' | 'Menunggu Approval' | 'Selesai';
  items: StockOpnameItem[];
  catatan?: string;
}

export interface StockOpnameItem {
  id: string;
  itemId: string;
  kodeBarang: string;
  namaBarang: string;
  satuan: string;
  stokSistem: number;
  stokFisik: number;
  selisih: number; // stokFisik - stokSistem
  kondisi: 'Baik' | 'Rusak' | 'Kadaluarsa';
  keterangan: string;
  statusPenyesuaian?: 'Belum' | 'Disesuaikan';
}

export interface DocumentItem {
  id: string;
  nomorDokumen: string;
  judul: string;
  jenis: 'Berita Acara' | 'Dokumen Perolehan' | 'Dokumen Pemindahan' | 'Dokumen Pemeliharaan' | 'Dokumen Penghapusan' | 'Dokumen Barang Masuk' | 'Dokumen Barang Keluar' | 'Dokumen Stock Opname' | 'Dokumen Pengadaan';
  tanggal: string;
  tahun: number;
  fileSize: string;
  uploader: string;
  tags: string[];
  status: 'Sah' | 'Menunggu TTD' | 'Arsip';
  fileName?: string;
  fileType?: string;
  fileDataUrl?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  aktivitas: string; // e.g. 'Input Barang Masuk', 'Update Kondisi Aset'
  modul: 'ASET_BMN' | 'PERSEDIAAN' | 'AUTH' | 'SISTEM' | 'DOKUMEN';
  tanggal: string;
  waktu: string;
  ipAddress: string;
  detail: string;
}

export interface NotificationItem {
  id: string;
  type: 'WARNING_STOK' | 'HABIS_STOK' | 'ASET_RUSAK' | 'PERMINTAAN_BARU' | 'PEMELIHARAAN' | 'TRANSAKSI' | 'SISTEM' | 'PERINGATAN';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
}

export interface WarehouseRack {
  id: string;
  code: string; // e.g. 'Rak A'
  name: string;
  category: string;
  color: string;
  position3D: [number, number, number];
  shelvesCount: number;
}
