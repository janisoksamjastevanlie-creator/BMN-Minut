// Satu-satunya jalur data untuk chatbot. Setiap tool memeriksa izin pengguna dan
// hanya membaca koleksi aplikasi; tidak ada SQL dinamis dan tidak ada penulisan data.

const CONDITIONS = ['Baik', 'Rusak Ringan', 'Rusak Berat'];
const ASSET_STATUSES = ['Aktif', 'Dalam Pemeliharaan', 'Dalam Proses Pemindahan', 'Diusulkan Hapus', 'Dihapuskan'];
const MAX_RESULTS = 5;
const MAINTENANCE_STATUSES = ['Terjadwal', 'Dalam Proses', 'Selesai', 'Ditunda', 'Dibatalkan'];
const INVENTORY_STATUSES = ['Aman', 'Menipis', 'Habis'];
const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];

const DENIED = Object.freeze({ denied: true });

export const normalizeQuery = value => String(value || '').toLocaleLowerCase('id-ID')
  .replace(/\bbrg\b/g, 'barang').replace(/\bbrp\b/g, 'berapa')
  .replace(/\b(?:stock|stokk)\b/g, 'stok').replace(/\s+/g, ' ').trim();

export function parseInventoryQuery(input) {
  const normalized = normalizeQuery(input);
  const filter = {};
  const statuses = INVENTORY_STATUSES.filter(value => new RegExp(`\\b${value}\\b`, 'i').test(normalized));
  if (statuses.length === 1) filter.statusPersediaan = statuses[0];
  else if (statuses.length > 1) filter.unsupported = true;
  if (/\b(?:belum|bukan|tidak|selain)\s+(?:aman|menipis|habis)\b/.test(normalized)) filter.unsupported = true;
  const name = normalized
    .replace(/\b(berapa|jumlah|cek|lihat|tampilkan|stok|stoknya|barang|persediaan|tersedia|yang|ada|dong|tolong|sisa|kalau|bagaimana|dengan|apa|saja|aman|menipis|habis)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
  if (name) filter.nama = name.slice(0, 60);
  return filter;
}

export function parseAssetQuery(input) {
  let rest = ` ${normalizeQuery(input)} `;
  const filter = {};
  const group = rest.match(/\b(?:berdasarkan|per)\s+(kategori|lokasi)\b/);
  if (group) { filter.kelompok = group[1]; rest = rest.replace(group[0], ' '); }
  const nup = rest.match(/\bnup\s*[:.]?\s*(\d{1,7})\b/);
  if (nup) { filter.nup = Number(nup[1]); rest = rest.replace(nup[0], ' '); }
  const code = rest.match(/\b\d+(?:\.\d+){2,}\b/);
  if (code) { filter.kodeBarang = code[0]; rest = rest.replace(code[0], ' '); }
  for (const [pattern, value] of [[/\brusak berat\b/, 'Rusak Berat'], [/\brusak ringan\b/, 'Rusak Ringan'], [/\bkondisi baik\b|\bbaik\b/, 'Baik'], [/\brusak\b/, 'Rusak']]) {
    if (pattern.test(rest)) { filter.kondisi = value; rest = rest.replace(pattern, ' '); break; }
  }
  const category = rest.match(/\bkategori\s+([a-z0-9 ]{2,60}?)(?=\s+(?:lokasi|ruang(?:an)?|di)\b|$)/);
  if (category) { filter.kategori = category[1].trim(); rest = rest.replace(category[0], ' '); }
  const location = rest.match(/\b(?:lokasi|ruang(?:an)?|di)\s+([a-z0-9 ]{2,40})$/);
  if (location) { filter.lokasi = location[1].trim(); rest = rest.replace(location[0], ' '); }
  const name = rest
    .replace(/\b(cari|carikan|tampilkan|lihat|bmn|aset|barang|data|tolong|dong|berapa|jumlah|total|yang|dengan|kondisi|status|kalau|bagaimana|apa|saja|tersedia)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (name) filter.nama = name.slice(0, 60);
  return filter;
}

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validDateRange(filter) {
  return filter.tanggalDari === undefined && filter.tanggalSampai === undefined ||
    validDate(filter.tanggalDari) && validDate(filter.tanggalSampai) && filter.tanggalDari <= filter.tanggalSampai;
}

const inDateRange = (value, filter) => filter.tanggalDari === undefined ||
  validDate(String(value || '').slice(0, 10)) &&
  String(value).slice(0, 10) >= filter.tanggalDari && String(value).slice(0, 10) <= filter.tanggalSampai;

export function parseDocumentQuery(question) {
  const input = String(question || '').trim().slice(0, 1200);
  const filter = {};
  const explicit = input.match(/\b(?:nomor|no)\b\.?\s*[:#]?\s*([\p{L}\p{N}./_-]+)/iu);
  const candidate = input.match(/\b(?=[\p{L}\p{N}./_-]*\d)[\p{L}\p{N}]+[-/][\p{L}\p{N}./_-]+\b/u)?.[0];
  const number = explicit?.[1] || (candidate && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(candidate) ? candidate : undefined);
  if (number) filter.nomor = number;
  if (/\b(?:belum|bukan|tidak|selain)\s+(?:status\s+)?(?:diajukan|diverifikasi|disetujui|diproses|selesai|ditolak)\b/i.test(input)) {
    return { ...filter, unsupported: true };
  }
  const statuses = ['Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Selesai', 'Ditolak']
    .filter(value => new RegExp(`\\b${value}\\b`, 'i').test(input));
  if (statuses.length === 1) filter.statusPermohonan = statuses[0];
  else if (statuses.length > 1) filter.unsupported = true;
  const incoming = /\bmasuk\b/i.test(input);
  const outgoing = /\bkeluar\b/i.test(input);
  if (incoming !== outgoing) filter.jenisTransaksi = incoming ? 'masuk' : 'keluar';
  const periodInput = input.replace(number || /$^/, ' ');
  const dates = periodInput.match(/\b\d{4}-\d{1,2}-\d{1,2}\b/g) || [];
  if (dates.length) {
    filter.tanggalDari = dates[0];
    filter.tanggalSampai = dates[1] || dates[0];
    if (dates.length > 2 || !validDateRange(filter)) filter.unsupported = true;
  } else {
    const months = [...periodInput.toLocaleLowerCase('id-ID').matchAll(new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{4})\\b`, 'g'))];
    const month = months[0];
    if (month) {
      const index = MONTHS.indexOf(month[1]);
      const year = Number(month[2]);
      filter.tanggalDari = `${month[2]}-${String(index + 1).padStart(2, '0')}-01`;
      filter.tanggalSampai = `${month[2]}-${String(index + 1).padStart(2, '0')}-${new Date(Date.UTC(year, index + 1, 0)).getUTCDate()}`;
      if (months.length > 1 || !validDateRange(filter)) filter.unsupported = true;
    } else if (/\b(?:tanggal|periode|bulan|tahun|hari ini|kemarin|minggu)\b/i.test(periodInput)) {
      filter.unsupported = true;
    }
  }
  if (/\b(?:sebelum|sesudah|setelah|sejak|kemarin|hari ini|bulan ini|minggu)\b/i.test(periodInput) ||
    dates.length === 1 && /\b(?:sampai|hingga)\b/i.test(periodInput)) filter.unsupported = true;
  if (/\bdibatalkan\b/i.test(input)) filter.unsupported = true;
  return filter;
}

export function parseMaintenanceQuery(question) {
  const input = String(question || '').trim().slice(0, 1200);
  const document = parseDocumentQuery(input.replace(/\bdibatalkan\b/gi, ' '));
  const filter = {};
  if (document.nomor) filter.nomor = document.nomor;
  const nup = input.match(/\bnup\s*[:.]?\s*(\d{1,7})\b/i);
  if (nup) filter.nup = Number(nup[1]);
  const statuses = MAINTENANCE_STATUSES.filter(value => new RegExp(`\\b${value}\\b`, 'i').test(input));
  if (statuses.length === 1) filter.statusPemeliharaan = statuses[0];
  else if (statuses.length > 1) filter.unsupported = true;
  if (document.unsupported || document.tanggalDari ||
    /\b(?:belum|bukan|tidak|selain)\s+(?:terjadwal|dalam proses|ditunda|dibatalkan)\b/i.test(input)) filter.unsupported = true;
  const name = input.replace(document.nomor || /$^/, ' ').replace(nup?.[0] || /$^/, ' ')
    .replace(/\b(?:status|tiket|nomor|no|cek|lihat|tampilkan|berapa|jumlah|pemeliharaan|perawatan|servis|aset|bmn|untuk|pada|yang|tolong|dong|terjadwal|dalam proses|selesai|ditunda|dibatalkan|kalau|bagaimana|dengan)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (name && !filter.unsupported) filter.nama = name.slice(0, 60);
  return filter;
}

const validNumberFilter = filter => filter.nomor === undefined ||
  (typeof filter.nomor === 'string' && /^[\p{L}\p{N}./_-]{1,60}$/u.test(filter.nomor));
const validTextFilters = (filter, keys) => keys.every(key => filter[key] === undefined ||
  typeof filter[key] === 'string' && Boolean(filter[key].trim()) && filter[key].length <= 60);
const validAssetFilter = filter => validTextFilters(filter, ['nama', 'lokasi', 'kategori', 'merk']) &&
  (filter.nup === undefined || Number.isInteger(filter.nup) && filter.nup > 0 && filter.nup < 10000000) &&
  (filter.kodeBarang === undefined || typeof filter.kodeBarang === 'string' && /^[\d.]{3,40}$/.test(filter.kodeBarang)) &&
  (filter.kondisi === undefined || [...CONDITIONS, 'Rusak'].includes(filter.kondisi)) &&
  (filter.status === undefined || ASSET_STATUSES.includes(filter.status)) &&
  (filter.kelompok === undefined || ['kategori', 'lokasi'].includes(filter.kelompok));

export function createTools({ getCollection, userHasPermission }) {
  const can = (user, ...permissions) => permissions.some(permission => userHasPermission(user, permission));
  const list = key => (Array.isArray(getCollection(key)) ? getCollection(key) : []);
  const canViewAssets = user => can(user, 'viewAssets', 'manageAssets');
  const canViewInventory = user => can(user, 'viewInventory', 'manageInventory', 'requestSupplies');
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
    if (filter.kondisi && (filter.kondisi === 'Rusak' ? asset.kondisi === 'Baik' : asset.kondisi !== filter.kondisi)) return false;
    if (filter.status && asset.status !== filter.status) return false;
    if (filter.kategori && !String(asset.kategori || '').toLocaleLowerCase('id-ID').includes(filter.kategori.toLocaleLowerCase('id-ID'))) return false;
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
    canReadAllRequests: user => can(user, 'approveRequests', 'manageInventory'),

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
      if (!canViewAssets(user) || !validAssetFilter(filter)) return DENIED;
      const kondisi = filter.kondisi === 'Rusak' ? null : filter.kondisi;
      const matches = activeAssets().filter(asset => matchAsset(asset, { ...filter, kondisi }));
      const result = filter.kondisi === 'Rusak'
        ? matches.filter(asset => asset.kondisi !== 'Baik')
        : matches;
      const groups = filter.kelompok === 'kategori' || filter.kelompok === 'lokasi'
        ? countBy(result.map(asset => ({
            kelompok: filter.kelompok === 'kategori' ? asset.kategori || 'Tidak tercatat'
              : [asset.ruanganNama, asset.gedung].filter(Boolean).join(' - ') || 'Tidak tercatat'
          })), 'kelompok')
        : null;
      return {
        count: result.length, filter,
        ...(groups ? { totalKelompok: Object.keys(groups).length, kelompok: Object.entries(groups).slice(0, MAX_RESULTS).map(([nama, count]) => ({ nama, count })) } : {})
      };
    },

    searchAsset(user, filter = {}) {
      if (!canViewAssets(user) || !validAssetFilter(filter)) return DENIED;
      const matches = list('assets').filter(asset => matchAsset(asset, filter));
      return { total: matches.length, items: matches.slice(0, MAX_RESULTS).map(toPublicAsset) };
    },

    getAssetByNup(user, nup, kodeBarang) {
      if (!Number.isInteger(nup)) return DENIED;
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

    getMaintenanceStatus(user, filter = {}) {
      if (!can(user, 'manageMaintenance')) return DENIED;
      if (filter.unsupported || filter.tanggalDari || filter.tanggalSampai) return { unavailable: 'Filter pengecualian status atau periode pemeliharaan belum didukung.' };
      if (!validNumberFilter(filter) ||
        (filter.statusPemeliharaan !== undefined && !MAINTENANCE_STATUSES.includes(filter.statusPemeliharaan)) ||
        (filter.nup !== undefined && (!Number.isInteger(filter.nup) || filter.nup <= 0 || filter.nup >= 10000000)) ||
        (filter.nama !== undefined && (typeof filter.nama !== 'string' || filter.nama.length > 60))) return DENIED;
      const name = String(filter.nama || '').trim().toLocaleLowerCase('id-ID');
      const rows = list('maintenances').filter(item =>
        (!filter.nomor || String(item.nomorTiket || '').toLocaleLowerCase('id-ID') === filter.nomor.toLocaleLowerCase('id-ID')) &&
        (filter.nup === undefined || Number(item.nup) === filter.nup) &&
        (!filter.statusPemeliharaan || item.status === filter.statusPemeliharaan) &&
        (!name || name.split(/\s+/).every(token => String(item.assetName || '').toLocaleLowerCase('id-ID').includes(token)))
      ).sort((a, b) => String(b.tanggalMulai || '').localeCompare(String(a.tanggalMulai || '')));
      return {
        total: rows.length,
        byStatus: countBy(rows, 'status'),
        items: rows.slice(0, MAX_RESULTS).map(item => ({
          nomor: item.nomorTiket,
          aset: item.assetName,
          nup: item.nup,
          jenis: item.jenisPemeliharaan,
          mulai: item.tanggalMulai,
          selesai: item.tanggalSelesai || null,
          status: item.status || 'Status tidak tercatat'
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

    searchInventory(user, filter = {}) {
      if (!canViewInventory(user)) return DENIED;
      if (!validTextFilters(filter, ['nama'])) return DENIED;
      if (filter.unsupported) return { unavailable: 'Filter pengecualian stok belum didukung. Gunakan status Aman, Menipis, atau Habis.' };
      if (filter.statusPersediaan !== undefined && !INVENTORY_STATUSES.includes(filter.statusPersediaan)) return DENIED;
      const query = String(filter.nama || '').toLocaleLowerCase('id-ID').trim();
      const matches = list('inventoryItems').filter(item => {
        if (filter.statusPersediaan && item.status !== filter.statusPersediaan) return false;
        if (!query) return Boolean(filter.statusPersediaan) || Number(item.stokSaatIni) > 0;
        return `${item.nama || ''} ${item.kodeBarang || ''}`.toLocaleLowerCase('id-ID')
          .split(/\s+/)
          .some(token => token.includes(query)) ||
          query.split(/\s+/).every(token =>
            `${item.nama || ''} ${item.kodeBarang || ''}`.toLocaleLowerCase('id-ID').includes(token)
          );
      });
      return {
        query,
        status: filter.statusPersediaan,
        total: matches.length,
        items: matches.slice(0, MAX_RESULTS).map(item => ({
          nama: item.nama,
          stok: item.stokSaatIni,
          satuan: item.satuan,
          status: item.status
        }))
      };
    },

    getMyRequests(user, requestIds, filter = {}, staff = false) {
      const canReadAll = can(user, 'approveRequests', 'manageInventory');
      if (staff ? !canReadAll : !can(user, 'requestSupplies')) return DENIED;
      if (filter.unsupported) return { unavailable: 'Filter status/periode ini belum didukung. Gunakan satu status tercatat dan tanggal YYYY-MM-DD atau bulan beserta tahun. Riwayat permohonan yang dibatalkan tidak tersedia melalui fungsi ini.' };
      if (!validNumberFilter(filter) || !validDateRange(filter) || (filter.statusPermohonan !== undefined &&
        !['Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Selesai', 'Ditolak'].includes(filter.statusPermohonan))) return DENIED;
      const ownedIds = new Set(Array.isArray(requestIds) ? requestIds : []);
      const nomor = typeof filter.nomor === 'string' ? filter.nomor.trim().toLocaleLowerCase('id-ID').slice(0, 60) : '';
      const status = ['Diajukan', 'Diverifikasi', 'Disetujui', 'Diproses', 'Selesai', 'Ditolak'].includes(filter.statusPermohonan)
        ? filter.statusPermohonan : null;
      const requests = list('requests')
        .filter(request => (staff || ownedIds.has(request.id)) &&
          (!nomor || String(request.nomorPermintaan || '').toLocaleLowerCase('id-ID') === nomor) &&
          (!status || request.status === status) && inDateRange(request.tanggal, filter))
        .sort((left, right) => String(right.tanggal || '').localeCompare(String(left.tanggal || '')));
      return {
        scope: staff ? 'petugas' : 'sendiri',
        periode: filter.tanggalDari ? `${filter.tanggalDari} s/d ${filter.tanggalSampai}` : null,
        total: requests.length,
        pending: requests.filter(request => !['Selesai', 'Ditolak'].includes(request.status)).length,
        items: requests.slice(0, MAX_RESULTS).map(request => ({
          nomor: request.nomorPermintaan,
          tanggal: request.tanggal,
          status: request.status,
          catatan: typeof request.catatan === 'string' ? request.catatan.trim().slice(0, 250) : undefined,
          barang: (Array.isArray(request.items) && request.items.length
            ? request.items
            : request.namaBarang
              ? [{
                  namaBarang: request.namaBarang,
                  jumlahDiminta: request.jumlahDiminta,
                  satuan: request.satuan
                }]
              : []
          ).slice(0, MAX_RESULTS).map(item => ({
            nama: item.namaBarang,
            jumlah: item.jumlahDiminta,
            disetujui: item.jumlahDisetujui,
            satuan: item.satuan
          })),
          jumlahBarangLain: Math.max(0, (Array.isArray(request.items) ? request.items.length : 0) - MAX_RESULTS),
          alasanPenolakan: request.status === 'Ditolak' && typeof request.catatan === 'string'
            ? request.catatan.trim().slice(0, 250) || undefined
            : undefined
        }))
      };
    },

    getInventoryTransactions(user, filter = {}) {
      if (!can(user, 'manageInventory', 'viewReports')) return DENIED;
      if (filter.unsupported || filter.statusPermohonan) return { unavailable: 'Filter transaksi ini belum didukung. Gunakan nomor dokumen, jenis masuk/keluar, dan tanggal YYYY-MM-DD atau bulan beserta tahun.' };
      if (!validNumberFilter(filter) || !validDateRange(filter)) return DENIED;
      const nomor = typeof filter.nomor === 'string' ? filter.nomor.trim().toLocaleLowerCase('id-ID').slice(0, 60) : '';
      const jenis = filter.jenisTransaksi;
      if (jenis !== undefined && !['masuk', 'keluar'].includes(jenis)) return DENIED;
      const rows = [
        ...(jenis === 'keluar' ? [] : list('stockInList').map(item => ({ item, jenis: 'masuk' }))),
        ...(jenis === 'masuk' ? [] : list('stockOutList').map(item => ({ item, jenis: 'keluar' })))
      ].filter(({ item }) => (!nomor || String(item.nomorTransaksi || '').toLocaleLowerCase('id-ID') === nomor) &&
          inDateRange(item.tanggal, filter))
        .sort((a, b) => String(b.item.tanggal || '').localeCompare(String(a.item.tanggal || '')));
      return {
        total: rows.length,
        totalDokumen: new Set(rows.map(({ item, jenis: tipe }) => `${tipe}:${item.headerId || item.nomorTransaksi || item.id}`)).size,
        periode: filter.tanggalDari ? `${filter.tanggalDari} s/d ${filter.tanggalSampai}` : null,
        items: rows.slice(0, MAX_RESULTS).map(({ item, jenis: tipe }) => ({
          nomor: item.nomorTransaksi,
          tanggal: item.tanggal,
          jenis: tipe,
          barang: item.namaBarang,
          jumlah: item.jumlah,
          satuan: item.satuan,
          status: item.status || 'Status tidak tercatat'
        }))
      };
    },

    searchUsers(user, filter = {}) {
      if (!can(user, 'manageUsers')) return DENIED;
      if (!validTextFilters(filter, ['nama', 'role'])) return DENIED;
      const matches = list('users').filter(item => item.statusAktif !== false &&
        (!filter.nama || String(item.name || '').toLocaleLowerCase('id-ID').includes(filter.nama.toLocaleLowerCase('id-ID'))) &&
        (!filter.role || String(item.role || '').toLocaleLowerCase('id-ID') === filter.role.toLocaleLowerCase('id-ID')));
      return {
        total: matches.length,
        items: matches.slice(0, MAX_RESULTS).map(item => ({ nama: item.name, role: item.role, unitKerja: item.unitKerja }))
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
