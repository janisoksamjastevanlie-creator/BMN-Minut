import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  RoleDefinition,
  RolePermissions,
  BmnAsset,
  InventoryItem,
  StockInTransaction,
  StockOutTransaction,
  InventoryRequest,
  StockOpname,
  AssetMovement,
  AssetMaintenance,
  AssetDisposal,
  DocumentItem,
  AuditLog,
  NotificationItem,
  OfficeRoom,
  WarehouseRack
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_ROLES,
  OFFICE_ROOMS,
  WAREHOUSE_RACKS,
  generateInitialBmnAssets,
  generateInitialInventoryItems,
  generateInitialStockIn,
  generateInitialStockOut,
  generateInitialRequests,
  generateInitialOpnames,
  generateInitialMovements,
  generateInitialMaintenance,
  generateInitialDocuments,
  generateInitialAuditLogs,
  generateInitialNotifications
} from '../data/initialData';
import { getAssetPhotoUrl, getInventoryPhotoUrl } from '../utils/assetImages';

export type ActiveView =
  | 'landing'
  | 'login'
  | 'dashboard'
  | 'assets'
  | 'inventory'
  | 'office-3d'
  | 'warehouse-3d'
  | 'movements'
  | 'maintenance'
  | 'disposal'
  | 'requests'
  | 'stock-card'
  | 'stock-opname'
  | 'documents'
  | 'reports'
  | 'audit-trail'
  | 'executive'
  | 'users'
  | 'settings';

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  loginAs: (role: User['role']) => void;
  logout: () => void;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  
  // 3D Settings
  performance3D: 'normal' | 'performance' | 'low';
  setPerformance3D: (mode: 'normal' | 'performance' | 'low') => void;
  
  // Data State
  rooms: OfficeRoom[];
  warehouseRacks: WarehouseRack[];
  assets: BmnAsset[];
  inventoryItems: InventoryItem[];
  stockInList: StockInTransaction[];
  stockOutList: StockOutTransaction[];
  requests: InventoryRequest[];
  opnames: StockOpname[];
  movements: AssetMovement[];
  maintenances: AssetMaintenance[];
  disposals: AssetDisposal[];
  documents: DocumentItem[];
  auditLogs: AuditLog[];
  notifications: NotificationItem[];
  
  // Users Management
  users: User[];
  addUser: (user: Omit<User, 'id'>) => User;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => { success: boolean; message: string };
  switchUser: (id: string) => void;

  // Roles & Permissions Management (RBAC)
  roles: RoleDefinition[];
  addRole: (role: Omit<RoleDefinition, 'id' | 'isSystem'>) => RoleDefinition;
  updateRole: (id: string, updates: Partial<RoleDefinition>) => void;
  deleteRole: (id: string) => { success: boolean; message: string };
  getRoleByName: (name: string) => RoleDefinition | undefined;
  hasPermission: (permission: keyof RolePermissions) => boolean;

  // Actions
  addAsset: (asset: Omit<BmnAsset, 'id'>) => void;
  updateAsset: (id: string, updates: Partial<BmnAsset>) => void;
  deleteAsset: (id: string) => void;
  importAssets: (newAssets: Omit<BmnAsset, 'id'>[], mode?: 'append' | 'upsert') => { successCount: number; updatedCount: number };
  
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => void;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void;
  importInventoryItems: (newItems: Omit<InventoryItem, 'id'>[], mode?: 'append' | 'upsert') => { successCount: number; updatedCount: number };
  
  addStockIn: (data: {
    itemId: string;
    jumlah: number;
    nomorDokumen: string;
    sumber: string;
    keterangan: string;
    hargaSatuan?: number;
  }) => { success: boolean; message: string };
  
  addStockOut: (data: {
    itemId: string;
    jumlah: number;
    unitKerja: string;
    ruangan: string;
    pemohon: string;
    keperluan: string;
  }) => { success: boolean; message: string };
  
  addInventoryRequest: (req: Omit<InventoryRequest, 'id' | 'nomorPermintaan' | 'tanggal' | 'status'>) => InventoryRequest;
  updateRequestStatus: (id: string, status: InventoryRequest['status'], catatan?: string, jumlahDisetujui?: number) => { success: boolean; message: string };
  deleteInventoryRequest: (id: string) => void;
  
  addAssetMovement: (mov: Omit<AssetMovement, 'id' | 'nomorTransaksi' | 'status' | 'createdAt' | 'updatedAt'>) => void;
  updateMovementStatus: (id: string, status: AssetMovement['status'], catatan?: string) => void;
  
  addAssetMaintenance: (mnt: Omit<AssetMaintenance, 'id' | 'nomorTiket'>) => void;
  updateMaintenanceStatus: (id: string, status: AssetMaintenance['status']) => void;
  
  addAssetDisposal: (disp: Omit<AssetDisposal, 'id' | 'nomorPengajuan'>) => void;
  updateDisposalStatus: (id: string, status: AssetDisposal['status']) => void;
  
  addStockOpname: (opname: Omit<StockOpname, 'id' | 'nomorOpname'>) => void;
  approveStockOpname: (id: string) => void;
  
  addDocument: (doc: Omit<DocumentItem, 'id'>) => void;
  deleteDocument: (id: string) => void;
  importSystemBackup: (data: { assets?: BmnAsset[]; inventoryItems?: InventoryItem[]; documents?: DocumentItem[] }) => void;
  
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  
  // Modal / Interaction Helpers
  selectedAsset: BmnAsset | null;
  setSelectedAsset: (asset: BmnAsset | null) => void;
  selectedInventoryItem: InventoryItem | null;
  setSelectedInventoryItem: (item: InventoryItem | null) => void;
  isGlobalSearchOpen: boolean;
  setIsGlobalSearchOpen: (open: boolean) => void;
  isQuickActionOpen: boolean;
  setIsQuickActionOpen: (open: boolean) => void;
  isQrScannerOpen: boolean;
  setIsQrScannerOpen: (open: boolean) => void;
  isAiAssistantOpen: boolean;
  setIsAiAssistantOpen: (open: boolean) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  
  // Print helper
  printableData: any | null;
  setPrintableData: (data: any | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Authentication: default to Administrator for seamless preview or 'landing'
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('siman_user');
    return saved ? JSON.parse(saved) : INITIAL_USERS[0]; // Start logged in as Ir. Hendra (Pimpinan) or Admin
  });

  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [performance3D, setPerformance3D] = useState<'normal' | 'performance' | 'low'>('normal');

  // Rooms & Racks
  const [rooms] = useState<OfficeRoom[]>(OFFICE_ROOMS);
  const [warehouseRacks] = useState<WarehouseRack[]>(WAREHOUSE_RACKS);

  // Entities with Lazy Initializers
  const [assets, setAssets] = useState<BmnAsset[]>(() => {
    const saved = localStorage.getItem('siman_assets');
    if (saved) {
      try {
        const parsed: BmnAsset[] = JSON.parse(saved);
        return parsed.map(a => ({
          ...a,
          fotoUrl: a.fotoUrl || getAssetPhotoUrl(a.namaBarang, a.kategori)
        }));
      } catch {
        return generateInitialBmnAssets();
      }
    }
    return generateInitialBmnAssets();
  });

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('siman_inventory');
    if (saved) {
      try {
        const parsed: InventoryItem[] = JSON.parse(saved);
        return parsed.map(i => ({
          ...i,
          fotoUrl: i.fotoUrl || getInventoryPhotoUrl(i.nama, i.subkategori, i.jenis)
        }));
      } catch {
        return generateInitialInventoryItems();
      }
    }
    return generateInitialInventoryItems();
  });

  const [stockInList, setStockInList] = useState<StockInTransaction[]>(() => {
    const saved = localStorage.getItem('siman_stock_in');
    return saved ? JSON.parse(saved) : generateInitialStockIn(generateInitialInventoryItems());
  });

  const [stockOutList, setStockOutList] = useState<StockOutTransaction[]>(() => {
    const saved = localStorage.getItem('siman_stock_out');
    return saved ? JSON.parse(saved) : generateInitialStockOut(generateInitialInventoryItems());
  });

  const [requests, setRequests] = useState<InventoryRequest[]>(() => {
    const saved = localStorage.getItem('siman_requests');
    return saved ? JSON.parse(saved) : generateInitialRequests(generateInitialInventoryItems());
  });

  const [opnames, setOpnames] = useState<StockOpname[]>(() => {
    const saved = localStorage.getItem('siman_opnames');
    return saved ? JSON.parse(saved) : generateInitialOpnames(generateInitialInventoryItems());
  });

  const [movements, setMovements] = useState<AssetMovement[]>(() => {
    const saved = localStorage.getItem('siman_movements');
    return saved ? JSON.parse(saved) : generateInitialMovements(assets);
  });

  const [maintenances, setMaintenances] = useState<AssetMaintenance[]>(() => {
    const saved = localStorage.getItem('siman_maintenance');
    return saved ? JSON.parse(saved) : generateInitialMaintenance(assets);
  });

  const [disposals, setDisposals] = useState<AssetDisposal[]>(() => {
    const saved = localStorage.getItem('siman_disposals');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'dsp-1',
        nomorPengajuan: 'DSP-BMN/2026/0001',
        assetId: 'bmn-1',
        assetName: 'PC Desktop HP Antik Pent 4',
        kodeBarang: '3.10.01.01.001',
        nup: 99,
        alasan: 'Kerusakan total pada motherboard dan power supply, teknologi usang.',
        kondisiTerakhir: 'Rusak Berat',
        nilaiBuku: 1,
        dokumenPendukung: 'Surat Usulan Penghapusan No. B-102/7106/BMN/2026',
        status: 'Persetujuan',
        tanggalPengajuan: '2026-02-15',
        penyetuju: 'Ir. Hendra Kawilarang, M.Si'
      }
    ];
  });

  const [documents, setDocuments] = useState<DocumentItem[]>(() => {
    const saved = localStorage.getItem('siman_documents');
    return saved ? JSON.parse(saved) : generateInitialDocuments();
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem('siman_audit_logs');
    return saved ? JSON.parse(saved) : generateInitialAuditLogs();
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const saved = localStorage.getItem('siman_notifications');
    return saved ? JSON.parse(saved) : generateInitialNotifications();
  });

  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('siman_users');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // fallback
      }
    }
    return INITIAL_USERS;
  });

  const [roles, setRoles] = useState<RoleDefinition[]>(() => {
    const saved = localStorage.getItem('siman_roles');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // fallback
      }
    }
    return INITIAL_ROLES;
  });

  // Modals & UI States
  const [selectedAsset, setSelectedAsset] = useState<BmnAsset | null>(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [printableData, setPrintableData] = useState<any | null>(null);

  // Sync to local storage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('siman_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('siman_user');
    }
  }, [currentUser]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_assets', JSON.stringify(assets));
    } catch {
      // quota safeguard
    }
  }, [assets]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_inventory', JSON.stringify(inventoryItems));
    } catch {
      // quota safeguard
    }
  }, [inventoryItems]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_documents', JSON.stringify(documents));
    } catch {
      // quota safeguard
    }
  }, [documents]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_requests', JSON.stringify(requests));
    } catch {
      // quota safeguard
    }
  }, [requests]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_stock_in', JSON.stringify(stockInList));
    } catch {
      // quota safeguard
    }
  }, [stockInList]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_stock_out', JSON.stringify(stockOutList));
    } catch {
      // quota safeguard
    }
  }, [stockOutList]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_movements', JSON.stringify(movements));
    } catch {
      // quota safeguard
    }
  }, [movements]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_maintenance', JSON.stringify(maintenances));
    } catch {
      // quota safeguard
    }
  }, [maintenances]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_users', JSON.stringify(users));
    } catch {
      // quota safeguard
    }
  }, [users]);

  useEffect(() => {
    try {
      localStorage.setItem('siman_roles', JSON.stringify(roles));
    } catch {
      // quota safeguard
    }
  }, [roles]);

  // Auth Helpers
  const loginAs = (role: User['role']) => {
    const target = users.find(u => u.role === role) || INITIAL_USERS.find(u => u.role === role) || users[0];
    setCurrentUser(target);
    setActiveView('dashboard');
    logAudit('Login Pengguna Berhasil', 'AUTH', `Pengguna ${target.name} (${target.role}) masuk ke sistem.`);
  };

  const switchUser = (id: string) => {
    const target = users.find(u => u.id === id);
    if (target) {
      setCurrentUser(target);
      logAudit('Alih Pengguna', 'AUTH', `Beralih ke akun ${target.name} (${target.role})`);
      pushNotification('SISTEM', 'Sesi Pengguna Berubah', `Sekarang Anda login sebagai ${target.name} (${target.role}).`, 'users');
    }
  };

  const logout = () => {
    if (currentUser) {
      logAudit('Logout Pengguna', 'AUTH', `Pengguna ${currentUser.name} keluar dari sistem.`);
    }
    setCurrentUser(null);
    setActiveView('login');
  };

  // User Management CRUD
  const addUser = (userData: Omit<User, 'id'>) => {
    const newId = `usr-${Date.now()}`;
    const newUser: User = {
      ...userData,
      id: newId,
      statusAktif: userData.statusAktif !== undefined ? userData.statusAktif : true
    };
    setUsers(prev => [newUser, ...prev]);
    logAudit('Tambah Pengguna Baru', 'AUTH', `Menambahkan pengguna baru: ${newUser.name} (${newUser.role}) - NIP: ${newUser.nip}`);
    pushNotification('SISTEM', '👤 Pengguna Baru Ditambahkan', `Akun untuk ${newUser.name} (${newUser.role}) berhasil didaftarkan.`, 'users');
    return newUser;
  };

  const updateUser = (id: string, updates: Partial<User>) => {
    setUsers(prev => prev.map(u => {
      if (u.id === id) {
        const updated = { ...u, ...updates };
        if (currentUser?.id === id) {
          setCurrentUser(updated);
        }
        return updated;
      }
      return u;
    }));
    logAudit('Perubahan Data Pengguna', 'AUTH', `Memperbarui data pengguna ID: ${id}`);
    pushNotification('SISTEM', 'Profil Pengguna Diperbarui', `Informasi pengguna telah diperbarui.`, 'users');
  };

  const deleteUser = (id: string) => {
    const target = users.find(u => u.id === id);
    if (!target) {
      return { success: false, message: 'Pengguna tidak ditemukan.' };
    }
    if (currentUser?.id === id) {
      return { success: false, message: 'Tidak dapat menghapus akun yang sedang Anda gunakan saat ini!' };
    }
    setUsers(prev => prev.filter(u => u.id !== id));
    logAudit('Penghapusan Pengguna', 'AUTH', `Menghapus akun pengguna: ${target.name} (${target.nip})`);
    pushNotification('PERINGATAN', 'Akun Pengguna Dihapus', `Akun ${target.name} telah dinonaktifkan dan dihapus dari sistem.`, 'users');
    return { success: true, message: `Pengguna ${target.name} berhasil dihapus.` };
  };

  // Role Management Methods (RBAC)
  const addRole = (roleData: Omit<RoleDefinition, 'id' | 'isSystem'>): RoleDefinition => {
    const newId = `role-${Date.now()}`;
    const newRole: RoleDefinition = {
      ...roleData,
      id: newId,
      isSystem: false,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setRoles(prev => [...prev, newRole]);
    logAudit('Tambah Role Baru', 'AUTH', `Membuat peran hak akses baru: ${newRole.name} [${newRole.code}]`);
    pushNotification('SISTEM', '🛡️ Role Baru Berhasil Dibuat', `Role "${newRole.name}" dengan kode [${newRole.code}] siap digunakan pada pengguna.`, 'users');
    return newRole;
  };

  const updateRole = (id: string, updates: Partial<RoleDefinition>) => {
    let oldName = '';
    let newName = '';
    setRoles(prev => prev.map(r => {
      if (r.id === id) {
        oldName = r.name;
        const updated = { ...r, ...updates };
        newName = updated.name;
        return updated;
      }
      return r;
    }));

    // If role name changed, update users who had that role name
    if (oldName && newName && oldName !== newName) {
      setUsers(prev => prev.map(u => u.role === oldName ? { ...u, role: newName } : u));
      if (currentUser?.role === oldName) {
        setCurrentUser(prev => prev ? { ...prev, role: newName } : null);
      }
    }

    logAudit('Konfigurasi Role RBAC', 'AUTH', `Memperbarui konfigurasi hak akses role ID: ${id}`);
    pushNotification('SISTEM', 'Hak Akses Role Diperbarui', `Perubahan hak akses untuk role telah disimpan ke sistem.`, 'users');
  };

  const deleteRole = (id: string) => {
    const target = roles.find(r => r.id === id);
    if (!target) {
      return { success: false, message: 'Role tidak ditemukan.' };
    }
    if (target.isSystem) {
      return { success: false, message: 'Role bawaan sistem tidak dapat dihapus!' };
    }
    const assignedUsers = users.filter(u => u.role === target.name);
    if (assignedUsers.length > 0) {
      return {
        success: false,
        message: `Role "${target.name}" masih digunakan oleh ${assignedUsers.length} pengguna (${assignedUsers.map(u => u.name).slice(0, 2).join(', ')}${assignedUsers.length > 2 ? '...' : ''}). Harap pindahkan role pengguna tersebut terlebih dahulu.`
      };
    }
    setRoles(prev => prev.filter(r => r.id !== id));
    logAudit('Hapus Role RBAC', 'AUTH', `Menghapus role kustom: ${target.name} (${target.code})`);
    pushNotification('PERINGATAN', 'Role Dihapus', `Role "${target.name}" telah dihapus dari daftar hak akses sistem.`, 'users');
    return { success: true, message: `Role "${target.name}" berhasil dihapus.` };
  };

  const getRoleByName = (name: string): RoleDefinition | undefined => {
    return roles.find(r => r.name.toLowerCase() === name.toLowerCase()) || roles.find(r => r.code.toLowerCase() === name.toLowerCase());
  };

  const hasPermission = (permission: keyof RolePermissions): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'Administrator') return true;
    const roleDef = getRoleByName(currentUser.role);
    if (!roleDef) return false;
    return Boolean(roleDef.permissions?.[permission]);
  };

  // Audit Logger Helper
  const logAudit = (aktivitas: string, modul: AuditLog['modul'], detail: string) => {
    const now = new Date();
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      userId: currentUser?.id || 'sys',
      userName: currentUser?.name || 'Sistem SIMAN',
      userRole: currentUser?.role || 'System',
      aktivitas,
      modul,
      tanggal: now.toISOString().split('T')[0],
      waktu: now.toLocaleTimeString('id-ID') + ' WITA',
      ipAddress: '192.168.10.45',
      detail
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  // Helper for notifications
  const pushNotification = (type: NotificationItem['type'], title: string, message: string, link?: string) => {
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      type,
      title,
      message,
      timestamp: 'Baru saja',
      read: false,
      link
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  // Asset CRUD
  const addAsset = (assetData: Omit<BmnAsset, 'id'>) => {
    const newId = `bmn-${Date.now()}`;
    const newAsset: BmnAsset = {
      ...assetData,
      fotoUrl: assetData.fotoUrl || getAssetPhotoUrl(assetData.namaBarang, assetData.kategori),
      id: newId
    };
    setAssets(prev => [newAsset, ...prev]);
    logAudit('Tambah Aset BMN Baru', 'ASET_BMN', `Penambahan aset: ${newAsset.namaBarang} (Kode: ${newAsset.kodeBarang}, NUP: ${newAsset.nup}) di ${newAsset.ruanganNama}`);
    pushNotification('TRANSAKSI', '📦 Aset BMN Baru Dicatat', `${newAsset.namaBarang} berhasil ditambahkan ke inventaris ${newAsset.ruanganNama}.`, 'assets');
  };

  const updateAsset = (id: string, updates: Partial<BmnAsset>) => {
    setAssets(prev => prev.map(a => (a.id === id ? { ...a, ...updates } : a)));
    logAudit('Perubahan Data Aset BMN', 'ASET_BMN', `Pembaruan data aset ID: ${id}`);
  };

  const deleteAsset = (id: string) => {
    const target = assets.find(a => a.id === id);
    if (!target) return;
    setAssets(prev => prev.filter(a => a.id !== id));
    logAudit('Penghapusan Aset BMN', 'ASET_BMN', `Aset ${target.namaBarang} (NUP: ${target.nup}) dihapus dari database.`);
  };

  const importAssets = (newAssetsData: Omit<BmnAsset, 'id'>[], mode: 'append' | 'upsert' = 'upsert') => {
    let added = 0;
    let updated = 0;
    setAssets(prev => {
      let nextList = [...prev];
      newAssetsData.forEach(incoming => {
        const existingIndex = mode === 'upsert'
          ? nextList.findIndex(a => a.kodeBarang === incoming.kodeBarang && Number(a.nup) === Number(incoming.nup))
          : -1;
        if (existingIndex >= 0) {
          nextList[existingIndex] = {
            ...nextList[existingIndex],
            ...incoming,
            id: nextList[existingIndex].id
          };
          updated++;
        } else {
          const newAsset: BmnAsset = {
            ...incoming,
            id: `bmn-imp-${Date.now()}-${Math.floor(Math.random() * 100000)}`
          };
          nextList = [newAsset, ...nextList];
          added++;
        }
      });
      return nextList;
    });
    logAudit('Import File Aset BMN', 'ASET_BMN', `Import batch aset BMN: ${added} aset baru ditambahkan, ${updated} diperbarui.`);
    pushNotification('TRANSAKSI', '📥 Import File Aset Selesai', `Berhasil memproses ${added + updated} data aset BMN (${added} baru, ${updated} pembaruan).`, 'assets');
    return { successCount: added, updatedCount: updated };
  };

  // Inventory CRUD
  const addInventoryItem = (itemData: Omit<InventoryItem, 'id'>) => {
    const newId = `inv-${Date.now()}`;
    const newItem: InventoryItem = {
      ...itemData,
      id: newId,
      fotoUrl: itemData.fotoUrl || getInventoryPhotoUrl(itemData.nama, itemData.subkategori, itemData.jenis),
      totalNilai: itemData.stokSaatIni * itemData.hargaSatuan
    };
    setInventoryItems(prev => [newItem, ...prev]);
    logAudit('Tambah Master Persediaan', 'PERSEDIAAN', `Penambahan barang persediaan: ${newItem.nama} (${newItem.jenis}) di ${newItem.binCode}`);
  };

  const updateInventoryItem = (id: string, updates: Partial<InventoryItem>) => {
    setInventoryItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };
        updated.totalNilai = updated.stokSaatIni * updated.hargaSatuan;
        if (updated.stokSaatIni === 0) {
          updated.status = 'Habis';
        } else if (updated.stokSaatIni <= updated.stokMinimum) {
          updated.status = 'Menipis';
        } else {
          updated.status = 'Aman';
        }
        return updated;
      })
    );
  };

  const importInventoryItems = (newItemsData: Omit<InventoryItem, 'id'>[], mode: 'append' | 'upsert' = 'upsert') => {
    let added = 0;
    let updated = 0;
    setInventoryItems(prev => {
      let nextList = [...prev];
      newItemsData.forEach(incoming => {
        const existingIndex = mode === 'upsert'
          ? nextList.findIndex(i => (incoming.kodeBarang && i.kodeBarang.toLowerCase() === incoming.kodeBarang.toLowerCase()) || i.nama.toLowerCase() === incoming.nama.toLowerCase())
          : -1;
        if (existingIndex >= 0) {
          const old = nextList[existingIndex];
          const newStock = incoming.stokSaatIni !== undefined ? incoming.stokSaatIni : old.stokSaatIni;
          const newPrice = incoming.hargaSatuan || old.hargaSatuan;
          const totalVal = newStock * newPrice;
          let newStatus: 'Aman' | 'Menipis' | 'Habis' = old.status;
          if (newStock === 0) newStatus = 'Habis';
          else if (newStock <= (incoming.stokMinimum ?? old.stokMinimum)) newStatus = 'Menipis';
          else newStatus = 'Aman';

          nextList[existingIndex] = {
            ...old,
            ...incoming,
            stokSaatIni: newStock,
            hargaSatuan: newPrice,
            totalNilai: totalVal,
            status: newStatus,
            id: old.id
          };
          updated++;
        } else {
          const totalVal = (incoming.stokSaatIni || 0) * (incoming.hargaSatuan || 0);
          let itemStatus: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
          if ((incoming.stokSaatIni || 0) === 0) itemStatus = 'Habis';
          else if ((incoming.stokSaatIni || 0) <= (incoming.stokMinimum || 5)) itemStatus = 'Menipis';

          const newItem: InventoryItem = {
            ...incoming,
            id: `inv-imp-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
            totalNilai: totalVal,
            status: itemStatus
          };
          nextList = [newItem, ...nextList];
          added++;
        }
      });
      return nextList;
    });
    logAudit('Import File Persediaan', 'PERSEDIAAN', `Import data persediaan: ${added} barang baru, ${updated} barang diperbarui.`);
    pushNotification('TRANSAKSI', '📥 Import Persediaan Selesai', `Berhasil memproses ${added + updated} data persediaan (${added} baru, ${updated} pembaruan).`, 'inventory');
    return { successCount: added, updatedCount: updated };
  };

  // Stock In Automation (STOK OTOMATIS BERTAMBAH)
  const addStockIn = (data: {
    itemId: string;
    jumlah: number;
    nomorDokumen: string;
    sumber: string;
    keterangan: string;
    hargaSatuan?: number;
  }) => {
    const item = inventoryItems.find(i => i.id === data.itemId);
    if (!item) return { success: false, message: 'Barang tidak ditemukan' };

    const newStock = item.stokSaatIni + data.jumlah;
    const finalPrice = data.hargaSatuan || item.hargaSatuan;
    const totalHarga = data.jumlah * finalPrice;
    const now = new Date();
    const tgl = now.toISOString().split('T')[0];
    const nomorTx = `BM-BPS7106/2026/${String(stockInList.length + 1).padStart(4, '0')}`;

    const newTx: StockInTransaction = {
      id: `sin-${Date.now()}`,
      nomorTransaksi: nomorTx,
      tanggal: tgl,
      nomorDokumen: data.nomorDokumen,
      sumber: data.sumber,
      itemId: item.id,
      namaBarang: item.nama,
      kategori: item.kategori,
      jenis: item.jenis,
      jumlah: data.jumlah,
      satuan: item.satuan,
      hargaSatuan: finalPrice,
      totalHarga: totalHarga,
      lokasiRak: item.rak,
      petugas: currentUser?.name || 'Petugas Gudang',
      keterangan: data.keterangan
    };

    setStockInList(prev => [newTx, ...prev]);

    // Update item stock
    updateInventoryItem(item.id, {
      stokSaatIni: newStock,
      hargaSatuan: finalPrice
    });

    logAudit('Penerimaan Barang Masuk', 'PERSEDIAAN', `Barang masuk: ${data.jumlah} ${item.satuan} ${item.nama}. Stok bertambah menjadi ${newStock}. No: ${nomorTx}`);
    pushNotification('TRANSAKSI', '📥 Barang Masuk Tersimpan', `Penerimaan ${data.jumlah} ${item.satuan} ${item.nama} telah masuk ke ${item.rak}.`, 'inventory');

    return { success: true, message: `Penerimaan barang berhasil disimpan! Stok bertambah menjadi ${newStock} ${item.satuan}.` };
  };

  // Stock Out Automation (STOK OTOMATIS BERKURANG)
  const addStockOut = (data: {
    itemId: string;
    jumlah: number;
    unitKerja: string;
    ruangan: string;
    pemohon: string;
    keperluan: string;
  }) => {
    const item = inventoryItems.find(i => i.id === data.itemId);
    if (!item) return { success: false, message: 'Barang tidak ditemukan' };

    // Validation: Stock cannot be exceeded!
    if (data.jumlah > item.stokSaatIni) {
      return {
        success: false,
        message: `Gagal! Stok tidak mencukupi. Stok saat ini hanya ${item.stokSaatIni} ${item.satuan}, permintaan: ${data.jumlah} ${item.satuan}.`
      };
    }

    const newStock = item.stokSaatIni - data.jumlah;
    const now = new Date();
    const tgl = now.toISOString().split('T')[0];
    const nomorTx = `BK-BPS7106/2026/${String(stockOutList.length + 1).padStart(4, '0')}`;

    const newTx: StockOutTransaction = {
      id: `sout-${Date.now()}`,
      nomorTransaksi: nomorTx,
      tanggal: tgl,
      unitKerja: data.unitKerja,
      ruangan: data.ruangan,
      pemohon: data.pemohon,
      itemId: item.id,
      namaBarang: item.nama,
      jenis: item.jenis,
      jumlah: data.jumlah,
      satuan: item.satuan,
      keperluan: data.keperluan,
      petugas: currentUser?.name || 'Petugas Gudang',
      keterangan: 'Barang diserahkan dalam keadaan baik.'
    };

    setStockOutList(prev => [newTx, ...prev]);

    // Update item stock
    updateInventoryItem(item.id, {
      stokSaatIni: newStock
    });

    // Check minimum threshold
    if (newStock === 0) {
      pushNotification('HABIS_STOK', '🔴 Stok Habis!', `${item.nama} telah habis (0 ${item.satuan}). Segera lakukan pengadaan darurat.`, 'inventory');
    } else if (newStock <= item.stokMinimum) {
      pushNotification('WARNING_STOK', '⚠️ Stok Menipis!', `${item.nama} tersisa ${newStock} ${item.satuan} (Batas minimum: ${item.stokMinimum}).`, 'inventory');
    }

    logAudit('Pengeluaran Barang Keluar', 'PERSEDIAAN', `Barang keluar: ${data.jumlah} ${item.satuan} ${item.nama} untuk ${data.pemohon} (${data.unitKerja}). Sisa stok: ${newStock}.`);

    return { success: true, message: `Barang keluar berhasil dicatat! Sisa stok sekarang ${newStock} ${item.satuan}.` };
  };

  // Inventory Requests
  const addInventoryRequest = (reqData: Omit<InventoryRequest, 'id' | 'nomorPermintaan' | 'tanggal' | 'status'>) => {
    const item = inventoryItems.find(i => i.id === reqData.itemId);
    const now = new Date();
    const newReq: InventoryRequest = {
      ...reqData,
      id: `req-${Date.now()}`,
      nomorPermintaan: `REQ-BPS7106/2026/${String(requests.length + 1).padStart(4, '0')}`,
      tanggal: now.toISOString().split('T')[0],
      status: 'Diajukan',
      namaBarang: item ? item.nama : reqData.namaBarang,
      satuan: item ? item.satuan : reqData.satuan
    };

    setRequests(prev => [newReq, ...prev]);
    logAudit('Pengajuan Permohonan Barang', 'PERSEDIAAN', `Permohonan baru ${newReq.nomorPermintaan}: ${newReq.jumlahDiminta} ${newReq.satuan} ${newReq.namaBarang} diajukan oleh ${newReq.pemohonNama}`);
    pushNotification('PERMINTAAN_BARU', '📋 Permohonan Barang Baru', `${newReq.pemohonNama} mengajukan ${newReq.jumlahDiminta} ${newReq.satuan} ${newReq.namaBarang}`, 'requests');
    return newReq;
  };

  const updateRequestStatus = (
    id: string,
    status: InventoryRequest['status'],
    catatan?: string,
    jumlahDisetujui?: number
  ) => {
    const target = requests.find(r => r.id === id);
    if (!target) return { success: false, message: 'Permohonan tidak ditemukan' };

    const approvedQty = jumlahDisetujui !== undefined
      ? jumlahDisetujui
      : (status === 'Disetujui' || status === 'Diproses' ? (target.jumlahDisetujui || target.jumlahDiminta) : target.jumlahDisetujui);

    // If status is "Selesai", auto stock out if not done yet
    if (status === 'Selesai' && target.status !== 'Selesai') {
      const stockRes = addStockOut({
        itemId: target.itemId,
        jumlah: approvedQty || target.jumlahDiminta,
        unitKerja: target.unitKerja,
        ruangan: target.ruangan,
        pemohon: target.pemohonNama,
        keperluan: target.keperluan
      });
      if (!stockRes.success) {
        return stockRes;
      }
    }

    setRequests(prev =>
      prev.map(r =>
        r.id === id
          ? {
              ...r,
              status,
              catatan: catatan !== undefined ? catatan : r.catatan,
              jumlahDisetujui: approvedQty
            }
          : r
      )
    );

    logAudit('Pembaruan Status Permohonan', 'PERSEDIAAN', `Permohonan ${target.nomorPermintaan} (${target.namaBarang}) diubah statusnya menjadi ${status}.`);
    pushNotification('TRANSAKSI', `📋 Status Permohonan: ${status}`, `Permohonan ${target.nomorPermintaan} (${target.namaBarang}) kini berstatus ${status}.`, 'requests');
    return { success: true, message: `Status permohonan berhasil diperbarui menjadi ${status}.` };
  };

  const deleteInventoryRequest = (id: string) => {
    const target = requests.find(r => r.id === id);
    if (!target) return;
    setRequests(prev => prev.filter(r => r.id !== id));
    logAudit('Hapus Permohonan Barang', 'PERSEDIAAN', `Permohonan ${target.nomorPermintaan} (${target.namaBarang}) dihapus.`);
    pushNotification('TRANSAKSI', '🗑️ Permohonan Dihapus', `Permohonan ${target.nomorPermintaan} telah dihapus dari sistem.`, 'requests');
  };

  // Asset Movement Workflow (SETELAH SELESAI LOKASI ASET OTOMATIS BERUBAH)
  const addAssetMovement = (movData: Omit<AssetMovement, 'id' | 'nomorTransaksi' | 'status' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString().split('T')[0];
    const newMov: AssetMovement = {
      ...movData,
      id: `mov-${Date.now()}`,
      nomorTransaksi: `MUT-BMN/7106/2026/${String(movements.length + 1).padStart(4, '0')}`,
      status: 'Pengajuan',
      createdAt: now,
      updatedAt: now
    };

    setMovements(prev => [newMov, ...prev]);

    // Mark asset as 'Dalam Proses Pemindahan'
    updateAsset(movData.assetId, { status: 'Dalam Proses Pemindahan' });

    logAudit('Pengajuan Pemindahan Aset', 'ASET_BMN', `Pengajuan mutasi aset ${movData.assetName} dari ${movData.lokasiAsalNama} ke ${movData.lokasiTujuanNama}`);
  };

  const updateMovementStatus = (id: string, status: AssetMovement['status'], catatan?: string) => {
    const target = movements.find(m => m.id === id);
    if (!target) return;

    setMovements(prev =>
      prev.map(m =>
        m.id === id
          ? {
              ...m,
              status,
              catatan: catatan || m.catatan,
              updatedAt: new Date().toISOString().split('T')[0]
            }
          : m
      )
    );

    // Automation: if Selesai -> LOKASI ASET OTOMATIS BERUBAH!
    if (status === 'Selesai') {
      const room = rooms.find(r => r.id === target.lokasiTujuanId);
      updateAsset(target.assetId, {
        ruanganId: target.lokasiTujuanId,
        ruanganNama: target.lokasiTujuanNama,
        gedung: room?.building || 'Gedung Utama Lt. 1',
        penanggungJawab: target.pemohon || room?.picName || 'Penanggung Jawab Ruangan',
        status: 'Aktif'
      });
      logAudit('Pemindahan Aset Selesai', 'ASET_BMN', `Aset ${target.assetName} telah resmi dipindahkan ke ${target.lokasiTujuanNama}. Lokasi diperbarui.`);
      pushNotification('TRANSAKSI', '✅ Pemindahan Aset Selesai', `${target.assetName} kini berada di ${target.lokasiTujuanNama}.`, 'assets');
    } else if (status === 'Ditolak') {
      updateAsset(target.assetId, { status: 'Aktif' });
    }
  };

  // Asset Maintenance
  const addAssetMaintenance = (mntData: Omit<AssetMaintenance, 'id' | 'nomorTiket'>) => {
    const newMnt: AssetMaintenance = {
      ...mntData,
      id: `mnt-${Date.now()}`,
      nomorTiket: `MNT-BMN/2026/${String(maintenances.length + 1).padStart(4, '0')}`
    };
    setMaintenances(prev => [newMnt, ...prev]);
    updateAsset(mntData.assetId, { status: 'Dalam Pemeliharaan' });
    logAudit('Input Pemeliharaan BMN', 'ASET_BMN', `Tiket perawatan ${newMnt.nomorTiket} untuk ${mntData.assetName} (${mntData.jenisPemeliharaan})`);
  };

  const updateMaintenanceStatus = (id: string, status: AssetMaintenance['status']) => {
    const target = maintenances.find(m => m.id === id);
    if (!target) return;
    setMaintenances(prev => prev.map(m => (m.id === id ? { ...m, status } : m)));
    if (status === 'Selesai') {
      updateAsset(target.assetId, { status: 'Aktif', kondisi: 'Baik' });
    }
    logAudit('Update Status Pemeliharaan BMN', 'ASET_BMN', `Tiket ${target.nomorTiket} status diubah menjadi ${status}`);
  };

  // Asset Disposal
  const addAssetDisposal = (dispData: Omit<AssetDisposal, 'id' | 'nomorPengajuan'>) => {
    const newDisp: AssetDisposal = {
      ...dispData,
      id: `dsp-${Date.now()}`,
      nomorPengajuan: `DSP-BMN/2026/${String(disposals.length + 1).padStart(4, '0')}`
    };
    setDisposals(prev => [newDisp, ...prev]);
    updateAsset(dispData.assetId, { status: 'Diusulkan Hapus' });
    logAudit('Pengajuan Penghapusan Aset BMN', 'ASET_BMN', `Usulan penghapusan BMN ${dispData.assetName}`);
  };

  const updateDisposalStatus = (id: string, status: AssetDisposal['status']) => {
    const target = disposals.find(d => d.id === id);
    if (!target) return;
    setDisposals(prev => prev.map(d => (d.id === id ? { ...d, status } : d)));
    if (status === 'Selesai') {
      updateAsset(target.assetId, { status: 'Dihapuskan' });
    }
    logAudit('Update Status Usulan Penghapusan', 'ASET_BMN', `Pengajuan ${target.nomorPengajuan} status menjadi ${status}`);
  };

  // Stock Opname
  const addStockOpname = (opnameData: Omit<StockOpname, 'id' | 'nomorOpname'>) => {
    const newOp: StockOpname = {
      ...opnameData,
      id: `opname-${Date.now()}`,
      nomorOpname: `BA-SO/BPS7106/2026/${String(opnames.length + 1).padStart(3, '0')}`
    };
    setOpnames(prev => [newOp, ...prev]);
    logAudit('Pencatatan Stock Opname', 'PERSEDIAAN', `Stock opname ${newOp.nomorOpname} periode ${newOp.periode} oleh ${newOp.petugas}`);
  };

  const approveStockOpname = (id: string) => {
    const target = opnames.find(o => o.id === id);
    if (!target) return;

    // Apply adjustments to inventory items
    target.items.forEach(it => {
      if (it.selisih !== 0) {
        updateInventoryItem(it.itemId, { stokSaatIni: it.stokFisik });
      }
    });

    setOpnames(prev =>
      prev.map(o => (o.id === id ? { ...o, status: 'Selesai', items: o.items.map(i => ({ ...i, statusPenyesuaian: 'Disesuaikan' })) } : o))
    );

    logAudit('Persetujuan Stock Opname', 'PERSEDIAAN', `Stock opname ${target.nomorOpname} disetujui. Selisih stok telah dikoreksi ke saldo fisik.`);
    pushNotification('TRANSAKSI', '✅ Berita Acara Stock Opname Disetujui', `Seluruh saldo persediaan telah diselaraskan dengan hasil opname fisik.`, 'stock-opname');
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  // Documents Management
  const addDocument = (docData: Omit<DocumentItem, 'id'>) => {
    const newDoc: DocumentItem = {
      ...docData,
      id: `doc-${Date.now()}`
    };
    setDocuments(prev => [newDoc, ...prev]);
    logAudit('Unggah Dokumen Digital', 'DOKUMEN', `Pengunggahan arsip digital: ${newDoc.judul} (${newDoc.nomorDokumen})`);
    pushNotification('TRANSAKSI', '📄 Dokumen Digital Diunggah', `${newDoc.judul} berhasil disimpan ke arsip digital.`, 'documents');
  };

  const deleteDocument = (id: string) => {
    const target = documents.find(d => d.id === id);
    if (!target) return;
    setDocuments(prev => prev.filter(d => d.id !== id));
    logAudit('Penghapusan Dokumen Digital', 'DOKUMEN', `Arsip ${target.judul} (${target.nomorDokumen}) dihapus.`);
  };

  const importSystemBackup = (data: { assets?: BmnAsset[]; inventoryItems?: InventoryItem[]; documents?: DocumentItem[] }) => {
    if (data.assets && Array.isArray(data.assets)) {
      setAssets(data.assets);
    }
    if (data.inventoryItems && Array.isArray(data.inventoryItems)) {
      setInventoryItems(data.inventoryItems);
    }
    if (data.documents && Array.isArray(data.documents)) {
      setDocuments(data.documents);
    }
    logAudit('Restore / Import Backup Sistem', 'SISTEM', `Pemulihan data backup berhasil diimpor.`);
    pushNotification('TRANSAKSI', '🔄 Restore Backup Selesai', `Data database berhasil diperbarui dari file backup.`, 'dashboard');
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        loginAs,
        logout,
        activeView,
        setActiveView,
        performance3D,
        setPerformance3D,
        rooms,
        warehouseRacks,
        assets,
        inventoryItems,
        stockInList,
        stockOutList,
        requests,
        opnames,
        movements,
        maintenances,
        disposals,
        documents,
        auditLogs,
        notifications,
        users,
        addUser,
        updateUser,
        deleteUser,
        switchUser,
        roles,
        addRole,
        updateRole,
        deleteRole,
        getRoleByName,
        hasPermission,
        addAsset,
        updateAsset,
        deleteAsset,
        importAssets,
        addInventoryItem,
        updateInventoryItem,
        importInventoryItems,
        addStockIn,
        addStockOut,
        addInventoryRequest,
        updateRequestStatus,
        deleteInventoryRequest,
        addAssetMovement,
        updateMovementStatus,
        addAssetMaintenance,
        updateMaintenanceStatus,
        addAssetDisposal,
        updateDisposalStatus,
        addStockOpname,
        approveStockOpname,
        addDocument,
        deleteDocument,
        importSystemBackup,
        markNotificationRead,
        markAllNotificationsRead,
        selectedAsset,
        setSelectedAsset,
        selectedInventoryItem,
        setSelectedInventoryItem,
        isGlobalSearchOpen,
        setIsGlobalSearchOpen,
        isQuickActionOpen,
        setIsQuickActionOpen,
        isQrScannerOpen,
        setIsQrScannerOpen,
        isAiAssistantOpen,
        setIsAiAssistantOpen,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        printableData,
        setPrintableData
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
