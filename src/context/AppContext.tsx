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
import {
  linkImportedAssetsToRooms
} from '../utils/assetRoomImporter';
import { DashboardFilters, DEFAULT_DASHBOARD_FILTERS } from '../utils/dashboardFilters';
import { getHomeView, isPimpinanUser } from '../utils/rbac';
import { getPathForView, getViewForPath } from '../utils/viewRoutes';
import { planStockInDeletion } from '../../stockInDeletion.mjs';
import { mergeStateAfterConflict } from '../../stateConflict.mjs';
import { getRequestableStock, normalizeRequestHandoverItems } from '../../requestStockValidation.mjs';
import { getNextRequestNumber } from '../../requestNumber.mjs';

const cloneSharedState = <T,>(state: T): T => JSON.parse(JSON.stringify(state)) as T;

const applyRequestNumberAssignments = (
  state: Record<string, unknown>,
  assignments?: Record<string, string>
): Record<string, unknown> => {
  if (!assignments || !Array.isArray(state.requests)) return state;
  const requests = (state.requests as InventoryRequest[]).map(request => {
    if (!Object.prototype.hasOwnProperty.call(assignments, request.id)) return request;
    const number = assignments[request.id];
    return typeof number === 'string' && number
      ? { ...request, nomorPermintaan: number }
      : request;
  });
  return { ...state, requests };
};

class StateSyncError extends Error {
  constructor(message: string, readonly definitelyNotSaved = false, readonly status?: number) {
    super(message);
  }
}

type RequestStateChange = {
  request: InventoryRequest;
  auditLogs: AuditLog[];
  notifications: NotificationItem[];
};

class ApiResponseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const readApiResponse = async <T,>(
  response: Response,
  endpoint: string,
  allowErrorStatuses: number[] = []
): Promise<T> => {
  const body = await response.text();
  let result: T;
  try {
    result = JSON.parse(body) as T;
  } catch {
    const isHtml = /^\s*(?:<!doctype html\b|<html\b)/i.test(body);
    throw new ApiResponseError(
      response.status === 401
        ? 'Sesi berakhir. Silakan masuk kembali.'
        : response.status === 403
          ? 'Akses ditolak oleh server.'
          : isHtml
        ? `Endpoint ${endpoint} mengembalikan HTML, bukan JSON. Pastikan permintaan API diteruskan ke server Node.js.`
        : `Respons ${endpoint} tidak valid (HTTP ${response.status}).`,
      response.status
    );
  }
  if (!response.ok && !allowErrorStatuses.includes(response.status)) {
    const errorMessage = result && typeof result === 'object' && 'error' in result
      ? String(result.error)
      : '';
    throw new ApiResponseError(
      response.status === 401
        ? errorMessage || 'Sesi berakhir. Silakan masuk kembali.'
        : response.status === 403
          ? errorMessage || 'Akses ditolak oleh server.'
          : response.status >= 500
            ? errorMessage || `Server mengalami kesalahan (HTTP ${response.status}).`
            : errorMessage || `Permintaan gagal (HTTP ${response.status}).`,
      response.status
    );
  }
  return result;
};

const apiFailureMessage = (error: unknown): string => {
  if (error instanceof ApiResponseError) return error.message;
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'Server terlalu lama merespons. Periksa status data di server sebelum mengulangi transaksi.';
  }
  if (error instanceof TypeError) return 'Server tidak dapat dihubungi. Periksa koneksi jaringan lalu coba lagi.';
  return error instanceof Error ? error.message : 'Terjadi kesalahan saat menghubungi server.';
};
const sameSharedState = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const MAX_STATE_CONFLICT_RETRIES = 3;
const fetchWithTimeout = (url: string, options: RequestInit = {}) =>
  fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });

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
  | 'settings'
  | 'not-found';

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
  dataBackend: 'legacy' | 'operational';
  isInitializing: boolean;
  syncError: string | null;
  isReloadingServerData: boolean;
  reloadServerData: () => Promise<boolean>;
  requestPageRefresh: () => void;
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
  importAssetsWithRooms: (newAssets: Omit<BmnAsset, 'id'>[], mode?: 'append' | 'upsert') => { successCount: number; updatedCount: number; createdRooms: number };
  
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => void;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>, options?: { recordStockAdjustment?: boolean }) => void;
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
  deleteStockInMany: (ids: string[]) => { deletedIds: string[]; errors: { id: string; message: string }[] };
  
  addStockOut: (data: {
    itemId: string;
    jumlah: number;
    unitKerja: string;
    ruangan: string;
    pemohon: string;
    keperluan: string;
  }, sequenceOffset?: number) => { success: boolean; message: string };
  
  addInventoryRequest: (req: Omit<InventoryRequest, 'id' | 'nomorPermintaan' | 'tanggal' | 'status'>) => Promise<InventoryRequest>;
  updateRequestStatus: (id: string, status: InventoryRequest['status'], catatan?: string, jumlahDisetujui?: number, itemsDisetujui?: InventoryRequestItem[]) => Promise<{ success: boolean; message: string }>;
  confirmInventoryRequestReceipt: (id: string) => Promise<{ success: boolean; message: string }>;
  reportInventoryReceiptDiscrepancy: (id: string, reason: string) => Promise<{ success: boolean; message: string }>;
  reopenInventoryRequestHandover: (id: string) => Promise<{ success: boolean; message: string }>;
  cancelInventoryRequest: (id: string, reason: string) => Promise<{ success: boolean; message: string }>;
  deleteInventoryRequests: (ids: string[]) => Promise<{ success: boolean; message: string }>;
  
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
  updateDocument: (id: string, updates: Partial<DocumentItem>) => void;
  deleteDocument: (id: string) => void;
  registerUploadedDocument: (document: DocumentItem, revision: number, auditLog?: AuditLog) => void;
  registerUpdatedDocument: (document: DocumentItem, revision: number, auditLog?: AuditLog) => void;
  registerDeletedDocument: (id: string, revision: number, auditLog: AuditLog) => void;
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
    if (id.length > 36 || usedIds.has(id)) {
      let firstHash = 0x811c9dc5;
      let secondHash = 0x811c9dc5;
      for (let index = 0; index < signature.length; index += 1) {
        const code = signature.charCodeAt(index);
        firstHash = Math.imul(firstHash ^ code, 0x01000193);
        secondHash = Math.imul(secondHash ^ (code + index), 0x01000193);
      }
      const suffix = `${(firstHash >>> 0).toString(16).padStart(8, '0')}${(secondHash >>> 0).toString(16).padStart(8, '0')}`;
      let collision = 0;
      do {
        const collisionSuffix = collision ? collision.toString(16).padStart(8, '0') : '';
        const digest = `${suffix}${collisionSuffix}`.padEnd(32, '0').slice(0, 32);
        id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20)}`;
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
  const [dataBackend, setDataBackend] = useState<'legacy' | 'operational'>('legacy');
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isReloadingServerData, setIsReloadingServerData] = useState(false);
  const reloadInFlightRef = useRef(false);
  const pendingSessionRecoveryRef = useRef<{
    base: Record<string, unknown> | null;
    local: Record<string, unknown>;
  } | null>(null);
  const revisionRef = useRef(0);
  const lastSyncedStateRef = useRef<Record<string, unknown> | null>(null);
  const syncBlockedRef = useRef(false);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [pageRefreshVersion, setPageRefreshVersion] = useState(0);
  const pageRefreshRequestedRef = useRef(false);
  const pendingServerActionsRef = useRef(0);
  const requestPageRefresh = () => {
    pageRefreshRequestedRef.current = true;
    setPageRefreshVersion(version => version + 1);
  };
  const immediateStateSyncRef = useRef(false);
  const requestImmediateStateSync = () => {
    immediateStateSyncRef.current = true;
  };
  const requestPersistenceWaitersRef = useRef(new Map<string, {
    resolve: (request: InventoryRequest) => void;
    reject: (error: Error) => void;
    expectedStatus?: InventoryRequest['status'];
  }>());
  const pendingRequestWhatsAppEventsRef = useRef<Array<{
    eventId: string;
    requestId: string;
    status: InventoryRequest['status'];
    action: 'submitted' | 'status_changed';
    note?: string;
  }>>([]);
  const queuedRequestWhatsAppStatusRef = useRef<Map<string, InventoryRequest['status']>>(new Map());

  const [activeView, setActiveViewState] = useState<ActiveView>(() => getViewForPath(window.location.pathname));
  // Halaman yang diminta sebelum diarahkan ke login, agar URL langsung tidak berakhir di dashboard.
  const returnViewRef = useRef<ActiveView | null>(null);
  const setActiveView = (view: ActiveView) => {
    if (view === 'login' && !['landing', 'login', 'not-found'].includes(activeView)) {
      returnViewRef.current = activeView;
    }
    const nextPath = getPathForView(view);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', `${nextPath}${window.location.search}${window.location.hash}`);
    }
    setActiveViewState(view);
  };

  useEffect(() => {
    const handlePopState = () => setActiveViewState(getViewForPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
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
  const [warehouseRacks, setWarehouseRacks] = useState<WarehouseRack[]>(WAREHOUSE_RACKS);
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
    movements, maintenances, disposals, documents, auditLogs, notifications, users, roles,
    ...(dataBackend === 'operational' ? { warehouseRacks } : {})
  };
  const latestSharedStateRef = useRef<Record<string, unknown>>(sharedState);
  latestSharedStateRef.current = sharedState;

  useEffect(() => {
    if (!pageRefreshRequestedRef.current || !currentUser || !dataReady || syncError) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void syncQueueRef.current.then(() => {
        if (cancelled || !pageRefreshRequestedRef.current || syncBlockedRef.current ||
            reloadInFlightRef.current || pendingServerActionsRef.current > 0 ||
            requestPersistenceWaitersRef.current.size > 0 ||
            !sameSharedState(latestSharedStateRef.current, lastSyncedStateRef.current)) return;
        pageRefreshRequestedRef.current = false;
        window.location.reload();
      });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pageRefreshVersion, currentUser, dataReady, syncError, sharedState]);

  const applySharedState = (state: Record<string, unknown>) => {
    latestSharedStateRef.current = { ...latestSharedStateRef.current, ...state };
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
    if (Array.isArray(state.warehouseRacks)) setWarehouseRacks(state.warehouseRacks as WarehouseRack[]);
  };

  const loadSessionData = async (authenticatedUser: User) => {
    const response = await fetchWithTimeout('/api/state');
    const result = await readApiResponse<{
      revision: number;
      dataBackend: 'legacy' | 'operational';
      initialized: boolean;
      state: Record<string, unknown>;
    }>(response, '/api/state');
    revisionRef.current = result.revision;
    setDataBackend(result.dataBackend === 'operational' ? 'operational' : 'legacy');
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
      const saveResult = await readApiResponse<{
        revision: number;
        requestNumbers?: Record<string, string>;
      }>(saveResponse, '/api/state');
      const savedState = applyRequestNumberAssignments(initialState, saveResult.requestNumbers);
      revisionRef.current = saveResult.revision;
      lastSyncedStateRef.current = cloneSharedState(savedState);
      applySharedState(savedState);
    } else {
      lastSyncedStateRef.current = cloneSharedState(result.state);
      applySharedState(result.state);
      const storedUser = (result.state.users as User[] | null)?.find(user => user.id === authenticatedUser.id);
      if (storedUser) setCurrentUser(storedUser);
    }
    setDataReady(true);
  };

  const expireSession = (localState?: Record<string, unknown>) => {
    if (localState) {
      pendingSessionRecoveryRef.current = {
        base: lastSyncedStateRef.current ? cloneSharedState(lastSyncedStateRef.current) : null,
        local: cloneSharedState(localState)
      };
    }
    syncBlockedRef.current = true;
    setCurrentUser(null);
    setDataReady(false);
    setSyncError('Sesi telah berakhir. Perubahan lokal yang belum tersinkron dipertahankan sementara; masuk kembali untuk memulihkannya.');
    setActiveView('login');
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
        const result = await readApiResponse<{ user: User }>(response, '/api/auth/me');
        if (!mounted) return;
        setCurrentUser(result.user);
        await loadSessionData(result.user);
      } catch (error) {
        if (mounted) {
          setCurrentUser(null);
          setDataReady(false);
          setSyncError(apiFailureMessage(error));
        }
      } finally {
        if (mounted) setAuthReady(true);
      }
    };
    void restoreSession();
    return () => { mounted = false; };
  }, []);

  const settleRequestPersistence = (
    savedState: Record<string, unknown>,
    submittedState: Record<string, unknown>
  ) => {
    const submittedRequests = submittedState.requests as InventoryRequest[];
    const savedRequests = savedState.requests as InventoryRequest[];
    for (const [id, waiter] of requestPersistenceWaitersRef.current) {
      const submitted = submittedRequests.find(request => request.id === id);
      if (!submitted || (waiter.expectedStatus && submitted.status !== waiter.expectedStatus)) continue;
      const saved = savedRequests.find(request => request.id === id);
      requestPersistenceWaitersRef.current.delete(id);
      if (!saved || (waiter.expectedStatus && saved.status !== waiter.expectedStatus)) {
        waiter.reject(new StateSyncError('Status permohonan berubah di server sebelum perubahan dapat dipastikan.', true));
      } else {
        waiter.resolve(saved);
      }
    }
  };

  const persistSharedState = (requestChange?: RequestStateChange) => {
      syncQueueRef.current = syncQueueRef.current.then(async () => {
        if (requestChange && !requestPersistenceWaitersRef.current.has(requestChange.request.id)) return;
        if (syncBlockedRef.current) {
          const error = new StateSyncError('Sinkronisasi terhenti. Muat ulang halaman untuk memeriksa status permohonan.', true);
          for (const waiter of requestPersistenceWaitersRef.current.values()) waiter.reject(error);
          requestPersistenceWaitersRef.current.clear();
          return;
        }
        const localStateBeforeSave = cloneSharedState(latestSharedStateRef.current);
        let stateToSave = cloneSharedState(localStateBeforeSave);
        if (requestChange) {
          const existingRequests = stateToSave.requests as InventoryRequest[];
          const exists = existingRequests.some(request => request.id === requestChange.request.id);
          stateToSave = {
            ...stateToSave,
            requests: exists
              ? existingRequests.map(request => request.id === requestChange.request.id ? requestChange.request : request)
              : [requestChange.request, ...existingRequests],
            auditLogs: [...requestChange.auditLogs, ...(stateToSave.auditLogs as AuditLog[])],
            notifications: [...requestChange.notifications, ...(stateToSave.notifications as NotificationItem[])]
          };
        }
        const submittedState = cloneSharedState(stateToSave);
        const refreshAfterSave = lastSyncedStateRef.current !== null &&
          Object.entries(submittedState).some(([key, value]) =>
            key !== 'notifications' && key !== 'auditLogs' && key !== 'requests' &&
            !sameSharedState(value, lastSyncedStateRef.current?.[key])
          );
        if (lastSyncedStateRef.current && sameSharedState(stateToSave, lastSyncedStateRef.current)) {
          settleRequestPersistence(lastSyncedStateRef.current, submittedState);
          return;
        }
        let saveResult: {
          revision?: number;
          requestNumbers?: Record<string, string>;
          requests?: InventoryRequest[];
        } | null = null;
        for (let attempt = 0; attempt < MAX_STATE_CONFLICT_RETRIES; attempt += 1) {
          const response = await fetchWithTimeout('/api/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: stateToSave, revision: revisionRef.current })
          });
          let result: {
            revision?: number;
            requestNumbers?: Record<string, string>;
            requests?: InventoryRequest[];
          };
          try {
            result = await readApiResponse<{
              revision?: number;
              requestNumbers?: Record<string, string>;
              requests?: InventoryRequest[];
            }>(response, '/api/state', [409]);
          } catch (error) {
            if (error instanceof ApiResponseError && error.status === 401) {
              expireSession(stateToSave);
              throw new StateSyncError(error.message, true, error.status);
            }
            if (error instanceof ApiResponseError && error.status === 403) {
              syncBlockedRef.current = true;
              throw new StateSyncError(`Akses ditolak: ${error.message}`, true, error.status);
            }
            const definitelyNotSaved = error instanceof ApiResponseError && error.status < 500;
            if (definitelyNotSaved) syncBlockedRef.current = true;
            throw new StateSyncError(apiFailureMessage(error), definitelyNotSaved,
              error instanceof ApiResponseError ? error.status : undefined);
          }
          if (response.status !== 409) {
            saveResult = result;
            break;
          }

          const latestResponse = await fetchWithTimeout('/api/state');
          let latest: { state?: Record<string, unknown>; revision?: number };
          try {
            latest = await readApiResponse<{ state?: Record<string, unknown>; revision?: number }>(latestResponse, '/api/state');
          } catch (error) {
            if (error instanceof ApiResponseError && error.status === 401) {
              expireSession(stateToSave);
              throw new StateSyncError(error.message, true, error.status);
            }
            throw new StateSyncError(apiFailureMessage(error), true,
              error instanceof ApiResponseError ? error.status : undefined);
          }
          if (!latest.state || typeof latest.revision !== 'number' || !Number.isInteger(latest.revision)) {
            syncBlockedRef.current = true;
            const error = new StateSyncError('Konflik data terjadi dan data terbaru dari server tidak valid. Muat ulang data server sebelum melanjutkan.', true);
            for (const waiter of requestPersistenceWaitersRef.current.values()) waiter.reject(error);
            requestPersistenceWaitersRef.current.clear();
            setSyncError(error.message);
            return;
          }
          const baseState = lastSyncedStateRef.current;
          if (!baseState) {
            syncBlockedRef.current = true;
            const error = new StateSyncError('Konflik data terjadi tanpa salinan perubahan terakhir. Muat ulang halaman sebelum melanjutkan.', true);
            for (const waiter of requestPersistenceWaitersRef.current.values()) waiter.reject(error);
            requestPersistenceWaitersRef.current.clear();
            setSyncError(error.message);
            return;
          }
          const { mergedState, conflicts } = mergeStateAfterConflict(baseState, stateToSave, latest.state);
          if (conflicts.length > 0) {
            syncBlockedRef.current = true;
            const error = new StateSyncError(`Data yang sama berubah di perangkat lain (${conflicts.slice(0, 3).join(', ')}). Muat ulang halaman untuk memeriksa perubahan sebelum mencoba lagi.`, true);
            for (const waiter of requestPersistenceWaitersRef.current.values()) waiter.reject(error);
            requestPersistenceWaitersRef.current.clear();
            setSyncError(error.message);
            return;
          }
          revisionRef.current = latest.revision;
          lastSyncedStateRef.current = cloneSharedState(latest.state);
          stateToSave = mergedState;
          if (sameSharedState(mergedState, latest.state)) {
            saveResult = { revision: latest.revision, requests: latest.state.requests as InventoryRequest[] };
            break;
          }
        }
        if (!saveResult) {
          syncBlockedRef.current = true;
          const error = new StateSyncError('Data terus berubah di perangkat lain. Perubahan lokal belum tersimpan; muat ulang halaman sebelum melanjutkan.', true);
          for (const waiter of requestPersistenceWaitersRef.current.values()) waiter.reject(error);
          requestPersistenceWaitersRef.current.clear();
          setSyncError(error.message);
          return;
        }
        if (!Number.isInteger(saveResult.revision)) {
          throw new Error('Server menyimpan perubahan dengan respons revisi yang tidak valid.');
        }
        stateToSave = applyRequestNumberAssignments(stateToSave, saveResult.requestNumbers);
        if (Array.isArray(saveResult.requests)) stateToSave = { ...stateToSave, requests: saveResult.requests };
        revisionRef.current = saveResult.revision as number;
        lastSyncedStateRef.current = cloneSharedState(stateToSave);
        const rebased = mergeStateAfterConflict(localStateBeforeSave, latestSharedStateRef.current, stateToSave);
        if (rebased.conflicts.length > 0) {
          syncBlockedRef.current = true;
          throw new StateSyncError(`Perubahan telah tersimpan, tetapi perubahan lokal berikutnya bertabrakan (${rebased.conflicts.slice(0, 3).join(', ')}). Periksa data server sebelum melanjutkan.`);
        }
        if (!sameSharedState(latestSharedStateRef.current, rebased.mergedState)) {
          applySharedState(rebased.mergedState);
        }
        setSyncError(null);
        const persistedRequests = (stateToSave.requests as InventoryRequest[]) || [];
        settleRequestPersistence(stateToSave, submittedState);
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
        await Promise.all(readyEvents.map(event =>
          fetchWithTimeout('/api/whatsapp/request-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...event, deferDelivery: true })
          }).then(async notificationResponse => {
            const responseBody = await notificationResponse.text();
            let notificationResult: { skipped?: boolean; queued?: boolean; success?: boolean; error?: string };
            try {
              notificationResult = JSON.parse(responseBody);
            } catch {
              const isHtml = /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(responseBody);
              throw new Error(isHtml
                ? 'Server mengembalikan halaman HTML, bukan JSON. Di lokal, buka aplikasi melalui http://127.0.0.1:3000; untuk production, teruskan /api/* ke backend Node.js.'
                : `Respons server notifikasi bukan JSON yang valid (HTTP ${notificationResponse.status}).`);
            }
            if (!notificationResult || typeof notificationResult !== 'object' || Array.isArray(notificationResult)) {
              throw new Error(`Respons server notifikasi tidak valid (HTTP ${notificationResponse.status}).`);
            }
            if (notificationResponse.ok && (notificationResult.skipped || notificationResult.queued)) return;
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
          })
        ));
        if (refreshAfterSave) requestPageRefresh();
      }).catch(error => {
        pageRefreshRequestedRef.current = false;
        const message = error instanceof Error ? error.message : 'Perubahan tidak tersimpan ke server.';
        const pendingWaiters = [...requestPersistenceWaitersRef.current.values()];
        requestPersistenceWaitersRef.current.clear();
        let reportedError = error instanceof Error ? error : new Error(message);
        if (pendingWaiters.length > 0 && !(error instanceof StateSyncError && error.definitelyNotSaved)) {
          syncBlockedRef.current = true;
          reportedError = new StateSyncError('Status penyimpanan permohonan belum dapat dipastikan. Muat ulang halaman dan periksa daftar permohonan sebelum mengirim ulang.');
        }
        for (const waiter of pendingWaiters) {
          waiter.reject(reportedError);
        }
        setSyncError(reportedError.message);
      });
      return syncQueueRef.current;
  };

  useEffect(() => {
    if (!currentUser || !dataReady) return;
    const timer = window.setTimeout(() => {
      immediateStateSyncRef.current = false;
      void persistSharedState();
    }, immediateStateSyncRef.current ? 0 : 350);
    return () => window.clearTimeout(timer);
  }, [
    currentUser, dataReady, rooms, assets, inventoryItems, stockInList, stockOutList,
    requests, opnames, movements, maintenances, disposals, documents, auditLogs,
    notifications, users, roles, warehouseRacks, dataBackend
  ]);

  const login = async (nip: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nip, password })
    });
    const result = await readApiResponse<{ user: User }>(response, '/api/auth/login');
    const pendingRecovery = pendingSessionRecoveryRef.current;
    setDataReady(false);
    syncBlockedRef.current = false;
    revisionRef.current = 0;
    if (!pendingRecovery) lastSyncedStateRef.current = null;
    setCurrentUser(result.user);
    try {
      await loadSessionData(result.user);
      if (pendingRecovery) {
        const latestState = lastSyncedStateRef.current;
        if (pendingRecovery.base && latestState) {
          const recovered = mergeStateAfterConflict(
            pendingRecovery.base,
            pendingRecovery.local,
            latestState
          );
          if (recovered.conflicts.length > 0) {
            applySharedState(pendingRecovery.local);
            syncBlockedRef.current = true;
            setSyncError(`Sesi kembali aktif, tetapi ada konflik pada ${recovered.conflicts.slice(0, 3).join(', ')}. Perubahan lokal dipertahankan; muat ulang data server untuk mengambil versi server.`);
          } else {
            applySharedState(recovered.mergedState);
            pendingSessionRecoveryRef.current = null;
            setSyncError(null);
          }
        } else {
          applySharedState(pendingRecovery.local);
          syncBlockedRef.current = true;
          setSyncError('Sesi kembali aktif, tetapi perubahan lokal tidak dapat dibandingkan dengan data server. Perubahan lokal dipertahankan; hubungi administrator sebelum melanjutkan.');
        }
      } else {
        setSyncError(null);
      }
      const returnView = returnViewRef.current;
      returnViewRef.current = null;
      setActiveView(returnView || getHomeView(result.user));
    } catch (error) {
      await fetch('/api/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      setDataReady(false);
      syncBlockedRef.current = false;
      lastSyncedStateRef.current = null;
      throw new Error(apiFailureMessage(error));
    }
  };

  const reloadServerData = async () => {
    if (reloadInFlightRef.current) return false;
    reloadInFlightRef.current = true;
    setIsReloadingServerData(true);
    try {
      const userResponse = await fetchWithTimeout('/api/auth/me');
      const { user } = await readApiResponse<{ user: User }>(userResponse, '/api/auth/me');
      setCurrentUser(user);
      await loadSessionData(user);
      pendingSessionRecoveryRef.current = null;
      syncBlockedRef.current = false;
      setSyncError(null);
      return true;
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 401) {
        expireSession();
      } else {
        setSyncError(apiFailureMessage(error));
      }
      return false;
    } finally {
      reloadInFlightRef.current = false;
      setIsReloadingServerData(false);
    }
  };

  const logout = async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    await readApiResponse<{ success: boolean }>(response, '/api/auth/logout');
    pageRefreshRequestedRef.current = false;
    setDataReady(false);
    syncBlockedRef.current = false;
    lastSyncedStateRef.current = null;
    pendingSessionRecoveryRef.current = null;
    setCurrentUser(null);
    setSyncError(null);
    setActiveView('login');
    returnViewRef.current = null;
    window.location.replace(getPathForView('login'));
  };

  const setUserPassword = async (user: User, password: string) => {
    pendingServerActionsRef.current += 1;
    try {
      const response = await fetch(`/api/auth/users/${encodeURIComponent(user.id)}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal menyimpan kata sandi akun.');
      requestPageRefresh();
    } catch (error) {
      pageRefreshRequestedRef.current = false;
      throw error;
    } finally {
      pendingServerActionsRef.current -= 1;
    }
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
  const logAudit = (aktivitas: string, modul: AuditLog['modul'], detail: string, requestChange?: RequestStateChange) => {
    const now = new Date();
    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      userId: currentUser?.id || 'sys',
      userName: currentUser?.name || 'Sistem SIMAN',
      userRole: currentUser?.role || 'System',
      aktivitas,
      modul,
      tanggal: now.toISOString().split('T')[0],
      waktu: now.toLocaleTimeString('id-ID') + ' WITA',
      ipAddress: '',
      detail
    };
    if (requestChange) requestChange.auditLogs.unshift(newLog);
    else setAuditLogs(prev => [newLog, ...prev]);
  };

  // Helper for notifications
  const pushNotification = (type: NotificationItem['type'], title: string, message: string, link?: string, requestChange?: RequestStateChange) => {
    const newNotif: NotificationItem = {
      id: crypto.randomUUID(),
      type,
      title,
      message,
      timestamp: 'Baru saja',
      read: false,
      link
    };
    if (requestChange) requestChange.notifications.unshift(newNotif);
    else setNotifications(prev => [newNotif, ...prev]);
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
      fotoUrl: assetData.fotoUrl || undefined,
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

  const importAssetsWithRooms = (
    newAssetsData: Omit<BmnAsset, 'id'>[],
    mode: 'append' | 'upsert' = 'upsert'
  ) => {
    const { assets: linkedAssets, newRooms } = linkImportedAssetsToRooms(newAssetsData, rooms);
    if (newRooms.length > 0) {
      setRooms(previous => [...previous, ...newRooms]);
      logAudit(
        'Tambah Ruangan dari Impor Aset',
        'ASET_BMN',
        `${newRooms.length} ruangan otomatis ditambahkan dari lokasi file impor aset.`
      );
    }

    return { ...importAssets(linkedAssets, mode), createdRooms: newRooms.length };
  };

  // Inventory CRUD
  const addInventoryItem = (itemData: Omit<InventoryItem, 'id'>) => {
    const newId = `inv-${Date.now()}`;
    const newItem: InventoryItem = {
      ...itemData,
      id: newId,
      fotoUrl: itemData.fotoUrl || undefined,
      totalNilai: itemData.stokSaatIni * itemData.hargaSatuan
    };
    setInventoryItems(prev => [newItem, ...prev]);
    logAudit('Tambah Master Persediaan', 'PERSEDIAAN', `Penambahan barang persediaan: ${newItem.nama} (${newItem.jenis}) di ${newItem.binCode}`);
  };

  const updateInventoryItem = (
    id: string,
    updates: Partial<InventoryItem>,
    options: { recordStockAdjustment?: boolean } = {}
  ) => {
    const current = inventoryItems.find(item => item.id === id);
    if (options.recordStockAdjustment && current &&
        updates.stokSaatIni !== undefined && updates.stokSaatIni !== current.stokSaatIni) {
      logAudit(
        'Penyesuaian Stok Master',
        'PERSEDIAAN',
        `Penyesuaian saldo ${current.nama} dari ${current.stokSaatIni} menjadi ${updates.stokSaatIni}.`
      );
    }
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

    requestImmediateStateSync();
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
    requestImmediateStateSync();
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
    requestImmediateStateSync();
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
    requestImmediateStateSync();
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
    const result = deleteStockInMany([id]);
    const error = result.errors[0];
    if (error) return { success: false, message: error.message };
    const target = stockInList.find(tx => tx.id === id);
    return {
      success: result.deletedIds.includes(id),
      message: target ? `Transaksi ${target.nomorTransaksi} berhasil dihapus.` : 'Transaksi Barang Masuk tidak ditemukan.'
    };
  };

  const deleteStockInMany = (ids: string[]) => {
    const result = planStockInDeletion(ids, stockInList, inventoryItems, hasPermission('manageInventory'));
    if (result.deletedIds.length > 0) {
      const affectedItems = new Set(
        result.deletedTransactions
          .filter(tx =>
            (tx.status == null || tx.status === '' || tx.status === 'Diverifikasi')
            && result.stockByItem.has(tx.itemId)
          )
          .map(tx => tx.itemId)
      );
      setInventoryItems(previous => previous.map(item => {
        if (!affectedItems.has(item.id)) return item;
        const stock = result.stockByItem.get(item.id);
        if (stock === undefined) return item;
        const updated = { ...item, stokSaatIni: stock, totalNilai: stock * item.hargaSatuan };
        updated.status = stock === 0 ? 'Habis' : stock <= item.stokMinimum ? 'Menipis' : 'Aman';
        return updated;
      }));
      requestImmediateStateSync();
      setStockInList(previous => previous.filter(tx => !result.deletedIds.includes(tx.id)));
      for (const transaction of result.deletedTransactions) {
        const isPosted = (transaction.status == null || transaction.status === 'Diverifikasi')
          && result.stockByItem.has(transaction.itemId);
        logAudit(
          'Penghapusan Barang Masuk',
          'PERSEDIAAN',
          `Transaksi ${transaction.nomorTransaksi} dihapus${
            isPosted
              ? ' dan jumlah stoknya dikoreksi'
              : transaction.status == null || transaction.status === ''
                ? ' tanpa koreksi stok karena barang master terkait sudah tidak tersedia'
                : ''
          }.`
        );
      }
    }

    return { deletedIds: result.deletedIds, errors: result.errors };
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

    const availableStock = getRequestableStock(item.id, inventoryItems, requests);
    if (!Number.isSafeInteger(data.jumlah) || data.jumlah <= 0 || data.jumlah > availableStock) {
      return {
        success: false,
        message: `Gagal! Stok yang belum dialokasikan hanya ${availableStock} ${item.satuan}, permintaan: ${data.jumlah} ${item.satuan}.`
      };
    }

    const newStock = item.stokSaatIni - data.jumlah;
    const now = new Date();
    const tgl = now.toISOString().split('T')[0];
    const nomorTx = `BK-BPS7106/2026/${String(stockOutList.length + sequenceOffset + 1).padStart(4, '0')}`;

    const newTx: StockOutTransaction = {
      id: crypto.randomUUID(),
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
      const availableStock = getRequestableStock(item.id, inventoryItems, requests);
      if (availableStock === 0) {
        throw new Error(`${item.nama} tidak dapat diajukan karena stok tersedia 0 ${item.satuan}.`);
      }
      if (requestedItem.jumlahDiminta > availableStock) {
        throw new Error(`Jumlah permintaan ${item.nama} melebihi stok tersedia. Stok tersedia: ${availableStock} ${item.satuan}.`);
      }
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
    const requestDate = now.toISOString().split('T')[0];
    const newReq: InventoryRequest = {
      ...reqData,
      id: crypto.randomUUID(),
      nomorPermintaan: getNextRequestNumber(requests, requestDate.slice(0, 4)),
      tanggal: requestDate,
      status: 'Diajukan',
      namaBarang: item ? item.nama : reqData.namaBarang,
      itemId: normalizedItems[0].itemId,
      jumlahDiminta: normalizedItems[0].jumlahDiminta,
      satuan: item ? item.satuan : reqData.satuan,
      items: normalizedItems
    };

    const requestChange: RequestStateChange = { request: newReq, auditLogs: [], notifications: [] };
    const persisted = new Promise<InventoryRequest>((resolve, reject) => {
      requestPersistenceWaitersRef.current.set(newReq.id, { resolve, reject, expectedStatus: 'Diajukan' });
    });
    queueRequestWhatsAppEvent(newReq, 'submitted', newReq.catatan);
    const itemSummary = normalizedItems.map(requestedItem => `${requestedItem.namaBarang} (${requestedItem.jumlahDiminta} ${requestedItem.satuan})`).join(', ');
    logAudit('Pengajuan Permohonan Barang', 'PERSEDIAAN', `Permohonan baru (${newReq.id}): ${itemSummary} diajukan oleh ${newReq.pemohonNama}`, requestChange);
    pushNotification('PERMINTAAN_BARU', '📋 Permohonan Barang Baru', `${newReq.pemohonNama} mengajukan ${normalizedItems.length} jenis barang: ${itemSummary}`, 'requests', requestChange);
    void persistSharedState(requestChange);
    return persisted.catch(async error => {
      if (error instanceof StateSyncError && !error.definitelyNotSaved) {
        try {
          await reloadServerData();
        } catch (statusError) {
          throw new StateSyncError(
            `Status penyimpanan permohonan belum dapat dipastikan. ${apiFailureMessage(statusError)} Jangan kirim ulang sebelum daftar permohonan diperiksa.`
          );
        }
        if (syncBlockedRef.current) {
          throw new StateSyncError('Status penyimpanan permohonan belum dapat dipastikan. Muat ulang data server dan periksa daftar permohonan sebelum mengirim ulang.');
        }
        const latestRequests = lastSyncedStateRef.current?.requests;
        const persistedRequest = Array.isArray(latestRequests)
          ? (latestRequests as InventoryRequest[]).find(request => request.id === newReq.id)
          : undefined;
        if (persistedRequest) return persistedRequest;
        throw new StateSyncError(
          'Server memastikan permohonan belum tersimpan. Isian formulir tetap tersedia; Anda dapat mencoba kembali.',
          true
        );
      }
      if (error instanceof StateSyncError && error.definitelyNotSaved) {
        pendingRequestWhatsAppEventsRef.current = pendingRequestWhatsAppEventsRef.current.filter(event => event.requestId !== newReq.id);
        if (error.status === 400) syncBlockedRef.current = false;
      }
      throw error;
    });
  };

  const updateRequestStatus = async (
    id: string,
    status: InventoryRequest['status'],
    catatan?: string,
    jumlahDisetujui?: number,
    itemsDisetujui?: InventoryRequestItem[]
  ): Promise<{ success: boolean; message: string }> => {
    const target = requests.find(r => r.id === id);
    if (!target) return { success: false, message: 'Permohonan tidak ditemukan' };
    const canApprove = hasPermission('approveRequests') && !isPimpinanUser(currentUser);
    const canManage = hasPermission('manageInventory');
    const canRequest = hasPermission('requestSupplies');
    const isPimpinan = isPimpinanUser(currentUser);
    const canCancelOwn = status === 'Dibatalkan' && canRequest && !canApprove && !canManage &&
      !isPimpinan && target.pemohonUserId === currentUser?.id && target.status === 'Diajukan';
    const canCancelManaged = status === 'Dibatalkan' && (canApprove || canManage) && !isPimpinan &&
      ['Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses'].includes(target.status);
    const allowed = status === 'Dibatalkan'
      ? canCancelOwn || canCancelManaged
      : status === 'Disetujui' || (status === 'Ditolak' && target.status === 'Diverifikasi')
        ? canApprove
        : canApprove || canManage;
    if (!allowed) return { success: false, message: 'Anda tidak berwenang mengubah status permohonan ini.' };
    if (requestPersistenceWaitersRef.current.has(id)) {
      return { success: false, message: 'Perubahan status permohonan ini masih diproses.' };
    }
    if (target.status === status) {
      return { success: false, message: `Permohonan sudah berstatus ${status}.` };
    }

    let actionNote = catatan;
    if (status === 'Ditolak') {
      const reason = String(catatan || '').replace(/^Ditolak:\s*/i, '').trim();
      if (reason.length < 5 || reason.length > 500) {
        return { success: false, message: 'Alasan penolakan wajib diisi antara 5 sampai 500 karakter.' };
      }
      actionNote = `Ditolak: ${reason}`;
    }
    if (status === 'Dibatalkan') {
      const reason = String(catatan || '').replace(/^Dibatalkan:\s*/i, '').trim();
      if (reason.length < 5 || reason.length > 500) {
        return { success: false, message: 'Alasan pembatalan wajib diisi antara 5 sampai 500 karakter.' };
      }
      actionNote = `Dibatalkan: ${reason}`;
    }

    const requestedItems = target.items?.length
      ? target.items
      : [{
          itemId: target.itemId,
          namaBarang: target.namaBarang,
          jumlahDiminta: target.jumlahDiminta,
          jumlahDisetujui: target.jumlahDisetujui,
          satuan: target.satuan
        }];
    const approvedQty = status === 'Menunggu Konfirmasi'
      ? target.jumlahDisetujui
        ?? (requestedItems.length === 1
          ? requestedItems[0].jumlahDisetujui ?? requestedItems[0].jumlahDiminta
          : undefined)
      : jumlahDisetujui !== undefined
        ? jumlahDisetujui
        : (status === 'Disetujui' || status === 'Diproses'
          ? target.jumlahDisetujui || target.jumlahDiminta
          : target.jumlahDisetujui);
    const approvedItems = requestedItems.map(item => {
      const approvedItem = itemsDisetujui?.find(candidate => candidate.itemId === item.itemId);
      return {
        ...item,
        jumlahDisetujui: status === 'Menunggu Konfirmasi'
          ? item.jumlahDisetujui
            ?? (requestedItems.length === 1 ? target.jumlahDisetujui : undefined)
            ?? item.jumlahDiminta
          : approvedItem?.jumlahDisetujui
            ?? item.jumlahDisetujui
            ?? (requestedItems.length === 1 ? approvedQty : item.jumlahDiminta)
      };
    });
    const shouldSetApprovedItems = status === 'Disetujui' || status === 'Diproses' ||
      status === 'Selesai';
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
    let handoverItems: Array<{ itemId: string; jumlah: number }> = [];
    if (status === 'Menunggu Konfirmasi') {
      const handoverResult = normalizeRequestHandoverItems(
        { ...target, items: approvedItems },
        itemsDisetujui || []
      );
      if (handoverResult.error || !handoverResult.items) {
        return { success: false, message: handoverResult.error || 'Rincian barang yang akan diserahkan tidak valid.' };
      }
      handoverItems = handoverResult.items;
    }

    const nextPenerimaan = status === 'Menunggu Konfirmasi'
      ? {
          status: 'Menunggu Konfirmasi' as const,
          diserahkanOleh: currentUser?.name || '',
          diserahkanPada: new Date().toISOString(),
          items: handoverItems,
          mutasiIds: [],
          diterimaItems: target.penerimaan?.diterimaItems || []
        }
      : target.penerimaan;
    const effectiveNote = actionNote?.trim() ? actionNote : undefined;
    const nextRequest: InventoryRequest = {
      ...target,
      status,
      catatan: effectiveNote !== undefined ? effectiveNote : target.catatan,
      jumlahDisetujui: approvedQty,
      items: shouldSetApprovedItems || status === 'Menunggu Konfirmasi' ? approvedItems : target.items,
      penerimaan: nextPenerimaan
    };
    const requestChange: RequestStateChange = { request: nextRequest, auditLogs: [], notifications: [] };
    const persisted = new Promise<InventoryRequest>((resolve, reject) => {
      requestPersistenceWaitersRef.current.set(id, { resolve, reject, expectedStatus: status });
    });

    if (target.status !== status && status !== 'Dibatalkan' &&
        queuedRequestWhatsAppStatusRef.current.get(id) !== status) {
      queuedRequestWhatsAppStatusRef.current.set(id, status);
      queueRequestWhatsAppEvent(nextRequest, 'status_changed', effectiveNote);
    }
    if (status === 'Dibatalkan') {
      const reason = String(actionNote || '').replace(/^Dibatalkan:\s*/i, '').trim();
      logAudit(
        'Pembatalan Permohonan Barang',
        'PERSEDIAAN',
        `Permohonan ${target.id} dibatalkan. Alasan: ${reason}`,
        requestChange
      );
    }
    logAudit('Pembaruan Status Permohonan', 'PERSEDIAAN', `Permohonan ${target.nomorPermintaan} (${requestedItems.map(item => item.namaBarang).join(', ')}) diubah statusnya menjadi ${status}.`, requestChange);
    pushNotification(
      'TRANSAKSI',
      status === 'Dibatalkan' ? 'Permohonan Dibatalkan' : `📋 Status Permohonan: ${status}`,
      `Permohonan ${target.nomorPermintaan} (${requestedItems.map(item => item.namaBarang).join(', ')}) kini berstatus ${status}.`,
      'requests',
      requestChange
    );
    void persistSharedState(requestChange);
    try {
      const savedRequest = await persisted;
      if (savedRequest.status !== status) {
        throw new StateSyncError('Server menyimpan status permohonan yang berbeda. Data terbaru telah dimuat.', true);
      }
      return { success: true, message: `Status permohonan berhasil diperbarui menjadi ${status}.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Perubahan status permohonan tidak dapat disimpan.';
      if (error instanceof StateSyncError && error.definitelyNotSaved) {
        pendingRequestWhatsAppEventsRef.current = pendingRequestWhatsAppEventsRef.current.filter(event => event.requestId !== id);
        queuedRequestWhatsAppStatusRef.current.delete(id);
        if (error.status === 400) syncBlockedRef.current = false;
        return { success: false, message };
      }
      const reloaded = await reloadServerData();
      if (!reloaded) {
        return {
          success: false,
          message: `${message} Status di server belum dapat diperiksa; jangan ulangi sebelum data berhasil dimuat ulang.`
        };
      }
      const latestRequests = lastSyncedStateRef.current?.requests;
      const savedRequest = Array.isArray(latestRequests)
        ? (latestRequests as InventoryRequest[]).find(request => request.id === id)
        : undefined;
      if (savedRequest?.status === status) {
        return { success: true, message: `Status permohonan ${status} telah tercatat di server.` };
      }
      return { success: false, message };
    }
  };

  const syncAfterRequestAction = async (revision: number) => {
    const latestResponse = await fetchWithTimeout('/api/state');
    const latest = await readApiResponse<{ state: Record<string, unknown>; revision: number }>(latestResponse, '/api/state');
    if (!latest.state || !Number.isInteger(latest.revision) || latest.revision < revision) {
      throw new Error('Perubahan berhasil dicatat, tetapi data terbaru tidak dapat dimuat. Muat ulang halaman.');
    }
    const rebased = mergeStateAfterConflict(lastSyncedStateRef.current, latestSharedStateRef.current, latest.state);
    if (rebased.conflicts.length > 0) {
      syncBlockedRef.current = true;
      throw new Error(`Tindakan tersimpan, tetapi ada konflik perubahan lokal (${rebased.conflicts.slice(0, 3).join(', ')}). Periksa data server.`);
    }
    revisionRef.current = latest.revision;
    lastSyncedStateRef.current = cloneSharedState(latest.state);
    applySharedState(rebased.mergedState);
    setSyncError(null);
  };

  const submitRequestAction = async (
    path: string,
    body: Record<string, unknown>,
    fallbackMessage: string,
    alreadyApplied?: (state: Record<string, unknown>) => boolean
  ) => {
    pendingServerActionsRef.current += 1;
    try {
      await persistSharedState();
      if (syncBlockedRef.current || !sameSharedState(latestSharedStateRef.current, lastSyncedStateRef.current)) {
        pageRefreshRequestedRef.current = false;
        return { success: false, message: 'Perubahan lokal belum tersimpan. Selesaikan sinkronisasi sebelum memproses permohonan.' };
      }
      const action = syncQueueRef.current.then(async () => {
        const response = await fetchWithTimeout(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await readApiResponse<{ success: boolean; revision: number; alreadyConfirmed?: boolean }>(response, path);
        if (result.success !== true || !Number.isInteger(result.revision)) {
          throw new Error(fallbackMessage);
        }
        await syncAfterRequestAction(result.revision);
        return result;
      });
      // The caller reports action failures; subsequent queued saves must still be able to run.
      syncQueueRef.current = action.then(() => undefined, () => undefined);
      const result = await action;
      return { success: true, message: result.alreadyConfirmed
        ? 'Penerimaan ini sudah pernah dikonfirmasi; stok tidak dikurangi kembali.'
        : fallbackMessage };
    } catch (error) {
      const message = error instanceof Error ? error.message : fallbackMessage;
      if (syncBlockedRef.current) {
        pageRefreshRequestedRef.current = false;
        setSyncError(message);
        return { success: false, message };
      }
      const reloaded = await reloadServerData();
      if (reloaded && alreadyApplied?.(lastSyncedStateRef.current || {})) {
        return { success: true, message: 'Server telah mencatat tindakan ini; data terbaru sudah dimuat tanpa mengulang mutasi stok.' };
      }
      pageRefreshRequestedRef.current = false;
      return {
        success: false,
        message: reloaded
          ? message
          : `${message} Status di server belum dapat diperiksa; jangan ulangi sebelum data berhasil dimuat ulang.`
      };
    } finally {
      pendingServerActionsRef.current -= 1;
    }
  };

  const confirmInventoryRequestReceipt = (id: string) => submitRequestAction(
    `/api/requests/${encodeURIComponent(id)}/confirm-receipt`,
    {},
    'Penerimaan berhasil dikonfirmasi dan mutasi stok telah dicatat.',
    state => {
      const savedRequests = state.requests;
      const savedRequest = Array.isArray(savedRequests)
        ? (savedRequests as InventoryRequest[]).find(request => request.id === id)
        : undefined;
      return Boolean(savedRequest && ['Diproses', 'Diterima'].includes(savedRequest.status) &&
        savedRequest.penerimaan?.status === 'Diterima');
    }
  );

  const reportInventoryReceiptDiscrepancy = (id: string, reason: string) => submitRequestAction(
    `/api/requests/${encodeURIComponent(id)}/receipt-discrepancy`,
    { reason },
    'Laporan selisih berhasil dikirim kepada petugas.'
  );

  const reopenInventoryRequestHandover = (id: string) => submitRequestAction(
    `/api/requests/${encodeURIComponent(id)}/reopen-handover`,
    {},
    'Permohonan dikembalikan ke tahap penyerahan untuk ditindaklanjuti.',
    state => {
      const savedRequests = state.requests;
      const savedRequest = Array.isArray(savedRequests)
        ? (savedRequests as InventoryRequest[]).find(request => request.id === id)
        : undefined;
      return Boolean(savedRequest?.status === 'Diproses' && !savedRequest.penerimaan?.catatanSelisih);
    }
  );

  const cancelInventoryRequest = (id: string, reason: string) =>
    updateRequestStatus(id, 'Dibatalkan', reason);

  const deleteInventoryRequests = (ids: string[]) => submitRequestAction(
    '/api/requests/bulk-delete',
    { ids },
    'Permohonan terpilih berhasil dihapus permanen.',
    state => Array.isArray(state.requests) && ids.length > 0 &&
      ids.every(id => !(state.requests as InventoryRequest[]).some(request => request.id === id))
  );

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

  const updateDocument = (id: string, updates: Partial<DocumentItem>) => {
    const target = documents.find(document => document.id === id);
    if (!target) return;
    const safeUpdates = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.storageBackend;
    delete safeUpdates.storageKey;
    delete safeUpdates.storageSize;
    delete safeUpdates.sha256;
    delete safeUpdates.idempotencyKey;
    delete safeUpdates.fileName;
    delete safeUpdates.fileType;
    delete safeUpdates.uploadedAt;
    const updated = { ...target, ...safeUpdates };
    setDocuments(prev => prev.map(document => document.id === id ? updated : document));
    logAudit('Perubahan Keterangan Dokumen Digital', 'DOKUMEN', `Keterangan arsip ${target.judul} (${target.nomorDokumen}) diperbarui.`);
  };

  const deleteDocument = (id: string) => {
    const target = documents.find(d => d.id === id);
    if (!target) return;
    setDocuments(prev => prev.filter(d => d.id !== id));
    logAudit('Penghapusan Dokumen Digital', 'DOKUMEN', `Arsip ${target.judul} (${target.nomorDokumen}) dihapus.`);
  };

  const registerUploadedDocument = (document: DocumentItem, revision: number, auditLog?: AuditLog) => {
    if (!Number.isInteger(revision)) throw new Error('Revisi penyimpanan dokumen tidak valid.');
    revisionRef.current = revision;
    const baseline = lastSyncedStateRef.current || cloneSharedState(sharedState);
    const baselineDocuments = Array.isArray(baseline.documents) ? baseline.documents as DocumentItem[] : [];
    const baselineAuditLogs = Array.isArray(baseline.auditLogs) ? baseline.auditLogs as AuditLog[] : [];
    const nextDocuments = [document, ...baselineDocuments.filter(item => item.id !== document.id)]
      .sort((left, right) => right.tanggal.localeCompare(left.tanggal) || left.id.localeCompare(right.id));
    lastSyncedStateRef.current = cloneSharedState({
      ...baseline,
      documents: nextDocuments,
      auditLogs: auditLog
        ? [auditLog, ...baselineAuditLogs.filter(item => item.id !== auditLog.id)]
        : baselineAuditLogs
    });
    setDocuments(prev => [document, ...prev.filter(item => item.id !== document.id)]
      .sort((left, right) => right.tanggal.localeCompare(left.tanggal) || left.id.localeCompare(right.id)));
    if (auditLog) setAuditLogs(prev => [auditLog, ...prev.filter(item => item.id !== auditLog.id)]);
    pushNotification(
      'TRANSAKSI',
      '📄 Dokumen Digital Diunggah',
      `${document.judul} berhasil disimpan ke penyimpanan backend dan arsip aplikasi.`,
      'documents'
    );
  };

  const registerUpdatedDocument = (document: DocumentItem, revision: number, auditLog?: AuditLog) => {
    if (!Number.isInteger(revision)) throw new Error('Revisi perubahan dokumen tidak valid.');
    revisionRef.current = revision;
    const baseline = lastSyncedStateRef.current || cloneSharedState(sharedState);
    const baselineDocuments = Array.isArray(baseline.documents) ? baseline.documents as DocumentItem[] : [];
    const baselineAuditLogs = Array.isArray(baseline.auditLogs) ? baseline.auditLogs as AuditLog[] : [];
    const nextDocuments = baselineDocuments.map(item => item.id === document.id ? document : item)
      .sort((left, right) => right.tanggal.localeCompare(left.tanggal) || left.id.localeCompare(right.id));
    lastSyncedStateRef.current = cloneSharedState({
      ...baseline,
      documents: nextDocuments,
      auditLogs: auditLog
        ? [auditLog, ...baselineAuditLogs.filter(item => item.id !== auditLog.id)]
        : baselineAuditLogs
    });
    setDocuments(prev => prev.map(item => item.id === document.id ? document : item)
      .sort((left, right) => right.tanggal.localeCompare(left.tanggal) || left.id.localeCompare(right.id)));
    if (auditLog) setAuditLogs(prev => [auditLog, ...prev.filter(item => item.id !== auditLog.id)]);
    pushNotification(
      'TRANSAKSI',
      'Nota Belanja Diperbarui',
      `${document.judul} berhasil diperbarui pada arsip dokumen.`,
      'documents'
    );
  };

  const registerDeletedDocument = (id: string, revision: number, auditLog: AuditLog) => {
    if (!Number.isInteger(revision)) throw new Error('Revisi penghapusan dokumen tidak valid.');
    revisionRef.current = revision;
    const baseline = lastSyncedStateRef.current || cloneSharedState(sharedState);
    const baselineDocuments = Array.isArray(baseline.documents) ? baseline.documents as DocumentItem[] : [];
    const baselineAuditLogs = Array.isArray(baseline.auditLogs) ? baseline.auditLogs as AuditLog[] : [];
    lastSyncedStateRef.current = cloneSharedState({
      ...baseline,
      documents: baselineDocuments.filter(item => item.id !== id),
      auditLogs: [auditLog, ...baselineAuditLogs.filter(item => item.id !== auditLog.id)]
    });
    setDocuments(prev => prev.filter(item => item.id !== id));
    setAuditLogs(prev => [auditLog, ...prev.filter(item => item.id !== auditLog.id)]);
    requestPageRefresh();
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
        dataBackend,
        isInitializing: !authReady || (!!currentUser && !dataReady),
        syncError,
        isReloadingServerData,
        reloadServerData,
        requestPageRefresh,
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
        importAssetsWithRooms,
        addInventoryItem,
        updateInventoryItem,
        deleteInventoryItem,
        importInventoryItems,
        addStockIn,
        updateStockIn,
        inspectStockIn,
        verifyStockIn,
        deleteStockIn,
        deleteStockInMany,
        addStockOut,
        addInventoryRequest,
        updateRequestStatus,
        confirmInventoryRequestReceipt,
        reportInventoryReceiptDiscrepancy,
        reopenInventoryRequestHandover,
        cancelInventoryRequest,
        deleteInventoryRequests,
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
        updateDocument,
        deleteDocument,
        registerUploadedDocument,
        registerUpdatedDocument,
        registerDeletedDocument,
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
