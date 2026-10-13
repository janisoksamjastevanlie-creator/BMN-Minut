import crypto from 'node:crypto';

const WRITABLE_COLLECTIONS = [
  'rooms', 'assets', 'inventoryItems', 'stockInList', 'stockOutList', 'requests',
  'opnames', 'movements', 'maintenances', 'disposals', 'documents', 'auditLogs',
  'notifications', 'users', 'roles'
];

function fail(message) {
  throw new Error(message);
}

function assertId(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 36) {
    fail(`${label} must be a non-empty ID of at most 36 characters.`);
  }
  return value;
}

function assertText(value, label, max, optional = false) {
  const text = value == null ? '' : String(value);
  if ((!optional && !text.trim()) || text.length > max) {
    fail(`${label} is required and must not exceed ${max} characters.`);
  }
  return text;
}

function assertNumber(value, label, integer = false, minimum = -Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number)) || number < minimum) {
    fail(`${label} is invalid.`);
  }
  return number;
}

function nullableText(value, label, max) {
  return value == null || value === '' ? null : assertText(value, label, max, true);
}

function validDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${label} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail(`${label} is not a valid date.`);
  }
  return value;
}

function optionalDate(value, label) {
  return value == null || value === '' ? null : validDate(value, label);
}

function validTime(value) {
  const match = /^(\d{1,2})[:.](\d{2})[:.](\d{2})/.exec(String(value || ''));
  if (!match) fail('Audit time must contain hours, minutes, and seconds.');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) fail('Audit time is invalid.');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function stable(value) {
  return JSON.stringify(value);
}

function assertCollection(rows, name) {
  if (!Array.isArray(rows)) fail(`Collection ${name} is invalid.`);
  const ids = new Set();
  for (const row of rows) {
    assertId(row?.id, `${name} ID`);
    if (ids.has(row.id)) fail(`Collection ${name} contains duplicate ID ${row.id}.`);
    ids.add(row.id);
  }
}

async function queryRows(executor, sql, params = []) {
  const [rows] = await executor.execute(sql, params);
  return rows;
}

async function execute(executor, sql, params = []) {
  const [result] = await executor.execute(sql, params);
  return result;
}

async function upsert(executor, table, columns, values) {
  const mutableColumns = columns.filter(column => column !== 'id');
  const assignments = mutableColumns.map(column => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  await execute(executor, `
    INSERT INTO \`${table}\` (${columns.map(column => `\`${column}\``).join(', ')})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${assignments}
  `, values);
}

async function syncSimple(executor, previousRows, nextRows, table, columns, mapRow) {
  const previousById = new Map(previousRows.map(row => [row.id, row]));
  const nextIds = new Set(nextRows.map(row => row.id));
  for (const row of nextRows) {
    const previous = previousById.get(row.id);
    const values = await mapRow(row, previous);
    if (!previous || stable(await mapRow(previous, previous)) !== stable(values)) {
      await upsert(executor, table, columns, values);
    }
  }
  return previousRows.filter(row => !nextIds.has(row.id)).map(row => row.id);
}

function referenceByName(rows, name, label) {
  const normalized = String(name || '').trim().toLocaleLowerCase();
  if (!normalized) return null;
  const matches = rows.filter(row => String(row.name || '').trim().toLocaleLowerCase() === normalized);
  if (matches.length !== 1) {
    fail(matches.length ? `${label} is ambiguous: ${name}.` : `${label} does not exist: ${name}.`);
  }
  return matches[0].id;
}

function referenceMap(rows, label) {
  const byName = new Map();
  for (const row of rows) {
    const key = String(row.name || '').trim().toLocaleLowerCase();
    if (!key) continue;
    if (byName.has(key)) byName.set(key, null);
    else byName.set(key, row.id);
  }
  return name => {
    const normalized = String(name || '').trim().toLocaleLowerCase();
    if (!normalized) return null;
    if (!byName.has(normalized)) fail(`${label} does not exist: ${name}.`);
    const id = byName.get(normalized);
    if (!id) fail(`${label} is ambiguous: ${name}.`);
    return id;
  };
}

function parseDataUrl(document) {
  if (!document.fileDataUrl) return null;
  const match = /^data:([A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(document.fileDataUrl);
  if (!match) fail(`Document ${document.id} has an invalid file data URL.`);
  const data = Buffer.from(match[2], 'base64');
  if (data.toString('base64') !== match[2] || data.length > 18 * 1024 * 1024) {
    fail(`Document ${document.id} file is invalid or exceeds the supported upload size.`);
  }
  const fileName = assertText(document.fileName, 'Document filename', 255);
  const mimeType = assertText(document.fileType || match[1], 'Document MIME type', 127);
  const allowedTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/jpeg',
    'image/png',
    'application/octet-stream'
  ]);
  const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.png', '.jpg', '.jpeg']);
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (!allowedTypes.has(mimeType.toLowerCase()) || !allowedExtensions.has(extension)) {
    fail(`Document ${document.id} has an unsupported file type.`);
  }
  return {
    fileName,
    mimeType,
    data,
    sha256: crypto.createHash('sha256').update(data).digest('hex')
  };
}

function groupsByHeader(rows) {
  const groups = new Map();
  for (const row of rows) {
    const headerId = assertId(row.headerId || row.id, 'Transaction header ID');
    if (!groups.has(headerId)) groups.set(headerId, []);
    groups.get(headerId).push(row);
  }
  return groups;
}

function uuidFromKey(value) {
  const bytes = crypto.createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function postedStockIn(row) {
  return row.status == null || row.status === '' || row.status === 'Diverifikasi';
}

function itemMap(rows) {
  return new Map(rows.map(row => [row.id, row]));
}

function collectLedgerEvents(previous, next, actor, revision) {
  const events = [];
  const add = (itemId, source, sourceId, date, delta, description, type) => {
    if (!delta) return;
    assertId(itemId, 'Stock ledger item ID');
    events.push({
      itemId,
      source,
      sourceId,
      date: validDate(date, 'Stock transaction date'),
      delta: assertNumber(delta, 'Stock transaction quantity', true),
      description: assertText(description, 'Stock transaction description', 255, true),
      type,
      staff: assertText(actor?.name || 'Operator', 'Stock transaction operator', 150, true)
    });
  };

  const beforeIn = new Map((previous.stockInList || []).map(row => [row.id, row]));
  const afterIn = new Map(next.stockInList.map(row => [row.id, row]));
  for (const id of new Set([...beforeIn.keys(), ...afterIn.keys()])) {
    const before = beforeIn.get(id);
    const after = afterIn.get(id);
    const oldQty = before && postedStockIn(before) ? assertNumber(before.jumlah, 'Stock-in quantity', true, 0) : 0;
    const newQty = after && postedStockIn(after) ? assertNumber(after.jumlah, 'Stock-in quantity', true, 0) : 0;
    const itemId = after?.itemId || before?.itemId;
    if (oldQty !== newQty || before?.itemId !== after?.itemId) {
      const isOrphanedHistorical = before && (before.status == null || before.status === '') &&
        !next.inventoryItems.some(item => item.id === before.itemId);
      if (before && oldQty && !isOrphanedHistorical) {
        add(before.itemId, 'stock-in', id, before.tanggal, -oldQty, `Pembalikan penerimaan ${before.nomorTransaksi}.`, 'KELUAR');
      }
      if (after && newQty) add(after.itemId, 'stock-in', id, after.tanggal, newQty, `Penerimaan ${after.nomorTransaksi}.`, 'MASUK');
    }
  }

  const beforeOut = new Map((previous.stockOutList || []).map(row => [row.id, row]));
  const afterOut = new Map(next.stockOutList.map(row => [row.id, row]));
  for (const id of new Set([...beforeOut.keys(), ...afterOut.keys()])) {
    const before = beforeOut.get(id);
    const after = afterOut.get(id);
    if (before && after && before.itemId === after.itemId && Number(before.jumlah) === Number(after.jumlah)) continue;
    if (before) add(before.itemId, 'stock-out', id, before.tanggal, assertNumber(before.jumlah, 'Stock-out quantity', true, 0), `Pembalikan pengeluaran ${before.nomorTransaksi}.`, 'MASUK');
    if (after) add(after.itemId, 'stock-out', id, after.tanggal, -assertNumber(after.jumlah, 'Stock-out quantity', true, 0), `Pengeluaran ${after.nomorTransaksi}.`, 'KELUAR');
  }

  const approvedAdjustments = state => {
    const map = new Map();
    for (const opname of state.opnames || []) {
      if (opname.status !== 'Selesai') continue;
      for (const item of opname.items || []) {
        if (item.statusPenyesuaian !== 'Disesuaikan') continue;
        map.set(item.id, {
          opname,
          item,
          effect: assertNumber(item.stokFisik, 'Physical stock', true, 0) -
            assertNumber(item.stokSistem, 'System stock', true, 0)
        });
      }
    }
    return map;
  };
  const beforeAdjustments = approvedAdjustments(previous);
  const afterAdjustments = approvedAdjustments(next);
  for (const id of new Set([...beforeAdjustments.keys(), ...afterAdjustments.keys()])) {
    const before = beforeAdjustments.get(id);
    const after = afterAdjustments.get(id);
    const oldEffect = before?.effect || 0;
    const newEffect = after?.effect || 0;
    if (oldEffect !== newEffect || before?.item.itemId !== after?.item.itemId) {
      if (before && oldEffect) {
        add(before.item.itemId, 'opname', id, before.opname.tanggal, -oldEffect,
          `Pembalikan penyesuaian ${before.opname.nomorOpname}.`, 'PENYESUAIAN_OPNAME');
      }
      if (after && newEffect) {
        add(after.item.itemId, 'opname', id, after.opname.tanggal, newEffect,
          `Penyesuaian ${after.opname.nomorOpname}.`, 'PENYESUAIAN_OPNAME');
      }
    }
  }

  const beforeItems = itemMap(previous.inventoryItems || []);
  const afterItems = itemMap(next.inventoryItems);
  for (const [id, item] of afterItems) {
    if (!beforeItems.has(id)) {
      const opening = assertNumber(item.stokAwal || 0, 'Opening stock', true, 0);
      if (opening) {
        add(id, 'opening', id, new Date().toISOString().slice(0, 10), opening,
          'Saldo awal master persediaan.', 'SALDO_AWAL');
      }
    }
  }

  const beforeLogs = new Set((previous.auditLogs || []).map(log => log.id));
  const adjustmentLog = next.auditLogs.find(log =>
    !beforeLogs.has(log.id) &&
    ['Import File Persediaan', 'Restore / Import Backup Sistem', 'Penyesuaian Stok Master'].includes(log.aktivitas)
  );
  const eventDeltas = new Map();
  for (const event of events) eventDeltas.set(event.itemId, (eventDeltas.get(event.itemId) || 0) + event.delta);

  for (const [id, item] of afterItems) {
    const oldStock = beforeItems.has(id)
      ? assertNumber(beforeItems.get(id).stokSaatIni, 'Previous stock', true, 0)
      : 0;
    const newStock = assertNumber(item.stokSaatIni, 'Current stock', true, 0);
    const balanceDelta = newStock - oldStock;
    const unexplained = balanceDelta - (eventDeltas.get(id) || 0);
    if (!unexplained) continue;
    if (!adjustmentLog) {
      fail(`Stock balance for item ${id} changed without a stock transaction or an audited import/adjustment.`);
    }
    add(id, 'manual-adjustment', adjustmentLog.id, adjustmentLog.tanggal, unexplained,
      `${adjustmentLog.aktivitas}: ${adjustmentLog.detail || ''}`, 'PENYESUAIAN_OPNAME');
    eventDeltas.set(id, (eventDeltas.get(id) || 0) + unexplained);
  }

  for (const [id, item] of beforeItems) {
    if (!afterItems.has(id) && assertNumber(item.stokSaatIni, 'Previous stock', true, 0) > 0) {
      const newItem = next.inventoryItems.find(candidate => candidate.id === id);
      if (newItem) fail(`Stock item ${id} could not be removed safely.`);
    }
  }

  const byItem = new Map();
  for (const event of events) {
    if (!byItem.has(event.itemId)) byItem.set(event.itemId, []);
    byItem.get(event.itemId).push(event);
  }
  return { events, byItem, revision };
}

async function writeLedgerEvents(executor, ledgerChanges, previous, next) {
  if (!ledgerChanges.events.length) return;
  const beforeItems = itemMap(previous.inventoryItems || []);
  const afterItems = itemMap(next.inventoryItems);

  for (const [itemId, events] of ledgerChanges.byItem) {
    const existing = await queryRows(executor, `
      SELECT id, tanggal, masuk, keluar, saldo
      FROM stock_card_ledger
      WHERE item_id = ?
      ORDER BY tanggal, id
      FOR UPDATE
    `, [itemId]);
    const previousBalance = beforeItems.has(itemId)
      ? assertNumber(beforeItems.get(itemId).stokSaatIni, 'Previous stock', true, 0)
      : 0;
    let baseline = previousBalance;
    if (existing.length) {
      baseline = Number(existing[0].saldo) - Number(existing[0].masuk) + Number(existing[0].keluar);
      let prior = baseline;
      for (const row of existing) {
        const expected = prior + Number(row.masuk) - Number(row.keluar);
        if (expected !== Number(row.saldo)) {
          fail(`Stock ledger integrity check failed for item ${itemId}.`);
        }
        prior = expected;
      }
      if (prior !== previousBalance) {
        fail(`Stock ledger ending balance does not match inventory stock for item ${itemId}.`);
      }
    }

    for (const [index, event] of events.entries()) {
      const id = uuidFromKey(`${itemId}:${event.source}:${event.sourceId}:${event.date}:${event.delta}:${ledgerChanges.revision}:${index}`);
      const incoming = Math.max(event.delta, 0);
      const outgoing = Math.max(-event.delta, 0);
      await upsert(executor, 'stock_card_ledger',
        ['id', 'item_id', 'tanggal', 'nomor_transaksi', 'tipe_transaksi', 'masuk', 'keluar', 'saldo', 'keterangan', 'petugas'],
        [id, itemId, event.date, assertText(String(event.sourceId), 'Ledger transaction number', 50),
          event.type, incoming, outgoing, 0, event.description, event.staff]);
    }

    const rows = await queryRows(executor, `
      SELECT id, masuk, keluar, saldo
      FROM stock_card_ledger
      WHERE item_id = ?
      ORDER BY tanggal, id
      FOR UPDATE
    `, [itemId]);
    let balance = baseline;
    for (const row of rows) {
      balance += Number(row.masuk) - Number(row.keluar);
      if (!Number.isSafeInteger(balance)) fail(`Stock ledger balance overflow for item ${itemId}.`);
      if (balance !== Number(row.saldo)) {
        await execute(executor, 'UPDATE stock_card_ledger SET saldo = ? WHERE id = ?', [balance, row.id]);
      }
    }
    const expectedEnding = afterItems.get(itemId)?.stokSaatIni;
    if (expectedEnding == null || balance !== Number(expectedEnding)) {
      fail(`Stock ledger balance does not match the saved inventory quantity for item ${itemId}.`);
    }
  }
}

export async function writeOperationalState(executor, previous, next, actor = {}, revision = 0) {
  for (const key of WRITABLE_COLLECTIONS) assertCollection(next?.[key], key);
  if (next.stockCardLedger !== undefined &&
      stable(next.stockCardLedger) !== stable(previous.stockCardLedger || [])) {
    fail('The stock ledger is read-only and cannot be changed by the client.');
  }
  const previousAuditLogs = previous.auditLogs || [];
  const previousAuditById = new Map(previousAuditLogs.map(row => [row.id, row]));
  const nextAuditById = new Map(next.auditLogs.map(row => [row.id, row]));
  for (const row of previousAuditLogs) {
    const nextRow = nextAuditById.get(row.id);
    if (!nextRow) fail(`Audit log ${row.id} cannot be deleted.`);
    if (stable(nextRow) !== stable(row)) fail(`Audit log ${row.id} cannot be changed.`);
  }
  const trustedAuditLogs = next.auditLogs.map(row => previousAuditById.has(row.id)
    ? previousAuditById.get(row.id)
    : {
        ...row,
        userId: actor.id || '',
        userName: actor.name || 'System',
        userRole: actor.role || 'System',
        ipAddress: actor.ipAddress || ''
      });

  const ledgerChanges = collectLedgerEvents(previous, next, actor, revision);
  const [buildings, rooms, assetCategories, inventoryCategories, locations] = await Promise.all([
    queryRows(executor, 'SELECT id, name FROM buildings'),
    queryRows(executor, 'SELECT id, name FROM rooms'),
    queryRows(executor, 'SELECT id, name FROM asset_categories'),
    queryRows(executor, 'SELECT id, name FROM inventory_categories'),
    queryRows(executor, 'SELECT id, gudang_name, rak_code, shelf, bin_code FROM inventory_locations')
  ]);
  const buildingId = referenceMap(buildings, 'Building');
  const assetCategoryId = referenceMap(assetCategories, 'Asset category');
  const inventoryCategoryId = referenceMap(inventoryCategories, 'Inventory category');
  const roleId = referenceMap(next.roles.map(role => ({ id: role.id, name: role.name })), 'Role');
  const roomIdById = new Map([...rooms, ...next.rooms].map(room => [room.id, room.id]));
  const locationId = item => {
    const locationData = [item.lokasiGudang, item.rak, item.shelf, item.binCode];
    if (locationData.every(value => !String(value || '').trim())) return null;
    const matches = locations.filter(location =>
      String(location.gudang_name || '').trim().toLowerCase() === String(item.lokasiGudang || '').trim().toLowerCase() &&
      String(location.rak_code || '').trim().toLowerCase() === String(item.rak || '').trim().toLowerCase() &&
      String(location.shelf || '').trim().toLowerCase() === String(item.shelf || '').trim().toLowerCase() &&
      String(location.bin_code || '').trim().toLowerCase() === String(item.binCode || '').trim().toLowerCase()
    );
    if (matches.length !== 1) fail(`Inventory location does not exist or is ambiguous for item ${item.id}.`);
    return matches[0].id;
  };
  const deletions = {};

  deletions.roles = await syncSimple(executor, previous.roles || [], next.roles, 'roles',
    ['id', 'name', 'description', 'app_metadata_json'], row => [
      assertId(row.id, 'Role ID'),
      assertText(row.name, 'Role name', 100),
      nullableText(row.description, 'Role description', 65_535),
      json({
        code: row.code,
        color: row.color,
        badgeClass: row.badgeClass,
        isSystem: row.isSystem === true,
        permissions: row.permissions,
        createdAt: row.createdAt
      })
    ]);

  deletions.rooms = await syncSimple(executor, previous.rooms || [], next.rooms, 'rooms',
    ['id', 'building_id', 'code', 'name', 'floor', 'pic_name', 'pic_nip', 'color_hex', 'pos_x', 'pos_y', 'pos_z', 'description', 'app_metadata_json'],
    row => [
      assertId(row.id, 'Room ID'),
      buildingId(row.building),
      assertText(row.code, 'Room code', 50),
      assertText(row.name, 'Room name', 100),
      assertNumber(row.floor, 'Room floor', true, 0),
      nullableText(row.picName, 'Room PIC name', 150),
      nullableText(row.picNip, 'Room PIC NIP', 30),
      assertText(row.color || '#64748b', 'Room color', 20),
      assertNumber(row.position3D?.[0] ?? 0, 'Room X position'),
      assertNumber(row.position3D?.[1] ?? 0, 'Room Y position'),
      assertNumber(row.position3D?.[2] ?? 0, 'Room Z position'),
      nullableText(row.description, 'Room description', 65_535),
      json({ size3D: row.size3D, roomType: row.roomType, capacity: row.capacity, areaSqm: row.areaSqm })
    ]);

  deletions.assets = await syncSimple(executor, previous.assets || [], next.assets, 'bmn_assets',
    ['id', 'kode_barang', 'nup', 'nama_barang', 'kategori_id', 'subkategori', 'merk_type', 'nomor_seri', 'tanggal_perolehan', 'tahun_perolehan', 'jumlah', 'satuan', 'nilai_perolehan', 'akumulasi_penyusutan', 'nilai_buku', 'kondisi', 'gedung_id', 'ruangan_id', 'penanggung_jawab', 'status', 'foto_url', 'barcode', 'qr_code_payload', 'keterangan'],
    row => {
      const category = assetCategoryId(row.kategori);
      const room = row.ruanganId ? roomIdById.get(row.ruanganId) : null;
      if (row.ruanganId && !room) fail(`Room ${row.ruanganId} does not exist for asset ${row.id}.`);
      return [
        assertId(row.id, 'Asset ID'),
        assertText(row.kodeBarang, 'Asset item code', 50),
        assertNumber(row.nup, 'Asset NUP', true, 0),
        assertText(row.namaBarang, 'Asset name', 200),
        category,
        nullableText(row.subkategori, 'Asset subcategory', 100),
        nullableText(row.merkType, 'Asset brand/type', 150),
        nullableText(row.nomorSeri, 'Asset serial number', 100),
        validDate(row.tanggalPerolehan, 'Asset acquisition date'),
        assertNumber(row.tahunPerolehan, 'Asset acquisition year', true, 0),
        assertNumber(row.jumlah, 'Asset quantity', true, 0),
        nullableText(row.satuan, 'Asset unit', 30),
        assertNumber(row.nilaiPerolehan, 'Asset acquisition value', false, 0),
        assertNumber(row.akumulasiPenyusutan || 0, 'Asset accumulated depreciation', false, 0),
        assertNumber(row.nilaiBuku, 'Asset book value', false, 0),
        assertText(row.kondisi, 'Asset condition', 30),
        row.gedung ? buildingId(row.gedung) : null,
        room || null,
        nullableText(row.penanggungJawab, 'Asset owner', 150),
        assertText(row.status, 'Asset status', 50),
        nullableText(row.fotoUrl, 'Asset photo URL', 65_535),
        nullableText(row.barcode, 'Asset barcode', 100),
        nullableText(row.qrCodeUrl, 'Asset QR payload', 65_535),
        nullableText(row.keterangan, 'Asset description', 65_535)
      ];
    });

  deletions.inventoryItems = await syncSimple(executor, previous.inventoryItems || [], next.inventoryItems, 'inventory_items',
    ['id', 'kode_barang', 'nama', 'kategori_id', 'subkategori', 'jenis', 'satuan', 'stok_awal', 'stok_saat_ini', 'stok_minimum', 'stok_maksimum', 'harga_satuan', 'lokasi_id', 'barcode', 'rata_rata_bulanan', 'foto_url'],
    row => [
      assertId(row.id, 'Inventory item ID'),
      assertText(row.kodeBarang, 'Inventory item code', 50),
      assertText(row.nama, 'Inventory item name', 200),
      inventoryCategoryId(row.kategori),
      nullableText(row.subkategori, 'Inventory subcategory', 100),
      assertText(row.jenis, 'Inventory type', 10),
      assertText(row.satuan, 'Inventory unit', 30),
      assertNumber(row.stokAwal, 'Opening stock', true, 0),
      assertNumber(row.stokSaatIni, 'Current stock', true, 0),
      assertNumber(row.stokMinimum, 'Minimum stock', true, 0),
      assertNumber(row.stokMaksimum, 'Maximum stock', true, 0),
      assertNumber(row.hargaSatuan, 'Unit price', false, 0),
      locationId(row),
      nullableText(row.barcode, 'Inventory barcode', 100),
      assertNumber(row.ratarataPenggunaanBulanan, 'Monthly average usage', true, 0),
      nullableText(row.fotoUrl, 'Inventory photo URL', 65_535)
    ]);

  deletions.users = await syncSimple(executor, previous.users || [], next.users, 'users',
    ['id', 'nip', 'name', 'email', 'phone', 'role_id', 'unit_kerja', 'avatar_url', 'is_active'],
    row => [
      assertId(row.id, 'User ID'),
      assertText(row.nip, 'User NIP', 30),
      assertText(row.name, 'User name', 150),
      assertText(row.email, 'User email', 150),
      nullableText(row.phone, 'User phone', 30),
      roleId(row.role),
      assertText(row.unitKerja, 'User work unit', 100),
      nullableText(row.avatar, 'User avatar URL', 65_535),
      row.statusAktif === false ? 0 : 1
    ]);

  deletions.movements = await syncSimple(executor, previous.movements || [], next.movements, 'asset_movements',
    ['id', 'nomor_transaksi', 'asset_id', 'ruangan_asal_id', 'ruangan_tujuan_id', 'tanggal', 'alasan', 'pemohon', 'penanggung_jawab', 'status', 'catatan'],
    row => [
      assertId(row.id, 'Movement ID'),
      assertText(row.nomorTransaksi, 'Movement number', 50),
      assertId(row.assetId, 'Movement asset ID'),
      row.lokasiAsalId ? assertId(row.lokasiAsalId, 'Origin room ID') : null,
      row.lokasiTujuanId ? assertId(row.lokasiTujuanId, 'Destination room ID') : null,
      validDate(row.tanggal, 'Movement date'),
      assertText(row.alasan, 'Movement reason', 65_535),
      assertText(row.pemohon, 'Movement applicant', 150),
      assertText(row.penanggungJawab, 'Movement owner', 150),
      assertText(row.status, 'Movement status', 50),
      nullableText(row.catatan, 'Movement note', 65_535)
    ]);

  deletions.maintenances = await syncSimple(executor, previous.maintenances || [], next.maintenances, 'asset_maintenance',
    ['id', 'nomor_tiket', 'asset_id', 'jenis_pemeliharaan', 'tanggal_mulai', 'tanggal_selesai', 'teknisi', 'vendor', 'biaya', 'keterangan', 'status'],
    row => [
      assertId(row.id, 'Maintenance ID'),
      assertText(row.nomorTiket, 'Maintenance ticket number', 50),
      assertId(row.assetId, 'Maintenance asset ID'),
      assertText(row.jenisPemeliharaan, 'Maintenance type', 100),
      validDate(row.tanggalMulai, 'Maintenance start date'),
      optionalDate(row.tanggalSelesai, 'Maintenance end date'),
      nullableText(row.teknisi, 'Maintenance technician', 150),
      nullableText(row.vendor, 'Maintenance vendor', 150),
      assertNumber(row.biaya, 'Maintenance cost', false, 0),
      nullableText(row.keterangan, 'Maintenance note', 65_535),
      assertText(row.status, 'Maintenance status', 50)
    ]);

  deletions.disposals = await syncSimple(executor, previous.disposals || [], next.disposals, 'asset_disposals',
    ['id', 'nomor_pengajuan', 'asset_id', 'alasan', 'kondisi_terakhir', 'nilai_buku', 'dokumen_pendukung', 'status', 'tanggal_pengajuan', 'penyetuju'],
    row => [
      assertId(row.id, 'Disposal ID'),
      assertText(row.nomorPengajuan, 'Disposal number', 50),
      row.assetId ? assertId(row.assetId, 'Disposal asset ID') : null,
      assertText(row.alasan, 'Disposal reason', 65_535),
      assertText(row.kondisiTerakhir, 'Last asset condition', 30),
      assertNumber(row.nilaiBuku, 'Disposal book value', false, 0),
      nullableText(row.dokumenPendukung, 'Supporting document', 65_535),
      assertText(row.status, 'Disposal status', 50),
      validDate(row.tanggalPengajuan, 'Disposal request date'),
      nullableText(row.penyetuju, 'Disposal approver', 150)
    ]);

  deletions.auditLogs = await syncSimple(executor, previousAuditLogs, trustedAuditLogs, 'audit_logs',
    ['id', 'user_id', 'user_name', 'user_role', 'aktivitas', 'modul', 'tanggal', 'waktu', 'ip_address', 'detail'],
    row => [
      assertId(row.id, 'Audit log ID'),
      nullableText(row.userId, 'Audit user ID', 36),
      assertText(row.userName, 'Audit user name', 150),
      assertText(row.userRole, 'Audit user role', 50),
      assertText(row.aktivitas, 'Audit activity', 150),
      assertText(row.modul, 'Audit module', 50),
      validDate(row.tanggal, 'Audit date'),
      validTime(row.waktu),
      nullableText(row.ipAddress, 'Audit IP address', 50),
      assertText(row.detail || '-', 'Audit detail', 65_535)
    ]);

  deletions.notifications = await syncSimple(executor, previous.notifications || [], next.notifications, 'notifications',
    ['id', 'type', 'title', 'message', 'read', 'link', 'created_at'],
    (row, previous) => [
      assertId(row.id, 'Notification ID'),
      assertText(row.type, 'Notification type', 50),
      assertText(row.title, 'Notification title', 200),
      assertText(row.message, 'Notification message', 65_535),
      row.read ? 1 : 0,
      nullableText(row.link, 'Notification link', 65_535),
      row.timestamp && row.timestamp !== 'Baru saja'
        ? row.timestamp
        : previous?.timestamp || new Date().toISOString()
    ]);

  await writeStockTransactions(executor, previous, next);
  await writeRequests(executor, previous, next);
  await writeOpnames(executor, previous, next);
  await writeDocuments(executor, previous.documents || [], next.documents);
  await writeLedgerEvents(executor, ledgerChanges, previous, next);

  for (const id of deletions.assets) {
    const [movements, maintenance, disposals] = await Promise.all([
      queryRows(executor, 'SELECT id FROM asset_movements WHERE asset_id = ? LIMIT 1', [id]),
      queryRows(executor, 'SELECT id FROM asset_maintenance WHERE asset_id = ? LIMIT 1', [id]),
      queryRows(executor, 'SELECT id FROM asset_disposals WHERE asset_id = ? LIMIT 1', [id])
    ]);
    if (movements.length || maintenance.length || disposals.length) {
      fail(`Asset ${id} has operational history and cannot be deleted.`);
    }
  }
  for (const id of deletions.inventoryItems) {
    const dependentTables = [
      'stock_card_ledger', 'stock_in_items', 'stock_out_items',
      'inventory_requests', 'inventory_request_items', 'stock_opname_items'
    ];
    for (const table of dependentTables) {
      const rows = await queryRows(executor, `SELECT id FROM \`${table}\` WHERE item_id = ? LIMIT 1`, [id]);
      if (rows.length) fail(`Inventory item ${id} has ${table} history and cannot be deleted.`);
    }
  }

  await deleteIds(executor, 'notifications', deletions.notifications);
  await deleteIds(executor, 'audit_logs', deletions.auditLogs);
  await deleteIds(executor, 'asset_movements', deletions.movements);
  await deleteIds(executor, 'asset_maintenance', deletions.maintenances);
  await deleteIds(executor, 'asset_disposals', deletions.disposals);
  await deleteIds(executor, 'documents', deletions.documents || []);
  await deleteIds(executor, 'bmn_assets', deletions.assets);
  await deleteIds(executor, 'inventory_items', deletions.inventoryItems);
  await deleteIds(executor, 'rooms', deletions.rooms);

  for (const id of deletions.users) {
    await execute(executor, 'UPDATE audit_logs SET user_id = NULL WHERE user_id = ?', [id]);
    await execute(executor, 'DELETE FROM users WHERE id = ?', [id]);
  }
  await deleteIds(executor, 'roles', deletions.roles);
}

async function deleteIds(executor, table, ids) {
  for (const id of ids || []) await execute(executor, `DELETE FROM \`${table}\` WHERE id = ?`, [id]);
}

function stockInMetadata(row) {
  return json({
    status: row.status,
    pemeriksaan: row.pemeriksaan,
    diverifikasiOleh: row.diverifikasiOleh,
    diverifikasiPada: row.diverifikasiPada
  });
}

async function writeStockTransactions(executor, previous, next) {
  for (const config of [
    {
      collection: 'stockInList',
      headerTable: 'stock_in',
      detailTable: 'stock_in_items',
      headerColumns: ['id', 'nomor_transaksi', 'tanggal', 'nomor_dokumen', 'sumber', 'petugas', 'keterangan', 'total_nilai', 'dokumen_url', 'app_metadata_json'],
      detailColumns: ['id', 'stock_in_id', 'item_id', 'jumlah', 'harga_satuan', 'total_harga', 'lokasi_rak'],
      header: rows => {
        const row = rows[0];
        for (const other of rows) {
          if (stable([other.nomorTransaksi, other.tanggal, other.nomorDokumen, other.sumber, other.petugas, other.keterangan, other.dokumenUrl, stockInMetadata(other)]) !==
              stable([row.nomorTransaksi, row.tanggal, row.nomorDokumen, row.sumber, row.petugas, row.keterangan, row.dokumenUrl, stockInMetadata(row)])) {
            fail(`Stock-in header ${row.headerId || row.id} has inconsistent detail metadata.`);
          }
        }
        return [
          row.headerId || row.id,
          assertText(row.nomorTransaksi, 'Stock-in number', 50),
          validDate(row.tanggal, 'Stock-in date'),
          assertText(row.nomorDokumen, 'Stock-in document number', 100),
          assertText(row.sumber, 'Stock-in source', 100),
          assertText(row.petugas, 'Stock-in operator', 150),
          nullableText(row.keterangan, 'Stock-in note', 65_535),
          rows.reduce((sum, item) => sum + assertNumber(item.totalHarga, 'Stock-in total', false, 0), 0),
          nullableText(row.dokumenUrl, 'Stock-in document URL', 65_535),
          stockInMetadata(row)
        ];
      },
      headerRow: columns => ['id', ...columns.slice(1)].reduce((row, column, index) => {
        row[column] = columns[index];
        return row;
      }, {}),
      details: (rows, headerId) => rows.map(row => [
        assertId(row.id, 'Stock-in detail ID'),
        headerId,
        assertId(row.itemId, 'Stock-in item ID'),
        assertNumber(row.jumlah, 'Stock-in quantity', true, 1),
        assertNumber(row.hargaSatuan, 'Stock-in unit price', false, 0),
        assertNumber(row.totalHarga, 'Stock-in total', false, 0),
        nullableText(row.lokasiRak, 'Stock-in location', 50)
      ]),
      headerFieldNames: ['id', 'nomor_transaksi', 'tanggal', 'nomor_dokumen', 'sumber', 'petugas', 'keterangan', 'total_nilai', 'dokumen_url', 'app_metadata_json']
    },
    {
      collection: 'stockOutList',
      headerTable: 'stock_out',
      detailTable: 'stock_out_items',
      headerColumns: ['id', 'nomor_transaksi', 'tanggal', 'unit_kerja', 'ruangan', 'pemohon', 'petugas', 'keperluan', 'app_metadata_json'],
      detailColumns: ['id', 'stock_out_id', 'item_id', 'jumlah', 'satuan'],
      header: rows => {
        const row = rows[0];
        for (const other of rows) {
          if (stable([other.nomorTransaksi, other.tanggal, other.unitKerja, other.ruangan, other.pemohon, other.petugas, other.keperluan, other.keterangan]) !==
              stable([row.nomorTransaksi, row.tanggal, row.unitKerja, row.ruangan, row.pemohon, row.petugas, row.keperluan, row.keterangan])) {
            fail(`Stock-out header ${row.headerId || row.id} has inconsistent detail metadata.`);
          }
        }
        return [
          row.headerId || row.id,
          assertText(row.nomorTransaksi, 'Stock-out number', 50),
          validDate(row.tanggal, 'Stock-out date'),
          assertText(row.unitKerja, 'Stock-out work unit', 100),
          assertText(row.ruangan, 'Stock-out room', 100),
          assertText(row.pemohon, 'Stock-out applicant', 150),
          assertText(row.petugas, 'Stock-out operator', 150),
          nullableText(row.keperluan, 'Stock-out purpose', 65_535),
          json({ keterangan: row.keterangan })
        ];
      },
      detailColumnsMap: (row, headerId) => [
        assertId(row.id, 'Stock-out detail ID'),
        headerId,
        assertId(row.itemId, 'Stock-out item ID'),
        assertNumber(row.jumlah, 'Stock-out quantity', true, 1),
        assertText(row.satuan, 'Stock-out unit', 30)
      ],
      headerFieldNames: ['id', 'nomor_transaksi', 'tanggal', 'unit_kerja', 'ruangan', 'pemohon', 'petugas', 'keperluan', 'app_metadata_json']
    }
  ]) {
    const previousGroups = groupsByHeader(previous[config.collection] || []);
    const nextGroups = groupsByHeader(next[config.collection]);
    const ids = new Set([...previousGroups.keys(), ...nextGroups.keys()]);
    for (const id of ids) {
      const before = previousGroups.get(id) || [];
      const after = nextGroups.get(id) || [];
      if (stable(before) === stable(after)) continue;
      if (!after.length) {
        await execute(executor, `DELETE FROM \`${config.detailTable}\` WHERE ${config.collection === 'stockInList' ? 'stock_in_id' : 'stock_out_id'} = ?`, [id]);
        await execute(executor, `DELETE FROM \`${config.headerTable}\` WHERE id = ?`, [id]);
        continue;
      }
      const headerValues = config.header(after);
      await upsert(executor, config.headerTable, config.headerColumns, headerValues);
      const foreignKey = config.collection === 'stockInList' ? 'stock_in_id' : 'stock_out_id';
      await execute(executor, `DELETE FROM \`${config.detailTable}\` WHERE \`${foreignKey}\` = ?`, [id]);
      const details = config.collection === 'stockInList'
        ? config.details(after, id)
        : after.map(row => config.detailColumnsMap(row, id));
      for (const values of details) await upsert(executor, config.detailTable, config.detailColumns, values);
    }
  }
}

async function writeRequests(executor, previous, next) {
  const before = new Map((previous.requests || []).map(row => [row.id, row]));
  const afterIds = new Set(next.requests.map(row => row.id));
  for (const request of next.requests) {
    const items = request.items?.length ? request.items : [{
      itemId: request.itemId,
      namaBarang: request.namaBarang,
      kodeBarang: undefined,
      jumlahDiminta: request.jumlahDiminta,
      jumlahDisetujui: request.jumlahDisetujui,
      satuan: request.satuan,
      spesifikasi: undefined,
      catatan: undefined
    }];
    if (!items.length || items.length > 100) fail(`Request ${request.id} must contain 1 to 100 items.`);
    const first = items[0];
    const headerValues = [
      assertId(request.id, 'Request ID'),
      assertText(request.nomorPermintaan, 'Request number', 50),
      validDate(request.tanggal, 'Request date'),
      assertText(request.pemohonNama, 'Request applicant', 150),
      assertText(request.unitKerja, 'Request work unit', 100),
      assertText(request.ruangan, 'Request room', 100),
      assertId(first.itemId, 'Requested inventory item ID'),
      assertNumber(first.jumlahDiminta, 'Requested quantity', true, 1),
      first.jumlahDisetujui == null ? null : assertNumber(first.jumlahDisetujui, 'Approved quantity', true, 0),
      assertText(first.satuan, 'Request unit', 30),
      assertText(request.keperluan, 'Request purpose', 65_535),
      assertText(request.prioritas || 'Normal', 'Request priority', 20),
      assertText(request.status, 'Request status', 30),
      nullableText(request.catatan, 'Request note', 65_535)
    ];
    const itemValues = items.map(item => [
      uuidFromKey(`${request.id}:${item.itemId}`),
      request.id,
      assertId(item.itemId, 'Requested inventory item ID'),
      assertText(item.namaBarang, 'Requested item name', 200),
      nullableText(item.kodeBarang, 'Requested item code', 50),
      assertNumber(item.jumlahDiminta, 'Requested quantity', true, 1),
      item.jumlahDisetujui == null ? null : assertNumber(item.jumlahDisetujui, 'Approved quantity', true, 0),
      assertText(item.satuan, 'Request unit', 30),
      nullableText(item.spesifikasi, 'Item specification', 250),
      nullableText(item.catatan, 'Request item note', 250)
    ]);
    const old = before.get(request.id);
    if (old && stable(old) === stable(request)) continue;
    await upsert(executor, 'inventory_requests',
      ['id', 'nomor_permintaan', 'tanggal', 'pemohon_nama', 'unit_kerja', 'ruangan', 'item_id', 'jumlah_diminta', 'jumlah_disetujui', 'satuan', 'keperluan', 'prioritas', 'status', 'catatan'],
      headerValues);
    await execute(executor, 'DELETE FROM inventory_request_items WHERE request_id = ?', [request.id]);
    for (const values of itemValues) {
      await upsert(executor, 'inventory_request_items',
        ['id', 'request_id', 'item_id', 'nama_barang', 'kode_barang', 'jumlah_diminta', 'jumlah_disetujui', 'satuan', 'spesifikasi', 'catatan'],
        values);
    }
  }
  for (const id of before.keys()) {
    if (!afterIds.has(id)) await execute(executor, 'DELETE FROM inventory_requests WHERE id = ?', [id]);
  }
}

async function writeOpnames(executor, previous, next) {
  const before = new Map((previous.opnames || []).map(row => [row.id, row]));
  const afterIds = new Set(next.opnames.map(row => row.id));
  for (const opname of next.opnames) {
    const headerValues = [
      assertId(opname.id, 'Stock opname ID'),
      assertText(opname.nomorOpname, 'Stock opname number', 50),
      validDate(opname.tanggal, 'Stock opname date'),
      assertText(opname.periode, 'Stock opname period', 50),
      assertText(opname.petugas, 'Stock opname operator', 150),
      assertText(opname.status, 'Stock opname status', 30),
      nullableText(opname.catatan, 'Stock opname note', 65_535)
    ];
    const itemValues = (opname.items || []).map(item => [
      assertId(item.id, 'Stock opname detail ID'),
      opname.id,
      assertId(item.itemId, 'Stock opname inventory item ID'),
      assertNumber(item.stokSistem, 'System stock', true, 0),
      assertNumber(item.stokFisik, 'Physical stock', true, 0),
      assertText(item.kondisi || 'Baik', 'Stock opname condition', 30),
      nullableText(item.keterangan, 'Stock opname item note', 65_535),
      nullableText(item.statusPenyesuaian, 'Stock opname adjustment status', 30)
    ]);
    const old = before.get(opname.id);
    if (old && stable(old) === stable(opname)) continue;
    await upsert(executor, 'stock_opnames',
      ['id', 'nomor_opname', 'tanggal', 'periode', 'petugas', 'status', 'catatan'],
      headerValues);
    await execute(executor, 'DELETE FROM stock_opname_items WHERE opname_id = ?', [opname.id]);
    for (const values of itemValues) {
      await upsert(executor, 'stock_opname_items',
        ['id', 'opname_id', 'item_id', 'stok_sistem', 'stok_fisik', 'kondisi', 'keterangan', 'status_penyesuaian'],
        values);
    }
  }
  for (const id of before.keys()) {
    if (!afterIds.has(id)) await execute(executor, 'DELETE FROM stock_opnames WHERE id = ?', [id]);
  }
}

async function writeDocuments(executor, previous, next) {
  const previousById = new Map(previous.map(document => [document.id, document]));
  const nextIds = new Set(next.map(document => document.id));
  for (const document of next) {
    const previousDocument = previousById.get(document.id);
    const tags = document.tags || [];
    if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) {
      fail(`Document ${document.id} has invalid tags.`);
    }
    const values = [
      assertId(document.id, 'Document ID'),
      assertText(document.nomorDokumen, 'Document number', 100),
      assertText(document.judul, 'Document title', 200),
      assertText(document.jenis, 'Document type', 50),
      validDate(document.tanggal, 'Document date'),
      assertNumber(document.tahun, 'Document year', true, 0),
      nullableText(document.fileSize, 'Document file size', 30),
      assertText(document.uploader, 'Document uploader', 150),
      assertText(document.status, 'Document status', 30),
      JSON.stringify(tags),
      nullableText(document.storageBackend, 'Document storage backend', 30),
      nullableText(document.storageKey, 'Document storage key', 36),
      document.storageSize == null ? null : assertNumber(document.storageSize, 'Document storage size', true, 0),
      nullableText(document.sha256, 'Document SHA-256', 64),
      nullableText(document.fileName, 'Document filename', 255),
      nullableText(document.fileType, 'Document MIME type', 127),
      document.uploadedAt || null,
      nullableText(document.description, 'Document description', 65_535),
      nullableText(document.idempotencyKey, 'Document idempotency key', 36)
    ];
    if (!previousDocument || stable(previousDocument) !== stable(document)) {
      await upsert(executor, 'documents',
        ['id', 'nomor_dokumen', 'judul', 'jenis', 'tanggal', 'tahun', 'file_size', 'uploader', 'status', 'tags_json', 'storage_backend', 'storage_key', 'storage_size_bytes', 'sha256', 'file_name', 'mime_type', 'uploaded_at', 'description', 'idempotency_key'],
        values);
    }
    const file = document.storageBackend === 'hostinger' ? null : parseDataUrl(document);
    if (file && (!previousDocument ||
        previousDocument.fileDataUrl !== document.fileDataUrl ||
        previousDocument.fileName !== document.fileName ||
        previousDocument.fileType !== document.fileType)) {
      await upsert(executor, 'document_files',
        ['document_id', 'file_name', 'mime_type', 'file_size_bytes', 'sha256', 'file_data'],
        [document.id, file.fileName, file.mimeType, file.data.length, file.sha256, file.data]);
    }
  }
  for (const id of previousById.keys()) {
    if (!nextIds.has(id)) await execute(executor, 'DELETE FROM documents WHERE id = ?', [id]);
  }
}
