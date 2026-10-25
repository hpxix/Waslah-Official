# Live Wasla provider-policy deployment — 25 October 2026

## Target and running version

- Docker container `waslah_directus`, image `directus/directus:11.17.4`.
- The container runs Directus under its internal PM2 manager; deployment uses a
  Docker restart, not a separate host PM2/systemd service.
- Frontend Nginx proxies `/directus/` to `directus:8055`.
- Host extension directory: `directus/extensions/directus-extension-waslah-lead-agent`.
- Container directory: `/directus/extensions/directus-extension-waslah-lead-agent`.
- Extension manifest loads `dist/index.js` directly. No compilation step is
  defined or needed for this existing plain-JavaScript extension.
- PostgreSQL database `waslah`, user `waslah`, host `postgres`, port `5432`,
  served by `waslah_postgres`.
- Container restarted at 08:33:39 Riyadh time; the extension loaded at 08:33:59.
- Live build: `wasla-haraj-provider-policy-20261025-v1`.
- Source SHA-256: `51fd8d9a8c1ecda9d3da9b24cc8b8c5dca8c6315e3c4d012fa5304ce1106ea28`.
- Live HTTP health and frontend-proxied health both returned that fingerprint.

The fingerprint is computed once at extension import over the 41 JavaScript
source files. Later filesystem edits do not change the running health value.
This distinguishes loaded code from files merely present on the bind mount.

## Deployment artifact and backup

Changes are included in `release-provider-policy-v1.tar.gz`; deployment does not
depend on committing the user's existing working-tree changes. The archive
includes the extension, migrations, scripts, and documentation. The active
extension uses the verified bind-mounted files from that artifact.

Backups are retained in `.deployment-backups/20261025-provider-policy-v1/`, a
restricted, Git-ignored directory:

- `waslah-before-deploy.dump`: full custom-format database backup; restore index
  read successfully. SHA-256:
  `79062e07f727f68fdbc56321d24e233ca2d406842c9927878aba02b406fa3831`.
- `mounted-extensions-pre-marker.tar.gz`: mounted extensions before adding the
  deployment identifier/smoke endpoint.
- `mounted-extensions-before-deploy.tar.gz`: pre-deployment mounted artifact.
- `git-head-extensions.tar.gz`: Git baseline extension archive.
- `tracked-worktree.patch`, `release-build.json`, database index and release.

## Files deployed

Modified extension modules: `b2c.js`, `contact-authorization.js`,
`contact-consent.js`, `lite-comment-buyers.js`, `index.js`.

New extension modules: `provider-contact-policy.js`, `contact-diagnostics.js`,
`haraj-business-directory.js`, `deployment-build.js`, `deployment-smoke.js`.

The centralized authorization, scope-specific checks, withdrawals, diagnostic
fields, and redacted candidate persistence are now loaded by the live process.

## Database migrations

The existing deployer applied the following idempotent scripts atomically:

1. `20261022_contact_authorizations.sql`
2. `20261022_contact_consent_workflow.sql`
3. `20261024_mahally_contact_provider.sql`
4. `20261025_merchant_directory.sql`
5. `20261025_haraj_business_directory.sql`
6. `20261025_provider_contact_permissions.sql`

The first five were already present and were reapplied idempotently. The sixth
created the previously absent provider-permission table. No permission, consent,
or deliverable-lead records were created by migration. Provider-permission rows
remain zero; undocumented scopes remain inactive.

## Live verification

`scripts/verify-live-provider-deployment.mjs` verified the actual running HTTP
service, including frontend proxy and matching build fingerprint. Unauthenticated
access to `/lead-agent/admin/deployment-smoke` was denied. After explicit approval,
the check authenticated through the normal Directus login using configured
administrator credentials, kept only in memory. No credentials were printed or
saved. No administrator tokens were extracted from the database.

The authenticated smoke endpoint runs the real `saveCandidate` function and the
central authorizer inside a transaction that always rolls back:

- Synthetic candidate inserted successfully with `QUALIFIED` status.
- Synthetic phone redacted before persistence.
- Candidate insertion succeeded without an individual consent record.
- Subsequent lookup correctly denied with separate
  `provider_permission_missing` and `consent_record_missing` diagnostics.
- New discovery/authorization diagnostic fields returned by the live process.
- Zero provider requests and zero deliverable leads created.
- Production candidate count before and after: **558,174**.
- Zero synthetic candidate rows remained after rollback.
- Provider permission table exists and contains **zero** records.

No campaigns were running or queued before restart; no historical search was
rerun. Haraj/B2C/Lite/Mahally regressions and isolated PostgreSQL tests passed.
No live phone lookup was used as a smoke test.

## Remaining activation requirement

Code deployment is verified. Provider-level phone access is not activated.
Provision only the actual reviewed provider agreement's explicit workspace,
subject/contact-field coverage, action list and validity window, with evidence
reference/digest and reviewer identity, as documented in
[Haraj provider contact policy](haraj-provider-contact-policy.md).
