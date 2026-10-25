import { normalizePublicPhone } from "./contact-discovery.js";

export const PROVIDER_CONTACT_POLICY_TABLE =
  "wasla_provider_contact_permissions";
const ACTIONS = ["lookup", "save", "reveal", "download", "call"];
const time = (value) =>
  value instanceof Date ? value.getTime() : Date.parse(value);
const parsed = (value) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};
const deny = (detail) => ({
  allowed: false,
  reason: "not_authorized",
  detail,
  status:
    detail === "provider_permission_revoked"
      ? "revoked"
      : "provider_permission_required",
});

// These are reviewed provider permissions, not inferred token capabilities.
// Each operation is explicit: save does not imply lookup; download does not
// imply reveal or calling. A single current row prevents fallback to an older
// agreement after withdrawal. No customer API or collection worker writes it.
export function evaluateProviderContactPermission(
  record,
  { organizationId, provider = "haraj", action, phone },
  now = Date.now(),
) {
  if (!record) return deny("provider_permission_missing");
  if (
    provider !== "haraj" ||
    record.provider !== provider ||
    String(record.organization_id) !== String(organizationId) ||
    record.purpose !== "lead_generation" ||
    record.subject_scope !== "all_provider_subjects" ||
    record.contact_scope !== "provider_contact_fields"
  )
    return deny("provider_permission_scope_mismatch");
  if (record.status !== "active" || record.revoked_at)
    return deny("provider_permission_revoked");
  if (
    !record.id ||
    typeof record.evidence_reference !== "string" ||
    !record.evidence_reference.trim() ||
    !/^[a-f0-9]{64}$/.test(record.evidence_digest || "") ||
    typeof record.verified_by !== "string" ||
    !record.verified_by.trim() ||
    !Number.isFinite(time(record.verified_at)) ||
    time(record.verified_at) > now
  )
    return deny("provider_permission_unverified");
  if (
    !Number.isFinite(time(record.valid_from)) ||
    time(record.valid_from) > now ||
    !Number.isFinite(time(record.expires_at)) ||
    time(record.expires_at) <= now
  )
    return deny("provider_permission_expired_or_not_active");
  const actions = parsed(record.actions);
  if (
    !ACTIONS.includes(action) ||
    !Array.isArray(actions) ||
    !actions.every((value) => ACTIONS.includes(value)) ||
    !actions.includes(action)
  )
    return deny("provider_action_not_authorized");
  if (action !== "lookup" && !normalizePublicPhone(phone))
    return deny("invalid_contact_phone");
  return {
    allowed: true,
    status: "authorized",
    basis: "verified_provider_permission",
    authorizationId: record.id,
    contactKind: "unknown",
    expiresAt: record.expires_at,
  };
}

export async function providerContactDecision(
  database,
  organizationId,
  scope,
  now = Date.now(),
) {
  if (scope.provider !== "haraj") return null;
  // Check existence before querying within PostgreSQL transactions: catching
  // undefined_table alone would leave the whole transaction aborted.
  if (
    database.schema &&
    !(await database.schema.hasTable(PROVIDER_CONTACT_POLICY_TABLE))
  )
    return deny("provider_permission_registry_unconfigured");
  try {
    let query = database(PROVIDER_CONTACT_POLICY_TABLE)
      .where({
        organization_id: organizationId,
        provider: scope.provider,
        purpose: "lead_generation",
      })
      .orderBy("verified_at", "desc")
      .orderBy("id", "desc");

    if (database.isTransaction) query = query.forShare();

    const row = await query.first();
    const decision = evaluateProviderContactPermission(
      row,
      { organizationId, ...scope },
      now,
    );
    return row ? { ...decision, authorizationId: row.id } : decision;
  } catch (error) {
    if (error.code === "42P01")
      return deny("provider_permission_registry_unconfigured");
    throw error;
  }
}
