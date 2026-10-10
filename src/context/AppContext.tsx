import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  User,
  RoleDefinition,
  RolePermissions,
  BmnAsset,
  InventoryItem,
  StockInTransaction,
  StockOutTransaction,
  InventoryRequest,
  InventoryRequestItem,
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
import { DashboardFilters, DEFAULT_DASHBOARD_FILTERS } from '../utils/dashboardFilters';

export type ActiveView =
  | 'landing'
  | 'login'
  | 'dashboard'
  | 'assets'
  | 'rooms'
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

type StockInDetails = {
  itemId: string;
  jumlah: number;
  nomorDokumen: string;
  sumber: string;
  keterangan: string;
  hargaSatuan?: number;
  tanggal: string;
};

interface AppContextType {
  currentUser: User | null;
  isInitializing: boolean;
  syncError: string | null;
  login: (nip: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  dashboardFilters: DashboardFilters;
  setDashboardFilters: (filters: DashboardFilters) => void;
  
  // 3D Settings
  performance3D: 'normal' | 'performance' | 'low';
  setPerformance3D: (mode: 'normal' | 'performance' | 'low') => void;
  
  // Data State
  rooms: OfficeRoom[];
  addRoom: (room: Omit<OfficeRoom, 'id'>) => OfficeRoom;
  updateRoom: (id: string, updates: Partial<OfficeRoom>) => void;
  deleteRoom: (id: string) => { success: boolean; message: string };
  isRoomModalOpen: boolean;
  setIsRoomModalOpen: (open: boolean) => void;
  editingRoom: OfficeRoom | null;
  setEditingRoom: (room: OfficeRoom | null) => void;
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
  setUserPassword: (user: User, password: string) => Promise<void>;
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
  // DITAMBAHKAN: penghapusan master persediaan berdasarkan ID.
  deleteInventoryItem: (id: string) => { success: boolean; message: string };
  importInventoryItems: (newItems: Omit<InventoryItem, 'id'>[], mode?: 'append' | 'upsert') => { successCount: number; updatedCount: number };
  
  addStockIn: (data: {
    itemId: string;
    jumlah: number;
    nomorDokumen: string;
    sumber: string;
    keterangan: string;
    hargaSatuan?: number;
    tanggal: string;
  }) => { success: boolean; message: string };
  updateStockIn: (id: string, data: StockInDetails) => { success: boolean; message: string };
  inspectStockIn: (id: string, pemeriksaan: NonNullable<StockInTransaction['pemeriksaan']>) => { success: boolean; message: string };
  verifyStockIn: (id: string, diterima: boolean, catatan?: string) => { success: boolean; message: string };
  deleteStockIn: (id: string) => { success: boolean; message: string };
  
  addStockOut: (data: {
    itemId: string;
    jumlah: number;
    unitKerja: string;
    ruangan: string;
    pemohon: string;
    keperluan: string;
  }, sequenceOffset?: number) => { success: boolean; message: string };
  
  addInventoryRequest: (req: Omit<InventoryRequest, 'id' | 'nomorPermintaan' | 'tanggal' | 'status'>) => InventoryRequest;
  updateRequestStatus: (id: string, status: InventoryRequest['status'], catatan?: string, jumlahDisetujui?: number, itemsDisetujui?: InventoryRequestItem[]) => { success: boolean; message: string };
  deleteInventoryRequest: (id: string) => void;
  
  addAssetMovement: (mov: Omit<AssetMovement, 'id' | 'nomorTransaksi' | 'status' | 'createdAt' | 'updatedAt'>) => void;
  updateMovementStatus: (id: string, status: AssetMovement['status'], catatan?: string) => void;
  deleteAssetMovement: (id: string) => { success: boolean; message: string };
  
  addAssetMaintenance: (mnt: Omit<AssetMaintenance, 'id' | 'nomorTiket'>) => void;
  updateMaintenanceStatus: (id: string, status: AssetMaintenance['status']) => void;
  deleteAssetMaintenance: (id: string) => { success: boolean; message: string };
  
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

function normalizeNotificationIds(notifications: NotificationItem[]): NotificationItem[] {
  const reservedIds = new Set(notifications.map(notification => notification.id));
  const usedIds = new Set<string>();
  const seenContent = new Map<string, Map<string, number>>();
  const normalized: NotificationItem[] = [];

  for (const notification of notifications) {
    const signature = JSON.stringify([
      notification.type,
      notification.title,
      notification.message,
      notification.timestamp,
      notification.link
    ]);
    let contentIds = seenContent.get(notification.id);
    if (!contentIds) {
      contentIds = new Map();
      seenContent.set(notification.id, contentIds);
    }

    const existingIndex = contentIds.get(signature);
    if (existingIndex !== undefined) {
      normalized[existingIndex] = {
        ...normalized[existingIndex],
        read: normalized[existingIndex].read && notification.read
      };
      continue;
    }

    let id = notification.id;
    if (usedIds.has(id)) {
      let firstHash = 0x811c9dc5;
      let secondHash = 0x811c9dc5;
      for (let index = 0; index < signature.length; index += 1) {
        const code = signature.charCodeAt(index);
        firstHash = Math.imul(firstHash ^ code, 0x01000193);
        secondHash = Math.imul(secondHash ^ (code + index), 0x01000193);
      }
      const suffix = `${(firstHash >>> 0).toString(36)}${(secondHash >>> 0).toString(36)}`;
      let collision = 0;
      do {
        id = `${notification.id}-${suffix}${collision ? `-${collision}` : ''}`;
        collision += 1;
      } while (usedIds.has(id) || reservedIds.has(id));
    }

    contentIds.set(signature, normalized.length);
    usedIds.add(id);
    normalized.push(id === notification.id ? notification : { ...notification, id });
  }

  return normalized;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const revisionRef = useRef(0);
  const syncBlockedRef = useRef(false);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRequestWhatsAppEventsRef = useRef<Array<{
    eventId: string;
    requestId: string;
    status: InventoryRequest['status'];
    action: 'submitted' | 'status_changed';
    note?: string;
  }>>([]);
  const queuedRequestWhatsAppStatusRef = useRef<Map<string, InventoryRequest['status']>>(new Map());

  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>({ ...DEFAULT_DASHBOARD_FILTERS });
  const [performance3D, setPerformance3D] = useState<'normal' | 'performance' | 'low'>('normal');

  // Rooms & Racks
  const [rooms, setRooms] = useState<OfficeRoom[]>(() => {
    const saved = localStorage.getItem('siman_rooms');
    if (saved) {
      try {
        const parsed: OfficeRoom[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // fallback
      }
    }
    return OFFICE_ROOMS;
  });
  const [warehouseRacks] = useState<WarehouseRack[]>(WAREHOUSE_RACKS);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<OfficeRoom | null>(null);

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
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return normalizeNotificationIds(parsed);
      } catch {
        // Fall back to the generated notifications.
      }
    }
    return normalizeNotificationIds(generateInitialNotifications());
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

  const sharedState = {
    rooms, assets, inventoryItems, stockInList, stockOutList, requests, opnames,
    movements, maintenances, disposals, documents, auditLogs, notifications, users, roles
  };

  const applySharedState = (state: Record<string, unknown>) => {
    if (Array.isArray(state.rooms)) setRooms(state.rooms as OfficeRoom[]);
    if (Array.isArray(state.assets)) setAssets(state.assets as BmnAsset[]);
    if (Array.isArray(state.inventoryItems)) setInventoryItems(state.inventoryItems as InventoryItem[]);
    if (Array.isArray(state.stockInList)) setStockInList(state.stockInList as StockInTransaction[]);
    if (Array.isArray(state.stockOutList)) setStockOutList(state.stockOutList as StockOutTransaction[]);
    if (Array.isArray(state.requests)) setRequests(state.requests as InventoryRequest[]);
    if (Array.isArray(state.opnames)) setOpnames(state.opnames as StockOpname[]);
    if (Array.isArray(state.movements)) setMovements(state.movements as AssetMovement[]);
    if (Array.isArray(state.maintenances)) setMaintenances(state.maintenances as AssetMaintenance[]);
    if (Array.isArray(state.disposals)) setDisposals(state.disposals as AssetDisposal[]);
    if (Array.isArray(state.documents)) setDocuments(state.documents as DocumentItem[]);
    if (Array.isArray(state.auditLogs)) setAuditLogs(state.auditLogs as AuditLog[]);
    if (Array.isArray(state.notifications)) {
      setNotifications(normalizeNotificationIds(state.notifications as NotificationItem[]));
    }
    if (Array.isArray(state.users)) setUsers(state.users as User[]);
    if (Array.isArray(state.roles)) setRoles(state.roles as RoleDefinition[]);
  };

  const loadSessionData = async (authenticatedUser: User) => {
    const response = await fetch('/api/state');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Gagal memuat data terpusat.');
    revisionRef.current = result.revision;
    if (!result.initialized) {
      if (authenticatedUser.role !== 'Administrator') {
        throw new Error('Database belum diinisialisasi. Administrator harus masuk terlebih dahulu.');
      }
      const existingAdmin = sharedState.users.find(user => user.id === authenticatedUser.id);
      const initialUsers = existingAdmin
        ? sharedState.users.map(user => user.id === authenticatedUser.id ? { ...user, ...authenticatedUser, role: 'Administrator' } : user)
        : [authenticatedUser, ...sharedState.users];
      const initialState = { ...sharedState, users: initialUsers };
      const saveResponse = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: initialState, revision: revisionRef.current })
      });
      const saveResult = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveResult.error || 'Gagal menginisialisasi data terpusat.');
      revisionRef.current = saveResult.revision;
      applySharedState(initialState);
    } else {
      applySharedState(result.state);
      const storedUser = (result.state.users as User[] | null)?.find(user => user.id === authenticatedUser.id);
      if (storedUser) setCurrentUser(storedUser);
    }
    setDataReady(true);
  };

  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.status === 401) {
          if (mounted) setCurrentUser(null);
          return;
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Gagal memeriksa sesi masuk.');
        if (!mounted) return;
        setCurrentUser(result.user);
        await loadSessionData(result.user);
      } catch (error) {
        if (mounted) {
          setCurrentUser(null);
          setDataReady(false);
          setSyncError(error instanceof Error ? error.message : 'Server tidak dapat dihubungi.');
        }
      } finally {
        if (mounted) setAuthReady(true);
      }
    };
    void restoreSession();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!currentUser || !dataReady) return;
    const timer = window.setTimeout(async () => {
      syncQueueRef.current = syncQueueRef.current.then(async () => {
        if (syncBlockedRef.current) return;
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: sharedState, revision: revisionRef.current })
        });
        const result = await response.json();
        if (response.status === 409) {
          syncBlockedRef.current = true;
          setSyncError(result.error || 'Data berubah di perangkat lain. Muat ulang halaman sebelum menyimpan lagi.');
          return;
        }
        if (!response.ok) throw new Error(result.error || 'Perubahan tidak tersimpan ke server.');
        revisionRef.current = result.revision;
        setSyncError(null);
        const persistedRequests = (sharedState.requests as InventoryRequest[]) || [];
        const pendingEvents = pendingRequestWhatsAppEventsRef.current;
        const readyEvents = pendingEvents.filter(event =>
          persistedRequests.some(request => request.id === event.requestId && request.status === event.status)
        );
        for (const event of readyEvents) {
          if (queuedRequestWhatsAppStatusRef.current.get(event.requestId) === event.status) {
            queuedRequestWhatsAppStatusRef.current.delete(event.requestId);
          }
        }
        pendingRequestWhatsAppEventsRef.current = pendingEvents.filter(event =>
          !readyEvents.includes(event) && !persistedRequests.some(request => request.id === event.requestId && request.status !== event.status)
        );
        for (const event of readyEvents) {
          void fetch('/api/whatsapp/request-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
          }).then(async notificationResponse => {
            const notificationResult = await notificationResponse.json();
            if (notificationResult.skipped) return;
            const success = notificationResponse.ok && notificationResult.success;
            pushNotification(
              success ? 'TRANSAKSI' : 'PERINGATAN',
              success ? 'Provider WhatsApp Menerima Pesan' : 'Notifikasi WhatsApp Gagal',
              success
                ? 'Provider WhatsApp menerima permintaan pesan. Status pengantaran ke perangkat belum terkonfirmasi.'
                : notificationResult.error || 'Permohonan berhasil diproses, tetapi notifikasi WhatsApp gagal dikirim.',
              'requests'
            );
          }).catch(error => {
            const details = error instanceof Error ? error.message : 'Server notifikasi tidak dapat dihubungi.';
            pushNotification(
              'PERINGATAN',
              'Notifikasi WhatsApp Gagal',
              `Permohonan berhasil diproses, tetapi notifikasi WhatsApp gagal dikirim. ${details}`,
              'requests'
            );
          });
        }
      }).catch(error => {
        setSyncError(error instanceof Error ? error.message : 'Perubahan tidak tersimpan ke server.');
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    currentUser, dataReady, rooms, assets, inventoryItems, stockInList, stockOutList,
    requests, opnames, movements, maintenances, disposals, documents, auditLogs,
    notifications, users, roles
  ]);

  const login = async (nip: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nip, password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Gagal masuk.');
    setDataReady(false);
    syncBlockedRef.current = false;
    revisionRef.current = 0;
    setCurrentUser(result.user);
    try {
      await loadSessionData(result.user);
      setSyncError(null);
      setActiveView('dashboard');
    } catch (error) {
      await fetch('/api/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      setDataReady(false);
      syncBlockedRef.current = false;
      throw error;
    }
  };

  const logout = async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Gagal keluar dari sistem.');
    setDataReady(false);
    syncBlockedRef.current = false;
    setCurrentUser(null);
    setSyncError(null);
    setActiveView('login');
  };

  const setUserPassword = async (user: User, password: string) => {
    const response = await fetch(`/api/auth/users/${encodeURIComponent(user.id)}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Gagal menyimpan kata sandi akun.');
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
      id: `notif-${crypto.randomUUID()}`,
      type,
      title,
      message,
      timestamp: 'Baru saja',
      read: false,
      link
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const queueRequestWhatsAppEvent = (
    request: InventoryRequest,
    action: 'submitted' | 'status_changed',
    note?: string
  ) => {
    pendingRequestWhatsAppEventsRef.current.push({
      eventId: crypto.randomUUID(),
      requestId: request.id,
      status: request.status,
      action,
      note
    });
  };

  // Room Management CRUD
  const ALLOWED_ROOM_ROLES = ['Administrator', 'Pengelola BMN', 'Pimpinan'];

  const addRoom = (roomData: Omit<OfficeRoom, 'id'>) => {
    if (currentUser && !ALLOWED_ROOM_ROLES.includes(currentUser.role)) {
      logAudit('Percobaan Akses Ditolak', 'AUTH', `Pengguna ${currentUser.name} (${currentUser.role}) mencoba menambah ruangan tanpa izin.`);
      pushNotification('PERINGATAN', 'Akses Ditolak', 'Hanya Pimpinan, Administrator, dan Pengelola BMN yang berhak membuat ruangan baru.', 'dashboard');
      throw new Error('Akses ditolak: Role Anda tidak memiliki izin untuk membuat ruangan.');
    }

    const code = roomData.code.trim();
    if (!code || !roomData.name.trim() || !roomData.building.trim() || !roomData.picName.trim() ||
        !Number.isInteger(roomData.floor) || roomData.floor < 1) {
      throw new Error('Kode, nama, gedung, lantai, dan penanggung jawab ruangan wajib diisi dengan benar.');
    }
    if (rooms.some(room => room.code.trim().toLocaleLowerCase('id-ID') === code.toLocaleLowerCase('id-ID'))) {
      throw new Error(`Kode ruangan "${code}" sudah digunakan oleh ruangan lain.`);
    }

    const newId = `rm-${Date.now()}`;
    const newRoom: OfficeRoom = {
      ...roomData,
      code,
      name: roomData.name.trim(),
      building: roomData.building.trim(),
      picName: roomData.picName.trim(),
      id: newId
    };
    setRooms(prev => [...prev, newRoom]);
    logAudit('Tambah Ruangan Baru', 'ASET_BMN', `Menambahkan unit ruangan baru: ${newRoom.name} (${newRoom.code}) di ${newRoom.building} Lt. ${newRoom.floor} - PIC: ${newRoom.picName}`);
    pushNotification('TRANSAKSI', '🏢 Ruangan Baru Ditambahkan', `Ruangan ${newRoom.name} (${newRoom.code}) berhasil didaftarkan ke master ruangan.`, 'rooms');
    return newRoom;
  };

  const updateRoom = (id: string, updates: Partial<OfficeRoom>) => {
    if (currentUser && !ALLOWED_ROOM_ROLES.includes(currentUser.role)) {
      logAudit('Percobaan Akses Ditolak', 'AUTH', `Pengguna ${currentUser.name} (${currentUser.role}) mencoba memperbarui data ruangan tanpa izin.`);
      pushNotification('PERINGATAN', 'Akses Ditolak', 'Hanya Pimpinan, Administrator, dan Pengelola BMN yang berhak mengubah data ruangan.', 'dashboard');
      throw new Error('Akses ditolak: Role Anda tidak memiliki izin untuk mengubah data ruangan.');
    }

    const existingRoom = rooms.find(room => room.id === id);
    if (!existingRoom) throw new Error('Ruangan yang akan diperbarui tidak ditemukan.');
    const updatedRoom = { ...existingRoom, ...updates };
    const code = updatedRoom.code.trim();
    if (!code || !updatedRoom.name.trim() || !updatedRoom.building.trim() || !updatedRoom.picName.trim() ||
        !Number.isInteger(updatedRoom.floor) || updatedRoom.floor < 1) {
      throw new Error('Kode, nama, gedung, lantai, dan penanggung jawab ruangan wajib diisi dengan benar.');
    }
    if (rooms.some(room => room.id !== id && room.code.trim().toLocaleLowerCase('id-ID') === code.toLocaleLowerCase('id-ID'))) {
      throw new Error(`Kode ruangan "${code}" sudah digunakan oleh ruangan lain.`);
    }

    setRooms(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)));
    // If room name, building, or PIC changed, also sync in assets table
    if (updates.name || updates.building || updates.picName) {
      setAssets(prev =>
        prev.map(a => {
          if (a.ruanganId === id) {
            return {
              ...a,
              ruanganNama: updates.name || a.ruanganNama,
              gedung: updates.building || a.gedung,
              penanggungJawab: updates.picName || a.penanggungJawab
            };
          }
          return a;
        })
      );
    }
    logAudit('Pembaruan Data Ruangan', 'ASET_BMN', `Pembaruan data ruangan ID: ${id}`);
    pushNotification('TRANSAKSI', '🏢 Data Ruangan Diperbarui', `Informasi ruangan berhasil disimpan dan disinkronkan.`, 'rooms');
  };

  const deleteRoom = (id: string) => {
    if (currentUser && !ALLOWED_ROOM_ROLES.includes(currentUser.role)) {
      logAudit('Percobaan Akses Ditolak', 'AUTH', `Pengguna ${currentUser.name} (${currentUser.role}) mencoba menghapus ruangan tanpa izin.`);
      pushNotification('PERINGATAN', 'Akses Ditolak', 'Hanya Pimpinan, Administrator, dan Pengelola BMN yang berhak menghapus ruangan.', 'dashboard');
      return { success: false, message: 'Akses ditolak: Hanya Pimpinan, Administrator, dan Pengelola BMN yang berhak menghapus ruangan.' };
    }

    const target = rooms.find(r => r.id === id);
    if (!target) {
      return { success: false, message: 'Ruangan tidak ditemukan dalam sistem.' };
    }
    const assignedAssetsCount = assets.filter(a => a.ruanganId === id).length;
    if (assignedAssetsCount > 0) {
      return {
        success: false,
        message: `Tidak dapat menghapus ruangan "${target.name}". Masih terdapat ${assignedAssetsCount} unit aset BMN terdaftar di ruangan ini. Silakan mutasikan atau pindahkan aset terlebih dahulu.`
      };
    }
    setRooms(prev => prev.filter(r => r.id !== id));
    logAudit('Penghapusan Ruangan', 'ASET_BMN', `Ruangan ${target.name} (${target.code}) dihapus dari master sistem.`);
    pushNotification('TRANSAKSI', '🗑️ Ruangan Dihapus', `Ruangan ${target.name} (${target.code}) berhasil dihapus.`, 'rooms');
    return { success: true, message: `Ruangan "${target.name}" berhasil dihapus.` };
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

  // DITAMBAHKAN: validasi ID sebelum menghapus satu barang persediaan.
  const deleteInventoryItem = (id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      return { success: false, message: 'ID persediaan tidak valid.' };
    }
    const target = inventoryItems.find(item => item.id === id);
    if (!target) {
      return { success: false, message: 'Data persediaan tidak ditemukan.' };
    }
    setInventoryItems(prev => prev.filter(item => item.id !== id));
    logAudit('Penghapusan Master Persediaan', 'PERSEDIAAN', `Barang persediaan ${target.nama} (${target.kodeBarang}) dihapus.`);
    return { success: true, message: `Barang "${target.nama}" berhasil dihapus.` };
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

  const validateStockInDetails = (data: StockInDetails) => {
    const item = inventoryItems.find(candidate => candidate.id === data.itemId);
    if (!item) {
      return 'Barang persediaan tidak ditemukan.';
    }
    if (!Number.isFinite(data.jumlah) || data.jumlah <= 0) return 'Jumlah harus lebih besar dari 0.';
    if (data.hargaSatuan !== undefined && (!Number.isFinite(data.hargaSatuan) || data.hargaSatuan < 0)) {
      return 'Harga satuan tidak valid.';
    }
    if (!Number.isFinite(data.jumlah * (data.hargaSatuan ?? item.hargaSatuan))) {
      return 'Nilai transaksi terlalu besar atau tidak valid.';
    }
    if (!data.nomorDokumen.trim() || !data.sumber.trim()) return 'Nomor dokumen dan sumber perolehan wajib diisi.';
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(data.tanggal)
      ? new Date(`${data.tanggal}T00:00:00`)
      : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) ||
        `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}` !== data.tanggal) {
      return 'Tanggal transaksi tidak valid.';
    }
    return null;
  };

  const addStockIn = (data: StockInDetails) => {
    const validationError = validateStockInDetails(data);
    if (validationError) return { success: false, message: validationError };
    const item = inventoryItems.find(i => i.id === data.itemId);
    if (!item) return { success: false, message: 'Barang persediaan tidak ditemukan.' };
    const finalPrice = data.hargaSatuan ?? item.hargaSatuan;
    const totalHarga = data.jumlah * finalPrice;
    const year = data.tanggal.slice(0, 4);
    const sequence = stockInList.reduce((max, tx) => {
      if (!tx.nomorTransaksi?.startsWith(`BM-BPS7106/${year}/`)) return max;
      const suffix = Number(tx.nomorTransaksi.split('/').pop());
      return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
    }, 0) + 1;
    let id = `sin-${Date.now()}`;
    while (stockInList.some(tx => tx.id === id)) id = `sin-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const nomorTx = `BM-BPS7106/${year}/${String(sequence).padStart(4, '0')}`;

    const newTx: StockInTransaction = {
      id,
      nomorTransaksi: nomorTx,
      tanggal: data.tanggal,
      nomorDokumen: data.nomorDokumen.trim(),
      sumber: data.sumber.trim(),
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
      keterangan: data.keterangan.trim(),
      status: 'Menunggu Pemeriksaan'
    };

    setStockInList(prev => [newTx, ...prev]);
    logAudit('Pencatatan Barang Masuk', 'PERSEDIAAN', `Penerimaan ${data.jumlah} ${item.satuan} ${item.nama} dicatat dan menunggu pemeriksaan. No: ${nomorTx}`);
    pushNotification('TRANSAKSI', '📥 Barang Masuk Menunggu Pemeriksaan', `${item.nama} (${data.jumlah} ${item.satuan}) menunggu pemeriksaan sebelum stok diperbarui.`, 'inventory');
    return { success: true, message: `Penerimaan ${nomorTx} tersimpan dan menunggu pemeriksaan. Stok belum berubah.` };
  };

  const updateStockIn = (id: string, data: StockInDetails) => {
    const target = stockInList.find(tx => tx.id === id);
    if (!target) return { success: false, message: 'Transaksi Barang Masuk tidak ditemukan.' };
    if (target.status !== 'Menunggu Pemeriksaan' && target.status !== 'Ditolak') {
      return { success: false, message: 'Transaksi yang sudah diperiksa atau diverifikasi tidak dapat diedit.' };
    }
    const validationError = validateStockInDetails(data);
    if (validationError) return { success: false, message: validationError };
    const item = inventoryItems.find(i => i.id === data.itemId);
    if (!item) return { success: false, message: 'Barang persediaan tidak ditemukan.' };
    const updated: StockInTransaction = {
      ...target,
      tanggal: data.tanggal,
      nomorDokumen: data.nomorDokumen.trim(),
      sumber: data.sumber.trim(),
      itemId: item.id,
      namaBarang: item.nama,
      kategori: item.kategori,
      jenis: item.jenis,
      jumlah: data.jumlah,
      satuan: item.satuan,
      hargaSatuan: data.hargaSatuan ?? item.hargaSatuan,
      totalHarga: data.jumlah * (data.hargaSatuan ?? item.hargaSatuan),
      lokasiRak: item.rak,
      keterangan: data.keterangan.trim(),
      status: 'Menunggu Pemeriksaan',
      pemeriksaan: undefined,
      diverifikasiOleh: undefined,
      diverifikasiPada: undefined
    };
    setStockInList(prev => prev.map(tx => tx.id === id ? updated : tx));
    logAudit('Perubahan Barang Masuk', 'PERSEDIAAN', `Transaksi ${target.nomorTransaksi} diperbarui dan kembali menunggu pemeriksaan.`);
    return { success: true, message: 'Transaksi diperbarui dan menunggu pemeriksaan ulang.' };
  };

  const inspectStockIn = (id: string, pemeriksaan: NonNullable<StockInTransaction['pemeriksaan']>) => {
    const target = stockInList.find(tx => tx.id === id);
    if (!target) return { success: false, message: 'Transaksi Barang Masuk tidak ditemukan.' };
    if (target.status !== 'Menunggu Pemeriksaan') return { success: false, message: 'Transaksi ini tidak sedang menunggu pemeriksaan.' };
    if (!pemeriksaan.diperiksaOleh.trim() || !pemeriksaan.diperiksaPada ||
        !['Baik', 'Rusak Ringan', 'Rusak Berat'].includes(pemeriksaan.kondisi)) {
      return { success: false, message: 'Data pemeriksaan belum lengkap.' };
    }
    setStockInList(prev => prev.map(tx => tx.id === id
      ? { ...tx, status: 'Sudah Diperiksa', pemeriksaan }
      : tx));
    logAudit('Pemeriksaan Barang Masuk', 'PERSEDIAAN', `Transaksi ${target.nomorTransaksi} diperiksa oleh ${pemeriksaan.diperiksaOleh}.`);
    return { success: true, message: 'Pemeriksaan tersimpan. Lanjutkan dengan verifikasi diterima atau ditolak.' };
  };

  const verifyStockIn = (id: string, diterima: boolean, catatan = '') => {
    const target = stockInList.find(tx => tx.id === id);
    if (!target) return { success: false, message: 'Transaksi Barang Masuk tidak ditemukan.' };
    if (target.status !== 'Sudah Diperiksa' || !target.pemeriksaan) {
      return { success: false, message: 'Transaksi harus diperiksa sebelum diverifikasi.' };
    }
    if (diterima && (!target.pemeriksaan.jumlahSesuai || !target.pemeriksaan.dokumenSesuai ||
        !target.pemeriksaan.barangSesuai || target.pemeriksaan.kondisi === 'Rusak Berat')) {
      return { success: false, message: 'Penerimaan dengan hasil pemeriksaan tidak sesuai atau kondisi rusak berat harus ditolak.' };
    }
    const item = inventoryItems.find(i => i.id === target.itemId);
    if (diterima && !item) return { success: false, message: 'Barang persediaan terkait tidak ditemukan; stok tidak dapat diperbarui.' };
    if (diterima && item && !Number.isFinite(item.stokSaatIni + target.jumlah)) {
      return { success: false, message: 'Perubahan stok menghasilkan nilai yang tidak valid.' };
    }
    const status = diterima ? 'Diverifikasi' : 'Ditolak';
    if (diterima && item) {
      updateInventoryItem(item.id, {
        stokSaatIni: item.stokSaatIni + target.jumlah,
        hargaSatuan: target.hargaSatuan
      });
    }
    setStockInList(prev => prev.map(tx => tx.id === id
      ? {
          ...tx,
          status,
          keterangan: catatan.trim() ? `${tx.keterangan}${tx.keterangan ? ' | ' : ''}Verifikasi: ${catatan.trim()}` : tx.keterangan,
          diverifikasiOleh: currentUser?.name || 'Petugas Gudang',
          diverifikasiPada: new Date().toISOString()
        }
      : tx));
    const auditDetail = `Transaksi ${target.nomorTransaksi} ${diterima ? 'diterima dan stok ditambahkan' : 'ditolak'}${catatan.trim() ? `: ${catatan.trim()}` : '.'}`;
    logAudit('Verifikasi Barang Masuk', 'PERSEDIAAN', auditDetail);
    if (diterima && item) {
      pushNotification('TRANSAKSI', '✅ Barang Masuk Diverifikasi', `${target.jumlah} ${item.satuan} ${item.nama} telah ditambahkan ke stok.`, 'inventory');
    }
    return {
      success: true,
      message: diterima ? `Transaksi diverifikasi; stok ${item?.nama} bertambah ${target.jumlah} ${target.satuan}.` : 'Transaksi ditolak dan tidak mengubah stok.'
    };
  };

  const deleteStockIn = (id: string) => {
    const target = stockInList.find(tx => tx.id === id);
    if (!target) return { success: false, message: 'Transaksi Barang Masuk tidak ditemukan.' };
    const isPosted = target.status === undefined || target.status === 'Diverifikasi';
    if (isPosted) {
      const item = inventoryItems.find(i => i.id === target.itemId);
      if (!item) return { success: false, message: 'Barang persediaan terkait tidak ditemukan; transaksi historis tidak dapat dihapus dengan aman.' };
      if (item.stokSaatIni < target.jumlah) {
        return { success: false, message: 'Stok saat ini tidak mencukupi untuk membatalkan transaksi ini.' };
      }
      updateInventoryItem(item.id, { stokSaatIni: item.stokSaatIni - target.jumlah });
    }
    setStockInList(prev => prev.filter(tx => tx.id !== id));
    logAudit('Penghapusan Barang Masuk', 'PERSEDIAAN', `Transaksi ${target.nomorTransaksi} dihapus${isPosted ? ' dan jumlah stoknya dikoreksi' : ''}.`);
    return { success: true, message: `Transaksi ${target.nomorTransaksi} berhasil dihapus.` };
  };

  // Stock Out Automation (STOK OTOMATIS BERKURANG)
  const addStockOut = (data: {
    itemId: string;
    jumlah: number;
    unitKerja: string;
    ruangan: string;
    pemohon: string;
    keperluan: string;
  }, sequenceOffset = 0) => {
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
    const nomorTx = `BK-BPS7106/2026/${String(stockOutList.length + sequenceOffset + 1).padStart(4, '0')}`;

    const newTx: StockOutTransaction = {
      id: `sout-${crypto.randomUUID()}`,
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
    const requestedItems = reqData.items?.length
      ? reqData.items
      : [{
          itemId: reqData.itemId,
          namaBarang: reqData.namaBarang,
          jumlahDiminta: reqData.jumlahDiminta,
          satuan: reqData.satuan
        }];
    if (requestedItems.length > 100) throw new Error('Satu permohonan maksimal berisi 100 jenis barang.');
    const seenItemIds = new Set<string>();
    const normalizedItems = requestedItems.map((requestedItem, index) => {
      const item = inventoryItems.find(inventoryItem => inventoryItem.id === requestedItem.itemId);
      if (!item) throw new Error(`Barang pada baris ${index + 1} tidak ditemukan dalam master persediaan.`);
      if (!Number.isSafeInteger(requestedItem.jumlahDiminta) || requestedItem.jumlahDiminta <= 0) {
        throw new Error(`Jumlah barang pada baris ${index + 1} harus berupa bilangan bulat lebih dari nol.`);
      }
      if (seenItemIds.has(item.id)) throw new Error(`Barang pada baris ${index + 1} dipilih lebih dari sekali.`);
      seenItemIds.add(item.id);
      return {
        itemId: item.id,
        namaBarang: item.nama,
        kodeBarang: item.kodeBarang,
        jumlahDiminta: requestedItem.jumlahDiminta,
        satuan: item.satuan,
        spesifikasi: requestedItem.spesifikasi?.trim() || undefined,
        catatan: requestedItem.catatan?.trim() || undefined
      };
    });
    const item = inventoryItems.find(i => i.id === normalizedItems[0].itemId);
    const now = new Date();
    const newReq: InventoryRequest = {
      ...reqData,
      id: `req-${Date.now()}`,
      nomorPermintaan: `REQ-BPS7106/2026/${String(requests.length + 1).padStart(4, '0')}`,
      tanggal: now.toISOString().split('T')[0],
      status: 'Diajukan',
      namaBarang: item ? item.nama : reqData.namaBarang,
      itemId: normalizedItems[0].itemId,
      jumlahDiminta: normalizedItems[0].jumlahDiminta,
      satuan: item ? item.satuan : reqData.satuan,
      items: normalizedItems
    };

    setRequests(prev => [newReq, ...prev]);
    queueRequestWhatsAppEvent(newReq, 'submitted', newReq.catatan);
    const itemSummary = normalizedItems.map(requestedItem => `${requestedItem.namaBarang} (${requestedItem.jumlahDiminta} ${requestedItem.satuan})`).join(', ');
    logAudit('Pengajuan Permohonan Barang', 'PERSEDIAAN', `Permohonan baru ${newReq.nomorPermintaan}: ${itemSummary} diajukan oleh ${newReq.pemohonNama}`);
    pushNotification('PERMINTAAN_BARU', '📋 Permohonan Barang Baru', `${newReq.pemohonNama} mengajukan ${normalizedItems.length} jenis barang: ${itemSummary}`, 'requests');
    return newReq;
  };

  const updateRequestStatus = (
    id: string,
    status: InventoryRequest['status'],
    catatan?: string,
    jumlahDisetujui?: number,
    itemsDisetujui?: InventoryRequestItem[]
  ) => {
    const target = requests.find(r => r.id === id);
    if (!target) return { success: false, message: 'Permohonan tidak ditemukan' };

    const approvedQty = jumlahDisetujui !== undefined
      ? jumlahDisetujui
      : (status === 'Disetujui' || status === 'Diproses' ? (target.jumlahDisetujui || target.jumlahDiminta) : target.jumlahDisetujui);
    const requestedItems = target.items?.length
      ? target.items
      : [{
          itemId: target.itemId,
          namaBarang: target.namaBarang,
          jumlahDiminta: target.jumlahDiminta,
          jumlahDisetujui: target.jumlahDisetujui,
          satuan: target.satuan
        }];
    const approvedItems = requestedItems.map(item => {
      const approvedItem = itemsDisetujui?.find(candidate => candidate.itemId === item.itemId);
      return {
        ...item,
        jumlahDisetujui: approvedItem?.jumlahDisetujui
          ?? item.jumlahDisetujui
          ?? (requestedItems.length === 1 ? approvedQty : item.jumlahDiminta)
      };
    });
    const shouldSetApprovedItems = status === 'Disetujui' || status === 'Diproses' || status === 'Selesai';
    if (shouldSetApprovedItems) {
      const invalidApprovedItem = approvedItems.find(item =>
        !Number.isSafeInteger(item.jumlahDisetujui)
        || (item.jumlahDisetujui || 0) <= 0
        || (item.jumlahDisetujui || 0) > item.jumlahDiminta
      );
      if (invalidApprovedItem) {
        return { success: false, message: `Jumlah yang disetujui untuk ${invalidApprovedItem.namaBarang} harus lebih dari nol dan tidak melebihi jumlah permohonan.` };
      }
    }

    // If status is "Selesai", auto stock out if not done yet
    if (status === 'Selesai' && target.status !== 'Selesai') {
      const itemsToIssue = approvedItems.map(item => ({
        ...item,
        jumlah: item.jumlahDisetujui || item.jumlahDiminta
      }));
      for (const item of itemsToIssue) {
        const stockItem = inventoryItems.find(inventoryItem => inventoryItem.id === item.itemId);
        if (!stockItem) return { success: false, message: `Barang ${item.namaBarang} tidak ditemukan dalam persediaan.` };
        if (!Number.isSafeInteger(item.jumlah) || item.jumlah <= 0 || item.jumlah > item.jumlahDiminta) {
          return { success: false, message: `Jumlah pengeluaran ${item.namaBarang} tidak valid.` };
        }
        if (item.jumlah > stockItem.stokSaatIni) {
          return { success: false, message: `Stok ${item.namaBarang} tidak mencukupi. Tersedia ${stockItem.stokSaatIni} ${stockItem.satuan}.` };
        }
      }
      for (const [index, item] of itemsToIssue.entries()) {
        const stockRes = addStockOut({
          itemId: item.itemId,
          jumlah: item.jumlah,
          unitKerja: target.unitKerja,
          ruangan: target.ruangan,
          pemohon: target.pemohonNama,
          keperluan: target.keperluan
        }, index);
        if (!stockRes.success) return stockRes;
      }
    }

    setRequests(prev =>
      prev.map(r =>
        r.id === id
          ? {
              ...r,
              status,
              catatan: catatan !== undefined ? catatan : r.catatan,
              jumlahDisetujui: approvedQty,
              items: shouldSetApprovedItems ? r.items?.map(item => ({
                ...item,
                jumlahDisetujui: approvedItems.find(approvedItem => approvedItem.itemId === item.itemId)?.jumlahDisetujui
              })) : r.items
            }
          : r
      )
    );

    if (target.status !== status && queuedRequestWhatsAppStatusRef.current.get(id) !== status) {
      queuedRequestWhatsAppStatusRef.current.set(id, status);
      queueRequestWhatsAppEvent({
        ...target,
        status,
        catatan: catatan !== undefined ? catatan : target.catatan,
        jumlahDisetujui: approvedQty,
        items: shouldSetApprovedItems ? target.items?.map(item => ({
          ...item,
          jumlahDisetujui: approvedItems.find(approvedItem => approvedItem.itemId === item.itemId)?.jumlahDisetujui
        })) : target.items
      }, 'status_changed', catatan);
    }
    logAudit('Pembaruan Status Permohonan', 'PERSEDIAAN', `Permohonan ${target.nomorPermintaan} (${requestedItems.map(item => item.namaBarang).join(', ')}) diubah statusnya menjadi ${status}.`);
    pushNotification('TRANSAKSI', `📋 Status Permohonan: ${status}`, `Permohonan ${target.nomorPermintaan} (${requestedItems.map(item => item.namaBarang).join(', ')}) kini berstatus ${status}.`, 'requests');
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

  const deleteAssetMovement = (id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      return { success: false, message: 'ID transaksi pemindahan tidak valid.' };
    }
    const target = movements.find(m => m.id === id);
    if (!target) {
      return { success: false, message: 'Transaksi pemindahan tidak ditemukan.' };
    }
    setMovements(prev => prev.filter(m => m.id !== id));
    logAudit('Penghapusan Transaksi Pemindahan Aset', 'ASET_BMN', `Transaksi ${target.nomorTransaksi} untuk ${target.assetName} dihapus.`);
    return { success: true, message: `Transaksi ${target.nomorTransaksi} berhasil dihapus.` };
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

  const deleteAssetMaintenance = (id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      return { success: false, message: 'ID tiket pemeliharaan tidak valid.' };
    }
    const target = maintenances.find(m => m.id === id);
    if (!target) {
      return { success: false, message: 'Tiket pemeliharaan tidak ditemukan.' };
    }
    setMaintenances(prev => prev.filter(m => m.id !== id));
    logAudit('Penghapusan Tiket Pemeliharaan BMN', 'ASET_BMN', `Tiket ${target.nomorTiket} untuk ${target.assetName} dihapus.`);
    return { success: true, message: `Tiket ${target.nomorTiket} berhasil dihapus.` };
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
        isInitializing: !authReady || (!!currentUser && !dataReady),
        syncError,
        login,
        logout,
        activeView,
        setActiveView,
        dashboardFilters,
        setDashboardFilters,
        performance3D,
        setPerformance3D,
        rooms,
        addRoom,
        updateRoom,
        deleteRoom,
        isRoomModalOpen,
        setIsRoomModalOpen,
        editingRoom,
        setEditingRoom,
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
        setUserPassword,
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
        deleteInventoryItem,
        importInventoryItems,
        addStockIn,
        updateStockIn,
        inspectStockIn,
        verifyStockIn,
        deleteStockIn,
        addStockOut,
        addInventoryRequest,
        updateRequestStatus,
        deleteInventoryRequest,
        addAssetMovement,
        updateMovementStatus,
        deleteAssetMovement,
        addAssetMaintenance,
        updateMaintenanceStatus,
        deleteAssetMaintenance,
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
