ALTER TABLE users
  ADD COLUMN phone VARCHAR(30) NULL AFTER email;

ALTER TABLE roles
  ADD COLUMN app_metadata_json LONGTEXT NULL;

ALTER TABLE rooms
  ADD COLUMN app_metadata_json LONGTEXT NULL;

ALTER TABLE stock_in
  ADD COLUMN app_metadata_json LONGTEXT NULL;

ALTER TABLE stock_out
  ADD COLUMN app_metadata_json LONGTEXT NULL;

ALTER TABLE stock_opname_items
  ADD COLUMN status_penyesuaian VARCHAR(30) NULL;

ALTER TABLE documents
  ADD COLUMN tags_json LONGTEXT NULL;

CREATE TABLE app_meta (
  `key` VARCHAR(100) NOT NULL PRIMARY KEY,
  value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_request_items (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  nama_barang VARCHAR(200) NOT NULL,
  kode_barang VARCHAR(50) NULL,
  jumlah_diminta INT NOT NULL,
  jumlah_disetujui INT NULL,
  satuan VARCHAR(30) NOT NULL,
  spesifikasi VARCHAR(250) NULL,
  catatan VARCHAR(250) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_request_item (request_id, item_id),
  INDEX idx_request_items_item (item_id),
  CONSTRAINT fk_request_items_request FOREIGN KEY (request_id)
    REFERENCES inventory_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_request_items_inventory FOREIGN KEY (item_id)
    REFERENCES inventory_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE document_files (
  document_id VARCHAR(36) NOT NULL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  file_data LONGBLOB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_file_document FOREIGN KEY (document_id)
    REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE whatsapp_notification_events (
  event_id CHAR(36) NOT NULL PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL,
  request_status VARCHAR(40) NOT NULL,
  action VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notification_request (request_id, request_status, action, created_at),
  UNIQUE KEY uq_notification_request (request_id, request_status, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE whatsapp_notification_recipients (
  event_id CHAR(36) NOT NULL,
  recipient_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  error VARCHAR(500) NULL,
  PRIMARY KEY (event_id, recipient_hash),
  CONSTRAINT fk_notification_recipient_event FOREIGN KEY (event_id)
    REFERENCES whatsapp_notification_events(event_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE whatsapp_request_owners (
  request_id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  INDEX idx_request_owner_user (user_id),
  CONSTRAINT fk_request_owner_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE whatsapp_accounts (
  user_id VARCHAR(36) NOT NULL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL UNIQUE,
  linked_at VARCHAR(35) NOT NULL,
  notify_enabled TINYINT NOT NULL DEFAULT 1,
  CONSTRAINT fk_whatsapp_account_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE whatsapp_link_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT NULL,
  INDEX idx_whatsapp_link_user (user_id),
  INDEX idx_whatsapp_link_expiry (expires_at),
  CONSTRAINT fk_whatsapp_link_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE whatsapp_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_id VARCHAR(200) NULL,
  phone_number VARCHAR(30) NOT NULL,
  user_id VARCHAR(36) NULL,
  direction VARCHAR(10) NOT NULL,
  message VARCHAR(200) NULL,
  intent VARCHAR(80) NULL,
  status VARCHAR(20) NOT NULL,
  created_at VARCHAR(35) NOT NULL,
  INDEX idx_whatsapp_messages_created (created_at),
  INDEX idx_whatsapp_messages_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE whatsapp_processed_messages (
  message_id VARCHAR(200) NOT NULL PRIMARY KEY,
  received_at BIGINT NOT NULL,
  INDEX idx_whatsapp_processed_received (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE whatsapp_sessions (
  phone_hash CHAR(64) NOT NULL PRIMARY KEY,
  state VARCHAR(100) NOT NULL,
  context_json LONGTEXT NULL,
  expires_at BIGINT NOT NULL,
  INDEX idx_whatsapp_sessions_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE whatsapp_notifications (
  event_key VARCHAR(191) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL,
  error VARCHAR(300) NULL,
  created_at VARCHAR(35) NOT NULL,
  PRIMARY KEY (event_key, user_id),
  INDEX idx_whatsapp_notifications_created (created_at),
  CONSTRAINT fk_whatsapp_notification_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
