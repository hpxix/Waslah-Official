-- Existing verified grants stay provider-bound. This adds no authorization rows.
ALTER TABLE wasla_contact_authorizations
  DROP CONSTRAINT IF EXISTS wasla_contact_authorizations_provider_check;
ALTER TABLE wasla_contact_authorizations
  ADD CONSTRAINT wasla_contact_authorizations_provider_check
  CHECK (provider IN ('haraj','mahally'));
ALTER TABLE wasla_contact_consent_requests
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'haraj'
  CHECK (provider IN ('haraj','mahally'));
ALTER TABLE wasla_contact_audit
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'haraj'
  CHECK (provider IN ('haraj','mahally'));
