# Haraj consent workflow v2

## Audit and plan

The initial implementation separated classification-neutral discovery from eligibility, but had these availability and correctness problems:

1. No request, subject-verification, grant, or revocation API: genuine consent could not be obtained through the application.
2. The newest subject-wide record shadowed permissions for unrelated numbers. V2 uses independent grants; revocation updates the actual records, never falls back to an earlier version of a revoked grant, and cancels pending requests.
3. One `export` scope conflated screen reveal, file download and commercial calling. V2 uses explicit actions. Legacy verified `export` permits reveal/download, not calls.
4. Save permission unnecessarily needed a separately entered lookup permission. The new disclosed save scope includes necessary collection; the consent receipt records both actions automatically.
5. Browser CSV/Excel functions exported cached values. Both now request fresh server-authorized rows, in batches of at most 200, and never fall back to cached phones on failure.
6. Reveal permission was checked outside the billing transaction. It now participates in the transaction so a refusal does not charge the user. Decision auditing commits on permission-denied reveal/calling paths.
7. Workflow ingestion replaced `incoming` before calling `indexOf`, yielding invalid accepted indices. The loop now preserves the original index.
8. PostgreSQL Date objects lost milliseconds through `Date.parse`; comparison now preserves timestamp precision.

Implemented plan: request → first-party identity and number verification → signed subject confirmation → independent workspace grant → automatic action checks → subject/workspace revocation and append-only audit.

## Classification is not authorization

| Contact classification | Meaning | Authorization |
| --- | --- | --- |
| `unknown` | No verified classification, including legacy records | No assumption; current verified scope required |
| `personal` | Individual-controlled mobile, verified by the first-party bridge | Explicit consent for each approved action and number |
| `public_business` | First-party-verified business contact classification | Same authorization checks; publication/STORE/keywords do not grant permission |

Commercial outreach requires `call`. Reveal or download permission alone does not authorize calls. This implementation provides no automatic legal-basis exemption for publicly listed business numbers. Saudi-mobile validation, subject ownership and deduplication remain in discovery/persistence. It does not contact private commenters to solicit consent automatically.

## Trust boundary and missing external dependency

**A real Haraj-controlled verification bridge and subject-facing consent screen must be configured before this flow can create production grants.** This repository implements the Wasla backend protocol, not Haraj's login/phone-verification system. An integration owner's assertion, an admin checkbox, a customer account's signup consent, a request URL, or possession of the challenge alone cannot grant permission.

The bridge must:

1. Open a trusted HTTPS consent screen for `request_id`, authenticate the Haraj subject, and verify that the authenticated author ID matches the request.
2. Verify control/ownership of each exact mobile number through Haraj's trusted verification system. It must not just copy phones from public pages.
3. Fetch the request/challenge through the bridge-only endpoint. Challenge retrieval is one-time; challenge lifetime is at most 30 minutes. A failed/expired delivery requires a new request.
4. Display the server-supplied disclosure and actual workspace recipient name/ID, actions, expiry and calling integration recipient. Allow refusal and narrower action/number scopes. Do not silently expand the subject's selection.
5. After explicit confirmation, sign the receipt below using its dedicated backend signing secret. Only the trusted bridge is allowed to assert identity/phone verification. Keep the full verification evidence and signed receipt in the first-party evidence store; Wasla stores a digest, reference, number hashes and approved scopes, not the raw receipt's phone list.
6. Offer authenticated withdrawal and send a signed revoke event. A revoke event withdraws all overlapping Haraj contact permissions for that subject/workspace and cancels pending requests. A later grant needs a fresh request and fresh subject confirmation.

No secrets, challenge tokens or raw phone numbers are placed in consent URLs. No invitation SMS/email is automatically sent. Link delivery must use an existing authorized first-party channel, not unsolicited collection/outreach to commenters.

## API contract

All paths below are relative to `/lead-agent`. Customer endpoints use existing authenticated active workspace resolution; request-body workspace IDs are ignored. Responses have `Cache-Control: no-store`. Customer APIs cannot create grants.

| Method / path | Auth | Purpose |
| --- | --- | --- |
| POST `/contact-consent/requests` | Workspace session | `{author_id, actions, expires_at}`; returns request ID, optional configured consent URL and disclosure. At most 5 requests per subject/workspace/hour; requests expire within 24h, grants requested for at most 366 days. |
| GET `/contact-consent/requests/:id` | Same workspace | Metadata/status; never challenge/hash/phones |
| POST `/contact-consent/status` | Workspace session | `{author_id, action, phone?}`; current decision, missing scope and next step. Phone required for number-specific actions. |
| POST `/contact-consent/revoke` | Workspace session | `{author_id}`; withdraw all subject scopes in this workspace, cancel pending requests |
| GET `/contact-consent/audit?author_id=…&limit=50` | Workspace session | Latest 1–100 phone-free events in this workspace |
| POST `/integrations/contact-consent/requests/:id/challenge` | Dedicated bridge bearer | Trusted one-time challenge retrieval |
| POST `/integrations/contact-consent/events` | Dedicated signed attestation | Idempotent subject-confirmed grant/revoke |
| POST `/leads/export` | Workspace session | `{lead_ids:[…]}` (max 200); verifies workspace access, existing paid access and current `download` permission; returns fresh export rows |
| POST `/integrations/calls/authorize` | Existing workflow secret | `{request_id,lead_id}`; fresh `call` permission and number immediately before dispatch |
| POST `/integrations/calls` | Existing workflow secret | Registers call under current explicit call authorization; checks request membership and uses a transaction |

Allowed actions: `lookup`, `save`, `reveal`, `download`, `call`. `save` includes `lookup` explicitly in the recorded receipt. There is no V2 generic `export` action. Existing verified V1 `export` retains reveal/download compatibility, never expands to calling. Multiple independent valid V2 grants can cover different numbers/actions without another manual approval.

Statuses include `authorized`, `partially_authorized` (multi-number response), `consent_required`, `scope_mismatch`, `verification_required`, `expired`, `revoked`, `action_required`, `phone_scope_required`, `configuration_required`, and `missing` (no valid phone). Exclusion objects preserve `reason`, `detail`, `stage`, `status`, `requiredActions`, and `nextStep` without returning the excluded phone.

### Signed grant example (synthetic only)

```json
{
  "event_id": "a9f7f9eb-6dcb-4b8e-81cb-ea77642386a5",
  "issuer": "YOUR_CONFIGURED_FIRST_PARTY_ISSUER",
  "type": "grant",
  "request_id": "REQUEST_UUID",
  "subject_author_id": "VERIFIED_HARAJ_AUTHOR_ID",
  "statement_version": "haraj-commercial-contact-v2",
  "verification_method": "haraj_session_and_phone_verification",
  "contact_kind": "personal",
  "actions": ["lookup", "save", "reveal", "download", "call"],
  "verified_phones": ["EXACT_VERIFIED_SAUDI_MOBILE"],
  "expires_at": "SUBJECT_APPROVED_ISO_TIMESTAMP",
  "challenge": "BRIDGE_ONLY_ONE_TIME_CHALLENGE"
}
```

Use `canonicalConsentJson` from `contact-consent.js`: recursively sort object keys; preserve array order. Timestamp is current Unix seconds. Set:

```text
x-consent-timestamp: UNIX_SECONDS
x-consent-event-id: EVENT_UUID
x-consent-signature: sha256=HEX_HMAC_SHA256(signingSecret,
    timestamp + "." + eventId + "." + canonicalConsentJson(body))
```

Receipts must be within five minutes of server time and no larger than 32KB. Event IDs are UUIDs. Duplicate identical receipts are idempotent; changed payloads with reused IDs are rejected. Expired/consumed challenges, incorrect subjects, invalid phones, scope escalation and receipts extending requested expiry are rejected. A duplicate grant receipt after revocation returns `already_processed` and does not restore permission.

Revoke receipt: `{event_id, issuer, type:"revoke", authorization_id, subject_author_id}`, signed identically after the bridge authenticates the withdrawing subject. The authorization ID identifies the workspace whose scopes are withdrawn.

## Revocation guarantees and limits

Every save/reveal/download/call permission decision queries the current database. No authorization result is cached. Shared transaction-level advisory locks for authorized use serialize against exclusive grant/revocation locks; final writes and billing stay in the checking transaction. A revocation waits for already-in-flight authorized transactions, then all subsequent decisions deny. Permission checks also apply to legacy saved records and paid reveals. Existing valid independent permissions are not discarded merely because another number has a newer grant.

The calling workflow must call `/integrations/calls/authorize` **immediately before each provider dispatch/retry**, not reuse a `call_candidates` array or saved phone from a prior run. Updating the external workflow is a deployment prerequisite; registration alone is not proof that an earlier dispatch was authorized. Already dispatched calls and already downloaded/disclosed data cannot be remotely recalled by a database revocation. Cancel queued provider work on withdrawal in the external workflow; recheck authorization on any subsequent retry. No claim is made that this backend can undo disclosure already completed by another system.

The audit records request, challenge, grant, revocation and permission decisions, without raw phone/challenge/receipt bodies. The SQL trigger rejects UPDATE/DELETE through ordinary database operations. A database owner could still alter schema/disable triggers; production needs least-privilege application and migration roles, audit retention/archival and restricted evidence-store access. Historical personal data cleanup is not performed by these migrations.

## Deployment steps (not performed on production)

1. Back up the database and inspect the diff; this working tree contains unrelated pre-existing changes. Stop/coordinate active lead jobs for the backend restart. Verify these raw tables are not customer-editable through Directus collection policies, flows, SQL roles, or other generic endpoints.
2. Apply, in order, with the migration role (adjust Docker host/database/user to your deployment):

```sh
docker -H unix:///Users/altahan/.docker/run/docker.sock exec -i waslah_postgres psql -v ON_ERROR_STOP=1 -U waslah -d waslah < directus/migrations/20261022_contact_authorizations.sql
docker -H unix:///Users/altahan/.docker/run/docker.sock exec -i waslah_postgres psql -v ON_ERROR_STOP=1 -U waslah -d waslah < directus/migrations/20261022_contact_consent_workflow.sql
```

3. In the backend's secret manager / `.env.docker`, configure independent random secrets (at least 32 characters each), the exact trusted issuer and the HTTPS first-party portal:

```text
HARAJ_CONSENT_BRIDGE_TOKEN=...
HARAJ_CONSENT_SIGNING_SECRET=...
HARAJ_CONSENT_ISSUER=...
HARAJ_CONSENT_PORTAL_URL=https://YOUR_FIRST_PARTY_HOST/consent
```

Do not print secrets, put them into VITE variables, grant a customer access to them, or reuse the workflow secret. Recreate the backend container to load new environment variables (`pm2 reload` alone does not read changed compose env files). Keep old/new signing-key rotation coordinated with the bridge; this version supports one configured active signing key.

4. Configure and independently verify the real bridge/consent UI and update external calling workflow preflight/revocation handling. Without them the backend protocol is implemented but end-to-end consent acquisition is **not operational**. No production consent is fabricated or seeded by deployment.
5. Run checks:

```sh
/Users/altahan/.bun/bin/bun scripts/test-contact-authorization.mjs
/Users/altahan/.bun/bin/bun scripts/test-contact-consent-workflow.mjs
/Users/altahan/.bun/bin/bun scripts/run-contact-consent-postgres.mjs
/Users/altahan/.bun/bin/bun scripts/test-lite-comment-buyers.mjs
/Users/altahan/.bun/bin/bun node_modules/typescript/bin/tsc -b
VITE_DIRECTUS_URL=/directus /Users/altahan/.bun/bin/bun node_modules/vite/bin/vite.js build
```

The PostgreSQL runner creates/removes only a random isolated test schema. It validates the actual migrations twice, real grant transactions, concurrent receipt idempotency, revocation locking and audit append-only enforcement; it never calls a provider or changes production rows.

6. Deploy backend code and the rebuilt frontend together. For the local mounted-extension setup:

```sh
docker -H unix:///Users/altahan/.docker/run/docker.sock compose up -d --no-deps directus
docker -H unix:///Users/altahan/.docker/run/docker.sock build -f infra/Dockerfile.frontend-dist -t waslah/frontend:local .
docker -H unix:///Users/altahan/.docker/run/docker.sock compose up -d --no-deps --no-build frontend
```

7. With an actual consenting test subject, verify refusal, subset scopes, same-workspace reveal/download/call without manual approval, cross-workspace denial, expiry, duplicate events, and withdrawal after a paid reveal. Inspect audit records. Do not enable production collection until the first-party evidence and external calling checks pass.

Rollback: roll back application code only after evaluating its privacy guarantees; do not restore the old cached download path. Do not automatically delete consent/audit tables or revive revoked records. These migrations are additive; preserve their records for review and retention handling.

Token construction follows the secure random, single-use, expiring-token principles in the [OWASP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). This is a technical access-control implementation, not a determination that a proposed marketing activity is legally permitted.
