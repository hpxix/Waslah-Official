# Haraj request safety

All search and phone HTTP calls use one **deployment-wide** PostgreSQL-backed
guard. It is deliberately not keyed by campaign, user or token: changing an
account/token must not bypass a provider restriction. Separate Wasla deployments
using the same provider account must share this database/guard or not run in parallel.

## Defaults and review

New installs start **paused** (`access_review_required`). No token is probed.
An admin must confirm authorized provider access, the access method and permitted
limits in **Admin → Lite limits → Haraj connection safety**. These defaults are
internal conservative ceilings, not provider-approved limits:

- One request in flight, at least 3 seconds between completion and the next call.
- 1,000 total HTTP requests and 100 phone lookups per UTC day across all campaigns.
- Disable further phone lookups after five consecutive empty phone responses,
  regardless of earlier successes. Listing search and public-contact delivery
  continue; there are no automatic phone probes.
- At most 100 phone lookup candidates per campaign; a success cannot bypass this.
  Reaching that ceiling does not prevent subsequent public-contact leads.
- No automatic contact-reveal retries or periodic probing. Idempotent listing
  searches may retry at most twice on transport/408/5xx failures, with backoff;
  every retry re-enters this same guard and consumes budget. Authentication,
  restrictions, rate limits, malformed responses and safety pauses never retry.
- Cache contact responses for 24 hours; unavailable contacts for 6 hours. Bounded
  to 500 entries shared across campaigns. Cached data is excluded from admin status.
- Only relevant, qualified candidates reach the existing contact scheduler.
- Automated lookups no longer claim `isManualRequest: true`. This does not establish
  permission to automate; provider approval is still required.

HTTP 401/402/403/429, equivalent GraphQL errors even under HTTP 200, malformed
responses and three consecutive transport failures pause all further requests.
Empty contacts and the daily phone budget pause phone lookups only, without
disabling public-contact listing search. Both numeric and HTTP-date `Retry-After` are respected; only
an administrator can resume, never before that timestamp. Daily rollover, retries,
token changes and restarts do **not** clear a pause or reset the day's consumption.

The guard reserves a durable 60-second lease and budget **before** network I/O.
Network timeout is at most 20 seconds. A worker crash leaves a lease; expiry causes
an explicit review pause, not an automatic retry. No DB transaction/connection is
held while waiting for another worker or performing HTTP I/O.

## Admin API

Both endpoints require existing `adminContext` authorization:

- `GET /lead-agent/admin/haraj-safety`: sanitized status, daily counters, last 50
  status-only events and configured limits. No token or cached contact data.
- `POST /lead-agent/admin/haraj-safety`: `{action:"pause"}` or
  `{action:"resume", confirmed:true, limits:{intervalMs:3000, requestsPerDay:1000,
  contactsPerDay:100, emptyContactLimit:5}}`. Resume does not restart campaigns.
- Explicit first-run setup: `{action:"setup", confirmed:true}`. This admin-only
  action enables the conservative defaults ONLY when the reason is the original
  `access_review_required`, all request counts are zero and no request is active.
  It records operator authorization, not a claim of provider approval. It cannot
  reset or clear any actual provider denial, usage limit or administrator pause.

Historical evidence for public-contact-first sourcing: October 14 campaigns
`db3f180d-01d1-49b5-8417-60d76c363f30` and
`fc48f1e6-a363-4422-b6e6-8430bc87c86b` saved 200 and 50 leads respectively,
entirely from public phone details, despite zero remote phone hits. Empty phone
responses are therefore not evidence that listing search has no useful leads.

If blocked by usage limits, do not raise them simply to work around the pause.
Review provider permission and usage first. Prefer approved integration/API access
or licensed contact data over automating a consumer account's phone-reveal feature.

## Alerts and failures

Safety pauses send `WASLA LITE — CONTACT RETRIEVAL PAUSED` to
`mastergotmemes@gmail.com` using the existing Directus MailService. They state the
actual sanitized reason, not a fictitious out-of-credits diagnosis. SMTP must be
configured (`EMAIL_FROM`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_USER`,
`EMAIL_SMTP_PASSWORD`). Mail failure never reopens the guard. Duplicate alerts are
suppressed for one hour per reason within a process; a restart may repeat an alert.

The safety row stores counters, lease, pause and short contact cache in the new
`wasla_haraj_safety` table (created idempotently on first use). Use the admin pause
before maintenance. Do not delete/reset this table to bypass a restriction.

Invalid endpoints are rejected without including supplied values in errors; URLs
must be HTTPS under `haraj.com.sa` and cannot contain URL credentials or fragments.
Only validated metadata query parameters (`queryName`, `lang`, `clientId`,
`version`) are accepted; unknown, duplicate or credential-bearing fields are rejected.
Historical errors may already contain secrets from earlier configuration mistakes;
review/rotate affected credentials through the provider and handle log retention
separately. No historical records are rewritten by this change.

## Verification (offline)

`bun scripts/test-haraj-safety.mjs` exercises two workers sharing a store, request
spacing, budgets, negative/success caches, restarts, 401/403/429 and HTTP-200 denial,
lease recovery, malformed responses, configuration redaction and synthetic email
delivery. HTTP is mocked; no live token or provider request is used.

`docker exec -i waslah_directus node --input-type=module < scripts/test-haraj-safety-postgres.mjs`
checks the real PostgreSQL adapter in a unique temporary schema and removes only
that schema afterward. It verifies concurrent cold starts, cross-worker request
spacing, a shared hard budget and restart-persistent pauses with no provider calls.
