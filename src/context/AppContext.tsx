import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  User,
  RoleDefinition,
  RolePermissions,
  BmnAsset,
  DocumentItem,
  InventoryItem,
  OfficeRoom,
  WarehouseRack
} from '../types';
import { DashboardFilters } from '../utils/dashboardFilters';
import { getHomeView } from '../utils/rbac';
import { getPathForView } from '../utils/viewRoutes';
import { mergeStateAfterConflict } from '../../stateConflict.mjs';
import { ApiResponseError, apiFailureMessage, fetchWithTimeout, isTransientApiFailure, readApiResponse, sendJson } from '../utils/serverRequest';

import {
  applyRequestNumberAssignments,
  cloneSharedState,
  isRecoverableFailure,
  sameSharedState,
  StateSyncError,
  type LogAudit,
  type PushNotification,
  type RequestStateChange
} from './syncHelpers';
import type { ActiveView, ConnectionStatus, StockInDetails } from './types';
import { useNavigation } from './useNavigation';
import { useUiState } from './useUiState';
import { useAuditNotifications, normalizeNotificationIds } from './useAuditNotifications';
import { useCollections } from './useCollections';
import { useUsersRoles } from './useUsersRoles';
import { useAssetsAndRooms } from './useAssetsAndRooms';
import { useInventory } from './useInventory';
import { useStock } from './useStock';
import { useRequests } from './useRequests';
import { useAssetLifecycle } from './useAssetLifecycle';
import { useOpnames } from './useOpnames';
import { useDocuments } from './useDocuments';

export type { ActiveView, ConnectionStatus } from './types';

const MAX_STATE_CONFLICT_RETRIES = 3;
const RECOVERY_BASE_DELAY_MS = 5_000;
const RECOVERY_MAX_DELAY_MS = 60_000;
const HEARTBEAT_ONLINE_MS = 30_000;
const HEARTBEAT_OFFLINE_MS = 10_000;

interface AppContextType {
  currentUser: User | null;
  dataBackend: 'legacy' | 'operational';
  isInitializing: boolean;
  syncError: string | null;
  // Pemulihan otomatis berjalan hanya untuk kegagalan jaringan/server sementara.
  isSyncRecoverable: boolean;
  syncRecoveryAttempt: number;
  connectionStatus: ConnectionStatus;
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
  stockInList: import('../types').StockInTransaction[];
  stockOutList: import('../types').StockOutTransaction[];
  requests: import('../types').InventoryRequest[];
  opnames: import('../types').StockOpname[];
  movements: import('../types').AssetMovement[];
  maintenances: import('../types').AssetMaintenance[];
  disposals: import('../types').AssetDisposal[];
  documents: DocumentItem[];
  auditLogs: import('../types').AuditLog[];
  notifications: import('../types').NotificationItem[];

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

  addStockIn: (data: StockInDetails) => { success: boolean; message: string };
  updateStockIn: (id: string, data: StockInDetails) => { success: boolean; message: string };
  inspectStockIn: (id: string, pemeriksaan: NonNullable<import('../types').StockInTransaction['pemeriksaan']>) => { success: boolean; message: string };
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

  addInventoryRequest: (req: Omit<import('../types').InventoryRequest, 'id' | 'nomorPermintaan' | 'tanggal' | 'status'>) => Promise<import('../types').InventoryRequest>;
  updateRequestStatus: (id: string, status: import('../types').InventoryRequest['status'], catatan?: string, jumlahDisetujui?: number, itemsDisetujui?: import('../types').InventoryRequestItem[]) => Promise<{ success: boolean; message: string }>;
  confirmInventoryRequestReceipt: (id: string) => Promise<{ success: boolean; message: string }>;
  reportInventoryReceiptDiscrepancy: (id: string, reason: string) => Promise<{ success: boolean; message: string }>;
  reopenInventoryRequestHandover: (id: string) => Promise<{ success: boolean; message: string }>;
  cancelInventoryRequest: (id: string, reason: string) => Promise<{ success: boolean; message: string }>;
  deleteInventoryRequests: (ids: string[]) => Promise<{ success: boolean; message: string }>;

  addAssetMovement: (mov: Omit<import('../types').AssetMovement, 'id' | 'nomorTransaksi' | 'status' | 'createdAt' | 'updatedAt'>) => void;
  updateMovementStatus: (id: string, status: import('../types').AssetMovement['status'], catatan?: string) => void;
  deleteAssetMovement: (id: string) => { success: boolean; message: string };

  addAssetMaintenance: (mnt: Omit<import('../types').AssetMaintenance, 'id' | 'nomorTiket'>) => void;
  updateMaintenanceStatus: (id: string, status: import('../types').AssetMaintenance['status']) => void;
  deleteAssetMaintenance: (id: string) => { success: boolean; message: string };

  addAssetDisposal: (disp: Omit<import('../types').AssetDisposal, 'id' | 'nomorPengajuan'>) => void;
  updateDisposalStatus: (id: string, status: import('../types').AssetDisposal['status']) => void;

  addStockOpname: (opname: Omit<import('../types').StockOpname, 'id' | 'nomorOpname'>) => void;
  approveStockOpname: (id: string) => void;

  addDocument: (doc: Omit<DocumentItem, 'id'>) => void;
  updateDocument: (id: string, updates: Partial<DocumentItem>) => void;
  deleteDocument: (id: string) => void;
  registerUploadedDocument: (document: DocumentItem, revision: number, auditLog?: import('../types').AuditLog) => void;
  registerUpdatedDocument: (document: DocumentItem, revision: number, auditLog?: import('../types').AuditLog) => void;
  registerDeletedDocument: (id: string, revision: number, auditLog: import('../types').AuditLog) => void;
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [dataBackend, setDataBackend] = useState<'legacy' | 'operational'>('legacy');
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [syncError, setSyncErrorState] = useState<string | null>(null);
  const [isSyncRecoverable, setIsSyncRecoverable] = useState(false);
  const [syncRecoveryAttempt, setSyncRecoveryAttempt] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online'
  );
  const syncErrorRef = useRef<string | null>(null);
  const syncRecoverableRef = useRef(false);
  const setSyncError = useCallback((message: string | null, recoverable = false) => {
    syncErrorRef.current = message;
    syncRecoverableRef.current = Boolean(message) && recoverable;
    setSyncErrorState(message);
    setIsSyncRecoverable(Boolean(message) && recoverable);
  }, []);
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
  const requestPageRefresh = useCallback(() => {
    pageRefreshRequestedRef.current = true;
    setPageRefreshVersion(version => version + 1);
  }, []);
  const immediateStateSyncRef = useRef(false);
  const requestImmediateStateSync = useCallback(() => {
    immediateStateSyncRef.current = true;
  }, []);
  const requestPersistenceWaitersRef = useRef<Map<string, {
    resolve: (request: import('../types').InventoryRequest) => void;
    reject: (error: Error) => void;
    expectedStatus?: import('../types').InventoryRequest['status'];
  }>>(new Map());
  const pendingRequestWhatsAppEventsRef = useRef<Array<{
    eventId: string;
    requestId: string;
    status: import('../types').InventoryRequest['status'];
    action: 'submitted' | 'status_changed';
    note?: string;
  }>>([]);
  const queuedRequestWhatsAppStatusRef = useRef<Map<string, import('../types').InventoryRequest['status']>>(new Map());

  const {
    activeView, setActiveView, returnViewRef,
    dashboardFilters, setDashboardFilters,
    performance3D, setPerformance3D
  } = useNavigation();

  const {
    selectedAsset, setSelectedAsset,
    selectedInventoryItem, setSelectedInventoryItem,
    isGlobalSearchOpen, setIsGlobalSearchOpen,
    isQuickActionOpen, setIsQuickActionOpen,
    isQrScannerOpen, setIsQrScannerOpen,
    isAiAssistantOpen, setIsAiAssistantOpen,
    isMobileMenuOpen, setIsMobileMenuOpen,
    printableData, setPrintableData
  } = useUiState();

  const {
    auditLogs, setAuditLogs,
    notifications, setNotifications,
    logAudit, pushNotification,
    markNotificationRead, markAllNotificationsRead
  } = useAuditNotifications({ currentUser });

  const collections = useCollections();

  const userRoles = useUsersRoles({
    currentUser,
    users: collections.users,
    setUsers: collections.setUsers,
    roles: collections.roles,
    setRoles: collections.setRoles,
    logAudit,
    pushNotification,
    requestPageRefresh,
    pendingServerActionsRef,
    pageRefreshRequestedRef,
    setCurrentUser
  });
  const {
    users, addUser, updateUser, deleteUser, setUserPassword,
    roles, addRole, updateRole, deleteRole,
    getRoleByName, hasPermission
  } = userRoles;

  const assetRooms = useAssetsAndRooms({
    currentUser,
    rooms: collections.rooms,
    setRooms: collections.setRooms,
    warehouseRacks: collections.warehouseRacks,
    setWarehouseRacks: collections.setWarehouseRacks,
    assets: collections.assets,
    setAssets: collections.setAssets,
    logAudit, pushNotification
  });
  const {
    rooms, addRoom, updateRoom, deleteRoom,
    warehouseRacks, assets,
    addAsset, updateAsset, deleteAsset,
    importAssets, importAssetsWithRooms
  } = assetRooms;

  const inventory = useInventory({
    inventoryItems: collections.inventoryItems,
    setInventoryItems: collections.setInventoryItems,
    logAudit, pushNotification
  });
  const {
    inventoryItems, addInventoryItem, updateInventoryItem, deleteInventoryItem, importInventoryItems
  } = inventory;

  const sharedState = {
    rooms: collections.rooms,
    assets: collections.assets,
    inventoryItems: collections.inventoryItems,
    stockInList: collections.stockInList,
    stockOutList: collections.stockOutList,
    requests: collections.requests,
    opnames: collections.opnames,
    movements: collections.movements,
    maintenances: collections.maintenances,
    disposals: collections.disposals,
    documents: collections.documents,
    auditLogs,
    notifications,
    users: collections.users,
    roles: collections.roles,
    ...(dataBackend === 'operational' ? { warehouseRacks: collections.warehouseRacks } : {})
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
    if (Array.isArray(state.rooms)) collections.setRooms(state.rooms as OfficeRoom[]);
    if (Array.isArray(state.assets)) collections.setAssets(state.assets as BmnAsset[]);
    if (Array.isArray(state.inventoryItems)) collections.setInventoryItems(state.inventoryItems as InventoryItem[]);
    if (Array.isArray(state.stockInList)) collections.setStockInList(state.stockInList as import('../types').StockInTransaction[]);
    if (Array.isArray(state.stockOutList)) collections.setStockOutList(state.stockOutList as import('../types').StockOutTransaction[]);
    if (Array.isArray(state.requests)) collections.setRequests(state.requests as import('../types').InventoryRequest[]);
    if (Array.isArray(state.opnames)) collections.setOpnames(state.opnames as import('../types').StockOpname[]);
    if (Array.isArray(state.movements)) collections.setMovements(state.movements as import('../types').AssetMovement[]);
    if (Array.isArray(state.maintenances)) collections.setMaintenances(state.maintenances as import('../types').AssetMaintenance[]);
    if (Array.isArray(state.disposals)) collections.setDisposals(state.disposals as import('../types').AssetDisposal[]);
    if (Array.isArray(state.documents)) collections.setDocuments(state.documents as DocumentItem[]);
    if (Array.isArray(state.auditLogs)) setAuditLogs(state.auditLogs as import('../types').AuditLog[]);
    if (Array.isArray(state.notifications)) {
      setNotifications(normalizeNotificationIds(state.notifications as import('../types').NotificationItem[]));
    }
    if (Array.isArray(state.users)) collections.setUsers(state.users as User[]);
    if (Array.isArray(state.roles)) collections.setRoles(state.roles as import('../types').RoleDefinition[]);
    if (Array.isArray(state.warehouseRacks)) collections.setWarehouseRacks(state.warehouseRacks as WarehouseRack[]);
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
      const saveResponse = await sendJson('/api/state', 'PUT', { state: initialState, revision: revisionRef.current });
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
        const response = await fetchWithTimeout('/api/auth/me');
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
          setSyncError(apiFailureMessage(error), isRecoverableFailure(error));
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
    const submittedRequests = submittedState.requests as import('../types').InventoryRequest[];
    const savedRequests = savedState.requests as import('../types').InventoryRequest[];
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
        const existingRequests = stateToSave.requests as import('../types').InventoryRequest[];
        const exists = existingRequests.some(request => request.id === requestChange.request.id);
        stateToSave = {
          ...stateToSave,
          requests: exists
            ? existingRequests.map(request => request.id === requestChange.request.id ? requestChange.request : request)
            : [requestChange.request, ...existingRequests],
          auditLogs: [...requestChange.auditLogs, ...(stateToSave.auditLogs as import('../types').AuditLog[])],
          notifications: [...requestChange.notifications, ...(stateToSave.notifications as import('../types').NotificationItem[])]
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
        requests?: import('../types').InventoryRequest[];
      } | null = null;
      let saveOutcomeUncertain = false;
      for (let attempt = 0; attempt < MAX_STATE_CONFLICT_RETRIES; attempt += 1) {
        try {
          const baseline = lastSyncedStateRef.current;
          const changedEntries = baseline
            ? Object.entries(stateToSave).filter(([key, value]) => !sameSharedState(value, baseline[key]))
            : null;
          const payloadState = changedEntries && changedEntries.length > 0
            ? Object.fromEntries(changedEntries)
            : stateToSave;
          const response = await sendJson('/api/state', 'PUT', { state: payloadState, revision: revisionRef.current });
          const result = await readApiResponse<{
            revision?: number;
            requestNumbers?: Record<string, string>;
            requests?: import('../types').InventoryRequest[];
          }>(response, '/api/state', [409]);
          if (response.status !== 409) {
            saveResult = result;
            break;
          }
        } catch (error) {
          if (error instanceof ApiResponseError && error.status === 401) {
            expireSession(stateToSave);
            throw new StateSyncError(error.message, true, error.status);
          }
          if (error instanceof ApiResponseError && error.status === 403) {
            syncBlockedRef.current = true;
            throw new StateSyncError(`Akses ditolak: ${error.message}`, true, error.status);
          }
          if (!isTransientApiFailure(error)) {
            const definitelyNotSaved = error instanceof ApiResponseError && error.status < 500;
            if (definitelyNotSaved) syncBlockedRef.current = true;
            throw new StateSyncError(apiFailureMessage(error), definitelyNotSaved,
              error instanceof ApiResponseError ? error.status : undefined, !definitelyNotSaved);
          }
          saveOutcomeUncertain = true;
          console.warn('[sync] Penyimpanan terputus; memeriksa state dan revisi server sebelum mencoba kembali.');
        }

        let latest: { state?: Record<string, unknown>; revision?: number };
        try {
          const latestResponse = await fetchWithTimeout('/api/state');
          latest = await readApiResponse<{ state?: Record<string, unknown>; revision?: number }>(latestResponse, '/api/state');
        } catch (error) {
          if (error instanceof ApiResponseError && error.status === 401) {
            expireSession(stateToSave);
            throw new StateSyncError(error.message, true, error.status);
          }
          if (saveOutcomeUncertain) syncBlockedRef.current = true;
          throw new StateSyncError(apiFailureMessage(error), !saveOutcomeUncertain,
            error instanceof ApiResponseError ? error.status : undefined, isRecoverableFailure(error));
        }
        if (!latest.state || typeof latest.revision !== 'number' || !Number.isInteger(latest.revision)) {
          syncBlockedRef.current = true;
          const error = new StateSyncError('Konflik data terjadi dan data terbaru dari server tidak valid. Muat ulang data server sebelum melanjutkan.', !saveOutcomeUncertain);
          for (const waiter of requestPersistenceWaitersRef.current.values()) waiter.reject(error);
          requestPersistenceWaitersRef.current.clear();
          setSyncError(error.message);
          return;
        }
        const baseState = lastSyncedStateRef.current;
        if (!baseState) {
          syncBlockedRef.current = true;
          const error = new StateSyncError('Konflik data terjadi tanpa salinan perubahan terakhir. Muat ulang halaman sebelum melanjutkan.', !saveOutcomeUncertain);
          for (const waiter of requestPersistenceWaitersRef.current.values()) waiter.reject(error);
          requestPersistenceWaitersRef.current.clear();
          setSyncError(error.message);
          return;
        }
        const { mergedState, conflicts } = mergeStateAfterConflict(baseState, stateToSave, latest.state);
        if (conflicts.length > 0) {
          syncBlockedRef.current = true;
          const error = new StateSyncError(`Data yang sama berubah di perangkat lain (${conflicts.slice(0, 3).join(', ')}). Muat ulang halaman untuk memeriksa perubahan sebelum mencoba lagi.`, !saveOutcomeUncertain);
          for (const waiter of requestPersistenceWaitersRef.current.values()) waiter.reject(error);
          requestPersistenceWaitersRef.current.clear();
          setSyncError(error.message);
          return;
        }
        revisionRef.current = latest.revision;
        lastSyncedStateRef.current = cloneSharedState(latest.state);
        stateToSave = mergedState;
        if (sameSharedState(mergedState, latest.state)) {
          saveResult = { revision: latest.revision, requests: latest.state.requests as import('../types').InventoryRequest[] };
          break;
        }
      }
      if (!saveResult) {
        syncBlockedRef.current = true;
        const error = new StateSyncError('Sinkronisasi belum dapat dipastikan. Periksa data server sebelum melanjutkan.', !saveOutcomeUncertain, undefined, true);
        for (const waiter of requestPersistenceWaitersRef.current.values()) waiter.reject(error);
        requestPersistenceWaitersRef.current.clear();
        setSyncError(error.message, true);
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
      const persistedRequests = (stateToSave.requests as import('../types').InventoryRequest[]) || [];
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
        }).catch((error: unknown) => {
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
    }).catch((error: unknown) => {
      pageRefreshRequestedRef.current = false;
      const message = apiFailureMessage(error);
      const recoverable = isRecoverableFailure(error);
      const pendingWaiters = [...requestPersistenceWaitersRef.current.values()];
      requestPersistenceWaitersRef.current.clear();
      let reportedError: Error = error instanceof StateSyncError ? error : new Error(message);
      if (pendingWaiters.length > 0 && !(error instanceof StateSyncError && error.definitelyNotSaved)) {
        syncBlockedRef.current = true;
        reportedError = new StateSyncError('Status penyimpanan permohonan belum dapat dipastikan. Muat ulang halaman dan periksa daftar permohonan sebelum mengirim ulang.', false, undefined, recoverable);
      }
      for (const waiter of pendingWaiters) {
        waiter.reject(reportedError);
      }
      setSyncError(reportedError.message, recoverable);
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
    currentUser, dataReady, collections.rooms, collections.assets, collections.inventoryItems,
    collections.stockInList, collections.stockOutList, collections.requests, collections.opnames,
    collections.movements, collections.maintenances, collections.disposals, collections.documents,
    auditLogs, notifications, collections.users, collections.roles, collections.warehouseRacks, dataBackend
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
      setConnectionStatus('online');
      return true;
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 401) {
        expireSession();
      } else {
        setSyncError(apiFailureMessage(error), isRecoverableFailure(error));
      }
      return false;
    } finally {
      reloadInFlightRef.current = false;
      setIsReloadingServerData(false);
    }
  };
  const reloadServerDataRef = useRef(reloadServerData);
  reloadServerDataRef.current = reloadServerData;

  // Pemulihan otomatis setelah gangguan jaringan: ambil state server terbaru dan gabungkan
  // dengan perubahan lokal yang belum tersinkron, alih-alih membuangnya seperti reloadServerData.
  const recoverServerSync = async (): Promise<boolean> => {
    if (reloadInFlightRef.current) return false;
    reloadInFlightRef.current = true;
    setConnectionStatus('reconnecting');
    try {
      const userResponse = await fetchWithTimeout('/api/auth/me');
      if (userResponse.status === 401 && !currentUser) {
        // Belum masuk; tidak ada sesi yang perlu dipulihkan.
        setSyncError(null);
        setConnectionStatus('online');
        return true;
      }
      const { user } = await readApiResponse<{ user: User }>(userResponse, '/api/auth/me');
      const base = lastSyncedStateRef.current;
      if (!currentUser || !base || !dataReady) {
        setCurrentUser(user);
        await loadSessionData(user);
      } else {
        const latestResponse = await fetchWithTimeout('/api/state');
        const latest = await readApiResponse<{ state?: Record<string, unknown>; revision?: number }>(latestResponse, '/api/state');
        if (!latest.state || !Number.isInteger(latest.revision)) {
          throw new Error('Data terbaru dari server tidak valid.');
        }
        const local = latestSharedStateRef.current;
        let nextState = latest.state;
        if (!sameSharedState(local, base)) {
          const merged = mergeStateAfterConflict(base, local, latest.state);
          if (merged.conflicts.length > 0) {
            syncBlockedRef.current = true;
            setSyncError(`Koneksi pulih, tetapi data yang sama berubah di perangkat lain (${merged.conflicts.slice(0, 3).join(', ')}). Muat ulang data server untuk mengambil versi server.`);
            setConnectionStatus('online');
            return false;
          }
          nextState = merged.mergedState;
        }
        revisionRef.current = latest.revision as number;
        lastSyncedStateRef.current = cloneSharedState(latest.state);
        const storedUser = (latest.state.users as User[] | null)?.find(item => item.id === user.id);
        setCurrentUser(storedUser || user);
        // Bila ada perubahan lokal yang tergabung, efek persist akan mengunggahnya kembali.
        applySharedState(nextState);
      }
      pendingSessionRecoveryRef.current = null;
      syncBlockedRef.current = false;
      setSyncError(null);
      setConnectionStatus('online');
      return true;
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 401) {
        expireSession();
        setConnectionStatus('online');
        return false;
      }
      setSyncError(apiFailureMessage(error), isRecoverableFailure(error));
      setConnectionStatus(isTransientApiFailure(error) ? 'offline' : 'online');
      return false;
    } finally {
      reloadInFlightRef.current = false;
    }
  };
  const recoverServerSyncRef = useRef(recoverServerSync);
  recoverServerSyncRef.current = recoverServerSync;

  // Jadwal coba-ulang otomatis dengan backoff selama kegagalannya bersifat sementara.
  useEffect(() => {
    if (!syncError || !isSyncRecoverable) {
      if (syncRecoveryAttempt !== 0) setSyncRecoveryAttempt(0);
      return;
    }
    const delay = Math.min(RECOVERY_MAX_DELAY_MS, RECOVERY_BASE_DELAY_MS * 2 ** syncRecoveryAttempt);
    const timer = window.setTimeout(() => {
      void recoverServerSyncRef.current().then(recovered => {
        if (!recovered && syncRecoverableRef.current) setSyncRecoveryAttempt(attempt => attempt + 1);
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [syncError, isSyncRecoverable, syncRecoveryAttempt]);

  // Segera pulihkan saat jaringan kembali atau tab kembali aktif.
  useEffect(() => {
    const tryRecover = () => {
      if (syncErrorRef.current && syncRecoverableRef.current) void recoverServerSyncRef.current();
    };
    const handleOnline = () => {
      setConnectionStatus('online');
      tryRecover();
    };
    const handleOffline = () => setConnectionStatus('offline');
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tryRecover();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Heartbeat ringan ke /api/health agar putusnya koneksi terdeteksi sebelum pengguna menyimpan.
  const connectionStatusRef = useRef<ConnectionStatus>(connectionStatus);
  connectionStatusRef.current = connectionStatus;
  useEffect(() => {
    if (!currentUser || !dataReady) return;
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || reloadInFlightRef.current || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const response = await fetchWithTimeout('/api/health', {}, { timeoutMs: 8_000, retryDelayMs: 500 });
        if (cancelled) return;
        if (!response.ok) {
          setConnectionStatus('offline');
          return;
        }
        const wasOffline = connectionStatusRef.current === 'offline';
        if (connectionStatusRef.current !== 'reconnecting') setConnectionStatus('online');
        if (wasOffline && syncErrorRef.current && syncRecoverableRef.current) {
          void recoverServerSyncRef.current();
        }
      } catch {
        if (!cancelled) setConnectionStatus('offline');
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => { void tick(); },
      connectionStatus === 'offline' ? HEARTBEAT_OFFLINE_MS : HEARTBEAT_ONLINE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUser, dataReady, connectionStatus]);

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

  const requestsDomain = useRequests({
    inventoryItems: collections.inventoryItems,
    requests: collections.requests,
    currentUser,
    hasPermission: userRoles.hasPermission,
    logAudit, pushNotification,
    persistSharedState,
    reloadServerData,
    applySharedState,
    setSyncError,
    lastSyncedStateRef, latestSharedStateRef, syncBlockedRef, syncQueueRef, revisionRef,
    pendingServerActionsRef, pageRefreshRequestedRef,
    requestPersistenceWaitersRef, pendingRequestWhatsAppEventsRef, queuedRequestWhatsAppStatusRef
  });
  const {
    addInventoryRequest, updateRequestStatus,
    confirmInventoryRequestReceipt, reportInventoryReceiptDiscrepancy,
    reopenInventoryRequestHandover, cancelInventoryRequest, deleteInventoryRequests
  } = requestsDomain;

  const stock = useStock({
    inventoryItems: collections.inventoryItems,
    setInventoryItems: collections.setInventoryItems,
    stockInList: collections.stockInList,
    setStockInList: collections.setStockInList,
    stockOutList: collections.stockOutList,
    setStockOutList: collections.setStockOutList,
    requests: collections.requests,
    currentUser,
    updateInventoryItem: inventory.updateInventoryItem,
    hasPermission: userRoles.hasPermission,
    logAudit, pushNotification,
    requestImmediateStateSync
  });
  const {
    stockInList, stockOutList,
    addStockIn, updateStockIn, inspectStockIn, verifyStockIn,
    deleteStockIn, deleteStockInMany, addStockOut
  } = stock;

  const opnames = useOpnames({
    opnames: collections.opnames,
    setOpnames: collections.setOpnames,
    updateInventoryItem: inventory.updateInventoryItem,
    logAudit, pushNotification
  });
  const { addStockOpname, approveStockOpname } = opnames;

  const lifecycle = useAssetLifecycle({
    movements: collections.movements,
    setMovements: collections.setMovements,
    maintenances: collections.maintenances,
    setMaintenances: collections.setMaintenances,
    disposals: collections.disposals,
    setDisposals: collections.setDisposals,
    rooms: collections.rooms,
    updateAsset: assetRooms.updateAsset,
    logAudit, pushNotification
  });
  const {
    movements, maintenances, disposals,
    addAssetMovement, updateMovementStatus, deleteAssetMovement,
    addAssetMaintenance, updateMaintenanceStatus, deleteAssetMaintenance,
    addAssetDisposal, updateDisposalStatus
  } = lifecycle;

  const documentsDomain = useDocuments({
    documents: collections.documents,
    setDocuments: collections.setDocuments,
    setAuditLogs, setAssets: collections.setAssets,
    setInventoryItems: collections.setInventoryItems,
    logAudit, pushNotification, requestPageRefresh,
    revisionRef, lastSyncedStateRef, sharedStateRef: latestSharedStateRef
  });
  const {
    documents, addDocument, updateDocument, deleteDocument,
    registerUploadedDocument, registerUpdatedDocument, registerDeletedDocument,
    importSystemBackup
  } = documentsDomain;

  return (
    <AppContext.Provider
      value={{
        currentUser,
        dataBackend,
        isInitializing: !authReady || (!!currentUser && !dataReady),
        syncError,
        isSyncRecoverable,
        syncRecoveryAttempt,
        connectionStatus,
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
        isRoomModalOpen: collections.isRoomModalOpen,
        setIsRoomModalOpen: collections.setIsRoomModalOpen,
        editingRoom: collections.editingRoom,
        setEditingRoom: collections.setEditingRoom,
        warehouseRacks,
        assets,
        inventoryItems,
        stockInList,
        stockOutList,
        requests: collections.requests,
        opnames: collections.opnames,
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
