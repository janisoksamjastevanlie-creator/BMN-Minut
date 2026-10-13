-- Apply once to the approved operational MySQL database before deploying this version.
-- Existing document rows remain unchanged; NULL storage_backend values identify legacy documents.
ALTER TABLE documents
  ADD COLUMN storage_backend VARCHAR(30) NULL,
  ADD COLUMN storage_key CHAR(36) NULL,
  ADD COLUMN storage_size_bytes BIGINT UNSIGNED NULL,
  ADD COLUMN sha256 CHAR(64) NULL,
  ADD COLUMN file_name VARCHAR(255) NULL,
  ADD COLUMN mime_type VARCHAR(127) NULL,
  ADD COLUMN uploaded_at DATETIME(3) NULL,
  ADD COLUMN description TEXT NULL,
  ADD COLUMN idempotency_key CHAR(36) NULL,
  ADD UNIQUE KEY uq_documents_storage_key (storage_key),
  ADD UNIQUE KEY uq_documents_idempotency_key (idempotency_key);
