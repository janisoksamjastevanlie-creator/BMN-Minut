import type { ActiveView } from '../context/AppContext';

export const VIEW_PATHS: Record<ActiveView, string> = {
  landing: '/',
  login: '/login',
  dashboard: '/dashboard',
  executive: '/dashboard-pimpinan',
  assets: '/aset-bmn',
  rooms: '/manajemen-ruangan',
  'office-3d': '/asset-mapping-3d',
  movements: '/pemindahan-aset',
  maintenance: '/pemeliharaan-aset',
  disposal: '/penghapusan-bmn',
  inventory: '/master-persediaan',
  'warehouse-3d': '/gudang-3d',
  requests: '/permohonan-barang-atk',
  'stock-card': '/kartu-stok',
  'stock-opname': '/stock-opname',
  documents: '/dokumen-bast',
  reports: '/laporan-resmi-bps',
  'audit-trail': '/audit-trail',
  users: '/manajemen-pengguna',
  settings: '/pengaturan-sistem',
  'not-found': '/404'
};

const VIEWS_BY_PATH = new Map(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view as ActiveView])
);

export const getViewForPath = (pathname: string): ActiveView => {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.replace(/\/+$/, '');
  }
  return VIEWS_BY_PATH.get(pathname) || 'not-found';
};

export const getPathForView = (view: ActiveView): string => VIEW_PATHS[view];
