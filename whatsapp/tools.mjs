// Satu-satunya jalur data untuk chatbot. Setiap tool memeriksa izin pengguna dan
// hanya membaca koleksi aplikasi; tidak ada SQL dinamis dan tidak ada penulisan data.

const CONDITIONS = ['Baik', 'Rusak Ringan', 'Rusak Berat'];
const ASSET_STATUSES = ['Aktif', 'Dalam Pemeliharaan', 'Dalam Proses Pemindahan', 'Diusulkan Hapus', 'Dihapuskan'];
const MAX_RESULTS = 5;

const DENIED = Object.freeze({ denied: true });

export function createTools({ getCollection, userHasPermission }) {
  const can = (user, ...permissions) => permissions.some(permission => userHasPermission(user, permission));
  const list = key => (Array.isArray(getCollection(key)) ? getCollection(key) : []);
  const canViewAssets = user => can(user, 'viewAssets', 'manageAssets');
  const canViewInventory = user => can(user, 'viewInventory', 'manageInventory');
  const countBy = (items, field) => items.reduce((result, item) => {
    result[item[field]] = (result[item[field]] || 0) + 1;
    return result;
  }, {});
  const toPublicAsset = asset => ({
    nama: asset.namaBarang,
    kodeBarang: asset.kodeBarang,
    nup: asset.nup,
    merkType: asset.merkType,
    lokasi: [asset.ruanganNama, asset.gedung].filter(Boolean).join(' - '),
    kondisi: asset.kondisi,
    status: asset.status
  });
  const activeAssets = () => list('assets').filter(asset => asset.status !== 'Dihapuskan');

  function matchAsset(asset, filter) {
    if (filter.nup !== undefined && Number(asset.nup) !== filter.nup) return false;
    if (filter.kodeBarang && !String(asset.kodeBarang || '').includes(filter.kodeBarang)) return false;
    if (filter.kondisi && asset.kondisi !== filter.kondisi) return false;
    if (filter.status && asset.status !== filter.status) return false;
    if (filter.lokasi) {
      const place = `${asset.ruanganNama || ''} ${asset.gedung || ''}`.toLocaleLowerCase('id-ID');
      if (!filter.lokasi.toLocaleLowerCase('id-ID').split(/\s+/).every(token => place.includes(token))) return false;
    }
    if (filter.merk && !String(asset.merkType || '').toLocaleLowerCase('id-ID').includes(filter.merk.toLocaleLowerCase('id-ID'))) return false;
    if (filter.nama) {
      const haystack = `${asset.namaBarang || ''} ${asset.merkType || ''} ${asset.kategori || ''} ${asset.subkategori || ''}`.toLocaleLowerCase('id-ID');
      if (!filter.nama.toLocaleLowerCase('id-ID').split(/\s+/).every(token => haystack.includes(token))) return false;
    }
    return true;
  }

  return {
    constants: { CONDITIONS, ASSET_STATUSES },

    getDashboard(user) {
      if (!can(user, 'viewDashboard')) return DENIED;
      const assets = activeAssets();
      const byCondition = countBy(assets, 'kondisi');
      const inventory = list('inventoryItems');
      return {
        totalAset: assets.length,
        baik: byCondition['Baik'] || 0,
        rusakRingan: byCondition['Rusak Ringan'] || 0,
        rusakBerat: byCondition['Rusak Berat'] || 0,
        persediaanMenipis: canViewInventory(user) ? inventory.filter(item => item.status === 'Menipis').length : null,
        persediaanHabis: canViewInventory(user) ? inventory.filter(item => item.status === 'Habis').length : null
      };
    },

    getAssetCount(user, filter = {}) {
      if (!canViewAssets(user)) return DENIED;
      const kondisi = filter.kondisi === 'Rusak' ? null : filter.kondisi;
      const matches = activeAssets().filter(asset => matchAsset(asset, { ...filter, kondisi }));
      const result = filter.kondisi === 'Rusak'
        ? matches.filter(asset => asset.kondisi !== 'Baik')
        : matches;
      return { count: result.length, filter };
    },

    searchAsset(user, filter = {}) {
      if (!canViewAssets(user)) return DENIED;
      const matches = list('assets').filter(asset => matchAsset(asset, filter));
      return { total: matches.length, items: matches.slice(0, MAX_RESULTS).map(toPublicAsset) };
    },

    getAssetByNup(user, nup, kodeBarang) {
      if (!Number.isInteger(nup)) return { total: 0, items: [] };
      return this.searchAsset(user, { nup, kodeBarang });
    },

    getAssetStatus(user) {
      if (!canViewAssets(user)) return DENIED;
      const assets = list('assets');
      return { byStatus: countBy(assets, 'status'), total: assets.length };
    },

    getMutationStatus(user) {
      if (!can(user, 'manageMovements')) return DENIED;
      const movements = list('movements');
      const open = movements.filter(item => !['Selesai', 'Ditolak'].includes(item.status));
      return {
        byStatus: countBy(movements, 'status'),
        open: open.slice(-MAX_RESULTS).reverse().map(item => ({
          nomor: item.nomorTransaksi,
          aset: item.assetName,
          dari: item.lokasiAsalNama,
          ke: item.lokasiTujuanNama,
          status: item.status
        }))
      };
    },

    getInventoryStatus(user) {
      if (!canViewInventory(user)) return DENIED;
      const inventory = list('inventoryItems');
      const low = inventory.filter(item => item.status === 'Menipis' || item.status === 'Habis');
      return {
        totalJenis: inventory.length,
        menipis: low.filter(item => item.status === 'Menipis').length,
        habis: low.filter(item => item.status === 'Habis').length,
        items: low.slice(0, MAX_RESULTS).map(item => ({ nama: item.nama, stok: item.stokSaatIni, satuan: item.satuan, status: item.status }))
      };
    },

    getReportStatus(user) {
      if (!can(user, 'viewReports')) return DENIED;
      const countOpen = (key, closed) => list(key).filter(item => !closed.includes(item.status)).length;
      return {
        mutasiBerjalan: countOpen('movements', ['Selesai', 'Ditolak']),
        pemeliharaanBerjalan: countOpen('maintenances', ['Selesai', 'Dibatalkan']),
        penghapusanBerjalan: countOpen('disposals', ['Selesai', 'Ditolak', 'Draft']),
        stockOpnameBerjalan: countOpen('opnames', ['Selesai']),
        dokumenTotal: list('documents').length
      };
    },

    // Daftar pekerjaan yang membutuhkan tindakan, dibatasi izin masing-masing pengguna.
    getPendingActions(user) {
      const items = [];
      const add = (label, count) => { if (count > 0) items.push({ label, count }); };
      if (can(user, 'manageAssets')) {
        add('aset berkondisi Rusak Berat yang perlu diperiksa', activeAssets().filter(asset => asset.kondisi === 'Rusak Berat').length);
      }
      if (can(user, 'manageMovements')) {
        add('mutasi aset yang menunggu proses', list('movements').filter(item => ['Pengajuan', 'Verifikasi', 'Persetujuan', 'Pemindahan'].includes(item.status)).length);
      }
      if (can(user, 'manageMaintenance')) {
        add('pemeliharaan aset yang belum selesai', list('maintenances').filter(item => ['Terjadwal', 'Dalam Proses'].includes(item.status)).length);
      }
      if (can(user, 'manageDisposal')) {
        add('usulan penghapusan yang menunggu proses', list('disposals').filter(item => ['Pengajuan', 'Verifikasi', 'Persetujuan'].includes(item.status)).length);
      }
      if (can(user, 'approveRequests')) {
        add('permohonan barang yang menunggu tindakan', list('requests').filter(item => ['Diajukan', 'Diverifikasi', 'Disetujui'].includes(item.status)).length);
      }
      if (can(user, 'manageInventory')) {
        add('persediaan menipis atau habis', list('inventoryItems').filter(item => item.status === 'Menipis' || item.status === 'Habis').length);
      }
      return { items };
    },

    getAccount(user) {
      return { nama: user.name, nip: user.nip, role: user.role, unitKerja: user.unitKerja };
    }
  };
}
