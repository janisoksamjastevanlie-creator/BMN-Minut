# BMN-Minut operational database readiness

## Status

**Not ready for production or public deployment.** The operational backend is now wired to relational reads and the `/api/state` transactional write path; production rejects legacy mode and does not run startup DDL or seed an administrator. However, the only snapshot is schema-only, there are no operational users/roles/business rows in the isolated staging copy, and real workflows cannot be validated. No Cloudflare Tunnel, Access policy, domain, HTTPS URL, or public endpoint has been configured or verified. Never run legacy mode against `bmnminut`.

## Backup search and database safety

Searches were limited to likely locations: the complete `C:\Users\User` profile (including the project and standard user folders), `C:\Users\User\AppData\Local\BMN-Minut\ProductionCloneStaging`, common `C:\Backup(s)` and `D:\Backup(s)` folders, and exact-name metadata searches in `G:\My Drive` and `G:\.Encrypted`. No second `bmnminut.sql.aes` / `bmnminut.key.dpapi` pair was found.

The only pair is:

- `C:\Users\User\AppData\Local\BMN-Minut\ProductionCloneStaging\20261010-230708\bmnminut.sql.aes`
- `C:\Users\User\AppData\Local\BMN-Minut\ProductionCloneStaging\20261010-230708\bmnminut.key.dpapi`

The encrypted SQL file is 29,656 bytes. Its integrity and decryption were verified under the authorized Windows profile; it contains 23 `CREATE TABLE` statements and **zero `INSERT` or `REPLACE` statements**. It is not a backup of operational records. The key contents have not been displayed or shared.

Read-only checks against production at `127.0.0.1:3306` confirmed the database identity and all 23 base tables use InnoDB. Exact `COUNT(*)` checks found **0 rows across all 23 tables**, including `users` and `roles`. No production DDL, seeding, or data write was performed.

The isolated MariaDB staging service is on `127.0.0.1:3308`. It has the 23 base tables plus 12 compatibility/WhatsApp tables and seven added columns from the approved staging migration. The relational read adapter validates the staging schema, but all operational collections, users, and roles are empty. No snapshot restore or synthetic data load was performed during this work.

## Mapping of legacy storage

`app_data` is a whole-collection JSON snapshot store; it has no direct table equivalent. Each collection must be mapped to its normalized tables rather than copied into an alternative operational collection.

| Legacy `app_data` collection | Operational tables | Main compatibility notes |
|---|---|---|
| `rooms` | `rooms`, `buildings` | Building is a foreign key; 3D room dimensions/type/capacity/area need `rooms.app_metadata_json`. |
| `assets` | `bmn_assets`, `asset_categories`, `buildings`, `rooms` | UI stores category/building/room labels; adapter must resolve them to IDs and preserve acquisition, valuation, condition, location, and status fields. |
| `inventoryItems` | `inventory_items`, `inventory_categories`, `inventory_locations` | UI stores category/location labels; current value is a generated database column in the operational schema. |
| `stockInList` | `stock_in`, `stock_in_items` | UI rows are transaction details; several rows may share one transaction header. Review/verification state and review metadata need `stock_in.app_metadata_json`. |
| `stockOutList` | `stock_out`, `stock_out_items` | Header/detail split; the application’s per-item rows must not be flattened into the header. |
| `requests` | `inventory_requests`, staging extension `inventory_request_items` | Base table supports one item; application supports multi-item requests. The extension is required to preserve all items and per-item approvals. |
| `opnames` | `stock_opnames`, `stock_opname_items` | Header/detail relationship; adjustment status needs the approved staging column `status_penyesuaian`. |
| `movements` | `asset_movements`, `bmn_assets`, `rooms` | Status is stored on the transaction; completion may also need to update asset location atomically. |
| `maintenances` | `asset_maintenance`, `bmn_assets` | Preserve ticket status, dates, cost, vendor, and asset link. |
| `disposals` | `asset_disposals`, `bmn_assets` | Preserve approval/status history and document reference; deletion must respect the asset foreign key. |
| `documents` | `documents`, staging extension `document_files` | Metadata is in `documents`; file bytes, filename, MIME type, and digest are in the extension. Existing Data URL API payloads increase transfer size. |
| `auditLogs` | `audit_logs`, `users` | Audit rows reference operational users; identity fields must be server-derived where possible. |
| `notifications` | `notifications` | Global application notifications; no per-user ownership column exists in the base table. |
| `users` | `users`, `roles` | User profile and active flag map to relational rows; role is `role_id`. Operational `users` has no password hash. |
| `roles` | `roles`, staging extension `roles.app_metadata_json` | The base role stores name/description only; application permission bits, code, color, and system flag need metadata. Missing permission metadata must fail closed, not inherit sample permissions. |

The base schema does not contain password hashes or application sessions. A separately reviewed, manual authentication extension maps those features without changing `users`:

| Legacy table | Operational equivalent | Required behavior |
|---|---|---|
| `auth_users` | Manual extension `auth_users` table, FK to `users.id` | Preserves the existing NIP/password login using scrypt hashes; Access JWT email must also match exactly one active `users.email`. No credentials are copied from the legacy store. |
| `sessions` | Manual extension `sessions` table, FK to `auth_users.id` | Stores hashed random session tokens with expiry; cookies are HttpOnly/SameSite=Strict and Secure in production. Expired sessions are rejected. |

`stock_card_ledger` is a 23rd base table and is included in the read adapter. Operational stock-card UI now requests these persisted ledger rows directly; it does not synthesize an opening balance from frontend examples. Ledger writes remain server-generated by the transactional adapter.

## Base relational tables and keys

All 23 base tables have an `id` primary key. The following foreign keys were confirmed from staging metadata:

| Table | Foreign key | Referenced table/column |
|---|---|---|
| `rooms` | `building_id` | `buildings.id` |
| `bmn_assets` | `kategori_id`; `gedung_id`; `ruangan_id` | `asset_categories.id`; `buildings.id`; `rooms.id` |
| `inventory_items` | `kategori_id`; `lokasi_id` | `inventory_categories.id`; `inventory_locations.id` |
| `stock_in_items` | `stock_in_id`; `item_id` | `stock_in.id`; `inventory_items.id` |
| `stock_out_items` | `stock_out_id`; `item_id` | `stock_out.id`; `inventory_items.id` |
| `inventory_requests` | `item_id` | `inventory_items.id` |
| `stock_opname_items` | `opname_id`; `item_id` | `stock_opnames.id`; `inventory_items.id` |
| `stock_card_ledger` | `item_id` | `inventory_items.id` |
| `asset_movements` | `asset_id`; `ruangan_asal_id`; `ruangan_tujuan_id` | `bmn_assets.id`; `rooms.id`; `rooms.id` |
| `asset_maintenance` | `asset_id` | `bmn_assets.id` |
| `asset_disposals` | `asset_id` | `bmn_assets.id` |
| `audit_logs` | `user_id` | `users.id` |
| `users` | `role_id` | `roles.id` |

The remaining base tables are `asset_categories`, `buildings`, `documents`, `inventory_categories`, `inventory_locations`, `notifications`, `roles`, `stock_in`, `stock_opnames`, and `stock_out`. The approved staging extension adds `app_meta`, `inventory_request_items`, `document_files`, and nine WhatsApp tables; it does not authorize applying that DDL to production.

## Feature and risk findings

- Legacy `app_data` schema creation, administrator bootstrap, session cleanup, and WhatsApp DDL are gated to non-production legacy mode. Production requires `DATA_BACKEND=operational`; its startup checks schema and revision but does not run DDL or seeding.
- Operational `/api/state` loads relational arrays, uses revision locking, and invokes the relational writer in the same database transaction. Empty relational state is not initialized from `initialData.ts`; the UI's legacy fixtures are not sent to operational storage.
- Cloudflare Access assertions are verified server-side for login and authenticated routes; user email must resolve to exactly one active operational user. `/api/health` returns a generic status, while the provider webhook retains its provider-specific signature/secret checks.
- Role permissions are not in the base relational schema. The staging metadata extension is required; absent permission metadata fails closed. User/role lifecycle and first-account provisioning still need staging validation with authorized existing user records.
- The write adapter maps request detail cardinality, stock receipts/issues, opname adjustments, asset history, documents, notifications, and audit rows transactionally. In-memory tests cover core ledger cases, but complete functional and rollback coverage is still pending.
- Uploads currently travel as Data URLs inside a whole-state JSON request with a 25 MB parser limit. The document extension stores a BLOB and checksum; size validation and memory use need functional testing.
- The operational UI derives warehouse rack labels from `inventory_locations`; 3D placement is display-only because the relational schema contains no physical rack coordinates. Reports, printing, spreadsheet import/export, and user/role management still need full staging workflow tests.
- WhatsApp store creation has an operational no-DDL option; the required tables must already exist. Provider credentials, retries, notification behavior, and failure isolation remain unverified against staging/provider configuration.

## Work and verification completed

Files changed in the current worktree include:

- `cloudflareAccess.mjs`: reject non-canonical base64url signature encodings before signature verification.
- `operationalStore.mjs`: fail closed for roles with missing permission metadata; include `stock_card_ledger` in schema validation and reads; remove a redundant maintenance join.
- `operationalWrites.mjs` and `server.mjs`: transact operational state writes, enforce the production backend gate, and leave legacy DDL/seed behavior in development-only legacy mode.
- `whatsapp/store.mjs` and `whatsapp/service.mjs`: permit operational startup without schema DDL.
- `src/context/AppContext.tsx` and `src/components/inventory/StockCardModal.tsx`: load operational rack references and read the persisted stock ledger rather than displaying an invented opening entry.
- `.env.example`, `.gitignore`, `README.md`, `DEPLOYMENT-CHECKLIST.md`, `deploy/cloudflared-config.example.yml`, and `deploy/ecosystem.config.cjs`: document safe config placeholders and supervised runtime; no active Tunnel/DNS settings or secrets were changed.
- `tests/cloudflare-access.test.mjs`: tamper with a signature byte instead of an ineffective trailing base64url bit.
- `tests/production-smoke.test.mjs`: set missing DB variables to empty strings so dotenv cannot load the developer `.env` and trigger an unintended connection during the test.
- `tests/operational-store.test.mjs`: test schema failure, empty role metadata, ledger mapping, and ambiguous user lookup.
- This report.

Validation:

- Latest test/lint/build results are recorded in the session completion report; build emits a large JavaScript chunk warning.
- MariaDB staging is listening only on `127.0.0.1:3308`; no application listener is active on port 3000. The current private `.env` target was classified as not matching the approved staging endpoint, so no DB connection was attempted and no config was changed.
- Earlier read-only staging verification found 35 tables and no operational user/role/business records. No current-stage migration or application startup was run in this phase.
- `http://127.0.0.1:3000/api/health`: no listener; the request does not respond. No Cloudflare Tunnel process, executable, or default config file was found. No public URL has been verified.
- `.env` is not tracked by Git. It was not changed.

## Remaining steps and approvals

1. Provide an explicitly authorized data-bearing backup and its matching DPAPI key through the protected local staging process; the existing verified snapshot is schema-only and cannot populate staging with operational records.
2. Provide or securely configure staging-only DB credentials; the current `.env` is not pointed at `127.0.0.1:3308`, and it was not changed. Re-verify staging identity and table state before applying the pending auth extension.
3. With real staging users/roles present, test login/logout, Access email binding, permission denials, reads/writes, related records, reports, uploads, and rollback. Do not use synthetic operational data.
4. Obtain Cloudflare team domain, Access audience, named-tunnel/domain details, and secret-manager settings; then verify HTTPS and the public health endpoint without exposing database ports.
5. Request separate explicit approval before any production schema extension, data write, application connection to production, real WhatsApp send, or public cutover. Preserve a rollback/backup path.
