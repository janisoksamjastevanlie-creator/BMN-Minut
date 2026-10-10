import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { User, UserRole, RoleDefinition, RolePermissions } from '../types';
import {
  Users,
  UserPlus,
  Edit3,
  Trash2,
  Shield,
  ShieldCheck,
  Mail,
  Phone,
  Building2,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Sparkles,
  LogIn,
  AlertTriangle,
  X,
  Upload,
  Copy,
  Check,
  LayoutGrid,
  List,
  Crown,
  KeyRound,
  UserCheck,
  Briefcase,
  Lock,
  Unlock,
  Plus,
  Sliders,
  Settings,
  Boxes,
  Warehouse,
  ArrowRightLeft,
  Wrench,
  FileText,
  Calendar,
  Layers,
  HelpCircle,
  RotateCcw
} from 'lucide-react';

const AVATAR_PRESETS = [
  { label: 'Pria Jas 1', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80' },
  { label: 'Pria Jas 2', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80' },
  { label: 'Pria Kemeja', url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80' },
  { label: 'Pria Eksekutif', url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80' },
  { label: 'Wanita Blazer 1', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80' },
  { label: 'Wanita Blazer 2', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80' },
  { label: 'Wanita Hijab', url: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=150&q=80' },
  { label: 'Pimpinan BPS', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80' }
];

const UNIT_KERJA_PRESETS = [
  'Kepala BPS Kabupaten Minahasa Utara',
  'Subbagian Umum & Perlengkapan BMN',
  'Fungsi IPDS (Integrasi Pengolahan & Diseminasi Statistik)',
  'Fungsi Statistik Sosial',
  'Fungsi Statistik Produksi',
  'Fungsi Statistik Distribusi',
  'Fungsi Neraca Wilayah & Analisis Statistik',
  'Pengelola Gudang Persediaan & ATK',
  'Tim Inspektorat & Pengawasan Internal'
];

interface ColorTheme {
  id: string;
  label: string;
  badge: string;
  gradient: string;
  ring: string;
  text: string;
  border: string;
  bgLight: string;
}

const COLOR_PRESETS: Record<string, ColorTheme> = {
  purple: {
    id: 'purple',
    label: 'Ungu (Administrator)',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    gradient: 'from-purple-600 to-indigo-600',
    ring: 'ring-purple-500',
    text: 'text-purple-400',
    border: 'border-purple-500/40',
    bgLight: 'bg-purple-500/10'
  },
  blue: {
    id: 'blue',
    label: 'Biru (Pengelola)',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    gradient: 'from-blue-600 to-cyan-600',
    ring: 'ring-blue-500',
    text: 'text-blue-400',
    border: 'border-blue-500/40',
    bgLight: 'bg-blue-500/10'
  },
  cyan: {
    id: 'cyan',
    label: 'Cyan (Operasional)',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    gradient: 'from-cyan-600 to-teal-600',
    ring: 'ring-cyan-500',
    text: 'text-cyan-400',
    border: 'border-cyan-500/40',
    bgLight: 'bg-cyan-500/10'
  },
  amber: {
    id: 'amber',
    label: 'Amber / Emas (Pimpinan)',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    gradient: 'from-amber-600 to-orange-600',
    ring: 'ring-amber-500',
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    bgLight: 'bg-amber-500/10'
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald / Hijau (Auditor)',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    gradient: 'from-emerald-600 to-teal-600',
    ring: 'ring-emerald-500',
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    bgLight: 'bg-emerald-500/10'
  },
  rose: {
    id: 'rose',
    label: 'Rose / Merah (Khusus)',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    gradient: 'from-rose-600 to-pink-600',
    ring: 'ring-rose-500',
    text: 'text-rose-400',
    border: 'border-rose-500/40',
    bgLight: 'bg-rose-500/10'
  },
  indigo: {
    id: 'indigo',
    label: 'Indigo (Staff Satker)',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    gradient: 'from-indigo-600 to-violet-600',
    ring: 'ring-indigo-500',
    text: 'text-indigo-400',
    border: 'border-indigo-500/40',
    bgLight: 'bg-indigo-500/10'
  },
  orange: {
    id: 'orange',
    label: 'Oranye (Gudang)',
    badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    gradient: 'from-orange-600 to-amber-600',
    ring: 'ring-orange-500',
    text: 'text-orange-400',
    border: 'border-orange-500/40',
    bgLight: 'bg-orange-500/10'
  }
};

interface PermissionItemConfig {
  key: keyof RolePermissions;
  label: string;
  desc: string;
  category: 'BMN & Aset' | 'Persediaan ATK' | 'Layanan' | 'Sistem & RBAC';
  icon: React.ComponentType<{ className?: string }>;
}

const PERMISSION_CONFIG_LIST: PermissionItemConfig[] = [
  // Utama & Dashboard
  { key: 'viewDashboard', label: 'Dashboard & Statistik', desc: 'Melihat ringkasan metrik aset, stok opname, dan peringatan.', category: 'Sistem & RBAC', icon: Sliders },
  
  // Aset BMN
  { key: 'viewAssets', label: 'Lihat Master Aset BMN', desc: 'Melihat data rincian NUP, foto barang, QR code, dan lokasi ruangan.', category: 'BMN & Aset', icon: Boxes },
  { key: 'manageAssets', label: 'Kelola Master Aset (CRUD)', desc: 'Menambah aset baru, mengubah spesifikasi, dan menghapus data BMN.', category: 'BMN & Aset', icon: Boxes },
  { key: 'manageMovements', label: 'Mutasi & Pemindahan Ruangan', desc: 'Mengajukan permohonan mutasi serta memproses serah terima fisik.', category: 'BMN & Aset', icon: ArrowRightLeft },
  { key: 'manageMaintenance', label: 'Jadwal Pemeliharaan & Servis', desc: 'Mencatat tiket pemeliharaan, jadwal perbaikan, dan biaya servis.', category: 'BMN & Aset', icon: Wrench },
  { key: 'manageDisposal', label: 'Usulan Penghapusan BMN', desc: 'Membuat usulan penghapusan BMN rusak berat/hilang ke KPKNL.', category: 'BMN & Aset', icon: Trash2 },
  
  // Persediaan ATK
  { key: 'viewInventory', label: 'Lihat Master Persediaan', desc: 'Melihat stok opname ATK/ARK, kartu persediaan, dan batas minimum.', category: 'Persediaan ATK', icon: Warehouse },
  { key: 'manageInventory', label: 'Kelola Stok Masuk / Keluar', desc: 'Input transaksi penerimaan barang dan pengeluaran barang persediaan.', category: 'Persediaan ATK', icon: Warehouse },
  { key: 'requestSupplies', label: 'Buat Permintaan Barang (SPB)', desc: 'Mengisi form permohonan pengambilan ATK untuk kebutuhan unit kerja.', category: 'Persediaan ATK', icon: FileText },
  { key: 'approveRequests', label: 'Persetujuan / Disposisi Permintaan', desc: 'Menyetujui, merevisi, atau menolak permohonan barang dari pegawai.', category: 'Persediaan ATK', icon: CheckCircle2 },
  { key: 'stockOpname', label: 'Pelaksanaan Stok Opname', desc: 'Melakukan verifikasi fisik gudang dan pengesahan berita acara opname.', category: 'Persediaan ATK', icon: Check },

  // Fasilitas & Layanan
  { key: 'roomBooking', label: 'Peminjaman Ruang Rapat', desc: 'Melihat jadwal dan memesan ruangan rapat BPS Minahasa Utara.', category: 'Layanan', icon: Calendar },
  { key: 'viewReports', label: 'Laporan & Ekspor Berkas', desc: 'Mengunduh rekapitulasi data, berita acara, serta cetak laporan PDF/Excel.', category: 'Layanan', icon: FileText },

  // Administrasi & RBAC
  { key: 'manageUsers', label: 'Manajemen Akun Pengguna', desc: 'Menambah, mengubah profil pegawai, dan mengelola status keaktifan.', category: 'Sistem & RBAC', icon: Users },
  { key: 'manageRoles', label: 'Konfigurasi Role & RBAC', desc: 'Membuat role kustom baru, mengatur izin modul, dan hak akses jabatan.', category: 'Sistem & RBAC', icon: ShieldCheck },
  { key: 'systemSettings', label: 'Pengaturan Sistem & Audit Trail', desc: 'Akses konfigurasi aplikasi, log audit jejak aktivitas, dan backup data.', category: 'Sistem & RBAC', icon: Settings }
];

const ROLE_TEMPLATES = [
  {
    name: 'Administrator Penuh',
    code: 'ADMIN',
    color: 'purple',
    desc: 'Hak akses tanpa batas ke semua modul sistem SIMAN BPS.',
    permissions: {
      viewDashboard: true, viewAssets: true, manageAssets: true, manageMovements: true,
      manageMaintenance: true, manageDisposal: true, viewInventory: true, manageInventory: true,
      requestSupplies: true, approveRequests: true, stockOpname: true, roomBooking: true,
      viewReports: true, manageUsers: true, manageRoles: true, systemSettings: true
    }
  },
  {
    name: 'Auditor Internal / Pengawas',
    code: 'AUDITOR',
    color: 'emerald',
    desc: 'Pemeriksaan kepatuhan, review laporan mutasi, opname stok, dan jejak audit tanpa izin pengubahan data.',
    permissions: {
      viewDashboard: true, viewAssets: true, manageAssets: false, manageMovements: false,
      manageMaintenance: false, manageDisposal: false, viewInventory: true, manageInventory: false,
      requestSupplies: false, approveRequests: false, stockOpname: false, roomBooking: false,
      viewReports: true, manageUsers: false, manageRoles: false, systemSettings: false
    }
  },
  {
    name: 'Petugas Gudang Persediaan',
    code: 'GUDANG',
    color: 'orange',
    desc: 'Manajemen fisik gudang ATK/ARK, input barang masuk/keluar, dan verifikasi opname fisik berkala.',
    permissions: {
      viewDashboard: true, viewAssets: false, manageAssets: false, manageMovements: false,
      manageMaintenance: false, manageDisposal: false, viewInventory: true, manageInventory: true,
      requestSupplies: true, approveRequests: false, stockOpname: true, roomBooking: true,
      viewReports: true, manageUsers: false, manageRoles: false, systemSettings: false
    }
  },
  {
    name: 'Pengelola Aset BMN',
    code: 'BMN_STAFF',
    color: 'blue',
    desc: 'Pencatatan aset BMN, mutasi ruangan kerja, servis berkala, dan berkas usulan penghapusan.',
    permissions: {
      viewDashboard: true, viewAssets: true, manageAssets: true, manageMovements: true,
      manageMaintenance: true, manageDisposal: true, viewInventory: true, manageInventory: false,
      requestSupplies: true, approveRequests: false, stockOpname: false, roomBooking: true,
      viewReports: true, manageUsers: false, manageRoles: false, systemSettings: false
    }
  },
  {
    name: 'Pejabat Penyetuju (Pimpinan / PPK)',
    code: 'APPROVER',
    color: 'amber',
    desc: 'Validasi permohonan, disposisi persetujuan barang & mutasi, serta pengesahan laporan eksekutif.',
    permissions: {
      viewDashboard: true, viewAssets: true, manageAssets: false, manageMovements: true,
      manageMaintenance: false, manageDisposal: true, viewInventory: true, manageInventory: false,
      requestSupplies: false, approveRequests: true, stockOpname: false, roomBooking: true,
      viewReports: true, manageUsers: false, manageRoles: false, systemSettings: false
    }
  },
  {
    name: 'Pegawai Pemohon (Staff Satker)',
    code: 'STAFF',
    color: 'indigo',
    desc: 'Pengajuan kebutuhan ATK untuk unit kerja dan pemesanan fasilitas ruang rapat kantor.',
    permissions: {
      viewDashboard: true, viewAssets: true, manageAssets: false, manageMovements: false,
      manageMaintenance: false, manageDisposal: false, viewInventory: true, manageInventory: false,
      requestSupplies: true, approveRequests: false, stockOpname: false, roomBooking: true,
      viewReports: false, manageUsers: false, manageRoles: false, systemSettings: false
    }
  }
];

const DEFAULT_PERMISSIONS: RolePermissions = {
  viewDashboard: true,
  viewAssets: true,
  manageAssets: false,
  manageMovements: false,
  manageMaintenance: false,
  manageDisposal: false,
  viewInventory: true,
  manageInventory: false,
  requestSupplies: true,
  approveRequests: false,
  stockOpname: false,
  roomBooking: true,
  viewReports: true,
  manageUsers: false,
  manageRoles: false,
  systemSettings: false
};

export const UsersView: React.FC = () => {
  const {
    users,
    currentUser,
    addUser,
    updateUser,
    deleteUser,
    setUserPassword,
    roles,
    addRole,
    updateRole,
    deleteRole
  } = useApp();

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());

  // Search & Filter State for Users
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'active' | 'inactive'>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // User Modals State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // User Form State
  const [formData, setFormData] = useState({
    name: '',
    nip: '',
    email: '',
    role: 'Operator' as UserRole,
    unitKerja: 'Subbagian Umum & Perlengkapan BMN',
    phone: '',
    avatar: AVATAR_PRESETS[0].url,
    statusAktif: true,
    password: ''
  });
  const [formError, setFormError] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [copiedNip, setCopiedNip] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Role Management State
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [roleModalMode, setRoleModalMode] = useState<'create' | 'edit'>('create');
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<RoleDefinition | null>(null);
  const [isDeleteRoleModalOpen, setIsDeleteRoleModalOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleDefinition | null>(null);

  // Matrix Filter State
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState<string>('ALL');

  // Role Form State
  const [roleFormData, setRoleFormData] = useState<{
    name: string;
    code: string;
    color: string;
    description: string;
    permissions: RolePermissions;
  }>({
    name: '',
    code: '',
    color: 'blue',
    description: '',
    permissions: { ...DEFAULT_PERMISSIONS }
  });
  const [roleFormError, setRoleFormError] = useState('');

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  // Helper to get color config for a role
  const getRoleTheme = (roleName: string): ColorTheme => {
    const roleDef = roles.find(r => r.name.toLowerCase() === roleName.toLowerCase() || r.code.toLowerCase() === roleName.toLowerCase());
    if (roleDef && roleDef.color && COLOR_PRESETS[roleDef.color]) {
      return COLOR_PRESETS[roleDef.color];
    }
    // Fallbacks
    if (roleName.includes('Admin')) return COLOR_PRESETS.purple;
    if (roleName.includes('BMN') || roleName.includes('Aset')) return COLOR_PRESETS.blue;
    if (roleName.includes('Operator') || roleName.includes('Operasional')) return COLOR_PRESETS.cyan;
    if (roleName.includes('Pimpinan') || roleName.includes('Kepala')) return COLOR_PRESETS.amber;
    if (roleName.includes('Audit')) return COLOR_PRESETS.emerald;
    return COLOR_PRESETS.indigo;
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchSearch =
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.nip.includes(searchQuery) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.unitKerja.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.role.toLowerCase().includes(searchQuery.toLowerCase());

      const matchRole = selectedRoleFilter === 'All' || user.role === selectedRoleFilter;

      const isUserActive = user.statusAktif !== false;
      const matchStatus =
        statusFilter === 'All' ||
        (statusFilter === 'active' && isUserActive) ||
        (statusFilter === 'inactive' && !isUserActive);

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchQuery, selectedRoleFilter, statusFilter]);

  // Filtered Roles
  const filteredRoles = useMemo(() => {
    return roles.filter(r =>
      r.name.toLowerCase().includes(roleSearchQuery.toLowerCase()) ||
      r.code.toLowerCase().includes(roleSearchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(roleSearchQuery.toLowerCase())
    );
  }, [roles, roleSearchQuery]);

  const selectableUsers = filteredUsers.filter(user => user.id !== currentUser?.id);
  const selectableRoles = filteredRoles.filter(role => !role.isSystem);
  const areAllVisibleUsersSelected =
    selectableUsers.length > 0 && selectableUsers.every(user => selectedUserIds.has(user.id));
  const areAllVisibleRolesSelected =
    selectableRoles.length > 0 && selectableRoles.every(role => selectedRoleIds.has(role.id));

  // Statistics
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.statusAktif !== false).length;
    const totalRoles = roles.length;
    const systemRoles = roles.filter(r => r.isSystem).length;
    const customRoles = roles.filter(r => !r.isSystem).length;
    return { totalUsers, activeUsers, totalRoles, systemRoles, customRoles };
  }, [users, roles]);

  // Handle open Add User Modal
  const handleOpenAddUser = () => {
    setFormMode('create');
    setSelectedUser(null);
    const defaultRole = roles[0]?.name || 'Operator';
    setFormData({
      name: '',
      nip: '',
      email: '',
      role: defaultRole,
      unitKerja: 'Subbagian Umum & Perlengkapan BMN',
      phone: '',
      avatar: AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)].url,
      statusAktif: true,
      password: ''
    });
    setFormError('');
    setIsFormModalOpen(true);
  };

  // Handle open Edit User Modal
  const handleOpenEditUser = (user: User) => {
    setFormMode('edit');
    setSelectedUser(user);
    setFormData({
      name: user.name,
      nip: user.nip,
      email: user.email,
      role: user.role,
      unitKerja: user.unitKerja,
      phone: user.phone || '',
      avatar: user.avatar || AVATAR_PRESETS[0].url,
      statusAktif: user.statusAktif !== false,
      password: ''
    });
    setFormError('');
    setIsFormModalOpen(true);
  };

  // Handle open Delete User Modal
  const handleOpenDeleteUser = (user: User) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  // User Form Submit (Add or Edit)
  const handleUserFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formData.name.trim()) {
      setFormError('Nama lengkap pegawai wajib diisi');
      return;
    }
    if (!formData.nip.trim()) {
      setFormError('NIP pegawai wajib diisi');
      return;
    }
    if (!formData.email.trim()) {
      setFormError('Email resmi instansi wajib diisi');
      return;
    }
    if ((formMode === 'create' || formData.password) && formData.password.length < 12) {
      setFormError('Kata sandi akun harus minimal 12 karakter.');
      return;
    }

    setIsSavingUser(true);
    const profile = {
        name: formData.name.trim(),
        nip: formData.nip.trim(),
        email: formData.email.trim(),
        role: formData.role,
        unitKerja: formData.unitKerja.trim(),
        phone: formData.phone.trim() || undefined,
        avatar: formData.avatar,
        statusAktif: formData.statusAktif
    };
    try {
      let savedUser: User;
      if (formMode === 'create') {
        savedUser = addUser(profile);
        await setUserPassword(savedUser, formData.password);
        showToast('success', `Pengguna "${formData.name}" berhasil dibuat. NIP dan kata sandi dapat digunakan untuk login.`);
      } else if (selectedUser) {
        savedUser = { ...selectedUser, ...profile };
        updateUser(selectedUser.id, profile);
        if (formData.password) await setUserPassword(savedUser, formData.password);
        showToast('success', `Data pengguna "${formData.name}" berhasil diperbarui.`);
      } else {
        return;
      }
      setIsFormModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Gagal menyimpan akun pengguna.');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Delete User Action
  const handleConfirmDeleteUser = () => {
    if (!userToDelete) return;
    const res = deleteUser(userToDelete.id);
    if (res.success) {
      showToast('success', res.message);
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    } else {
      showToast('error', res.message);
    }
  };

  // Copy NIP
  const handleCopyNip = (nip: string) => {
    navigator.clipboard.writeText(nip);
    setCopiedNip(nip);
    setTimeout(() => setCopiedNip(null), 2000);
  };

  // Handle Photo File Upload for User
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setFormData(prev => ({ ...prev, avatar: reader.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // ================= ROLE MANAGEMENT HANDLERS =================
  const handleOpenAddRole = () => {
    setRoleModalMode('create');
    setSelectedRoleForEdit(null);
    setRoleFormData({
      name: '',
      code: '',
      color: 'blue',
      description: '',
      permissions: { ...DEFAULT_PERMISSIONS }
    });
    setRoleFormError('');
    setIsRoleModalOpen(true);
  };

  const handleOpenEditRole = (role: RoleDefinition) => {
    setRoleModalMode('edit');
    setSelectedRoleForEdit(role);
    setRoleFormData({
      name: role.name,
      code: role.code,
      color: role.color || 'blue',
      description: role.description,
      permissions: { ...role.permissions }
    });
    setRoleFormError('');
    setIsRoleModalOpen(true);
  };

  const handleDuplicateRole = (role: RoleDefinition) => {
    setRoleModalMode('create');
    setSelectedRoleForEdit(null);
    setRoleFormData({
      name: `${role.name} (Salinan)`,
      code: `${role.code}_COPY`.slice(0, 10).toUpperCase(),
      color: role.color || 'indigo',
      description: `Berdasarkan hak akses ${role.name}: ${role.description}`,
      permissions: { ...role.permissions }
    });
    setRoleFormError('');
    setIsRoleModalOpen(true);
    showToast('success', `Menduplikasi profil izin dari role "${role.name}". Silakan sesuaikan nama dan hak akses.`);
  };

  const handleOpenDeleteRole = (role: RoleDefinition) => {
    setRoleToDelete(role);
    setIsDeleteRoleModalOpen(true);
  };

  const handleConfirmDeleteRole = () => {
    if (!roleToDelete) return;
    const res = deleteRole(roleToDelete.id);
    if (res.success) {
      showToast('success', res.message);
      setIsDeleteRoleModalOpen(false);
      setRoleToDelete(null);
    } else {
      showToast('error', res.message);
    }
  };

  const toggleUserSelection = (id: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllUserSelection = () => {
    setSelectedUserIds(
      areAllVisibleUsersSelected ? new Set() : new Set(selectableUsers.map(user => user.id))
    );
  };

  const handleBulkDeleteUsers = () => {
    const selectedUsers = users.filter(user => selectedUserIds.has(user.id));
    if (selectedUsers.length === 0) {
      showToast('error', 'Pilih data pengguna yang ingin dihapus terlebih dahulu.');
      return;
    }
    if (!window.confirm('Apakah Anda yakin ingin menghapus data yang dipilih?')) return;

    let deletedCount = 0;
    const errors: string[] = [];
    selectedUsers.forEach(user => {
      try {
        const result = deleteUser(user.id);
        if (result.success) deletedCount += 1;
        else errors.push(result.message);
      } catch (error) {
        errors.push(`Pengguna "${user.name}": ${error instanceof Error ? error.message : 'terjadi kesalahan saat menghapus.'}`);
      }
    });
    setSelectedUserIds(new Set());
    showToast(
      errors.length > 0 ? 'error' : 'success',
      errors.length > 0
        ? `${deletedCount} pengguna berhasil dihapus. ${errors.length} gagal: ${errors.join(' ')}`
        : `${deletedCount} pengguna berhasil dihapus.`
    );
  };

  const toggleRoleSelection = (id: string) => {
    setSelectedRoleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRoleSelection = () => {
    setSelectedRoleIds(
      areAllVisibleRolesSelected ? new Set() : new Set(selectableRoles.map(role => role.id))
    );
  };

  const handleBulkDeleteRoles = () => {
    const selectedRoles = roles.filter(role => selectedRoleIds.has(role.id));
    if (selectedRoles.length === 0) {
      showToast('error', 'Pilih data role yang ingin dihapus terlebih dahulu.');
      return;
    }
    if (!window.confirm('Apakah Anda yakin ingin menghapus data yang dipilih?')) return;

    let deletedCount = 0;
    const errors: string[] = [];
    selectedRoles.forEach(role => {
      try {
        const result = deleteRole(role.id);
        if (result.success) deletedCount += 1;
        else errors.push(result.message);
      } catch (error) {
        errors.push(`Role "${role.name}": ${error instanceof Error ? error.message : 'terjadi kesalahan saat menghapus.'}`);
      }
    });
    setSelectedRoleIds(new Set());
    showToast(
      errors.length > 0 ? 'error' : 'success',
      errors.length > 0
        ? `${deletedCount} role berhasil dihapus. ${errors.length} gagal: ${errors.join(' ')}`
        : `${deletedCount} role berhasil dihapus.`
    );
  };

  const handleApplyRoleTemplate = (template: typeof ROLE_TEMPLATES[0]) => {
    setRoleFormData(prev => ({
      ...prev,
      name: prev.name || template.name,
      code: prev.code || template.code,
      color: template.color,
      description: prev.description || template.desc,
      permissions: {
        ...DEFAULT_PERMISSIONS,
        ...template.permissions
      } as RolePermissions
    }));
    showToast('success', `Template izin "${template.name}" berhasil diterapkan.`);
  };

  const handleTogglePermission = (key: keyof RolePermissions) => {
    setRoleFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  const handleToggleMatrixPermission = (role: RoleDefinition, key: keyof RolePermissions) => {
    const updatedPermissions = {
      ...role.permissions,
      [key]: !role.permissions[key]
    };
    updateRole(role.id, { permissions: updatedPermissions });
    showToast('success', `Izin "${key}" untuk role ${role.name} diperbarui.`);
  };

  const handleRoleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleFormData.name.trim()) {
      setRoleFormError('Nama role wajib diisi (contoh: Auditor Internal, Bendahara Barang)');
      return;
    }
    if (!roleFormData.code.trim()) {
      setRoleFormError('Kode role singkatan wajib diisi (contoh: AUDITOR, BENDAHARA)');
      return;
    }

    const cleanCode = roleFormData.code.trim().toUpperCase().replace(/\s+/g, '_');
    const theme = COLOR_PRESETS[roleFormData.color] || COLOR_PRESETS.blue;

    if (roleModalMode === 'create') {
      // Check duplicate name
      const exists = roles.some(r => r.name.toLowerCase() === roleFormData.name.trim().toLowerCase());
      if (exists) {
        setRoleFormError(`Role dengan nama "${roleFormData.name}" sudah ada. Gunakan nama yang berbeda.`);
        return;
      }

      addRole({
        name: roleFormData.name.trim(),
        code: cleanCode,
        color: roleFormData.color,
        badgeClass: theme.badge,
        description: roleFormData.description.trim() || 'Role kustom hak akses pengguna instansi BPS.',
        permissions: roleFormData.permissions
      });
      showToast('success', `Role baru "${roleFormData.name}" [${cleanCode}] berhasil dibuat dan siap digunakan.`);
    } else if (selectedRoleForEdit) {
      updateRole(selectedRoleForEdit.id, {
        name: roleFormData.name.trim(),
        code: cleanCode,
        color: roleFormData.color,
        badgeClass: theme.badge,
        description: roleFormData.description.trim(),
        permissions: roleFormData.permissions
      });
      showToast('success', `Konfigurasi role "${roleFormData.name}" berhasil diperbarui.`);
    }

    setIsRoleModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-extrabold text-white">Manajemen Pengguna & Peran (RBAC)</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold font-mono">
              BPS Satker 7106
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kelola data pegawai BPS, buat peran baru (kustom role), atur matriks izin modul, dan verifikasi hak akses sistem secara komprehensif.
          </p>
        </div>

        {/* Top Action Buttons based on Active Tab */}
        <div className="flex items-center gap-2.5 shrink-0">
          {activeTab === 'users' ? (
            <button
              onClick={handleOpenAddUser}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 min-h-[40px]"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Tambah Pengguna Baru</span>
            </button>
          ) : (
            <button
              onClick={handleOpenAddRole}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 min-h-[40px]"
            >
              <Shield className="w-4 h-4" />
              <span>+ Buat Role Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation Pill Bar */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur w-full sm:w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 min-h-[38px] ${
            activeTab === 'users'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Data Pegawai & Akun</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'users' ? 'bg-blue-800/70 text-blue-100' : 'bg-slate-800 text-slate-400'}`}>
            {stats.totalUsers}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 min-h-[38px] ${
            activeTab === 'roles'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Katalog Role & Matriks Hak Akses (RBAC)</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'roles' ? 'bg-purple-800/70 text-purple-100' : 'bg-slate-800 text-slate-400'}`}>
            {stats.totalRoles}
          </span>
        </button>
      </div>

      {/* ===================== TAB 1: USERS MANAGEMENT ===================== */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Quick Statistics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pegawai</div>
              <div className="text-xl font-extrabold text-white mt-1 flex items-center gap-2">
                <span>{stats.totalUsers}</span>
                <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                  {stats.activeUsers} Aktif
                </span>
              </div>
            </div>

            {roles.map(role => {
              const theme = getRoleTheme(role.name);
              const count = users.filter(u => u.role.toLowerCase() === role.name.toLowerCase()).length;
              return (
                <div key={role.id} className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate flex items-center justify-between">
                    <span className="truncate">{role.name}</span>
                    <span className="font-mono text-[9px] opacity-70">[{role.code}]</span>
                  </div>
                  <div className="text-xl font-extrabold text-white mt-1 flex items-center justify-between">
                    <span>{count}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${theme.badge}`}>
                      {theme.id}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Search, Role Filter, and View Switcher */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari berdasarkan Nama pegawai, NIP, Email, Unit Kerja, atau Role..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                >
                  <option value="All">Semua Status</option>
                  <option value="active">Hanya Akun Aktif</option>
                  <option value="inactive">Nonaktif / Ditangguhkan</option>
                </select>

                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Tampilan Grid Card"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Tampilan Tabel Lengkap"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Dynamic Role Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1 shrink-0">
                <Filter className="w-3.5 h-3.5" />
                Filter Role:
              </span>
              <button
                onClick={() => setSelectedRoleFilter('All')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedRoleFilter === 'All'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                }`}
              >
                Semua ({users.length})
              </button>
              {roles.map(r => {
                const count = users.filter(u => u.role === r.name).length;
                const isSelected = selectedRoleFilter === r.name;
                const theme = getRoleTheme(r.name);
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRoleFilter(r.name)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? `${theme.badge} font-bold shadow-sm`
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    <span>{r.name}</span>
                    <span className="text-[10px] opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredUsers.length > 0 && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={areAllVisibleUsersSelected}
                  onChange={toggleAllUserSelection}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500"
                  aria-label="Pilih semua pengguna yang dapat dihapus"
                />
                Pilih Semua
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{selectedUserIds.size} pengguna dipilih</span>
                <button
                  onClick={handleBulkDeleteUsers}
                  disabled={selectedUserIds.size === 0}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Terpilih
                </button>
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredUsers.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
              <Users className="w-12 h-12 text-slate-600 mx-auto" />
              <div className="text-base font-bold text-white">Tidak ada data pengguna yang cocok</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Silakan periksa kembali kata kunci pencarian atau sesuaikan filter role yang sedang dipilih.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedRoleFilter('All');
                  setStatusFilter('All');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
              >
                Reset Filter Pencarian
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* ================= GRID VIEW ================= */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredUsers.map(user => {
                const theme = getRoleTheme(user.role);
                const isCurrentUser = currentUser?.id === user.id;
                const isActive = user.statusAktif !== false;

                return (
                  <div
                    key={user.id}
                    className={`relative p-5 rounded-2xl bg-slate-900/80 border transition-all hover:border-slate-700 space-y-4 ${
                      isCurrentUser
                        ? 'border-blue-500/50 shadow-lg shadow-blue-500/10 bg-slate-900'
                        : 'border-slate-800/90'
                    }`}
                  >
                    {/* User Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.has(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                          disabled={isCurrentUser}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500 disabled:opacity-40"
                          aria-label={`Pilih pengguna ${user.name}`}
                        />
                        <div className="relative">
                          {user.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user.name}
                              className="w-13 h-13 rounded-2xl object-cover border border-slate-700"
                            />
                          ) : (
                            <div className={`w-13 h-13 rounded-2xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center font-bold text-white text-lg shadow-md`}>
                              {user.name.charAt(0)}
                            </div>
                          )}
                          <span
                            className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                              isActive ? 'bg-emerald-500' : 'bg-slate-500'
                            }`}
                            title={isActive ? 'Akun Aktif' : 'Akun Nonaktif'}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-white truncate">{user.name}</h3>
                            {isCurrentUser && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                                Sesi Anda
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] font-mono text-slate-400">{user.nip}</span>
                            <button
                              onClick={() => handleCopyNip(user.nip)}
                              className="text-slate-500 hover:text-slate-300 transition-colors"
                              title="Salin NIP"
                            >
                              {copiedNip === user.nip ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <div className="mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${theme.badge}`}>
                              {user.role}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isActive
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-700/50 text-slate-400 border-slate-700'
                        }`}
                      >
                        {isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>

                    {/* Work Unit & Contact Information */}
                    <div className="space-y-1.5 text-xs text-slate-300 border-t border-b border-slate-800/80 py-3">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{user.unitKerja}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </div>
                      {user.phone && (
                        <div className="flex items-center gap-2 text-slate-400">
                          <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{user.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      {isCurrentUser ? (
                        <div className="text-[11px] text-blue-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Akun Anda</span>
                        </div>
                      ) : <span />}

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditUser(user)}
                          className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-blue-400 transition-colors"
                          title="Edit Data Pengguna"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenDeleteUser(user)}
                          disabled={isCurrentUser}
                          className={`p-2 rounded-xl transition-colors ${
                            isCurrentUser
                              ? 'text-slate-600 bg-slate-800/40 cursor-not-allowed'
                              : 'bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400'
                          }`}
                          title={isCurrentUser ? 'Tidak dapat menghapus akun yang sedang aktif' : 'Hapus Pengguna'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ================= TABLE VIEW ================= */
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={areAllVisibleUsersSelected}
                          onChange={toggleAllUserSelection}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500"
                          aria-label="Pilih semua pengguna yang dapat dihapus"
                        />
                      </th>
                      <th className="px-4 py-3.5">Pegawai & NIP</th>
                      <th className="px-4 py-3.5">Unit Kerja / Jabatan</th>
                      <th className="px-4 py-3.5">Hak Akses (Role)</th>
                      <th className="px-4 py-3.5">Kontak</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredUsers.map(user => {
                      const theme = getRoleTheme(user.role);
                      const isCurrentUser = currentUser?.id === user.id;
                      const isActive = user.statusAktif !== false;

                      return (
                        <tr
                          key={user.id}
                          className={`hover:bg-slate-800/30 transition-colors ${
                            isCurrentUser ? 'bg-blue-500/5' : ''
                          }`}
                        >
                          <td className="px-3 py-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={selectedUserIds.has(user.id)}
                              onChange={() => toggleUserSelection(user.id)}
                              disabled={isCurrentUser}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500 disabled:opacity-40"
                              aria-label={`Pilih pengguna ${user.name}`}
                            />
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              {user.avatar ? (
                                <img
                                  src={user.avatar}
                                  alt={user.name}
                                  className="w-9 h-9 rounded-xl object-cover border border-slate-700"
                                />
                              ) : (
                                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center font-bold text-white text-xs`}>
                                  {user.name.charAt(0)}
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  <span>{user.name}</span>
                                  {isCurrentUser && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400">
                                      Anda
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
                                  <span>{user.nip}</span>
                                  <button
                                    onClick={() => handleCopyNip(user.nip)}
                                    className="text-slate-500 hover:text-slate-300"
                                  >
                                    {copiedNip === user.nip ? (
                                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-2.5 h-2.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-slate-300">
                            <div className="truncate max-w-xs">{user.unitKerja}</div>
                          </td>

                          <td className="px-4 py-3.5">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${theme.badge}`}>
                              {user.role}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-slate-300">
                            <div>{user.email}</div>
                            {user.phone && <div className="text-[11px] text-slate-400">{user.phone}</div>}
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isActive
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-slate-700/50 text-slate-400 border-slate-700'
                              }`}
                            >
                              {isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditUser(user)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-blue-400"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenDeleteUser(user)}
                                disabled={isCurrentUser}
                                className={`p-1.5 rounded-lg ${
                                  isCurrentUser
                                    ? 'text-slate-600 bg-slate-800/40 cursor-not-allowed'
                                    : 'bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400'
                                }`}
                                title="Hapus"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: ROLES & RBAC MATRIX ===================== */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          {/* Top RBAC Stats Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Peran (Roles)</div>
              <div className="text-2xl font-black text-white mt-1 flex items-center gap-2">
                <span>{roles.length}</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold">
                  Aktif
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Hak akses terdaftar di satker BPS</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Role Bawaan Sistem</div>
              <div className="text-2xl font-black text-blue-400 mt-1">
                {stats.systemRoles}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Standar baku SIMAN BPS</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Role Kustom Dibuat</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">
                {stats.customRoles}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Ditambahkan sesuai kebutuhan satker</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Modul Kewenangan</div>
              <div className="text-2xl font-black text-amber-400 mt-1">
                {PERMISSION_CONFIG_LIST.length}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Izin granular per fitur sistem</p>
            </div>
          </div>

          {/* Role Header Action & Search */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari role berdasarkan nama peran, kode singkatan, atau deskripsi..."
                value={roleSearchQuery}
                onChange={e => setRoleSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
              {roleSearchQuery && (
                <button
                  onClick={() => setRoleSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenAddRole}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Buat Role Baru</span>
              </button>
            </div>
          </div>

          {/* Role Cards Grid */}
          {filteredRoles.length > 0 && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={areAllVisibleRolesSelected}
                  onChange={toggleAllRoleSelection}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-purple-500 focus:ring-purple-500"
                  aria-label="Pilih semua role yang dapat dihapus"
                />
                Pilih Semua
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{selectedRoleIds.size} role dipilih</span>
                <button
                  onClick={handleBulkDeleteRoles}
                  disabled={selectedRoleIds.size === 0}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Terpilih
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredRoles.map(role => {
              const theme = getRoleTheme(role.name);
              const assignedUsers = users.filter(u => u.role.toLowerCase() === role.name.toLowerCase());
              
              // Count granted permissions
              const totalPerms = PERMISSION_CONFIG_LIST.length;
              const grantedPermsCount = PERMISSION_CONFIG_LIST.filter(
                p => role.permissions?.[p.key] === true
              ).length;
              const permPercentage = Math.round((grantedPermsCount / totalPerms) * 100);

              return (
                <div
                  key={role.id}
                  className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/90 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
                >
                  <div>
                    {/* Role Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedRoleIds.has(role.id)}
                          onChange={() => toggleRoleSelection(role.id)}
                          disabled={role.isSystem}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-purple-500 focus:ring-purple-500 disabled:opacity-40"
                          aria-label={`Pilih role ${role.name}`}
                        />
                        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center font-bold text-white shadow-md`}>
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-extrabold text-white">{role.name}</h3>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                              [{role.code}]
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                role.isSystem
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              }`}
                            >
                              {role.isSystem ? '🔒 Sistem' : '✨ Kustom'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* User Count Badge */}
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 text-[11px] font-bold text-slate-300 border border-slate-700">
                          <Users className="w-3 h-3 text-blue-400" />
                          <span>{assignedUsers.length} Pegawai</span>
                        </span>
                      </div>
                    </div>

                    {/* Role Description */}
                    <p className="text-xs text-slate-400 mt-3 line-clamp-2 leading-relaxed">
                      {role.description}
                    </p>

                    {/* Permission Meter */}
                    <div className="mt-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Cakupan Hak Akses:</span>
                        <span className="font-bold text-white font-mono">
                          {grantedPermsCount} / {totalPerms} Modul ({permPercentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${theme.gradient} transition-all duration-500`}
                          style={{ width: `${permPercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Key Permission Badges */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {PERMISSION_CONFIG_LIST.slice(0, 4).map(p => {
                        const hasAccess = Boolean(role.permissions?.[p.key]);
                        return (
                          <span
                            key={p.key}
                            className={`text-[10px] px-2 py-0.5 rounded-md font-medium border flex items-center gap-1 ${
                              hasAccess
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800/50 text-slate-500 border-slate-800 line-through opacity-60'
                            }`}
                          >
                            {hasAccess ? '✓' : '✕'} {p.label}
                          </span>
                        );
                      })}
                      {totalPerms > 4 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono">
                          +{totalPerms - 4} modul lainnya
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Role Card Actions */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDuplicateRole(role)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
                        title="Duplikat hak akses role ini"
                      >
                        <Copy className="w-3.5 h-3.5 text-blue-400" />
                        <span>Kloning</span>
                      </button>

                      <button
                        onClick={() => handleOpenEditRole(role)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-purple-400 text-xs font-semibold transition-colors flex items-center gap-1.5"
                        title="Edit Konfigurasi Role"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                        <span>Edit Izin</span>
                      </button>
                    </div>

                    {!role.isSystem ? (
                      <button
                        onClick={() => handleOpenDeleteRole(role)}
                        className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Hapus Role Kustom"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-medium px-2 py-1 flex items-center gap-1" title="Role bawaan sistem tidak dapat dihapus">
                        <Lock className="w-3 h-3 text-slate-500" />
                        <span>Terkunci</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ================= INTERACTIVE RBAC MATRIX ================= */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800/80 p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  <span>Matriks Hak Akses Modul Interaktif (RBAC Matrix)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Klik pada ikon status (✓ / ✕) di kolom role yang bersangkutan untuk mengaktifkan atau mematikan hak akses secara langsung.
                </p>
              </div>

              {/* Category Filter for Matrix */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
                {['ALL', 'BMN & Aset', 'Persediaan ATK', 'Layanan', 'Sistem & RBAC'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setMatrixCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      matrixCategoryFilter === cat
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400'
                    }`}
                  >
                    {cat === 'ALL' ? 'Semua Modul' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 min-w-[240px]">Modul & Fitur Sistem</th>
                    <th className="px-3 py-3 w-28">Kategori</th>
                    {roles.map(r => {
                      const theme = getRoleTheme(r.name);
                      return (
                        <th key={r.id} className="px-3 py-3 text-center min-w-[120px]">
                          <div className="font-bold text-white truncate">{r.name}</div>
                          <div className="text-[10px] font-mono text-slate-500">[{r.code}]</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {PERMISSION_CONFIG_LIST.filter(
                    p => matrixCategoryFilter === 'ALL' || p.category === matrixCategoryFilter
                  ).map(perm => (
                    <tr key={perm.key} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-white flex items-center gap-2">
                          <perm.icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>{perm.label}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                          {perm.desc}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 whitespace-nowrap">
                          {perm.category}
                        </span>
                      </td>

                      {roles.map(r => {
                        const hasAccess = Boolean(r.permissions?.[perm.key]);
                        return (
                          <td key={r.id} className="px-3 py-3 text-center">
                            <button
                              onClick={() => handleToggleMatrixPermission(r, perm.key)}
                              className={`p-1.5 rounded-xl transition-all ${
                                hasAccess
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 shadow-sm'
                                  : 'bg-slate-800/60 text-slate-500 border border-slate-800 hover:bg-slate-800 hover:text-slate-300'
                              }`}
                              title={`Klik untuk ${hasAccess ? 'Mencabut' : 'Memberikan'} akses ${perm.label} pada role ${r.name}`}
                            >
                              {hasAccess ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <XCircle className="w-4 h-4 text-slate-600" />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: TAMBAH / EDIT PENGGUNA ===================== */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {formMode === 'create' ? 'Tambah Pengguna Baru' : 'Edit Data Pengguna'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Lengkapi identitas ASN / Pegawai BPS dan tentukan hak akses peran (Role).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="text-slate-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleUserFormSubmit} className="space-y-4">
              {/* Avatar Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Foto Profil / Avatar Pegawai
                </label>
                <div className="flex items-center gap-3">
                  <img
                    src={formData.avatar}
                    alt="Preview"
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-blue-500/50 shadow-md shrink-0"
                  />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {AVATAR_PRESETS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, avatar: preset.url }))}
                          className={`relative rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                            formData.avatar === preset.url
                              ? 'border-blue-500 scale-105 ring-2 ring-blue-500/30'
                              : 'border-slate-700 opacity-60 hover:opacity-100'
                          }`}
                          title={preset.label}
                        >
                          <img src={preset.url} alt={preset.label} className="w-8 h-8 object-cover" />
                        </button>
                      ))}
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5 text-blue-400" />
                      <span>Upload Foto Sendiri</span>
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Name & NIP */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Nama Lengkap & Gelar <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Christian Pangemanan, S.ST"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    NIP Pegawai (18 Digit) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 198503202008011003"
                    value={formData.nip}
                    onChange={e => setFormData(prev => ({ ...prev, nip: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Email Resmi Pegawai <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="nama.pegawai@bps.go.id"
                    value={formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Nomor WhatsApp / HP
                  </label>
                  <input
                    type="tel"
                    placeholder="0812-XXXX-XXXX"
                    value={formData.phone}
                    onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Kata Sandi Login {formMode === 'create' && <span className="text-rose-400">*</span>}
                </label>
                <input
                  type="password"
                  required={formMode === 'create'}
                  minLength={12}
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={formMode === 'create' ? 'Minimal 12 karakter' : 'Kosongkan jika tidak diubah'}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Kata sandi disimpan dalam bentuk hash di server, tidak ditampilkan di daftar pengguna.
                </p>
              </div>

              {/* Unit Kerja */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Unit Kerja / Satuan Fungsi BPS
                </label>
                <div className="space-y-1.5">
                  <select
                    value={formData.unitKerja}
                    onChange={e => setFormData(prev => ({ ...prev, unitKerja: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    {UNIT_KERJA_PRESETS.map((unit, idx) => (
                      <option key={idx} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Role Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    Hak Akses / Peran Pengguna (Role RBAC) <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFormModalOpen(false);
                      handleOpenAddRole();
                    }}
                    className="text-[11px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Buat Role Baru</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                  {roles.map(r => {
                    const theme = getRoleTheme(r.name);
                    const isSelected = formData.role === r.name;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, role: r.name }))}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? `${theme.badge} ring-2 ${theme.ring} shadow-md`
                            : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-xs text-white flex items-center gap-1.5">
                            <span>{r.name}</span>
                            <span className="font-mono text-[9px] opacity-70">[{r.code}]</span>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                          {r.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Keaktifan */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-white">Status Akun Aktif</div>
                  <p className="text-[11px] text-slate-400">
                    Jika dinonaktifkan, pegawai tidak dapat login ke sistem SIMAN.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.statusAktif}
                    onChange={e => setFormData(prev => ({ ...prev, statusAktif: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingUser ? 'Menyimpan...' : formMode === 'create' ? 'Simpan Pengguna' : 'Perbarui Pengguna'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: TAMBAH / EDIT ROLE RBAC ===================== */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {roleModalMode === 'create' ? 'Buat Role Pengguna Baru' : `Edit Konfigurasi Role: ${selectedRoleForEdit?.name}`}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Tentukan nama peran, kode singkatan, warna tema, dan centang hak akses modul secara granular.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRoleModalOpen(false)}
                className="text-slate-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {roleFormError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{roleFormError}</span>
              </div>
            )}

            {/* Quick Templates Selector */}
            <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Gunakan Template Cepat Izin:
                </span>
                <span className="text-slate-500 text-[10px]">Klik untuk mengisi otomatis izin</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {ROLE_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyRoleTemplate(tmpl)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left transition-colors text-[11px]"
                  >
                    <div className="font-bold text-white truncate">{tmpl.name}</div>
                    <div className="text-[10px] text-slate-400 truncate font-mono">[{tmpl.code}]</div>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleRoleFormSubmit} className="space-y-4">
              {/* Role Name & Code */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Nama Role / Jabatan <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Auditor Internal / Bendahara"
                    value={roleFormData.name}
                    onChange={e => setRoleFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Kode Singkatan (Uppercase) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: AUDITOR, BENDAHARA, STAFF"
                    value={roleFormData.code}
                    onChange={e => setRoleFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Color Theme Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Tema Warna Badge
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.values(COLOR_PRESETS).map(color => {
                    const isSelected = roleFormData.color === color.id;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => setRoleFormData(prev => ({ ...prev, color: color.id }))}
                        className={`p-2 rounded-xl border flex items-center gap-2 transition-all ${
                          isSelected
                            ? `${color.badge} ring-2 ${color.ring}`
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${color.gradient} shrink-0`} />
                        <span className="text-[11px] font-semibold truncate">{color.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Role Description */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Deskripsi Tanggung Jawab & Wewenang
                </label>
                <textarea
                  rows={2}
                  placeholder="Jelaskan peran tugas dan tanggung jawab pemegang role ini..."
                  value={roleFormData.description}
                  onChange={e => setRoleFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Granular Permissions Matrix Checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-300">
                    Konfigurasi Hak Akses Modul ({Object.values(roleFormData.permissions).filter(Boolean).length} / {PERMISSION_CONFIG_LIST.length} Aktif)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allTrue = PERMISSION_CONFIG_LIST.reduce((acc, curr) => ({ ...acc, [curr.key]: true }), {} as RolePermissions);
                        setRoleFormData(prev => ({ ...prev, permissions: allTrue }));
                      }}
                      className="text-[11px] font-bold text-blue-400 hover:underline"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allFalse = PERMISSION_CONFIG_LIST.reduce((acc, curr) => ({ ...acc, [curr.key]: false }), {} as RolePermissions);
                        setRoleFormData(prev => ({ ...prev, permissions: allFalse }));
                      }}
                      className="text-[11px] font-bold text-slate-400 hover:underline"
                    >
                      Hapus Semua
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1 border border-slate-800 rounded-2xl p-3 bg-slate-950/50">
                  {['BMN & Aset', 'Persediaan ATK', 'Layanan', 'Sistem & RBAC'].map(cat => {
                    const catPerms = PERMISSION_CONFIG_LIST.filter(p => p.category === cat);
                    return (
                      <div key={cat} className="space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400/90 px-1">
                          Modul {cat}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {catPerms.map(p => {
                            const isChecked = Boolean(roleFormData.permissions[p.key]);
                            return (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() => handleTogglePermission(p.key)}
                                className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                                  isChecked
                                    ? 'bg-purple-950/20 border-purple-500/40 text-purple-200'
                                    : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded-md mt-0.5 flex items-center justify-center shrink-0 border ${
                                  isChecked
                                    ? 'bg-purple-600 border-purple-500 text-white'
                                    : 'border-slate-700 bg-slate-800'
                                }`}>
                                  {isChecked && <Check className="w-3 h-3" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-white truncate">{p.label}</div>
                                  <div className="text-[10px] text-slate-400 line-clamp-1">{p.desc}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{roleModalMode === 'create' ? 'Buat Role Baru' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: KONFIRMASI HAPUS PENGGUNA ===================== */}
      {isDeleteModalOpen && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Konfirmasi Hapus Pengguna</h3>
                <p className="text-xs text-slate-400">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3">
              {userToDelete.avatar ? (
                <img
                  src={userToDelete.avatar}
                  alt={userToDelete.name}
                  className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shrink-0">
                  {userToDelete.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{userToDelete.name}</div>
                <div className="text-[11px] font-mono text-slate-400">NIP: {userToDelete.nip}</div>
                <div className="text-[10px] text-blue-400 mt-0.5">{userToDelete.role} • {userToDelete.unitKerja}</div>
              </div>
            </div>

            {currentUser?.id === userToDelete.id ? (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Tidak Dapat Menghapus Akun Aktif!</div>
                  <p className="text-[11px] text-amber-400/90 mt-0.5">
                    Akun ini sedang Anda gunakan untuk login saat ini. Anda tidak dapat menghapus akun Anda sendiri.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-300 leading-relaxed">
                Apakah Anda yakin ingin menghapus akun <span className="font-bold text-white">"{userToDelete.name}"</span>? Akun ini akan dicabut hak aksesnya dan tercatat di audit log.
              </p>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setUserToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmDeleteUser}
                disabled={currentUser?.id === userToDelete.id}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  currentUser?.id === userToDelete.id
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                }`}
              >
                Hapus Akun Pengguna
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: KONFIRMASI HAPUS ROLE ===================== */}
      {isDeleteRoleModalOpen && roleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Konfirmasi Hapus Role</h3>
                <p className="text-xs text-slate-400">Pencabutan definisi peran dari sistem RBAC.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>{roleToDelete.name}</span>
                <span className="font-mono text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                  [{roleToDelete.code}]
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{roleToDelete.description}</p>
            </div>

            {users.some(u => u.role.toLowerCase() === roleToDelete.name.toLowerCase()) ? (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Role Masih Digunakan Pegawai!</div>
                  <p className="text-[11px] text-amber-400/90 mt-0.5">
                    Terdapat {users.filter(u => u.role.toLowerCase() === roleToDelete.name.toLowerCase()).length} pegawai yang saat ini memegang role ini. Harap ubah role pegawai tersebut sebelum menghapus role ini.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-300 leading-relaxed">
                Apakah Anda yakin ingin menghapus role <span className="font-bold text-white">"{roleToDelete.name}"</span>? Role ini tidak akan tersedia lagi pada pemilihan peran pengguna.
              </p>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setIsDeleteRoleModalOpen(false);
                  setRoleToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmDeleteRole}
                disabled={users.some(u => u.role.toLowerCase() === roleToDelete.name.toLowerCase())}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  users.some(u => u.role.toLowerCase() === roleToDelete.name.toLowerCase())
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                }`}
              >
                Hapus Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
