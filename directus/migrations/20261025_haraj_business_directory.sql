-- Trusted Haraj/provider evidence for independently published business phones.
-- The collection worker and customer-facing Directus roles must not insert rows.
CREATE TABLE IF NOT EXISTS haraj_business_publications (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  author_id text NOT NULL,
  phone_hash char(64) NOT NULL,
  profile_url text NOT NULL,
  source_url text NOT NULL,
  evidence_digest char(64) NOT NULL,
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('owner_bound_business_contact_field','verified_company_website_contact')),
  verified_by text NOT NULL,
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > observed_at),
  revoked_at timestamptz,
  UNIQUE (organization_id,author_id,phone_hash,evidence_digest)
);
CREATE INDEX IF NOT EXISTS haraj_business_publication_lookup
  ON haraj_business_publications (organization_id,author_id,phone_hash,observed_at DESC);
CREATE TABLE IF NOT EXISTS haraj_contact_suppressions (
  organization_id uuid NOT NULL,
  author_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  PRIMARY KEY (organization_id,author_id)
);
REVOKE ALL ON haraj_business_publications,haraj_contact_suppressions FROM PUBLIC;
