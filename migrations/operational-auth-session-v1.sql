-- Apply manually to an inspected staging database only.
-- This migration is intentionally not run by application startup.
CREATE TABLE auth_users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nip VARCHAR(30) NOT NULL UNIQUE,
  profile_json LONGTEXT NOT NULL,
  salt CHAR(32) NOT NULL,
  password_hash CHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auth_users_operational_user FOREIGN KEY (id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX idx_sessions_user_id (user_id),
  INDEX idx_sessions_expires_at (expires_at),
  CONSTRAINT fk_sessions_auth_user FOREIGN KEY (user_id)
    REFERENCES auth_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_meta (`key`, value) VALUES ('revision', '0');
