-- Design/example migration; NOT applied to production.
-- Apply the existing wasla_contact_* migrations first. Their signed grant
-- ingestion remains the authority for personal contact permissions.
CREATE TABLE IF NOT EXISTS haraj_business_publications (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  author_id text NOT NULL,
  phone_hash char(64) NOT NULL,
  profile_url text NOT NULL,
  source_url text NOT NULL,
  evidence_digest char(64) NOT NULL,
  evidence_kind text NOT NULL CHECK (evidence_kind IN
    ('owner_bound_business_contact_field','verified_company_website_contact')),
  verified_by text NOT NULL,
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > observed_at),
  revoked_at timestamptz,
  UNIQUE (organization_id,author_id,phone_hash,evidence_digest)
);
CREATE INDEX IF NOT EXISTS haraj_business_publication_lookup
 ON haraj_business_publications(organization_id,author_id,phone_hash);

-- A tombstone exists even if no permission/publication existed at withdrawal.
CREATE TABLE IF NOT EXISTS haraj_contact_suppressions (
  organization_id uuid NOT NULL,
  author_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  PRIMARY KEY(organization_id,author_id)
);

CREATE TABLE IF NOT EXISTS haraj_authorized_contacts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  author_id text NOT NULL,
  phone_hash char(64) NOT NULL,
  phone_ciphertext text NOT NULL,
  basis text NOT NULL CHECK (basis IN ('business_publication','verified_grant')),
  evidence_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,phone_hash)
);
CREATE TABLE IF NOT EXISTS haraj_collection_outcomes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  author_id text NOT NULL,
  listing_id text NOT NULL,
  status text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Do not expose these tables through customer Directus collection CRUD.
REVOKE ALL ON haraj_business_publications,haraj_contact_suppressions,
 haraj_authorized_contacts,haraj_collection_outcomes FROM PUBLIC;

-- Access must be checked through the authorizer at every reveal/export/call.
-- Direct SELECT on the ciphertext table is not a customer delivery interface.
