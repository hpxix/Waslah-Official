# Transient request failures no longer cause sticky pauses

The old guard permanently set `paused:true, reason:request_failed` after three transport/server errors. That blocked future campaign submissions, even after the connection recovered.

Source behavior now:

- Transport failures, HTTP 408 and 5xx remain individual failed requests; shared bounded backoff grows to at most 30 seconds. Existing bounded idempotent-search retries still apply.
- These failures do not create permanent account pauses or repeated admin-pause alerts.
- An old persisted `request_failed` pause is recovered only when its saved failure event confirms a transient status. Retry-After is retained as the earliest allowed request time. Usage counters, limits, contact circuits and consent are unchanged.
- HTTP 401/403/429, provider access/credit denials, malformed responses, administrator pauses, quotas, and uncertain expired leases still stop requests. This change does not remove the entire request guard or bypass a provider restriction.

`scripts/recover-haraj-transient-pause.mjs` applies the narrow live recovery through the existing audited admin API, without a provider request or campaign launch. It refuses unknown/non-transient causes, active requests, or an unelapsed Retry-After. Updating source is distinct from loading it into running backend processes; a coordinated backend release is required for the new automatic recovery behavior.

Verification: `scripts/test-haraj-safety.mjs` covers repeated 503 failures, old transient pause recovery, usage preservation, provider backoff and retained denial/admin/quota stops. Existing comment-wrapper tests and backend bundling also pass with no provider traffic.

Expired request locks: new leases persist their operation kind. Expired known read-only leases (search/comments/profile/posts) can recover with shared pacing; unknown legacy leases and contact reveals still require review. Late read completions are discarded without pausing or overwriting a newer worker's lease. A reviewed legacy interrupted-request pause may be recovered through the admin script only after its timeout has elapsed, with no active request, no contact usage and no provider Retry-After. No campaign is started by recovery.

`haraj-public-error.js` maps allowlisted operational failures to actionable 503 messages in the backend route wrapper; arbitrary SQL and other 5xx details stay hidden. These permanent source fixes are distinct from clearing the currently saved live pause. The pending backend release must still coordinate the previously documented consent migrations and first-party bridge; the recovery script does not deploy unrelated source changes.
