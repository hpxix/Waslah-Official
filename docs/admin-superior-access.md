# Administrator access

Superior access is derived from an **active server-loaded Directus identity**
whose user or role has an administrator policy. It is never granted by an email
address, client-side `isAdmin` flag, request payload or subscription.

Admins bypass customer feature/model flags (including disabled global flags and
account overrides), subscription approval and phone verification **for their own
workspace**. Workspace existence, authentication, provider setup, request budgets,
actual provider denials and credit accounting still apply. A null user role cannot
match another user's directly assigned administrator policy.

Admin control → **Superior access & settings** exposes existing feature names,
descriptions, default availability and JSON configuration; source names, actor IDs,
priority, availability and JSON configuration; and write-only API-token replacement.
These use the existing authenticated and audited backend endpoints. Configuration
JSON is data, not arbitrary executable code. Feature configuration is not a secret
store and may be visible to customer capability endpoints. Provider tokens use
the existing encrypted storage and are never prefilled in the browser.

The advanced platform-admin link opens the configured Directus administration
interface for full collection, user, role, schema and workflow management using
the administrator's own authenticated account. It never includes a bearer token.

Accounts/credits, private subscriptions, per-account model access, sourcing audits,
listing limits and shared Haraj budgets remain in their existing admin tabs.
Working research views are unlocked for admins; unfinished modules stay marked
unavailable instead of pretending a privilege override implements them.

Editing a feature's JSON does not automatically invent new runtime behavior:
only settings supported by the consuming feature take effect. This is not a raw
SQL executor or a way to bypass an external provider's restrictions.

## Latest slow-run evidence

Campaign `3e15148c-1db9-4832-a38a-f0fa965055e3` ran from
2026-10-18 12:36:43 UTC to 13:00:29 UTC before cancellation (23m 46s).
It explored 19,903 listings / 14,981 unique candidates, qualified 13 candidates,
and saved one new lead. Its AI review budget recorded zero requests; database
time was 413 ms and contact time 41 ms. Page ledger timestamps were typically
3.3 seconds apart, consistent with the shared request queue's 3-second minimum
completion-to-next-request gap plus provider latency. Accumulated `searchMs`
includes overlapping waits and must not be interpreted as exclusive wall time.
No performance settings or request limits were loosened during this diagnosis.

Offline verification: `bun scripts/test-admin-access.mjs` and
`bun scripts/test-haraj-safety.mjs`.
