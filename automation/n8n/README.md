# BMN-Minut outbound n8n events

This integration sends a minimal outbound event after an authorized `/api/state` transaction commits. It does not give n8n database access, add an inbound application endpoint, send WhatsApp messages, or change permissions and business workflows. It is disabled by default.

## Supported events

| Existing application change | Event type |
|---|---|
| New request saved as `Diajukan` | `request.submitted` |
| Status changed to `Diverifikasi` | `request.verified` |
| Status changed to `Disetujui` | `request.approved` |
| Status changed to `Ditolak` | `request.rejected` |
| Status changed to `Diproses` | `request.processing` |
| Status changed to `Selesai` | `request.completed` |
| Request removed with a new `Pembatalan Permohonan Barang` audit entry | `request.cancelled` |

No event is emitted for drafts or unrelated collection changes. Status names are the values already used by the application. The payload excludes names, phone numbers, item details, reasons, credentials, and session data:

```json
{
  "eventId": "stable-uuid-for-this-committed-transition",
  "schemaVersion": 1,
  "eventType": "request.approved",
  "occurredAt": "2026-10-13T00:00:00.000Z",
  "data": {
    "requestId": "request-id",
    "status": "Disetujui",
    "previousStatus": "Diverifikasi"
  }
}
```

The `eventId` is deterministic for the request transition and committed application revision. Repeating a state save with an old revision is rejected by the existing optimistic concurrency check. The included workflow validates and acknowledges events only; its acknowledgement has no business side effect, so repeated deliveries are safe. Add a durable deduplication step keyed by `eventId` before adding any non-idempotent downstream action.

## Import and activate the workflow

1. Import `bmn-minut-request-events.json` in n8n. It is intentionally inactive and contains no credential value.
2. Create an n8n **Header Auth** credential with header name `x-bmn-webhook-secret` and a random secret of at least 32 characters. Assign it to **Receive BMN-Minut event**. Do not export the credential with workflow JSON.
3. Use a publicly reachable n8n instance with a valid HTTPS certificate. Set its public webhook URL and reverse proxy configuration consistently. The production webhook path is `/webhook/bmn-minut/events`; the test path is not used by the application.
4. Activate the workflow. Confirm the production webhook URL is displayed by n8n and is reachable from the application host.
5. Configure the application environment variables below in the host's secret manager, restart the application, then test with a non-production/staging request before enabling production events.

The workflow rejects missing/invalid event IDs, unsupported event types, malformed envelope fields, and timestamps more than five minutes from receipt. n8n's Header Auth credential checks the shared secret before the workflow starts. TLS protects the secret in transit. There is no callback to BMN-Minut because this acknowledgement-only workflow needs none.

## Backend configuration

Set these variables on the backend host only:

| Variable | Required when enabled | Example / rule |
|---|---:|---|
| `N8N_ENABLED` | Yes | `true`; default is `false` |
| `N8N_BASE_URL` | Yes | `https://automation.example.org` (origin only) |
| `N8N_ALLOWED_HOSTS` | Yes | Exact hostname, e.g. `automation.example.org`; comma-separated exact hostnames are supported |
| `N8N_WEBHOOK_PATH` | Yes | `/webhook/bmn-minut/events` |
| `N8N_WEBHOOK_SECRET` | Yes | Same value as the n8n Header Auth credential; minimum 32 characters |
| `N8N_TIMEOUT_MS` | No | `10000`; valid range 1000–60000 |

Only HTTPS, port 443, an exact hostname in `N8N_ALLOWED_HOSTS`, and a fixed relative webhook path are accepted. The target URL is never read from a user request. Keep the secret out of Git, frontend variables, logs, and exported workflow files.

If the settings are invalid, the integration remains disabled and logs a generic configuration error. If n8n is unavailable, the already-committed application save still succeeds; the server logs a safe error code and event ID. Delivery is best-effort and is not retried or durably queued, so this version must not be used for critical actions that require guaranteed delivery.

## Staging smoke test

Use an isolated staging database and a test n8n workflow/credential. Do not create a fake request in production or trigger real notifications.

1. Keep `N8N_ENABLED=false`; verify the app starts and existing request saves work without n8n.
2. In staging, configure all variables and activate the imported workflow.
3. Submit or transition a staging request using the application's normal authorized UI. Verify the n8n execution includes only the documented event envelope and receives a 202 response.
4. Replay a captured event only against the acknowledgement-only workflow; verify it causes no business action. Never replay production payloads into a workflow with side effects.
5. Try an invalid secret and stale timestamp directly against a staging webhook; verify the webhook rejects the secret and the workflow rejects stale timestamps. Do not include the secret in shell history or shared logs.
6. Temporarily stop/restrict the staging n8n instance and verify the application save succeeds while a safe `N8N_*` error code is logged.

These are instructions, not evidence that staging or production has been tested. No external hosting or n8n access is configured by this repository change.

## Disable / rollback

Set `N8N_ENABLED=false` in the backend secret manager and restart the application. This does not affect existing WhatsApp delivery or application data. If the workflow itself needs to be rolled back, deactivate it in n8n; no application database migration or production DNS change is required.
