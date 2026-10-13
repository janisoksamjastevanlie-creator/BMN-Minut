-- Apply once to the approved operational MySQL database before deploying this version.
-- Existing document rows remain unchanged; NULL values identify legacy/local documents.
ALTER TABLE documents
  ADD COLUMN google_drive_file_id VARCHAR(255) NULL,
  ADD COLUMN file_name VARCHAR(255) NULL,
  ADD COLUMN mime_type VARCHAR(127) NULL,
  ADD COLUMN uploaded_at DATETIME(3) NULL,
  ADD COLUMN description TEXT NULL,
  ADD COLUMN idempotency_key CHAR(36) NULL,
  ADD UNIQUE KEY uq_documents_google_drive_file_id (google_drive_file_id),
  ADD UNIQUE KEY uq_documents_idempotency_key (idempotency_key);
