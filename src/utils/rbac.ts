import { ActiveView } from '../context/AppContext';
import { RolePermissions, User } from '../types';

export interface ViewAccessConfig {
  view: ActiveView;
  label: string;
  category: 'Dashboard' | 'BMN & Aset' | 'Persediaan ATK' | 'Layanan' | 'Sistem & Keamanan';
  requiredPermissions: (keyof RolePermissions)[];
  matchMode: 'any' | 'all';
  description: string;
}

export const VIEW_ACCESS_CONFIGS: Record<ActiveView, ViewAccessConfig> = {
  landing: {
    view: 'landing',
    label: 'Landing Page',
    category: 'Dashboard',
    requiredPermissions: [],
    matchMode: 'any',
    description: 'Halaman selamat datang publik SIMAN BPS.'
  },
  login: {
    view: 'login',
    label: 'Masuk Sistem',
    category: 'Dashboard',
    requiredPermissions: [],
    matchMode: 'any',
    description: 'Halaman autentikasi login pengguna.'
  },
  dashboard: {
    view: 'dashboard',
    label: 'Dashboard Utama',
    category: 'Dashboard',
    requiredPermissions: ['viewDashboard'],
    matchMode: 'any',
    description: 'Ringkasan metrik statistik aset, persediaan, dan operasional dinas.'
  },
  executive: {
    view: 'executive',
    label: 'Dashboard Pimpinan',
    category: 'Dashboard',
    requiredPermissions: ['approveRequests', 'viewDashboard'],
    matchMode: 'any',
    description: 'Pemantauan eksekutif pimpinan, validasi disposisi, dan ringkasan nilai aset BPS.'
  },
  assets: {
    view: 'assets',
    label: 'Semua Aset BMN',
    category: 'BMN & Aset',
    requiredPermissions: ['viewAssets', 'manageAssets'],
    matchMode: 'any',
    description: 'Master inventarisasi Barang Milik Negara (BMN) dan pencatatan NUP.'
  },
  rooms: {
    view: 'rooms',
    label: 'Manajemen Ruangan & DBR',
    category: 'BMN & Aset',
    requiredPermissions: ['manageAssets'],
    matchMode: 'any',
    description: 'Pengelolaan master ruangan kerja BPS, penanggung jawab (PIC), dan lembar Daftar Barang Ruangan (DBR) resmi (Khusus Pimpinan, Administrator, dan Pengelola BMN).'
  },
  'office-3d': {
    view: 'office-3d',
    label: '3D Asset Mapping',
    category: 'BMN & Aset',
    requiredPermissions: ['viewAssets', 'manageAssets'],
    matchMode: 'any',
    description: 'Denah visualisasi 3D twin penempatan aset di setiap ruangan kantor.'
  },
  movements: {
    view: 'movements',
    label: 'Pemindahan Aset',
    category: 'BMN & Aset',
    requiredPermissions: ['manageMovements'],
    matchMode: 'any',
    description: 'Pengajuan dan persetujuan mutasi aset antar ruangan kerja.'
  },
  maintenance: {
    view: 'maintenance',
    label: 'Pemeliharaan Aset',
    category: 'BMN & Aset',
    requiredPermissions: ['manageMaintenance'],
    matchMode: 'any',
    description: 'Jadwal servis berkala, tiket perbaikan, dan riwayat pemeliharaan fisik aset.'
  },
  disposal: {
    view: 'disposal',
    label: 'Penghapusan BMN',
    category: 'BMN & Aset',
    requiredPermissions: ['manageDisposal'],
    matchMode: 'any',
    description: 'Pengusulan dan proses penghapusan aset BMN yang rusak berat atau hilang.'
  },
  inventory: {
    view: 'inventory',
    label: 'Master Persediaan',
    category: 'Persediaan ATK',
    requiredPermissions: ['viewInventory', 'manageInventory'],
    matchMode: 'any',
    description: 'Katalog stok barang persediaan habis pakai (ATK/ARK) kantor BPS.'
  },
  'warehouse-3d': {
    view: 'warehouse-3d',
    label: 'Gudang 3D Digital Twin',
    category: 'Persediaan ATK',
    requiredPermissions: ['viewInventory', 'manageInventory'],
    matchMode: 'any',
    description: 'Visualisasi tata letak Rak A s/d E gudang logistik persediaan BPS.'
  },
  requests: {
    view: 'requests',
    label: 'Permohonan Barang (ATK)',
    category: 'Persediaan ATK',
    requiredPermissions: ['requestSupplies', 'approveRequests'],
    matchMode: 'any',
    description: 'Alur pengajuan Surat Permintaan Barang (SPB) dan verifikasi disposisi.'
  },
  'stock-card': {
    view: 'stock-card',
    label: 'Kartu Stok Digital',
    category: 'Persediaan ATK',
    requiredPermissions: ['viewInventory', 'manageInventory'],
    matchMode: 'any',
    description: 'Histori mutasi penerimaan dan pengeluaran kartu persediaan barang.'
  },
  'stock-opname': {
    view: 'stock-opname',
    label: 'Stock Opname Fisik',
    category: 'Persediaan ATK',
    requiredPermissions: ['stockOpname'],
    matchMode: 'any',
    description: 'Pencocokan fisik buku vs gudang dan berita acara opname persediaan.'
  },
  documents: {
    view: 'documents',
    label: 'Dokumen & BAST',
    category: 'Layanan',
    requiredPermissions: ['viewReports'],
    matchMode: 'any',
    description: 'Arsip berkas Berita Acara Serah Terima, surat keputusan, dan dokumen pendukung.'
  },
  reports: {
    view: 'reports',
    label: 'Laporan Resmi BPS',
    category: 'Layanan',
    requiredPermissions: ['viewReports'],
    matchMode: 'any',
    description: 'Cetak dan ekspor buku persediaan, daftar mutasi, dan rekap aset dinas.'
  },
  'audit-trail': {
    view: 'audit-trail',
    label: 'Audit Trail Log',
    category: 'Sistem & Keamanan',
    requiredPermissions: ['systemSettings'],
    matchMode: 'any',
    description: 'Catatan rekam jejak digital aktivitas pengguna dan keamanan sistem.'
  },
  users: {
    view: 'users',
    label: 'Manajemen Pengguna & RBAC',
    category: 'Sistem & Keamanan',
    requiredPermissions: ['manageUsers', 'manageRoles'],
    matchMode: 'any',
    description: 'Pengelolaan data pegawai, perizinan akun, dan matriks hak akses peran.'
  },
  settings: {
    view: 'settings',
    label: 'Pengaturan Sistem',
    category: 'Sistem & Keamanan',
    requiredPermissions: ['systemSettings'],
    matchMode: 'any',
    description: 'Konfigurasi instansi BPS, cadangan data (backup/restore), dan parameter aplikasi.'
  }
};

export const canAccessView = (
  view: ActiveView,
  hasPermission: (perm: keyof RolePermissions) => boolean,
  currentUser?: User | null
): boolean => {
  if (view === 'landing' || view === 'login') return true;
  if (!currentUser) return false;

  // Administrator has absolute access to every view
  if (currentUser.role === 'Administrator') return true;

  // Kebijakan Khusus: Manajemen ruangan hanya diakses Pimpinan, Administrator dan Pengelola BMN
  if (view === 'rooms') {
    const allowedRoomRoles: string[] = ['Administrator', 'Pengelola BMN', 'Pimpinan'];
    return allowedRoomRoles.includes(currentUser.role);
  }

  const config = VIEW_ACCESS_CONFIGS[view];
  if (!config || config.requiredPermissions.length === 0) return true;

  if (config.matchMode === 'all') {
    return config.requiredPermissions.every(p => hasPermission(p));
  } else {
    return config.requiredPermissions.some(p => hasPermission(p));
  }
};

export const getFirstAllowedView = (
  hasPermission: (perm: keyof RolePermissions) => boolean,
  currentUser?: User | null
): ActiveView => {
  const priorityOrder: ActiveView[] = [
    'dashboard',
    'executive',
    'assets',
    'inventory',
    'requests',
    'reports',
    'documents'
  ];

  for (const v of priorityOrder) {
    if (canAccessView(v, hasPermission, currentUser)) {
      return v;
    }
  }
  return 'dashboard';
};
