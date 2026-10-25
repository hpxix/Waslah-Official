-- Backend-only reviewed provider authorization. No permissions are seeded.
-- Activate only after verifying the agreement's explicit operation/workspace
-- scope. All-provider-subject coverage must be stated by that agreement.
CREATE TABLE IF NOT EXISTS wasla_provider_contact_permissions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider='haraj'),
  purpose text NOT NULL CHECK (purpose='lead_generation'),
  subject_scope text NOT NULL CHECK (subject_scope='all_provider_subjects'),
  contact_scope text NOT NULL CHECK (contact_scope='provider_contact_fields'),
  actions jsonb NOT NULL CHECK (jsonb_typeof(actions)='array' AND jsonb_array_length(actions)>0
    AND actions <@ '["lookup","save","reveal","download","call"]'::jsonb),
  status text NOT NULL CHECK (status IN ('active','revoked')),
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference))>0),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  verified_by text NOT NULL CHECK (length(trim(verified_by))>0),
  verified_at timestamptz NOT NULL,
  valid_from timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at>valid_from),
  revoked_at timestamptz,
  UNIQUE (organization_id,provider,purpose)
);
REVOKE ALL ON wasla_provider_contact_permissions FROM PUBLIC;
