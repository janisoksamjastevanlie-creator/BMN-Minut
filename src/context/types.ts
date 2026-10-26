// Tipe yang dipakai lintas modul di layer context.
// Diekspor ulang dari AppContext.tsx agar semua call site lama tetap bekerja.

import type { ReactNode } from 'react';
import type { AuditLog, InventoryRequest, NotificationItem } from '../types';

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

export type ConnectionStatus = 'online' | 'offline' | 'reconnecting';

export type StockInDetails = {
  itemId: string;
  jumlah: number;
  nomorDokumen: string;
  sumber: string;
  keterangan: string;
  hargaSatuan?: number;
  tanggal: string;
};

// Perubahan status permohonan yang disimpan sebagai satu paket (status + audit log + notifikasi).
export type RequestStateChange = {
  request: InventoryRequest;
  auditLogs: AuditLog[];
  notifications: NotificationItem[];
};

// Tipe bersama helper lintas domain.
export type LogAudit = (aktivitas: string, modul: AuditLog['modul'], detail: string, requestChange?: RequestStateChange) => void;
export type PushNotification = (type: NotificationItem['type'], title: string, message: string, link?: string, requestChange?: RequestStateChange) => void;
export type ChildrenProp = { children: ReactNode };


