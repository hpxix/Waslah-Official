# Waslah Directus Data Model

`directus/bootstrap.mjs` creates and incrementally updates this schema. It is safe to run on every deploy.

## Tenant And Identity

- `organizations`: customer workspace and hard tenant boundary.
- `organization_members`: role and status for each Directus user in a workspace.
- `customer_profiles`: application profile, E.164 phone, verification time, avatar seed, and locale.
- `wallets`: cached workspace balance in halalas. One wallet per organization.
- `wallet_transactions`: immutable ledger. Unique idempotency keys prevent duplicate grants and charges.
- `credit_grants`: administrator-created credit grants processed atomically into customer wallets. Ten credits equal 1 SAR.
- `phone_verifications`: short-lived OTP attempts. Local codes are hashed; Twilio owns live OTP codes.

Application users have the `Waslah Customer` Directus role. They do not receive raw collection permissions. The `/lead-agent` extension authenticates them with normal Directus access tokens and enforces workspace ownership on every query.

Account creation requires explicit acceptance of the versioned Privacy Policy and Permissions document. Directus stores `privacy_consent_at`, `permissions_consent_at`, and `consent_version` on `customer_profiles`; both email and first-time social registration reject missing consent.

## Lead Inventory

- `lead_requests`: the requested segment, structured criteria, target count, provider job, and lifecycle status.
- `lead_inventory`: canonical deduplicated lead records with person/company imagery and enrichment signals. Contact fields and source payloads are private.
- `lead_request_results`: ranked relationship between a request and the canonical inventory.
- `lead_access_grants`: explicit workspace entitlement to see one lead's contact details.

The inventory can be shared across Waslah without leaking it across customers. A client receives a masked preview until a grant exists. Revealing a lead atomically creates a negative wallet transaction and a grant. Repeating the same reveal is free because the grant key is unique.

## B2C Marketplace Acquisition

- `b2c_campaigns`: the structured consumer intent, validated Haraj acquisition plan, run status, and live statistics.
- `b2c_candidates`: Haraj posts and their cheap/semantic qualification result before contact resolution.
- `b2c_leads`: campaign-scoped consumer profiles deduplicated by normalized phone, author ID, then username, with grounded evidence.
- `b2c_lead_outcomes`: delivered/contacted/replied/qualified/converted/rejected feedback for strategy learning.

The B2C planner can only select tags present in the bundled `haraj_tags.json`. The server owns fixed GraphQL templates, pagination, credentials, qualification thresholds, contact resolution, and persistence. Phone lookups happen only after a candidate reaches the configured qualification threshold.

## Calling And Qualification

- `call_attempts`: one outbound Vapi attempt, provider ID, status, cost, transcript, recording, and summary.
- `call_events`: append-only provider webhook payloads with unique event IDs.
- `qualifications`: structured status, score, answers, summary, and next action extracted from the call.
- `integration_events`: transactional outbox for n8n/provider dispatch and retry state.
- `chat_logs`: workspace-, user-, and conversation-attributed lead-agent turns for administrator review.

## Social Command Center

- `social_connections`: tenant-owned Instagram, Facebook, WhatsApp, TikTok, Snapchat, or custom channel accounts. Provider credentials are encrypted at rest and only masked hints are returned to the application.
- `social_events`: append-only configuration audit trail for connection creation, credential rotation, validation, preferred-route changes, policy changes, and disconnection.

Each connection carries an autonomy level and approval policy independently. This keeps channel access separate from the future content/outreach agents and lets Waslah add provider adapters without changing the tenant model. Server application secrets remain environment variables; workspace account tokens are entered through the dashboard and encrypted with `SOCIAL_TOKEN_ENCRYPTION_KEY`.

## Growth Operating System

- `business_profiles`: one tenant-owned Business DNA record containing the offer, value proposition, products, voice, values, markets, goals, tone rules, colors, and logo.
- `audience_segments`: reusable B2B/B2C segments based on pains, triggers, jobs-to-be-done, channels, geography, and estimated size.
- `growth_campaigns`: a commercial objective that keeps its audience, channels, operating strategy, dates, and lifecycle together.
- `content_items`: brand-aware social drafts with channel, copy, media metadata, approval state, schedule, publishing reference, and failure details.
- `customer_journeys`: customer-level movement through engaged, matched, offered, and won stages, including attributed value, engagement score, and the next action.

The growth records use `organization_id` as their tenant boundary. Business DNA is injected into the lead conversation, content generation, and inbox reply drafts. Public actions remain human-approved: content must be approved before it is submitted to Postiz, and a suggested Chatwoot reply is never sent until the operator clicks send.

Vapi's call ID is the correlation key. Vapi metadata must include `organization_id`, `request_id`, and `lead_id` so callbacks can always be attached to the correct tenant.

## API Surface

- `POST /lead-agent/auth/register`: create Directus user, workspace, membership, profile, and zero-balance wallet.
- `GET /lead-agent/me`: return safe account, phone status, workspace, and wallet data.
- `POST /lead-agent/auth/phone/request`: rate-limited Twilio Verify or local-development OTP request.
- `POST /lead-agent/auth/phone/confirm`: verify the phone and atomically grant the 100 SAR / 30-lead welcome offer once per phone.
- `POST /lead-agent/requests`: create an idempotent request and dispatch it to n8n when configured.
- `POST /lead-agent/b2c/chat`: turn a sell-mode message into a customer-facing summary and validated plan.
- `POST /lead-agent/b2c/plan`: return the strict B2C intent and acquisition plan.
- `POST /lead-agent/b2c/campaigns`: persist a ready campaign; `POST /:id/run` executes it asynchronously.
- `GET /lead-agent/b2c/campaigns/:id`: return status and live statistics; `GET /:id/leads` returns scored leads.
- `GET /lead-agent/b2c/leads/:id`: return one evidence-backed lead; `POST /:id/status` records outcomes.
- `GET /lead-agent/requests`: list only the signed-in workspace's requests.
- `GET /lead-agent/requests/:id/results`: return masked or revealed results for that workspace.
- `POST /lead-agent/leads/:id/reveal`: charge 1 SAR once and return full contact data.
- `POST /lead-agent/integrations/leads`: authenticated n8n ingestion and deduplication endpoint.
- `GET /lead-agent/admin/leads`: Directus-admin-only inventory search with pagination and enrichment filters.
- `GET /lead-agent/admin/accounts`: customer workspaces with balances, credits, generated-lead counts, and chat counts.
- `POST /lead-agent/admin/credits/grant`: create an audited credit grant for a customer email.
- `GET /lead-agent/admin/generated-leads`: inspect generated leads with their workspace, user, and originating request.
- `GET /lead-agent/admin/chat-logs`: inspect persisted chat turns by user, workspace, or conversation.
- `GET /lead-agent/socials/providers`: inspect supported providers and server-side app readiness without exposing environment values.
- `GET /lead-agent/socials/connections`: list the signed-in workspace's safe, masked channel connections.
- `POST /lead-agent/socials/connections`: encrypt and store a workspace channel connection.
- `PATCH /lead-agent/socials/connections/:id`: update routing/policy settings or rotate credentials.
- `POST /lead-agent/socials/connections/:id/preferred`: make one connection the workspace's preferred outreach route.
- `POST /lead-agent/socials/connections/:id/validate`: validate stored configuration without returning credentials.
- `DELETE /lead-agent/socials/connections/:id`: disconnect a workspace-owned channel and retain an audit event.
- `GET /lead-agent/socials/activity`: list recent channel configuration events for the workspace.
- `GET /lead-agent/growth/overview`: return the tenant's Business DNA, audiences, campaigns, content, customer journey, connected channels, and server readiness.
- `PUT /lead-agent/growth/brand`: create or update the tenant's shared Business DNA.
- `POST|PATCH /lead-agent/growth/audiences[/:id]`: create or update a reusable audience segment.
- `POST /lead-agent/growth/campaigns`: create an approval-controlled growth campaign.
- `POST /lead-agent/growth/content/generate`: generate an on-brand content draft with Wasla AI.
- `PATCH /lead-agent/growth/content/:id`: edit, schedule, or approve a content item.
- `POST /lead-agent/growth/content/:id/publish`: submit an approved item to the selected Postiz integration.
- `GET /lead-agent/growth/inbox`: list Chatwoot conversations for the configured account.
- `POST /lead-agent/growth/inbox/:id/suggest`: draft a Business-DNA-aware reply from the real conversation history.
- `POST /lead-agent/growth/inbox/:id/reply`: send the operator-approved reply through Chatwoot.
- `POST /lead-agent/integrations/calls`: authenticated n8n call-registration endpoint.
- `POST /lead-agent/webhooks/vapi`: authenticated, idempotent Vapi event endpoint.
- `GET /lead-agent/health`: provider configuration and extension health.

## Invariants

- Monetary values are integers in halalas; no floating-point balances.
- Ten credits equal 1 SAR, and one newly revealed lead costs 10 credits.
- `wallet_transactions` and `call_events` are append-only.
- Phone and email uniqueness is enforced before workspace creation.
- One verified phone can receive the welcome grant only once.
- No browser receives `raw_payload`, transcripts, recordings, or ungranted contact details.
- No browser receives stored social credentials or server environment values; only field-presence and masked suffixes are returned.
- Provider callbacks and customer writes use separate secrets and authentication paths.
