-- Back up the production database before applying this migration.
-- Apply manually; do not run this file automatically against production.
ALTER TABLE bmn_assets
  ADD COLUMN master_fields_json LONGTEXT NULL AFTER keterangan;
