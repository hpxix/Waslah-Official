# Signal-first B2B runs

Start in dashboard Chat → B2B → Sell. Describe the offer and geography. Wasla suggests discussion topics; the customer may edit these or add up to eight LinkedIn post URLs. Choose a lead count to launch. The live workspace shows posts, relevance, people, evidence, verified contacts and separate spend. Chat remains accessible through Back; saved contacts also appear in the existing Leads inventory. Existing business discovery remains selectable; B2C is unchanged.

## Configuration

Server only: `TREG_TOKEN`, `TREG_ORG`, `N8N_WEBHOOK_SECRET`, and the existing OpenAI/OpenRouter credentials. Never add these to Vite environment variables or commit them. `SIGNAL_RUN_BUDGET_USD` defaults to **$1 for Treg data calls only**; `SIGNAL_OPENAI_MODEL` defaults to `gpt-4.1-mini`. OpenRouter is a bounded fallback. Recreate Directus when environment variables change; rebuild the frontend Docker image for UI changes.

After Treg surfaces candidates, an agent checks offer fit and authority. If `B2B_JEV_OPENROUTER_API_KEY` or `B2C_JEV_OPENROUTER_API_KEY` is configured, Jev then reviews qualified candidates and helps order contact lookups. Its score is a second opinion, **not a calibrated rejection gate**: malformed responses and outages never discard a candidate. Jev cost is not measured by the current provider response, so `jevMicro` remains zero rather than an estimate; `jevCalls` counts successful review batches. Agent usage tokens are recorded; full agent dollar cost is unavailable. The Jev response contract is covered by synthetic tests, not a live paid canary.

## Execution and limits

- Search up to six topics, two pages each, using the previous month; suggested posts are read first. Review up to thirty posts, prioritizing user suggestions and engagement.
- Topic relevance threshold 0.7. Read up to three pages each of comments/reactions per relevant post, deduplicating by canonical profile URL; cap at 300 people.
- Batch assess business fit/authority against the actual offer. A score ≥1.5/2 qualifies for profile enrichment, not delivery. A reaction is not buying intent.
- Confirm Saudi profile location, find and verify an email, reject unverified/catch-all results, then deduplicate by workspace email before the existing transactional inventory/credit flow. Phone enrichment is not part of this workflow.
- Provider costs are recorded from response headers and reserved before calls. Email-find route cap is $0.08; data limit exhaustion produces an honest partial result. Expensive providers may therefore be skipped. AI calls are separately bounded to 50; the data dollar limit does not include AI.
- Cancellation and interrupted processes do not silently replay paid calls. Unknown or pending external requests retain a reservation and stop safely. There is no durable resume worker yet; start a new run after interruption. Returned provider data, posts and comments are treated as untrusted input.
- Target counts are goals, not guarantees. Empty datasets, geography, fit, contact availability and configured limits may yield fewer leads.

## Endpoints

Authenticated `/lead-agent/signal-runs/config`, `/signal-runs`, `/signal-runs/:id`, and POST `/signal-runs/:id/cancel`. Runs are scoped to the authenticated user and organization. Admin `/lead-agent/admin/signal-runs/:id` additionally exposes the call ledger. Source API tokens remain server-side. Start requires an idempotency key and enough credits for the requested count; actual delivery uses existing per-lead billing.

## Verification

`node --test scripts/test-signals.mjs` uses synthetic responses only, including full delivery, missing emails, deduplication, provider errors, authorization isolation, evaluator fallback and pending contact outcomes. `npm run build` checks frontend types and production output. These tests do not establish live provider yield or deliverability. A paid canary is a separate explicit action.
