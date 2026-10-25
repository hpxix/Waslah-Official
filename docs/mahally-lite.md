# Mahally in Wasla Lite

Mahally runs after the bounded Haraj stages when `MAHALLY_ENABLED=true` and the
requested count remains short. It searches the plan's first approved product
term and first requested city, follows real browser pagination, and discovers
unique merchants. These are stores selling the product, graded MEDIUM; no
purchase intent is claimed. City means the Mahally listing city.

The browser worker reads public search/product pages, binds the merchant domain
to the matching store ID in product data, and sends metadata to Directus. It
never receives the database or customer credentials and never retrieves phones.
Directus checks current merchant authorization before visiting that merchant's
official website, follows at most five same-origin pages with robots rules and
DNS-pinned HTTPS, and validates Saudi mobiles. One accepted phone per store is
saved through the existing transaction for inventory, workspace deduplication,
target enforcement and billing. Every accepted store is checkpointed immediately.
Downloads, reveals and calling permissions are checked against the Mahally grant
on each use. Haraj grants cannot authorize Mahally contacts.

No new page is inferred from `?page=2`. Repeated snapshots, unavailable visible
pagination, access restrictions, empty results, page/store limits and interrupted
streams have distinct reasons. A shortfall is not a completed request. Partial
results survive retries; checked store identities are checkpointed. The Haraj
prospect budget is unchanged; Mahally has its own bounded traversal of 30 search
pages and at most `ceil(requested*1000/30)` unique stores.

## Deployment

1. Apply the existing `20261022_contact_authorizations.sql` and
   `20261022_contact_consent_workflow.sql` migrations, then
   `20261024_mahally_contact_provider.sql`. The new migration is repeatable and
   creates no grants. Use the same migration transaction/release process as the
   consent workflow in `haraj-consent-workflow.md`.
   `bun scripts/deploy-contact-consent-migrations.mjs` prints the release hashes;
   adding `--apply` applies the three files atomically to the configured local
   Docker database. The migrations were applied locally on 2026-10-24; no grants
   or customer leads were created.
2. Configure `MAHALLY_WORKER_TOKEN` with a unique random value of at least 32
   characters in the Compose environment. Do not expose port 8060 publicly.
3. Build/start the isolated worker: `docker compose --profile mahally up -d --build mahally`.
4. Configure the trusted verifier for merchant identity and exact phone ownership.
   `/lead-agent/contact-consent/requests`, `/status` and `/revoke` accept
   `provider: "mahally"` and the Mahally store ID as `author_id`.
   A signed grant must include `provider: "mahally"`,
   `verification_method: "merchant_identity_and_phone_verification"`, the
   `mahally-commercial-contact-v1` statement version and actual verified numbers.
   The verifier uses the existing signed consent event protocol. Configure its
   merchant portal using `MAHALLY_CONSENT_PORTAL_URL`. Publication alone creates
   no consent, and this repository does not implement the external identity/phone
   verification service.
5. Set `MAHALLY_ENABLED=true` and recreate Directus during the coordinated backend
   release so its environment/module imports update. Do not indiscriminately
   restart the dirty source tree without the other pending migrations.

The worker runs as an unprivileged user with Chromium sandbox enabled and
Playwright v1.64.0's official `utils/docker/seccomp_profile.json`, vendored as
`infra/mahally-seccomp.json` (Microsoft Playwright, Apache-2.0), with `chroot`
allowed for Chromium's user-namespace sandbox while all host capabilities are
dropped. Without this rule the upstream conditional CAP_SYS_CHROOT rule is
excluded by Docker when `cap_drop: ALL` is used. Its
browser is restricted to marketplace/search/CDN hosts; merchant pages run only
through the pinned HTTPS reader. Docker hosts must support Chromium's sandbox
and user namespaces. The Compose service and smoke check apply that profile;
neither uses privileged mode nor `--no-sandbox`:
https://playwright.dev/docs/docker#crawling-and-scraping

## Verification

`bun scripts/test-mahally.mjs` is fully offline, including browser pagination and
merchant HTML fixtures. It tests city filtering, store identity, domain binding,
Arabic digits, phones, same-origin crawling, robots rules, duplicate stores and
phones, checkpointing, target cancellation, source separation and revocation.
The browser/website requests are injected; fixtures never fall back to live HTTP.
Run the existing authorization/consent tests and backend build too.

Live verification must show a fresh search response, a matching store domain,
and an authorized store contact persisted and revealed in Lite. Merely opening
the Mahally page or passing offline fixtures does not establish this. A target
of 100 stores is not guaranteed by the available city/product coverage.

Verified locally on 2026-10-24: the sandboxed Docker worker discovered one live
Mahally merchant domain (`phoneRequests: 0`, `newLeads: 0`, `billed: 0`). The real
PostgreSQL test additionally saved/revealed a synthetic authorized merchant,
rejected its duplicate without a second fixture charge, and hid its phone after
revocation. This does not claim a live merchant consent or a customer delivery.
# Merchant-directory policy update (2026-10-25)

The public-business-directory option is now implemented and enabled locally. See `merchant-directory.md` for the current policy and deployment. When enabled, explicit merchant telephone/WhatsApp links may be saved/revealed/downloaded using backend publication evidence rather than a consent grant. Calling still requires verified permission; revocation remains effective. The strict-grant behavior described below applies when directory mode is disabled.

