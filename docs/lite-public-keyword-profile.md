# Lite reference execution profile

Reference: `db3f180d-01d1-49b5-8417-60d76c363f30`, the 200/200 Wasla AI
campaign created 14 October UTC (15 October in Riyadh).

The saved run scanned 9,545 listings. `شركة` delivered 132 leads and `مكتب`
delivered 68. All 200 delivered phones came from public listing evidence, with
zero remote-contact hits. These are prospect signals, not proof of purchase
intent, job title, expansion, or hiring.

Lite now explicitly uses `public-keyword-paging-v1` for current and saved
`saudi-keyword-v1` plans:

- Understand the business, create one plan, then qualify listing text locally.
- Retain each customer's own queries, cities, relevance/exclusion rules and target.
- Use public listing phones and existing cached contacts; make no private phone
  reveal requests in this profile.
- Continue fresh pages on productive approved paths until target, real exhaustion,
  or existing administrator/provider limits. Keep seller/phone deduplication.
- A valid empty `search.items: []` may omit pagination and ends that query.
  Null/invalid JSON, missing/non-array items, malformed nonempty pages, denial,
  authentication and rate-limit responses remain failures under the shared guard.

No completed campaign was changed, restarted or billed again. No historical
queries were hardcoded into unrelated businesses. No provider pause or daily
counter was cleared. At deployment, the connection was paused on `invalid_response`;
an authorized administrator still needs to review/resume it before fresh searches.

Verification: `scripts/replay-lite-reference.mjs` replays all 200 delivered
examples read-only, asserts all 200 qualify and contain public phone evidence,
and makes zero network calls or writes. Keyword, safety and reliability tests
cover public-only execution, zero per-listing AI, relevance and malformed-page
handling. A replay is not a claim that a new live search delivered another 200.
