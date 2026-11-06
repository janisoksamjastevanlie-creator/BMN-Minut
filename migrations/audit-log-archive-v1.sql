-- Arsip audit trail untuk mode operasional.
--
-- Tabel ini dipakai job retensi (AUDIT_RETENTION_DAYS) sebagai tempat perpindahan,
-- bukan tempat penghapusan: catatan yang lebih tua dari batas retensi disalin ke sini
-- sebelum barisnya dikeluarkan dari audit_logs.
--
-- Sengaja aditif dan aman dijalankan berulang. Server mode operasional tidak membuat
-- tabel saat startup, jadi terapkan migrations/ ini secara manual di staging lebih dulu.
CREATE TABLE IF NOT EXISTS audit_log_archive (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(191) NULL,
  user_name VARCHAR(191) NULL,
  user_role VARCHAR(60) NULL,
  aktivitas VARCHAR(191) NULL,
  modul VARCHAR(60) NULL,
  tanggal VARCHAR(10) NULL,
  waktu VARCHAR(20) NULL,
  ip_address VARCHAR(45) NULL,
  detail TEXT NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_archive_tanggal (tanggal),
  INDEX idx_audit_archive_modul (modul)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
