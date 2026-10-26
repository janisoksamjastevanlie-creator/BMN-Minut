import { useState } from 'react';
import type {
  AssetDisposal,
  AssetMaintenance,
  AssetMovement,
  BmnAsset,
  DocumentItem,
  InventoryItem,
  InventoryRequest,
  OfficeRoom,
  RoleDefinition,
  StockInTransaction,
  StockOpname,
  StockOutTransaction,
  User,
  WarehouseRack
} from '../types';
import {
  INITIAL_ROLES,
  INITIAL_USERS,
  OFFICE_ROOMS,
  WAREHOUSE_RACKS,
  generateInitialBmnAssets,
  generateInitialDocuments,
  generateInitialInventoryItems,
  generateInitialMaintenance,
  generateInitialMovements,
  generateInitialOpnames,
  generateInitialRequests,
  generateInitialStockIn,
  generateInitialStockOut
} from '../data/initialData';
import { getAssetPhotoUrl, getInventoryPhotoUrl } from '../utils/assetImages';

// Deklarasi state koleksi data (hanya data, tanpa handler). Urutan deklarasi dan
// initializer dipertahankan persis seperti implementasi lama AppContext.
export const useCollections = () => {
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

  return {
    rooms, setRooms,
    warehouseRacks, setWarehouseRacks,
    isRoomModalOpen, setIsRoomModalOpen,
    editingRoom, setEditingRoom,
    assets, setAssets,
    inventoryItems, setInventoryItems,
    stockInList, setStockInList,
    stockOutList, setStockOutList,
    requests, setRequests,
    opnames, setOpnames,
    movements, setMovements,
    maintenances, setMaintenances,
    disposals, setDisposals,
    documents, setDocuments,
    users, setUsers,
    roles, setRoles
  };
};
