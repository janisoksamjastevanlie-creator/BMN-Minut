import {
  User,
  RoleDefinition,
  OfficeRoom,
  BmnAsset,
  AssetMovement,
  AssetMaintenance,
  AssetDisposal,
  InventoryItem,
  StockInTransaction,
  StockOutTransaction,
  InventoryRequest,
  StockOpname,
  DocumentItem,
  AuditLog,
  NotificationItem,
  WarehouseRack
} from '../types';
import { getAssetPhotoUrl, getInventoryPhotoUrl } from '../utils/assetImages';

export const INITIAL_USERS: User[] = [
  {
    id: 'usr-1',
    name: 'Ir. Hendra Kawilarang, M.Si',
    nip: '197405121998031002',
    email: 'hendra.k@bps.go.id',
    role: 'Pimpinan',
    unitKerja: 'Kepala BPS Kabupaten Minahasa Utara',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 'usr-2',
    name: 'Christian Pangemanan, S.ST, M.Stat',
    nip: '198503202008011003',
    email: 'christian.p@bps.go.id',
    role: 'Pengelola BMN',
    unitKerja: 'Subbagian Umum & Perlengkapan BMN',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 'usr-3',
    name: 'Siti Rahmawati Sompie, A.Md',
    nip: '199208152014022001',
    email: 'siti.sompie@bps.go.id',
    role: 'Operator',
    unitKerja: 'Pengelola Gudang Persediaan & ATK',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80'
  },
  {
    id: 'usr-4',
    name: 'Administrator TI BPS Minut',
    nip: '199011042013011005',
    email: 'admin.minut@bps.go.id',
    role: 'Administrator',
    unitKerja: 'Fungsi IPDS (Integrasi Pengolahan & Diseminasi Statistik)',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80'
  }
];

export const INITIAL_ROLES: RoleDefinition[] = [
  {
    id: 'role-admin',
    name: 'Administrator',
    code: 'ADMIN',
    description: 'Akses penuh tanpa batas ke semua modul sistem, pengaturan hak akses RBAC, audit log, dan integrasi.',
    color: 'purple',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    isSystem: true,
    permissions: {
      viewDashboard: true,
      viewAssets: true,
      manageAssets: true,
      manageMovements: true,
      manageMaintenance: true,
      manageDisposal: true,
      viewInventory: true,
      manageInventory: true,
      requestSupplies: true,
      approveRequests: true,
      stockOpname: true,
      roomBooking: true,
      viewReports: true,
      manageUsers: true,
      manageRoles: true,
      systemSettings: true,
    },
    createdAt: '2026-01-01'
  },
  {
    id: 'role-pengelola',
    name: 'Pengelola BMN',
    code: 'BMN_MGR',
    description: 'Pengelolaan aset BMN, mutasi ruangan, pemeliharaan fisik, dan usulan penghapusan BMN.',
    color: 'blue',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    isSystem: true,
    permissions: {
      viewDashboard: true,
      viewAssets: true,
      manageAssets: true,
      manageMovements: true,
      manageMaintenance: true,
      manageDisposal: true,
      viewInventory: true,
      manageInventory: false,
      requestSupplies: true,
      approveRequests: false,
      stockOpname: false,
      roomBooking: true,
      viewReports: true,
      manageUsers: false,
      manageRoles: false,
      systemSettings: false,
    },
    createdAt: '2026-01-01'
  },
  {
    id: 'role-operator',
    name: 'Operator',
    code: 'OPERATOR',
    description: 'Pengelolaan persediaan ATK & ARK, input transaksi stok keluar/masuk, dan opname fisik gudang.',
    color: 'cyan',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    isSystem: true,
    permissions: {
      viewDashboard: true,
      viewAssets: true,
      manageAssets: false,
      manageMovements: false,
      manageMaintenance: false,
      manageDisposal: false,
      viewInventory: true,
      manageInventory: true,
      requestSupplies: true,
      approveRequests: false,
      stockOpname: true,
      roomBooking: true,
      viewReports: true,
      manageUsers: false,
      manageRoles: false,
      systemSettings: false,
    },
    createdAt: '2026-01-01'
  },
  {
    id: 'role-pimpinan',
    name: 'Pimpinan',
    code: 'PIMPINAN',
    description: 'Validasi permohonan, disposisi persetujuan barang & mutasi, pengesahan laporan, dan statistik eksekutif.',
    color: 'amber',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    isSystem: true,
    permissions: {
      viewDashboard: true,
      viewAssets: true,
      manageAssets: false,
      manageMovements: true,
      manageMaintenance: false,
      manageDisposal: true,
      viewInventory: true,
      manageInventory: false,
      requestSupplies: false,
      approveRequests: true,
      stockOpname: false,
      roomBooking: true,
      viewReports: true,
      manageUsers: false,
      manageRoles: false,
      systemSettings: false,
    },
    createdAt: '2026-01-01'
  },
  {
    id: 'role-auditor',
    name: 'Auditor Internal',
    code: 'AUDITOR',
    description: 'Pemeriksaan kepatuhan, review laporan mutasi & opname, audit trail log, dan pemantauan kondisi aset.',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    isSystem: false,
    permissions: {
      viewDashboard: true,
      viewAssets: true,
      manageAssets: false,
      manageMovements: false,
      manageMaintenance: false,
      manageDisposal: false,
      viewInventory: true,
      manageInventory: false,
      requestSupplies: false,
      approveRequests: false,
      stockOpname: false,
      roomBooking: false,
      viewReports: true,
      manageUsers: false,
      manageRoles: false,
      systemSettings: false,
    },
    createdAt: '2026-02-15'
  }
];

export const OFFICE_ROOMS: OfficeRoom[] = [
  {
    id: 'rm-101',
    code: 'R-101',
    name: 'Ruang Kepala BPS',
    floor: 2,
    building: 'Gedung Utama Lt. 2',
    picName: 'Ir. Hendra Kawilarang, M.Si',
    picNip: '197405121998031002',
    color: '#3b82f6',
    position3D: [0, 2.5, 0],
    size3D: [3.5, 1.8, 3.2],
    description: 'Ruang kerja Kepala BPS Kabupaten Minahasa Utara & Ruang Tamu Pimpinan'
  },
  {
    id: 'rm-102',
    code: 'R-102',
    name: 'Tata Usaha & Keuangan',
    floor: 1,
    building: 'Gedung Utama Lt. 1',
    picName: 'Deisy Rondonuwu, S.E.',
    picNip: '198104192006042003',
    color: '#06b6d4',
    position3D: [-4, 0.9, -2.5],
    size3D: [4.2, 1.8, 3.5],
    description: 'Pengelolaan administrasi surat, kepegawaian, dan perbendaharaan'
  },
  {
    id: 'rm-103',
    code: 'R-103',
    name: 'Subbagian Umum',
    floor: 1,
    building: 'Gedung Utama Lt. 1',
    picName: 'Christian Pangemanan, S.ST',
    picNip: '198503202008011003',
    color: '#10b981',
    position3D: [-4, 0.9, 2.5],
    size3D: [4.2, 1.8, 3.5],
    description: 'Pengelolaan rumah tangga, sarana prasarana BMN & pengadaan'
  },
  {
    id: 'rm-104',
    code: 'R-104',
    name: 'Statistik Sosial',
    floor: 1,
    building: 'Gedung Utama Lt. 1',
    picName: 'Michael Wowor, S.Si',
    picNip: '198709122010011008',
    color: '#6366f1',
    position3D: [4, 0.9, -2.5],
    size3D: [4.2, 1.8, 3.5],
    description: 'Survei Susenas, Sakernas, Podes, dan statistik kesejahteraan rakyat'
  },
  {
    id: 'rm-105',
    code: 'R-105',
    name: 'Statistik Produksi',
    floor: 1,
    building: 'Gedung Utama Lt. 1',
    picName: 'Ferry Kuntag, S.P.',
    picNip: '198302142009021004',
    color: '#8b5cf6',
    position3D: [4, 0.9, 2.5],
    size3D: [4.2, 1.8, 3.5],
    description: 'Sensus Pertanian, survei industri manufaktur, pertambangan, dan konstruksi'
  },
  {
    id: 'rm-106',
    code: 'R-106',
    name: 'Statistik Distribusi',
    floor: 2,
    building: 'Gedung Utama Lt. 2',
    picName: 'Grace Rotinsulu, S.E.',
    picNip: '198606052008042002',
    color: '#ec4899',
    position3D: [-4, 2.5, -2.5],
    size3D: [4.2, 1.8, 3.5],
    description: 'Statistik perdagangan, inflasi harga konsumen, hotel, dan transportasi Minut'
  },
  {
    id: 'rm-107',
    code: 'R-107',
    name: 'Neraca Wilayah & Analisis',
    floor: 2,
    building: 'Gedung Utama Lt. 2',
    picName: 'Johan Mandagi, S.E.',
    picNip: '198401222007011001',
    color: '#f59e0b',
    position3D: [-4, 2.5, 2.5],
    size3D: [4.2, 1.8, 3.5],
    description: 'Penyusunan PDRB Kabupaten Minahasa Utara dan tabel I/O'
  },
  {
    id: 'rm-108',
    code: 'R-108',
    name: 'IPDS & Server Room',
    floor: 2,
    building: 'Gedung Utama Lt. 2',
    picName: 'Administrator TI BPS Minut',
    picNip: '199011042013011005',
    color: '#14b8a6',
    position3D: [4, 2.5, -2.5],
    size3D: [4.2, 1.8, 3.5],
    description: 'Infrastruktur TI, Jaringan LAN/WAN, Server SIMAN & Diseminasi Statistik'
  },
  {
    id: 'rm-109',
    code: 'R-109',
    name: 'Gudang Persediaan ATK/ARK',
    floor: 1,
    building: 'Gedung Logistik Lt. 1',
    picName: 'Siti Rahmawati Sompie, A.Md',
    picNip: '199208152014022001',
    color: '#eab308',
    position3D: [7.5, 0.9, 0],
    size3D: [3.2, 1.8, 5.0],
    description: 'Pusat penyimpanan ATK, ARK, formulir sensus, dan perlengkapan dinas'
  },
  {
    id: 'rm-110',
    code: 'R-110',
    name: 'Ruang Arsip & Dokumen Sensus',
    floor: 1,
    building: 'Gedung Logistik Lt. 1',
    picName: 'Oktavianus Lontoh',
    picNip: '198810152011011007',
    color: '#64748b',
    position3D: [7.5, 2.5, 0],
    size3D: [3.2, 1.8, 5.0],
    description: 'Penyimpanan arsip berkas DIPA, SPJ, dan kuesioner sensus 10 tahunan'
  },
  {
    id: 'rm-111',
    code: 'R-111',
    name: 'Aula Pertemuan & Rapat',
    floor: 2,
    building: 'Gedung Utama Lt. 2',
    picName: 'Christian Pangemanan, S.ST',
    picNip: '198503202008011003',
    color: '#a855f7',
    position3D: [4, 2.5, 2.5],
    size3D: [4.2, 1.8, 3.5],
    description: 'Aula pelatihan petugas sensus, rapat dinas, dan rilis BRS Statistik'
  },
  {
    id: 'rm-112',
    code: 'R-112',
    name: 'Pelayanan Statistik Terpadu (PST)',
    floor: 1,
    building: 'Gedung Utama Lt. 1',
    picName: 'Novita Lumempouw, S.Kom',
    picNip: '199312012015032004',
    color: '#38bdf8',
    position3D: [0, 0.9, -2.5],
    size3D: [3.5, 1.8, 2.5],
    description: 'Front office pelayanan publik data statistik bagi OPD Pemkab & Mahasiswa'
  }
];

export const WAREHOUSE_RACKS: WarehouseRack[] = [
  {
    id: 'rack-a',
    code: 'Rak A',
    name: 'Rak A - Kertas & Media Cetak',
    category: 'Kertas HVS, F4, Photo Paper, Continuous Form',
    color: '#3b82f6',
    position3D: [-3.5, 1, 0],
    shelvesCount: 4
  },
  {
    id: 'rack-b',
    code: 'Rak B',
    name: 'Rak B - Alat Tulis Kantor (ATK)',
    category: 'Pulpen, Pensil, Spidol, Lem, Gunting, Ordner',
    color: '#06b6d4',
    position3D: [-1.75, 1, 0],
    shelvesCount: 4
  },
  {
    id: 'rack-c',
    code: 'Rak C',
    name: 'Rak C - Tinta & Toner Printer',
    category: 'Cartridge HP, Epson, Canon, Ribbon Pita',
    color: '#8b5cf6',
    position3D: [0, 1, 0],
    shelvesCount: 4
  },
  {
    id: 'rack-d',
    code: 'Rak D',
    name: 'Rak D - Perlengkapan Kebersihan (ARK)',
    category: 'Sapu, Pel, Sabun Cuci, Karbol, Kemoceng, Tisu',
    color: '#10b981',
    position3D: [1.75, 1, 0],
    shelvesCount: 4
  },
  {
    id: 'rack-e',
    code: 'Rak E',
    name: 'Rak E - Perlengkapan Pantry & Operasional',
    category: 'Gelas, Plastik Sampah, Refill Galon, Pengharum Ruangan',
    color: '#f59e0b',
    position3D: [3.5, 1, 0],
    shelvesCount: 4
  }
];

// Helper to generate 500 realistic BMN Assets
export function generateInitialBmnAssets(): BmnAsset[] {
  const assets: BmnAsset[] = [];
  const templates = [
    { name: 'Laptop ASUS ExpertBook B1400', cat: 'Peralatan TI', sub: 'Komputer Jinjing', merk: 'ASUS', val: 14500000, prefix: '3.10.01.02.001' },
    { name: 'Laptop Lenovo ThinkPad L14 Gen 4', cat: 'Peralatan TI', sub: 'Komputer Jinjing', merk: 'Lenovo', val: 18200000, prefix: '3.10.01.02.002' },
    { name: 'Laptop Dell Latitude 3420 Core i7', cat: 'Peralatan TI', sub: 'Komputer Jinjing', merk: 'Dell', val: 16800000, prefix: '3.10.01.02.003' },
    { name: 'PC Desktop HP ProDesk 400 G7 MT', cat: 'Peralatan TI', sub: 'Personal Computer', merk: 'HP', val: 12500000, prefix: '3.10.01.01.001' },
    { name: 'PC All-in-One Lenovo IdeaCentre AIO 3', cat: 'Peralatan TI', sub: 'Personal Computer', merk: 'Lenovo', val: 11000000, prefix: '3.10.01.01.002' },
    { name: 'Printer HP LaserJet Pro M404dn', cat: 'Peralatan TI', sub: 'Printer Laser', merk: 'HP', val: 5600000, prefix: '3.10.01.03.001' },
    { name: 'Printer Multifungsi Epson EcoTank L15150 A3', cat: 'Peralatan TI', sub: 'Printer Inkjet', merk: 'Epson', val: 15200000, prefix: '3.10.01.03.002' },
    { name: 'Scanner Fujitsu fi-7160 High Speed', cat: 'Peralatan TI', sub: 'Scanner Dokumen', merk: 'Fujitsu', val: 14800000, prefix: '3.10.01.04.001' },
    { name: 'Scanner Epson WorkForce DS-530 II', cat: 'Peralatan TI', sub: 'Scanner Dokumen', merk: 'Epson', val: 7400000, prefix: '3.10.01.04.002' },
    { name: 'Proyektor Epson EB-2250U 5000 Lumens', cat: 'Peralatan Kantor', sub: 'Proyektor LCD', merk: 'Epson', val: 21500000, prefix: '3.05.01.05.001' },
    { name: 'Kamera DSLR Canon EOS 90D Kit 18-135mm', cat: 'Peralatan Kantor', sub: 'Kamera Digital', merk: 'Canon', val: 24500000, prefix: '3.05.02.01.001' },
    { name: 'Server Rak Dell PowerEdge R440 Xeon Silver', cat: 'Peralatan TI', sub: 'Komputer Server', merk: 'Dell', val: 68500000, prefix: '3.10.02.01.001' },
    { name: 'UPS Online Riello Dialog Vision 3000VA', cat: 'Peralatan TI', sub: 'UPS Power', merk: 'Riello', val: 12400000, prefix: '3.10.03.01.001' },
    { name: 'AC Split Daikin Inverter 2 PK Flash', cat: 'Peralatan Kantor', sub: 'Pendingin Ruangan', merk: 'Daikin', val: 9800000, prefix: '3.05.02.04.001' },
    { name: 'AC Split Panasonic 1.5 PK Econavi', cat: 'Peralatan Kantor', sub: 'Pendingin Ruangan', merk: 'Panasonic', val: 6900000, prefix: '3.05.02.04.002' },
    { name: 'Meja Kerja Eselon IV Kayu Jati L-Shape', cat: 'Mebel / Furnitur', sub: 'Meja Kerja Kayu', merk: 'Indachi', val: 4500000, prefix: '3.05.01.01.001' },
    { name: 'Kursi Kerja Ergonomis Hydrolic Staff', cat: 'Mebel / Furnitur', sub: 'Kursi Kerja', merk: 'Chitose', val: 1850000, prefix: '3.05.01.02.001' },
    { name: 'Lemari Arsip Besi 4 Pintu Fireproof', cat: 'Mebel / Furnitur', sub: 'Lemari Besi', merk: 'Lion', val: 6200000, prefix: '3.05.01.03.001' },
    { name: 'Filing Cabinet 4 Laci Lion Metal', cat: 'Mebel / Furnitur', sub: 'Filing Cabinet', merk: 'Lion', val: 3200000, prefix: '3.05.01.03.002' },
    { name: 'Toyota Kijang Innova Venturer 2.4 AT (Mobil Dinas)', cat: 'Kendaraan Bermotor', sub: 'Kendaraan Roda 4', merk: 'Toyota', val: 420000000, prefix: '3.01.01.01.001' },
    { name: 'Toyota Hilux Double Cabin 4x4 (Operasional Lapangan)', cat: 'Kendaraan Bermotor', sub: 'Kendaraan Roda 4', merk: 'Toyota', val: 385000000, prefix: '3.01.01.01.002' },
    { name: 'Honda Vario 160 CBS (Motor Dinas Lapangan)', cat: 'Kendaraan Bermotor', sub: 'Kendaraan Roda 2', merk: 'Honda', val: 27500000, prefix: '3.01.02.01.001' },
    { name: 'Drone DJI Mavic 3 Enterprise (Pemetaan Statistik)', cat: 'Peralatan Khusus', sub: 'UAV Pemetaan', merk: 'DJI', val: 56000000, prefix: '3.08.01.01.001' },
    { name: 'Sound System Wireless Portable Baretone 15 Inch', cat: 'Peralatan Kantor', sub: 'Audio Visual', merk: 'Baretone', val: 4200000, prefix: '3.05.02.06.001' }
  ];

  let idCounter = 1;
  for (let i = 0; i < 500; i++) {
    const tmpl = templates[i % templates.length];
    const nup = Math.floor(i / templates.length) + 1;
    const room = OFFICE_ROOMS[i % OFFICE_ROOMS.length];
    
    // Conditions distribution: ~85% Baik, ~11% Rusak Ringan, ~4% Rusak Berat
    let kondisi: 'Baik' | 'Rusak Ringan' | 'Rusak Berat' = 'Baik';
    let status: 'Aktif' | 'Dalam Pemeliharaan' | 'Dalam Proses Pemindahan' | 'Diusulkan Hapus' = 'Aktif';
    
    if (i % 23 === 0) {
      kondisi = 'Rusak Berat';
      status = i % 2 === 0 ? 'Diusulkan Hapus' : 'Dalam Pemeliharaan';
    } else if (i % 9 === 0) {
      kondisi = 'Rusak Ringan';
      status = i % 3 === 0 ? 'Dalam Pemeliharaan' : 'Aktif';
    } else if (i % 17 === 0) {
      status = 'Dalam Proses Pemindahan';
    }

    const tahun = 2020 + (i % 6);
    const bulan = String((i % 12) + 1).padStart(2, '0');
    const tgl = String((i % 28) + 1).padStart(2, '0');
    const penyusutanPct = Math.min(0.8, (2026 - tahun) * 0.15);
    const akumulasi = Math.round(tmpl.val * penyusutanPct);
    const nilaiBuku = Math.max(1, tmpl.val - akumulasi);

    assets.push({
      id: `bmn-${idCounter}`,
      kodeBarang: tmpl.prefix,
      nup: nup,
      namaBarang: tmpl.name,
      kategori: tmpl.cat,
      subkategori: tmpl.sub,
      merkType: `${tmpl.merk} Series-${(idCounter % 90) + 10}`,
      nomorSeri: `SN-BPS7106-${tmpl.merk.substring(0, 3).toUpperCase()}-${String(1000 + i)}`,
      tanggalPerolehan: `${tahun}-${bulan}-${tgl}`,
      tahunPerolehan: tahun,
      jumlah: 1,
      satuan: 'Unit',
      nilaiPerolehan: tmpl.val,
      akumulasiPenyusutan: akumulasi,
      nilaiBuku: nilaiBuku,
      kondisi: kondisi,
      gedung: room.building,
      ruanganId: room.id,
      ruanganNama: room.name,
      penanggungJawab: room.picName,
      status: status,
      fotoUrl: getAssetPhotoUrl(tmpl.name, tmpl.cat),
      barcode: `7106${tmpl.prefix.replace(/\./g, '')}${String(nup).padStart(4, '0')}`,
      keterangan: `Aset BMN terdaftar pada DIPA BPS Kabupaten Minahasa Utara Tahun Anggaran ${tahun}`
    });
    idCounter++;
  }

  return assets;
}

// Generate 200 realistic Inventory Items (ATK & ARK)
export function generateInitialInventoryItems(): InventoryItem[] {
  const items: InventoryItem[] = [];
  const atkTemplates = [
    { nama: 'Kertas HVS Sinar Dunia A4 80gr', sub: 'Kertas & Kebutuhan Cetak', sat: 'Rim', harga: 58000, rak: 'Rak A', min: 25, max: 200, avg: 45 },
    { nama: 'Kertas HVS PaperOne F4/Folio 75gr', sub: 'Kertas & Kebutuhan Cetak', sat: 'Rim', harga: 62000, rak: 'Rak A', min: 20, max: 150, avg: 35 },
    { nama: 'Kertas HVS Natural A4 70gr', sub: 'Kertas & Kebutuhan Cetak', sat: 'Rim', harga: 49000, rak: 'Rak A', min: 15, max: 100, avg: 20 },
    { nama: 'Kertas Continuous Form 9.5 x 11 2 Ply', sub: 'Kertas & Kebutuhan Cetak', sat: 'Box', harga: 235000, rak: 'Rak A', min: 5, max: 30, avg: 4 },
    { nama: 'Kertas Photo Glossy A4 210gr', sub: 'Kertas & Kebutuhan Cetak', sat: 'Pack', harga: 42000, rak: 'Rak A', min: 8, max: 40, avg: 6 },
    { nama: 'Pulpen Standard AE7 0.5mm Hitam', sub: 'Alat Tulis Kantor', sat: 'Lusin', harga: 32000, rak: 'Rak B', min: 12, max: 80, avg: 22 },
    { nama: 'Pulpen Pilot G2 Gel Pen 0.7mm Biru', sub: 'Alat Tulis Kantor', sat: 'Lusin', harga: 198000, rak: 'Rak B', min: 6, max: 40, avg: 8 },
    { nama: 'Pensil 2B Faber-Castell Ujian', sub: 'Alat Tulis Kantor', sat: 'Lusin', harga: 48000, rak: 'Rak B', min: 10, max: 60, avg: 15 },
    { nama: 'Spidol Whiteboard Snowman Hitam', sub: 'Alat Tulis Kantor', sat: 'Lusin', harga: 115000, rak: 'Rak B', min: 8, max: 50, avg: 12 },
    { nama: 'Spidol Permanen Snowman Biru', sub: 'Alat Tulis Kantor', sat: 'Lusin', harga: 108000, rak: 'Rak B', min: 8, max: 40, avg: 10 },
    { nama: 'Highlighter Stabilo Boss Original Kuning', sub: 'Alat Tulis Kantor', sat: 'Pcs', harga: 14500, rak: 'Rak B', min: 20, max: 100, avg: 18 },
    { nama: 'Map Folio Kertas Snelhechter Diamond Merah', sub: 'Ordner & Pengarsipan', sat: 'Pak (50)', harga: 95000, rak: 'Rak B', min: 5, max: 30, avg: 8 },
    { nama: 'Map Plastik L-Folder Transparan A4', sub: 'Ordner & Pengarsipan', sat: 'Lusin', harga: 38000, rak: 'Rak B', min: 10, max: 80, avg: 16 },
    { nama: 'Ordner Bantex Folio 7cm Biru Dongker', sub: 'Ordner & Pengarsipan', sat: 'Pcs', harga: 43000, rak: 'Rak B', min: 15, max: 120, avg: 24 },
    { nama: 'Box File Karton Gema BPS Folio', sub: 'Ordner & Pengarsipan', sat: 'Pcs', harga: 22000, rak: 'Rak B', min: 20, max: 100, avg: 25 },
    { nama: 'Stapler HD-10 MAX Tokyo', sub: 'Perlengkapan Meja', sat: 'Pcs', harga: 28000, rak: 'Rak B', min: 10, max: 50, avg: 7 },
    { nama: 'Isi Staples MAX No. 10-1M', sub: 'Perlengkapan Meja', sat: 'Kotak (20)', harga: 65000, rak: 'Rak B', min: 8, max: 60, avg: 14 },
    { nama: 'Stapler Besar Jilid HD-12N/17', sub: 'Perlengkapan Meja', sat: 'Pcs', harga: 420000, rak: 'Rak B', min: 2, max: 10, avg: 1 },
    { nama: 'Isi Staples Jilid No. 1217FA-H', sub: 'Perlengkapan Meja', sat: 'Kotak', harga: 58000, rak: 'Rak B', min: 4, max: 20, avg: 3 },
    { nama: 'Gunting Joyko SC-848 Stainless', sub: 'Perlengkapan Meja', sat: 'Pcs', harga: 16000, rak: 'Rak B', min: 12, max: 50, avg: 6 },
    { nama: 'Cutter Kenko L-500 Besar', sub: 'Perlengkapan Meja', sat: 'Pcs', harga: 19500, rak: 'Rak B', min: 10, max: 40, avg: 5 },
    { nama: 'Refill Pisau Cutter Kenko L-150', sub: 'Perlengkapan Meja', sat: 'Tube', harga: 11000, rak: 'Rak B', min: 15, max: 60, avg: 8 },
    { nama: 'Lem Kertas Glukol Pasta 100gr', sub: 'Perlengkapan Meja', sat: 'Pcs', harga: 8500, rak: 'Rak B', min: 15, max: 60, avg: 10 },
    { nama: 'Lem Stick UHU 21gr All Purpose', sub: 'Perlengkapan Meja', sat: 'Pcs', harga: 18000, rak: 'Rak B', min: 12, max: 50, avg: 9 },
    { nama: 'Selotip Bening Nachi Tape 1/2 Inch', sub: 'Pita Perekat & Lakban', sat: 'Roll', harga: 9000, rak: 'Rak B', min: 15, max: 80, avg: 14 },
    { nama: 'Lakban Coklat Nachi 2 Inch 100 Yard', sub: 'Pita Perekat & Lakban', sat: 'Roll', harga: 19000, rak: 'Rak B', min: 12, max: 60, avg: 11 },
    { nama: 'Tinta Printer Epson 003 Hitam Original', sub: 'Tinta & Toner Komputer', sat: 'Botol', harga: 98000, rak: 'Rak C', min: 8, max: 40, avg: 10 },
    { nama: 'Tinta Printer Epson 003 Cyan', sub: 'Tinta & Toner Komputer', sat: 'Botol', harga: 98000, rak: 'Rak C', min: 5, max: 25, avg: 5 },
    { nama: 'Tinta Printer Epson 003 Magenta', sub: 'Tinta & Toner Komputer', sat: 'Botol', harga: 98000, rak: 'Rak C', min: 5, max: 25, avg: 5 },
    { nama: 'Tinta Printer Epson 003 Yellow', sub: 'Tinta & Toner Komputer', sat: 'Botol', harga: 98000, rak: 'Rak C', min: 5, max: 25, avg: 5 },
    { nama: 'Toner HP LaserJet 26A (CF226A) Black', sub: 'Tinta & Toner Komputer', sat: 'Catridge', harga: 1650000, rak: 'Rak C', min: 3, max: 15, avg: 3 },
    { nama: 'Toner HP LaserJet 76A (CF276A) Original', sub: 'Tinta & Toner Komputer', sat: 'Catridge', harga: 1850000, rak: 'Rak C', min: 3, max: 15, avg: 3 },
    { nama: 'Tinta Canon GI-790 Black Original', sub: 'Tinta & Toner Komputer', sat: 'Botol', harga: 115000, rak: 'Rak C', min: 6, max: 30, avg: 6 },
    { nama: 'Sticky Notes Post-it 3M 3x3 Kuning Neon', sub: 'Perlengkapan Meja', sat: 'Pad', harga: 16500, rak: 'Rak B', min: 15, max: 80, avg: 18 },
    { nama: 'Amplop Coklat Kabinet Tali Samson A4', sub: 'Kebutuhan Surat Menyurat', sat: 'Pak (100)', harga: 78000, rak: 'Rak B', min: 5, max: 25, avg: 6 },
    { nama: 'Amplop Putih Polos Jaya No. 104', sub: 'Kebutuhan Surat Menyurat', sat: 'Kotak (100)', harga: 32000, rak: 'Rak B', min: 8, max: 40, avg: 10 },
    { nama: 'Paper Clip Joyko No. 3 Trilinear', sub: 'Perlengkapan Meja', sat: 'Kotak', harga: 6500, rak: 'Rak B', min: 20, max: 100, avg: 15 },
    { nama: 'Binder Clip Joyko No. 107 (19mm)', sub: 'Perlengkapan Meja', sat: 'Kotak', harga: 14000, rak: 'Rak B', min: 15, max: 70, avg: 12 },
    { nama: 'Binder Clip Joyko No. 155 (32mm)', sub: 'Perlengkapan Meja', sat: 'Kotak', harga: 23000, rak: 'Rak B', min: 12, max: 60, avg: 9 },
    { nama: 'Correction Tape Joyko CT-522 12m', sub: 'Alat Tulis Kantor', sat: 'Pcs', harga: 12500, rak: 'Rak B', min: 15, max: 80, avg: 14 }
  ];

  const arkTemplates = [
    { nama: 'Tisu Toilet Roll Paseo Elegance 3 Ply', sub: 'Perlengkapan Sanitasi', sat: 'Pack (10)', harga: 68000, rak: 'Rak D', min: 12, max: 60, avg: 16 },
    { nama: 'Tisu Kotak Paseo Facial Tissue 250 Sheets', sub: 'Perlengkapan Sanitasi', sat: 'Pcs', harga: 17500, rak: 'Rak D', min: 25, max: 120, avg: 35 },
    { nama: 'Hand Soap Yuri Foam Sabun Cuci Tangan 375ml', sub: 'Sabun & Disinfektan', sat: 'Botol', harga: 26000, rak: 'Rak D', min: 15, max: 60, avg: 14 },
    { nama: 'Refill Sabun Cuci Tangan Lifebuoy 450ml', sub: 'Sabun & Disinfektan', sat: 'Pouch', harga: 19500, rak: 'Rak D', min: 20, max: 80, avg: 22 },
    { nama: 'Pembersih Lantai SOS Karbol Wangi Pinus 750ml', sub: 'Kebersihan Gedung', sat: 'Pouch', harga: 18000, rak: 'Rak D', min: 18, max: 70, avg: 16 },
    { nama: 'Pembersih Kaca Cling Spray 440ml Ocean Fresh', sub: 'Kebersihan Gedung', sat: 'Botol', harga: 14000, rak: 'Rak D', min: 10, max: 40, avg: 8 },
    { nama: 'Refill Cling Pembersih Kaca 425ml', sub: 'Kebersihan Gedung', sat: 'Pouch', harga: 9500, rak: 'Rak D', min: 15, max: 50, avg: 10 },
    { nama: 'Sapu Lantai Nilon Lion Star Nagata', sub: 'Alat Kebersihan', sat: 'Pcs', harga: 38000, rak: 'Rak D', min: 6, max: 25, avg: 4 },
    { nama: 'Alat Pel Lantai Putar Mop Nagata Microfiber', sub: 'Alat Kebersihan', sat: 'Set', harga: 145000, rak: 'Rak D', min: 4, max: 15, avg: 2 },
    { nama: 'Refill Kain Pel Mop Katun Standar', sub: 'Alat Kebersihan', sat: 'Pcs', harga: 24000, rak: 'Rak D', min: 10, max: 40, avg: 6 },
    { nama: 'Kemoceng Bulu Ayam Halus Gagang Rotan', sub: 'Alat Kebersihan', sat: 'Pcs', harga: 29000, rak: 'Rak D', min: 8, max: 30, avg: 4 },
    { nama: 'Plastik Sampah Hitam Tebal 60 x 100 cm', sub: 'Pengelolaan Sampah', sat: 'Pak (50)', harga: 54000, rak: 'Rak D', min: 10, max: 50, avg: 12 },
    { nama: 'Plastik Sampah Kecil Meja Kerja 40 x 50 cm', sub: 'Pengelolaan Sampah', sat: 'Pak (50)', harga: 28000, rak: 'Rak D', min: 15, max: 60, avg: 15 },
    { nama: 'Pengharum Ruangan Glade Matic Spray Refill', sub: 'Aroma & Penyegar', sat: 'Kaleng', harga: 34000, rak: 'Rak E', min: 12, max: 50, avg: 14 },
    { nama: 'Dahlia Kamper Toilet Ball 5 Warna 200gr', sub: 'Aroma & Penyegar', sat: 'Bungkus', harga: 22000, rak: 'Rak D', min: 15, max: 60, avg: 12 },
    { nama: 'Sabun Cuci Piring Sunlight Jeruk Nipis 750ml', sub: 'Pantry & Dapur Kantor', sat: 'Pouch', harga: 18500, rak: 'Rak E', min: 12, max: 50, avg: 10 },
    { nama: 'Spon Cuci Piring Scotch-Brite Anti Gores', sub: 'Pantry & Dapur Kantor', sat: 'Pack (3)', harga: 21000, rak: 'Rak E', min: 10, max: 40, avg: 8 },
    { nama: 'Kopi Kapal Api Special Mix 1 Renceng (10 sachet)', sub: 'Pantry & Jamuan Rapat', sat: 'Renceng', harga: 18000, rak: 'Rak E', min: 15, max: 60, avg: 20 },
    { nama: 'Teh Celup SariWangi 50 Kantong', sub: 'Pantry & Jamuan Rapat', sat: 'Kotak', harga: 16500, rak: 'Rak E', min: 12, max: 50, avg: 15 },
    { nama: 'Gula Pasir Gulaku Tebu Alami 1 Kg', sub: 'Pantry & Jamuan Rapat', sat: 'Kg', harga: 19500, rak: 'Rak E', min: 15, max: 50, avg: 18 }
  ];

  let idCounter = 1;
  // Generate 120 ATK items
  for (let i = 0; i < 120; i++) {
    const tmpl = atkTemplates[i % atkTemplates.length];
    const variantNum = Math.floor(i / atkTemplates.length) + 1;
    const shelfNum = String((i % 4) + 1).padStart(2, '0');
    const posNum = String((i % 15) + 1).padStart(2, '0');
    const binCode = `WH-B-${shelfNum}-${posNum}`;
    
    // Vary initial stocks to create realistic "Aman", "Menipis", and "Habis"
    let currentStock: number;
    let status: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
    if (i === 3 || i === 19 || i === 47) {
      currentStock = 0;
      status = 'Habis';
    } else if (i % 6 === 0) {
      currentStock = Math.max(1, Math.floor(tmpl.min * 0.7));
      status = 'Menipis';
    } else {
      currentStock = tmpl.min + Math.floor(Math.random() * (tmpl.max - tmpl.min));
      status = 'Aman';
    }

    const itemNama = variantNum > 1 ? `${tmpl.nama} (Tipe V-${variantNum})` : tmpl.nama;

    items.push({
      id: `inv-atk-${idCounter}`,
      kodeBarang: `1.1.7.01.01.${String(idCounter).padStart(4, '0')}`,
      nama: itemNama,
      kategori: 'Alat Tulis Kantor',
      subkategori: tmpl.sub,
      jenis: 'ATK',
      satuan: tmpl.sat,
      stokAwal: tmpl.min * 2,
      stokSaatIni: currentStock,
      stokMinimum: tmpl.min,
      stokMaksimum: tmpl.max,
      hargaSatuan: tmpl.harga,
      totalNilai: currentStock * tmpl.harga,
      lokasiGudang: 'Gudang Persediaan Utama',
      rak: tmpl.rak,
      shelf: `Shelf ${shelfNum}`,
      binCode: binCode,
      barcode: `899710601${String(idCounter).padStart(4, '0')}`,
      status: status,
      ratarataPenggunaanBulanan: tmpl.avg,
      fotoUrl: getInventoryPhotoUrl(itemNama, tmpl.sub, 'ATK')
    });
    idCounter++;
  }

  // Generate 80 ARK items (total 200 items!)
  for (let i = 0; i < 80; i++) {
    const tmpl = arkTemplates[i % arkTemplates.length];
    const variantNum = Math.floor(i / arkTemplates.length) + 1;
    const shelfNum = String((i % 4) + 1).padStart(2, '0');
    const posNum = String((i % 15) + 1).padStart(2, '0');
    const binCode = `WH-D-${shelfNum}-${posNum}`;
    
    let currentStock: number;
    let status: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
    if (i === 5 || i === 22) {
      currentStock = 0;
      status = 'Habis';
    } else if (i % 7 === 0) {
      currentStock = Math.max(1, Math.floor(tmpl.min * 0.6));
      status = 'Menipis';
    } else {
      currentStock = tmpl.min + Math.floor(Math.random() * (tmpl.max - tmpl.min));
      status = 'Aman';
    }

    const itemNama = variantNum > 1 ? `${tmpl.nama} (Refill Mod-${variantNum})` : tmpl.nama;

    items.push({
      id: `inv-ark-${idCounter}`,
      kodeBarang: `1.1.7.01.02.${String(idCounter).padStart(4, '0')}`,
      nama: itemNama,
      kategori: 'Alat Rumah Tangga Kantor',
      subkategori: tmpl.sub,
      jenis: 'ARK',
      satuan: tmpl.sat,
      stokAwal: tmpl.min * 2,
      stokSaatIni: currentStock,
      stokMinimum: tmpl.min,
      stokMaksimum: tmpl.max,
      hargaSatuan: tmpl.harga,
      totalNilai: currentStock * tmpl.harga,
      lokasiGudang: 'Gudang Persediaan Utama',
      rak: tmpl.rak,
      shelf: `Shelf ${shelfNum}`,
      binCode: binCode,
      barcode: `899710602${String(idCounter).padStart(4, '0')}`,
      status: status,
      ratarataPenggunaanBulanan: tmpl.avg,
      fotoUrl: getInventoryPhotoUrl(itemNama, tmpl.sub, 'ARK')
    });
    idCounter++;
  }

  return items;
}

// Generate 100 realistic Stock-In Transactions
export function generateInitialStockIn(inventoryItems: InventoryItem[]): StockInTransaction[] {
  const stockInList: StockInTransaction[] = [];
  const sources = ['DIPA BPS Minut TA 2026', 'Pengadaan Triwulan I DIPA 2026', 'Hibah Perlengkapan Pemkab Minut', 'Pengadaan Droping BPS Sulut'];
  const officers = ['Siti Rahmawati Sompie, A.Md', 'Christian Pangemanan, S.ST', 'Michael Wowor, S.Si'];

  for (let i = 1; i <= 100; i++) {
    const item = inventoryItems[i % inventoryItems.length];
    const qty = 10 + ((i * 7) % 50);
    const day = String((i % 28) + 1).padStart(2, '0');
    const month = String(Math.min(10, Math.floor(i / 11) + 1)).padStart(2, '0');
    
    stockInList.push({
      id: `sin-${i}`,
      nomorTransaksi: `BM-BPS7106/2026/${String(i).padStart(4, '0')}`,
      tanggal: `2026-${month}-${day}`,
      nomorDokumen: `BAST-PENGADAAN/No.${100 + i}/SPK/2026`,
      sumber: sources[i % sources.length],
      itemId: item.id,
      namaBarang: item.nama,
      kategori: item.kategori,
      jenis: item.jenis,
      jumlah: qty,
      satuan: item.satuan,
      hargaSatuan: item.hargaSatuan,
      totalHarga: qty * item.hargaSatuan,
      lokasiRak: item.rak,
      petugas: officers[i % officers.length],
      keterangan: `Penerimaan barang persediaan ${item.nama} sesuai spesifikasi kontrak pengadaan.`
    });
  }
  return stockInList;
}

// Generate 150 realistic Stock-Out Transactions
export function generateInitialStockOut(inventoryItems: InventoryItem[]): StockOutTransaction[] {
  const stockOutList: StockOutTransaction[] = [];
  const units = [
    { unit: 'Bagian Tata Usaha', room: 'Tata Usaha & Keuangan', pic: 'Deisy Rondonuwu, S.E.' },
    { unit: 'Subbagian Umum', room: 'Subbagian Umum', pic: 'Christian Pangemanan, S.ST' },
    { unit: 'Fungsi Statistik Sosial', room: 'Statistik Sosial', pic: 'Michael Wowor, S.Si' },
    { unit: 'Fungsi Statistik Produksi', room: 'Statistik Produksi', pic: 'Ferry Kuntag, S.P.' },
    { unit: 'Fungsi Statistik Distribusi', room: 'Statistik Distribusi', pic: 'Grace Rotinsulu, S.E.' },
    { unit: 'Fungsi Neraca Wilayah', room: 'Neraca Wilayah & Analisis', pic: 'Johan Mandagi, S.E.' },
    { unit: 'Fungsi IPDS & TI', room: 'IPDS & Server Room', pic: 'Administrator TI BPS Minut' },
    { unit: 'Pelayanan Statistik Terpadu', room: 'PST BPS Minut', pic: 'Novita Lumempouw, S.Kom' }
  ];

  for (let i = 1; i <= 150; i++) {
    const item = inventoryItems[i % inventoryItems.length];
    const u = units[i % units.length];
    const qty = 1 + ((i * 3) % 15);
    const day = String((i % 28) + 1).padStart(2, '0');
    const month = String(Math.min(10, Math.floor(i / 16) + 1)).padStart(2, '0');

    stockOutList.push({
      id: `sout-${i}`,
      nomorTransaksi: `BK-BPS7106/2026/${String(i).padStart(4, '0')}`,
      tanggal: `2026-${month}-${day}`,
      unitKerja: u.unit,
      ruangan: u.room,
      pemohon: u.pic,
      itemId: item.id,
      namaBarang: item.nama,
      jenis: item.jenis,
      jumlah: qty,
      satuan: item.satuan,
      keperluan: `Operasional kegiatan survei dan administrasi kantor ${u.unit}`,
      petugas: 'Siti Rahmawati Sompie, A.Md',
      keterangan: 'Barang telah diserahterimakan dalam kondisi baik dan lengkap.'
    });
  }
  return stockOutList;
}

// Generate 50 realistic Inventory Requests
export function generateInitialRequests(inventoryItems: InventoryItem[]): InventoryRequest[] {
  const reqs: InventoryRequest[] = [];
  const units = [
    { unit: 'Fungsi Statistik Sosial', room: 'Statistik Sosial', pic: 'Michael Wowor, S.Si' },
    { unit: 'Fungsi Statistik Distribusi', room: 'Statistik Distribusi', pic: 'Grace Rotinsulu, S.E.' },
    { unit: 'Bagian Tata Usaha', room: 'Tata Usaha & Keuangan', pic: 'Deisy Rondonuwu, S.E.' },
    { unit: 'Fungsi Neraca Wilayah', room: 'Neraca Wilayah & Analisis', pic: 'Johan Mandagi, S.E.' },
    { unit: 'Subbagian Umum', room: 'Subbagian Umum', pic: 'Christian Pangemanan, S.ST' }
  ];
  const priorities: ('Rendah' | 'Normal' | 'Tinggi' | 'Mendesak')[] = ['Normal', 'Normal', 'Tinggi', 'Mendesak', 'Rendah'];
  const statuses: ('Draft' | 'Diajukan' | 'Diverifikasi' | 'Disetujui' | 'Diproses' | 'Selesai')[] = [
    'Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Selesai', 'Selesai'
  ];

  for (let i = 1; i <= 50; i++) {
    const item = inventoryItems[i % inventoryItems.length];
    const u = units[i % units.length];
    const qty = 2 + (i % 12);
    const st = statuses[i % statuses.length];

    reqs.push({
      id: `req-${i}`,
      nomorPermintaan: `REQ-BPS7106/2026/${String(i).padStart(4, '0')}`,
      tanggal: `2026-0${Math.min(9, Math.floor(i / 6) + 1)}-${String((i % 28) + 1).padStart(2, '0')}`,
      pemohonNama: u.pic,
      unitKerja: u.unit,
      ruangan: u.room,
      itemId: item.id,
      namaBarang: item.nama,
      jumlahDiminta: qty,
      jumlahDisetujui: st === 'Disetujui' || st === 'Selesai' || st === 'Diproses' ? qty : undefined,
      satuan: item.satuan,
      keperluan: `Kebutuhan pelaksanaan pendataan lapangan dan pengolahan data statistik triwulan`,
      prioritas: priorities[i % priorities.length],
      status: st,
      catatan: st === 'Disetujui' ? 'Disetujui Kasubbag Umum untuk pengeluaran gudang' : undefined
    });
  }
  return reqs;
}

// Generate 50 realistic Stock Opname items
export function generateInitialOpnames(inventoryItems: InventoryItem[]): StockOpname[] {
  const opnames: StockOpname[] = [];
  const periods = ['Triwulan I 2026', 'Triwulan II 2026', 'Semester I 2026'];

  for (let p = 0; p < periods.length; p++) {
    const itemsSlice = inventoryItems.slice(p * 18, (p + 1) * 18);
    const opnameItems = itemsSlice.map((item, idx) => {
      // Simulate small differences in ~25% of items
      const hasDiff = (idx % 4 === 0);
      const diff = hasDiff ? ((idx % 3 === 0) ? -2 : 1) : 0;
      const fisik = Math.max(0, item.stokSaatIni + diff);
      return {
        id: `op-it-${p}-${idx}`,
        itemId: item.id,
        kodeBarang: item.kodeBarang,
        namaBarang: item.nama,
        satuan: item.satuan,
        stokSistem: item.stokSaatIni,
        stokFisik: fisik,
        selisih: diff,
        kondisi: 'Baik' as const,
        keterangan: diff === 0 ? 'Sesuai catatan sistem' : diff < 0 ? 'Selisih kurang penggunaan tim dinas' : 'Selisih lebih sisa retur survei',
        statusPenyesuaian: 'Disesuaikan' as const
      };
    });

    opnames.push({
      id: `opname-${p + 1}`,
      nomorOpname: `BA-SO/BPS7106/2026/${String(p + 1).padStart(3, '0')}`,
      tanggal: `2026-0${(p + 1) * 3}-30`,
      periode: periods[p],
      petugas: 'Siti Rahmawati Sompie, A.Md & Tim Pengelola',
      status: p === 2 ? 'Menunggu Approval' : 'Selesai',
      items: opnameItems,
      catatan: `Pemeriksaan fisik menyeluruh barang persediaan di Gudang Utama BPS Kabupaten Minahasa Utara.`
    });
  }
  return opnames;
}

// Generate 50 realistic Asset Movements
export function generateInitialMovements(assets: BmnAsset[]): AssetMovement[] {
  const movements: AssetMovement[] = [];
  const statuses: ('Pengajuan' | 'Verifikasi' | 'Persetujuan' | 'Pemindahan' | 'Selesai')[] = [
    'Selesai', 'Selesai', 'Pemindahan', 'Persetujuan', 'Verifikasi', 'Pengajuan'
  ];

  for (let i = 1; i <= 50; i++) {
    const asset = assets[i * 4];
    const roomFrom = OFFICE_ROOMS[i % OFFICE_ROOMS.length];
    const roomTo = OFFICE_ROOMS[(i + 3) % OFFICE_ROOMS.length];
    const st = statuses[i % statuses.length];

    movements.push({
      id: `mov-${i}`,
      nomorTransaksi: `MUT-BMN/7106/2026/${String(i).padStart(4, '0')}`,
      assetId: asset.id,
      assetName: asset.namaBarang,
      kodeBarang: asset.kodeBarang,
      nup: asset.nup,
      lokasiAsalId: roomFrom.id,
      lokasiAsalNama: roomFrom.name,
      lokasiTujuanId: roomTo.id,
      lokasiTujuanNama: roomTo.name,
      tanggal: `2026-0${Math.min(9, Math.floor(i / 6) + 1)}-${String((i % 28) + 1).padStart(2, '0')}`,
      alasan: `Optimalisasi penempatan perangkat kerja untuk kelancaran tugas dinas ${roomTo.name}`,
      pemohon: roomTo.picName,
      penanggungJawab: 'Christian Pangemanan, S.ST',
      status: st,
      createdAt: `2026-0${Math.min(9, Math.floor(i / 6) + 1)}-01`,
      updatedAt: `2026-0${Math.min(9, Math.floor(i / 6) + 1)}-05`
    });
  }
  return movements;
}

// Generate 50 realistic Asset Maintenances
export function generateInitialMaintenance(assets: BmnAsset[]): AssetMaintenance[] {
  const maintenances: AssetMaintenance[] = [];
  const types = ['Perawatan Berkala AC', 'Servis Komputer & Pembersihan Hardware', 'Ganti Drum & Refill Unit Toner', 'Servis Rem & Oli Kendaraan Dinas', 'Perbaikan Engsel Pintu & Meja'];
  const vendors = ['CV. Sulut Multi Graha Servis', 'PT. Manado Cyber Mandiri', 'Bengkel Auto 2000 Manado', 'CV. Kawanua Sejahtera Mandiri'];
  const statuses: ('Terjadwal' | 'Dalam Proses' | 'Selesai' | 'Ditunda')[] = ['Selesai', 'Dalam Proses', 'Terjadwal', 'Ditunda'];

  for (let i = 1; i <= 50; i++) {
    const asset = assets[(i * 7) % assets.length];
    const st = statuses[i % statuses.length];
    const cost = 250000 + ((i * 125000) % 2500000);

    maintenances.push({
      id: `mnt-${i}`,
      nomorTiket: `MNT-BMN/2026/${String(i).padStart(4, '0')}`,
      assetId: asset.id,
      assetName: asset.namaBarang,
      kodeBarang: asset.kodeBarang,
      nup: asset.nup,
      jenisPemeliharaan: types[i % types.length],
      tanggalMulai: `2026-0${Math.min(9, Math.floor(i / 6) + 1)}-${String((i % 28) + 1).padStart(2, '0')}`,
      tanggalSelesai: st === 'Selesai' ? `2026-0${Math.min(9, Math.floor(i / 6) + 1)}-28` : undefined,
      teknisi: `Ir. Yohanes Lumowa / Teknisi Resmi`,
      vendor: vendors[i % vendors.length],
      biaya: cost,
      keterangan: `Pemeliharaan preventif dan korektif sarana BMN sesuai DIPA TA 2026`,
      status: st,
      ruanganNama: asset.ruanganNama
    });
  }
  return maintenances;
}

// Generate 30 Documents
export function generateInitialDocuments(): DocumentItem[] {
  const docs: DocumentItem[] = [];
  const titles = [
    { title: 'Berita Acara Rekonsiliasi BMN Semester I 2026 dengan KPKNL Manado', type: 'Berita Acara' },
    { title: 'Surat Penetapan Status Penggunaan (PSP) BMN BPS Kabupaten Minahasa Utara', type: 'Dokumen Perolehan' },
    { title: 'Berita Acara Stock Opname Persediaan Triwulan II TA 2026', type: 'Dokumen Stock Opname' },
    { title: 'Surat Perintah Kerja (SPK) Pemeliharaan Rutin Perangkat TI 2026', type: 'Dokumen Pemeliharaan' },
    { title: 'Berita Acara Serah Terima (BAST) Pengadaan Laptop dan PC DIPA 2026', type: 'Dokumen Perolehan' },
    { title: 'SK Tim Inventarisasi dan Sensus BMN Kabupaten Minahasa Utara', type: 'Berita Acara' },
    { title: 'Usulan Penghapusan BMN Rusak Berat Eks Sensus Pertanian 2013', type: 'Dokumen Penghapusan' },
    { title: 'Berita Acara Pemindahan Aset Meja dan AC Antar Seksi', type: 'Dokumen Pemindahan' },
    { title: 'Laporan Barang Pengguna Semesteran (LBPS) BPS Minahasa Utara 2026', type: 'Berita Acara' },
    { title: 'Bukti Pengeluaran Barang Persediaan ATK Sensus Ekonomi Persiapan', type: 'Dokumen Barang Keluar' }
  ];

  for (let i = 1; i <= 30; i++) {
    const tmpl = titles[i % titles.length];
    docs.push({
      id: `doc-${i}`,
      nomorDokumen: `BPS-7106/BMN/DOC/2026/${String(i).padStart(3, '0')}`,
      judul: `${tmpl.title} (Berkas #${i})`,
      jenis: tmpl.type as any,
      tanggal: `2026-0${Math.min(9, Math.floor(i / 4) + 1)}-${String((i % 28) + 1).padStart(2, '0')}`,
      tahun: 2026,
      fileSize: `${1.2 + (i * 0.4 % 4.8).toFixed(1)} MB`,
      uploader: 'Christian Pangemanan, S.ST',
      tags: ['BMN', 'BPS Minut', 'KPKNL', 'SAKTI', 'SIMAN'],
      status: i % 5 === 0 ? 'Menunggu TTD' : 'Sah'
    });
  }
  return docs;
}

// Generate 100 Audit Logs
export function generateInitialAuditLogs(): AuditLog[] {
  const logs: AuditLog[] = [];
  const activities = [
    { act: 'Input Barang Masuk Kertas A4 & F4', mod: 'PERSEDIAAN' },
    { act: 'Persetujuan Pemindahan Laptop Core i7 ke IPDS', mod: 'ASET_BMN' },
    { act: 'Pengeluaran Persediaan ATK Sensus Sosial', mod: 'PERSEDIAAN' },
    { act: 'Verifikasi Stock Opname Triwulan II', mod: 'PERSEDIAAN' },
    { act: 'Update Kondisi AC Split Ruang Rapat (Rusak Ringan)', mod: 'ASET_BMN' },
    { act: 'Input Aset BMN Baru Printer Epson EcoTank', mod: 'ASET_BMN' },
    { act: 'Generate Berita Acara Rekonsiliasi KPKNL', mod: 'DOKUMEN' },
    { act: 'User Login Berhasil ke Sistem SIMAN-BMN', mod: 'AUTH' },
    { act: 'Penyetujuan Usulan Penghapusan Laptop Rusak Berat', mod: 'ASET_BMN' },
    { act: 'Pencetakan QR Code Label BMN 20 Unit Baru', mod: 'ASET_BMN' }
  ];
  const users = [
    { name: 'Christian Pangemanan, S.ST', role: 'Pengelola BMN' },
    { name: 'Siti Rahmawati Sompie, A.Md', role: 'Operator' },
    { name: 'Ir. Hendra Kawilarang, M.Si', role: 'Pimpinan' },
    { name: 'Administrator TI BPS Minut', role: 'Administrator' }
  ];

  for (let i = 1; i <= 100; i++) {
    const act = activities[i % activities.length];
    const usr = users[i % users.length];
    const day = String((i % 28) + 1).padStart(2, '0');
    const hour = String(8 + (i % 9)).padStart(2, '0');
    const min = String((i * 7) % 60).padStart(2, '0');

    logs.push({
      id: `log-${i}`,
      userId: `usr-${(i % 4) + 1}`,
      userName: usr.name,
      userRole: usr.role,
      aktivitas: act.act,
      modul: act.mod as any,
      tanggal: `2026-0${Math.min(9, Math.floor(i / 11) + 1)}-${day}`,
      waktu: `${hour}:${min}:24 WITA`,
      ipAddress: `192.168.10.${50 + (i % 25)}`,
      detail: `Operasi ${act.act} berhasil dicatat dalam audit trail sistem SIMAN-BMN BPS Minut.`
    });
  }
  return logs;
}

// Generate Initial Notifications
export function generateInitialNotifications(): NotificationItem[] {
  return [
    {
      id: 'notif-1',
      type: 'WARNING_STOK',
      title: '⚠️ Peringatan Stok Menipis',
      message: 'Kertas HVS A4 80gr tersisa 8 Rim (di bawah batas minimum 25 Rim). Segera ajukan pengadaan.',
      timestamp: '10 menit lalu',
      read: false,
      link: 'inventory'
    },
    {
      id: 'notif-2',
      type: 'HABIS_STOK',
      title: '🔴 Stok Habis di Gudang',
      message: 'Tinta Printer Epson 003 Black & Pembersih Kaca Cling Spray saat ini bersaldo 0.',
      timestamp: '45 menit lalu',
      read: false,
      link: 'inventory'
    },
    {
      id: 'notif-3',
      type: 'PERMINTAAN_BARU',
      title: '📋 Permintaan Barang Baru',
      message: 'Michael Wowor (Statistik Sosial) mengajukan 10 Rim Kertas F4 dan 5 Lusin Pulpen.',
      timestamp: '2 jam lalu',
      read: false,
      link: 'requests'
    },
    {
      id: 'notif-4',
      type: 'ASET_RUSAK',
      title: '⚠️ Laporan Kondisi BMN',
      message: 'AC Split Ruang Rapat Aula dilaporkan Rusak Ringan (kompresor bising).',
      timestamp: '5 jam lalu',
      read: true,
      link: 'assets'
    },
    {
      id: 'notif-5',
      type: 'PEMELIHARAAN',
      title: '🔧 Jadwal Pemeliharaan BMN',
      message: 'Servis rutin kendaraan dinas Toyota Kijang Innova dijadwalkan besok lusa di Auto 2000.',
      timestamp: '1 hari lalu',
      read: true,
      link: 'maintenance'
    }
  ];
}
