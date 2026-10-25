# B2C pre-contact pipeline

## Current mode: plan once, match locally (October 4)

Admin → B2C limits provides persisted listing ceilings for 30, 50 and 200 leads. Other quantities use the next larger tier. Zero leaves that tier uncapped; a configured server emergency limit remains an upper bound. Settings are admin-only, validated and audited, and each run snapshots its limit on its first pass. Existing started runs retain their prior limit. Concurrent fetchers reserve page capacity before HTTP, including a smaller final page, so the engine processes no more than the configured count. Repeated listings count toward the fetched-listing budget. A provider returning more than requested is truncated to the reserved allowance. Source exhaustion, low-yield rotation, cancellation and reaching the target can still stop a run earlier.

New campaigns use `saudi-keyword-v1` / search strategy version 7. Discovery remains unchanged. AI interprets the brief and creates one stored keyword plan before execution. This includes Saudi buyer queries (up to three, each at most three written words), short Saudi product-only owner terms, Arabic/English aliases, buying expressions, title exclusions and commercial exclusions. A compound product name such as `بي سي` counts as one product term. Cities are passed separately to the search API.

The runner first searches buyer queries, then the product-only fallback. Local title/body matching requires a whole product phrase plus nearby purchase wording for buyers; fallback requires the product phrase alone. Arabic letter forms, diacritics, digits, punctuation and case are normalized. Closed/job-seeking listings and explicit exclusions are rejected. Fallback results are labeled prospects with unconfirmed buying intent. Rule scores are tiers, not AI confidence or independently verified demand.

There are **no paid per-ad model reviews, no Jev sampling, and no automatic AI recovery-plan calls in this mode**, even if credentials and shadow flags are configured. Planning/chat and search/contact providers may still incur charges. Matching candidates reuse visible numbers before bounded contact lookup, immediate transactional saving, deduplication and target/billing checks. Stop and existing pagination safety limits remain intact.

Existing campaigns keep their stored legacy plan; they are not silently migrated or rerun. Invalid generated keyword plans stop before sourcing instead of defaulting to accepting all ads. Keyword rules can miss synonyms absent from the plan or admit misleading mentions, so this is not a promise of perfect fit or a guaranteed count.

Verification: the keyword tests cover buyer/owner distinctions, negation, Arabic variants, exclusions, plan validation and zero AI review requests. A real-database rollback test covers buyer exhaustion → owner fallback → matched contact lookup → saved lead, with all AI endpoints forbidden and Jev flags enabled. No customer credits are changed.

## Legacy mode (existing campaigns)

The chat UX is unchanged. Buyer-first phase ordering is preserved. Service offers no longer receive a blanket product-owner fallback: printing services use complementary business signals instead. Product-owner searches retain Saudi vocabulary and rotate after six empty reviewed pages; other routes rotate after two.

Overlapping, bounded search and review workers now run:

1. Normalize and rank with local relevance and candidate scores. Low rank alone is **not** a rejection. Empty ads, explicit closed/sold titles and explicit job-seeker titles are skipped conservatively. Unfamiliar vocabulary alone is never a rejection.
2. Skip workspace-delivered seller identities/phones before paid review or contact work. Keep different ads and hypotheses eligible: an irrelevant ad is not a permanent rejection of its author.
3. Reuse qualification by content + complete plan/strategy + evaluator version/model configuration. Review remaining ads in small batches with the existing authoritative qualifier, including owner-fallback admission.
4. Optionally evaluate Jev alongside those reviews, for audit only. PASS/REJECT/UNCERTAIN never affects live delivery in this release. Missing credentials, invalid responses, timeout and provider errors are UNCERTAIN, not rejection. Maximum 100 shadow samples per campaign, three-second deadline per batch.
5. Qualified ads enter bounded contact workers. Reuse a recent successful contact cached with the candidate (24-hour TTL), then inspect public numbers, then call the contact endpoint. Arabic and Persian digits are normalized. A syntactically valid number does not prove ownership, consent or reachability.
6. Save each result immediately. Workspace advisory lock + request row lock guard deduplication, target check, inventory/result insertion, billing and count update in one transaction. No number, duplicates and request failures release their reserved slot. At most eight workers by default, capped at ten.
7. Reconcile counts at pass boundaries, not after each saved lead. Successful saves remain visible while other contact requests or qualification batches are running.

Page fetching overlaps qualification through a bounded queue. Two review workers consume pages while up to eight contact workers resolve qualified candidates. Each source can hold one fetched page beyond the queue. Backpressure pauses fetching when consumers are busy or enough target slots are reserved; failed contacts release those slots. Search continues until the target, source exhaustion, safety limits or a low-yield route rotation. Phase boundaries drain pending work before fallback begins.

AI provider failures are explicit errors, not silent local-score decisions. Provider diagnostics record sanitized host, model, status, duration and transport cause. Interrupted passes restore their starting search cursors; durable candidate caches and delivery deduplication make replay safe.

## October reliability correction

- Every authoritative decision declares `scoreScale: 100`; scores and probabilities must be integer percentages. Fractions, missing scale markers and contradictory STRONG scores of 0/1 are retried, never auto-converted. Cache version v3 invalidates ambiguous old decisions.
- Valid decisions survive an incomplete batch. Only unresolved IDs are retried, split into smaller batches, with at most three rounds. Remaining unresolved rows are `REVIEW_PENDING`, not negative labels; the run continues reviewing other candidates and reports unfinished reviews on a shortfall. A provider outage or budget limit stops further reviews, but already-valid decisions are saved and their contact tasks drained before the error propagates. Interrupted pass cursors are restored for a safe replay.
- HTTP authentication/payment/rate-limit/server errors and transport failures open a credential-scoped cooldown. Rate limits cool down for five minutes, other failures one minute. HTTP header receipt is not recorded as validated-output success; invalid fallback output includes its finish reason.
- Owner token checks ignore city/condition filler. The semantic reviewer is explicitly told that search phrases are not evidence, and private ownership does not require purchase intent in owner fallback.
- `B2C_REVIEW_BUDGET_USD` defaults to 5. This is a **qualification-only conservative reservation**, not an invoice-total guarantee. Each attempt reserves UTF-8 input bytes plus maximum output using configurable rates (`B2C_REVIEW_INPUT_USD_PER_MILLION`, default 1; `B2C_REVIEW_OUTPUT_USD_PER_MILLION`, default 4). Reservations persist across passes. Set rates at least as high as every configured qualification model; planning, Jev and sourcing are outside this cap. Provider/account spending limits remain necessary for a total bill cap.
- The opt-in replay script uses saved samples from the two failed campaigns, a $0.25 qualification reservation limit, no contact requests, no lead writes and no customer charges. It tests the integration, not calibrated accuracy or end-to-end delivery. Jev remains shadow-only pending independently labeled evaluation.

## Configuration

- Contact work is now fixed to one concurrent lookup, additionally serialized
  across every campaign by the durable [Haraj safety guard](haraj-request-safety.md).
  Legacy `B2C_CONTACT_CONCURRENCY` values no longer increase provider concurrency.
- `B2C_AI_QUALIFICATION_BATCH_SIZE=12` (1–28).
- `B2C_QUALIFICATION_CONCURRENCY=2` and `B2C_PAGE_QUEUE_CAPACITY=2` bound review and buffering.
- `B2C_OPENAI_QUALIFICATION_MODEL=gpt-4.1-mini`; the existing OpenRouter fallback remains available. Qualification requests default to a 20-second timeout (`B2C_QUALIFICATION_TIMEOUT_MS`).
- `B2C_JEV_SHADOW=true` enables sampling when `B2C_JEV_OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY` exists in a Directus environment file such as `.env.docker`. The dedicated OpenRouter credential takes precedence and uses pinned `typesafe/jev-1.13` through `/api/alpha/decisions`, with `noul` questions/probabilities. Vercel retains its boolean adapter. Never commit credentials. Recreate the Directus service after environment changes.
- No Jev live-gating switch is provided. Promotion requires a separately reviewed rollout with Saudi dialect and owner-fallback labels.

Metrics include qualification/contact elapsed milliseconds, remote attempts and hits, public-phone/cache hits, duplicate skips, peak reserved slots, first-lead time, and bounded Jev audit samples. `rejectDisagreementRate` compares Jev with the current qualifier, not truth. `falseRejectAuditRate` remains null until independently reviewed `manualQualified` labels exist; `shadowAudit()` supports offline calculation from such samples. Sample records carry a qualification cache key to join to the stored candidate/context.

## Verification

Run `node --test scripts/test-b2c-pipeline.mjs`, the existing reliability/owner-pagination scripts, and `scripts/test-lead-core.mjs` in Directus. The latter tests the actual PostgreSQL persistence path and full mocked-provider runner inside a rolled-back transaction, without spending provider credits or changing customer balances.

### October 4 verification

- Regression suite: 41 checks passed. Database rollback checks cover immediate delivery, contact-slot release, target enforcement, billing/deduplication, tenant isolation and cancellation.
- A read-only live-provider replay of 12 saved ads completed in approximately 10.5 seconds: three authoritative STRONG decisions, no unresolved decisions. Local exclusions skipped three ads before paid qualification. Qualification reservation was $0.071459 under a $0.25 test limit; this is not actual invoiced spend and excludes Jev.
- Jev returned four REJECT and eight UNCERTAIN decisions, with no PASS decisions. This small, selected sample is not a calibrated accuracy benchmark. No promotion to a production gate is justified by it.
- All 12 examples lacked a visible body phone; the replay deliberately performed no contact requests or customer writes. It does not prove that a live campaign will deliver its requested quantity. End-to-end delivery was tested with mocked providers and real rolled-back database writes, not a paid customer campaign.
- Authoritative review still showed instability on an ambiguous new-phone seller and an overly generous POSSIBLE label for an unrelated tutor (not admitted). Broader independent Saudi-ad labeling remains necessary before enabling Jev as a replacement or hard pre-filter.
