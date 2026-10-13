import crypto from 'node:crypto';

const COLLECTIONS = [
  'rooms', 'assets', 'inventoryItems', 'stockInList', 'stockOutList', 'requests',
  'opnames', 'stockCardLedger', 'movements', 'maintenances', 'disposals', 'documents',
  'auditLogs', 'notifications', 'users', 'roles'
];

const PERMISSION_KEYS = [
  'viewDashboard', 'viewAssets', 'manageAssets', 'manageMovements',
  'manageMaintenance', 'manageDisposal', 'viewInventory', 'manageInventory',
  'requestSupplies', 'approveRequests', 'stockOpname', 'roomBooking',
  'viewReports', 'manageUsers', 'manageRoles', 'systemSettings'
];

const REQUIRED_COLUMNS = {
  app_meta: ['key', 'value'],
  auth_users: ['id', 'nip', 'profile_json', 'salt', 'password_hash', 'created_at'],
  sessions: ['token_hash', 'user_id', 'expires_at'],
  buildings: ['id', 'code', 'name', 'floors', 'address'],
  rooms: ['id', 'building_id', 'code', 'name', 'floor', 'pic_name', 'pic_nip', 'color_hex', 'pos_x', 'pos_y', 'pos_z', 'description', 'app_metadata_json'],
  asset_categories: ['id', 'name', 'golongan_bmn', 'masa_manfaat_tahun'],
  bmn_assets: ['id', 'kode_barang', 'nup', 'nama_barang', 'kategori_id', 'subkategori', 'merk_type', 'nomor_seri', 'tanggal_perolehan', 'tahun_perolehan', 'jumlah', 'satuan', 'nilai_perolehan', 'akumulasi_penyusutan', 'nilai_buku', 'kondisi', 'gedung_id', 'ruangan_id', 'penanggung_jawab', 'status', 'foto_url', 'barcode', 'qr_code_payload', 'keterangan'],
  inventory_categories: ['id', 'name', 'jenis'],
  inventory_locations: ['id', 'gudang_name', 'rak_code', 'shelf', 'bin_code', 'description'],
  inventory_items: ['id', 'kode_barang', 'nama', 'kategori_id', 'subkategori', 'jenis', 'satuan', 'stok_awal', 'stok_saat_ini', 'stok_minimum', 'stok_maksimum', 'harga_satuan', 'total_nilai', 'lokasi_id', 'barcode', 'rata_rata_bulanan', 'foto_url'],
  stock_in: ['id', 'nomor_transaksi', 'tanggal', 'nomor_dokumen', 'sumber', 'petugas', 'keterangan', 'total_nilai', 'dokumen_url', 'app_metadata_json'],
  stock_in_items: ['id', 'stock_in_id', 'item_id', 'jumlah', 'harga_satuan', 'total_harga', 'lokasi_rak'],
  stock_out: ['id', 'nomor_transaksi', 'tanggal', 'unit_kerja', 'ruangan', 'pemohon', 'petugas', 'keperluan', 'app_metadata_json'],
  stock_out_items: ['id', 'stock_out_id', 'item_id', 'jumlah', 'satuan'],
  inventory_requests: ['id', 'nomor_permintaan', 'tanggal', 'pemohon_nama', 'unit_kerja', 'ruangan', 'item_id', 'jumlah_diminta', 'jumlah_disetujui', 'satuan', 'keperluan', 'prioritas', 'status', 'catatan'],
  inventory_request_items: ['id', 'request_id', 'item_id', 'nama_barang', 'kode_barang', 'jumlah_diminta', 'jumlah_disetujui', 'satuan', 'spesifikasi', 'catatan'],
  stock_opnames: ['id', 'nomor_opname', 'tanggal', 'periode', 'petugas', 'status', 'catatan'],
  stock_opname_items: ['id', 'opname_id', 'item_id', 'stok_sistem', 'stok_fisik', 'selisih', 'kondisi', 'keterangan', 'status_penyesuaian'],
  stock_card_ledger: ['id', 'item_id', 'tanggal', 'nomor_transaksi', 'tipe_transaksi', 'masuk', 'keluar', 'saldo', 'keterangan', 'petugas'],
  asset_movements: ['id', 'nomor_transaksi', 'asset_id', 'ruangan_asal_id', 'ruangan_tujuan_id', 'tanggal', 'alasan', 'pemohon', 'penanggung_jawab', 'status', 'catatan', 'created_at', 'updated_at'],
  asset_maintenance: ['id', 'nomor_tiket', 'asset_id', 'jenis_pemeliharaan', 'tanggal_mulai', 'tanggal_selesai', 'teknisi', 'vendor', 'biaya', 'keterangan', 'status', 'created_at'],
  asset_disposals: ['id', 'nomor_pengajuan', 'asset_id', 'alasan', 'kondisi_terakhir', 'nilai_buku', 'dokumen_pendukung', 'status', 'tanggal_pengajuan', 'penyetuju', 'created_at'],
  documents: ['id', 'nomor_dokumen', 'judul', 'jenis', 'tanggal', 'tahun', 'file_size', 'uploader', 'status', 'tags_json', 'storage_backend', 'storage_key', 'storage_size_bytes', 'sha256', 'file_name', 'mime_type', 'uploaded_at', 'description', 'idempotency_key'],
  document_files: ['document_id', 'file_name', 'mime_type', 'file_size_bytes', 'sha256', 'file_data'],
  audit_logs: ['id', 'user_id', 'user_name', 'user_role', 'aktivitas', 'modul', 'tanggal', 'waktu', 'ip_address', 'detail'],
  notifications: ['id', 'type', 'title', 'message', 'read', 'link', 'created_at'],
  roles: ['id', 'name', 'description', 'app_metadata_json'],
  users: ['id', 'nip', 'name', 'email', 'phone', 'role_id', 'unit_kerja', 'avatar_url', 'is_active'],
  whatsapp_accounts: ['user_id', 'phone', 'linked_at', 'notify_enabled'],
  whatsapp_link_tokens: ['token_hash', 'user_id', 'expires_at', 'used_at'],
  whatsapp_messages: ['id', 'message_id', 'phone_number', 'user_id', 'direction', 'message', 'intent', 'status', 'created_at'],
  whatsapp_processed_messages: ['message_id', 'received_at'],
  whatsapp_sessions: ['phone_hash', 'state', 'context_json', 'expires_at'],
  whatsapp_notifications: ['event_key', 'user_id', 'status', 'error', 'created_at'],
  whatsapp_notification_events: ['event_id', 'request_id', 'request_status', 'action', 'status', 'created_at'],
  whatsapp_notification_recipients: ['event_id', 'recipient_hash', 'status', 'error'],
  whatsapp_request_owners: ['request_id', 'user_id']
};

const REQUIRED_PRIMARY_KEYS = [
  ['app_meta', ['key']],
  ['auth_users', ['id']],
  ['sessions', ['token_hash']],
  ['buildings', ['id']],
  ['rooms', ['id']],
  ['asset_categories', ['id']],
  ['bmn_assets', ['id']],
  ['inventory_categories', ['id']],
  ['inventory_locations', ['id']],
  ['inventory_items', ['id']],
  ['stock_in', ['id']],
  ['stock_in_items', ['id']],
  ['stock_out', ['id']],
  ['stock_out_items', ['id']],
  ['inventory_requests', ['id']],
  ['inventory_request_items', ['id']],
  ['stock_opnames', ['id']],
  ['stock_opname_items', ['id']],
  ['stock_card_ledger', ['id']],
  ['asset_movements', ['id']],
  ['asset_maintenance', ['id']],
  ['asset_disposals', ['id']],
  ['documents', ['id']],
  ['document_files', ['document_id']],
  ['audit_logs', ['id']],
  ['notifications', ['id']],
  ['roles', ['id']],
  ['users', ['id']],
  ['whatsapp_notification_events', ['event_id']],
  ['whatsapp_notification_recipients', ['event_id', 'recipient_hash']],
  ['whatsapp_request_owners', ['request_id']],
  ['whatsapp_accounts', ['user_id']],
  ['whatsapp_link_tokens', ['token_hash']],
  ['whatsapp_messages', ['id']],
  ['whatsapp_processed_messages', ['message_id']],
  ['whatsapp_sessions', ['phone_hash']],
  ['whatsapp_notifications', ['event_key', 'user_id']]
];

const REQUIRED_FOREIGN_KEYS = [
  ['rooms', 'building_id', 'buildings', 'id'],
  ['bmn_assets', 'kategori_id', 'asset_categories', 'id'],
  ['bmn_assets', 'gedung_id', 'buildings', 'id'],
  ['bmn_assets', 'ruangan_id', 'rooms', 'id'],
  ['inventory_items', 'kategori_id', 'inventory_categories', 'id'],
  ['inventory_items', 'lokasi_id', 'inventory_locations', 'id'],
  ['stock_in_items', 'stock_in_id', 'stock_in', 'id'],
  ['stock_in_items', 'item_id', 'inventory_items', 'id'],
  ['stock_out_items', 'stock_out_id', 'stock_out', 'id'],
  ['stock_out_items', 'item_id', 'inventory_items', 'id'],
  ['inventory_requests', 'item_id', 'inventory_items', 'id'],
  ['inventory_request_items', 'request_id', 'inventory_requests', 'id'],
  ['inventory_request_items', 'item_id', 'inventory_items', 'id'],
  ['stock_opname_items', 'opname_id', 'stock_opnames', 'id'],
  ['stock_opname_items', 'item_id', 'inventory_items', 'id'],
  ['stock_card_ledger', 'item_id', 'inventory_items', 'id'],
  ['asset_movements', 'asset_id', 'bmn_assets', 'id'],
  ['asset_movements', 'ruangan_asal_id', 'rooms', 'id'],
  ['asset_movements', 'ruangan_tujuan_id', 'rooms', 'id'],
  ['asset_maintenance', 'asset_id', 'bmn_assets', 'id'],
  ['asset_disposals', 'asset_id', 'bmn_assets', 'id'],
  ['audit_logs', 'user_id', 'users', 'id'],
  ['users', 'role_id', 'roles', 'id'],
  ['document_files', 'document_id', 'documents', 'id'],
  ['whatsapp_notification_recipients', 'event_id', 'whatsapp_notification_events', 'event_id'],
  ['whatsapp_request_owners', 'user_id', 'users', 'id'],
  ['whatsapp_accounts', 'user_id', 'users', 'id'],
  ['whatsapp_link_tokens', 'user_id', 'users', 'id'],
  ['whatsapp_notifications', 'user_id', 'users', 'id'],
  ['auth_users', 'id', 'users', 'id'],
  ['sessions', 'user_id', 'auth_users', 'id']
];

async function queryRows(executor, sql, params = []) {
  const [rows] = await executor.execute(sql, params);
  return rows;
}

async function execute(executor, sql, params = []) {
  const [result] = await executor.execute(sql, params);
  return result;
}

function parseJson(value, label, fallback = {}) {
  if (value == null || value === '') return fallback;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected an object');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON metadata for ${label}: ${error instanceof Error ? error.message : error}`);
  }
}

function dateValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? '' : String(value).slice(0, 10);
}

function timestampValue(value) {
  if (value instanceof Date) return value.toISOString();
  return value == null ? '' : String(value);
}

function numericValue(value) {
  return value == null ? 0 : Number(value);
}

function defaultRole(name, id, description, createdAt, metadata) {
  const permissions = metadata.permissions && typeof metadata.permissions === 'object' &&
    !Array.isArray(metadata.permissions) ? metadata.permissions : {};
  return {
    id,
    name,
    code: typeof metadata.code === 'string' && metadata.code ? metadata.code : id,
    description: description || '',
    color: typeof metadata.color === 'string' && metadata.color ? metadata.color : 'slate',
    badgeClass: typeof metadata.badgeClass === 'string' ? metadata.badgeClass : '',
    isSystem: metadata.isSystem === true,
    permissions: Object.fromEntries(PERMISSION_KEYS.map(key => [key, permissions[key] === true])),
    createdAt: typeof metadata.createdAt === 'string' && metadata.createdAt
      ? metadata.createdAt
      : timestampValue(createdAt)
  };
}

function normalizeRequestItems(request, details) {
  if (details.length > 0) {
    return details.map(detail => ({
      itemId: detail.item_id,
      namaBarang: detail.nama_barang,
      kodeBarang: detail.kode_barang || undefined,
      jumlahDiminta: numericValue(detail.jumlah_diminta),
      jumlahDisetujui: detail.jumlah_disetujui == null ? undefined : numericValue(detail.jumlah_disetujui),
      satuan: detail.satuan,
      spesifikasi: detail.spesifikasi || undefined,
      catatan: detail.catatan || undefined
    }));
  }
  if (!request.item_id) return [];
  return [{
    itemId: request.item_id,
    namaBarang: request.item_name || '',
    jumlahDiminta: numericValue(request.jumlah_diminta),
    jumlahDisetujui: request.jumlah_disetujui == null ? undefined : numericValue(request.jumlah_disetujui),
    satuan: request.satuan || ''
  }];
}

function dataUrlFromFile(file) {
  if (!file) return undefined;
  const data = Buffer.isBuffer(file.file_data) ? file.file_data : Buffer.from(file.file_data || '');
  const digest = crypto.createHash('sha256').update(data).digest('hex');
  if (digest !== file.sha256) throw new Error(`Document file integrity check failed for ${file.document_id}.`);
  return `data:${file.mime_type};base64,${data.toString('base64')}`;
}

export async function assertOperationalSchema(executor) {
  const rows = await queryRows(executor, `
    SELECT table_name, column_name, column_key
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
  `);
  const columns = new Map();
  const primaryKeys = new Map();
  for (const row of rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name).add(row.column_name);
    if (row.column_key === 'PRI') {
      if (!primaryKeys.has(row.table_name)) primaryKeys.set(row.table_name, new Set());
      primaryKeys.get(row.table_name).add(row.column_name);
    }
  }
  const missing = [];
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const present = columns.get(table);
    if (!present) {
      missing.push(`${table} (table)`);
      continue;
    }
    for (const column of required) {
      if (!present.has(column)) missing.push(`${table}.${column}`);
    }
  }
  if (missing.length) {
    throw new Error(`Operational schema is incomplete; missing: ${missing.join(', ')}`);
  }

  const missingKeys = [];
  for (const [table, required] of REQUIRED_PRIMARY_KEYS) {
    const present = primaryKeys.get(table) || new Set();
    if (required.some(column => !present.has(column)) || present.size !== required.length) {
      missingKeys.push(`${table} primary key (${required.join(', ')})`);
    }
  }
  const foreignKeyRows = await queryRows(executor, `
    SELECT table_name, column_name, referenced_table_name, referenced_column_name
    FROM information_schema.key_column_usage
    WHERE constraint_schema = DATABASE()
      AND referenced_table_name IS NOT NULL
  `);
  const foreignKeys = new Set(foreignKeyRows.map(row =>
    `${row.table_name}.${row.column_name}->${row.referenced_table_name}.${row.referenced_column_name}`
  ));
  for (const [table, column, referencedTable, referencedColumn] of REQUIRED_FOREIGN_KEYS) {
    const key = `${table}.${column}->${referencedTable}.${referencedColumn}`;
    if (!foreignKeys.has(key)) missingKeys.push(`${table}.${column} foreign key to ${referencedTable}.${referencedColumn}`);
  }
  if (missingKeys.length) {
    throw new Error(`Operational schema relationships are incomplete; missing: ${missingKeys.join(', ')}`);
  }
}

export async function readOperationalState(executor) {
  const state = Object.fromEntries(COLLECTIONS.map(key => [key, []]));

  const locationRows = await queryRows(executor, `
    SELECT gudang_name, rak_code, shelf
    FROM inventory_locations
    WHERE rak_code IS NOT NULL AND rak_code <> ''
    ORDER BY gudang_name, rak_code, shelf
  `);
  const rackGroups = new Map();
  for (const row of locationRows) {
    const key = String(row.rak_code).trim();
    if (!rackGroups.has(key)) rackGroups.set(key, { warehouses: new Set(), shelves: new Set() });
    const rack = rackGroups.get(key);
    if (row.gudang_name) rack.warehouses.add(row.gudang_name);
    if (row.shelf) rack.shelves.add(row.shelf);
  }
  state.warehouseRacks = [...rackGroups.entries()].map(([code, rack], index) => ({
    id: `location-rack-${index + 1}`,
    code,
    name: rack.warehouses.size ? `${code} (${[...rack.warehouses].join(', ')})` : code,
    category: 'Lokasi persediaan',
    color: '#3b82f6',
    position3D: [((index % 3) - 1) * 4, 0, Math.floor(index / 3) * 3],
    shelvesCount: Math.max(1, rack.shelves.size)
  }));

  const roomRows = await queryRows(executor, `
    SELECT r.*, b.name AS building_name
    FROM rooms r LEFT JOIN buildings b ON b.id = r.building_id
    ORDER BY r.id
  `);
  state.rooms = roomRows.map(row => {
    const metadata = parseJson(row.app_metadata_json, `rooms:${row.id}`);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      floor: numericValue(row.floor),
      building: row.building_name || '',
      picName: row.pic_name || '',
      picNip: row.pic_nip || '',
      color: row.color_hex || '#64748b',
      position3D: [numericValue(row.pos_x), numericValue(row.pos_y), numericValue(row.pos_z)],
      size3D: metadata.size3D || [3, 2, 3],
      description: row.description || '',
      roomType: metadata.roomType,
      capacity: metadata.capacity,
      areaSqm: metadata.areaSqm
    };
  });

  const assetRows = await queryRows(executor, `
    SELECT a.*, c.name AS category_name, b.name AS building_name, r.name AS room_name
    FROM bmn_assets a
    LEFT JOIN asset_categories c ON c.id = a.kategori_id
    LEFT JOIN buildings b ON b.id = a.gedung_id
    LEFT JOIN rooms r ON r.id = a.ruangan_id
    ORDER BY a.id
  `);
  state.assets = assetRows.map(row => ({
    id: row.id,
    kodeBarang: row.kode_barang,
    nup: numericValue(row.nup),
    namaBarang: row.nama_barang,
    kategori: row.category_name || '',
    subkategori: row.subkategori || undefined,
    merkType: row.merk_type || '',
    nomorSeri: row.nomor_seri || '',
    tanggalPerolehan: dateValue(row.tanggal_perolehan),
    tahunPerolehan: numericValue(row.tahun_perolehan),
    jumlah: numericValue(row.jumlah),
    satuan: row.satuan || '',
    nilaiPerolehan: numericValue(row.nilai_perolehan),
    akumulasiPenyusutan: numericValue(row.akumulasi_penyusutan),
    nilaiBuku: numericValue(row.nilai_buku),
    kondisi: row.kondisi,
    gedung: row.building_name || '',
    ruanganId: row.ruangan_id || '',
    ruanganNama: row.room_name || '',
    penanggungJawab: row.penanggung_jawab || '',
    status: row.status,
    fotoUrl: row.foto_url || undefined,
    keterangan: row.keterangan || undefined,
    qrCodeUrl: row.qr_code_payload || undefined,
    barcode: row.barcode || ''
  }));

  const itemRows = await queryRows(executor, `
    SELECT i.*, c.name AS category_name, l.gudang_name, l.rak_code, l.shelf, l.bin_code
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON c.id = i.kategori_id
    LEFT JOIN inventory_locations l ON l.id = i.lokasi_id
    ORDER BY i.id
  `);
  state.inventoryItems = itemRows.map(row => {
    const current = numericValue(row.stok_saat_ini);
    const minimum = numericValue(row.stok_minimum);
    return {
      id: row.id,
      kodeBarang: row.kode_barang,
      nama: row.nama,
      kategori: row.category_name || '',
      subkategori: row.subkategori || '',
      jenis: row.jenis,
      satuan: row.satuan || '',
      stokAwal: numericValue(row.stok_awal),
      stokSaatIni: current,
      stokMinimum: minimum,
      stokMaksimum: numericValue(row.stok_maksimum),
      hargaSatuan: numericValue(row.harga_satuan),
      totalNilai: numericValue(row.total_nilai),
      lokasiGudang: row.gudang_name || '',
      rak: row.rak_code || '',
      shelf: row.shelf || '',
      binCode: row.bin_code || '',
      barcode: row.barcode || '',
      status: current <= 0 ? 'Habis' : current <= minimum ? 'Menipis' : 'Aman',
      ratarataPenggunaanBulanan: numericValue(row.rata_rata_bulanan),
      fotoUrl: row.foto_url || undefined
    };
  });

  const stockInRows = await queryRows(executor, `
    SELECT h.*, d.id AS detail_id, d.item_id, d.jumlah, d.harga_satuan,
      d.total_harga, d.lokasi_rak, i.nama AS item_name, i.jenis, i.satuan
    FROM stock_in h
    JOIN stock_in_items d ON d.stock_in_id = h.id
    LEFT JOIN inventory_items i ON i.id = d.item_id
    ORDER BY h.tanggal, h.id, d.id
  `);
  state.stockInList = stockInRows.map(row => {
    const metadata = parseJson(row.app_metadata_json, `stock_in:${row.id}`);
    return {
      id: row.detail_id,
      headerId: row.id,
      nomorTransaksi: row.nomor_transaksi,
      tanggal: dateValue(row.tanggal),
      nomorDokumen: row.nomor_dokumen,
      sumber: row.sumber,
      itemId: row.item_id,
      namaBarang: row.item_name || '',
      kategori: '',
      jenis: row.jenis || '',
      jumlah: numericValue(row.jumlah),
      satuan: row.satuan || '',
      hargaSatuan: numericValue(row.harga_satuan),
      totalHarga: numericValue(row.total_harga),
      lokasiRak: row.lokasi_rak || '',
      petugas: row.petugas || '',
      keterangan: row.keterangan || '',
      dokumenUrl: row.dokumen_url || undefined,
      status: metadata.status,
      pemeriksaan: metadata.pemeriksaan,
      diverifikasiOleh: metadata.diverifikasiOleh,
      diverifikasiPada: metadata.diverifikasiPada
    };
  });

  const stockOutRows = await queryRows(executor, `
    SELECT h.*, d.id AS detail_id, d.item_id, d.jumlah, d.satuan,
      i.nama AS item_name, i.jenis
    FROM stock_out h
    JOIN stock_out_items d ON d.stock_out_id = h.id
    LEFT JOIN inventory_items i ON i.id = d.item_id
    ORDER BY h.tanggal, h.id, d.id
  `);
  state.stockOutList = stockOutRows.map(row => {
    const metadata = parseJson(row.app_metadata_json, `stock_out:${row.id}`);
    return {
      id: row.detail_id,
      headerId: row.id,
      nomorTransaksi: row.nomor_transaksi,
      tanggal: dateValue(row.tanggal),
      unitKerja: row.unit_kerja,
      ruangan: row.ruangan,
      pemohon: row.pemohon,
      itemId: row.item_id,
      namaBarang: row.item_name || '',
      jenis: row.jenis || '',
      jumlah: numericValue(row.jumlah),
      satuan: row.satuan || '',
      keperluan: row.keperluan || '',
      petugas: row.petugas || '',
      keterangan: metadata.keterangan
    };
  });

  const requests = await queryRows(executor, 'SELECT * FROM inventory_requests ORDER BY tanggal, id');
  const requestItems = await queryRows(executor, 'SELECT * FROM inventory_request_items ORDER BY request_id, id');
  const requestItemsById = new Map();
  for (const item of requestItems) {
    if (!requestItemsById.has(item.request_id)) requestItemsById.set(item.request_id, []);
    requestItemsById.get(item.request_id).push(item);
  }
  const inventoryById = new Map(state.inventoryItems.map(item => [item.id, item]));
  state.requests = requests.map(row => {
    const items = normalizeRequestItems({
      ...row,
      item_name: inventoryById.get(row.item_id)?.nama || ''
    }, requestItemsById.get(row.id) || []);
    const first = items[0] || {};
    return {
      id: row.id,
      nomorPermintaan: row.nomor_permintaan,
      tanggal: dateValue(row.tanggal),
      pemohonNama: row.pemohon_nama,
      unitKerja: row.unit_kerja,
      ruangan: row.ruangan,
      itemId: first.itemId || row.item_id || '',
      namaBarang: first.namaBarang || '',
      jumlahDiminta: first.jumlahDiminta ?? numericValue(row.jumlah_diminta),
      jumlahDisetujui: first.jumlahDisetujui ?? (row.jumlah_disetujui == null ? undefined : numericValue(row.jumlah_disetujui)),
      satuan: first.satuan || row.satuan || '',
      keperluan: row.keperluan,
      prioritas: row.prioritas || 'Normal',
      catatan: row.catatan || undefined,
      items,
      status: row.status || 'Diajukan'
    };
  });

  const opnameRows = await queryRows(executor, 'SELECT * FROM stock_opnames ORDER BY tanggal, id');
  const opnameItems = await queryRows(executor, `
    SELECT d.*, i.kode_barang, i.nama, i.satuan
    FROM stock_opname_items d LEFT JOIN inventory_items i ON i.id = d.item_id
    ORDER BY d.opname_id, d.id
  `);
  const opnameItemsById = new Map();
  for (const item of opnameItems) {
    if (!opnameItemsById.has(item.opname_id)) opnameItemsById.set(item.opname_id, []);
    opnameItemsById.get(item.opname_id).push(item);
  }
  state.opnames = opnameRows.map(row => ({
    id: row.id,
    nomorOpname: row.nomor_opname,
    tanggal: dateValue(row.tanggal),
    periode: row.periode,
    petugas: row.petugas,
    status: row.status,
    catatan: row.catatan || undefined,
    items: (opnameItemsById.get(row.id) || []).map(item => ({
      id: item.id,
      itemId: item.item_id,
      kodeBarang: item.kode_barang || '',
      namaBarang: item.nama || '',
      satuan: item.satuan || '',
      stokSistem: numericValue(item.stok_sistem),
      stokFisik: numericValue(item.stok_fisik),
      selisih: numericValue(item.selisih),
      kondisi: item.kondisi,
      keterangan: item.keterangan || '',
      statusPenyesuaian: item.status_penyesuaian || undefined
    }))
  }));

  const movementRows = await queryRows(executor, `
    SELECT m.*, a.nama_barang, a.kode_barang, a.nup,
      origin.name AS origin_name, destination.name AS destination_name
    FROM asset_movements m
    LEFT JOIN bmn_assets a ON a.id = m.asset_id
    LEFT JOIN rooms origin ON origin.id = m.ruangan_asal_id
    LEFT JOIN rooms destination ON destination.id = m.ruangan_tujuan_id
    ORDER BY m.tanggal, m.id
  `);
  state.movements = movementRows.map(row => ({
    id: row.id,
    nomorTransaksi: row.nomor_transaksi,
    assetId: row.asset_id,
    assetName: row.nama_barang || '',
    kodeBarang: row.kode_barang || '',
    nup: numericValue(row.nup),
    lokasiAsalId: row.ruangan_asal_id || '',
    lokasiAsalNama: row.origin_name || '',
    lokasiTujuanId: row.ruangan_tujuan_id || '',
    lokasiTujuanNama: row.destination_name || '',
    tanggal: dateValue(row.tanggal),
    alasan: row.alasan,
    pemohon: row.pemohon,
    penanggungJawab: row.penanggung_jawab,
    status: row.status,
    catatan: row.catatan || undefined,
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at)
  }));

  const ledgerRows = await queryRows(executor, `
    SELECT id, item_id, tanggal, nomor_transaksi, tipe_transaksi, masuk, keluar,
      saldo, keterangan, petugas
    FROM stock_card_ledger
    ORDER BY tanggal, id
  `);
  const ledgerTypes = new Set(['SALDO_AWAL', 'MASUK', 'KELUAR', 'PENYESUAIAN_OPNAME']);
  state.stockCardLedger = ledgerRows.map(row => {
    if (!ledgerTypes.has(row.tipe_transaksi)) {
      throw new Error(`Unsupported stock ledger transaction type for ${row.id}.`);
    }
    return {
      id: row.id,
      itemId: row.item_id || '',
      tanggal: dateValue(row.tanggal),
      nomorTransaksi: row.nomor_transaksi,
      jenisTransaksi: row.tipe_transaksi,
      masuk: numericValue(row.masuk),
      keluar: numericValue(row.keluar),
      saldo: numericValue(row.saldo),
      keterangan: row.keterangan || '',
      petugas: row.petugas || ''
    };
  });

  const maintenanceRows = await queryRows(executor, `
    SELECT m.*, a.nama_barang, a.kode_barang, a.nup, r.name AS room_name
    FROM asset_maintenance m
    LEFT JOIN bmn_assets a ON a.id = m.asset_id
    LEFT JOIN rooms r ON r.id = a.ruangan_id
    ORDER BY m.tanggal_mulai, m.id
  `);
  state.maintenances = maintenanceRows.map(row => ({
    id: row.id,
    nomorTiket: row.nomor_tiket,
    assetId: row.asset_id,
    assetName: row.nama_barang || '',
    kodeBarang: row.kode_barang || '',
    nup: numericValue(row.nup),
    jenisPemeliharaan: row.jenis_pemeliharaan,
    tanggalMulai: dateValue(row.tanggal_mulai),
    tanggalSelesai: row.tanggal_selesai ? dateValue(row.tanggal_selesai) : undefined,
    teknisi: row.teknisi || '',
    vendor: row.vendor || '',
    biaya: numericValue(row.biaya),
    keterangan: row.keterangan || '',
    status: row.status,
    ruanganNama: row.room_name || ''
  }));

  const disposalRows = await queryRows(executor, `
    SELECT d.*, a.nama_barang, a.kode_barang, a.nup
    FROM asset_disposals d LEFT JOIN bmn_assets a ON a.id = d.asset_id
    ORDER BY d.tanggal_pengajuan, d.id
  `);
  state.disposals = disposalRows.map(row => ({
    id: row.id,
    nomorPengajuan: row.nomor_pengajuan,
    assetId: row.asset_id || '',
    assetName: row.nama_barang || '',
    kodeBarang: row.kode_barang || '',
    nup: numericValue(row.nup),
    alasan: row.alasan,
    kondisiTerakhir: row.kondisi_terakhir,
    nilaiBuku: numericValue(row.nilai_buku),
    dokumenPendukung: row.dokumen_pendukung || undefined,
    status: row.status,
    tanggalPengajuan: dateValue(row.tanggal_pengajuan),
    penyetuju: row.penyetuju || undefined
  }));

  const [documentRows, documentFiles, receiptItemRows] = await Promise.all([
    queryRows(executor, 'SELECT * FROM documents ORDER BY tanggal DESC, id'),
    queryRows(executor, `SELECT f.* FROM document_files f
      JOIN documents d ON d.id = f.document_id
      WHERE d.storage_backend IS NULL OR d.storage_backend <> 'hostinger'`),
    queryRows(executor, 'SELECT * FROM document_receipt_items ORDER BY document_id, created_at, id').catch(() => [])
  ]);
  const documentFileById = new Map(documentFiles.map(file => [file.document_id, file]));
  const receiptItemsByDocId = new Map();
  for (const item of receiptItemRows) {
    if (!receiptItemsByDocId.has(item.document_id)) receiptItemsByDocId.set(item.document_id, []);
    receiptItemsByDocId.get(item.document_id).push({
      id: item.id,
      itemId: item.item_id || undefined,
      namaBarang: item.nama_barang,
      kategori: item.kategori,
      satuan: item.satuan,
      jumlah: numericValue(item.jumlah),
      hargaSatuan: numericValue(item.harga_satuan),
      totalHarga: numericValue(item.total_harga),
      subtotal: numericValue(item.total_harga)
    });
  }
  state.documents = documentRows.map(row => {
    const file = documentFileById.get(row.id);
    const tags = row.tags_json == null ? [] : JSON.parse(row.tags_json);
    if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) {
      throw new Error(`Invalid document tags for ${row.id}.`);
    }
    const receiptItems = receiptItemsByDocId.get(row.id);
    return {
      id: row.id,
      nomorDokumen: row.nomor_dokumen,
      judul: row.judul,
      jenis: row.jenis,
      tanggal: dateValue(row.tanggal),
      tahun: numericValue(row.tahun),
      fileSize: row.file_size || '',
      uploader: row.uploader,
      tags,
      status: row.status,
      fileName: row.file_name || file?.file_name,
      fileType: row.mime_type || file?.mime_type,
      fileDataUrl: row.storage_backend === 'hostinger' ? undefined : dataUrlFromFile(file),
      description: row.description || undefined,
      storageBackend: row.storage_backend || undefined,
      storageKey: row.storage_key || undefined,
      storageSize: row.storage_size_bytes == null ? undefined : numericValue(row.storage_size_bytes),
      sha256: row.sha256 || undefined,
      uploadedAt: timestampValue(row.uploaded_at) || undefined,
      idempotencyKey: row.idempotency_key || undefined,
      namaToko: row.nama_toko || undefined,
      kategoriNota: row.kategori_nota || undefined,
      totalNilaiNota: row.total_nilai_nota == null ? undefined : numericValue(row.total_nilai_nota),
      items: receiptItems && receiptItems.length > 0 ? receiptItems : undefined
    };
  });

  const auditRows = await queryRows(executor, 'SELECT * FROM audit_logs ORDER BY tanggal, waktu, id');
  state.auditLogs = auditRows.map(row => ({
    id: row.id,
    userId: row.user_id || '',
    userName: row.user_name,
    userRole: row.user_role,
    aktivitas: row.aktivitas,
    modul: row.modul,
    tanggal: dateValue(row.tanggal),
    waktu: String(row.waktu || ''),
    ipAddress: row.ip_address || '',
    detail: row.detail || ''
  }));

  const notificationRows = await queryRows(executor, 'SELECT * FROM notifications ORDER BY created_at DESC, id');
  state.notifications = notificationRows.map(row => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    timestamp: timestampValue(row.created_at),
    read: Boolean(row.read),
    link: row.link || undefined
  }));

  const roleRows = await queryRows(executor, 'SELECT * FROM roles ORDER BY name, id');
  state.roles = roleRows.map(row => defaultRole(
    row.name,
    row.id,
    row.description,
    row.created_at,
    parseJson(row.app_metadata_json, `roles:${row.id}`)
  ));
  const roleNameById = new Map(roleRows.map(row => [row.id, row.name]));
  const userRows = await queryRows(executor, 'SELECT * FROM users ORDER BY name, id');
  state.users = userRows.map(row => {
    const role = roleNameById.get(row.role_id);
    if (!role) throw new Error(`User ${row.id} is linked to an unknown operational role.`);
    return {
      id: row.id,
      name: row.name,
      nip: row.nip,
      email: row.email,
      role,
      unitKerja: row.unit_kerja,
      avatar: row.avatar_url || undefined,
      phone: row.phone || undefined,
      statusAktif: Boolean(row.is_active)
    };
  });

  return state;
}

export async function findOperationalUserByEmail(executor, email) {
  const rows = await queryRows(executor, `
    SELECT u.id
    FROM users u
    WHERE LOWER(u.email) = LOWER(?) AND u.is_active = 1
    LIMIT 2
  `, [email]);
  if (rows.length > 1) throw new Error('Multiple active operational users share the same email address.');
  return rows[0] || null;
}

export { COLLECTIONS as OPERATIONAL_COLLECTIONS };
