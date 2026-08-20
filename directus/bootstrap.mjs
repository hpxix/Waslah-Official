const directusUrl = (process.env.DIRECTUS_INTERNAL_URL || "http://directus:8055").replace(/\/$/, "");
const adminEmail = process.env.DIRECTUS_ADMIN_EMAIL || "bootstrap@waslah.ai";
const adminPassword = process.env.DIRECTUS_ADMIN_PASSWORD || "change-me-now";
const customerRoleId = process.env.WASLAH_CUSTOMER_ROLE_ID || "8c62f1c4-258c-4d77-92f2-33f87db31765";

let accessToken = "";

const uuid = (hidden = true) => ({
  type: "uuid",
  meta: { hidden, readonly: hidden, interface: "input", special: ["uuid"] },
  schema: { is_primary_key: hidden, is_nullable: false },
});

const string = ({ required = false, unique = false, length = 255, hidden = false, defaultValue = null } = {}) => ({
  type: "string",
  meta: { interface: "input", required, hidden },
  schema: { is_nullable: !required, is_unique: unique, max_length: length, default_value: defaultValue },
});

const text = ({ required = false, hidden = false } = {}) => ({
  type: "text",
  meta: { interface: "input-multiline", required, hidden },
  schema: { is_nullable: !required },
});

const integer = ({ required = false, defaultValue = null } = {}) => ({
  type: "integer",
  meta: { interface: "input", required },
  schema: { is_nullable: !required, default_value: defaultValue },
});

const json = ({ hidden = false } = {}) => ({
  type: "json",
  meta: { interface: "input-code", options: { language: "json" }, hidden },
  schema: { is_nullable: true },
});

const timestamp = (special) => ({
  type: "timestamp",
  meta: { interface: "datetime", readonly: Boolean(special), special: special ? [special] : null },
  schema: { is_nullable: true },
});

const boolean = (defaultValue = false) => ({
  type: "boolean",
  meta: { interface: "boolean" },
  schema: { is_nullable: false, default_value: defaultValue },
});

const collections = [
  {
    name: "organizations",
    icon: "domain",
    note: "Customer workspaces and tenant boundary.",
    fields: {
      id: uuid(),
      name: string({ required: true }),
      slug: string({ required: true, unique: true }),
      owner_user: uuid(false),
      status: string({ required: true }),
      monthly_user_limit: integer({ required: true, defaultValue: 25 }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "organization_members",
    icon: "group",
    note: "Users attached to a workspace.",
    fields: {
      id: uuid(),
      membership_key: string({ required: true, unique: true }),
      organization_id: uuid(false),
      user_id: uuid(false),
      role: string({ required: true }),
      status: string({ required: true }),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "customer_profiles",
    icon: "badge",
    note: "Application profile and phone verification state.",
    fields: {
      id: uuid(),
      user_id: { ...uuid(false), schema: { is_nullable: false, is_unique: true } },
      organization_id: uuid(false),
      phone_e164: string({ required: true, unique: true, length: 20 }),
      phone_verified_at: timestamp(),
      avatar_seed: string({ required: true, length: 80 }),
      locale: string({ required: true, length: 10 }),
      marketing_consent: boolean(false),
      privacy_consent_at: timestamp(),
      permissions_consent_at: timestamp(),
      consent_version: string({ required: true, length: 32, defaultValue: "unaccepted" }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "wallets",
    icon: "account_balance_wallet",
    note: "One balance per workspace, stored in halalas.",
    fields: {
      id: uuid(),
      organization_id: { ...uuid(false), schema: { is_nullable: false, is_unique: true } },
      currency: string({ required: true, length: 3 }),
      balance_halalas: integer({ required: true, defaultValue: 0 }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "wallet_transactions",
    icon: "receipt_long",
    note: "Immutable credit ledger. Never edit or delete entries.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      wallet_id: uuid(false),
      type: string({ required: true, length: 40 }),
      amount_halalas: integer({ required: true }),
      idempotency_key: string({ required: true, unique: true }),
      reference_type: string({ length: 60 }),
      reference_id: string({ length: 255 }),
      metadata: json({ hidden: true }),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "phone_verifications",
    icon: "sms",
    note: "Short-lived OTP attempts. Codes are never stored in plaintext.",
    fields: {
      id: uuid(),
      user_id: uuid(false),
      phone_e164: string({ required: true, length: 20 }),
      provider: string({ required: true, length: 30 }),
      provider_reference: string({ length: 255 }),
      code_hash: string({ length: 128, hidden: true }),
      status: string({ required: true, length: 30 }),
      attempts: integer({ required: true, defaultValue: 0 }),
      expires_at: timestamp(),
      verified_at: timestamp(),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "lead_requests",
    icon: "manage_search",
    note: "A client's requested lead segment and sourcing job.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      created_by: uuid(false),
      query: text({ required: true }),
      criteria: json(),
      target_count: integer({ required: true, defaultValue: 20 }),
      status: string({ required: true, length: 40 }),
      provider: string({ length: 40 }),
      provider_job_id: string({ length: 255 }),
      idempotency_key: string({ required: true, unique: true }),
      result_count: integer({ required: true, defaultValue: 0 }),
      error_message: text({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "lead_inventory",
    icon: "contacts",
    note: "Canonical, deduplicated Waslah lead inventory. PII is server-gated.",
    fields: {
      id: uuid(),
      fingerprint: string({ required: true, unique: true, length: 64, hidden: true }),
      name: string(),
      title: string(),
      company: string({ required: true }),
      company_normalized: string({ required: true }),
      email: string({ hidden: true }),
      phone: string({ length: 30, hidden: true }),
      person_image_url: string({ length: 500 }),
      company_image_url: string({ length: 500 }),
      website: string(),
      linkedin_url: string({ length: 500 }),
      company_linkedin_url: string({ length: 500 }),
      location: string(),
      industry: string(),
      seniority: string({ length: 80 }),
      company_size: integer(),
      annual_revenue: string({ length: 100 }),
      review_score: string({ length: 20 }),
      review_count: integer(),
      source: string({ required: true, length: 80 }),
      source_reference: string({ length: 255 }),
      fit_score: integer({ required: true, defaultValue: 0 }),
      qualification_status: string({ required: true, length: 40 }),
      enrichment_status: string({ required: true, length: 40, defaultValue: "raw" }),
      enrichment_score: integer({ required: true, defaultValue: 0 }),
      enrichment_summary: text(),
      enrichment_signals: json(),
      raw_payload: json({ hidden: true }),
      last_enriched_at: timestamp(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "lead_request_results",
    icon: "dataset_linked",
    note: "Ranked leads returned for one workspace request.",
    fields: {
      id: uuid(),
      result_key: string({ required: true, unique: true }),
      organization_id: uuid(false),
      request_id: uuid(false),
      lead_id: uuid(false),
      rank: integer({ required: true }),
      preview: json(),
      status: string({ required: true, length: 40 }),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "lead_access_grants",
    icon: "key",
    note: "Workspace entitlement to view a lead's contact details.",
    fields: {
      id: uuid(),
      grant_key: string({ required: true, unique: true }),
      organization_id: uuid(false),
      lead_id: uuid(false),
      transaction_id: uuid(false),
      grant_reason: string({ required: true, length: 40 }),
      granted_at: timestamp("date-created"),
    },
  },
  {
    name: "call_attempts",
    icon: "phone_in_talk",
    note: "Each outbound qualification attempt and its final artifact.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      request_id: uuid(false),
      lead_id: uuid(false),
      provider: string({ required: true, length: 40 }),
      provider_call_id: string({ unique: true }),
      attempt_number: integer({ required: true, defaultValue: 1 }),
      status: string({ required: true, length: 50 }),
      outcome: string({ length: 80 }),
      phone: string({ length: 30, hidden: true }),
      cost_halalas: integer({ required: true, defaultValue: 0 }),
      provider_cost_micros: integer({ required: true, defaultValue: 0 }),
      provider_cost_currency: string({ required: true, length: 3, defaultValue: "USD" }),
      started_at: timestamp(),
      ended_at: timestamp(),
      recording_url: string({ hidden: true }),
      transcript: text({ hidden: true }),
      summary: text(),
      raw_payload: json({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "call_events",
    icon: "event_note",
    note: "Append-only Vapi webhook audit events.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      call_attempt_id: uuid(false),
      provider_event_id: string({ required: true, unique: true }),
      event_type: string({ required: true, length: 80 }),
      payload: json({ hidden: true }),
      received_at: timestamp("date-created"),
    },
  },
  {
    name: "qualifications",
    icon: "fact_check",
    note: "Structured outcome extracted from an AI qualification call.",
    fields: {
      id: uuid(),
      qualification_key: string({ required: true, unique: true }),
      organization_id: uuid(false),
      lead_id: uuid(false),
      call_attempt_id: uuid(false),
      status: string({ required: true, length: 40 }),
      score: integer({ required: true, defaultValue: 0 }),
      answers: json(),
      summary: text(),
      next_action: string(),
      qualified_at: timestamp(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "integration_events",
    icon: "outbox",
    note: "Idempotent outbox for n8n and provider jobs.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      event_type: string({ required: true, length: 80 }),
      status: string({ required: true, length: 40 }),
      idempotency_key: string({ required: true, unique: true }),
      payload: json({ hidden: true }),
      attempts: integer({ required: true, defaultValue: 0 }),
      available_at: timestamp(),
      processed_at: timestamp(),
      last_error: text({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
];

async function request(path, options = {}) {
  const response = await fetch(`${directusUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || `${response.status} ${response.statusText}`;
    throw new Error(`${options.method || "GET"} ${path}: ${message}`);
  }
  return payload.data;
}

async function login() {
  const data = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminEmail, password: adminPassword, mode: "json" }),
  });
  accessToken = data.access_token;
}

async function ensureRole() {
  const roles = await request(`/roles?filter[id][_eq]=${customerRoleId}&limit=1`);
  if (roles.length) return;

  await request("/roles", {
    method: "POST",
    body: JSON.stringify({
      id: customerRoleId,
      name: "Waslah Customer",
      icon: "business_center",
      description: "Authenticated application users. Data access is enforced by the lead-agent API.",
    }),
  });
  console.log("Created Waslah Customer role");
}

function fieldPayload(collection, field, definition) {
  return {
    collection,
    field,
    ...definition,
    meta: { ...definition.meta, collection, field },
    schema: { ...definition.schema, name: field, table: collection },
  };
}

async function ensureCollection(spec, existingNames) {
  if (!existingNames.has(spec.name)) {
    await request("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: spec.name,
        meta: {
          collection: spec.name,
          icon: spec.icon,
          note: spec.note,
          hidden: false,
          singleton: false,
          accountability: "all",
        },
        schema: { name: spec.name },
        fields: Object.entries(spec.fields).map(([field, definition]) => fieldPayload(spec.name, field, definition)),
      }),
    });
    console.log(`Created ${spec.name}`);
    return;
  }

  const currentFields = await request(`/fields/${spec.name}`);
  const currentNames = new Set(currentFields.map((field) => field.field));
  for (const [field, definition] of Object.entries(spec.fields)) {
    if (currentNames.has(field)) continue;
    try {
      await request(`/fields/${spec.name}`, {
        method: "POST",
        body: JSON.stringify(fieldPayload(spec.name, field, definition)),
      });
      console.log(`Added ${spec.name}.${field}`);
    } catch (error) {
      if (!String(error.message).includes("already exists")) throw error;
    }
  }
}

async function main() {
  await login();
  await ensureRole();

  const currentCollections = await request("/collections");
  const existingNames = new Set(currentCollections.map((entry) => entry.collection));
  for (const spec of collections) {
    await ensureCollection(spec, existingNames);
  }

  console.log(`Waslah Directus bootstrap complete (${collections.length} collections)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
