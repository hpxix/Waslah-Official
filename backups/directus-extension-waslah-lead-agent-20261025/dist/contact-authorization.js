import { createHash, randomUUID } from "node:crypto";
import {
  normalizePublicPhone,
  redactContactText,
} from "./contact-discovery.js";
import { merchantDirectoryDecision } from "./merchant-directory.js";
import { harajBusinessDirectoryDecision } from "./haraj-business-directory.js";
import { providerContactDecision } from "./provider-contact-policy.js";
export const CONTACT_AUTHORIZATION_TABLE = "wasla_contact_authorizations";
export const CONTACT_ACTIONS = Object.freeze([
  "lookup",
  "save",
  "reveal",
  "download",
  "call",
]);
export const consentTime = (value) =>
  value instanceof Date ? value.getTime() : Date.parse(value);
export const contactPhoneHash = (phone, provider = "haraj") => {
  provider = typeof provider === "string" ? provider : "haraj";
  const normalized = normalizePublicPhone(phone);
  return normalized
    ? createHash("sha256").update(`${provider}:${normalized}`).digest("hex")
    : null;
};
const json = (value, fallback) => {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
export function authorizationStatus(detail, action) {
  const statuses = {
    provider_permission_revoked: "revoked",
    provider_permission_scope_mismatch: "scope_mismatch",
    provider_permission_unverified: "verification_required",
    provider_permission_expired_or_not_active: "expired",
    provider_action_not_authorized: "action_required",
    consent_record_missing: "consent_required",
    consent_scope_mismatch: "scope_mismatch",
    consent_revoked: "revoked",
    consent_unverified: "verification_required",
    consent_expired_or_not_active: "expired",
    action_not_authorized: "action_required",
    phone_not_authorized: "phone_scope_required",
    verified_phone_scope_missing: "phone_scope_required",
    consent_registry_unconfigured: "configuration_required",
    missing_subject_scope: "scope_mismatch",
    provider_permission_missing: "configuration_required",
  };
  return {
    status: statuses[detail] || "not_authorized",
    requiredActions: action ? [action] : [],
    nextStep:
      detail === "consent_registry_unconfigured"
        ? "Apply consent migrations and configure the trusted Haraj verification bridge."
        : "Request the missing scope through the verified Haraj consent flow; an administrator cannot grant consent on the subject’s behalf.",
    requestPath: "/lead-agent/contact-consent/requests",
  };
}
export function coversContactAction(record, action) {
  const actions = json(record.actions, []);
  if (!Array.isArray(actions)) return false;
  if (actions.includes(action)) return true;
  // Saving necessarily includes collection. Legacy export covers disclosure,
  // never commercial calls. New grants use explicit reveal/download scopes.
  if (action === "lookup" && actions.includes("save")) return true;
  return (
    ["reveal", "download"].includes(action) &&
    Number(record.policy_version || 1) === 1 &&
    actions.includes("export")
  );
}
export async function lockContactSubject(
  trx,
  organizationId,
  authorId,
  { exclusive = false, provider = "haraj" } = {},
) {
  await trx.raw(
    `SELECT ${exclusive ? "pg_advisory_xact_lock" : "pg_advisory_xact_lock_shared"}(hashtextextended(?, 0))`,
    [`${provider}-consent:${organizationId}:${authorId}`],
  );
}
export async function auditContactEvent(database, event) {
  await database("wasla_contact_audit").insert({
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...event,
  });
}
export function evaluateContactAuthorization(
  record,
  { organizationId, authorId, action, phone, provider = "haraj" },
  now = Date.now(),
) {
  const deny = (detail) => ({
    allowed: false,
    reason: "not_authorized",
    detail,
    ...authorizationStatus(detail, action),
  });
  if (!organizationId || !authorId) return deny("missing_subject_scope");
  if (!record) return deny("consent_record_missing");
  if (
    !["haraj", "mahally"].includes(provider) ||
    String(record.organization_id) !== String(organizationId) ||
    String(record.author_id) !== String(authorId) ||
    record.provider !== provider ||
    record.purpose !== "lead_generation"
  )
    return deny("consent_scope_mismatch");
  if (record.status !== "granted" || record.revoked_at)
    return deny("consent_revoked");
  if (
    !record.id ||
    typeof record.evidence_reference !== "string" ||
    !record.evidence_reference.trim() ||
    typeof record.verified_by !== "string" ||
    !record.verified_by.trim() ||
    !Number.isFinite(consentTime(record.verified_at)) ||
    consentTime(record.verified_at) > now
  )
    return deny("consent_unverified");
  if (
    !Number.isFinite(consentTime(record.granted_at)) ||
    consentTime(record.granted_at) > now ||
    !Number.isFinite(consentTime(record.expires_at)) ||
    consentTime(record.expires_at) <= now
  )
    return deny("consent_expired_or_not_active");
  if (
    ![...CONTACT_ACTIONS, "export"].includes(action) ||
    !coversContactAction(record, action)
  )
    return deny("action_not_authorized");
  const hashes = json(record.phone_hashes, []);
  if (
    !Array.isArray(hashes) ||
    !hashes.length ||
    !hashes.every(
      (hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash),
    )
  )
    return deny("verified_phone_scope_missing");
  if (
    action !== "lookup" &&
    !hashes.includes(contactPhoneHash(phone, provider))
  )
    return deny("phone_not_authorized");
  return {
    allowed: true,
    status: "authorized",
    authorizationId: record.id,
    contactKind: record.contact_kind || "unknown",
    expiresAt: record.expires_at,
  };
}
// No client-supplied booleans, STORE flags or account-signup consent are read.
// Rows must be supplied by a trusted, verified first-party consent ingestion.
export function createContactAuthorizer(
  database,
  organizationId,
  { lock = false, now = Date.now } = {},
) {
  return async ({ authorId, action, phone, provider = "haraj" }) => {
    if (!["haraj", "mahally"].includes(provider))
      return {
        allowed: false,
        reason: "not_authorized",
        detail: "consent_scope_mismatch",
        ...authorizationStatus("consent_scope_mismatch", action),
      };
    if (!organizationId || !authorId)
      return {
        allowed: false,
        reason: "not_authorized",
        detail: "missing_subject_scope",
        ...authorizationStatus("missing_subject_scope", action),
      };
    let rows;
    try {
      if (database.transaction && !database.isTransaction)
        return database.transaction((trx) =>
          createContactAuthorizer(trx, organizationId, { lock: true, now })({
            authorId,
            action,
            phone,
            provider,
          }),
        );
      if (database.isTransaction)
        await lockContactSubject(database, organizationId, authorId, {
          provider,
        });
      let query = database(CONTACT_AUTHORIZATION_TABLE)
        .where({
          organization_id: organizationId,
          author_id: String(authorId),
          provider,
          purpose: "lead_generation",
        })
        .orderBy("verified_at", "desc")
        .orderBy("id", "desc");
      if (lock) query = query.forShare();
      rows = await query;
    } catch (error) {
      if (error.code !== "42P01") throw error;
      return {
        allowed: false,
        reason: "not_authorized",
        detail: "consent_registry_unconfigured",
        ...authorizationStatus("consent_registry_unconfigured", action),
      };
    }
    // V1 used subject-wide snapshots: only its newest snapshot may be used.
    // V2 grants are independent, explicitly revocable scopes (no fallback to
    // older versions of the same grant). A second phone grant must not erase
    // an unrelated valid permission.
    const legacy = rows.find((row) => Number(row.policy_version || 1) === 1);
    const current = [
      ...rows.filter((row) => Number(row.policy_version) >= 2),
      ...(legacy ? [legacy] : []),
    ];
    // Prefer a denial for the actual number over an unrelated grant's scope
    // mismatch, while still checking every independent grant for permission.
    if (phone)
      current.sort(
        (a, b) =>
          Number(
            json(b.phone_hashes, []).includes?.(
              contactPhoneHash(phone, provider),
            ) || false,
          ) -
          Number(
            json(a.phone_hashes, []).includes?.(
              contactPhoneHash(phone, provider),
            ) || false,
          ),
      );
    let result = evaluateContactAuthorization(
      current[0],
      { organizationId, authorId, action, phone, provider },
      now(),
    );
    for (const row of current) {
      const decision = evaluateContactAuthorization(
        row,
        { organizationId, authorId, action, phone, provider },
        now(),
      );
      if (decision.allowed) {
        result = decision;
        break;
      }
      if (result.detail === "consent_record_missing") result = decision;
    }
    const individualConsent = {
      allowed: result.allowed,
      detail: result.detail || "authorized",
    };
    if (provider === "mahally") {
      const directory = await merchantDirectoryDecision(
        database,
        organizationId,
        authorId,
        action,
        phone,
        now(),
      );
      // Explicit withdrawal always wins over the directory-publication basis.
      if (directory?.status === "revoked") result = directory;
      else if (
        directory?.allowed &&
        !current.some((row) => row.status === "revoked" || row.revoked_at)
      )
        result = directory;
    }
    if (provider === "haraj") {
      // A provider-verifier may attest an independently published business
      // contact. It is a different basis from personal consent and only covers
      // directory actions for the exact bound number.
      const directory = await harajBusinessDirectoryDecision(
        database,
        organizationId,
        authorId,
        action,
        phone,
        now(),
      );
      if (directory?.status === "revoked") result = directory;
      else if (
        directory?.allowed &&
        !current.some((row) => row.status === "revoked" || row.revoked_at)
      )
        result = directory;
      const policy = await providerContactDecision(
        database,
        organizationId,
        { provider, action, phone },
        now(),
      );
      // Provider coverage is an independent authorization basis. Personal
      // consent is not a prerequisite when the reviewed agreement covers the
      // operation. Explicit subject withdrawal still wins over every basis.
      if (
        directory?.status !== "revoked" &&
        !current.some((row) => row.status === "revoked" || row.revoked_at)
      ) {
        if (
          policy?.allowed ||
          policy?.detail === "provider_permission_revoked"
        ) {
          result = policy;
        } else if (policy && !result.allowed) {
          result = {
            ...policy,
            ...authorizationStatus(policy.detail, action),
            nextStep:
              "Verify and configure the applicable Haraj provider permission.",
          };
        }
      }
      result = {
        ...result,
        providerAuthorization: {
          allowed: Boolean(policy?.allowed),
          detail: policy?.allowed
            ? policy.basis
            : policy?.detail || "provider_permission_missing",
        },
        individualConsent,
      };
    }
    if (provider === "mahally" && !result.allowed)
      result.nextStep =
        "Request merchant authorization through /lead-agent/contact-consent/requests with provider mahally; the trusted verifier must verify merchant identity and phone ownership.";
    if (database.isTransaction)
      await auditContactEvent(database, {
        organization_id: organizationId,
        author_id: String(authorId),
        provider,
        action,
        event_type: "authorization_decision",
        authorization_id: result.authorizationId || null,
        allowed: result.allowed,
        detail: result.allowed ? result.basis || "authorized" : result.detail,
        actor: "backend",
      });
    return result;
  };
}
export async function authorizeContactSave(
  database,
  organizationId,
  candidate,
  phone,
  { lock = false } = {},
) {
  return createContactAuthorizer(database, organizationId, { lock })({
    authorId: candidate.contactSubject?.authorId || candidate.authorId,
    provider: candidate.contactSubject?.provider || "haraj",
    action: "save",
    phone,
  });
}
function redactTree(value, allowed) {
  if (Array.isArray(value)) return value.map((v) => redactTree(v, allowed));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /^(?:id|.*_id|postId|authorId|source_reference|sourcePostId)$/.test(k)
          ? v
          : redactTree(v, allowed),
      ]),
    );
  if (typeof value === "string")
    return allowed.has(normalizePublicPhone(value))
      ? value
      : redactContactText(value);
  if (
    typeof value === "number" &&
    normalizePublicPhone(value) &&
    !allowed.has(normalizePublicPhone(value))
  )
    return null;
  return value;
}
export const redactUnauthorizedContactData = (value, allowedPhones = []) =>
  redactTree(
    value,
    new Set(allowedPhones.map(normalizePublicPhone).filter(Boolean)),
  );
// Apply before every Haraj phone-bearing response, including legacy saved rows.
export async function authorizeContactExport(
  database,
  row,
  organizationId,
  { sourceHint, action = "reveal" } = {},
) {
  let payload = json(row.raw_payload, {}),
    evidence = json(row.evidence, []);
  let provider =
    [
      row.source_internal,
      row.sourceInternal,
      row.source,
      payload.contact_subject?.provider,
      ...(Array.isArray(evidence)
        ? evidence.map((item) => item.contactSubject?.provider)
        : []),
    ].includes("mahally") ||
    /^mahally:\d+$/.test(String(row.source_reference || ""))
      ? "mahally"
      : "haraj";
  const isHaraj =
    provider === "mahally" ||
    [row.source, row.sourceInternal, sourceHint].some((source) =>
      ["b2c", "haraj"].includes(String(source || "").toLowerCase()),
    ) ||
    (Array.isArray(evidence) && evidence.some((item) => item.buyerComment));
  if (!isHaraj) return row;
  if (database.transaction && !database.isTransaction)
    return database.transaction((trx) =>
      authorizeContactExport(trx, row, organizationId, { sourceHint, action }),
    );
  let authorId =
    payload.contact_subject?.authorId ||
    (Array.isArray(evidence)
      ? evidence.find((item) => item.contactSubject)?.contactSubject?.authorId
      : null) ||
    row.author_id ||
    row.source_reference ||
    payload.sellerLead?.author_id;
  if (!authorId) {
    const inventory = await database("lead_inventory")
      .select("source_reference", "raw_payload")
      .where({ id: row.lead_id || row.id })
      .first();
    if (inventory) {
      payload = json(inventory.raw_payload, {});
      authorId =
        payload.contact_subject?.authorId ||
        inventory.source_reference ||
        payload.sellerLead?.author_id;
      if (
        payload.contact_subject?.provider === "mahally" ||
        /^mahally:\d+$/.test(String(inventory.source_reference || ""))
      )
        provider = "mahally";
    }
  }
  if (provider === "mahally")
    authorId = String(authorId || "").replace(/^mahally:/, "");
  const phones = [
    row.phone,
    ...(Array.isArray(payload.phone_numbers) ? payload.phone_numbers : []).map(
      (p) => p.number,
    ),
    ...(Array.isArray(evidence) ? evidence : []).flatMap((item) =>
      Array.isArray(item.businessContact?.phones)
        ? item.businessContact.phones
        : [],
    ),
  ]
    .map(normalizePublicPhone)
    .filter(Boolean);
  const allowed = new Set(),
    exclusions = [],
    contactKinds = new Set();
  const authorize = createContactAuthorizer(database, organizationId, {
    lock: Boolean(database.isTransaction),
  });
  for (const phone of new Set(phones)) {
    const result = await authorize({ authorId, action, phone, provider });
    if (result.allowed) {
      allowed.add(phone);
      contactKinds.add(result.contactKind);
    } else
      exclusions.push({
        reason: "not_authorized",
        detail: result.detail,
        status: result.status,
        nextStep: result.nextStep,
        requiredActions: result.requiredActions,
        providerAuthorization: result.providerAuthorization,
        individualConsent: result.individualConsent,
        stage: action,
      });
  }
  const sanitized = redactTree(
    {
      ...row,
      ...(Object.hasOwn(row, "raw_payload") ? { raw_payload: payload } : {}),
      ...(Object.hasOwn(row, "evidence") ? { evidence } : {}),
    },
    allowed,
  );
  sanitized.phone = allowed.has(normalizePublicPhone(row.phone))
    ? row.phone
    : null;
  sanitized.contact_exclusions = exclusions;
  sanitized.contact_authorization = {
    status: allowed.size
      ? exclusions.length
        ? "partially_authorized"
        : "authorized"
      : phones.length
        ? exclusions[0]?.status || "not_authorized"
        : "missing",
    action,
    contactKinds: [...contactKinds],
    nextStep: exclusions[0]?.nextStep || null,
  };
  return sanitized;
}
