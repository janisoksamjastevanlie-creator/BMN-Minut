-- Additive migration for document receipt items and nota belanja metadata
-- Compatible with operational MySQL schema.
-- Documents can optionally have receipt metadata and line items in document_receipt_items.

ALTER TABLE documents
  ADD COLUMN nama_toko VARCHAR(150) NULL,
  ADD COLUMN kategori_nota VARCHAR(10) NULL,
  ADD COLUMN total_nilai_nota DECIMAL(15, 2) NULL;

CREATE TABLE IF NOT EXISTS document_receipt_items (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NULL,
  nama_barang VARCHAR(200) NOT NULL,
  kategori VARCHAR(10) NOT NULL,
  satuan VARCHAR(30) NOT NULL,
  jumlah INT NOT NULL,
  harga_satuan DECIMAL(15, 2) NOT NULL,
  total_harga DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_receipt_items_doc (document_id),
  INDEX idx_receipt_items_item (item_id),
  CONSTRAINT fk_receipt_items_doc FOREIGN KEY (document_id)
    REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_receipt_items_inventory FOREIGN KEY (item_id)
    REFERENCES inventory_items(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
