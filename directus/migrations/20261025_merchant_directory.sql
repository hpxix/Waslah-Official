-- Publication evidence, not an outreach-consent grant. Backend-only table.
CREATE TABLE IF NOT EXISTS wasla_merchant_directory (
  organization_id uuid NOT NULL,
  author_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked')),
  domain text,
  product_url text,
  source_urls jsonb NOT NULL DEFAULT '[]',
  phone_hashes jsonb NOT NULL DEFAULT '[]',
  observed_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (organization_id,author_id),
  CHECK (status='revoked' OR (domain IS NOT NULL AND product_url IS NOT NULL AND observed_at IS NOT NULL AND expires_at > observed_at))
);
