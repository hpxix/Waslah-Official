# Lite listing-route restoration — 23 October 2026

Requested reference: the listing-based Lite approach used before the reported Haraj ban. The available historical evidence is the documented 200/200 campaign `db3f180d-01d1-49b5-8417-60d76c363f30`; it is not a byte-for-byte archived release of every runtime module.

Read-only replay confirmed 200 delivered candidates, all 200 still qualifying under the reference keyword rules, and 200 with phones in listing evidence. Historical aggregate: 9,545 listings fetched, 200 public-phone hits and zero remote-contact hits. Historical contact attempts existed (107), so zero successful remote hits must not be confused with zero attempted lookups.

Restored acquisition behavior:

- Listing-only keyword paging instead of comment/profile discovery.
- Generate a plan once; qualify title/body locally; keep each client's own product, area and approved search terms.
- Public-listing phone evidence, current authorization and duplicate checks before saving/disclosure. No private contact reveal in the public-keyword profile.
- Continue approved fresh pages until the requested count, source exhaustion, stop, or existing safety/provider limits.

Source changes: unconfigured Lite accounts default to `listings_only`; each future backend pass reads the current account setting instead of a stale campaign snapshot; public-keyword search sends no bearer token. Explicit administrator overrides remain available.

Live account configuration is restored separately by `scripts/restore-lite-reference-mode.mjs` through the existing audited admin API. Its dry run found seven existing accounts (six using the mixed default, one explicitly mixed) and no active campaigns. It does not restart campaigns, change completed history, reset counters, unpause Haraj, alter consent or bill anyone. Newly created accounts receive the new default only after the source changes are deployed. Older saved campaigns can retain their previous mode until the runner change is deployed; use a fresh Lite query for the restored live account configuration.

The backend source was not wholesale reloaded: this checkout also contains unfinished consent-bridge deployment work. Restoring acquisition settings is not authorization to deploy unrelated changes or remove consent checks. The historical replay is not proof that a fresh live query will deliver 200 leads.
