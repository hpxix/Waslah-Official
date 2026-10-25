# Lite public comment discovery

Lite sell-side keyword campaigns now run in this order:

1. Search product aliases, inspect public buyer-interest comments on matching seller listings, and resolve explicitly published business contact details.
2. Existing direct buying-intent searches.
3. Existing lower-confidence product/owner fallback searches. Previously saved leads are not silently re-billed or duplicated to pad a requested count.

The primary route uses the shared Haraj request guard for search, comments, public STORE profiles, and public business-ad text. It does not send bearer credentials, request private comments, reveal hidden numbers, or take personal phone numbers from unrelated personal ads. Guard pauses are preserved.

The primary route is bounded by 90 seconds of elapsed time (checked between calls), 160 requests or fewer for ordinary targets, three seed/comment pages and two author pages. Calls already waiting on the shared queue or in flight may finish beyond that elapsed budget. Listing quotas still apply. Empty/incomplete discovery falls through; provider authorization/safety failures stop rather than bypass the guard.

Evidence tiers are Excellent (explicit purchase/contact request), Very high (price/availability/product question), High (existing direct-intent qualification), and Medium (broader fallback). These are evidence grades, not verified purchase probabilities. Public comments can be stale.

Comment prospects retain the source listing city as the **search market**, not verified residence. A different contact-ad city is stored separately. The dossier shows the original comment, date and source link. Distinct public business numbers appear through the existing compact phone-number control; duplicate entries collapse.

Validation: `bun scripts/test-lite-comment-buyers.mjs`, existing Haraj safety/performance and B2C reliability suites, TypeScript build. Tests use fixtures and mocked API responses; no live end-to-end lead-count guarantee is implied.
