# Astraeus source routing

Execution uses the **reviewed JavaScript source catalog**, not AI/Store discovery. See [research, source capabilities and routing rules](apify-curated-source-research.md). Candidate rejection audits are written before launching, including on selection failure.

Both dashboard company models now submit to `/lead-agent/requests` and the same Apify router. New Astraeus runs no longer take the n8n/TREG/signal shortcut. Lite is unchanged. Existing admin feature locks still control who may use each model.

* Astraeus accepts exact matching Saudi leads with or without email or phone.
* Astraeus Ultra requires a usable phone; email is optional.

## Selection and execution

JavaScript classifies the target and considers only compatible user-approved sources. It refreshes their schemas and FREE-tier pricing, constructs input through source-specific adapters, compares affordable coverage and cost, and uses ratings as a tie-breaker. Constraints unavailable as native filters are recorded for mandatory record-level review, not silently removed. The selected build is pinned for API validation and execution. Rental/subscription Actors and unknown pricing are excluded. This is comparison within the approved catalog, not a claim of global cheapest pricing or guaranteed coverage.

All provider traffic uses `https://api.apify.com/v2` and bearer headers. Actor launches use HTTPS POST; GET requests retrieve metadata, polls and datasets. Tokens remain on the server. Schemas and dataset records are untrusted. Adapter input cannot include credentials, cookies, proxies, callbacks or private-network URLs. Runs use limited platform permissions. No Store-search or AI-source-selection call is made.

Returned records undergo a separate exact-fit AI review and deterministic contact, industry and Saudi-location checks. Contact strings must occur in the original record. Industry arrays and `companyDomain` are preserved, and both `marketing_agency` and `Marketing and Advertising` map to the verified `Marketing & Advertising` enum. Arabic roles/cities use typed aliases; company names, domains and literal keywords are not rewritten. Acceptance requires explicit `accepted: true` and `matches_requested_criteria: true`; a returned index or a negative assessment is not a qualified lead. No related-sector widening happens automatically. Missing website data is labelled as unverified, never proof of absence; directory data cannot establish website quality. Weak-website-only and missing-or-weak requests require clarification before quantity selection and are rechecked before request dispatch. Property owner/advertiser and rental-phone limitations are likewise clarified before spending, never silently substituted.

Unsupported inclusion alternatives remain a full OR group during record review, not a supported native subset AND an unsupported remainder. Specific dental targets use the documented dental keyword input when a source lacks a dental industry enum, with strict dental evidence still required. Excluding hospitals is not translated into excluding the entire healthcare industry. The chat removes assistant-invented revenue/funding filters when the customer's own words never requested them.

Broad non-enum categories such as `agency` now use documented keyword retrieval
hints while retaining exact record-level review. Employee shorthand such as
`50+` expands into overlapping schema buckets and retains the original numeric
boundary for review. Canonical aliases are deduplicated before API validation;
otherwise distinct customer labels can collapse to invalid duplicate enum items.
Batch minimums come from the pinned input schema (e.g. Peaky's 100), and cannot
be reduced below that minimum to fit a budget. Sources without a native city
filter may run country-scoped only with mandatory city-evidence post-filtering.
Source ranking prioritizes native constraint coverage, then estimated cost per
record, not simply the largest batch. Vendor diagnostic/no-results rows do not
count as people reviewed. Flat organization website/industry fields are normalized.

Missing or truncated relevance decisions trigger bounded review-only recovery;
they are not silently counted as rejected leads. Valid decisions are retained,
and source Actors are never relaunched to retry an AI response. The separate
signal workflow similarly recovers missing IDs, accounts for retry calls, and
temporarily skips an unhealthy reviewer credential between batches. Unknown
decisions never become approved leads.

Terminal cost-capped/failed runs with a dataset are inspected for usable committed
records too. The bounded dataset read may include more rows than the requested
source batch, because provider item stops can lag behind writes. All records
still pass the same qualification, phone and deduplication checks; only the exact
customer target is saved. Interrupted sources are not automatically paginated or
restarted, and their full authorized charge cap stays reserved.

### All-model repair verification, 22 October 2026

All six approved business adapters passed live input validation, including the
exact previously failing Ultra filters after alias deduplication. A new live
Astraeus check delivered and saved 1/1 lead after reviewing two records from one
source. Two one-lead Ultra checks did not fulfill: the first exposed duplicate
enum inputs; the corrected retry reached five sources but found no usable phone
records within the existing $0.50 cap. Provider diagnostics said the combined
criteria were too restrictive; no phone-less lead was saved or billed as Ultra.
No broader targeting was authorized or applied. Lite public search responded
with more pages; its persisted `repeated_empty_contacts` phone pause was preserved.
Private phone retrieval still requires authorized administrator review, not a
code bypass. These checks do not prove every brief can fulfill its requested count.

Additional offline verification: `scripts/test-model-recovery.mjs`, signal and
Lite pipeline Node tests, and the rollback-only PostgreSQL fulfillment suite,
including partial datasets, provider diagnostics, and extra already-paid rows.

## Customer chat and progress

The quantity presets are suggestions, not a 30-lead minimum. Customers may explicitly request any count from 1 to 200 after confirming a brief, including Arabic numerals and natural two-lead trial requests. A shared client/server grammar recognizes only quantity-only requests; mixed target edits go through qualification. Deterministic policy corrects model-invented minimums and can recover a fully grounded, conversation/model-scoped brief whose only obstacle was that false minimum. An unconfirmed or different-conversation target cannot be recovered this way. Company chat uses scoped stored facts so long conversations do not lose the initial business context.

The request endpoints expose only sanitized counts from the protected source audit: records reviewed, records with phones, potential matches, attempt count and stop reason. The dashboard no longer reads Lite-only counters for company searches. Historical runs without recorded phone counters display an unknown value rather than a fabricated zero. Source IDs, inputs, contacts, charge details and provider credentials remain admin-only.

Concurrent authenticated requests share a single session refresh, with browser Web Locks coordinating refresh-cookie rotation between tabs when available. Tokens stay in memory. Restoring the account's latest job must not append its historical error to an unrelated chat; chat errors require that conversation to explicitly follow the job.

### Live QA, 20 October 2026

Arabic Ultra intake was exercised through the real browser in both fast and deep modes. The dental trial launched exactly two requested leads, inspected 21 records across sources/pages, saved none and charged no lead credits. This was not a successful fulfillment test. It exposed dental retrieval and misleading-zero progress issues, subsequently patched and covered by regression tests. A separate marketing-agency intake correctly preserved all sizes, Riyadh, founder/CEO and phone requirements. Its final two-lead launch could not be completed because browser control repeatedly disconnected; no second sourcing run was created. The Arabic attached-preposition wording `ابدأ بعميلين` was also corrected and unit-tested. Do not describe the full flow or source coverage as flawless based on these tests.

## Multi-source fulfillment

One request can now run **multiple compatible Actors and supported pages**, sequentially, until the requested number of newly delivered, unique, qualified leads is reached. Short successful batches and known terminal source failures fall through to the next affordable compatible source. A full duplicate-only page still advances its cursor; duplicates on one page do not prove later pages are exhausted. The scheduler tries the other sources before revisiting a paginated source. It never switches geography, industry or contact type to pad the count. Normal Astraeus accepts leads without phones; Ultra still requires a usable source phone on every lead.

Pipeline pagination uses documented `customOffset` plus `dontSaveProgress`, when both fields exist in the pinned schema. Cursors start at zero and remain request-local rather than inheriting another client's saved progress. OpenSooq uses its explicit page input. Other adapters run once unless a supported continuation is implemented; no blind identical-input retry. Short pages stop that source. New evidence for a previously rejected person can still be reviewed in another source.

Deduplication uses phones (including additional numbers), email, LinkedIn and person/company identity across all batches and sources, and excludes contacts already delivered to that workspace. Unrelated tenants do not affect the client's count. Qualified batches are committed through the existing authenticated ingestion/billing route immediately. Only confirmed newly inserted result indices count toward fulfillment; rejected/duplicate/undelivered leads are not billed again. Ingestion keeps the request `sourcing` between batches. At the end it becomes `sourced` only at target, otherwise `partial` with saved results and the stop reason (or `failed` if none saved).

Safety ceilings: 24 launch/validation attempts, 12 pages per source, 4,000 raw records, and 30 minutes per request; an individual Actor still has its five-minute provider timeout. These are stop conditions, not a guarantee that enough matching contacts exist. The audit records every source, build, input, cursor, provider run ID, authorized cap, reported cost, accepted/rejected/duplicate counts and final fulfillment reason. Only administrators can read the full source audit.

## Included-credit budget

Requires the configured account to report `plan.id=FREE`, a zero base price, and an account usage limit no higher than its included credits or $5. Does not create, rotate, register or rent accounts, subscribe to Actors, add payment methods or top up balances.

The shared cycle ceiling defaults to $5. Default **whole-search** caps are $0.25 for Astraeus and $0.50 for Ultra, shared across all attempts rather than renewed for each Actor. Each attempt receives a smaller charge cap based on its result estimate plus a cent buffer, rounded up to cents; the sum of authorized caps never exceeds the request cap. The account budget, cycle and active jobs are rechecked before each attempt. Every launch passes `maxTotalChargeUsd`, `maxItems`, a five-minute Actor timeout, and `restartOnError=false`. A $0.05 cycle buffer is kept for overhead. Reservations across both models are persisted in `wasla_astraeus_runs` and serialized by a PostgreSQL advisory transaction lock. At a confirmed finish, only the sum of attempted charge authorizations stays reserved; the unallocated request allowance is released. Preliminary provider usage is audited but not reused as spendable credit, because Apify documents that costs may initially be preliminary after completion. Unknown launch/abort states retain the full reservation and block further starts.

Active or uncertain runs block additional starts. A timeout or lost launch response does not produce an automatic duplicate or release budget. An uncertain reservation needs administrator reconciliation with the provider; there is deliberately no unsafe reset/bypass button. If the process restarts mid-run, the provider timeout and spending cap still apply; the reservation remains for review. There is no guarantee that all requested leads exist or fit within the remaining credit.

## Dashboard

Admin → Astraeus engines exposes model slots, enable switches, run caps, candidate limits, shared cycle ceiling, verified provider usage, the 12-source catalog and source audit history. The obsolete Store-rating cutoff is no longer an eligibility gate for manually approved sources. These settings do not grant customer entitlement; Access & features still governs model access.

The account uses `APIFY_TOKEN`; `OPENROUTER_API_KEY`/`OPEN_ROUTER_TOKEN` powers conversational intake/relevance review, not provider choice. `N8N_WEBHOOK_SECRET` authenticates internal lead ingestion. Credentials never go in URLs. Actor input uses JSON bodies. Settings/reservation tables initialize on first admin access or request. Etimad opportunities bypass lead ingestion and lead billing and stay in chat.

Verification: `bun scripts/test-astraeus-router.mjs`, `bun scripts/test-curated-sources.mjs`, TypeScript/build checks, and `scripts/test-astraeus-fulfillment-db.mjs` inside Directus. The database suite uses mocked provider/reviewer calls in a rollback-only SQL transaction and covers 30 contacts across three sources, pagination, duplicate/rejected rows, confirmed streaming saves, failed/invalid sources, phone requirements, shared caps, replay and uncertain launches. Production Actor launches must be distinguished from mocked tests and metadata-only account checks; do not claim live sourcing was tested unless a run actually completed.

Provider references: [Pipeline input schema](https://apify.com/pipelinelabs/lead-scraper-apollo-zoominfo-lusha-ppe/input-schema), [Apify run status and cost caveats](https://docs.apify.com/api/v2/actor-run-get).
