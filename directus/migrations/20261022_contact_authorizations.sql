-- Trusted backend-only consent registry. No customer-facing grant endpoint.
-- Import only independently verified first-party subject consents. Neither
-- publication, STORE status, an administrator checkbox nor signup consent is
-- evidence of a commenter's authorization to disclose a phone for this purpose.
CREATE TABLE IF NOT EXISTS wasla_contact_authorizations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'haraj'),
  author_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose = 'lead_generation'),
  status text NOT NULL CHECK (status IN ('granted','revoked')),
  actions jsonb NOT NULL CHECK (jsonb_typeof(actions) = 'array'),
  phone_hashes jsonb NOT NULL CHECK (jsonb_typeof(phone_hashes) = 'array'),
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) > 0),
  verified_by text NOT NULL CHECK (length(trim(verified_by)) > 0),
  verified_at timestamptz NOT NULL,
  granted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > granted_at)
);
CREATE INDEX IF NOT EXISTS wasla_contact_authorizations_subject_idx
  ON wasla_contact_authorizations (organization_id, provider, author_id, purpose);
