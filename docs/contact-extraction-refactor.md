# Consent-gated Haraj contact extraction

Follow-up: [Consent workflow v2](haraj-consent-workflow.md) adds the request/verification APIs, independent grants, explicit reveal/download/call actions, audit migration, fresh browser exports and deployment instructions. The notes below describe the initial refactor; use the v2 document for current authorization semantics.

Source implementation only: the SQL migration has not been applied and the backend has not been reloaded for this change. Without a verified consent record, contact lookup, saving and export fail closed. No live harvesting was used for tests.

## Removed restrictions

The previous `publicBusinessAd`, `businessProfileContact` and `businessPostContact` functions in `dist/lite-comment-buyers.js` enforced business-ad wording or STORE/contact-description classification. These functions are removed. Their replacements in `dist/contact-discovery.js` are `discoverProfileContacts` and `discoverPostContacts`.

Discovery checks owner identity, PHONE fields / phone-shaped ad text, Saudi mobile validity and duplicates. It never checks STORE status, sales/company/مبيعات descriptions, or business-related ad titles. Product matching for the *seed advertisement* remains: it identifies the product under discussion, not whether its commenter runs a business.

```js
// Profile discovery: USER and STORE use this identical path.
if (!author?.authorId || String(profile.id) !== String(author.authorId)) {
  // structured ownership_mismatch exclusion
}
// All PHONE fields proceed to validation, without inspecting type/description.
```

```js
// Eligibility, after neutral discovery and before retaining/returning phones:
const decision = await authorizeContact({
  authorId, action: 'save', phone: candidate.phone,
});
if (!decision?.allowed) {
  exclusions.push({reason: 'not_authorized',
    detail: decision?.detail || 'consent_required', stage: 'eligibility'});
  continue;
}
```

## Trusted authorization contract

`contact-authorization.js` selects among reviewed provider permission, independently verified business publication, and backend-only subject grants. [Provider-level coverage](haraj-provider-contact-policy.md) does not require an individual consent record for covered operations. Subject grants still require trusted verification of the organization, Haraj author, purpose, action/number scope, evidence, and validity. Withdrawals override provider permission. Public availability, STORE status, keywords, customer signup, and caller-supplied booleans do not establish any of these bases.

Migration: `directus/migrations/20261022_contact_authorizations.sql`. No consent-grant endpoint or fake records were added. Configure a genuine verified consent source before enabling this pipeline in production. Database deployment permissions must keep this registry server-only; it is not registered as a customer-editable Directus collection.

Checks are applied before phone-bearing profile/ad lookup, candidate caching, final lead persistence/billing, workflow ingestion, customer/admin responses, reveals and call export. Save checks execute inside the existing transaction with consent-record shared locks. Legacy phone-bearing responses are filtered against current authorization, not prior payment or a cached result. Existing unauthorized records are not deleted by this change; migration/purge of historical data is a separate operation.

The legacy `businessContact` payload key and `publicBusinessContacts` metric remain for compatibility; neither is an eligibility condition. Exclusions are phone-free `{reason, detail, stage, source?}` objects. Reasons are `missing`, `invalid`, `duplicated`, `not_authorized` and `ownership_mismatch`. Per-run exclusion details are bounded to the latest 200 entries; aggregate counters retain totals.

## Changed integration functions

- `discoverCommentBuyers`: authorization before contact lookup; neutral discovery; structured exclusions; no pending phone cache.
- `saveCandidate`, `persistQualifiedB2CLead`: current authorization before writes; redact unapproved embedded numbers; existing duplicate checks retained.
- `serializeB2CLead`, `publicLead`: async current-authorization filtering, including previously saved rows.
- Workflow lead ingestion and calls/reveal routes: authorization before persistence, export or charging.
- `contactScheduler`: returns processing outcome to propagate duplicate/authorization exclusions.

## Verification

Run with the bundled Bun executable:

```sh
bun scripts/test-contact-authorization.mjs
bun scripts/test-lite-comment-buyers.mjs
bun scripts/test-direct-product-buyers.mjs
bun scripts/test-b2c-discovery-flow.mjs
bun scripts/test-lite-continuation.mjs
bun scripts/test-haraj-safety.mjs
bun build directus/extensions/directus-extension-waslah-lead-agent/dist/index.js --target=node --packages=external --outdir /private/tmp/waslah-contact-parse
```

Tests use synthetic data only. They cover USER/STORE, non-business descriptions/ads, mismatched ownership, Saudi validation, duplicates, absent/expired/revoked/wrong-scope authorization, exact phone scope, no network lookup or writes when denied, export redaction, and scheduler outcomes. A live PostgreSQL integration/deployment check remains outstanding.
