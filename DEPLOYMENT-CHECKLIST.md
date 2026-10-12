# BMN-Minut deployment readiness

## Current status

**Not ready for production deployment.** `server.mjs` now has a fail-closed `DATA_BACKEND=operational` path: production rejects legacy mode, validates the existing relational/auth/WhatsApp schema without startup DDL, reads relational state, and routes state writes through the relational transaction adapter. Legacy schema creation and bootstrap seeding are confined to non-production legacy mode. These paths still require integration and staging validation.

The only available snapshot is schema-only; staging has no operational users, roles, or business rows. Login, permissions, and workflows therefore cannot be verified against real records, and there is no initial operational account until an authorized operator provisions one from an existing active `users` row. Cloudflare domain/team/AUD, active Tunnel, final HTTPS URL, and live Access policy are not available or verified. Do not call this deploy-ready or claim a public URL is active.

## Runtime requirements

- Node.js 22.5 or newer.
- A persistent Node.js process running the Express backend; a static-only frontend host is insufficient.
- A process supervisor such as PM2 can use `deploy/ecosystem.config.cjs`; provide database and provider secrets via the host's secret manager, not that file.
- A private, reachable MariaDB/MySQL instance with a verified backup and a separate staging database.
- Persistent storage for uploaded documents if files are moved out of the database in a later implementation. Currently document files are stored in relational database tables by the operational schema.
- An HTTPS origin in front of the application. If Cloudflare Tunnel is selected, `cloudflared` must run as a supervised persistent service on the application host.

The current scripts are:

```text
npm ci
npm run lint
npm test
npm run build
npm start
```

`npm start` is **not approved for the operational database** until the startup DDL, administrator seed, authentication, and state persistence paths have been replaced or safely isolated.

## Configuration inventory

Keep values in a hosting secret manager or a private environment file, never in Git or a `VITE_*` variable.

| Purpose | Variables | Notes |
|---|---|---|
| Application listener | `NODE_ENV`, `PORT`, `HOST` | Hosting normally supplies `PORT`; production listener must be reachable only through the intended reverse proxy or Tunnel. |
| Database mode | `DATA_BACKEND=operational`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_CONNECTION_LIMIT` | Production requires `operational`. Use a separately verified staging endpoint during testing. |
| Legacy development only | `DATA_BACKEND=legacy`, `ADMIN_NIP`, `ADMIN_PASSWORD` | This mode creates legacy tables and may seed a bootstrap account. Never point it at an operational or production database. |
| WhatsApp Meta | `WHATSAPP_PROVIDER=meta`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_GRAPH_API_VERSION`, optional template variables | Not verified against a live provider. |
| WhatsApp Twilio | `WHATSAPP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_KEY_SECRET`, `TWILIO_WHATSAPP_FROM` | Not verified against a live provider. |
| WhatsApp Fonnte | `WHATSAPP_PROVIDER=fonnte`, `FONNTE_TOKEN`, `FONNTE_API_URL`, `FONNTE_WEBHOOK_SECRET`, optional `WHATSAPP_BOT_NUMBER`, rate-limit/reminder variables | Enable Fonnte secret key webhook with the same 32+ character secret. Not verified against a live provider. |
| WhatsApp AI (Groq) | `WHATSAPP_AI_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL`, `WHATSAPP_AI_ENABLED` | Groq receives only incoming question text for intent classification; database records remain server-side. Verify model availability and privacy settings before production. |
| Public links | `APP_PUBLIC_URL` | Must be the final HTTPS origin before notifications are enabled. |
| Cloudflare Access | `ACCESS_REQUIRED`, `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_AUD` | The server now fails closed when Access is enabled; production always requires it. Use the exact team domain and AUD supplied by the Cloudflare administrator. |
| Optional outbound n8n | `N8N_ENABLED`, `N8N_BASE_URL`, `N8N_ALLOWED_HOSTS`, `N8N_WEBHOOK_PATH`, `N8N_WEBHOOK_SECRET`, `N8N_TIMEOUT_MS` | Disabled by default. Requires an independently reachable HTTPS n8n instance; exact hostname allowlist and shared Header Auth secret are mandatory. See [n8n integration guide](./automation/n8n/README.md). |

The selected authentication direction is to preserve NIP/password login and application sessions, with Cloudflare Access as a required outer layer in production. Access assertions are verified server-side and bound to exactly one matching active user email; client-supplied identity headers are not trusted. Operational login requires the manually applied `migrations/operational-auth-session-v1.sql` extension and a password hash provisioned for an existing operational user. Neither DDL nor account creation runs automatically at startup. Production schema/account changes require separate explicit approval.

`deploy/cloudflared-config.example.yml` is a placeholder only. Replace the tunnel ID, hostname, and credential path on the host after the Cloudflare administrator supplies real values. Do not commit the generated tunnel credentials or change active DNS/Access policies as part of preparation.

## Safe pre-deployment checks

1. Confirm the staging host and database are isolated from production by host, port, database name, and credentials.
2. Use only a data-bearing staging backup with authorization to process it. A schema-only snapshot can validate mappings and DDL, but not real-user login, roles, or business workflows.
3. Run `npm ci`, `npm run lint`, `npm test`, and `npm run build` on the development branch.
4. Apply only the reviewed manual staging migrations after read-only target verification. Run the server with explicit staging variables and `DATA_BACKEND=operational`. A successful `GET /api/health` proves process/database reachability only; it does not prove compatibility.
5. Test relational reads/writes, role checks, document upload/download, transaction atomicity, and rollback on staging. Confirm startup performs no DDL or account seeding in operational mode.
6. Test Cloudflare Access with a real Access application, verified issuer and AUD, and the final HTTPS URL. Confirm direct API requests cannot bypass Access.
7. Test WhatsApp with mocked provider calls or a provider sandbox and a designated test recipient. Do not send a real notification without separate approval.
8. Verify secret scanning and `git check-ignore` for private environment files, encrypted backups, key files, and database dumps.
9. If n8n is used, import and activate the workflow only after configuring its Header Auth credential and HTTPS production webhook. Run the event smoke test from the integration guide against staging; n8n outage does not roll back an application transaction, and delivery is best-effort without durable retries.

## Deployment and rollback gate

Do not perform a production cutover until all of these are true:

- The relational adapter supports every existing read and write workflow and passes staging tests.
- Existing authentication, sessions, roles, and user lifecycle are preserved and verified.
- Production startup performs no DDL, migration, administrator seeding, or sample-data fallback.
- Cloudflare Access JWT verification and HTTPS have been tested against the final URL and policy.
- WhatsApp behavior, failure isolation, and test-mode configuration are verified.
- A current, restorable backup and a tested rollback procedure exist.
- The production database connection, public cutover, and any production schema change have separate explicit approval.

For rollback, stop the application first, preserve the current database and logs, redeploy the last known-good application build, and restore a database backup only after assessing which writes would be lost. Never restore an older snapshot over a newer database without explicit approval.
