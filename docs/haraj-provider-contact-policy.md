# Haraj provider contact authorization

The contact policy accepts three independently established bases: a reviewed
provider agreement, a verified business publication for an exact phone, or a
verified subject grant. A covered provider operation does not require a subject
consent record. The policy is enforced by `createContactAuthorizer`; the scheduler,
contact discovery, delivered-lead transaction, reveal, export and calling paths
all use that decision rather than implementing their own consent requirement.

| Production boundary | Central decision |
| --- | --- |
| Haraj scheduler before `fetchHarajPostContact` | `createContactAuthorizer`, `lookup` |
| Comment buyer profile/owned-post retrieval | Injected `createContactAuthorizer`, `lookup`; discovered phones checked with `save` |
| Already resolved commenter/business contact | `save` decision; no additional lookup required to reuse an eligible number |
| `persistQualifiedB2CLead` | `authorizeContactSave` inside the same transaction as storage/billing |
| `/integrations/leads` callback | `createContactAuthorizer`, `save` before Haraj inventory writes |
| `serializeB2CLead`, `publicLead`, admin/activity projections | `authorizeContactExport`, `reveal` |
| `/leads/export` | `publicLead` → `authorizeContactExport`, `download` |
| Call context and call creation routes | `authorizeContactExport`, `call` |

The GraphQL functions are transport adapters; their production contact callers
are gated at the boundaries above. Listing discovery and redacted candidate
auditing remain independent of phone-access permissions. Reveal payment and
organization membership checks remain separate from provider authorization.

## Repository evidence and activation status

The integration configures Haraj's `graphql.haraj.com.sa` GraphQL service and
`matjar.haraj.com.sa` public profile service. It uses a bearer credential and
client metadata. `postContact` returns `contactText`, `contactMobile` and
`shouldEnableWhatsApp`; none declares a contractual use scope. Wasla sends
`isManualRequest: false` for automation.

`docs/integrations.md` describes authenticated contact resolution. The request
safety documentation records operator access review and provider restrictions.
Neither is a provider agreement. No provider-issued scope document or agreement
was found in the repository. Credentials are not decoded, exposed, probed, or
treated as evidence of permission. The owner's statement that permission exists
is recorded in the task context; its operation/workspace/expiry scope still
requires an evidence reference before activation.

| Operation | Internal action | Explicit provider coverage found in repository |
| --- | --- | --- |
| Contact retrieval (including profile/posts with phones) | `lookup` | None documented |
| Contact storage for lead generation | `save` | None documented |
| Display/reveal to workspace users | `reveal` | None documented |
| CSV/Excel or other download/export | `download` | None documented |
| Commercial calling | `call` | None documented |

The new migration creates no active permissions. Existing verified grants and
business-publication evidence continue to work independently.

## Provider policy record

The backend-only `wasla_provider_contact_permissions` table contains one current
record per workspace/provider/purpose. It requires the agreement reference,
SHA-256 digest of reviewed evidence, reviewer identity, verification timestamp,
valid-from/expiry timestamps, status, and explicit action array. The scope must
explicitly cover that workspace, lead generation, all provider subjects, and
provider contact fields. Narrower agreements cannot be represented as universal
coverage; add a reviewed scope-specific adapter if the agreement has subject or
field restrictions. Do not populate a universal record for a narrower agreement.

There is no client flag, environment boolean, customer CRUD collection, or
collection-worker write path to activate this policy. A trusted integration
operator records the reviewed agreement through backend database provisioning.
Never insert synthetic evidence into the live table.

Actions are independent. `save` does not imply `lookup`; `download` does not imply
`reveal` or `call`. Known authorized numbers do not require an additional lookup
scope merely for saving. The phone returned from a lookup is checked again under
the save policy in the lead/billing transaction. Every additional stored number
is checked; denied secondary numbers are redacted rather than discarding an
eligible primary lead.

## Withdrawal, revocation, and audit

Subject suppressions and withdrawn subject grants override provider permission,
including when withdrawal occurred before any individual grant existed. A
revoked provider policy denies Haraj operations even if another basis was
previously valid. Missing, expired, or insufficient provider scopes can use an
independently valid subject grant or business publication where applicable.

Policy reads hold `FOR SHARE` until the authorization/storage/export transaction
commits. A backend update setting `status='revoked'` and `revoked_at` on the
current row waits for those in-progress transactions and blocks subsequent
decisions. There is no policy cache or fallback to older provider records.
Network requests already started are not retrospectively cancelled; storage and
export always recheck current policy. Provider HTTP/GraphQL restrictions and the
shared rate/safety guard are still enforced.

The append-only `wasla_contact_audit` records each decision's action, organization,
subject, provider, allowed flag, and policy ID in `authorization_id`, with
`detail='verified_provider_permission'` for the provider basis. It stores no raw
phones. Retain agreement evidence and audit records when revoking a policy.

## What is needed to activate

Supply the provider-issued agreement or scope reference identifying the provider
and approved access method; the covered workspace(s), subject/contact-field
coverage, lead-generation purpose, explicit operations, and validity/expiry.
Record only those reviewed scopes. No Haraj consumer credential, public response,
business label, or individual-consent record is substituted for that agreement.

Apply `directus/migrations/20261025_provider_contact_permissions.sql` with the
existing migration deployer (`bun scripts/deploy-contact-consent-migrations.mjs
--apply`). This only creates the table; it does not activate a permission. Through
trusted backend provisioning, populate the following columns with actual reviewed
values:

| Column | Required configuration |
| --- | --- |
| `id` | Stable UUID for the reviewed permission; retained for audit correlation |
| `organization_id` | Exact authorized Wasla workspace UUID; no wildcard |
| `provider`, `purpose` | `haraj`, `lead_generation` |
| `subject_scope`, `contact_scope` | `all_provider_subjects`, `provider_contact_fields`, only if both are explicitly covered |
| `actions` | JSON array containing only reviewed operations from `lookup`, `save`, `reveal`, `download`, `call` |
| `status`, `revoked_at` | `active`, NULL for a currently valid permission; `revoked` and withdrawal timestamp to revoke |
| `evidence_reference` | Durable provider agreement or scope-document reference |
| `evidence_digest` | Lowercase SHA-256 digest of that reviewed document (64 hexadecimal characters) |
| `verified_by`, `verified_at` | Reviewer identity and actual review timestamp |
| `valid_from`, `expires_at` | Agreement validity window as timestamps with timezone; expiry must follow start |

There are no additional provider-policy environment flags. Keep the existing
`HARAJ_BEARER_TOKEN`, `HARAJ_GRAPHQL_BASE_URL`/`HARAJ_POST_CONTACT_URL` and optional
client metadata in the secret configuration. Those settings establish transport;
the database record establishes operation coverage. Existing provider safety
pauses, limits, billing and workspace access controls still apply. No server
restart or search rerun is needed merely to read a newly provisioned permission;
the policy is read fresh at each boundary once this code is deployed.

Diagnostics expose `providerAuthorization.detail` and `individualConsent.detail`
on the authorization decision and denied exports. Campaign
`authorizationDiagnostics` separately counts `decisionsByReason`,
`providerDecisionsByReason`, `individualConsentByReason`, and
`apiFailuresByReason`. Missing provider scope appears as
`provider_permission_missing` (or `provider_permission_registry_unconfigured`),
expiry as `provider_permission_expired_or_not_active`, and absent subject consent
as `consent_record_missing`. These can coexist on the same denied decision; an
individual grant is not required when `verified_provider_permission` permits the
operation. HTTP failures use `http_<status>`; transport/provider failures use a
sanitized Haraj code or `contact_api_failure`. Provider failures remain subject
to the shared safety guard and never become authorization grants.

Validation: `bun scripts/test-provider-contact-policy.mjs` and
`bun scripts/run-contact-consent-postgres.mjs`. PostgreSQL tests use isolated
schemas and synthetic permission evidence/HTTP responses, and exercise actual
retrieval adapter, storage, billing, export, withdrawals and revocation.
