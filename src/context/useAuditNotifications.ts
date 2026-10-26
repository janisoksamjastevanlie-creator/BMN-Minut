import { useCallback, useState } from 'react';
import type { AuditLog, NotificationItem, User } from '../types';
import type { RequestStateChange } from './types';
import { generateInitialAuditLogs, generateInitialNotifications } from '../data/initialData';

const normalizeNotificationIds = (notifications: NotificationItem[]): NotificationItem[] => {
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
};

export { normalizeNotificationIds };

// Audit trail & pusat notifikasi: state + helper pembuatan entri.
export const useAuditNotifications = ({ currentUser }: { currentUser: User | null }) => {
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

  // Audit Logger Helper
  const logAudit = useCallback((aktivitas: string, modul: AuditLog['modul'], detail: string, requestChange?: RequestStateChange) => {
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
  }, [currentUser]);

  // Helper for notifications
  const pushNotification = useCallback((type: NotificationItem['type'], title: string, message: string, link?: string, requestChange?: RequestStateChange) => {
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
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  return {
    auditLogs, setAuditLogs,
    notifications, setNotifications,
    logAudit, pushNotification,
    markNotificationRead, markAllNotificationsRead
  };
};
