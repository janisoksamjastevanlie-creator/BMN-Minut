-- Additive fields for inventory brands and auditable, deferred receipt confirmation.
ALTER TABLE inventory_items
  ADD COLUMN merek VARCHAR(150) NULL AFTER nama;

ALTER TABLE inventory_requests
  ADD COLUMN app_metadata_json LONGTEXT NULL;
