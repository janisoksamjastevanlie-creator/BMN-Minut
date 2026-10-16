import assert from 'node:assert/strict';
import test from 'node:test';
import { getPathForView, getViewForPath, VIEW_PATHS } from '../src/utils/viewRoutes.ts';

test('dashboard and every listed sidebar page have a distinct stable URL', () => {
  const requiredRoutes = {
    dashboard: '/dashboard',
    assets: '/aset-bmn',
    rooms: '/manajemen-ruangan',
    'office-3d': '/asset-mapping-3d',
    movements: '/pemindahan-aset',
    maintenance: '/pemeliharaan-aset',
    disposal: '/penghapusan-bmn',
    inventory: '/master-persediaan',
    'warehouse-3d': '/gudang-3d',
    requests: '/permohonan-barang-atk',
    'stock-opname': '/stock-opname',
    documents: '/dokumen-bast',
    reports: '/laporan-resmi-bps',
    'audit-trail': '/audit-trail',
    users: '/manajemen-pengguna',
    settings: '/pengaturan-sistem',
    login: '/login'
  };

  for (const [view, path] of Object.entries(requiredRoutes)) {
    assert.equal(getPathForView(view), path);
    assert.equal(getViewForPath(path), view);
  }
  assert.equal(new Set(Object.values(VIEW_PATHS)).size, Object.keys(VIEW_PATHS).length);
});

test('landing page, additional existing views, and unknown paths resolve correctly', () => {
  assert.equal(getViewForPath('/'), 'landing');
  assert.equal(getViewForPath('/dashboard-pimpinan'), 'executive');
  assert.equal(getViewForPath('/kartu-stok'), 'stock-card');
  assert.equal(getViewForPath('/manajemen-ruangan/'), 'rooms');
  assert.equal(getViewForPath('/halaman-tidak-ada'), 'not-found');
});
