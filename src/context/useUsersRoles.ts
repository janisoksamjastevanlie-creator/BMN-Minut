import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { RoleDefinition, RolePermissions, User } from '../types';
import type { LogAudit, PushNotification } from './types';

interface UseUsersRolesParams {
  currentUser: User | null;
  users: User[];
  setUsers: Dispatch<SetStateAction<User[]>>;
  roles: RoleDefinition[];
  setRoles: Dispatch<SetStateAction<RoleDefinition[]>>;
  logAudit: LogAudit;
  pushNotification: PushNotification;
  requestPageRefresh: () => void;
  pendingServerActionsRef: RefObject<number>;
  pageRefreshRequestedRef: RefObject<boolean>;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
}

interface UseUsersRolesResult {
  users: User[];
  setUsers: Dispatch<SetStateAction<User[]>>;
  addUser: (user: Omit<User, 'id'>) => User;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => { success: boolean; message: string };
  setUserPassword: (user: User, password: string) => Promise<void>;
  roles: RoleDefinition[];
  setRoles: Dispatch<SetStateAction<RoleDefinition[]>>;
  addRole: (role: Omit<RoleDefinition, 'id' | 'isSystem'>) => RoleDefinition;
  updateRole: (id: string, updates: Partial<RoleDefinition>) => void;
  deleteRole: (id: string) => { success: boolean; message: string };
  getRoleByName: (name: string) => RoleDefinition | undefined;
  hasPermission: (permission: keyof RolePermissions) => boolean;
}

// Manajemen pengguna & role (RBAC): state master + seluruh handler CRUD.
// State diterima dari provider agar daftar koleksi bisa ikut dalam snapshot sinkronisasi server.
export const useUsersRoles = ({
  currentUser, users, setUsers, roles, setRoles, logAudit, pushNotification,
  requestPageRefresh, pendingServerActionsRef, pageRefreshRequestedRef, setCurrentUser
}: UseUsersRolesParams): UseUsersRolesResult => {
  const setUserPassword = useCallback(async (user: User, password: string) => {
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
  }, [requestPageRefresh, pendingServerActionsRef, pageRefreshRequestedRef]);

  // User Management CRUD
  const addUser = useCallback((userData: Omit<User, 'id'>) => {
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
  }, [logAudit, pushNotification]);

  const updateUser = useCallback((id: string, updates: Partial<User>) => {
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
  }, [currentUser, logAudit, pushNotification]);

  const deleteUser = useCallback((id: string) => {
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
  }, [users, currentUser, logAudit, pushNotification]);

  // Role Management Methods (RBAC)
  const addRole = useCallback((roleData: Omit<RoleDefinition, 'id' | 'isSystem'>): RoleDefinition => {
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
  }, [logAudit, pushNotification]);

  const updateRole = useCallback((id: string, updates: Partial<RoleDefinition>) => {
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
  }, [currentUser, logAudit, pushNotification]);

  const deleteRole = useCallback((id: string) => {
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
  }, [users, roles, logAudit, pushNotification]);

  const getRoleByName = useCallback((name: string): RoleDefinition | undefined => {
    return roles.find(r => r.name.toLowerCase() === name.toLowerCase()) || roles.find(r => r.code.toLowerCase() === name.toLowerCase());
  }, [roles]);

  const hasPermission = useCallback((permission: keyof RolePermissions): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'Administrator') return true;
    const roleDef = getRoleByName(currentUser.role);
    if (!roleDef) return false;
    return Boolean(roleDef.permissions?.[permission]);
  }, [currentUser, getRoleByName]);

  return {
    users, setUsers,
    addUser, updateUser, deleteUser, setUserPassword,
    roles, setRoles,
    addRole, updateRole, deleteRole,
    getRoleByName, hasPermission
  };
};
