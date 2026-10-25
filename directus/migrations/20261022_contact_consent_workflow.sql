BEGIN;
ALTER TABLE wasla_contact_authorizations ADD COLUMN IF NOT EXISTS policy_version integer NOT NULL DEFAULT 1;
ALTER TABLE wasla_contact_authorizations ADD COLUMN IF NOT EXISTS contact_kind text NOT NULL DEFAULT 'unknown'
  CHECK (contact_kind IN ('unknown','personal','public_business'));
ALTER TABLE wasla_contact_authorizations ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE wasla_contact_authorizations ADD COLUMN IF NOT EXISTS receipt_digest text;
CREATE INDEX IF NOT EXISTS wasla_contact_authorizations_live_idx
  ON wasla_contact_authorizations (organization_id, author_id, verified_at DESC);

CREATE TABLE IF NOT EXISTS wasla_contact_consent_requests (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, author_id text NOT NULL,
  requested_by uuid NOT NULL, actions jsonb NOT NULL CHECK (jsonb_typeof(actions)='array'),
  statement_version text NOT NULL, disclosure jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','granted','cancelled')),
  created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  grant_expires_at timestamptz NOT NULL, challenge_hash text, challenge_expires_at timestamptz,
  authorization_id uuid, CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS wasla_contact_consent_requests_workspace_idx
  ON wasla_contact_consent_requests (organization_id, author_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wasla_contact_authorizations_request_idx
  ON wasla_contact_authorizations (request_id) WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wasla_contact_consent_events (
  event_id uuid PRIMARY KEY, receipt_digest text NOT NULL, processed_at timestamptz NOT NULL,
  authorization_id uuid NOT NULL, event_type text NOT NULL CHECK (event_type IN ('grant','revoke'))
);
CREATE TABLE IF NOT EXISTS wasla_contact_audit (
  id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL, author_id text NOT NULL,
  authorization_id uuid, request_id uuid, actor text NOT NULL,
  event_type text NOT NULL, action text, allowed boolean, detail text NOT NULL
);
CREATE INDEX IF NOT EXISTS wasla_contact_audit_workspace_idx
  ON wasla_contact_audit (organization_id, created_at DESC, id DESC);
CREATE OR REPLACE FUNCTION wasla_contact_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Consent audit is append-only'; END $$;
DROP TRIGGER IF EXISTS wasla_contact_audit_immutable ON wasla_contact_audit;
CREATE TRIGGER wasla_contact_audit_immutable BEFORE UPDATE OR DELETE ON wasla_contact_audit
  FOR EACH ROW EXECUTE FUNCTION wasla_contact_audit_append_only();
REVOKE ALL ON wasla_contact_authorizations, wasla_contact_consent_requests,
  wasla_contact_consent_events, wasla_contact_audit FROM PUBLIC;
COMMIT;
