# Waslah Directus Data Model

`directus/bootstrap.mjs` creates and incrementally updates this schema. It is safe to run on every deploy.

## Tenant And Identity

- `organizations`: customer workspace and hard tenant boundary.
- `organization_members`: role and status for each Directus user in a workspace.
- `customer_profiles`: application profile, E.164 phone, verification time, avatar seed, and locale.
- `wallets`: cached workspace balance in halalas. One wallet per organization.
- `wallet_transactions`: immutable ledger. Unique idempotency keys prevent duplicate grants and charges.
- `phone_verifications`: short-lived OTP attempts. Local codes are hashed; Twilio owns live OTP codes.

Application users have the `Waslah Customer` Directus role. They do not receive raw collection permissions. The `/lead-agent` extension authenticates them with normal Directus access tokens and enforces workspace ownership on every query.

Account creation requires explicit acceptance of the versioned Privacy Policy and Permissions document. Directus stores `privacy_consent_at`, `permissions_consent_at`, and `consent_version` on `customer_profiles`; both email and first-time social registration reject missing consent.

## Lead Inventory

- `lead_requests`: the requested segment, structured criteria, target count, provider job, and lifecycle status.
- `lead_inventory`: canonical deduplicated lead records with person/company imagery and enrichment signals. Contact fields and source payloads are private.
- `lead_request_results`: ranked relationship between a request and the canonical inventory.
- `lead_access_grants`: explicit workspace entitlement to see one lead's contact details.

The inventory can be shared across Waslah without leaking it across customers. A client receives a masked preview until a grant exists. Revealing a lead atomically creates a negative wallet transaction and a grant. Repeating the same reveal is free because the grant key is unique.

## Calling And Qualification

- `call_attempts`: one outbound Vapi attempt, provider ID, status, cost, transcript, recording, and summary.
- `call_events`: append-only provider webhook payloads with unique event IDs.
- `qualifications`: structured status, score, answers, summary, and next action extracted from the call.
- `integration_events`: transactional outbox for n8n/provider dispatch and retry state.

Vapi's call ID is the correlation key. Vapi metadata must include `organization_id`, `request_id`, and `lead_id` so callbacks can always be attached to the correct tenant.

## API Surface

- `POST /lead-agent/auth/register`: create Directus user, workspace, membership, profile, and zero-balance wallet.
- `GET /lead-agent/me`: return safe account, phone status, workspace, and wallet data.
- `POST /lead-agent/auth/phone/request`: rate-limited Twilio Verify or local-development OTP request.
- `POST /lead-agent/auth/phone/confirm`: verify the phone and atomically grant 30 SAR once per phone.
- `POST /lead-agent/requests`: create an idempotent request and dispatch it to n8n when configured.
- `GET /lead-agent/requests`: list only the signed-in workspace's requests.
- `GET /lead-agent/requests/:id/results`: return masked or revealed results for that workspace.
- `POST /lead-agent/leads/:id/reveal`: charge 1 SAR once and return full contact data.
- `POST /lead-agent/integrations/leads`: authenticated n8n ingestion and deduplication endpoint.
- `GET /lead-agent/admin/leads`: Directus-admin-only inventory search with pagination and enrichment filters.
- `POST /lead-agent/integrations/calls`: authenticated n8n call-registration endpoint.
- `POST /lead-agent/webhooks/vapi`: authenticated, idempotent Vapi event endpoint.
- `GET /lead-agent/health`: provider configuration and extension health.

## Invariants

- Monetary values are integers in halalas; no floating-point balances.
- `wallet_transactions` and `call_events` are append-only.
- Phone and email uniqueness is enforced before workspace creation.
- One verified phone can receive the welcome grant only once.
- No browser receives `raw_payload`, transcripts, recordings, or ungranted contact details.
- Provider callbacks and customer writes use separate secrets and authentication paths.
