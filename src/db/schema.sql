-- ====================================================================
-- SIMAN-BMN: Sistem Informasi Manajemen Aset BMN & Persediaan
-- BADAN PUSAT STATISTIK KABUPATEN MINAHASA UTARA
-- PostgreSQL / Supabase Relational Schema Definition
-- ====================================================================

-- 1. ROLES & USERS
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nip VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    role_id VARCHAR(50) REFERENCES roles(id),
    unit_kerja VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. BUILDINGS & ROOMS (OFFICE DIGITAL TWIN)
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    floors INT DEFAULT 2,
    address TEXT DEFAULT 'Jl. W.J. Walanda Maramis, Airmadidi, Minahasa Utara'
);

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    floor INT DEFAULT 1,
    pic_name VARCHAR(150),
    pic_nip VARCHAR(30),
    color_hex VARCHAR(20) DEFAULT '#3b82f6',
    pos_x FLOAT DEFAULT 0,
    pos_y FLOAT DEFAULT 0,
    pos_z FLOAT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. ASSET CATEGORIES & BMN ASSETS
CREATE TABLE IF NOT EXISTS asset_categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    golongan_bmn VARCHAR(50),
    masa_manfaat_tahun INT DEFAULT 4
);

CREATE TABLE IF NOT EXISTS bmn_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_barang VARCHAR(50) NOT NULL,
    nup INT NOT NULL,
    nama_barang VARCHAR(200) NOT NULL,
    kategori_id VARCHAR(50) REFERENCES asset_categories(id),
    subkategori VARCHAR(100),
    merk_type VARCHAR(150),
    nomor_seri VARCHAR(100),
    tanggal_perolehan DATE NOT NULL,
    tahun_perolehan INT NOT NULL,
    jumlah INT DEFAULT 1,
    satuan VARCHAR(30) DEFAULT 'Unit',
    nilai_perolehan NUMERIC(15,2) NOT NULL,
    akumulasi_penyusutan NUMERIC(15,2) DEFAULT 0,
    nilai_buku NUMERIC(15,2) NOT NULL,
    kondisi VARCHAR(30) CHECK (kondisi IN ('Baik', 'Rusak Ringan', 'Rusak Berat')),
    gedung_id UUID REFERENCES buildings(id),
    ruangan_id UUID REFERENCES rooms(id),
    penanggung_jawab VARCHAR(150),
    status VARCHAR(50) DEFAULT 'Aktif',
    foto_url TEXT,
    barcode VARCHAR(100) UNIQUE,
    qr_code_payload TEXT,
    keterangan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_kode_nup UNIQUE (kode_barang, nup)
);

-- 4. ASSET MOVEMENTS, MAINTENANCE & DISPOSALS
CREATE TABLE IF NOT EXISTS asset_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_transaksi VARCHAR(50) UNIQUE NOT NULL,
    asset_id UUID REFERENCES bmn_assets(id) ON DELETE CASCADE,
    ruangan_asal_id UUID REFERENCES rooms(id),
    ruangan_tujuan_id UUID REFERENCES rooms(id),
    tanggal DATE NOT NULL,
    alasan TEXT NOT NULL,
    pemohon VARCHAR(150) NOT NULL,
    penanggung_jawab VARCHAR(150) NOT NULL,
    status VARCHAR(50) DEFAULT 'Pengajuan',
    catatan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_tiket VARCHAR(50) UNIQUE NOT NULL,
    asset_id UUID REFERENCES bmn_assets(id) ON DELETE CASCADE,
    jenis_pemeliharaan VARCHAR(100) NOT NULL,
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE,
    teknisi VARCHAR(150),
    vendor VARCHAR(150),
    biaya NUMERIC(15,2) DEFAULT 0,
    keterangan TEXT,
    status VARCHAR(50) DEFAULT 'Terjadwal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_disposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_pengajuan VARCHAR(50) UNIQUE NOT NULL,
    asset_id UUID REFERENCES bmn_assets(id) ON DELETE CASCADE,
    alasan TEXT NOT NULL,
    kondisi_terakhir VARCHAR(30) NOT NULL,
    nilai_buku NUMERIC(15,2) NOT NULL,
    dokumen_pendukung TEXT,
    status VARCHAR(50) DEFAULT 'Draft',
    tanggal_pengajuan DATE NOT NULL,
    penyetuju VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. INVENTORY & WAREHOUSE DIGITAL TWIN
CREATE TABLE IF NOT EXISTS inventory_categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    jenis VARCHAR(10) CHECK (jenis IN ('ATK', 'ARK'))
);

CREATE TABLE IF NOT EXISTS inventory_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gudang_name VARCHAR(100) DEFAULT 'Gudang Utama BPS Minut',
    rak_code VARCHAR(30) NOT NULL, -- e.g. Rak A
    shelf VARCHAR(30) NOT NULL,    -- e.g. Shelf 02
    bin_code VARCHAR(50) UNIQUE NOT NULL, -- e.g. WH-A-02-05
    description TEXT
);

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_barang VARCHAR(50) UNIQUE NOT NULL,
    nama VARCHAR(200) NOT NULL,
    kategori_id VARCHAR(50) REFERENCES inventory_categories(id),
    subkategori VARCHAR(100),
    jenis VARCHAR(10) CHECK (jenis IN ('ATK', 'ARK')),
    satuan VARCHAR(30) NOT NULL,
    stok_awal INT DEFAULT 0,
    stok_saat_ini INT DEFAULT 0,
    stok_minimum INT DEFAULT 10,
    stok_maksimum INT DEFAULT 200,
    harga_satuan NUMERIC(15,2) DEFAULT 0,
    total_nilai NUMERIC(15,2) GENERATED ALWAYS AS (stok_saat_ini * harga_satuan) STORED,
    lokasi_id UUID REFERENCES inventory_locations(id),
    barcode VARCHAR(100) UNIQUE,
    rata_rata_bulanan INT DEFAULT 5,
    foto_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. STOCK TRANSACTIONS (STOCK IN, STOCK OUT, REQUESTS, OPNAME)
CREATE TABLE IF NOT EXISTS stock_in (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_transaksi VARCHAR(50) UNIQUE NOT NULL,
    tanggal DATE NOT NULL,
    nomor_dokumen VARCHAR(100) NOT NULL,
    sumber VARCHAR(100) NOT NULL,
    petugas VARCHAR(150) NOT NULL,
    keterangan TEXT,
    total_nilai NUMERIC(15,2) DEFAULT 0,
    dokumen_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_in_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_in_id UUID REFERENCES stock_in(id) ON DELETE CASCADE,
    item_id UUID REFERENCES inventory_items(id),
    jumlah INT NOT NULL CHECK (jumlah > 0),
    harga_satuan NUMERIC(15,2) NOT NULL,
    total_harga NUMERIC(15,2) NOT NULL,
    lokasi_rak VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS stock_out (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_transaksi VARCHAR(50) UNIQUE NOT NULL,
    tanggal DATE NOT NULL,
    unit_kerja VARCHAR(100) NOT NULL,
    ruangan VARCHAR(100) NOT NULL,
    pemohon VARCHAR(150) NOT NULL,
    petugas VARCHAR(150) NOT NULL,
    keperluan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_out_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_out_id UUID REFERENCES stock_out(id) ON DELETE CASCADE,
    item_id UUID REFERENCES inventory_items(id),
    jumlah INT NOT NULL CHECK (jumlah > 0),
    satuan VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS inventory_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_permintaan VARCHAR(50) UNIQUE NOT NULL,
    tanggal DATE NOT NULL,
    pemohon_nama VARCHAR(150) NOT NULL,
    unit_kerja VARCHAR(100) NOT NULL,
    ruangan VARCHAR(100) NOT NULL,
    item_id UUID REFERENCES inventory_items(id),
    jumlah_diminta INT NOT NULL,
    jumlah_disetujui INT,
    satuan VARCHAR(30),
    keperluan TEXT NOT NULL,
    prioritas VARCHAR(20) DEFAULT 'Normal',
    status VARCHAR(30) DEFAULT 'Diajukan',
    catatan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_opnames (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_opname VARCHAR(50) UNIQUE NOT NULL,
    tanggal DATE NOT NULL,
    periode VARCHAR(50) NOT NULL,
    petugas VARCHAR(150) NOT NULL,
    status VARCHAR(30) DEFAULT 'Draft',
    catatan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_opname_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opname_id UUID REFERENCES stock_opnames(id) ON DELETE CASCADE,
    item_id UUID REFERENCES inventory_items(id),
    stok_sistem INT NOT NULL,
    stok_fisik INT NOT NULL,
    selisih INT GENERATED ALWAYS AS (stok_fisik - stok_sistem) STORED,
    kondisi VARCHAR(30) DEFAULT 'Baik',
    keterangan TEXT
);

-- 7. STOCK CARD (RUNNING BALANCE LEDGER)
CREATE TABLE IF NOT EXISTS stock_card_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    tanggal DATE NOT NULL,
    nomor_transaksi VARCHAR(50) NOT NULL,
    tipe_transaksi VARCHAR(30) NOT NULL,
    masuk INT DEFAULT 0,
    keluar INT DEFAULT 0,
    saldo INT NOT NULL,
    keterangan TEXT,
    petugas VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. DOCUMENTS, NOTIFICATIONS & AUDIT LOGS
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_dokumen VARCHAR(100) UNIQUE NOT NULL,
    judul VARCHAR(200) NOT NULL,
    jenis VARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    tahun INT NOT NULL,
    file_size VARCHAR(30),
    uploader VARCHAR(150) NOT NULL,
    status VARCHAR(30) DEFAULT 'Sah',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_name VARCHAR(150) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    aktivitas VARCHAR(150) NOT NULL,
    modul VARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    waktu TIME NOT NULL,
    ip_address VARCHAR(50) DEFAULT '127.0.0.1',
    detail TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
