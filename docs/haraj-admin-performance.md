# Haraj API performance

Admin → Haraj API performance (أداء حراج والتحكم) controls the shared connection for all client Lite campaigns. The backend requires the existing verified admin identity for both reads and writes.

- **Remove Wasla restriction** opens an explicit review dialog. Listing-only release is the default; it preserves the independent phone-lookup pause. The optional phone-lookup checkbox requests the existing full-scope admin resume.
- **Save performance settings** requires confirmation and updates shared spacing, daily requests, daily contact reveals and consecutive-empty stop thresholds without resuming a connection or clearing usage. The guard still serializes requests and enforces cooldowns and bounds.
- Release does not start or retry a campaign, reset daily budgets, or override a provider restriction. A new bad response can pause the connection again.
- Status polls Wasla every 10 seconds, never Haraj. Unsaved limit edits survive polling.

## Measurement contract

The status API computes accepted-response rate and network-operation latency from request events in the last 24 hours retained in the existing 50-event buffer. This is a bounded recent sample, not complete historical analytics. HTTP success and structurally valid data are distinct. Older events have no invented latency; timing begins with new requests. Daily budgets reset on UTC boundaries; timeline timestamps are rendered in Asia/Riyadh.

The 0–100 operational-pressure meter is a deterministic internal heuristic, **not a ban probability or provider-approved operating threshold**. It combines daily total-request utilization (up to 30), recent invalid/failed response share (up to 45), spacing below 3 seconds (+15), and consecutive empty contacts (up to 10). A connection pause sets a minimum of 75; explicit authentication, access or rate-limit stops set a minimum of 90. Without recent samples or an existing pause the score is unknown. Reasons are shown beside the meter.

Request events store elapsed milliseconds, HTTP status, outcome and only an allowlisted response-schema diagnostic. No tokens, response bodies or personal contact data are added. Admin configure/resume events record actor, selected scope and effective limits. The existing platform admin audit is also retained.

Verification: `bun scripts/test-haraj-performance.mjs`, `bun scripts/test-haraj-safety.mjs`, `bun scripts/test-admin-access.mjs`, TypeScript and production build. These checks make no Haraj calls and do not release the live connection.
