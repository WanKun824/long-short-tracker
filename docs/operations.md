# Operations

Production: https://lst.vincenvan.cc  
Admin: https://lst.vincenvan.cc/admin  
Worker: `long-short-tracker`  
Database: `long-short-tracker-db` (`0bf8d167-07e0-4b9e-b56b-57d62540d71a`)

## Daily refresh

Cloudflare Cron runs at `0 0 * * *`: 08:00 Asia/Hong_Kong / Asia/Taipei. Normal manual refreshes before 08:00 are deferred so they cannot consume that day's check. After 08:00, each Hong Kong calendar day is checked once. An authenticated administrator may explicitly force a maintenance run.

The scheduler calls the refresh function internally. HTTP headers cannot impersonate a scheduled invocation. `/api/refresh` requires either an administrator session with a matching Origin header or `x-refresh-secret` matching the optional `REFRESH_SECRET` secret. The public site no longer permits anonymous refresh calls.

A database lease prevents simultaneous refreshes. The lease expires after 15 minutes; interrupted history records older than 20 minutes become `timed_out` on the next refresh or admin-panel read. A failed SEC check does not advance the complete-refresh marker, allowing a retry that day.

## Manual API

Use the admin panel's **检查数据更新** button after signing in. The panel's **刷新面板** button only reloads the displayed records.

An authenticated same-origin request may POST JSON to `/api/refresh`:

```json
{"force": false, "notify": true}
```

For maintenance validation, `{"force":true,"notify":false}` refreshes data without sending subscription or operations test messages. Do not use quiet maintenance runs as the normal schedule: newly discovered news is stored without a broadcast. A later normal run may still deliver pending 13F notifications.

## SEC reporting managers

Select the most recent report period rather than a recently filed amendment of an older quarter. Follow a `13F-NT` notice to its named reporting manager and confirm that both report periods match. When the parent consolidates several managers, include only information-table rows carrying the tracked manager's sequence number. Circular, ambiguous or mismatched references require review instead of silently using old data.

For Pershing Square, the Q2 2026 notice at CIK `1336528` points to PERSHING SQUARE INC., CIK `2026053`. The tracked manager is sequence `1`; rows belonging only to other managers must be excluded. The holdings API returns the actual filing URL and reporting CIK.

## News health

The admin panel displays each source's last check, last success, latest article date, effective article count and failure detail. RSS success requires useful, recent content; an HTTP 200 response alone is not evidence of freshness. The obsolete WSJ Markets RSS is disabled. WSJ remains an allowed publisher for discovery through GDELT.

RSS titles and feed descriptions are matched against the institution/manager registry. GDELT, direct RSS and optional X calls have bounded timeouts. X authentication/payment/permission failures enter a seven-day retry interval; other X failures retry after one day. News and summary failures remain silent and never trigger operational-failure emails.

## Email delivery and retries

`sent` means Resend accepted the message. Delivery receipts are stored separately as `email.delivered`, `email.bounced`, etc. The panel labels submitted messages separately from confirmed delivery.

News digests and subscription-status messages are persisted in `email_outbox` before sending, with Resend idempotency keys. Failed or interrupted deliveries are retried during the next normal refresh, even when no new news is discovered. Unsubscribed recipients are excluded. Historical failures predating this outbox cannot have their missing message bodies reconstructed automatically.

The daily task retrieves recent delivery status through Resend's GET email API. The API key must have permission to read email details. If it is a send-only key, delivery tracking degrades silently and the panel records the access problem.

For real-time receipts:

1. In Resend → Webhooks, add `https://lst.vincenvan.cc/api/webhooks/resend` and subscribe to sent, delivered, delayed, bounced, complained and failed email events.
2. Store its signing secret using `npx wrangler secret put RESEND_WEBHOOK_SECRET`.
3. Confirm a signed event appears in `delivery_events`. Unsigned, altered or replayed requests are rejected. Event IDs are deduplicated.

## Deploy and verify

The patched production dependency audit is clean. Four moderate development-only audit entries remain in the legacy `drizzle-kit` → `@esbuild-kit` → `esbuild` chain. The vulnerable esbuild development-server feature is not used by this production Worker. Avoid `npm audit fix --force`, which proposes downgrading the database tooling to an incompatible older major version.

```powershell
npm ci
npx wrangler types
npx tsc --noEmit --incremental false
npm test
npm audit --omit=dev
npx wrangler login
npx wrangler deploy --dry-run
npx wrangler deploy
```

The application creates missing additive tables idempotently. `drizzle/0003_hesitant_surge.sql` records their schema for migration-managed installations; do not blindly reapply CREATE statements to a database whose tables were already initialized by the app. Existing subscribers, snapshots and deliveries are preserved.

After deployment, check `/api/status`, the protected admin history, source health and SEC snapshot links. An unauthenticated POST to `/api/refresh` must return 401. The legacy `holdings-lens-cn…chatgpt.site` publication is not the production deployment target.
