-- Riwayat beban runtime untuk mode operasional.
--
-- Hosting terkelola tidak menyimpan keluaran proses yang sudah lewat, jadi catatan
-- singkat ini yang membuat gangguan semalam masih bisa dibaca pagi harinya: satu baris
-- per interval berisi statistik pool, event loop, memori, dan cache state.
--
-- Sengaja aditif dan aman dijalankan berulang. Baris lama dipangkas oleh aplikasi
-- (HEALTH_HISTORY_RETENTION_DAYS, bawaan 7 hari), bukan oleh skrip ini.
CREATE TABLE IF NOT EXISTS health_samples (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uptime_seconds INT NULL,
  backend VARCHAR(20) NULL,
  metrics_json TEXT NOT NULL,
  INDEX idx_health_samples_captured_at (captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
