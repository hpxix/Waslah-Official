import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { PassThrough } from "node:stream";
import { ResearchError, startResearch, observeResearch, publicResearch } from "./relevance.js";
import {
  createB2CPlan,
  selectB2CLeadPaths,
  buildPublicB2CExplanation,
  runB2CCampaign,
  serializeB2CLead,
  serializeCampaign,
  validateB2CPlan,
} from "./b2c.js";

const CUSTOMER_ROLE_ID = "8c62f1c4-258c-4d77-92f2-33f87db31765";
const WELCOME_CREDIT_HALALAS = 10000;
const WELCOME_INCLUDED_LEADS = 30;
const LEAD_REVEAL_PRICE_HALALAS = 100;
const CREDITS_PER_SAR = 10;
const MAX_LEADS_PER_REQUEST = 200;
const CHAT_RATE_LIMIT = 30;
const CHAT_RATE_WINDOW_MS = 60_000;
const chatRateWindows = new Map();
const DEFAULT_FEATURES = Object.freeze({
  ai_chat: { name: "Wasla AI chat", description: "Thoughtful business discovery and conversation memory.", enabled: true },
  lead_agent_b2b: { name: "B2B lead agent", description: "Company and decision-maker sourcing through managed providers.", enabled: true },
  lead_agent_b2c: { name: "B2C lead agent", description: "Consumer and individual-owner sourcing through Saudi marketplace signals.", enabled: true },
  lead_research_b2b: { name: "B2B deep research", description: "Saved account research and personalized pitch intelligence.", enabled: true },
});

const SOCIAL_AUTONOMY_LEVELS = new Set(["draft_only", "scheduled", "guarded"]);
const SOCIAL_APPROVAL_POLICIES = new Set(["always", "sensitive_only", "policy_based"]);
const SOCIAL_PROVIDERS = {
  postiz: {
    name: "Postiz publishing",
    description: "Connect your publishing workspace to schedule approved content.",
    credentialFields: [{ key: "api_key", label: "Your Postiz workspace API key", required: true, kind: "secret" }],
    capabilities: ["publishing", "media_upload"],
  },
  chatwoot: {
    name: "Chatwoot inbox",
    description: "Connect your customer inbox for conversations and AI reply drafts.",
    credentialFields: [
      { key: "account_id", label: "Your Chatwoot account ID", required: true, kind: "text" },
      { key: "access_token", label: "Your Chatwoot access token", required: true, kind: "secret" },
    ],
    capabilities: ["messages", "reply_drafts"],
  },
  instagram: {
    name: "Instagram",
    description: "Publish content, monitor engagement, and manage approved replies.",
    credentialFields: [
      { key: "account_id", label: "Instagram business account ID", required: true, kind: "text" },
      { key: "access_token", label: "Long-lived access token", required: true, kind: "secret" },
    ],
    capabilities: ["publishing", "comments", "direct_messages", "analytics"],
  },
  facebook: {
    name: "Facebook",
    description: "Connect a Page for publishing, comments, messages, and insights.",
    credentialFields: [
      { key: "page_id", label: "Facebook Page ID", required: true, kind: "text" },
      { key: "access_token", label: "Page access token", required: true, kind: "secret" },
    ],
    capabilities: ["publishing", "comments", "messages", "analytics"],
  },
  whatsapp: {
    name: "WhatsApp Business",
    description: "Reach opted-in leads through templates and a shared business inbox.",
    credentialFields: [
      { key: "phone_number_id", label: "Phone number ID", required: true, kind: "text" },
      { key: "business_account_id", label: "WhatsApp Business account ID", required: true, kind: "text" },
      { key: "access_token", label: "Permanent system-user token", required: true, kind: "secret" },
    ],
    capabilities: ["templates", "messages", "webhooks", "delivery_status"],
  },
  tiktok: {
    name: "TikTok",
    description: "Prepare and publish approved videos with account-level analytics.",
    credentialFields: [
      { key: "open_id", label: "TikTok Open ID", required: true, kind: "text" },
      { key: "access_token", label: "Access token", required: true, kind: "secret" },
    ],
    capabilities: ["video_publishing", "comments", "analytics"],
  },
  snapchat: {
    name: "Snapchat",
    description: "Connect a Public Profile for managed content and audience analytics.",
    credentialFields: [
      { key: "profile_id", label: "Public Profile ID", required: true, kind: "text" },
      { key: "access_token", label: "Access token", required: true, kind: "secret" },
    ],
    capabilities: ["publishing", "analytics"],
  },
  custom: {
    name: "Custom API",
    description: "Route approved Waslah activity to your own HTTPS endpoint.",
    credentialFields: [
      { key: "endpoint_url", label: "HTTPS endpoint URL", required: true, kind: "url" },
      { key: "api_key", label: "API key", required: true, kind: "secret" },
    ],
    capabilities: ["outbound_webhook"],
  },
};

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function route(handler, logger) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const status = error instanceof ApiError || error instanceof ResearchError ? error.status : 500;
      const code = error instanceof ApiError || error instanceof ResearchError ? error.code : "INTERNAL_ERROR";
      if (status >= 500) logger.error(error);
      res.status(status).json({ error: { code, message: status >= 500 ? "Something went wrong." : error.message } });
    }
  };
}

function requireUser(req) {
  const userId = req.accountability?.user;
  if (!userId) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
  return userId;
}

function requireWorkflowSecret(req, env) {
  const configured = env.N8N_WEBHOOK_SECRET;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const supplied = req.headers["x-waslah-workflow-secret"] || bearer;
  if (!configured || supplied !== configured) {
    throw new ApiError(401, "INVALID_WORKFLOW_SECRET", "Workflow authentication failed.");
  }
}

function requireVapiSecret(req, env) {
  const configured = env.VAPI_WEBHOOK_SECRET;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const supplied = req.headers["x-vapi-secret"] || bearer;
  if (!configured || supplied !== configured) {
    throw new ApiError(401, "INVALID_VAPI_SECRET", "Vapi webhook authentication failed.");
  }
}

function normalizePhone(input) {
  const compact = String(input || "").replace(/[^\d+]/g, "");
  let normalized = compact;
  if (normalized.startsWith("00966")) normalized = `+${normalized.slice(2)}`;
  else if (normalized.startsWith("966")) normalized = `+${normalized}`;
  else if (normalized.startsWith("05")) normalized = `+966${normalized.slice(1)}`;
  else if (normalized.startsWith("5") && normalized.length === 9) normalized = `+966${normalized}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new ApiError(400, "INVALID_PHONE", "Use a valid phone number including country code.");
  }
  return normalized;
}

function normalizeSaudiAccountPhone(input) {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(5);
  else if (digits.startsWith("966")) digits = digits.slice(3);
  if (!/^5\d{8}$/.test(digits)) {
    throw new ApiError(400, "INVALID_SAUDI_PHONE", "Enter a Saudi mobile number with exactly 9 digits, starting with 5, without the first 0.");
  }
  return `+966${digits}`;
}

function normalizeEmail(input) {
  const email = String(input || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "INVALID_EMAIL", "Enter a valid email address.");
  }
  return email;
}

function slugify(input) {
  const base = String(input || "workspace")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 45) || "workspace";
  return `${base}-${randomUUID().slice(0, 6)}`;
}

function otpHash(secret, verificationId, phone, code) {
  return createHmac("sha256", secret).update(`${verificationId}:${phone}:${code}`).digest("hex");
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function leadFingerprint(lead) {
  const source = [lead.website, lead.email, lead.phone, lead.company, lead.location]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
  return createHash("sha256").update(source).digest("hex");
}

function eventFingerprint(parts) {
  return createHash("sha256").update(parts.filter(Boolean).join(":"), "utf8").digest("hex");
}

function safeInteger(input, fallback, min, max) {
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function isoNow() {
  return new Date().toISOString();
}

function enabled(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function socialProviderReadiness(env, provider) {
  if (provider === "postiz" || provider === "chatwoot") {
    const key = `${provider.toUpperCase()}_BASE_URL`;
    return { oauth_ready: Boolean(env[key]), required_environment: [key], present_environment: env[key] ? [key] : [] };
  }
  if (provider === "instagram" || provider === "facebook" || provider === "whatsapp") {
    return {
      oauth_ready: Boolean(env.META_APP_ID && env.META_APP_SECRET),
      required_environment: ["META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"],
      present_environment: [
        env.META_APP_ID && "META_APP_ID",
        env.META_APP_SECRET && "META_APP_SECRET",
        env.META_WEBHOOK_VERIFY_TOKEN && "META_WEBHOOK_VERIFY_TOKEN",
      ].filter(Boolean),
    };
  }
  if (provider === "tiktok") {
    return {
      oauth_ready: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
      required_environment: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
      present_environment: [
        env.TIKTOK_CLIENT_KEY && "TIKTOK_CLIENT_KEY",
        env.TIKTOK_CLIENT_SECRET && "TIKTOK_CLIENT_SECRET",
      ].filter(Boolean),
    };
  }
  if (provider === "snapchat") {
    return {
      oauth_ready: Boolean(env.SNAPCHAT_CLIENT_ID && env.SNAPCHAT_CLIENT_SECRET),
      required_environment: ["SNAPCHAT_CLIENT_ID", "SNAPCHAT_CLIENT_SECRET"],
      present_environment: [
        env.SNAPCHAT_CLIENT_ID && "SNAPCHAT_CLIENT_ID",
        env.SNAPCHAT_CLIENT_SECRET && "SNAPCHAT_CLIENT_SECRET",
      ].filter(Boolean),
    };
  }
  return { oauth_ready: true, required_environment: [], present_environment: [] };
}

function publicSocialProviders(env) {
  return Object.entries(SOCIAL_PROVIDERS).map(([id, definition]) => ({
    id,
    name: definition.name,
    description: definition.description,
    credential_fields: definition.credentialFields,
    capabilities: definition.capabilities,
    ...socialProviderReadiness(env, id),
  }));
}

function socialEncryptionKey(env) {
  const secret = String(env.SOCIAL_TOKEN_ENCRYPTION_KEY || env.SECRET || "").trim();
  if (secret.length < 24) {
    throw new ApiError(503, "SOCIAL_ENCRYPTION_NOT_CONFIGURED", "Secure social credential storage is not configured.");
  }
  return createHash("sha256").update(secret).digest();
}

function encryptSocialCredentials(env, credentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", socialEncryptionKey(env), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSocialCredentials(env, encrypted) {
  const [version, iv, tag, ciphertext] = String(encrypted || "").split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new ApiError(409, "CONNECTION_RECONNECT_REQUIRED", "Reconnect this service to restore access.");
  const decipher = createDecipheriv("aes-256-gcm", socialEncryptionKey(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8"));
}

async function growthServiceEnv(database, env, organizationId, provider) {
  const prefix = provider.toUpperCase();
  const base = env[`${prefix}_BASE_URL`];
  if (!base) return null;
  const connection = await database("social_connections")
    .where({ organization_id: organizationId, provider })
    .orderBy("updated_at", "desc").first();
  if (connection) {
    const credentials = decryptSocialCredentials(env, connection.credentials_encrypted);
    return provider === "postiz"
      ? { POSTIZ_BASE_URL: base, POSTIZ_API_KEY: credentials.api_key }
      : { CHATWOOT_BASE_URL: base, CHATWOOT_API_ACCESS_TOKEN: credentials.access_token, CHATWOOT_ACCOUNT_ID: credentials.account_id };
  }
  // A server-owned service account is never shared implicitly between tenants.
  if (env[`${prefix}_ORGANIZATION_ID`] !== organizationId) return null;
  if (provider === "postiz" && env.POSTIZ_API_KEY) return { POSTIZ_BASE_URL: base, POSTIZ_API_KEY: env.POSTIZ_API_KEY };
  if (provider === "chatwoot" && env.CHATWOOT_API_ACCESS_TOKEN && env.CHATWOOT_ACCOUNT_ID) {
    return { CHATWOOT_BASE_URL: base, CHATWOOT_API_ACCESS_TOKEN: env.CHATWOOT_API_ACCESS_TOKEN, CHATWOOT_ACCOUNT_ID: env.CHATWOOT_ACCOUNT_ID };
  }
  return null;
}

async function requireGrowthService(database, env, organizationId, provider) {
  const scoped = await growthServiceEnv(database, env, organizationId, provider);
  if (!scoped) throw new ApiError(409, "SERVICE_CONNECTION_REQUIRED", `Connect your ${provider} workspace in Socials before continuing.`);
  return scoped;
}

function contentEditUpdates(existing, body = {}) {
  if (!["draft", "failed"].includes(existing.status)) {
    throw new ApiError(409, "CONTENT_LOCKED", "This content has already been submitted. Manage its schedule in Postiz before creating a new version.");
  }
  const updates = { updated_at: isoNow() };
  const owns = (key) => Object.prototype.hasOwnProperty.call(body, key);
  for (const [key, limit] of [["title", 220], ["copy", 20_000], ["format", 40], ["connection_id", 80]]) {
    if (owns(key)) updates[key] = cleanText(body[key], limit) || null;
  }
  if ((owns("title") && !updates.title) || (owns("copy") && !updates.copy)) throw new ApiError(400, "CONTENT_REQUIRED", "Add a title and post copy.");
  if (owns("scheduled_for")) {
    const date = body.scheduled_for ? new Date(body.scheduled_for) : null;
    if (date && !Number.isFinite(date.getTime())) throw new ApiError(400, "INVALID_SCHEDULE_DATE", "Choose a valid publishing date.");
    updates.scheduled_for = date?.toISOString() || null;
  }
  if (owns("media")) updates.media = JSON.stringify(cleanContentMedia(body.media));
  const edited = ["title", "copy", "format", "connection_id", "scheduled_for", "media"].some(owns);
  // Approval applies to an exact version, never to a simultaneously edited draft.
  if (edited) Object.assign(updates, { approval_status: "pending", status: "draft", error_message: null });
  else if (owns("approval_status")) updates.approval_status = body.approval_status === "approved" ? "approved" : "pending";
  return updates;
}

async function claimContentPublishing(database, item, organizationId) {
  const claimed = await database("content_items")
    .where({ id: item.id, organization_id: organizationId, approval_status: "approved", updated_at: item.updated_at })
    .whereIn("status", ["draft", "failed"])
    .update({ status: "publishing", error_message: null, updated_at: isoNow() });
  if (!claimed) throw new ApiError(409, "CONTENT_CHANGED", "This draft changed or is already being scheduled. Refresh before continuing.");
}

function publishingFailureState(submitting, error) {
  // A timeout or server error after submission may already have scheduled a post.
  const rejected = error?.code === "POSTIZ_REQUEST_FAILED" && error.providerStatus >= 400 && error.providerStatus < 500;
  return submitting && !rejected ? "unknown" : "failed";
}

async function assertGrowthConnection(database, organizationId, connectionId, channel) {
  if (!connectionId) return;
  const connection = await database("social_connections").where({ id: connectionId, organization_id: organizationId, provider: channel }).first();
  if (!connection) throw new ApiError(400, "PUBLISHING_CONNECTION_INVALID", "Choose a matching channel connection from your workspace.");
}

export { encryptSocialCredentials, decryptSocialCredentials, growthServiceEnv, contentEditUpdates, claimContentPublishing, publishingFailureState, normalizeSocialCredentials };

function safeJsonObject(value, label, maxLength = 12_000) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_SOCIAL_CONFIGURATION", `${label} must be an object.`);
  }
  if (JSON.stringify(value).length > maxLength) {
    throw new ApiError(400, "SOCIAL_CONFIGURATION_TOO_LARGE", `${label} is too large.`);
  }
  return value;
}

function normalizeSocialCredentials(provider, input) {
  const definition = SOCIAL_PROVIDERS[provider];
  if (!definition) throw new ApiError(400, "INVALID_SOCIAL_PROVIDER", "Choose a supported social channel.");
  const source = safeJsonObject(input, "Credentials", 40_000);
  const allowed = new Set(definition.credentialFields.map((field) => field.key));
  const credentials = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key)) continue;
    const normalized = String(value || "").trim();
    if (normalized.length > 8_192) throw new ApiError(400, "SOCIAL_CREDENTIAL_TOO_LONG", `${key} is too long.`);
    if (normalized) credentials[key] = normalized;
  }
  const missing = definition.credentialFields
    .filter((field) => field.required && !credentials[field.key])
    .map((field) => field.label);
  if (missing.length) {
    throw new ApiError(400, "SOCIAL_CREDENTIALS_INCOMPLETE", `Add ${missing.join(", ")} to continue.`);
  }
  if (provider === "chatwoot" && !/^[1-9]\d*$/.test(credentials.account_id)) {
    throw new ApiError(400, "INVALID_CHATWOOT_ACCOUNT", "Enter the numeric account ID from your Chatwoot workspace.");
  }
  if (credentials.endpoint_url) {
    let endpoint;
    try { endpoint = new URL(credentials.endpoint_url); } catch {
      throw new ApiError(400, "INVALID_SOCIAL_ENDPOINT", "Enter a valid HTTPS endpoint URL.");
    }
    if (endpoint.protocol !== "https:") throw new ApiError(400, "INVALID_SOCIAL_ENDPOINT", "Custom endpoints must use HTTPS.");
  }
  return credentials;
}

function credentialHints(provider, credentials) {
  const definition = SOCIAL_PROVIDERS[provider];
  return {
    fields_present: definition.credentialFields.filter((field) => credentials[field.key]).map((field) => field.key),
    masked: Object.fromEntries(definition.credentialFields
      .filter((field) => credentials[field.key])
      .map((field) => {
        const value = String(credentials[field.key]);
        const suffix = value.slice(-4);
        return [field.key, `${"•".repeat(Math.max(4, Math.min(8, value.length - suffix.length)))}${suffix}`];
      })),
  };
}

function parseStoredJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function publicSocialConnection(row) {
  return {
    id: row.id,
    provider: row.provider,
    display_name: row.display_name,
    external_account_id: row.external_account_id,
    status: row.status,
    is_preferred: Boolean(row.is_preferred),
    auth_mode: row.auth_mode,
    credential_hints: parseStoredJson(row.credential_hints, { fields_present: [], masked: {} }),
    configuration: parseStoredJson(row.configuration, {}),
    capabilities: parseStoredJson(row.capabilities, []),
    autonomy_level: row.autonomy_level,
    approval_policy: row.approval_policy,
    webhook_status: row.webhook_status,
    last_verified_at: row.last_verified_at,
    last_connected_at: row.last_connected_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function recordSocialEvent(database, values) {
  await database("social_events").insert({
    id: randomUUID(),
    organization_id: values.organizationId,
    connection_id: values.connectionId || null,
    actor_user_id: values.userId,
    provider: values.provider,
    event_type: values.eventType,
    status: values.status || "completed",
    summary: String(values.summary).slice(0, 2_000),
    metadata: JSON.stringify(values.metadata || {}),
    created_at: isoNow(),
  });
}

function socialPolicy(input, fallback = {}) {
  const autonomyLevel = input?.autonomy_level || fallback.autonomy_level || "draft_only";
  const approvalPolicy = input?.approval_policy || fallback.approval_policy || "always";
  if (!SOCIAL_AUTONOMY_LEVELS.has(autonomyLevel)) throw new ApiError(400, "INVALID_AUTONOMY_LEVEL", "Choose a supported automation level.");
  if (!SOCIAL_APPROVAL_POLICIES.has(approvalPolicy)) throw new ApiError(400, "INVALID_APPROVAL_POLICY", "Choose a supported approval policy.");
  return { autonomyLevel, approvalPolicy };
}

const GROWTH_CHANNELS = new Set(["instagram", "facebook", "tiktok", "snapchat", "whatsapp"]);
const GROWTH_CONTENT_CHANNELS = new Set(["instagram", "facebook", "tiktok"]);
const GROWTH_STAGES = ["engaged", "matched", "offered", "won"];

function cleanText(value, maxLength = 4_000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanStringList(value, maxItems = 20, maxLength = 240) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  return [...new Set(source.map((item) => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function cleanContentMedia(value) {
  const entries = Array.isArray(value) ? value : [];
  return entries.slice(0, 12).flatMap((entry) => {
    const path = cleanText(typeof entry === "string" ? entry : entry?.path, 2_000);
    if (!path) return [];
    try {
      const url = new URL(path);
      if (url.protocol !== "https:") return [];
      const id = cleanText(typeof entry === "object" ? entry?.id : "", 255) || undefined;
      return [{ id, path: url.toString() }];
    } catch {
      return [];
    }
  });
}

function storedList(value) {
  const parsed = parseStoredJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function businessProfileScore(profile) {
  const checks = [
    profile.company_name,
    profile.website,
    profile.industry,
    profile.description,
    profile.value_proposition,
    cleanStringList(profile.products_services).length,
    profile.brand_voice,
    cleanStringList(profile.brand_values).length,
    cleanStringList(profile.target_markets).length,
    cleanStringList(profile.goals).length,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function serializeBusinessProfile(row, fallbackName = "") {
  if (!row) {
    return {
      id: null,
      company_name: fallbackName,
      website: "",
      industry: "",
      description: "",
      value_proposition: "",
      products_services: [],
      brand_voice: "",
      brand_values: [],
      target_markets: ["Saudi Arabia"],
      goals: [],
      tone_rules: [],
      colors: ["#0b0d0e", "#f4f5f2", "#a4ffcf"],
      logo_url: "",
      completion_score: 10,
      created_at: null,
      updated_at: null,
    };
  }
  return {
    ...row,
    products_services: storedList(row.products_services),
    brand_values: storedList(row.brand_values),
    target_markets: storedList(row.target_markets),
    goals: storedList(row.goals),
    tone_rules: storedList(row.tone_rules),
    colors: storedList(row.colors),
  };
}

function serializeBusinessDocument(row) {
  return {
    id: row.id,
    file_id: row.file_id,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes || 0),
    status: row.status,
    summary: row.summary || "",
    extracted_data: parseStoredJson(row.extracted_data, {}),
    readable_sections: storedList(row.readable_sections),
    unreadable_sections: storedList(row.unreadable_sections),
    error_message: row.error_message || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function leadRunTitle(row, campaign) {
  const criteria = parseStoredJson(row.criteria, {});
  const intent = String(criteria.deal_intent || parseStoredJson(campaign?.intent, {}).dealIntent || "sell").toLowerCase();
  const name = cleanText(campaign?.name || row.query, 160).replace(/\s+(buyers?|sellers?)$/i, "");
  if (!name) return intent === "buy" ? "Potential sellers" : "Potential customers";
  return intent === "buy" ? `People selling ${name}` : `People likely to buy ${name}`;
}

function publicLeadRun(row, campaign) {
  const isB2C = ["b2c", "haraj"].includes(String(row.provider || "").toLowerCase());
  const criteria = parseStoredJson(row.criteria, {});
  return {
    id: row.id,
    type: isB2C ? "b2c" : "b2b",
    title: isB2C ? leadRunTitle(row, campaign) : cleanText(row.query, 160) || "B2B lead search",
    query: row.query,
    deal_intent: String(criteria.deal_intent || "sell").toLowerCase() === "buy" ? "buy" : "sell",
    status: row.status,
    target_count: Number(row.target_count || 0),
    result_count: Number(row.result_count || 0),
    provider: isB2C ? "b2c" : "b2b",
    explanation: campaign ? buildPublicB2CExplanation(campaign) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeAudience(row) {
  return {
    ...row,
    pains: storedList(row.pains),
    triggers: storedList(row.triggers),
    jobs_to_be_done: storedList(row.jobs_to_be_done),
    channels: storedList(row.channels),
    geography: storedList(row.geography),
  };
}

function serializeGrowthCampaign(row) {
  return {
    ...row,
    channels: storedList(row.channels),
    strategy: parseStoredJson(row.strategy, {}),
    metrics: parseStoredJson(row.metrics, {}),
  };
}

function serializeContentItem(row) {
  return { ...row, media: storedList(row.media) };
}

function growthBrandValues(input, organizationName) {
  const values = {
    company_name: cleanText(input?.company_name || organizationName, 160),
    website: cleanText(input?.website, 500),
    industry: cleanText(input?.industry, 160),
    description: cleanText(input?.description, 8_000),
    value_proposition: cleanText(input?.value_proposition, 8_000),
    products_services: cleanStringList(input?.products_services),
    brand_voice: cleanText(input?.brand_voice, 2_000),
    brand_values: cleanStringList(input?.brand_values),
    target_markets: cleanStringList(input?.target_markets),
    goals: cleanStringList(input?.goals),
    tone_rules: cleanStringList(input?.tone_rules),
    colors: cleanStringList(input?.colors, 8, 20).filter((color) => /^#[0-9a-f]{3,8}$/i.test(color)),
    logo_url: cleanText(input?.logo_url, 500),
  };
  if (!values.company_name) throw new ApiError(400, "BUSINESS_NAME_REQUIRED", "Add your company name.");
  return { ...values, completion_score: businessProfileScore(values) };
}

async function callPostiz(env, path, options = {}) {
  if (!env.POSTIZ_BASE_URL || !env.POSTIZ_API_KEY) {
    throw new ApiError(503, "POSTIZ_NOT_CONFIGURED", "Connect the self-hosted Postiz service before publishing.");
  }
  const base = String(env.POSTIZ_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: env.POSTIZ_API_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new ApiError(502, "POSTIZ_REQUEST_FAILED", `Postiz rejected the request (HTTP ${response.status}). Check the connection and post settings.`);
    error.providerStatus = response.status;
    throw error;
  }
  return payload;
}

async function callChatwoot(env, path, options = {}) {
  if (!env.CHATWOOT_BASE_URL || !env.CHATWOOT_API_ACCESS_TOKEN || !env.CHATWOOT_ACCOUNT_ID) {
    throw new ApiError(503, "CHATWOOT_NOT_CONFIGURED", "Connect the self-hosted Chatwoot service before opening the unified inbox.");
  }
  const base = String(env.CHATWOOT_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      api_access_token: env.CHATWOOT_API_ACCESS_TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(502, "CHATWOOT_REQUEST_FAILED", payload?.message || payload?.error || `Chatwoot returned ${response.status}.`);
  }
  return payload;
}

function enforceChatRateLimit(userId) {
  const now = Date.now();
  const recent = (chatRateWindows.get(userId) || []).filter((timestamp) => now - timestamp < CHAT_RATE_WINDOW_MS);
  if (recent.length >= CHAT_RATE_LIMIT) {
    throw new ApiError(429, "CHAT_RATE_LIMIT", "Too many messages. Wait a moment and try again.");
  }
  recent.push(now);
  chatRateWindows.set(userId, recent);
}

function responseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return "";
}

async function waslaBusinessContext(database, organization) {
  if (!organization?.id) return "No saved Business DNA is available yet.";
  try {
    const [profile, audiences] = await Promise.all([
      database("business_profiles").where({ organization_id: organization.id }).first(),
      database("audience_segments").where({ organization_id: organization.id, status: "active" }).orderBy("updated_at", "desc").limit(5),
    ]);
    if (!profile && !audiences.length) return "Company: " + organization.name + ". Business DNA and audience segments have not been completed yet.";
    const brand = serializeBusinessProfile(profile, organization.name);
    return JSON.stringify({
      company: brand.company_name,
      industry: brand.industry,
      description: brand.description,
      value_proposition: brand.value_proposition,
      products_services: brand.products_services,
      brand_voice: brand.brand_voice,
      target_markets: brand.target_markets,
      goals: brand.goals,
      audiences: audiences.map((row) => {
        const audience = serializeAudience(row);
        return { name: audience.name, type: audience.type, description: audience.description, pains: audience.pains, triggers: audience.triggers, geography: audience.geography };
      }),
    }).slice(0, 12_000);
  } catch {
    return "Company: " + organization.name + ". Saved growth intelligence is temporarily unavailable.";
  }
}

async function createWaslaChatResponse(env, message, transcript, language, leadType = null, dealIntent = null, businessContext = "") {
  if (!env.OPENAI_API_KEY) throw new ApiError(503, "CHAT_NOT_CONFIGURED", "AI chat is not configured yet.");
  const ar = language === "ar";
  const history = transcript.slice(-16).map((entry) => {
    const value = String(entry || "").slice(0, 4000);
    const assistant = value.startsWith("assistant:");
    return {
      role: assistant ? "assistant" : "user",
      content: value.replace(/^(assistant|user):\s*/i, ""),
    };
  });
  const last = history.at(-1);
  if (!last || last.role !== "user" || last.content.trim() !== message.trim()) {
    history.push({ role: "user", content: message });
  }

  const missionMode = `${leadType || "not decided"}/${dealIntent || "not decided"}`;
  const missionMeaning = leadType === "b2c" && dealIntent === "buy"
    ? "The user wants to buy something from individual owners or sellers. Qualify the item/service, specifications, condition, budget, quantity, geography, urgency, and what would identify a legitimate seller."
    : leadType === "b2c" && dealIntent === "sell"
      ? "The user wants to sell an offer to individual consumers. Qualify the offer, ideal consumer, geography, observable intent/ownership signals, relevant categories or keywords, and exclusions."
      : leadType === "b2b" && dealIntent === "buy"
        ? "The user is procuring from companies or suppliers. Qualify what they need, use case, specifications, volume, budget range when relevant, geography, supplier capabilities, certifications, delivery timing, and decision criteria."
        : leadType === "b2b" && dealIntent === "sell"
          ? "The user wants to sell to companies and decision-makers. Qualify their offer and differentiation, target industry, included/excluded geography, company size, revenue/funding when relevant, job titles, buying signals, pains, and exclusions."
          : "The lead route is not decided. Understand the commercial goal naturally, then infer the best lead type without forcing terminology on the user.";

  const instructions = `You are Wasla's in-product commercial intelligence AI for authenticated business users. The quality of this conversation is the core of an expensive, high-touch service.
Reply in ${ar ? "Arabic" : "English"} unless the user explicitly asks for another language. Sound like a thoughtful senior sales strategist and procurement adviser: warm, perceptive, specific, commercially aware, and genuinely conversational. Never sound like a form, decision tree, support bot, or canned script.

Current mission mode: ${missionMode}. ${missionMeaning}

Workspace Business DNA:
${businessContext || "No saved Business DNA is available yet."}
Use these saved facts naturally and do not ask the user to repeat them. If the current request conflicts with saved context, clarify whether this is a deliberate exception.

Wasla is an AI-assisted growth and commercial intelligence workspace. Every new chat starts by choosing B2C, B2B, or Not sure, then whether the user wants to sell to or buy from those leads. Wasla clarifies the real commercial brief, sources and enriches matching records, ranks fit, supports cited deep B2B account research with a personalized pitch strategy, and moves verified results into the client's Leads inventory. The Growth Engine stores Business DNA, builds motivation-based audience segments, drafts on-brand social content, sends approved posts to connected publishing channels, unifies customer conversations, and visualizes the customer revenue journey. The workspace also includes insights, proposals, chat history, credit controls, and an Autopilot offering for qualification calls and meeting booking. Payments are marked coming soon and card data is not currently stored.

Product facts:
- Launch costs 2,999 SAR: 3,000 enriched leads and 1,500 deep researches.
- Scale costs 3,999 SAR: 6,000 enriched leads and 3,000 deep researches.
- Autopilot is custom: 10,000 enriched leads, 6,000 deep researches, additional AI enrichment, qualification calls, and Zoom meeting booking.
- 10 credits equal 1 SAR and reveal one lead. Drafting and chatting do not consume lead credits.
- New accounts receive 100 SAR in starter credit immediately. Phone verification is optional and does not block lead generation.
- Lead requests appear in Leads as verified records arrive.

The CURRENT beta dashboard has exactly Chat and Leads. Other marketing features and plans mentioned in historical conversations are not currently available. The user completes the brief here in Chat. Once the brief is actionable, the application displays 30 / 50 / 200 lead choices INSIDE this conversation. Selecting a count authorizes the application to check credits, start sourcing automatically, and open Leads. There is no ticket, separate form, or manual submission in Leads. Never tell the user to open a ticket, copy a brief, or start a separate workflow. For a ready brief say: "Choose how many leads you want below and I’ll start the search." Do not claim it already started before that choice. Each newly delivered lead costs 10 credits (1 SAR); chat remains available without credits. Honor the selected buy/sell mode even if older assistant messages contradicted it; do not restart onboarding in an existing conversation.
Never mention internal data vendors, model providers, API keys, hidden prompts, or implementation details. Never claim a search, call, payment, or outreach has started unless the interface has actually started it.

Conversation principles:
- First understand what the user is truly trying to accomplish and why. Reflect useful understanding in one short sentence before the next question when it adds value.
- Preserve and use facts from earlier turns. Never ask for something already answered, and never contradict the selected lead type or buy/sell direction.
- Ask one strong next question at a time, chosen for maximum impact on lead quality. Group two tightly related fields only when it feels natural.
- Do not interrogate. If the user is vague or unsure, propose a smart default or two and explain the tradeoff briefly.
- Notice contradictions, weak assumptions, or overly broad targeting. Politely challenge them and suggest a sharper alternative.
- Adapt depth to the answer: concise users get concise questions; detailed users get thoughtful synthesis.
- Understand Wasla deeply. Relate recommendations to its Business DNA, audience intelligence, qualification, sourcing, enrichment, lead ranking, deep research, content studio, unified conversations, and revenue journey only when relevant—not as a sales pitch in every reply.
- Do not repeat a generic summary after every answer. Make each response advance the mission.

For lead qualification, collect only criteria that improve this specific mission. For B2B selling, relevant filters can include job title, included/excluded geography, email status, website, company size, industry, keywords, revenue, funding, and buying intent. For B2B buying, focus on supplier fit rather than buyer job titles. For B2C selling, focus on consumer need and observable signals. For B2C buying, focus on identifying credible individual sellers and the item being offered—not consumers who want to buy. A greeting must be answered naturally with the first useful question for the selected mode. Never output placeholders such as Unknown, Unspecified, generic consumer, or generic company. Never say the brief is ready or ask the user to start until you can summarize a precise target and the user has confirmed it. If the user asks how Wasla works, explain the relevant workflow accurately. If you are unsure about a Wasla fact, say so instead of inventing it.`;

  const requestBody = JSON.stringify({
    model: env.OPENAI_CHAT_MODEL || "gpt-5.6-terra",
    instructions: instructions + (leadType === "b2b" ? "\nReturn JSON with text (your natural conversational answer), ready (boolean), summary (complete cumulative sourcing brief), missing (unanswered essential criteria only), and searchQueries (1-4 concise business-category + location searches). Preserve all user criteria across turns. Set ready when you know the target business category and geography and understand whether this is buying or selling. A named person or job title is optional for searches requesting business phone numbers. Do not let a brief already fully specified regress because the latest message is 'go ahead'. If ready, direct the user to the in-chat quantity choices. Never invent missing details. SearchQueries describe the target businesses, not the product the user sells." : ""),
    ...(leadType === "b2b" ? { text: { format: { type: "json_schema", name: "lead_brief", strict: true, schema: {
      type: "object", additionalProperties: false, required: ["text", "ready", "summary", "missing", "searchQueries"],
      properties: { text: { type: "string" }, ready: { type: "boolean" }, summary: { type: "string" }, missing: { type: "array", items: { type: "string" } }, searchQueries: { type: "array", items: { type: "string" } } },
    } } } } : {}),
    input: history,
    max_output_tokens: leadType === "b2b" ? 1400 : 700,
    store: false,
  });
  let payload = {};
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(25_000),
      });
      lastStatus = response.status;
      payload = await response.json().catch(() => ({}));
      if (response.ok) break;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 2) {
        throw new ApiError(retryable ? 503 : 502, "CHAT_PROVIDER_ERROR", ar
          ? "وصلة مشغولة للحظة. أعد إرسال رسالتك بعد قليل."
          : "Wasla is briefly busy. Please send your message again in a moment.");
      }
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1000, 5_000)
        : 450 * (2 ** attempt) + Math.floor(Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (attempt === 2) {
        throw new ApiError(503, "CHAT_PROVIDER_ERROR", ar
          ? "وصلة مشغولة للحظة. أعد إرسال رسالتك بعد قليل."
          : "Wasla is briefly busy. Please send your message again in a moment.");
      }
      await new Promise((resolve) => setTimeout(resolve, 450 * (2 ** attempt) + Math.floor(Math.random() * 200)));
    }
  }
  if (!payload || (!responseText(payload) && lastStatus !== 200)) {
    throw new ApiError(503, "CHAT_PROVIDER_ERROR", ar
      ? "وصلة مشغولة للحظة. أعد إرسال رسالتك بعد قليل."
      : "Wasla is briefly busy. Please send your message again in a moment.");
  }
  const text = responseText(payload);
  if (!text) throw new ApiError(502, "CHAT_EMPTY_RESPONSE", "The assistant returned an empty response.");
  return text;
}

async function createWaslaContent(env, { brand, audience, channel, format, brief }) {
  if (!env.OPENAI_API_KEY) throw new ApiError(503, "CONTENT_AI_NOT_CONFIGURED", "Wasla AI is not configured for content generation yet.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_CONTENT_MODEL || env.OPENAI_CHAT_MODEL || "gpt-5.6-terra",
      text: { format: { type: "json_object" } },
      instructions: `You are Wasla's senior Saudi-market content strategist. Create platform-native commercial content that sounds unmistakably like the customer's brand, earns attention, and moves the selected audience toward a real conversation. Never invent claims, prices, customer proof, or regulatory facts. Avoid generic AI language, excessive emojis, and empty hype. Respect the cultural context of Saudi Arabia while following the requested brand voice. Return only valid JSON with this shape: {"title":"","format":"post","copy":"","hashtags":[],"rationale":"","visual_direction":""}.`,
      input: [{
        role: "user",
        content: `Channel: ${channel}\nRequested format: ${format}\nContent objective: ${brief}\nBrand profile: ${JSON.stringify({ company: brand.company_name, industry: brand.industry, description: brand.description, value_proposition: brand.value_proposition, products_services: brand.products_services, voice: brand.brand_voice, values: brand.brand_values, markets: brand.target_markets, goals: brand.goals, tone_rules: brand.tone_rules })}\nAudience: ${JSON.stringify(audience || { name: "Not selected; infer conservatively from the brand and brief." })}\nWrite one high-quality draft in the requested format. The copy can be Arabic or English according to the brief and brand. Include a specific call to action appropriate for the funnel stage. A video_script is a production brief, not a publishable caption.`,
      }],
      max_output_tokens: 1_200,
      store: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(502, "CONTENT_PROVIDER_ERROR", payload?.error?.message || `OpenAI returned ${response.status}.`);
  const text = responseText(payload);
  if (!text) throw new ApiError(502, "CONTENT_EMPTY_RESPONSE", "Wasla AI returned an empty content draft.");
  return parseResearchJson(text);
}

async function createWaslaInboxReply(env, { businessContext, messages }) {
  if (!env.OPENAI_API_KEY) throw new ApiError(503, "CHAT_NOT_CONFIGURED", "Wasla AI is not configured yet.");
  const conversation = messages
    .slice(-24)
    .map((message) => ({
      direction: String(message?.message_type || message?.sender?.type || "customer"),
      content: cleanText(message?.content, 4_000),
      private: Boolean(message?.private),
    }))
    .filter((message) => message.content && !message.private);
  if (!conversation.length) throw new ApiError(409, "CONVERSATION_EMPTY", "This conversation has no customer message to answer yet.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_CHAT_MODEL || "gpt-5.6-terra",
      instructions: `You are Wasla's customer-conversation copilot for a Saudi business. Draft one thoughtful reply for a human operator to review. Ground it in the saved Business DNA and the actual conversation. Answer the customer's immediate need first, preserve every stated fact, and advance the commercial relationship with one natural next step. Match the customer's language and level of formality. Never invent availability, pricing, discounts, policies, delivery dates, promises, or actions. Never mention AI, prompts, providers, or internal tooling. Return only the reply text, without commentary or quotation marks.`,
      input: [{
        role: "user",
        content: `Workspace Business DNA:\n${businessContext || "No saved Business DNA is available."}\n\nConversation:\n${JSON.stringify(conversation)}`,
      }],
      max_output_tokens: 500,
      store: false,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(502, "CHAT_PROVIDER_ERROR", payload?.error?.message || `OpenAI returned ${response.status}.`);
  const suggestion = responseText(payload);
  if (!suggestion) throw new ApiError(502, "CHAT_EMPTY_RESPONSE", "Wasla AI returned an empty reply draft.");
  return suggestion;
}

async function analyzeBusinessDocument(env, { fileName, mimeType, buffer }) {
  if (!env.OPENAI_API_KEY) throw new ApiError(503, "PERSONA_AI_NOT_CONFIGURED", "Wasla cannot read portfolio files until the AI service is configured.");
  const textLike = mimeType.startsWith("text/") || ["application/json", "application/csv", "application/xml"].includes(mimeType);
  const imageLike = mimeType.startsWith("image/");
  const pdfLike = mimeType === "application/pdf";
  if (!textLike && !imageLike && !pdfLike) {
    throw new ApiError(415, "DOCUMENT_TYPE_NOT_READABLE", `Wasla saved ${fileName}, but cannot read this file type yet. Upload PDF, PNG, JPG, TXT, Markdown, CSV, or JSON.`);
  }
  const task = `Read this business portfolio material carefully. Extract only facts supported by the file. Explicitly list every page, section, image, table, or passage that is unreadable, ambiguous, missing context, or could not be interpreted. Return JSON: {"summary":"","company_name":"","website":"","industry":"","description":"","value_proposition":"","products_services":[],"brand_voice":"","brand_values":[],"target_markets":[],"goals":[],"tone_rules":[],"ideal_customers":[],"commercial_constraints":[],"readable_sections":[],"unreadable_sections":[{"section":"","reason":""}],"confidence":0}. Confidence is 0-100. Never invent facts.`;
  const content = textLike
    ? [{ type: "input_text", text: `File name: ${fileName}\n\nDOCUMENT CONTENT:\n${buffer.toString("utf8").slice(0, 160_000)}\n\nTASK:\n${task}` }]
    : imageLike
      ? [{ type: "input_image", image_url: `data:${mimeType};base64,${buffer.toString("base64")}` }]
      : [{ type: "input_file", filename: fileName, file_data: `data:${mimeType};base64,${buffer.toString("base64")}` }];
  if (!textLike) content.push({ type: "input_text", text: task });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_CONTENT_MODEL || env.OPENAI_CHAT_MODEL || "gpt-5.6-terra",
      text: { format: { type: "json_object" } },
      instructions: "You are Wasla's business intelligence reader. Be conservative, evidence-grounded, and precise about anything you cannot read. Return only valid JSON.",
      input: [{ role: "user", content }],
      max_output_tokens: 2_500,
      store: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(502, "PERSONA_DOCUMENT_READ_FAILED", payload?.error?.message || `Wasla could not read ${fileName}.`);
  const parsed = parseResearchJson(responseText(payload));
  return {
    summary: cleanText(parsed.summary, 8_000),
    extractedData: {
      company_name: cleanText(parsed.company_name, 160), website: cleanText(parsed.website, 500), industry: cleanText(parsed.industry, 160),
      description: cleanText(parsed.description, 8_000), value_proposition: cleanText(parsed.value_proposition, 8_000),
      products_services: cleanStringList(parsed.products_services), brand_voice: cleanText(parsed.brand_voice, 2_000),
      brand_values: cleanStringList(parsed.brand_values), target_markets: cleanStringList(parsed.target_markets), goals: cleanStringList(parsed.goals),
      tone_rules: cleanStringList(parsed.tone_rules), ideal_customers: cleanStringList(parsed.ideal_customers),
      commercial_constraints: cleanStringList(parsed.commercial_constraints), confidence: safeInteger(parsed.confidence, 0, 0, 100),
    },
    readableSections: cleanStringList(parsed.readable_sections, 50, 500),
    unreadableSections: (Array.isArray(parsed.unreadable_sections) ? parsed.unreadable_sections : []).slice(0, 50).map((item) => ({ section: cleanText(item?.section, 500), reason: cleanText(item?.reason, 1_000) })).filter((item) => item.section || item.reason),
  };
}

function parseResearchJson(value) {
  const cleaned = String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new ApiError(502, "RESEARCH_INVALID_RESPONSE", "The research provider returned an invalid report.");
  }
}

async function createPerplexityResearch(env, lead, productSummary) {
  if (!env.PERPLEXITY_API_KEY) throw new ApiError(503, "RESEARCH_NOT_CONFIGURED", "Deep research is not configured yet.");
  const model = env.PERPLEXITY_MODEL || "sonar-pro";
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are Wasla's B2B account intelligence analyst. Research current public information, distinguish facts from inference, and return only valid JSON. Never fabricate URLs, people, metrics, funding, or news." },
        { role: "user", content: `Research this B2B lead and build a sales-ready intelligence report.\nLead: ${JSON.stringify({ name: lead.name, title: lead.title, company: lead.company, website: lead.website, linkedin: lead.linkedin_url, company_linkedin: lead.company_linkedin_url, location: lead.location, industry: lead.industry, company_size: lead.company_size, annual_revenue: lead.annual_revenue })}\nSeller product: ${productSummary || "Not provided; make pitch guidance discovery-led."}\nReturn this JSON shape: {"company_overview":"", "company_description":"", "website":"", "logo_url":"", "person_photo_url":"", "market_position":"", "performance_summary":"", "products_services":[], "size_and_locations":"", "leadership":[{"name":"","title":"","linkedin_url":""}], "recent_news":[{"title":"","summary":"","date":"","url":""}], "strengths":[], "risks":[], "technologies":[], "hiring_and_growth_signals":[], "funding_and_revenue":"", "competitors":[], "pitch_strategy":{"executive_summary":"","pain_points":[],"value_propositions":[],"opening_message":"","discovery_questions":[],"objections_and_responses":[{"objection":"","response":""}],"next_best_action":""}, "sources":[{"title":"","url":""}]}. Use empty strings/arrays when evidence is unavailable.` },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(502, "RESEARCH_PROVIDER_ERROR", payload?.error?.message || `Research provider returned ${response.status}`);
  const content = payload?.choices?.[0]?.message?.content;
  const report = parseResearchJson(content);
  const citationUrls = [...new Set([...(payload?.citations || []), ...(payload?.search_results || []).map((item) => item?.url)].filter(Boolean))];
  report.sources = Array.isArray(report.sources) ? report.sources : [];
  for (const url of citationUrls) if (!report.sources.some((source) => source?.url === url)) report.sources.push({ title: new URL(url).hostname.replace(/^www\./, ""), url });
  return { report, citations: citationUrls, model };
}

function b2cConversationMessages(prompt, transcript) {
  const messages = [...(Array.isArray(transcript) ? transcript : []), `user: ${prompt}`]
    .map((entry) => String(entry || "").trim())
    .filter((entry) => !/^assistant:\s*/i.test(entry))
    .map((entry) => entry.replace(/^user:\s*/i, "").trim())
    .filter((entry) => entry && !/^(?:user context:|سياق المستخدم:)/i.test(entry))
    .filter((entry) => !/^(?:hello|hi|hey|good (?:morning|evening)|مرحبا|هلا|السلام عليكم|ابدأ|ابدا|start)[.!?؟، ]*$/i.test(entry));
  return [...new Set(messages)];
}

function qualifyB2CConversation(prompt, transcript, language, dealIntent = "sell") {
  const messages = b2cConversationMessages(prompt, transcript);
  const brief = messages.join(". ").slice(0, 4000);
  // This is the preflight for a paid Haraj run. Never infer completeness from
  // message count: every item below becomes a concrete Haraj search input or
  // an exclusion, so each must be explicitly established with the user.
  const hasOffer = messages.some((entry) => entry.split(/\s+/).filter(Boolean).length >= 3);
  const hasAudience = dealIntent === "buy"
    ? /\b(?:owners?|sellers?|individuals?|people|private|used|new|condition|dealer)\b|مالك|ملاك|بائع|أفراد|افراد|مستعمل|جديد|حالة/i.test(brief)
    : /\b(?:owners?|consumers?|customers?|buyers?|parents?|students?|drivers?|gamers?|families|men|women|people|residents?|travelers?|renters?|homeowners?)\b|ملاك|مالكي|مستهلك|عملاء|مشتر|آباء|امهات|طلاب|سائق|عائلات|نساء|رجال|أفراد|افراد/i.test(brief);
  const hasLocation = /\b(?:saudi arabia|saudi|riyadh|jeddah|dammam|khobar|makkah|mecca|madinah|medina|tabuk|abha|gcc|gulf)\b|السعودية|السعوديه|الرياض|جدة|جده|الدمام|الخبر|مكة|مكه|المدينة|المدينه|تبوك|أبها|ابها|الخليج/i.test(brief);
  const hasSignal = dealIntent === "buy"
    ? /\b(?:budget|under\s+(?:sar|riyal)|maximum|max\.?|model year|mileage|kilomet(?:er|re)s?|trim|condition|automatic|manual|warranty|deadline|urgent)\b|ميزانية|ريال|حد أقصى|موديل|سنة الصنع|ممشى|كيلو|فئة|حالة|أوتوماتيك|عادي|ضمان|موعد|عاجل/i.test(brief)
    : /\b(?:owns?|interested|recently|category|keyword|pain point|trigger|behavior|behaviour|looking for|moving|renovating|engaged|newlywed)\b|يمتلك|مهتم|مؤخراً|تصنيف|فئة|كلمة|مشكلة|سلوك|إشارة|يبحث|ينتقل|انتقال|تشطيب|تجديد|زواج|عرس/i.test(brief);
  const hasExclusions = /\b(?:exclude|excluding|without|not\s+(?:sellers?|companies?|dealers?|resellers?))\b|استبعد|باستثناء|بدون|لا أريد|لا نريد|ليس/i.test(brief);
  const missing = [];
  if (!hasOffer) missing.push(language === "ar" ? "المنتج أو الخدمة والقيمة التي تقدمها" : "the product or service and its main value");
  if (hasOffer && !hasAudience) missing.push(language === "ar" ? "وصف العميل المثالي" : "the ideal customer profile");
  if (hasOffer && hasAudience && !hasLocation) missing.push(language === "ar" ? "المدينة أو المنطقة المستهدفة" : "the target city or region");
  if (hasOffer && hasAudience && hasLocation && !hasSignal) missing.push(language === "ar" ? "إشارة الشراء أو الفئة والكلمات المستهدفة" : "the buying signal, category, or target keywords");
  if (hasOffer && hasAudience && hasLocation && hasSignal && !hasExclusions) missing.push(language === "ar" ? "ما يجب استبعاده من نتائج حراج" : "what Haraj results to exclude");
  if (!missing.length) return { ready: true, missing, brief };
  const question = !hasOffer
    ? dealIntent === "buy"
      ? (language === "ar" ? "أهلاً! ما الذي تريد شراءه من الأفراد، وما أهم مواصفة أو شرط لا يمكن التنازل عنه؟" : "Hi! What do you want to buy from individuals, and what specification or condition is non-negotiable?")
      : (language === "ar" ? "أهلاً! ما المنتج أو الخدمة التي تبيعها، وما أهم فائدة يحصل عليها العميل؟" : "Hi! What product or service are you selling, and what is the main benefit the customer gets?")
    : !hasAudience
      ? dealIntent === "buy"
        ? (language === "ar" ? "ممن تفضّل الشراء: مالك فردي، بائع متخصص، أم كلاهما؟ وهل تقبل المستعمل؟" : "Who would you prefer to buy from: a private owner, a specialist seller, or either—and is used condition acceptable?")
        : (language === "ar" ? "من هو العميل المثالي لهذا العرض تحديداً؟ صفه من حيث الاهتمام أو الملكية أو المشكلة التي لديه." : "Who is the ideal customer for this offer? Describe the interest, ownership, or problem that makes them a strong buyer.")
      : !hasLocation
        ? (language === "ar" ? "ممتاز. ما المدينة أو المنطقة التي تريد استهدافها أولاً؟" : "Great. Which city or region should we target first?")
        : !hasSignal
          ? dealIntent === "buy"
            ? (language === "ar" ? "ما الميزانية والحالة أو الكلمات التي تدل على عرض مناسب؟" : "What budget, condition, or listing keywords signal a good offer?")
            : (language === "ar" ? "ما السلوك أو الفئة أو الكلمات التي تدل على أن الشخص مشترٍ قوي؟" : "What behavior, category, or keywords would signal a strong buyer?")
          : (language === "ar" ? "قبل أن أبني بحث حراج: ما الذي تريد استبعاده بوضوح—مثلاً التجار، الإعلانات القديمة، مدينة معيّنة، أو حالة غير مناسبة؟" : "Before I build the Haraj search: what should I explicitly exclude—for example dealers, old listings, a city, or an unsuitable condition?");
  return { ready: false, missing, brief, question };
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return null;
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;
  return `*** ${phone.slice(-4)}`;
}

function publicLead(row, revealed) {
  return {
    id: row.id,
    name: revealed ? row.name : row.name ? `${row.name.slice(0, 1)}***` : null,
    title: row.title,
    company: row.company,
    email: revealed ? row.email : maskEmail(row.email),
    phone: revealed ? row.phone : maskPhone(row.phone),
    person_image_url: row.person_image_url,
    company_image_url: row.company_image_url,
    website: row.website,
    linkedin_url: revealed ? row.linkedin_url : null,
    company_size: row.company_size,
    location: row.location,
    industry: row.industry,
    source: row.source,
    fit_score: row.fit_score,
    qualification_status: row.qualification_status,
    enrichment_status: row.enrichment_status,
    enrichment_score: row.enrichment_score,
    enrichment_summary: row.enrichment_summary,
    revealed,
  };
}

async function userIdentity(database, userId) {
  const user = await database("directus_users as user")
    .select("user.id", "user.email", "user.first_name", "user.last_name", "user.status", "user.role", "user.last_access")
    .where("user.id", userId)
    .first();
  if (!user) return null;
  const adminPolicy = await database("directus_access as access")
    .join("directus_policies as policy", "policy.id", "access.policy")
    .where("policy.admin_access", true)
    .andWhere((builder) => builder.where("access.user", userId).orWhere("access.role", user.role))
    .first();
  return { ...user, admin_access: Boolean(adminPolicy) };
}

async function adminContext(database, req) {
  const userId = requireUser(req);
  const user = await userIdentity(database, userId);
  if (!user || user.status !== "active" || !user.admin_access) {
    throw new ApiError(403, "ADMIN_REQUIRED", "A Wasla administrator account is required.");
  }
  return user;
}

function featureKey(input) {
  const key = String(input || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,79}$/.test(key)) throw new ApiError(400, "INVALID_FEATURE_KEY", "Use a lowercase feature key with letters, numbers, and underscores.");
  return key;
}

async function ensureDefaultFeatures(database) {
  const existing = await database("feature_flags").select("feature_key");
  const keys = new Set(existing.map((row) => row.feature_key));
  const now = isoNow();
  const missing = Object.entries(DEFAULT_FEATURES).filter(([key]) => !keys.has(key)).map(([key, definition]) => ({
    id: randomUUID(), feature_key: key, name: definition.name, description: definition.description,
    enabled_global: definition.enabled, configuration: JSON.stringify({}), created_at: now, updated_at: now,
  }));
  if (missing.length) await database("feature_flags").insert(missing).onConflict("feature_key").ignore();
}

async function effectiveFeatures(database, context) {
  await ensureDefaultFeatures(database);
  const globals = await database("feature_flags").select("feature_key", "name", "description", "enabled_global", "configuration", "updated_at");
  const overrides = context?.userId
    ? await database("account_feature_overrides").where({ user_id: context.userId }).select("feature_key", "enabled", "configuration", "updated_at")
    : [];
  const byKey = new Map(overrides.map((row) => [row.feature_key, row]));
  return globals.map((row) => {
    const override = byKey.get(row.feature_key);
    return {
      key: row.feature_key,
      name: row.name,
      description: row.description,
      enabled: override ? Boolean(override.enabled) : Boolean(row.enabled_global),
      enabled_global: Boolean(row.enabled_global),
      overridden: Boolean(override),
      configuration: parseStoredJson(override?.configuration ?? row.configuration, {}),
      updated_at: override?.updated_at || row.updated_at,
    };
  });
}

async function assertFeature(database, context, key) {
  const policy = (await effectiveFeatures(database, context)).find((feature) => feature.key === key);
  if (!policy?.enabled) throw new ApiError(403, "FEATURE_DISABLED", `${policy?.name || key} is not enabled for this account.`);
  return policy;
}

async function resolveAdminAccount(database, identifier) {
  const value = String(identifier || "").trim();
  if (!value) throw new ApiError(400, "ACCOUNT_IDENTIFIER_REQUIRED", "Enter an account email, username, phone number, or user ID.");
  const query = database("customer_profiles as profile")
    .join("directus_users as user", "user.id", "profile.user_id")
    .join("organizations as organization", "organization.id", "profile.organization_id")
    .select("user.id as user_id", "user.email", "user.first_name", "user.last_name", "profile.phone_e164", "organization.id as organization_id", "organization.name as organization_name");
  if (/^[0-9a-f-]{36}$/i.test(value)) query.where("user.id", value);
  else if (value.includes("@")) query.whereRaw("LOWER(??) = ?", ["user.email", value.toLowerCase()]);
  else if (/^[+\d\s()-]+$/.test(value)) query.whereRaw("REGEXP_REPLACE(profile.phone_e164, '[^0-9]', '', 'g') = ?", [value.replace(/\D/g, "").replace(/^0(?=5)/, "966")]);
  else query.whereRaw("LOWER(CONCAT_WS(' ', user.first_name, user.last_name)) = ?", [value.toLowerCase()]);
  const rows = await query.limit(2);
  if (!rows.length) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "No Wasla account matches that identifier.");
  if (rows.length > 1) throw new ApiError(409, "ACCOUNT_AMBIGUOUS", "More than one account matches that username. Use email, phone, or user ID.");
  return rows[0];
}

async function recordAdminAudit(database, admin, action, targetType, targetId, summary, metadata = {}) {
  await database("admin_audit_logs").insert({
    id: randomUUID(), admin_user_id: admin.id, action, target_type: targetType,
    target_id: targetId || null, summary, metadata: JSON.stringify(metadata), created_at: isoNow(),
  });
}

async function rememberConversation(database, context, values) {
  const key = `user:${context.userId}`;
  const existing = await database("ai_account_memory").where({ memory_key: key }).first();
  const previous = parseStoredJson(existing?.understood_data, { observations: [] });
  const observation = {
    at: isoNow(), conversation_id: values.conversationId || null, lead_type: values.leadType || null,
    deal_intent: values.dealIntent || null, request: String(values.message || "").slice(0, 2000),
    summary: String(values.summary || "").slice(0, 6000), missing: values.missing || [],
    search_queries: values.searchQueries || [], b2c_intent: values.b2cIntent || null,
    acquisition_plan: values.acquisitionPlan || null, outcome: values.outcome || "discovery",
  };
  const observations = [...(Array.isArray(previous.observations) ? previous.observations : []), observation].slice(-40);
  const understood = { ...previous, observations, latest: observation };
  const user = await database("directus_users").select("email").where({ id: context.userId }).first();
  const row = {
    organization_id: context.organization?.id || null, user_id: context.userId, user_email: user?.email || null,
    understood_data: JSON.stringify(understood), last_summary: observation.summary || observation.request,
    last_outcome: observation.outcome, last_conversation_id: observation.conversation_id,
    source_turn_count: Number(existing?.source_turn_count || 0) + 1,
    confidence: Math.min(100, Math.max(Number(existing?.confidence || 0), values.confidence || 25)), updated_at: isoNow(),
  };
  if (existing) await database("ai_account_memory").where({ id: existing.id }).update(row);
  else await database("ai_account_memory").insert({ id: randomUUID(), memory_key: key, ...row, created_at: isoNow() });
}

async function chatContext(database, req) {
  const userId = requireUser(req);
  const user = await userIdentity(database, userId);
  if (!user || user.status !== "active") throw new ApiError(403, "ACCOUNT_INACTIVE", "This account is not active.");
  const profile = await database("customer_profiles").where({ user_id: userId }).first();
  const organization = profile
    ? await database("organizations").where({ id: profile.organization_id, status: "active" }).first()
    : null;
  return { userId, user, profile: profile || null, organization: organization || null };
}

async function customerContext(database, req, { requireVerified = false } = {}) {
  const userId = requireUser(req);
  const profile = await database("customer_profiles").where({ user_id: userId }).first();
  if (!profile) {
    const admin = await userIdentity(database, userId);
    if (!admin?.admin_access) throw new ApiError(403, "PROFILE_REQUIRED", "This account has no Waslah customer profile.");
    const membership = await database("organization_members")
      .where({ user_id: userId, status: "active" })
      .orderBy("created_at", "asc")
      .first();
    if (!membership) throw new ApiError(403, "PROFILE_REQUIRED", "This administrator has no Waslah workspace.");
    const organization = await database("organizations").where({ id: membership.organization_id, status: "active" }).first();
    if (!organization) throw new ApiError(403, "WORKSPACE_INACTIVE", "This workspace is not active.");
    return { userId, profile: null, organization, admin };
  }
  if (requireVerified && !profile.phone_verified_at) {
    throw new ApiError(403, "PHONE_NOT_VERIFIED", "Verify your phone number to continue.");
  }
  const organization = await database("organizations").where({ id: profile.organization_id, status: "active" }).first();
  if (!organization) throw new ApiError(403, "WORKSPACE_INACTIVE", "This workspace is not active.");
  return { userId, profile, organization };
}

async function createChatLog(database, context, values) {
  let userEmail = null;
  try {
    const user = await database("directus_users").select("email").where({ id: context.userId }).first();
    userEmail = user?.email || null;
  } catch {
    // Chat must remain available if audit storage is temporarily unavailable.
  }
  await database("chat_logs").insert({
    id: randomUUID(),
    organization_id: context.organization?.id || null,
    user_id: context.userId,
    user_email: userEmail,
    conversation_id: String(values.conversationId || "").slice(0, 120) || null,
    lead_type: values.leadType || null,
    deal_intent: values.dealIntent || null,
    understood_data: values.understoodData ? JSON.stringify(values.understoodData) : null,
    outcome: values.outcome ? String(values.outcome).slice(0, 4000) : null,
    mode: values.mode,
    language: values.language,
    message: String(values.message).slice(0, 4000),
    response: values.response ? String(values.response).slice(0, 12000) : null,
    transcript: JSON.stringify(Array.isArray(values.transcript) ? values.transcript.slice(-30) : []),
    status: values.status,
    error_message: values.error ? String(values.error).slice(0, 2000) : null,
    created_at: isoNow(),
  });
}

async function sendTwilioVerification(env, phone) {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) {
    throw new ApiError(503, "SMS_NOT_CONFIGURED", "Twilio Verify credentials are incomplete.");
  }

  const body = new URLSearchParams({ To: phone, Channel: "sms" });
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(502, "SMS_PROVIDER_ERROR", payload.message || "Could not send the verification code.");
  return payload.sid;
}

async function checkTwilioVerification(env, phone, code) {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;
  const body = new URLSearchParams({ To: phone, Code: code });
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload.status === "approved";
}

async function dispatchToN8n(database, env, requestRow, logger) {
  if (!env.N8N_LEAD_AGENT_WEBHOOK_URL || !env.N8N_WEBHOOK_SECRET) return false;
  try {
    const response = await fetch(env.N8N_LEAD_AGENT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.N8N_WEBHOOK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "lead.request.created",
        request: requestRow,
        callback_url: `${String(env.PUBLIC_URL || "").replace(/\/$/, "")}/lead-agent/integrations/leads`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`n8n returned ${response.status}`);
    await database("integration_events")
      .where({ idempotency_key: `lead.request.created:${requestRow.id}` })
      .update({ status: "delivered", attempts: 1, processed_at: isoNow(), updated_at: isoNow() });
    return true;
  } catch (error) {
    logger.warn(`Lead request ${requestRow.id} remains queued: ${error.message}`);
    await database("integration_events")
      .where({ idempotency_key: `lead.request.created:${requestRow.id}` })
      .update({ status: "retry", attempts: 1, last_error: String(error.message).slice(0, 2000), updated_at: isoNow() });
    return false;
  }
}

function safeApifyPhone(value) {
  if (!value) return null;
  try {
    return normalizePhone(value);
  } catch {
    return null;
  }
}

function normalizeApifyLead(item, index) {
  const email = item.email || item.personal_email || item.emails?.[0] || null;
  const phone = safeApifyPhone(item.mobile_number || item.company_phone || item.phone || item.phoneUnformatted);
  const company = item.company_name || item.title || item.name || "Unknown company";
  const website = item.company_website || item.website || null;
  const fields = [item.full_name, item.job_title, email, phone, website, item.linkedin, item.address].filter(Boolean).length;
  return {
    name: item.full_name || [item.first_name, item.last_name].filter(Boolean).join(" ") || null,
    title: item.job_title || item.position || item.headline || null,
    company,
    email,
    phone,
    company_image_url: item.company_logo || item.logoUrl || item.imageUrl || item.imageUrls?.[0] || null,
    person_image_url: item.photo_url || item.profile_image_url || null,
    website,
    linkedin_url: item.linkedin || null,
    company_linkedin_url: item.company_linkedin || null,
    location: item.address || [item.city, item.state, item.country].filter(Boolean).join(", ") || item.company_full_address || null,
    industry: item.industry || item.categoryName || item.category || null,
    seniority: item.seniority_level || item.functional_level || null,
    company_size: item.company_size || null,
    annual_revenue: item.company_annual_revenue_clean || item.company_annual_revenue || null,
    review_score: item.totalScore || null,
    review_count: item.reviewsCount || null,
    source: "verified_business_records",
    source_reference: item.linkedin || item.url || item.placeId || item.company_domain || `record-${index + 1}`,
    fit_score: Math.min(98, 68 + fields * 4),
    qualification_status: "new",
    enrichment_status: fields >= 5 ? "enriched" : "partial",
    enrichment_score: Math.min(100, 45 + fields * 8),
    enrichment_summary: [item.headline, item.company_description].filter(Boolean).join(" — ").slice(0, 1000) || null,
    enrichment_signals: [item.seniority_level, item.company_technologies && "technology profile", email && "validated email", phone && "phone available"].filter(Boolean),
  };
}

async function activeApifyProvider(database, env, requestRow) {
  const criteria = parseStoredJson(requestRow.criteria, {});
  let query = database("sourcing_providers").where({ provider_type: "apify", channel: "b2b", enabled: true });
  const requested = String(criteria.provider_key || "").trim();
  if (requested) query = query.andWhere("provider_key", requested);
  const row = await query.orderBy("priority", "asc").orderBy("created_at", "asc").first();
  if (row) {
    const secret = decryptSocialCredentials(env, row.token_encrypted);
    return { key: row.provider_key, actorId: row.actor_id, token: secret.token, configuration: parseStoredJson(row.configuration, {}) };
  }
  if (!env.APIFY_TOKEN) throw new Error("No active Apify sourcing provider is configured.");
  return { key: "environment-default", actorId: criteria.apify_actor || env.APIFY_ACTOR_ID || "compass/crawler-google-places", token: env.APIFY_TOKEN, configuration: {} };
}

async function runApifyRequest(database, env, requestRow, logger) {
  const provider = await activeApifyProvider(database, env, requestRow);
  const actorId = provider.actorId;
  const actorReference = String(actorId).replace("/", "~");
  const criteria = parseStoredJson(requestRow.criteria, {});
  const input = { ...provider.configuration, ...(criteria.apify_input || criteria || {}) };
  const runResponse = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actorReference)}/runs?token=${encodeURIComponent(provider.token)}&waitForFinish=60`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(70_000),
  });
  const runPayload = await runResponse.json().catch(() => ({}));
  if (!runResponse.ok || !runPayload?.data?.id) throw new Error(runPayload?.error?.message || `Sourcing service returned ${runResponse.status}`);
  let run = runPayload.data;
  await database("lead_requests").where({ id: requestRow.id }).update({ status: "sourcing", provider_job_id: run.id, updated_at: isoNow() });

  for (let attempt = 0; !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status) && attempt < 45; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const poll = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${encodeURIComponent(provider.token)}`, { signal: AbortSignal.timeout(10_000) });
    const pollPayload = await poll.json().catch(() => ({}));
    if (poll.ok && pollPayload?.data) run = pollPayload.data;
  }
  if (run.status !== "SUCCEEDED" || !run.defaultDatasetId) throw new Error(`Sourcing run ended with ${run.status || "unknown status"}`);

  const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${encodeURIComponent(provider.token)}&clean=true&limit=${requestRow.target_count}`, { signal: AbortSignal.timeout(20_000) });
  const items = await itemsResponse.json().catch(() => []);
  if (!itemsResponse.ok || !Array.isArray(items) || !items.length) throw new Error("Sourcing completed without usable records.");
  const providerError = items.find((item) => item?.error)?.error;
  if (providerError) throw new Error(providerError);
  const leads = items.filter((item) => item && (item.company_name || item.title || item.name)).slice(0, requestRow.target_count).map(normalizeApifyLead);
  if (!leads.length) throw new Error("Sourcing completed without valid lead records.");
  const callback = await fetch(`http://127.0.0.1:${env.PORT || 8055}/lead-agent/integrations/leads`, {
    method: "POST",
    headers: {
      "x-waslah-workflow-secret": env.N8N_WEBHOOK_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ request_id: requestRow.id, provider_job_id: run.id, leads }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!callback.ok) throw new Error(`Lead ingestion returned ${callback.status}`);
  logger.info(`Lead request ${requestRow.id} received ${leads.length} verified records.`);
}

function dispatchToApify(database, env, requestRow, logger) {
  if (!env.N8N_WEBHOOK_SECRET) return false;
  runApifyRequest(database, env, requestRow, logger).catch(async (error) => {
    logger.error(`Lead request ${requestRow.id} failed: ${error.message}`);
    await database("lead_requests").where({ id: requestRow.id }).update({ status: "failed", error_message: String(error.message).slice(0, 2000), updated_at: isoNow() });
  });
  return true;
}

export default {
  id: "lead-agent",
  handler: (router, { services, database, getSchema, env, logger }) => {
    const { FilesService, ItemsService, UsersService } = services;

    router.get("/health", route(async (_req, res) => {
      res.json({
        data: {
          status: "ok",
          version: "2.0.0",
          sms_provider: env.SMS_PROVIDER || "console",
          workflow_configured: Boolean(env.N8N_LEAD_AGENT_WEBHOOK_URL && env.N8N_WEBHOOK_SECRET),
          vapi_configured: Boolean(env.VAPI_API_KEY && env.VAPI_WEBHOOK_SECRET),
          chat_configured: Boolean(env.OPENAI_API_KEY),
          sourcing_configured: Boolean(env.APIFY_TOKEN),
          b2c_configured: Boolean((env.HARAJ_POSTS_URL || env.HARAJ_GRAPHQL_BASE_URL) && env.HARAJ_BEARER_TOKEN),
          postiz_configured: Boolean(env.POSTIZ_BASE_URL && env.POSTIZ_API_KEY),
          chatwoot_configured: Boolean(env.CHATWOOT_BASE_URL && env.CHATWOOT_API_ACCESS_TOKEN && env.CHATWOOT_ACCOUNT_ID),
          langfuse_configured: Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY),
        },
      });
    }, logger));

    router.get("/capabilities", route(async (req, res) => {
      const context = await chatContext(database, req);
      const features = await effectiveFeatures(database, context);
      const map = Object.fromEntries(features.map((feature) => [feature.key, feature.enabled]));
      res.set("Cache-Control", "no-store");
      res.json({ data: {
        features: map,
        lead_types: [map.lead_agent_b2b && "b2b", map.lead_agent_b2c && "b2c"].filter(Boolean),
        updated_at: features.map((feature) => feature.updated_at).filter(Boolean).sort().at(-1) || null,
      } });
    }, logger));

    router.get("/memory", route(async (req, res) => {
      const context = await chatContext(database, req);
      const row = await database("ai_account_memory").where({ user_id: context.userId }).first();
      res.json({ data: row ? { ...row, understood_data: parseStoredJson(row.understood_data, {}) } : null });
    }, logger));

    router.patch("/memory", route(async (req, res) => {
      const context = await chatContext(database, req);
      const persona = safeJsonObject(req.body?.persona, "Business persona");
      if (JSON.stringify(persona).length > 20_000) throw new ApiError(400, "PERSONA_TOO_LARGE", "Keep the business persona under 20 KB.");
      const existing = await database("ai_account_memory").where({ user_id: context.userId }).first();
      const understood = parseStoredJson(existing?.understood_data, { observations: [] });
      understood.owner_persona = persona;
      understood.owner_confirmed_at = isoNow();
      const row = {
        organization_id: context.organization?.id || null,
        user_id: context.userId,
        user_email: context.user?.email || null,
        understood_data: JSON.stringify(understood),
        last_summary: existing?.last_summary || String(persona.summary || persona.business || "Owner-confirmed business persona").slice(0, 6000),
        last_outcome: existing?.last_outcome || "persona_confirmed",
        source_turn_count: Number(existing?.source_turn_count || 0),
        confidence: Math.max(Number(existing?.confidence || 0), 90),
        updated_at: isoNow(),
      };
      if (existing) await database("ai_account_memory").where({ id: existing.id }).update(row);
      else await database("ai_account_memory").insert({ id: randomUUID(), memory_key: `user:${context.userId}`, ...row, created_at: isoNow() });
      res.json({ data: { ...existing, ...row, understood_data: understood } });
    }, logger));

    router.post("/chat", route(async (req, res) => {
      const context = await chatContext(database, req);
      await assertFeature(database, context, "ai_chat");
      enforceChatRateLimit(context.userId);
      const message = String(req.body?.message || "").trim();
      const language = req.body?.language === "en" ? "en" : "ar";
      const transcript = Array.isArray(req.body?.transcript) ? req.body.transcript : [];
      const conversationId = req.body?.conversation_id || req.body?.conversationId;
      const leadType = ["b2b", "b2c"].includes(req.body?.lead_type) ? req.body.lead_type : null;
      const dealIntent = ["buy", "sell"].includes(req.body?.deal_intent) ? req.body.deal_intent : null;
      if (leadType === "b2b") await assertFeature(database, context, "lead_agent_b2b");
      if (leadType === "b2c") await assertFeature(database, context, "lead_agent_b2c");
      if (!message) throw new ApiError(400, "CHAT_MESSAGE_REQUIRED", "Write a message first.");
      if (message.length > 4000) throw new ApiError(400, "CHAT_MESSAGE_TOO_LONG", "Keep messages under 4,000 characters.");
      try {
        const businessContext = await waslaBusinessContext(database, context.organization);
        const output = await createWaslaChatResponse(env, message, transcript, language, leadType, dealIntent, businessContext);
        const brief = leadType === "b2b" ? JSON.parse(output) : null;
        const text = brief?.text || output;
        const intake = brief ? {
          confidence: brief.ready && brief.searchQueries?.length ? 100 : 50,
          summary: brief.summary, missing: brief.missing, channel: "b2b",
          apifyActor: "compass/crawler-google-places", apifyInput: { searchStringsArray: brief.searchQueries },
        } : null;
        const outcome = brief?.ready ? "ready_for_quantity" : "discovery";
        await createChatLog(database, context, { conversationId, mode: "assistant", language, leadType, dealIntent, message, response: text, transcript, understoodData: intake, outcome, status: "completed" }).catch((error) => logger.error(error));
        await rememberConversation(database, context, { conversationId, leadType, dealIntent, message, summary: brief?.summary || text, missing: brief?.missing, searchQueries: brief?.searchQueries, confidence: intake?.confidence || 25, outcome }).catch((error) => logger.error(error));
        res.json({ data: { text, ...(intake ? { intake } : {}) } });
      } catch (error) {
        await createChatLog(database, context, { conversationId, mode: "assistant", language, leadType, dealIntent, message, transcript, outcome: "failed", status: "failed", error: error?.message }).catch((logError) => logger.error(logError));
        throw error;
      }
    }, logger));

    router.post("/b2c/chat", route(async (req, res) => {
      const context = await chatContext(database, req);
      await assertFeature(database, context, "ai_chat");
      await assertFeature(database, context, "lead_agent_b2c");
      enforceChatRateLimit(context.userId);
      const prompt = String(req.body?.message || req.body?.prompt || "").trim();
      const language = req.body?.language === "en" ? "en" : "ar";
      const transcript = Array.isArray(req.body?.transcript) ? req.body.transcript : [];
      const conversationId = req.body?.conversation_id || req.body?.conversationId;
      const dealIntent = req.body?.deal_intent === "buy" ? "buy" : "sell";
      const suppliedPlanning = req.body?.planning;
      if (prompt.length < 3) throw new ApiError(400, "B2C_PROMPT_REQUIRED", "Describe the product or service you want to sell.");
      if (prompt.length > 4000) throw new ApiError(400, "B2C_PROMPT_TOO_LONG", "Keep the request under 4,000 characters.");
      const qualification = qualifyB2CConversation(prompt, transcript, language, dealIntent);
      const businessContext = await waslaBusinessContext(database, context.organization);
      if (dealIntent === "sell" && suppliedPlanning?.acquisitionPlan?.leadPaths?.length && /^SELECT_PATHS?:/i.test(prompt)) {
        const planning = selectB2CLeadPaths(suppliedPlanning, prompt);
        const selectedNames = planning.acquisitionPlan.leadPaths.filter((path) => path.selected).map((path) => path.name);
        const text = language === "ar"
          ? `ممتاز. سنبحث عبر ${selectedNames.join("، ")} ونشترط إشارات طلب واضحة، مع استبعاد المنافسين ومقدمي الخدمة نفسها. اكتب «ابدأ» لاختيار عدد العملاء.`
          : `Excellent. We’ll search through ${selectedNames.join(", ")}, require clear demand evidence, and exclude competitors and sellers of the same service. Reply “start” to choose the lead count.`;
        await createChatLog(database, context, { conversationId, mode: "b2c", language, leadType: "b2c", dealIntent, message: prompt, response: text, transcript, understoodData: planning, outcome: "lead_path_confirmed", status: "completed" }).catch((error) => logger.error(error));
        await rememberConversation(database, context, { conversationId, leadType: "b2c", dealIntent, message: prompt, summary: selectedNames.join(", "), missing: [], b2cIntent: planning.intent, acquisitionPlan: planning.acquisitionPlan, confidence: 100, outcome: "lead_path_confirmed" }).catch((error) => logger.error(error));
        res.json({ data: { text, planning, ready: true, missing: [], brief: planning.intent.productDescription, stage: "ready_for_quantity" } });
        return;
      }
      if (!qualification.ready) {
        // Qualification questions must be deterministic. A general model reply
        // can sound helpful while skipping the missing targeting criterion.
        const nextQuestion = qualification.question;
        await createChatLog(database, context, { conversationId, mode: "b2c", language, leadType: "b2c", dealIntent, message: prompt, response: nextQuestion, transcript, understoodData: { brief: qualification.brief, missing: qualification.missing }, outcome: "discovery", status: "qualifying" }).catch((error) => logger.error(error));
        await rememberConversation(database, context, { conversationId, leadType: "b2c", dealIntent, message: prompt, summary: qualification.brief, missing: qualification.missing, confidence: 35, outcome: "discovery" }).catch((error) => logger.error(error));
        res.json({ data: { text: nextQuestion, planning: null, ready: false, missing: qualification.missing, brief: qualification.brief } });
        return;
      }
      const planningPrompt = dealIntent === "buy" ? `[PROCUREMENT_FROM_CONSUMERS] ${qualification.brief}` : qualification.brief;
      const planning = await createB2CPlan(env, planningPrompt);
      const { intent, acquisitionPlan } = planning;
      if (dealIntent === "sell" && acquisitionPlan.pathSelectionRequired) {
        const pathNames = acquisitionPlan.leadPaths.map((path, index) => `${index + 1}. ${path.name}`).join(language === "ar" ? "\n" : "\n");
        const text = language === "ar"
          ? `فهمت عرضك: ${intent.productName}. بدلاً من البحث عن منافسين يبيعون نفس خدمتك، بنيت مسارات نحو من تظهر لديهم حاجة فعلية:\n\n${pathNames}\n\nاختر مساراً واحداً أو أكثر أدناه، وسأستخدمه فقط بعد موافقتك.`
          : `I understand your offer: ${intent.productName}. Instead of finding competitors selling the same service, I built paths toward people showing a real need:\n\n${pathNames}\n\nChoose one or more paths below. I will only use the paths you approve.`;
        await createChatLog(database, context, { conversationId, mode: "b2c", language, leadType: "b2c", dealIntent, message: prompt, response: text, transcript, understoodData: planning, outcome: "lead_path_selection", status: "qualifying" }).catch((error) => logger.error(error));
        await rememberConversation(database, context, { conversationId, leadType: "b2c", dealIntent, message: prompt, summary: qualification.brief, missing: ["lead_path_selection"], b2cIntent: planning.intent, acquisitionPlan: planning.acquisitionPlan, confidence: 75, outcome: "lead_path_selection" }).catch((error) => logger.error(error));
        res.json({ data: { text, planning, ready: false, missing: ["lead_path_selection"], brief: qualification.brief, stage: "lead_path_selection" } });
        return;
      }
      const strength = acquisitionPlan.strategies.length >= 4 ? (language === "ar" ? "قوية" : "strong") : (language === "ar" ? "مبدئية" : "focused");
      const profiles = acquisitionPlan.targetProfiles.slice(0, 3).join(language === "ar" ? "، " : ", ");
      const signals = intent.behavioralSignals.slice(0, 3).map((item) => item.signal).join(language === "ar" ? "، " : ", ");
      const locations = intent.market.cities?.length ? intent.market.cities.join(language === "ar" ? "، " : ", ") : intent.market.country;
      const fallbackText = dealIntent === "buy"
        ? language === "ar"
          ? `فهمت طلب الشراء: ${intent.productName}. سأبحث عن ${profiles} عبر إشارات عروض واضحة مثل ${signals}. النطاق: ${locations}. الاستراتيجية ${strength}. إذا كان هذا الوصف دقيقاً، اكتب «ابدأ» لاختيار عدد النتائج.`
          : `I understand the purchase request: ${intent.productName}. I’ll look for ${profiles} through credible offer signals such as ${signals}. Area: ${locations}. The strategy is ${strength}. If that target is accurate, reply “start” to choose the result count.`
        : language === "ar"
          ? `فهمت عرضك: ${intent.productName}. سأستهدف ${profiles} عبر إشارات قابلة للملاحظة مثل ${signals}. السوق: ${locations}. قوة الاستراتيجية ${strength}. إذا كان هذا الوصف دقيقاً، اكتب «ابدأ» لاختيار عدد العملاء.`
          : `I understand the offer: ${intent.productName}. I’ll target ${profiles} through observable signals such as ${signals}. Market: ${locations}. The strategy is ${strength}. If that target is accurate, reply “start” to choose the lead count.`;
      const synthesisContext = language === "ar"
        ? `معلومة داخلية للرد التالي: اكتملت المعايير. المنتج أو الطلب: ${intent.productName}. الملفات المستهدفة: ${profiles}. الإشارات: ${signals}. الموقع: ${locations}. لخّص فهمك بذكاء وبأسلوب طبيعي، اذكر أي افتراض مهم، ثم اطلب من المستخدم كتابة «ابدأ» فقط إذا كان الوصف دقيقاً.`
        : `Internal context for the next reply: the brief is complete. Product or request: ${intent.productName}. Target profiles: ${profiles}. Signals: ${signals}. Geography: ${locations}. Synthesize your understanding thoughtfully and naturally, state any important assumption, then ask the user to reply “start” only if the description is accurate.`;
      const text = await createWaslaChatResponse(env, prompt, [...transcript, `user: ${synthesisContext}`], language, "b2c", dealIntent, businessContext).catch(() => fallbackText);
      await createChatLog(database, context, { conversationId, mode: "b2c", language, leadType: "b2c", dealIntent, message: prompt, response: text, transcript, understoodData: planning, outcome: "ready_for_quantity", status: "completed" }).catch((error) => logger.error(error));
      await rememberConversation(database, context, { conversationId, leadType: "b2c", dealIntent, message: prompt, summary: qualification.brief, missing: [], b2cIntent: planning.intent, acquisitionPlan: planning.acquisitionPlan, confidence: 100, outcome: "ready_for_quantity" }).catch((error) => logger.error(error));
      res.json({ data: { text, planning, ready: true, missing: [], brief: qualification.brief } });
    }, logger));

    router.post("/b2c/plan", route(async (req, res) => {
      const context = await chatContext(database, req);
      await assertFeature(database, context, "lead_agent_b2c");
      const prompt = String(req.body?.prompt || "").trim();
      if (prompt.length < 3) throw new ApiError(400, "B2C_PROMPT_REQUIRED", "Describe the product or service you want to sell.");
      if (prompt.length > 4000) throw new ApiError(400, "B2C_PROMPT_TOO_LONG", "Keep the request under 4,000 characters.");
      res.json({ data: await createB2CPlan(env, prompt) });
    }, logger));

    router.post("/b2c/campaigns", route(async (req, res) => {
      const prompt = String(req.body?.prompt || req.body?.originalPrompt || "").trim();
      if (prompt.length < 3) throw new ApiError(400, "B2C_PROMPT_REQUIRED", "Describe the product or service you want to sell.");
      if (prompt.length > 4000) throw new ApiError(400, "B2C_PROMPT_TOO_LONG", "Keep the request under 4,000 characters.");
      const targetLeadCount = safeInteger(req.body?.targetLeadCount ?? req.body?.target_lead_count, 20, 1, MAX_LEADS_PER_REQUEST);
      const context = await chatContext(database, req);
      await assertFeature(database, context, "lead_agent_b2c");
      const requiredCredits = targetLeadCount * CREDITS_PER_SAR;
      const wallet = context.organization ? await database("wallets").where({ organization_id: context.organization.id }).first() : null;
      const availableCredits = Math.floor(Number(wallet?.balance_halalas || 0) / 100 * CREDITS_PER_SAR);
      if (!wallet || availableCredits < requiredCredits) {
        throw new ApiError(402, "INSUFFICIENT_CREDITS", `You need ${requiredCredits.toLocaleString()} credits for ${targetLeadCount} leads. Your available balance is ${availableCredits.toLocaleString()} credits.`);
      }
      const { userId, organization } = context;
      const suppliedPlanning = req.body?.planning;
      const qualification = qualifyB2CConversation(prompt, [], "en", suppliedPlanning?.acquisitionPlan?.dealIntent || "sell");
      if (!qualification.ready) {
        throw new ApiError(409, "B2C_BRIEF_INCOMPLETE", `Complete the lead brief before starting a campaign: ${qualification.missing.join(", ")}.`);
      }
      const planning = await validateB2CPlan(env, prompt, suppliedPlanning);
      const now = isoNow();
      const campaignId = randomUUID();
      const requestId = randomUUID();
      const initialStats = { postsFetched: 0, candidatesQualified: 0, contactsResolved: 0, uniqueLeads: 0, hotLeads: 0, warmLeads: 0 };
      const requestRow = {
        id: requestId,
        organization_id: organization.id,
        created_by: userId,
        query: prompt,
        criteria: JSON.stringify({ buyer_type: "B2C", campaign_id: campaignId, acquisition_plan: planning.acquisitionPlan }),
        target_count: targetLeadCount,
        status: "ready",
        provider: "b2c",
        provider_job_id: campaignId,
        idempotency_key: `b2c:${campaignId}`,
        result_count: 0,
        created_at: now,
        updated_at: now,
      };
      const campaignRow = {
        id: campaignId,
        organization_id: organization.id,
        user_id: userId,
        request_id: requestId,
        name: String(req.body?.name || `${planning.intent.productName} buyers`).slice(0, 255),
        original_prompt: prompt,
        intent: JSON.stringify(planning.intent),
        acquisition_plan: JSON.stringify(planning.acquisitionPlan),
        sourcing_explanation: `Client asked for ${planning.intent.productName}. Wasla translated the offer into observable public activity from ${planning.acquisitionPlan.targetProfiles.slice(0, 3).join(", ")} and qualified matching people before delivery.`,
        target_lead_count: targetLeadCount,
        status: "READY",
        stats: JSON.stringify(initialStats),
        created_at: now,
        updated_at: now,
      };
      await database.transaction(async (trx) => {
        await trx("lead_requests").insert(requestRow);
        await trx("b2c_campaigns").insert(campaignRow);
        await trx("integration_events").insert({
          id: randomUUID(), organization_id: organization.id, event_type: "b2c.campaign.created", status: "processed",
          idempotency_key: `b2c.campaign.created:${campaignId}`, payload: JSON.stringify({ campaign_id: campaignId, request_id: requestId }),
          attempts: 1, processed_at: now, created_at: now, updated_at: now,
        });
      });
      res.status(201).json({ data: serializeCampaign(campaignRow) });
    }, logger));

    router.get("/b2c/campaigns/:id", route(async (req, res) => {
      const { organization, userId } = await customerContext(database, req);
      const campaign = await database("b2c_campaigns").where({ id: req.params.id, organization_id: organization.id, user_id: userId }).first();
      if (!campaign) throw new ApiError(404, "B2C_CAMPAIGN_NOT_FOUND", "B2C campaign not found.");
      res.json({ data: serializeCampaign(campaign) });
    }, logger));

    router.post("/b2c/campaigns/:id/run", route(async (req, res) => {
      const { organization, userId } = await customerContext(database, req);
      await assertFeature(database, { organization, userId }, "lead_agent_b2c");
      const campaign = await database("b2c_campaigns").where({ id: req.params.id, organization_id: organization.id, user_id: userId }).first();
      if (!campaign) throw new ApiError(404, "B2C_CAMPAIGN_NOT_FOUND", "B2C campaign not found.");
      if (["RUNNING", "QUEUED"].includes(campaign.status)) {
        res.status(202).json({ data: serializeCampaign(campaign) });
        return;
      }
      const existingCountRow = await database("b2c_leads").where({ campaign_id: campaign.id }).count("id as count").first();
      if (campaign.status === "COMPLETED" && Number(existingCountRow?.count || 0) >= Number(campaign.target_lead_count)) {
        res.json({ data: serializeCampaign(campaign) });
        return;
      }
      // Revalidate persisted plans before every retry so campaigns created with an
      // older taxonomy mapper cannot repeat a bad category selection.
      const refreshedPlanning = await validateB2CPlan(env, campaign.original_prompt, {
        intent: parseStoredJson(campaign.intent, {}),
        acquisitionPlan: parseStoredJson(campaign.acquisition_plan, {}),
      });
      const now = isoNow();
      await database("b2c_campaigns").where({ id: campaign.id }).update({
        status: "QUEUED", intent: JSON.stringify(refreshedPlanning.intent), acquisition_plan: JSON.stringify(refreshedPlanning.acquisitionPlan), error_message: null, updated_at: now,
      });
      await database("lead_requests").where({ id: campaign.request_id }).update({ status: "sourcing", updated_at: now });
      setImmediate(() => {
        runB2CCampaign({ database, env, campaignId: campaign.id, logger }).catch(() => undefined);
      });
      res.status(202).json({ data: serializeCampaign({ ...campaign, intent: refreshedPlanning.intent, acquisition_plan: refreshedPlanning.acquisitionPlan, status: "QUEUED", updated_at: now }) });
    }, logger));

    router.get("/b2c/campaigns/:id/leads", route(async (req, res) => {
      const { organization, userId } = await customerContext(database, req);
      const campaign = await database("b2c_campaigns").where({ id: req.params.id, organization_id: organization.id, user_id: userId }).first();
      if (!campaign) throw new ApiError(404, "B2C_CAMPAIGN_NOT_FOUND", "B2C campaign not found.");
      const limit = safeInteger(req.query.limit, 100, 1, MAX_LEADS_PER_REQUEST);
      const rows = await database("b2c_leads")
        .where({ campaign_id: campaign.id, organization_id: organization.id })
        .whereNotNull("phone")
        .whereNot("phone", "")
        .orderBy("score", "desc")
        .limit(limit);
      const inventoryIds = rows.map((row) => row.inventory_id).filter(Boolean);
      const grants = inventoryIds.length
        ? await database("lead_access_grants").select("lead_id").where({ organization_id: organization.id }).whereIn("lead_id", inventoryIds)
        : [];
      const revealed = new Set(grants.map((grant) => grant.lead_id));
      res.json({ data: rows.map((row) => serializeB2CLead(row, revealed.has(row.inventory_id))), meta: {
        campaign_status: campaign.status,
        stats: serializeCampaign(campaign).stats,
        explanation: buildPublicB2CExplanation(campaign),
        error: campaign.status === "FAILED" ? "Sourcing failed. Saved results are returned above; retry the search from your chat." : null,
      } });
    }, logger));

    router.get("/b2c/leads/:id", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const lead = await database("b2c_leads").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!lead) throw new ApiError(404, "B2C_LEAD_NOT_FOUND", "B2C lead not found.");
      const grant = lead.inventory_id ? await database("lead_access_grants").where({ organization_id: organization.id, lead_id: lead.inventory_id }).first() : null;
      res.json({ data: serializeB2CLead(lead, Boolean(grant)) });
    }, logger));

    router.post("/b2c/leads/:id/status", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const lead = await database("b2c_leads").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!lead) throw new ApiError(404, "B2C_LEAD_NOT_FOUND", "B2C lead not found.");
      const status = String(req.body?.status || "").toUpperCase();
      const allowed = new Set(["DELIVERED", "CONTACTED", "REPLIED", "QUALIFIED", "CONVERTED", "REJECTED"]);
      if (!allowed.has(status)) throw new ApiError(400, "B2C_STATUS_INVALID", "Use a valid B2C lead outcome status.");
      const now = isoNow();
      const revenueHalalas = req.body?.revenue == null ? null : Math.max(0, Math.round(Number(req.body.revenue) * 100));
      await database.transaction(async (trx) => {
        await trx("b2c_leads").where({ id: lead.id }).update({ status, updated_at: now });
        await trx("b2c_lead_outcomes").insert({
          id: randomUUID(), outcome_key: `${lead.id}:${status}`, organization_id: organization.id, campaign_id: lead.campaign_id,
          lead_id: lead.id, status, revenue_halalas: Number.isFinite(revenueHalalas) ? revenueHalalas : null,
          rejection_reason: String(req.body?.rejectionReason || req.body?.rejection_reason || "").slice(0, 2000) || null,
          created_at: now, updated_at: now,
        }).onConflict("outcome_key").merge({ revenue_halalas: Number.isFinite(revenueHalalas) ? revenueHalalas : null, rejection_reason: String(req.body?.rejectionReason || req.body?.rejection_reason || "").slice(0, 2000) || null, updated_at: now });
      });
      res.json({ data: serializeB2CLead({ ...lead, status, updated_at: now }, false) });
    }, logger));

    router.post("/auth/register", route(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || "");
      const name = String(req.body?.name || "").trim();
      const business = String(req.body?.business || "").trim();
      const phone = normalizeSaudiAccountPhone(req.body?.phone);
      const privacyAccepted = req.body?.privacy_accepted === true;
      const permissionsAccepted = req.body?.permissions_accepted === true;
      const consentVersion = String(req.body?.consent_version || "").trim().slice(0, 32);

      if (password.length < 10) throw new ApiError(400, "WEAK_PASSWORD", "Use at least 10 characters for the password.");
      if (name.length < 2) throw new ApiError(400, "INVALID_NAME", "Enter your full name.");
      if (business.length < 2) throw new ApiError(400, "INVALID_BUSINESS", "Enter your business name.");
      if (!privacyAccepted || !permissionsAccepted || !consentVersion) throw new ApiError(400, "CONSENT_REQUIRED", "Accept the Privacy Policy and Permissions before creating an account.");

      const [existingUser, existingPhone] = await Promise.all([
        database("directus_users").whereRaw("LOWER(email) = ?", [email]).first(),
        database("customer_profiles").where({ phone_e164: phone }).first(),
      ]);
      if (existingUser) throw new ApiError(409, "EMAIL_EXISTS", "An account already exists for this email.");
      if (existingPhone) throw new ApiError(409, "PHONE_EXISTS", "This phone number is already attached to an account.");

      const userId = randomUUID();
      const organizationId = randomUUID();
      const profileId = randomUUID();
      const walletId = randomUUID();
      const [firstName, ...lastParts] = name.split(/\s+/);
      const schema = await getSchema();
      const users = new UsersService({ schema });
      const roleId = env.WASLAH_CUSTOMER_ROLE_ID || CUSTOMER_ROLE_ID;

      await users.createOne({
        id: userId,
        email,
        password,
        first_name: firstName,
        last_name: lastParts.join(" ") || null,
        status: "active",
        role: roleId,
      });

      try {
        await database.transaction(async (trx) => {
          const now = isoNow();
          await trx("organizations").insert({
            id: organizationId,
            name: business,
            slug: slugify(business),
            owner_user: userId,
            status: "active",
            monthly_user_limit: 25,
            created_at: now,
            updated_at: now,
          });
          await trx("organization_members").insert({
            id: randomUUID(),
            membership_key: `${organizationId}:${userId}`,
            organization_id: organizationId,
            user_id: userId,
            role: "owner",
            status: "active",
            created_at: now,
          });
          await trx("customer_profiles").insert({
            id: profileId,
            user_id: userId,
            organization_id: organizationId,
            phone_e164: phone,
            avatar_seed: createHash("sha256").update(`${userId}:${name}`).digest("hex").slice(0, 24),
            locale: "ar-SA",
            marketing_consent: Boolean(req.body?.marketing_consent),
            privacy_consent_at: now,
            permissions_consent_at: now,
            consent_version: consentVersion,
            created_at: now,
            updated_at: now,
          });
          await trx("wallets").insert({
            id: walletId,
            organization_id: organizationId,
            currency: "SAR",
            balance_halalas: WELCOME_CREDIT_HALALAS,
            created_at: now,
            updated_at: now,
          });
          await trx("wallet_transactions").insert({
            id: randomUUID(),
            organization_id: organizationId,
            wallet_id: walletId,
            type: "welcome_credit",
            amount_halalas: WELCOME_CREDIT_HALALAS,
            idempotency_key: `welcome-account:${userId}`,
            reference_type: "account_registration",
            reference_id: userId,
            metadata: { granted_before_phone_verification: true },
            created_at: now,
          });
        });
      } catch (error) {
        await users.deleteOne(userId).catch(() => undefined);
        throw error;
      }

      res.status(201).json({ data: { user_id: userId, organization_id: organizationId, email, phone } });
    }, logger));

    router.get("/auth/social/identity", route(async (req, res) => {
      const userId = requireUser(req);
      const [user, profile] = await Promise.all([
        database("directus_users")
          .select("id", "email", "first_name", "last_name", "provider")
          .where({ id: userId })
          .first(),
        database("customer_profiles").where({ user_id: userId }).first(),
      ]);
      if (!user) throw new ApiError(404, "USER_NOT_FOUND", "The authenticated user no longer exists.");
      res.json({
        data: {
          id: user.id,
          email: user.email,
          name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email?.split("@")[0] || "Wasla customer",
          provider: user.provider || "unknown",
          profile_complete: Boolean(profile),
        },
      });
    }, logger));

    router.post("/auth/social/complete", route(async (req, res) => {
      const userId = requireUser(req);
      const business = String(req.body?.business || "").trim();
      const phone = normalizeSaudiAccountPhone(req.body?.phone);
      const privacyAccepted = req.body?.privacy_accepted === true;
      const permissionsAccepted = req.body?.permissions_accepted === true;
      const consentVersion = String(req.body?.consent_version || "").trim().slice(0, 32);
      if (business.length < 2) throw new ApiError(400, "INVALID_BUSINESS", "Enter your business name.");
      if (!privacyAccepted || !permissionsAccepted || !consentVersion) throw new ApiError(400, "CONSENT_REQUIRED", "Accept the Privacy Policy and Permissions before creating an account.");

      const [user, existingProfile, existingPhone] = await Promise.all([
        database("directus_users").select("id", "email", "first_name", "last_name", "provider").where({ id: userId }).first(),
        database("customer_profiles").where({ user_id: userId }).first(),
        database("customer_profiles").where({ phone_e164: phone }).first(),
      ]);
      if (!user) throw new ApiError(404, "USER_NOT_FOUND", "The authenticated user no longer exists.");
      if (existingProfile) {
        res.json({ data: { user_id: userId, organization_id: existingProfile.organization_id, profile_complete: true } });
        return;
      }
      if (existingPhone) throw new ApiError(409, "PHONE_EXISTS", "This phone number is already attached to an account.");

      const organizationId = randomUUID();
      const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email?.split("@")[0] || "Wasla customer";
      await database.transaction(async (trx) => {
        const now = isoNow();
        await trx("organizations").insert({
          id: organizationId,
          name: business,
          slug: slugify(business),
          owner_user: userId,
          status: "active",
          monthly_user_limit: 25,
          created_at: now,
          updated_at: now,
        });
        await trx("organization_members").insert({
          id: randomUUID(),
          membership_key: `${organizationId}:${userId}`,
          organization_id: organizationId,
          user_id: userId,
          role: "owner",
          status: "active",
          created_at: now,
        });
        await trx("customer_profiles").insert({
          id: randomUUID(),
          user_id: userId,
          organization_id: organizationId,
          phone_e164: phone,
          avatar_seed: createHash("sha256").update(`${userId}:${name}`).digest("hex").slice(0, 24),
          locale: String(req.body?.locale || "ar-SA").slice(0, 10),
          marketing_consent: Boolean(req.body?.marketing_consent),
          privacy_consent_at: now,
          permissions_consent_at: now,
          consent_version: consentVersion,
          created_at: now,
          updated_at: now,
        });
        const walletId = randomUUID();
        await trx("wallets").insert({
          id: walletId,
          organization_id: organizationId,
          currency: "SAR",
          balance_halalas: WELCOME_CREDIT_HALALAS,
          created_at: now,
          updated_at: now,
        });
        await trx("wallet_transactions").insert({
          id: randomUUID(),
          organization_id: organizationId,
          wallet_id: walletId,
          type: "welcome_credit",
          amount_halalas: WELCOME_CREDIT_HALALAS,
          idempotency_key: `welcome-account:${userId}`,
          reference_type: "account_registration",
          reference_id: userId,
          metadata: { granted_before_phone_verification: true, provider: user.provider || "social" },
          created_at: now,
        });
      });

      res.status(201).json({ data: { user_id: userId, organization_id: organizationId, profile_complete: true } });
    }, logger));

    router.get("/me", route(async (req, res) => {
      const userId = requireUser(req);
      const admin = await userIdentity(database, userId);
      if (admin?.admin_access) {
        const membership = await database("organization_members")
          .where({ user_id: userId, status: "active" })
          .orderBy("created_at", "asc")
          .first();
        const organization = membership
          ? await database("organizations").where({ id: membership.organization_id, status: "active" }).first()
          : null;
        const wallet = organization
          ? await database("wallets").where({ organization_id: organization.id }).first()
          : null;
        res.json({
          data: {
            id: userId,
            email: admin.email,
            name: [admin.first_name, admin.last_name].filter(Boolean).join(" ") || "Wasla Administrator",
            business: organization?.name || "Wasla Administration",
            organization_id: organization?.id || null,
            phone: "",
            phone_verified: true,
            avatar_seed: userId,
            is_admin: true,
            wallet: {
              currency: wallet?.currency || "SAR",
              balance_halalas: wallet?.balance_halalas || 0,
              balance: (wallet?.balance_halalas || 0) / 100,
              credits: Math.floor((wallet?.balance_halalas || 0) / 100 * CREDITS_PER_SAR),
            },
            welcome_offer: { credit_sar: 100, included_leads: WELCOME_INCLUDED_LEADS },
            created_at: admin.last_access || isoNow(),
          },
        });
        return;
      }
      const { profile, organization } = await customerContext(database, req);
      const [user, wallet] = await Promise.all([
        database("directus_users").select("email", "first_name", "last_name").where({ id: userId }).first(),
        database("wallets").where({ organization_id: organization.id }).first(),
      ]);
      res.json({
        data: {
          id: userId,
          email: user.email,
          name: [user.first_name, user.last_name].filter(Boolean).join(" "),
          business: organization.name,
          organization_id: organization.id,
          phone: profile.phone_e164,
          phone_verified: Boolean(profile.phone_verified_at),
          avatar_seed: profile.avatar_seed,
          is_admin: false,
          wallet: {
            currency: wallet?.currency || "SAR",
            balance_halalas: wallet?.balance_halalas || 0,
            balance: (wallet?.balance_halalas || 0) / 100,
            credits: Math.floor((wallet?.balance_halalas || 0) / 100 * CREDITS_PER_SAR),
          },
          welcome_offer: { credit_sar: 100, included_leads: WELCOME_INCLUDED_LEADS },
          created_at: profile.created_at,
        },
      });
    }, logger));

    router.get("/socials/providers", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const [postiz, chatwoot] = await Promise.all([growthServiceEnv(database, env, organization.id, "postiz"), growthServiceEnv(database, env, organization.id, "chatwoot")]);
      res.json({ data: {
        providers: publicSocialProviders(env),
        security: {
          encrypted_at_rest: Boolean(env.SOCIAL_TOKEN_ENCRYPTION_KEY || env.SECRET),
          dedicated_encryption_key: Boolean(env.SOCIAL_TOKEN_ENCRYPTION_KEY),
          tenant_isolated: true,
          secrets_returned_to_browser: false,
        },
        orchestration: [
          { id: "postiz", name: "Postiz", ready: Boolean(postiz), required_environment: ["POSTIZ_BASE_URL"] },
          { id: "chatwoot", name: "Chatwoot", ready: Boolean(chatwoot), required_environment: ["CHATWOOT_BASE_URL"] },
        ],
      } });
    }, logger));

    router.get("/socials/connections", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const rows = await database("social_connections")
        .where({ organization_id: organization.id })
        .orderBy([{ column: "is_preferred", order: "desc" }, { column: "updated_at", order: "desc" }]);
      res.json({ data: rows.map(publicSocialConnection) });
    }, logger));

    router.get("/socials/activity", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const limit = safeInteger(req.query.limit, 30, 1, 100);
      const rows = await database("social_events")
        .select("id", "connection_id", "provider", "event_type", "status", "summary", "metadata", "created_at")
        .where({ organization_id: organization.id })
        .orderBy("created_at", "desc")
        .limit(limit);
      res.json({ data: rows.map((row) => ({ ...row, metadata: parseStoredJson(row.metadata, {}) })) });
    }, logger));

    router.post("/socials/connections", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const provider = String(req.body?.provider || "").trim().toLowerCase();
      const definition = SOCIAL_PROVIDERS[provider];
      if (!definition) throw new ApiError(400, "INVALID_SOCIAL_PROVIDER", "Choose a supported social channel.");
      const displayName = String(req.body?.display_name || definition.name).trim().slice(0, 120);
      if (!displayName) throw new ApiError(400, "SOCIAL_DISPLAY_NAME_REQUIRED", "Name this channel connection.");
      const authMode = req.body?.auth_mode === "oauth" ? "oauth" : "credentials";
      const credentials = normalizeSocialCredentials(provider, req.body?.credentials);
      const hints = credentialHints(provider, credentials);
      const configuration = safeJsonObject(req.body?.configuration, "Configuration");
      const { autonomyLevel, approvalPolicy } = socialPolicy(req.body);
      const id = randomUUID();
      const now = isoNow();
      const externalAccountId = credentials.account_id || credentials.page_id || credentials.phone_number_id || credentials.open_id || credentials.profile_id || null;
      const requestedPreferred = req.body?.is_preferred === true;

      await database.transaction(async (trx) => {
        const existing = await trx("social_connections").where({ organization_id: organization.id }).count("id as count").first();
        const isPreferred = requestedPreferred || Number(existing?.count || 0) === 0;
        if (isPreferred) await trx("social_connections").where({ organization_id: organization.id }).update({ is_preferred: false, updated_at: now });
        await trx("social_connections").insert({
          id,
          organization_id: organization.id,
          created_by: userId,
          provider,
          display_name: displayName,
          external_account_id: externalAccountId,
          status: "configured",
          is_preferred: isPreferred,
          auth_mode: authMode,
          credentials_encrypted: encryptSocialCredentials(env, credentials),
          credential_hints: JSON.stringify(hints),
          configuration: JSON.stringify(configuration),
          capabilities: JSON.stringify(definition.capabilities),
          autonomy_level: autonomyLevel,
          approval_policy: approvalPolicy,
          webhook_status: "not_configured",
          last_verified_at: null,
          last_connected_at: now,
          last_error: null,
          created_at: now,
          updated_at: now,
        });
        await recordSocialEvent(trx, {
          organizationId: organization.id,
          connectionId: id,
          userId,
          provider,
          eventType: "connection_created",
          summary: `${displayName} was connected to the workspace.`,
          metadata: { auth_mode: authMode, preferred: isPreferred, autonomy_level: autonomyLevel, approval_policy: approvalPolicy },
        });
      });
      const row = await database("social_connections").where({ id, organization_id: organization.id }).first();
      res.status(201).json({ data: publicSocialConnection(row) });
    }, logger));

    router.patch("/socials/connections/:id", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const connection = await database("social_connections").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!connection) throw new ApiError(404, "SOCIAL_CONNECTION_NOT_FOUND", "This channel connection was not found.");
      const updates = { updated_at: isoNow() };
      let eventType = "connection_updated";
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "display_name")) {
        const displayName = String(req.body.display_name || "").trim().slice(0, 120);
        if (!displayName) throw new ApiError(400, "SOCIAL_DISPLAY_NAME_REQUIRED", "Name this channel connection.");
        updates.display_name = displayName;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "configuration")) {
        updates.configuration = JSON.stringify(safeJsonObject(req.body.configuration, "Configuration"));
      }
      if (req.body?.credentials) {
        const credentials = normalizeSocialCredentials(connection.provider, req.body.credentials);
        const hints = credentialHints(connection.provider, credentials);
        updates.credentials_encrypted = encryptSocialCredentials(env, credentials);
        updates.credential_hints = JSON.stringify(hints);
        updates.external_account_id = credentials.account_id || credentials.page_id || credentials.phone_number_id || credentials.open_id || credentials.profile_id || null;
        updates.status = "configured";
        updates.last_connected_at = isoNow();
        updates.last_verified_at = null;
        updates.last_error = null;
        eventType = "credentials_rotated";
      }
      const policy = socialPolicy(req.body, connection);
      updates.autonomy_level = policy.autonomyLevel;
      updates.approval_policy = policy.approvalPolicy;
      await database.transaction(async (trx) => {
        await trx("social_connections").where({ id: connection.id, organization_id: organization.id }).update(updates);
        await recordSocialEvent(trx, {
          organizationId: organization.id,
          connectionId: connection.id,
          userId,
          provider: connection.provider,
          eventType,
          summary: eventType === "credentials_rotated" ? `${updates.display_name || connection.display_name} credentials were rotated.` : `${updates.display_name || connection.display_name} settings were updated.`,
          metadata: { autonomy_level: policy.autonomyLevel, approval_policy: policy.approvalPolicy },
        });
      });
      const row = await database("social_connections").where({ id: connection.id, organization_id: organization.id }).first();
      res.json({ data: publicSocialConnection(row) });
    }, logger));

    router.post("/socials/connections/:id/preferred", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const connection = await database("social_connections").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!connection) throw new ApiError(404, "SOCIAL_CONNECTION_NOT_FOUND", "This channel connection was not found.");
      const now = isoNow();
      await database.transaction(async (trx) => {
        await trx("social_connections").where({ organization_id: organization.id }).update({ is_preferred: false, updated_at: now });
        await trx("social_connections").where({ id: connection.id, organization_id: organization.id }).update({ is_preferred: true, updated_at: now });
        await recordSocialEvent(trx, {
          organizationId: organization.id,
          connectionId: connection.id,
          userId,
          provider: connection.provider,
          eventType: "preferred_route_changed",
          summary: `${connection.display_name} is now the preferred channel.`,
          metadata: {},
        });
      });
      const row = await database("social_connections").where({ id: connection.id, organization_id: organization.id }).first();
      res.json({ data: publicSocialConnection(row) });
    }, logger));

    router.post("/socials/connections/:id/validate", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const connection = await database("social_connections").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!connection) throw new ApiError(404, "SOCIAL_CONNECTION_NOT_FOUND", "This channel connection was not found.");
      const definition = SOCIAL_PROVIDERS[connection.provider];
      const hints = parseStoredJson(connection.credential_hints, { fields_present: [] });
      const present = new Set(hints.fields_present || []);
      const configuration = parseStoredJson(connection.configuration, {});
      const managedByPostiz = configuration.managed_by === "postiz";
      const missing = managedByPostiz ? [] : definition.credentialFields.filter((field) => field.required && !present.has(field.key)).map((field) => field.label);
      let externalApiTested = false;
      if (!missing.length && (managedByPostiz || connection.provider === "postiz")) {
        const scoped = await requireGrowthService(database, env, organization.id, "postiz");
        const integrations = await callPostiz(scoped, "/integrations");
        if (!Array.isArray(integrations) || (managedByPostiz && !integrations.some((item) => item.id === configuration.postiz_integration_id && !item.disabled))) throw new ApiError(409, "POSTIZ_INTEGRATION_INVALID", "Reconnect or sync this publishing channel.");
        externalApiTested = true;
      }
      if (!missing.length && connection.provider === "chatwoot") {
        const scoped = await requireGrowthService(database, env, organization.id, "chatwoot");
        await callChatwoot(scoped, `/api/v1/accounts/${encodeURIComponent(scoped.CHATWOOT_ACCOUNT_ID)}/inboxes`);
        externalApiTested = true;
      }
      const readiness = socialProviderReadiness(env, connection.provider);
      const status = missing.length ? "needs_attention" : "ready";
      const now = isoNow();
      const lastError = missing.length ? `Missing ${missing.join(", ")}.` : null;
      await database.transaction(async (trx) => {
        await trx("social_connections").where({ id: connection.id, organization_id: organization.id }).update({ status, last_verified_at: now, last_error: lastError, updated_at: now });
        await recordSocialEvent(trx, {
          organizationId: organization.id,
          connectionId: connection.id,
          userId,
          provider: connection.provider,
          eventType: "configuration_validated",
          status: missing.length ? "needs_attention" : "completed",
          summary: missing.length ? `${connection.display_name} needs configuration attention.` : `${connection.display_name} passed its secure configuration check.`,
          metadata: { credentials_complete: !missing.length, oauth_app_ready: readiness.oauth_ready },
        });
      });
      const row = await database("social_connections").where({ id: connection.id, organization_id: organization.id }).first();
      res.json({ data: {
        connection: publicSocialConnection(row),
        checks: { credentials_complete: !missing.length, encrypted_at_rest: true, tenant_isolated: true, oauth_app_ready: readiness.oauth_ready, external_api_tested: externalApiTested },
      } });
    }, logger));

    router.delete("/socials/connections/:id", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const connection = await database("social_connections").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!connection) throw new ApiError(404, "SOCIAL_CONNECTION_NOT_FOUND", "This channel connection was not found.");
      await database.transaction(async (trx) => {
        await trx("social_connections").where({ id: connection.id, organization_id: organization.id }).delete();
        await recordSocialEvent(trx, {
          organizationId: organization.id,
          connectionId: null,
          userId,
          provider: connection.provider,
          eventType: "connection_disconnected",
          summary: `${connection.display_name} was disconnected and its encrypted credential package was removed.`,
          metadata: {},
        });
      });
      res.json({ data: { id: connection.id, disconnected: true } });
    }, logger));

    router.post("/growth/publishing/sync", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const serviceEnv = await requireGrowthService(database, env, organization.id, "postiz");
      const remote = await callPostiz(serviceEnv, "/integrations");
      if (!Array.isArray(remote)) throw new ApiError(502, "POSTIZ_INVALID_RESPONSE", "Could not read your publishing channels.");
      const supported = remote.filter((item) => ["instagram", "instagram-standalone", "facebook", "tiktok"].includes(item.identifier) && item.id);
      await database.transaction(async (trx) => {
        await trx("organizations").where({ id: organization.id }).forUpdate().first();
        const existing = await trx("social_connections").where({ organization_id: organization.id });
        for (const item of supported) {
          const provider = item.identifier === "instagram-standalone" ? "instagram" : item.identifier;
          const connection = existing.find((row) => row.provider === provider && parseStoredJson(row.configuration, {}).postiz_integration_id === item.id);
          const now = isoNow();
          const values = {
            display_name: cleanText(item.name || provider, 120), external_account_id: String(item.id),
            status: item.disabled ? "needs_attention" : "ready", last_verified_at: now, updated_at: now,
            configuration: JSON.stringify({ ...parseStoredJson(connection?.configuration, {}), postiz_integration_id: item.id, managed_by: "postiz", timezone: "Asia/Riyadh" }),
          };
          if (connection) await trx("social_connections").where({ id: connection.id, organization_id: organization.id }).update(values);
          else await trx("social_connections").insert({
            id: randomUUID(), organization_id: organization.id, created_by: userId, provider, ...values,
            is_preferred: false, auth_mode: "oauth", credentials_encrypted: encryptSocialCredentials(env, {}), credential_hints: JSON.stringify({ fields_present: [], masked: {} }),
            capabilities: JSON.stringify(["publishing"]), autonomy_level: "draft_only", approval_policy: "always",
            webhook_status: "managed_by_postiz", last_connected_at: now, created_at: now,
          });
        }
      });
      res.json({ data: { synced: supported.length } });
    }, logger));

    router.get("/growth/overview", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const [brand, audiences, campaigns, content, journeys, connections] = await Promise.all([
        database("business_profiles").where({ organization_id: organization.id }).first(),
        database("audience_segments").where({ organization_id: organization.id }).orderBy("updated_at", "desc"),
        database("growth_campaigns").where({ organization_id: organization.id }).orderBy("updated_at", "desc").limit(50),
        database("content_items").where({ organization_id: organization.id }).orderBy("updated_at", "desc").limit(100),
        database("customer_journeys").where({ organization_id: organization.id }).orderBy([{ column: "stage_order", order: "desc" }, { column: "last_activity_at", order: "desc" }]).limit(250),
        database("social_connections").where({ organization_id: organization.id }).orderBy("updated_at", "desc"),
      ]);
      const funnel = GROWTH_STAGES.map((stage, index) => {
        const rows = journeys.filter((item) => item.stage === stage);
        return {
          stage,
          order: index + 1,
          count: rows.length,
          value_halalas: rows.reduce((total, item) => total + Number(item.value_halalas || 0), 0),
          customers: rows.slice(0, 8).map((item) => ({ id: item.id, display_name: item.display_name, engagement_score: item.engagement_score, next_action: item.next_action })),
        };
      });
      res.json({ data: {
        brand: serializeBusinessProfile(brand, organization.name),
        audiences: audiences.map(serializeAudience),
        campaigns: campaigns.map(serializeGrowthCampaign),
        content: content.map(serializeContentItem),
        journeys,
        funnel,
        connections: connections.map(publicSocialConnection),
        infrastructure: {
          postiz: Boolean(await growthServiceEnv(database, env, organization.id, "postiz")),
          chatwoot: Boolean(await growthServiceEnv(database, env, organization.id, "chatwoot")),
          langfuse: false,
          ai: Boolean(env.OPENAI_API_KEY),
        },
      } });
    }, logger));

    router.get("/business-persona", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const [profile, documents] = await Promise.all([
        database("business_profiles").where({ organization_id: organization.id }).first(),
        database("business_documents").where({ organization_id: organization.id }).orderBy("created_at", "desc").limit(100),
      ]);
      res.json({ data: { profile: serializeBusinessProfile(profile, organization.name), documents: documents.map(serializeBusinessDocument) } });
    }, logger));

    router.post("/business-persona/documents", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const fileName = cleanText(req.body?.file_name, 255);
      const mimeType = cleanText(req.body?.mime_type || "application/octet-stream", 160).toLowerCase();
      const encoded = String(req.body?.content_base64 || "").replace(/^data:[^;]+;base64,/, "");
      if (!fileName || !encoded) throw new ApiError(400, "DOCUMENT_REQUIRED", "Choose a portfolio file to upload.");
      const buffer = Buffer.from(encoded, "base64");
      if (!buffer.length) throw new ApiError(400, "DOCUMENT_EMPTY", `${fileName} is empty.`);
      if (buffer.length > 12 * 1024 * 1024) throw new ApiError(413, "DOCUMENT_TOO_LARGE", `${fileName} is larger than the 12 MB limit.`);
      const contentHash = createHash("sha256").update(buffer).digest("hex");
      const existing = await database("business_documents").where({ organization_id: organization.id, content_hash: contentHash }).first();
      if (existing) { res.json({ data: serializeBusinessDocument(existing) }); return; }

      const id = randomUUID();
      const schema = await getSchema();
      const files = new FilesService({ knex: database, schema, accountability: null });
      const stream = new PassThrough();
      stream.end(buffer);
      const fileId = await files.uploadOne(stream, { filename_download: fileName, title: fileName.replace(/\.[^.]+$/, ""), type: mimeType, uploaded_by: userId });
      await database("business_documents").insert({
        id, organization_id: organization.id, created_by: userId, file_id: fileId, file_name: fileName, mime_type: mimeType,
        size_bytes: buffer.length, content_hash: contentHash, status: "processing", readable_sections: JSON.stringify([]), unreadable_sections: JSON.stringify([]),
        extracted_data: JSON.stringify({}), created_at: isoNow(), updated_at: isoNow(),
      });
      try {
        const analysis = await analyzeBusinessDocument(env, { fileName, mimeType, buffer });
        await database("business_documents").where({ id, organization_id: organization.id }).update({
          status: analysis.unreadableSections.length ? "partial" : "ready", summary: analysis.summary,
          extracted_data: JSON.stringify(analysis.extractedData), readable_sections: JSON.stringify(analysis.readableSections),
          unreadable_sections: JSON.stringify(analysis.unreadableSections), error_message: null, updated_at: isoNow(),
        });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : `Wasla could not understand ${fileName}.`;
        await database("business_documents").where({ id, organization_id: organization.id }).update({
          status: "failed", error_message: message,
          unreadable_sections: JSON.stringify([{ section: "Entire file", reason: message }]), updated_at: isoNow(),
        });
      }
      const row = await database("business_documents").where({ id, organization_id: organization.id }).first();
      res.status(201).json({ data: serializeBusinessDocument(row) });
    }, logger));

    router.delete("/business-persona/documents/:id", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const row = await database("business_documents").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!row) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Portfolio file not found.");
      await database("business_documents").where({ id: row.id, organization_id: organization.id }).delete();
      if (row.file_id) {
        const schema = await getSchema();
        const files = new FilesService({ knex: database, schema, accountability: null });
        await files.deleteOne(row.file_id).catch(() => {});
      }
      res.json({ data: { id: row.id, deleted: true } });
    }, logger));

    router.post("/business-persona/confirm", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const selected = cleanStringList(req.body?.document_ids, 100, 80);
      const query = database("business_documents").where({ organization_id: organization.id }).whereIn("status", ["ready", "partial"]);
      if (selected.length) query.whereIn("id", selected);
      const documents = await query.orderBy("created_at", "asc");
      if (!documents.length) throw new ApiError(409, "NO_READABLE_DOCUMENTS", "Upload at least one readable portfolio file before building your persona.");
      const existing = await database("business_profiles").where({ organization_id: organization.id }).first();
      const base = serializeBusinessProfile(existing, organization.name);
      const merged = { ...base };
      const listFields = ["products_services", "brand_values", "target_markets", "goals", "tone_rules"];
      for (const document of documents) {
        const data = parseStoredJson(document.extracted_data, {});
        for (const key of ["company_name", "website", "industry", "description", "value_proposition", "brand_voice"]) if (data[key]) merged[key] = data[key];
        for (const key of listFields) merged[key] = [...new Set([...(merged[key] || []), ...cleanStringList(data[key])])].slice(0, 20);
      }
      const values = growthBrandValues(merged, organization.name);
      const stored = { ...values, products_services: JSON.stringify(values.products_services), brand_values: JSON.stringify(values.brand_values), target_markets: JSON.stringify(values.target_markets), goals: JSON.stringify(values.goals), tone_rules: JSON.stringify(values.tone_rules), colors: JSON.stringify(values.colors.length ? values.colors : base.colors), updated_at: isoNow() };
      let profileId = existing?.id;
      if (existing) await database("business_profiles").where({ id: existing.id, organization_id: organization.id }).update(stored);
      else { profileId = randomUUID(); await database("business_profiles").insert({ id: profileId, organization_id: organization.id, ...stored, created_at: isoNow() }); }
      await rememberConversation(database, { userId, organization }, { summary: `Business persona confirmed from ${documents.length} portfolio file(s): ${values.description || values.value_proposition || values.company_name}`, outcome: "business_persona_confirmed", confidence: Math.max(...documents.map((row) => safeInteger(parseStoredJson(row.extracted_data, {}).confidence, 25, 0, 100))) });
      const profile = await database("business_profiles").where({ id: profileId, organization_id: organization.id }).first();
      res.json({ data: { profile: serializeBusinessProfile(profile, organization.name), documents: documents.map(serializeBusinessDocument) } });
    }, logger));

    router.put("/growth/brand", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const values = growthBrandValues(req.body, organization.name);
      const existing = await database("business_profiles").where({ organization_id: organization.id }).first();
      const now = isoNow();
      const stored = {
        ...values,
        products_services: JSON.stringify(values.products_services),
        brand_values: JSON.stringify(values.brand_values),
        target_markets: JSON.stringify(values.target_markets),
        goals: JSON.stringify(values.goals),
        tone_rules: JSON.stringify(values.tone_rules),
        colors: JSON.stringify(values.colors.length ? values.colors : ["#0b0d0e", "#f4f5f2", "#a4ffcf"]),
        updated_at: now,
      };
      let id = existing?.id;
      if (existing) {
        await database("business_profiles").where({ id, organization_id: organization.id }).update(stored);
      } else {
        id = randomUUID();
        await database("business_profiles").insert({ id, organization_id: organization.id, ...stored, created_at: now });
      }
      const row = await database("business_profiles").where({ id, organization_id: organization.id }).first();
      res.json({ data: serializeBusinessProfile(row, organization.name) });
    }, logger));

    router.post("/growth/audiences", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const name = cleanText(req.body?.name, 160);
      if (!name) throw new ApiError(400, "AUDIENCE_NAME_REQUIRED", "Name this audience segment.");
      const type = String(req.body?.type || "B2B").toUpperCase();
      if (!new Set(["B2B", "B2C"]).has(type)) throw new ApiError(400, "INVALID_AUDIENCE_TYPE", "Choose B2B or B2C.");
      const channels = cleanStringList(req.body?.channels, 8, 40).filter((channel) => GROWTH_CHANNELS.has(channel));
      const row = {
        id: randomUUID(),
        organization_id: organization.id,
        created_by: userId,
        name,
        type,
        description: cleanText(req.body?.description, 6_000),
        pains: JSON.stringify(cleanStringList(req.body?.pains)),
        triggers: JSON.stringify(cleanStringList(req.body?.triggers)),
        jobs_to_be_done: JSON.stringify(cleanStringList(req.body?.jobs_to_be_done)),
        channels: JSON.stringify(channels),
        geography: JSON.stringify(cleanStringList(req.body?.geography, 20, 120)),
        estimated_size: safeInteger(req.body?.estimated_size, 0, 0, 2_000_000_000),
        status: "active",
        created_at: isoNow(),
        updated_at: isoNow(),
      };
      await database("audience_segments").insert(row);
      res.status(201).json({ data: serializeAudience(row) });
    }, logger));

    router.patch("/growth/audiences/:id", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const existing = await database("audience_segments").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!existing) throw new ApiError(404, "AUDIENCE_NOT_FOUND", "This audience segment was not found.");
      const updates = { updated_at: isoNow() };
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) updates.name = cleanText(req.body.name, 160);
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "description")) updates.description = cleanText(req.body.description, 6_000);
      for (const key of ["pains", "triggers", "jobs_to_be_done", "geography"]) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) updates[key] = JSON.stringify(cleanStringList(req.body[key]));
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "channels")) updates.channels = JSON.stringify(cleanStringList(req.body.channels, 8, 40).filter((channel) => GROWTH_CHANNELS.has(channel)));
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "estimated_size")) updates.estimated_size = safeInteger(req.body.estimated_size, 0, 0, 2_000_000_000);
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "status")) updates.status = req.body.status === "archived" ? "archived" : "active";
      await database("audience_segments").where({ id: existing.id, organization_id: organization.id }).update(updates);
      const row = await database("audience_segments").where({ id: existing.id }).first();
      res.json({ data: serializeAudience(row) });
    }, logger));

    router.post("/growth/campaigns", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const name = cleanText(req.body?.name, 180);
      const objective = cleanText(req.body?.objective, 6_000);
      if (!name || !objective) throw new ApiError(400, "CAMPAIGN_BRIEF_REQUIRED", "Add a campaign name and objective.");
      const audienceId = cleanText(req.body?.audience_segment_id, 80) || null;
      if (audienceId) {
        const audience = await database("audience_segments").where({ id: audienceId, organization_id: organization.id }).first();
        if (!audience) throw new ApiError(400, "AUDIENCE_NOT_FOUND", "Choose an audience from this workspace.");
      }
      const channels = cleanStringList(req.body?.channels, 8, 40).filter((channel) => GROWTH_CHANNELS.has(channel));
      const row = {
        id: randomUUID(), organization_id: organization.id, created_by: userId,
        name, objective, audience_segment_id: audienceId, status: "draft",
        channels: JSON.stringify(channels),
        strategy: JSON.stringify(safeJsonObject(req.body?.strategy, "Campaign strategy", 30_000)),
        metrics: JSON.stringify({ reach: 0, engagements: 0, conversations: 0, opportunities: 0, won: 0 }),
        start_at: req.body?.start_at || null, end_at: req.body?.end_at || null,
        created_at: isoNow(), updated_at: isoNow(),
      };
      await database("growth_campaigns").insert(row);
      res.status(201).json({ data: serializeGrowthCampaign(row) });
    }, logger));

    router.post("/growth/content", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const channel = cleanText(req.body?.channel, 40).toLowerCase();
      const title = cleanText(req.body?.title, 220);
      const copy = cleanText(req.body?.copy, 20_000);
      if (!GROWTH_CONTENT_CHANNELS.has(channel)) throw new ApiError(400, "INVALID_CONTENT_CHANNEL", "Choose Instagram, Facebook, or TikTok.");
      if (!title || !copy) throw new ApiError(400, "CONTENT_REQUIRED", "Add a title and post copy.");
      const row = {
        id: randomUUID(), organization_id: organization.id,
        campaign_id: cleanText(req.body?.campaign_id, 80) || null,
        connection_id: cleanText(req.body?.connection_id, 80) || null,
        created_by: userId, title, channel,
        format: cleanText(req.body?.format || "post", 40), copy,
        rationale: cleanText(req.body?.rationale, 4_000) || null,
        visual_direction: cleanText(req.body?.visual_direction, 4_000) || null,
        media: JSON.stringify(cleanContentMedia(req.body?.media)),
        status: "draft", approval_status: "pending",
        scheduled_for: req.body?.scheduled_for || null,
        postiz_post_id: null, published_at: null, error_message: null,
        created_at: isoNow(), updated_at: isoNow(),
      };
      await database("content_items").insert(row);
      res.status(201).json({ data: serializeContentItem(row) });
    }, logger));

    router.post("/growth/content/generate", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      const brandRow = await database("business_profiles").where({ organization_id: organization.id }).first();
      if (!brandRow || Number(brandRow.completion_score || 0) < 40) {
        throw new ApiError(409, "BUSINESS_PROFILE_INCOMPLETE", "Complete at least 40% of your Business DNA before generating content.");
      }
      const audienceId = cleanText(req.body?.audience_segment_id, 80);
      const audienceRow = audienceId ? await database("audience_segments").where({ id: audienceId, organization_id: organization.id }).first() : null;
      const channel = cleanText(req.body?.channel || "instagram", 40).toLowerCase();
      if (!GROWTH_CONTENT_CHANNELS.has(channel)) throw new ApiError(400, "INVALID_CONTENT_CHANNEL", "Choose Instagram, Facebook, or TikTok.");
      const brief = cleanText(req.body?.brief, 5_000);
      if (!brief) throw new ApiError(400, "CONTENT_BRIEF_REQUIRED", "Tell Wasla what this content should achieve.");
      const brand = serializeBusinessProfile(brandRow, organization.name);
      const audience = audienceRow ? serializeAudience(audienceRow) : null;
      const format = cleanText(req.body?.format || "post", 40);
      const aiDraft = await createWaslaContent(env, { brand, audience, channel, format, brief });
      const title = cleanText(aiDraft.title || brief, 220);
      const body = [cleanText(aiDraft.copy, 18_000), ...cleanStringList(aiDraft.hashtags, 20, 80).map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`)].filter(Boolean).join("\n\n");
      if (!body) throw new ApiError(502, "CONTENT_EMPTY_RESPONSE", "Wasla AI returned an empty content draft.");
      const row = {
        id: randomUUID(), organization_id: organization.id,
        campaign_id: cleanText(req.body?.campaign_id, 80) || null,
        connection_id: cleanText(req.body?.connection_id, 80) || null,
        created_by: userId, title, channel,
        format, copy: body,
        rationale: cleanText(aiDraft.rationale, 4_000) || null,
        visual_direction: cleanText(aiDraft.visual_direction, 4_000) || null,
        media: JSON.stringify(cleanContentMedia(req.body?.media)), status: "draft", approval_status: "pending",
        scheduled_for: req.body?.scheduled_for || null,
        postiz_post_id: null, published_at: null, error_message: null,
        created_at: isoNow(), updated_at: isoNow(),
      };
      await database("content_items").insert(row);
      res.status(201).json({ data: serializeContentItem(row) });
    }, logger));

    router.patch("/growth/content/:id", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const existing = await database("content_items").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!existing) throw new ApiError(404, "CONTENT_NOT_FOUND", "This content item was not found.");
      const updates = contentEditUpdates(existing, req.body);
      await assertGrowthConnection(database, organization.id, updates.connection_id, existing.channel);
      const changed = await database("content_items").where({ id: existing.id, organization_id: organization.id, updated_at: existing.updated_at }).whereIn("status", ["draft", "failed"]).update(updates);
      if (!changed) throw new ApiError(409, "CONTENT_CHANGED", "This draft changed while you were editing. Refresh and try again.");
      const row = await database("content_items").where({ id: existing.id }).first();
      res.json({ data: serializeContentItem(row) });
    }, logger));

    router.post("/growth/content/:id/publish", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const serviceEnv = await requireGrowthService(database, env, organization.id, "postiz");
      const item = await database("content_items").where({ id: req.params.id, organization_id: organization.id }).first();
      if (!item) throw new ApiError(404, "CONTENT_NOT_FOUND", "This content item was not found.");
      if (["scheduled", "published"].includes(item.status)) return res.json({ data: serializeContentItem(item) });
      if (!["draft", "failed"].includes(item.status)) throw new ApiError(409, "CONTENT_LOCKED", "This submission is pending confirmation. Check Postiz before attempting another post.");
      if (item.approval_status !== "approved") throw new ApiError(409, "CONTENT_APPROVAL_REQUIRED", "Approve this content before scheduling it.");
      if (item.format === "video_script") throw new ApiError(409, "SCRIPT_NOT_PUBLISHABLE", "Produce the video, replace the script with a caption, and change the format to Post before approval.");
      if (!item.connection_id) throw new ApiError(409, "PUBLISHING_CONNECTION_REQUIRED", "Choose a connected channel before publishing.");
      const connection = await database("social_connections").where({ id: item.connection_id, organization_id: organization.id }).first();
      if (!connection || connection.provider !== item.channel) throw new ApiError(409, "PUBLISHING_CONNECTION_INVALID", "Choose a matching channel connection.");
      const configuration = parseStoredJson(connection.configuration, {});
      const integrationId = cleanText(configuration.postiz_integration_id, 255);
      if (!integrationId) throw new ApiError(409, "POSTIZ_INTEGRATION_REQUIRED", "Add the Postiz integration ID in this channel's settings.");
      const scheduleDate = item.scheduled_for ? new Date(item.scheduled_for) : new Date(Date.now() + 10 * 60_000);
      if (!Number.isFinite(scheduleDate.getTime()) || scheduleDate.getTime() <= Date.now()) throw new ApiError(400, "INVALID_SCHEDULE_DATE", "Choose a publishing time in the future.");
      let media = cleanContentMedia(storedList(item.media));
      if (["instagram", "tiktok"].includes(item.channel) && !media.length) {
        const platform = item.channel === "tiktok" ? "TikTok" : "Instagram";
        throw new ApiError(409, "PUBLISHING_MEDIA_REQUIRED", `${platform} requires at least one public HTTPS image or video before scheduling.`);
      }
      await claimContentPublishing(database, item, organization.id);
      let submitting = false;
      try {
        const integrations = await callPostiz(serviceEnv, "/integrations");
        const integration = Array.isArray(integrations) && integrations.find((row) => row.id === integrationId && !row.disabled);
        if (!integration || ![item.channel, ...(item.channel === "instagram" ? ["instagram-standalone"] : [])].includes(integration.identifier)) {
          throw new ApiError(409, "POSTIZ_INTEGRATION_INVALID", "This channel is not available in your connected Postiz workspace.");
        }
        const uploadedMedia = [];
        for (const asset of media) {
          if (asset.id) {
            uploadedMedia.push(asset);
            continue;
          }
          const upload = await callPostiz(serviceEnv, "/upload-from-url", {
            method: "POST",
            body: JSON.stringify({ url: asset.path }),
          });
          if (!upload?.id || !upload?.path) throw new ApiError(502, "POSTIZ_UPLOAD_FAILED", "Postiz did not return a usable media asset.");
          uploadedMedia.push({ id: upload.id, path: upload.path });
        }
        media = uploadedMedia;
        if (media.length) {
          await database("content_items").where({ id: item.id, organization_id: organization.id }).update({ media: JSON.stringify(media), updated_at: isoNow() });
        }
        const settings = item.channel === "instagram"
          ? { __type: "instagram", post_type: item.format === "story" ? "story" : "post" }
          : item.channel === "tiktok"
            ? {
              __type: "tiktok",
              title: item.title.slice(0, 90),
              privacy_level: "SELF_ONLY",
              duet: false,
              stitch: false,
              comment: false,
              autoAddMusic: "no",
              brand_content_toggle: false,
              brand_organic_toggle: false,
              video_made_with_ai: false,
              content_posting_method: "UPLOAD",
            }
            : { __type: item.channel };
        submitting = true;
        const postiz = await callPostiz(serviceEnv, "/posts", {
          method: "POST",
          body: JSON.stringify({
            type: "schedule",
            date: scheduleDate.toISOString(),
            shortLink: false,
            tags: [],
            posts: [{ integration: { id: integrationId }, value: [{ content: item.copy, image: media }], settings }],
          }),
        });
        const first = Array.isArray(postiz) ? postiz[0] : postiz;
        const postId = first?.postId || first?.id;
        if (!postId) throw new ApiError(502, "POSTIZ_RECEIPT_MISSING", "Submission needs confirmation. Check Postiz before scheduling again.");
        await database("content_items").where({ id: item.id, organization_id: organization.id }).update({
          status: "scheduled", scheduled_for: scheduleDate.toISOString(), postiz_post_id: postId,
          error_message: null, updated_at: isoNow(),
        });
      } catch (error) {
        const state = publishingFailureState(submitting, error);
        await database("content_items").where({ id: item.id, organization_id: organization.id }).update({ status: state, error_message: state === "unknown" ? "Submission needs confirmation. Check Postiz before retrying to avoid a duplicate post." : cleanText(error?.message, 2_000), updated_at: isoNow() });
        throw error;
      }
      const row = await database("content_items").where({ id: item.id }).first();
      res.json({ data: serializeContentItem(row) });
    }, logger));

    router.get("/growth/inbox", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const serviceEnv = await growthServiceEnv(database, env, organization.id, "chatwoot");
      if (!serviceEnv) {
        res.json({ data: { configured: false, conversations: [] } });
        return;
      }
      const accountId = encodeURIComponent(String(serviceEnv.CHATWOOT_ACCOUNT_ID));
      const payload = await callChatwoot(serviceEnv, `/api/v1/accounts/${accountId}/conversations?status=all`);
      const rows = payload?.data?.payload || payload?.payload || [];
      res.json({ data: {
        configured: true,
        conversations: rows.slice(0, 100).map((conversation) => ({
          id: conversation.id,
          display_id: conversation.display_id,
          status: conversation.status,
          unread_count: conversation.unread_count || 0,
          last_activity_at: conversation.last_activity_at,
          contact: {
            name: conversation.meta?.sender?.name || "Customer",
            phone: conversation.meta?.sender?.phone_number || null,
            email: conversation.meta?.sender?.email || null,
            avatar: conversation.meta?.sender?.thumbnail || null,
          },
          inbox: { name: conversation.meta?.channel || conversation.inbox?.name || "Chatwoot", channel_type: conversation.meta?.channel || "channel" },
          last_message: conversation.messages?.at?.(-1)?.content || conversation.last_non_activity_message?.content || "",
        })),
      } });
    }, logger));

    router.post("/growth/inbox/:id/suggest", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const serviceEnv = await requireGrowthService(database, env, organization.id, "chatwoot");
      const accountId = encodeURIComponent(String(serviceEnv.CHATWOOT_ACCOUNT_ID));
      const conversationId = encodeURIComponent(String(req.params.id));
      const payload = await callChatwoot(serviceEnv, `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`);
      const messages = payload?.payload || payload?.data?.payload || [];
      const businessContext = await waslaBusinessContext(database, organization);
      const suggestion = await createWaslaInboxReply(env, { businessContext, messages });
      res.json({ data: { suggestion } });
    }, logger));

    router.post("/growth/inbox/:id/reply", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const serviceEnv = await requireGrowthService(database, env, organization.id, "chatwoot");
      const content = cleanText(req.body?.content, 8_000);
      if (!content) throw new ApiError(400, "REPLY_REQUIRED", "Write a reply first.");
      const accountId = encodeURIComponent(String(serviceEnv.CHATWOOT_ACCOUNT_ID));
      const conversationId = encodeURIComponent(String(req.params.id));
      const payload = await callChatwoot(serviceEnv, `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, message_type: "outgoing", private: false, content_type: "text" }),
      });
      res.status(201).json({ data: { id: payload?.id, status: payload?.status || "sent", content: payload?.content || content } });
    }, logger));

    router.post("/auth/phone/request", route(async (req, res) => {
      const { userId, profile } = await customerContext(database, req);
      if (profile.phone_verified_at) {
        res.json({ data: { status: "already_verified" } });
        return;
      }

      const recentCountRow = await database("phone_verifications")
        .where({ user_id: userId })
        .where("created_at", ">", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .count("id as count")
        .first();
      if (Number(recentCountRow?.count || 0) >= 3) {
        throw new ApiError(429, "OTP_RATE_LIMIT", "Wait a few minutes before requesting another code.");
      }

      const verificationId = randomUUID();
      const provider = env.SMS_PROVIDER || "console";
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      let codeHash = null;
      let providerReference = null;
      let devCode;

      if (provider === "twilio") {
        providerReference = await sendTwilioVerification(env, profile.phone_e164);
      } else {
        if (env.NODE_ENV === "production" && !enabled(env.SMS_DEV_EXPOSE_CODE)) {
          throw new ApiError(503, "SMS_NOT_CONFIGURED", "A production SMS provider is not configured.");
        }
        devCode = String(randomInt(100000, 1000000));
        codeHash = otpHash(env.OTP_HASH_SECRET || env.SECRET, verificationId, profile.phone_e164, devCode);
        logger.info(`Development OTP for ${profile.phone_e164}: ${devCode}`);
      }

      await database("phone_verifications").insert({
        id: verificationId,
        user_id: userId,
        phone_e164: profile.phone_e164,
        provider,
        provider_reference: providerReference,
        code_hash: codeHash,
        status: "pending",
        attempts: 0,
        expires_at: expiresAt,
        created_at: isoNow(),
      });

      res.status(202).json({
        data: {
          verification_id: verificationId,
          status: "pending",
          expires_at: expiresAt,
          ...(enabled(env.SMS_DEV_EXPOSE_CODE) && devCode ? { dev_code: devCode } : {}),
        },
      });
    }, logger));

    router.post("/auth/phone/confirm", route(async (req, res) => {
      const { userId, profile, organization } = await customerContext(database, req);
      const code = String(req.body?.code || "").trim();
      if (!/^\d{4,10}$/.test(code)) throw new ApiError(400, "INVALID_OTP", "Enter the verification code.");

      const verification = await database("phone_verifications")
        .where({ user_id: userId, status: "pending" })
        .orderBy("created_at", "desc")
        .first();
      if (!verification) throw new ApiError(400, "OTP_NOT_FOUND", "Request a new verification code.");
      if (new Date(verification.expires_at).getTime() < Date.now()) {
        await database("phone_verifications").where({ id: verification.id }).update({ status: "expired" });
        throw new ApiError(400, "OTP_EXPIRED", "This code expired. Request a new one.");
      }
      if (verification.attempts >= 5) throw new ApiError(429, "OTP_ATTEMPTS_EXCEEDED", "Request a new verification code.");

      let approved = false;
      if (verification.provider === "twilio") {
        approved = await checkTwilioVerification(env, profile.phone_e164, code);
      } else {
        const submittedHash = otpHash(env.OTP_HASH_SECRET || env.SECRET, verification.id, profile.phone_e164, code);
        approved = constantTimeEqual(submittedHash, verification.code_hash);
      }
      if (!approved) {
        await database("phone_verifications").where({ id: verification.id }).increment("attempts", 1);
        throw new ApiError(400, "OTP_INCORRECT", "That verification code is not correct.");
      }

      const result = await database.transaction(async (trx) => {
        const lockedProfile = await trx("customer_profiles").where({ id: profile.id }).forUpdate().first();
        const wallet = await trx("wallets").where({ organization_id: organization.id }).forUpdate().first();
        if (!wallet) throw new ApiError(500, "WALLET_MISSING", "Workspace wallet is missing.");

        const now = isoNow();
        if (!lockedProfile.phone_verified_at) {
          await trx("customer_profiles").where({ id: profile.id }).update({ phone_verified_at: now, updated_at: now });
        }
        await trx("phone_verifications").where({ id: verification.id }).update({ status: "verified", verified_at: now });

        const idempotencyKey = `welcome-phone:${profile.phone_e164}`;
        const existingGrant = await trx("wallet_transactions")
          .where({ organization_id: organization.id, type: "welcome_credit" })
          .first();
        let balanceHalalas = wallet.balance_halalas;
        if (!existingGrant) {
          await trx("wallet_transactions").insert({
            id: randomUUID(),
            organization_id: organization.id,
            wallet_id: wallet.id,
            type: "welcome_credit",
            amount_halalas: WELCOME_CREDIT_HALALAS,
            idempotency_key: idempotencyKey,
            reference_type: "phone_verification",
            reference_id: verification.id,
            metadata: { phone_suffix: profile.phone_e164.slice(-4) },
            created_at: now,
          });
          balanceHalalas += WELCOME_CREDIT_HALALAS;
          await trx("wallets").where({ id: wallet.id }).update({ balance_halalas: balanceHalalas, updated_at: now });
        }
        return { balanceHalalas, credited: !existingGrant };
      });

      res.json({
        data: {
          status: "verified",
          credited: result.credited,
          welcome_credit_sar: result.credited ? WELCOME_CREDIT_HALALAS / 100 : 0,
          welcome_included_leads: result.credited ? WELCOME_INCLUDED_LEADS : 0,
          balance_sar: result.balanceHalalas / 100,
        },
      });
    }, logger));

    router.post("/requests", route(async (req, res) => {
      const { userId, organization } = await customerContext(database, req);
      await assertFeature(database, { userId, organization }, "lead_agent_b2b");
      const query = String(req.body?.query || "").trim();
      if (query.length < 10) throw new ApiError(400, "QUERY_TOO_SHORT", "Describe the target lead segment in more detail.");

      const targetCount = safeInteger(req.body?.target_count, 20, 1, MAX_LEADS_PER_REQUEST);
      const idempotencyKey = String(req.headers["idempotency-key"] || req.body?.idempotency_key || randomUUID()).slice(0, 255);
      const existing = await database("lead_requests")
        .where({ organization_id: organization.id, idempotency_key: idempotencyKey })
        .first();
      if (existing) {
        res.json({ data: { ...existing, workflow_dispatched: existing.status !== "queued" } });
        return;
      }

      const wallet = await database("wallets").where({ organization_id: organization.id }).first();
      const availableCredits = Math.floor(Number(wallet?.balance_halalas || 0) / 100 * CREDITS_PER_SAR);
      if (availableCredits < targetCount * CREDITS_PER_SAR) {
        throw new ApiError(402, "INSUFFICIENT_CREDITS", `You need ${targetCount * CREDITS_PER_SAR} credits for ${targetCount} leads. Your available balance is ${availableCredits} credits.`);
      }
      const managedProvider = await database("sourcing_providers").where({ provider_type: "apify", channel: "b2b", enabled: true }).first();
      if (!env.N8N_WEBHOOK_SECRET || !(managedProvider || env.APIFY_TOKEN || env.N8N_LEAD_AGENT_WEBHOOK_URL)) {
        throw new ApiError(503, "SOURCING_UNAVAILABLE", "Lead sourcing is temporarily unavailable. No credits have been charged.");
      }

      const now = isoNow();
      const requestRow = {
        id: randomUUID(),
        organization_id: organization.id,
        created_by: userId,
        query,
        criteria: { ...req.body?.criteria, billing_mode: "per_fetched_lead" },
        target_count: targetCount,
        status: "queued",
        provider: req.body?.provider || "apify",
        idempotency_key: idempotencyKey,
        result_count: 0,
        created_at: now,
        updated_at: now,
      };

      await database.transaction(async (trx) => {
        await trx("lead_requests").insert(requestRow);
        await trx("integration_events").insert({
          id: randomUUID(),
          organization_id: organization.id,
          event_type: "lead.request.created",
          status: "pending",
          idempotency_key: `lead.request.created:${requestRow.id}`,
          payload: requestRow,
          attempts: 0,
          available_at: now,
          created_at: now,
          updated_at: now,
        });
      });

      const workflowDispatched = await dispatchToN8n(database, env, requestRow, logger);
      const sourcingDispatched = workflowDispatched || dispatchToApify(database, env, requestRow, logger);
      if (!sourcingDispatched) {
        await database("lead_requests").where({ id: requestRow.id }).update({ status: "failed", error_message: "Lead sourcing could not start. No credits were charged.", updated_at: isoNow() });
        throw new ApiError(503, "SOURCING_UNAVAILABLE", "Lead sourcing could not start. No credits were charged.");
      }
      res.status(202).json({ data: { ...requestRow, workflow_dispatched: sourcingDispatched } });
    }, logger));

    router.get("/requests", route(async (req, res) => {
      const { organization, userId } = await customerContext(database, req);
      const rows = await database("lead_requests")
        .select("id", "query", "criteria", "target_count", "status", "provider", "provider_job_id", "result_count", "error_message", "created_at", "updated_at")
        .where({ organization_id: organization.id, created_by: userId })
        .orderBy("created_at", "desc")
        .limit(100);
      const requestIds = rows.filter((row) => ["b2c", "haraj"].includes(row.provider)).map((row) => row.id);
      const campaigns = requestIds.length ? await database("b2c_campaigns").whereIn("request_id", requestIds) : [];
      const campaignByRequest = new Map(campaigns.map((campaign) => [campaign.request_id, serializeCampaign(campaign)]));
      res.json({ data: rows.map((row) => ({ ...row, b2cCampaign: campaignByRequest.get(row.id) || null })) });
    }, logger));

    router.get("/lead-runs", route(async (req, res) => {
      const { organization, userId } = await customerContext(database, req);
      const rows = await database("lead_requests")
        .select("id", "query", "criteria", "target_count", "status", "provider", "result_count", "created_at", "updated_at")
        .where({ organization_id: organization.id, created_by: userId })
        .orderBy("created_at", "desc")
        .limit(250);
      const b2cIds = rows.filter((row) => ["b2c", "haraj"].includes(String(row.provider || "").toLowerCase())).map((row) => row.id);
      const campaigns = b2cIds.length ? await database("b2c_campaigns").whereIn("request_id", b2cIds) : [];
      const campaignByRequest = new Map(campaigns.map((campaign) => [campaign.request_id, campaign]));
      res.json({ data: rows.map((row) => publicLeadRun(row, campaignByRequest.get(row.id))) });
    }, logger));

    router.get("/leads", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const limit = safeInteger(req.query.limit, 200, 1, 500);
      const resultRows = await database("lead_request_results")
        .select("lead_id")
        .where({ organization_id: organization.id })
        .whereNotNull("lead_id")
        .orderBy("created_at", "desc")
        .limit(limit * 3);
      const leadIds = [...new Set(resultRows.map((row) => row.lead_id))].slice(0, limit);
      if (!leadIds.length) {
        res.json({ data: [] });
        return;
      }
      const [rows, grants, reports] = await Promise.all([
        database("lead_inventory").whereIn("id", leadIds),
        database("lead_access_grants").select("lead_id").where({ organization_id: organization.id }).whereIn("lead_id", leadIds),
        database("lead_research_reports").select("lead_id", "status").where({ organization_id: organization.id }).whereIn("lead_id", leadIds),
      ]);
      const byId = new Map(rows
        .filter((row) => !["b2c", "haraj"].includes(String(row.source || "").toLowerCase()) || Boolean(row.phone))
        .map((row) => [row.id, row]));
      const revealed = new Set(grants.map((grant) => grant.lead_id));
      const researchStatus = new Map(reports.map((report) => [report.lead_id, report.status]));
      res.json({ data: leadIds.map((id) => byId.get(id)).filter(Boolean).map((row) => ({ ...publicLead(row, revealed.has(row.id)), research_status: researchStatus.get(row.id) || null })) });
    }, logger));

    router.get("/requests/:id", route(async (req, res) => {
      const { organization, userId } = await customerContext(database, req);
      const row = await database("lead_requests")
        .select("id", "status", "target_count", "result_count", "provider", "provider_job_id", "error_message", "created_at", "updated_at")
        .where({ id: req.params.id, organization_id: organization.id, created_by: userId }).first();
      if (!row) throw new ApiError(404, "REQUEST_NOT_FOUND", "Lead request not found.");
      const campaign = ["b2c", "haraj"].includes(row.provider) ? await database("b2c_campaigns").where({ request_id: row.id }).first() : null;
      res.json({ data: { ...row, b2cCampaign: campaign ? serializeCampaign(campaign) : null } });
    }, logger));

    router.get("/requests/:id/results", route(async (req, res) => {
      const { organization, userId } = await customerContext(database, req);
      const requestRow = await database("lead_requests").where({ id: req.params.id, organization_id: organization.id, created_by: userId }).first();
      if (!requestRow) throw new ApiError(404, "REQUEST_NOT_FOUND", "Lead request not found.");

      const limit = safeInteger(req.query.limit, 200, 1, MAX_LEADS_PER_REQUEST);
      const resultQuery = database("lead_request_results as result")
        .join("lead_inventory as lead", "lead.id", "result.lead_id")
        .select("lead.*", "result.rank", "result.status as result_status")
        .where("result.request_id", requestRow.id)
        .andWhere("result.organization_id", organization.id);
      if (["b2c", "haraj"].includes(String(requestRow.provider || "").toLowerCase())) {
        resultQuery.whereNotNull("lead.phone").whereNot("lead.phone", "");
      }
      const rows = await resultQuery
        .orderBy("result.rank", "asc")
        .limit(limit);
      const grants = await database("lead_access_grants")
        .select("lead_id")
        .where({ organization_id: organization.id })
        .whereIn("lead_id", rows.map((row) => row.id));
      const revealed = new Set(grants.map((grant) => grant.lead_id));
      res.json({ data: rows.map((row) => ({ ...publicLead(row, revealed.has(row.id)), rank: row.rank, result_status: row.result_status })) });
    }, logger));

    async function accessibleB2BLead(req) {
      const { userId, organization } = await customerContext(database, req);
      const lead = await database("lead_inventory").where({ id: req.params.id }).first();
      if (!lead) throw new ApiError(404, "LEAD_NOT_FOUND", "Lead not found.");
      if (/^(?:haraj|b2c)$/i.test(String(lead.source || ""))) throw new ApiError(400, "B2B_RESEARCH_ONLY", "Deep company research is available for B2B leads.");
      const user = await userIdentity(database, userId);
      const access = user?.admin_access ? true : await database("lead_request_results").where({ organization_id: organization.id, lead_id: lead.id }).first();
      if (!access) throw new ApiError(403, "LEAD_ACCESS_REQUIRED", "This lead is not part of your workspace.");
      return { userId, organization, lead };
    }

    router.get("/research", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const rows = await database("lead_research_reports").where({ organization_id: organization.id }).orderBy("updated_at", "desc").limit(500);
      const pending = rows.filter((row) => row.status === "researching").sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at)).slice(0, 5);
      const observed = await Promise.all(pending.map((row) => observeResearch(database, env, row)));
      const updates = new Map(observed.map((row) => [row.id, row]));
      res.json({ data: rows.map((row) => publicResearch(updates.get(row.id) || row)) });
    }, logger));

    router.get("/leads/:id/research", route(async (req, res) => {
      const { organization, lead } = await accessibleB2BLead(req);
      const row = await database("lead_research_reports").where({ organization_id: organization.id, lead_id: lead.id }).first();
      res.json({ data: publicResearch(await observeResearch(database, env, row)) });
    }, logger));

    router.post("/leads/:id/research", route(async (req, res) => {
      const { userId, organization, lead } = await accessibleB2BLead(req);
      await assertFeature(database, { userId, organization }, "lead_research_b2b");
      const row = await startResearch(database, env, organization.id, userId, lead, req.body?.refresh === true);
      res.status(row.status === "researching" ? 202 : 200).json({ data: publicResearch(row) });
    }, logger));

    router.post("/leads/:id/reveal", route(async (req, res) => {
      const { organization } = await customerContext(database, req);
      const lead = await database("lead_inventory").where({ id: req.params.id }).first();
      if (!lead) throw new ApiError(404, "LEAD_NOT_FOUND", "Lead not found.");

      const grantKey = `${organization.id}:${lead.id}`;
      const outcome = await database.transaction(async (trx) => {
        const existingGrant = await trx("lead_access_grants").where({ grant_key: grantKey }).first();
        const wallet = await trx("wallets").where({ organization_id: organization.id }).forUpdate().first();
        if (!wallet) throw new ApiError(500, "WALLET_MISSING", "Workspace wallet is missing.");
        if (existingGrant) return { charged: false, balanceHalalas: wallet.balance_halalas };
        if (wallet.balance_halalas < LEAD_REVEAL_PRICE_HALALAS) {
          throw new ApiError(402, "INSUFFICIENT_CREDIT", "There is not enough wallet credit to reveal this lead.");
        }

        const now = isoNow();
        const transactionId = randomUUID();
        await trx("wallet_transactions").insert({
          id: transactionId,
          organization_id: organization.id,
          wallet_id: wallet.id,
          type: "lead_reveal",
          amount_halalas: -LEAD_REVEAL_PRICE_HALALAS,
          idempotency_key: `lead-reveal:${grantKey}`,
          reference_type: "lead_inventory",
          reference_id: lead.id,
          metadata: { price_sar: LEAD_REVEAL_PRICE_HALALAS / 100 },
          created_at: now,
        });
        await trx("lead_access_grants").insert({
          id: randomUUID(),
          grant_key: grantKey,
          organization_id: organization.id,
          lead_id: lead.id,
          transaction_id: transactionId,
          grant_reason: "wallet_purchase",
          granted_at: now,
        });
        const balanceHalalas = wallet.balance_halalas - LEAD_REVEAL_PRICE_HALALAS;
        await trx("wallets").where({ id: wallet.id }).update({ balance_halalas: balanceHalalas, updated_at: now });
        return { charged: true, balanceHalalas };
      });

      res.json({
        data: {
          lead: publicLead(lead, true),
          charged_sar: outcome.charged ? LEAD_REVEAL_PRICE_HALALAS / 100 : 0,
          charged_credits: outcome.charged ? CREDITS_PER_SAR : 0,
          balance_sar: outcome.balanceHalalas / 100,
          balance_credits: Math.floor(outcome.balanceHalalas / 100 * CREDITS_PER_SAR),
        },
      });
    }, logger));

    router.get("/admin/leads", route(async (req, res) => {
      await adminContext(database, req);
      const page = safeInteger(req.query.page, 1, 1, 100000);
      const limit = safeInteger(req.query.limit, 24, 1, 100);
      const search = String(req.query.search || "").trim().slice(0, 120);
      const enrichment = String(req.query.enrichment || "all").slice(0, 40);
      const qualification = String(req.query.qualification || "all").slice(0, 40);
      const source = String(req.query.source || "all").slice(0, 80);
      const sortKey = String(req.query.sort || "enrichment_score");
      const sortColumns = {
        enrichment_score: "enrichment_score",
        fit_score: "fit_score",
        newest: "created_at",
        company: "company",
      };
      const sortColumn = sortColumns[sortKey] || sortColumns.enrichment_score;

      const applyFilters = (query) => {
        if (search) {
          const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
          query.where((builder) => builder
            .whereRaw("name ILIKE ?", [pattern])
            .orWhereRaw("company ILIKE ?", [pattern])
            .orWhereRaw("title ILIKE ?", [pattern])
            .orWhereRaw("email ILIKE ?", [pattern])
            .orWhereRaw("phone ILIKE ?", [pattern])
            .orWhereRaw("industry ILIKE ?", [pattern])
            .orWhereRaw("location ILIKE ?", [pattern]));
        }
        if (enrichment !== "all") query.where("enrichment_status", enrichment);
        if (qualification !== "all") query.where("qualification_status", qualification);
        if (source !== "all") query.where("source", source);
        return query;
      };

      const countRow = await applyFilters(database("lead_inventory")).count("id as count").first();
      const rows = await applyFilters(database("lead_inventory"))
        .select(
          "id", "name", "title", "company", "email", "phone", "person_image_url", "company_image_url",
          "website", "linkedin_url", "company_linkedin_url", "location", "industry", "seniority", "company_size",
          "annual_revenue", "review_score", "review_count", "source", "source_reference", "fit_score",
          "qualification_status", "enrichment_status", "enrichment_score", "enrichment_summary", "enrichment_signals",
          "last_enriched_at", "created_at", "updated_at",
        )
        .orderBy(sortColumn, sortColumn === "company" ? "asc" : "desc")
        .orderBy("company", "asc")
        .limit(limit)
        .offset((page - 1) * limit);

      const [enrichmentRows, sourceRows] = await Promise.all([
        database("lead_inventory").select("enrichment_status").count("id as count").groupBy("enrichment_status"),
        database("lead_inventory").select("source").count("id as count").groupBy("source").orderBy("count", "desc"),
      ]);
      const total = Number(countRow?.count || 0);
      res.json({
        data: rows,
        meta: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit)),
          enrichment: Object.fromEntries(enrichmentRows.map((row) => [row.enrichment_status || "unknown", Number(row.count)])),
          sources: sourceRows.map((row) => ({ value: row.source, count: Number(row.count) })),
        },
      });
    }, logger));

    router.get("/admin/features", route(async (req, res) => {
      await adminContext(database, req);
      const identifier = String(req.query.account || req.query.identifier || "").trim();
      const account = identifier ? await resolveAdminAccount(database, identifier) : null;
      const features = await effectiveFeatures(database, account ? { userId: account.user_id, organization: { id: account.organization_id } } : null);
      res.json({ data: { account, features } });
    }, logger));

    router.post("/admin/features", route(async (req, res) => {
      const admin = await adminContext(database, req);
      const key = featureKey(req.body?.key || req.body?.feature_key);
      const now = isoNow();
      const row = {
        id: randomUUID(), feature_key: key, name: String(req.body?.name || key).trim().slice(0, 160),
        description: String(req.body?.description || "").trim().slice(0, 2000) || null,
        enabled_global: req.body?.enabled_global !== false, configuration: JSON.stringify(safeJsonObject(req.body?.configuration, "Feature configuration")),
        updated_by: admin.id, created_at: now, updated_at: now,
      };
      await database("feature_flags").insert(row);
      await recordAdminAudit(database, admin, "feature.created", "feature", key, `Created feature ${row.name}.`, { enabled_global: row.enabled_global });
      res.status(201).json({ data: { ...row, configuration: parseStoredJson(row.configuration, {}) } });
    }, logger));

    router.patch("/admin/features/:key", route(async (req, res) => {
      const admin = await adminContext(database, req);
      const key = featureKey(req.params.key);
      await ensureDefaultFeatures(database);
      const existing = await database("feature_flags").where({ feature_key: key }).first();
      if (!existing) throw new ApiError(404, "FEATURE_NOT_FOUND", "Feature not found.");
      const update = { updated_by: admin.id, updated_at: isoNow() };
      if (typeof req.body?.enabled_global === "boolean") update.enabled_global = req.body.enabled_global;
      if (req.body?.name !== undefined) update.name = String(req.body.name).trim().slice(0, 160) || existing.name;
      if (req.body?.description !== undefined) update.description = String(req.body.description).trim().slice(0, 2000) || null;
      if (req.body?.configuration !== undefined) update.configuration = JSON.stringify(safeJsonObject(req.body.configuration, "Feature configuration"));
      await database("feature_flags").where({ feature_key: key }).update(update);
      await recordAdminAudit(database, admin, "feature.updated", "feature", key, `Updated ${existing.name}.`, update);
      res.json({ data: { ...existing, ...update, configuration: parseStoredJson(update.configuration ?? existing.configuration, {}) } });
    }, logger));

    router.delete("/admin/features/:key", route(async (req, res) => {
      const admin = await adminContext(database, req);
      const key = featureKey(req.params.key);
      if (DEFAULT_FEATURES[key]) throw new ApiError(409, "CORE_FEATURE_REQUIRED", "Core features can be disabled but not deleted.");
      await database.transaction(async (trx) => {
        await trx("account_feature_overrides").where({ feature_key: key }).delete();
        await trx("feature_flags").where({ feature_key: key }).delete();
      });
      await recordAdminAudit(database, admin, "feature.deleted", "feature", key, `Deleted feature ${key}.`);
      res.json({ data: { deleted: true, key } });
    }, logger));

    router.put("/admin/features/:key/override", route(async (req, res) => {
      const admin = await adminContext(database, req);
      const key = featureKey(req.params.key);
      const account = await resolveAdminAccount(database, req.body?.account || req.body?.identifier);
      const overrideKey = `${key}:${account.user_id}`;
      if (req.body?.enabled === null) {
        await database("account_feature_overrides").where({ override_key: overrideKey }).delete();
        await recordAdminAudit(database, admin, "feature.override.removed", "account", account.user_id, `Removed ${key} override for ${account.email}.`, { feature_key: key });
      } else {
        if (typeof req.body?.enabled !== "boolean") throw new ApiError(400, "OVERRIDE_VALUE_REQUIRED", "Choose enabled, disabled, or inherit global.");
        const now = isoNow();
        await database("account_feature_overrides").insert({
          id: randomUUID(), override_key: overrideKey, feature_key: key, organization_id: account.organization_id,
          user_id: account.user_id, enabled: req.body.enabled,
          configuration: JSON.stringify(safeJsonObject(req.body?.configuration, "Override configuration")),
          updated_by: admin.id, created_at: now, updated_at: now,
        }).onConflict("override_key").merge({ enabled: req.body.enabled, configuration: JSON.stringify(safeJsonObject(req.body?.configuration, "Override configuration")), updated_by: admin.id, updated_at: now });
        await recordAdminAudit(database, admin, "feature.override.updated", "account", account.user_id, `${req.body.enabled ? "Enabled" : "Disabled"} ${key} for ${account.email}.`, { feature_key: key });
      }
      const features = await effectiveFeatures(database, { userId: account.user_id, organization: { id: account.organization_id } });
      res.json({ data: { account, features } });
    }, logger));

    router.get("/admin/providers", route(async (req, res) => {
      await adminContext(database, req);
      const rows = await database("sourcing_providers").select("id", "provider_key", "name", "channel", "provider_type", "actor_id", "token_hint", "configuration", "enabled", "priority", "created_at", "updated_at").orderBy("priority", "asc");
      res.json({ data: rows.map((row) => ({ ...row, has_token: Boolean(row.token_hint), configuration: parseStoredJson(row.configuration, {}) })) });
    }, logger));

    router.post("/admin/providers", route(async (req, res) => {
      const admin = await adminContext(database, req);
      const key = featureKey(req.body?.key || req.body?.provider_key);
      const actorId = String(req.body?.actor_id || "").trim().slice(0, 255);
      const token = String(req.body?.token || "").trim();
      if (!actorId || !token) throw new ApiError(400, "PROVIDER_CREDENTIALS_REQUIRED", "Add the Apify actor ID and API token.");
      const now = isoNow();
      const row = {
        id: randomUUID(), provider_key: key, name: String(req.body?.name || key).trim().slice(0, 160), channel: req.body?.channel === "b2c" ? "b2c" : "b2b",
        provider_type: "apify", actor_id: actorId, token_encrypted: encryptSocialCredentials(env, { token }), token_hint: `••••${token.slice(-4)}`,
        configuration: JSON.stringify(safeJsonObject(req.body?.configuration, "Provider configuration")), enabled: req.body?.enabled !== false,
        priority: safeInteger(req.body?.priority, 100, 1, 10_000), updated_by: admin.id, created_at: now, updated_at: now,
      };
      await database("sourcing_providers").insert(row);
      await recordAdminAudit(database, admin, "provider.created", "provider", key, `Added Apify route ${row.name}.`, { actor_id: actorId, channel: row.channel });
      res.status(201).json({ data: { ...row, token_encrypted: undefined, has_token: true, configuration: parseStoredJson(row.configuration, {}) } });
    }, logger));

    router.patch("/admin/providers/:id", route(async (req, res) => {
      const admin = await adminContext(database, req);
      const existing = await database("sourcing_providers").where({ id: req.params.id }).first();
      if (!existing) throw new ApiError(404, "PROVIDER_NOT_FOUND", "Sourcing provider not found.");
      const update = { updated_by: admin.id, updated_at: isoNow() };
      if (req.body?.name !== undefined) update.name = String(req.body.name).trim().slice(0, 160) || existing.name;
      if (req.body?.actor_id !== undefined) update.actor_id = String(req.body.actor_id).trim().slice(0, 255) || existing.actor_id;
      if (typeof req.body?.enabled === "boolean") update.enabled = req.body.enabled;
      if (req.body?.priority !== undefined) update.priority = safeInteger(req.body.priority, existing.priority, 1, 10_000);
      if (req.body?.configuration !== undefined) update.configuration = JSON.stringify(safeJsonObject(req.body.configuration, "Provider configuration"));
      const token = String(req.body?.token || "").trim();
      if (token) Object.assign(update, { token_encrypted: encryptSocialCredentials(env, { token }), token_hint: `••••${token.slice(-4)}` });
      await database("sourcing_providers").where({ id: existing.id }).update(update);
      await recordAdminAudit(database, admin, "provider.updated", "provider", existing.provider_key, `Updated Apify route ${existing.name}.`, { actor_id: update.actor_id || existing.actor_id, enabled: update.enabled ?? existing.enabled });
      res.json({ data: { ...existing, ...update, token_encrypted: undefined, has_token: Boolean(update.token_hint || existing.token_hint), configuration: parseStoredJson(update.configuration ?? existing.configuration, {}) } });
    }, logger));

    router.delete("/admin/providers/:id", route(async (req, res) => {
      const admin = await adminContext(database, req);
      const existing = await database("sourcing_providers").where({ id: req.params.id }).first();
      if (!existing) throw new ApiError(404, "PROVIDER_NOT_FOUND", "Sourcing provider not found.");
      await database("sourcing_providers").where({ id: existing.id }).delete();
      await recordAdminAudit(database, admin, "provider.deleted", "provider", existing.provider_key, `Removed Apify route ${existing.name}.`);
      res.json({ data: { deleted: true, id: existing.id } });
    }, logger));

    router.get("/admin/accounts", route(async (req, res) => {
      await adminContext(database, req);
      const rows = await database("customer_profiles as profile")
        .join("directus_users as user", "user.id", "profile.user_id")
        .join("organizations as organization", "organization.id", "profile.organization_id")
        .leftJoin("wallets as wallet", "wallet.organization_id", "organization.id")
        .select(
          "user.id as user_id", "user.email", "user.first_name", "user.last_name",
          "organization.id as organization_id", "organization.name as organization_name", "organization.status",
          "profile.phone_e164", "profile.phone_verified_at", "wallet.balance_halalas", "profile.created_at",
        )
        .orderBy("profile.created_at", "desc")
        .limit(500);
      const data = await Promise.all(rows.map(async (row) => {
        const [leadCount, chatCount] = await Promise.all([
          database("lead_request_results").where({ organization_id: row.organization_id }).countDistinct("lead_id as count").first(),
          database("chat_logs").where({ organization_id: row.organization_id, user_id: row.user_id }).count("id as count").first(),
        ]);
        const balanceHalalas = Number(row.balance_halalas || 0);
        return {
          ...row,
          balance_sar: balanceHalalas / 100,
          credits: Math.floor(balanceHalalas / 100 * CREDITS_PER_SAR),
          generated_leads: Number(leadCount?.count || 0),
          chat_turns: Number(chatCount?.count || 0),
        };
      }));
      res.json({ data });
    }, logger));

    router.post("/admin/credits/grant", route(async (req, res) => {
      await adminContext(database, req);
      const userEmail = normalizeEmail(req.body?.user_email || req.body?.email);
      const credits = safeInteger(req.body?.credits, 0, 1, 1_000_000);
      const reason = String(req.body?.reason || "").trim();
      if (!credits) throw new ApiError(400, "CREDITS_REQUIRED", "Enter a positive credit amount.");
      if (reason.length < 3) throw new ApiError(400, "GRANT_REASON_REQUIRED", "Add a reason for this credit grant.");
      const grants = new ItemsService("credit_grants", { schema: await getSchema(), accountability: req.accountability });
      const grantId = await grants.createOne({ user_email: userEmail, credits, reason, status: "pending", amount_halalas: 0 });
      let grant = await database("credit_grants").where({ id: grantId }).first();
      for (let attempt = 0; grant?.status === "pending" && attempt < 10; attempt += 1) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
        grant = await database("credit_grants").where({ id: grantId }).first();
      }
      res.status(201).json({ data: grant });
    }, logger));

    router.post("/admin/credits/adjust", route(async (req, res) => {
      const admin = await adminContext(database, req);
      const creditsDelta = safeInteger(req.body?.credits_delta ?? req.body?.credits, 0, -1_000_000, 1_000_000);
      const reason = String(req.body?.reason || "").trim().slice(0, 1000);
      const scope = req.body?.scope === "global" ? "global" : "account";
      if (!creditsDelta) throw new ApiError(400, "CREDIT_ADJUSTMENT_REQUIRED", "Enter a positive or negative credit adjustment.");
      if (reason.length < 3) throw new ApiError(400, "ADJUSTMENT_REASON_REQUIRED", "Add a reason for this adjustment.");
      const accounts = scope === "global"
        ? await database("customer_profiles as profile")
          .join("directus_users as user", "user.id", "profile.user_id")
          .select("profile.user_id", "profile.organization_id", "user.email")
        : [await resolveAdminAccount(database, req.body?.account || req.body?.identifier)];
      if (!accounts.length) throw new ApiError(404, "NO_ACCOUNTS", "There are no customer accounts to adjust.");
      const results = [];
      for (const account of accounts) {
        const outcome = await database.transaction(async (trx) => {
          const wallet = await trx("wallets").where({ organization_id: account.organization_id }).forUpdate().first();
          if (!wallet) throw new ApiError(409, "WALLET_MISSING", `The wallet for ${account.email || account.user_id} is missing.`);
          const current = Number(wallet.balance_halalas || 0);
          const requestedHalalas = creditsDelta * 10;
          const next = Math.max(0, current + requestedHalalas);
          const actualHalalas = next - current;
          const now = isoNow();
          if (actualHalalas) {
            await trx("wallet_transactions").insert({
              id: randomUUID(), organization_id: account.organization_id, wallet_id: wallet.id,
              type: "admin_credit_adjustment", amount_halalas: actualHalalas,
              idempotency_key: `admin-credit:${randomUUID()}`, reference_type: "directus_users", reference_id: account.user_id,
              metadata: { requested_credits: creditsDelta, actual_credits: actualHalalas / 10, reason, admin_user_id: admin.id, scope },
              created_at: now,
            });
            await trx("wallets").where({ id: wallet.id }).update({ balance_halalas: next, updated_at: now });
          }
          return { user_id: account.user_id, email: account.email, organization_id: account.organization_id, credits_before: current / 10, credits_after: next / 10, credits_changed: actualHalalas / 10 };
        });
        results.push(outcome);
      }
      await recordAdminAudit(database, admin, "credits.adjusted", scope, scope === "global" ? "all" : results[0]?.user_id, `${creditsDelta > 0 ? "Added" : "Removed"} ${Math.abs(creditsDelta)} credits ${scope === "global" ? "for all accounts" : `for ${results[0]?.email}`}.`, { credits_delta: creditsDelta, reason, affected_accounts: results.length });
      res.json({ data: { scope, credits_delta: creditsDelta, affected_accounts: results.length, accounts: results } });
    }, logger));

    router.get("/admin/generated-leads", route(async (req, res) => {
      await adminContext(database, req);
      const page = safeInteger(req.query.page, 1, 1, 100000);
      const limit = safeInteger(req.query.limit, 50, 1, 100);
      const organizationId = String(req.query.organization_id || "").trim();
      const userId = String(req.query.user_id || "").trim();
      const email = String(req.query.email || "").trim().toLowerCase();
      const baseQuery = () => database("lead_request_results as result")
        .join("lead_inventory as lead", "lead.id", "result.lead_id")
        .join("lead_requests as request", "request.id", "result.request_id")
        .join("organizations as organization", "organization.id", "result.organization_id")
        .leftJoin("directus_users as account_user", "account_user.id", "request.created_by")
        .modify((query) => {
          if (organizationId) query.where("result.organization_id", organizationId);
          if (userId) query.where("request.created_by", userId);
          if (email) query.whereRaw("LOWER(account_user.email) = ?", [email]);
        });
      const countRow = await baseQuery().count("result.id as count").first();
      const rows = await baseQuery().select(
        "result.id", "result.organization_id", "organization.name as organization_name",
        "request.created_by as user_id", "account_user.email as user_email", "request.id as request_id", "request.query as request_query",
        "lead.id as lead_id", "lead.name", "lead.title", "lead.company", "lead.email", "lead.phone", "lead.location", "lead.industry",
        "lead.source", "lead.fit_score", "lead.qualification_status", "lead.enrichment_summary", "result.rank", "result.status", "result.created_at",
      ).orderBy("result.created_at", "desc").limit(limit).offset((page - 1) * limit);
      const total = Number(countRow?.count || 0);
      res.json({ data: rows, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
    }, logger));

    router.get("/admin/chat-logs", route(async (req, res) => {
      await adminContext(database, req);
      const page = safeInteger(req.query.page, 1, 1, 100000);
      const limit = safeInteger(req.query.limit, 50, 1, 100);
      const organizationId = String(req.query.organization_id || "").trim();
      const userId = String(req.query.user_id || "").trim();
      const conversationId = String(req.query.conversation_id || "").trim();
      const email = String(req.query.email || "").trim().toLowerCase();
      const applyFilters = (query) => {
        if (organizationId) query.where("organization_id", organizationId);
        if (userId) query.where("user_id", userId);
        if (conversationId) query.where("conversation_id", conversationId);
        if (email) query.whereRaw("LOWER(user_email) = ?", [email]);
        return query;
      };
      const countRow = await applyFilters(database("chat_logs")).count("id as count").first();
      const rows = await applyFilters(database("chat_logs"))
        .select("id", "organization_id", "user_id", "user_email", "conversation_id", "lead_type", "deal_intent", "understood_data", "outcome", "mode", "language", "message", "response", "status", "error_message", "created_at")
        .orderBy("created_at", "desc").limit(limit).offset((page - 1) * limit);
      const total = Number(countRow?.count || 0);
      res.json({ data: rows.map((row) => ({ ...row, understood_data: parseStoredJson(row.understood_data, {}) })), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
    }, logger));

    router.get("/admin/memory", route(async (req, res) => {
      await adminContext(database, req);
      const identifier = String(req.query.account || req.query.identifier || "").trim();
      const account = identifier ? await resolveAdminAccount(database, identifier) : null;
      const query = database("ai_account_memory as memory")
        .leftJoin("organizations as organization", "organization.id", "memory.organization_id")
        .select("memory.*", "organization.name as organization_name")
        .orderBy("memory.updated_at", "desc").limit(500);
      if (account) query.where("memory.user_id", account.user_id);
      const rows = await query;
      res.json({ data: rows.map((row) => ({ ...row, understood_data: parseStoredJson(row.understood_data, {}) })) });
    }, logger));

    router.get("/admin/b2c-campaigns", route(async (req, res) => {
      await adminContext(database, req);
      const identifier = String(req.query.account || req.query.identifier || "").trim();
      const account = identifier ? await resolveAdminAccount(database, identifier) : null;
      const query = database("b2c_campaigns as campaign")
        .leftJoin("directus_users as user", "user.id", "campaign.user_id")
        .leftJoin("organizations as organization", "organization.id", "campaign.organization_id")
        .select("campaign.id", "campaign.organization_id", "organization.name as organization_name", "campaign.user_id", "user.email as user_email", "user.first_name", "user.last_name", "campaign.request_id", "campaign.name", "campaign.original_prompt", "campaign.status", "campaign.target_lead_count", "campaign.stats", "campaign.intent", "campaign.acquisition_plan", "campaign.sourcing_explanation", "campaign.created_at", "campaign.updated_at")
        .orderBy("campaign.created_at", "desc").limit(500);
      if (account) query.where("campaign.user_id", account.user_id);
      const rows = await query;
      res.json({ data: rows.map((row) => {
        const intent = parseStoredJson(row.intent, {});
        const stats = parseStoredJson(row.stats, {});
        const acquisitionPlan = parseStoredJson(row.acquisition_plan, {});
        const pageLimit = safeInteger(env.HARAJ_MAX_PAGES_PER_STRATEGY, 3, 1, 20);
        const resultLimit = safeInteger(env.HARAJ_DEFAULT_LIMIT, 50, 1, 100);
        return {
          ...row,
          username: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.user_email || "Unknown account",
          public_explanation: buildPublicB2CExplanation(row),
          target_count: Number(row.target_lead_count || 0), delivered_count: Number(stats.uniqueLeads || stats.unique_leads || 0),
          deal_intent: intent.dealIntent || intent.deal_intent || "sell", intent, acquisition_plan: acquisitionPlan,
          internal_audit: {
            algorithm: "Wasla B2C Intent-to-Signal Engine v2",
            source_api: env.HARAJ_POSTS_URL || env.HARAJ_GRAPHQL_BASE_URL || null,
            contact_api: env.HARAJ_POST_CONTACT_URL || env.HARAJ_GRAPHQL_BASE_URL || null,
            api_operations: ["FetchAds", "PostContactQuery"],
            api_queries: (acquisitionPlan.strategies || []).map((strategy) => ({
              tag: strategy.tagName, cities: strategy.cities || [], strategy_type: strategy.strategyType,
              weight: strategy.weight, pages: pageLimit, results_per_page: resultLimit,
            })),
            qualification_thresholds: acquisitionPlan.qualification || {},
            stages: [
              "Translate the offer into buyer/owner intent and exclusion signals",
              "Map signals to validated Saudi marketplace taxonomy tags",
              "Fetch recent public listings by tag and city",
              "Classify marketplace role and score identity, purchase propensity, evidence, recency, activity and geography",
              "Reject sellers, resellers, competitors and weak matches for sell campaigns",
              "Resolve contact details only for qualified candidates",
              "Deduplicate by phone or account identity and save the lead to the requesting workspace",
            ],
            stats,
            sourcing_explanation: parseStoredJson(row.sourcing_explanation, row.sourcing_explanation || null),
          },
        };
      }) });
    }, logger));

    router.get("/admin/b2c-campaigns/:id/leads", route(async (req, res) => {
      await adminContext(database, req);
      const campaign = await database("b2c_campaigns")
        .select("id", "name", "organization_id", "user_id")
        .where({ id: req.params.id })
        .first();
      if (!campaign) throw new ApiError(404, "B2C_CAMPAIGN_NOT_FOUND", "B2C campaign not found.");
      const rows = await database("b2c_leads as lead")
        .leftJoin("lead_inventory as inventory", "inventory.id", "lead.inventory_id")
        .select(
          "lead.id", "lead.inventory_id", "lead.author_id", "lead.author_username", "lead.phone", "lead.city",
          "lead.score", "lead.tier", "lead.marketplace_role", "lead.explanation", "lead.evidence", "lead.status",
          "lead.created_at", "inventory.name", "inventory.company", "inventory.qualification_status",
        )
        .where("lead.campaign_id", campaign.id)
        .orderBy("lead.score", "desc")
        .limit(500);
      res.json({ data: rows.map((row) => ({
        id: row.id,
        inventory_id: row.inventory_id,
        display_name: row.name || row.author_username || row.company || `B2C lead ${row.author_id || ""}`.trim(),
        author_username: row.author_username,
        phone: row.phone,
        city: row.city,
        score: Number(row.score || 0),
        tier: row.tier,
        marketplace_role: row.marketplace_role,
        explanation: row.explanation,
        status: row.status,
        qualification_status: row.qualification_status,
        advertisements: (Array.isArray(parseStoredJson(row.evidence, [])) ? parseStoredJson(row.evidence, []) : []).map((evidence) => ({
          post_id: evidence.postId || null,
          title: cleanText(evidence.title, 500),
          body: cleanText(evidence.bodyText, 12_000),
          url: cleanText(evidence.url, 2_000),
          tags: cleanStringList(evidence.tags, 30, 120),
          city: cleanText(evidence.city, 160),
          matched_signals: cleanStringList(evidence.matchedSignals, 20, 240),
          strategy_type: cleanText(evidence.strategyType, 80),
          strategy_weight: Number(evidence.strategyWeight || 0),
        })),
        created_at: row.created_at,
      })) });
    }, logger));

    router.get("/admin/b2c-campaigns/:id/activity", route(async (req, res) => {
      await adminContext(database, req);
      const campaign = await database("b2c_campaigns")
        .select("id", "name", "organization_id", "user_id", "status", "stats")
        .where({ id: req.params.id })
        .first();
      if (!campaign) throw new ApiError(404, "B2C_CAMPAIGN_NOT_FOUND", "B2C campaign not found.");
      const rows = await database("b2c_candidates")
        .select("id", "post_id", "author_id", "author_username", "title", "body_text", "city", "tags", "strategy", "qualification", "status", "raw_payload", "created_at", "updated_at")
        .where({ campaign_id: campaign.id })
        .orderBy("created_at", "asc")
        .limit(2_000);
      const activity = rows.map((row) => {
        const raw = parseStoredJson(row.raw_payload, {});
        const strategy = parseStoredJson(row.strategy, {});
        const qualification = parseStoredJson(row.qualification, {});
        const candidateStatus = String(row.status || "").toUpperCase();
        const contactAttempted = ["REJECTED_NO_PHONE", "QUALIFIED", "DELIVERED"].includes(candidateStatus);
        const contactOutcome = candidateStatus === "REJECTED_NO_PHONE"
          ? "no_verified_phone"
          : candidateStatus === "REJECTED_CACHED_NO_PHONE"
            ? "cached_no_phone"
            : candidateStatus === "REJECTED_DUPLICATE_SELLER"
              ? "duplicate_seller_skipped"
              : contactAttempted
                ? "phone_resolved"
                : "not_qualified";
        return {
          id: row.id,
          fetched_ad: {
            operation: "FetchAds",
            post_id: row.post_id,
            title: cleanText(row.title, 500),
            body: cleanText(row.body_text, 12_000),
            url: cleanText(raw.URL || raw.url, 2_000),
            city: cleanText(row.city || raw.city || raw.geoCity, 160),
            tags: cleanStringList(parseStoredJson(row.tags, []), 30, 120),
            author_username: cleanText(row.author_username, 160),
          },
          request: {
            tag: cleanText(strategy.tagName, 160),
            strategy_type: cleanText(strategy.strategyType, 80),
            weight: Number(strategy.weight || 0),
          },
          qualification: {
            status: row.status,
            score: Number(qualification.score || 0),
            marketplace_role: cleanText(qualification.marketplaceRole, 80),
            explanation: cleanText(qualification.explanation, 1_500),
            matched_signals: cleanStringList(qualification.matchedSignals, 20, 240),
            rejection_reasons: cleanStringList(qualification.rejectionReasons, 20, 240),
          },
          contact_call: contactAttempted ? {
            operation: "PostContactQuery",
            attempted: true,
            outcome: contactOutcome,
          } : { operation: "PostContactQuery", attempted: false, outcome: contactOutcome },
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      });
      const distinctSellers = new Set(rows.map((row) => row.author_id || row.author_username || `post:${row.post_id}`));
      res.json({ data: {
        campaign: { id: campaign.id, name: campaign.name, status: campaign.status, stats: parseStoredJson(campaign.stats, {}) },
        summary: {
          ads_returned: rows.length,
          unique_sellers: distinctSellers.size,
          contact_attempts: activity.filter((item) => item.contact_call.attempted).length,
          phones_resolved: activity.filter((item) => item.contact_call.outcome === "phone_resolved").length,
          rejected_without_phone: activity.filter((item) => item.contact_call.outcome === "no_verified_phone").length,
        },
        activity,
      } });
    }, logger));

    router.post("/admin/b2c-campaigns/:id/run", route(async (req, res) => {
      await adminContext(database, req);
      const campaign = await database("b2c_campaigns").where({ id: req.params.id }).first();
      if (!campaign) throw new ApiError(404, "B2C_CAMPAIGN_NOT_FOUND", "B2C campaign not found.");
      if (["RUNNING", "QUEUED"].includes(campaign.status)) {
        res.status(202).json({ data: serializeCampaign(campaign) });
        return;
      }
      const refreshedPlanning = await validateB2CPlan(env, campaign.original_prompt, {
        intent: parseStoredJson(campaign.intent, {}), acquisitionPlan: parseStoredJson(campaign.acquisition_plan, {}),
      });
      const now = isoNow();
      await database("b2c_campaigns").where({ id: campaign.id }).update({ status: "QUEUED", intent: JSON.stringify(refreshedPlanning.intent), acquisition_plan: JSON.stringify(refreshedPlanning.acquisitionPlan), error_message: null, updated_at: now });
      await database("lead_requests").where({ id: campaign.request_id }).update({ status: "sourcing", error_message: null, updated_at: now });
      setImmediate(() => runB2CCampaign({ database, env, campaignId: campaign.id, logger }).catch(() => undefined));
      res.status(202).json({ data: serializeCampaign({ ...campaign, intent: refreshedPlanning.intent, acquisition_plan: refreshedPlanning.acquisitionPlan, status: "QUEUED", updated_at: now }) });
    }, logger));

    router.get("/admin/audit", route(async (req, res) => {
      await adminContext(database, req);
      const limit = safeInteger(req.query.limit, 100, 1, 500);
      const rows = await database("admin_audit_logs").select("id", "admin_user_id", "action", "target_type", "target_id", "summary", "metadata", "created_at").orderBy("created_at", "desc").limit(limit);
      res.json({ data: rows.map((row) => ({ ...row, metadata: parseStoredJson(row.metadata, {}) })) });
    }, logger));

    router.post("/integrations/leads", route(async (req, res) => {
      requireWorkflowSecret(req, env);
      const requestId = String(req.body?.request_id || "");
      const incomingLeads = Array.isArray(req.body?.leads) ? req.body.leads.slice(0, 500) : [];
      const requestRow = await database("lead_requests").where({ id: requestId }).first();
      if (!requestRow) throw new ApiError(404, "REQUEST_NOT_FOUND", "Lead request not found.");
      if (!incomingLeads.length) throw new ApiError(400, "LEADS_REQUIRED", "No leads were supplied.");

      const [requestUser, requestOrganization] = await Promise.all([
        database("directus_users").select("email").where({ id: requestRow.created_by }).first(),
        database("organizations").select("name").where({ id: requestRow.organization_id }).first(),
      ]);

      const callCandidates = [];
      await database.transaction(async (trx) => {
        // Serialize repeated callbacks and charge only new, delivered workspace leads.
        await trx("lead_requests").where({ id: requestRow.id }).forUpdate().first();
        const criteria = typeof requestRow.criteria === "string" ? JSON.parse(requestRow.criteria) : requestRow.criteria;
        const billOnDelivery = criteria?.billing_mode === "per_fetched_lead";
        const wallet = billOnDelivery ? await trx("wallets").where({ organization_id: requestRow.organization_id }).forUpdate().first() : null;
        const priorCount = await trx("lead_request_results").where({ request_id: requestRow.id }).count("id as count").first();
        let rank = Number(priorCount?.count || 0);
        let balance = Number(wallet?.balance_halalas || 0);
        for (const incoming of incomingLeads) {
          const fingerprint = leadFingerprint(incoming);
          const priorLead = await trx("lead_inventory").where({ fingerprint }).first();
          if (priorLead && await trx("lead_request_results").where({ result_key: `${requestRow.id}:${priorLead.id}` }).first()) continue;
          if (rank >= requestRow.target_count) break;
          rank += 1;
          const now = isoNow();
          const normalized = {
            name: String(incoming.name || "").trim() || null,
            title: String(incoming.title || "").trim() || null,
            company: String(incoming.company || incoming.name || "Unknown company").trim(),
            company_normalized: String(incoming.company || incoming.name || "unknown").trim().toLowerCase(),
            email: String(incoming.email || "").trim().toLowerCase() || null,
            phone: incoming.phone ? normalizePhone(incoming.phone) : null,
            person_image_url: String(incoming.person_image_url || "").trim() || null,
            company_image_url: String(incoming.company_image_url || "").trim() || null,
            website: String(incoming.website || "").trim() || null,
            linkedin_url: String(incoming.linkedin_url || "").trim() || null,
            company_linkedin_url: String(incoming.company_linkedin_url || "").trim() || null,
            location: String(incoming.location || "").trim() || null,
            industry: String(incoming.industry || "").trim() || null,
            seniority: String(incoming.seniority || "").trim() || null,
            company_size: incoming.company_size ? safeInteger(incoming.company_size, null, 0, 10000000) : null,
            annual_revenue: String(incoming.annual_revenue || "").trim() || null,
            review_score: String(incoming.review_score || "").trim() || null,
            review_count: incoming.review_count ? safeInteger(incoming.review_count, null, 0, 100000000) : null,
            source: String(incoming.source || requestRow.provider || "workflow").slice(0, 80),
            source_reference: String(incoming.source_reference || incoming.id || "").slice(0, 255) || null,
            fit_score: safeInteger(incoming.fit_score, 0, 0, 100),
            qualification_status: String(incoming.qualification_status || "unqualified").slice(0, 40),
            enrichment_status: String(incoming.enrichment_status || "raw").slice(0, 40),
            enrichment_score: safeInteger(incoming.enrichment_score, 0, 0, 100),
            enrichment_summary: String(incoming.enrichment_summary || "").trim() || null,
            enrichment_signals: JSON.stringify(Array.isArray(incoming.enrichment_signals) ? incoming.enrichment_signals : []),
            raw_payload: JSON.stringify(incoming),
            last_enriched_at: now,
            updated_at: now,
          };

          let lead = await trx("lead_inventory").where({ fingerprint }).first();
          if (lead) {
            await trx("lead_inventory").where({ id: lead.id }).update(normalized);
            lead = { ...lead, ...normalized };
          } else {
            lead = { id: randomUUID(), fingerprint, ...normalized, created_at: now };
            await trx("lead_inventory").insert(lead);
          }

          const resultKey = `${requestRow.id}:${lead.id}`;
          const existingResult = await trx("lead_request_results").where({ result_key: resultKey }).first();
          if (!existingResult) {
            const grantKey = `${requestRow.organization_id}:${lead.id}`;
            const grant = billOnDelivery ? await trx("lead_access_grants").where({ grant_key: grantKey }).first() : null;
            if (billOnDelivery && !grant) {
              if (!wallet || balance < LEAD_REVEAL_PRICE_HALALAS) {
                throw new ApiError(402, "INSUFFICIENT_CREDITS", "Your balance changed while sourcing. This batch was not charged. Add credits and try again.");
              }
              const transactionId = randomUUID();
              await trx("wallet_transactions").insert({
                id: transactionId, organization_id: requestRow.organization_id, wallet_id: wallet.id,
                type: "lead_fetch", amount_halalas: -LEAD_REVEAL_PRICE_HALALAS,
                idempotency_key: `lead-fetch:${grantKey}`, reference_type: "lead_inventory", reference_id: lead.id,
                metadata: { credits: CREDITS_PER_SAR, price_sar: 1, request_id: requestRow.id }, created_at: now,
              });
              await trx("lead_access_grants").insert({
                id: randomUUID(), grant_key: grantKey, organization_id: requestRow.organization_id,
                lead_id: lead.id, transaction_id: transactionId, grant_reason: "lead_request", granted_at: now,
              });
              balance -= LEAD_REVEAL_PRICE_HALALAS;
            }
            await trx("lead_request_results").insert({
              id: randomUUID(),
              result_key: resultKey,
              organization_id: requestRow.organization_id,
              organization_name: requestOrganization?.name || null,
              request_id: requestRow.id,
              request_query: requestRow.query,
              user_id: requestRow.created_by,
              user_email: requestUser?.email || null,
              lead_id: lead.id,
              rank,
              preview: { company: lead.company, title: lead.title, location: lead.location, industry: lead.industry },
              status: "available",
              created_at: now,
            });
          }
          if (lead.phone) callCandidates.push({ lead_id: lead.id, phone: lead.phone, company: lead.company, name: lead.name });
        }

        if (wallet) await trx("wallets").where({ id: wallet.id }).update({ balance_halalas: balance, updated_at: isoNow() });

        const resultCountRow = await trx("lead_request_results").where({ request_id: requestRow.id }).count("id as count").first();
        await trx("lead_requests").where({ id: requestRow.id }).update({
          status: "sourced",
          result_count: Number(resultCountRow?.count || 0),
          provider_job_id: req.body?.provider_job_id || requestRow.provider_job_id,
          updated_at: isoNow(),
        });
      });

      res.status(202).json({ data: { request_id: requestId, ingested: incomingLeads.length, call_candidates: callCandidates } });
    }, logger));

    router.post("/integrations/calls", route(async (req, res) => {
      requireWorkflowSecret(req, env);
      const requestRow = await database("lead_requests").where({ id: req.body?.request_id }).first();
      const lead = await database("lead_inventory").where({ id: req.body?.lead_id }).first();
      if (!requestRow || !lead) throw new ApiError(404, "CALL_CONTEXT_NOT_FOUND", "Request or lead not found.");
      const providerCallId = String(req.body?.provider_call_id || "").trim();
      if (!providerCallId) throw new ApiError(400, "CALL_ID_REQUIRED", "Provider call ID is required.");

      const existing = await database("call_attempts").where({ provider_call_id: providerCallId }).first();
      if (existing) {
        res.json({ data: existing });
        return;
      }
      const row = {
        id: randomUUID(),
        organization_id: requestRow.organization_id,
        request_id: requestRow.id,
        lead_id: lead.id,
        provider: "vapi",
        provider_call_id: providerCallId,
        attempt_number: safeInteger(req.body?.attempt_number, 1, 1, 10),
        status: String(req.body?.status || "queued").slice(0, 50),
        phone: lead.phone,
        cost_halalas: 0,
        provider_cost_micros: 0,
        provider_cost_currency: "USD",
        raw_payload: req.body,
        created_at: isoNow(),
        updated_at: isoNow(),
      };
      await database("call_attempts").insert(row);
      res.status(201).json({ data: row });
    }, logger));

    router.post("/webhooks/vapi", route(async (req, res) => {
      requireVapiSecret(req, env);
      const message = req.body?.message || {};
      const call = message.call || {};
      const callId = String(call.id || message.callId || "");
      const eventType = String(message.type || "unknown");
      if (!callId) throw new ApiError(400, "VAPI_CALL_ID_REQUIRED", "Webhook does not include a call ID.");

      let attempt = await database("call_attempts").where({ provider_call_id: callId }).first();
      const metadata = call.metadata || message.metadata || {};
      if (!attempt && metadata.lead_id && metadata.request_id && metadata.organization_id) {
        attempt = {
          id: randomUUID(),
          organization_id: metadata.organization_id,
          request_id: metadata.request_id,
          lead_id: metadata.lead_id,
          provider: "vapi",
          provider_call_id: callId,
          attempt_number: 1,
          status: "started",
          phone: call.customer?.number || null,
          cost_halalas: 0,
          provider_cost_micros: 0,
          provider_cost_currency: "USD",
          raw_payload: { call },
          created_at: isoNow(),
          updated_at: isoNow(),
        };
        await database("call_attempts").insert(attempt);
      }
      if (!attempt) throw new ApiError(404, "CALL_NOT_REGISTERED", "Call attempt is not registered.");

      const providerEventId = String(message.id || eventFingerprint([callId, eventType, message.timestamp, JSON.stringify(message.status || "")]));
      const existingEvent = await database("call_events").where({ provider_event_id: providerEventId }).first();
      if (existingEvent) {
        res.json({ data: { received: true, duplicate: true } });
        return;
      }
      await database("call_events").insert({
        id: randomUUID(),
        organization_id: attempt.organization_id,
        call_attempt_id: attempt.id,
        provider_event_id: providerEventId,
        event_type: eventType,
        payload: req.body,
        received_at: isoNow(),
      });

      const artifact = message.artifact || call.artifact || {};
      const ended = eventType === "end-of-call-report" || call.status === "ended";
      const update = {
        status: ended ? "completed" : String(message.status || call.status || attempt.status).slice(0, 50),
        updated_at: isoNow(),
        raw_payload: req.body,
      };
      if (call.startedAt || message.startedAt) update.started_at = call.startedAt || message.startedAt;
      if (ended) update.ended_at = call.endedAt || message.endedAt || isoNow();
      if (artifact.recordingUrl || message.recordingUrl) update.recording_url = artifact.recordingUrl || message.recordingUrl;
      if (artifact.transcript || message.transcript) update.transcript = artifact.transcript || message.transcript;
      if (message.summary || artifact.summary) update.summary = message.summary || artifact.summary;
      if (call.cost != null || message.cost != null) {
        update.provider_cost_micros = Math.max(0, Math.round(Number(call.cost ?? message.cost) * 1_000_000));
        update.provider_cost_currency = "USD";
      }
      await database("call_attempts").where({ id: attempt.id }).update(update);

      if (ended) {
        const analysis = message.analysis || artifact.analysis || call.analysis || {};
        const structured = analysis.structuredData || message.structuredData || {};
        const summary = analysis.summary || message.summary || artifact.summary || update.summary || null;
        const status = String(structured.qualification_status || structured.status || "review").slice(0, 40);
        const score = safeInteger(structured.score, 0, 0, 100);
        const qualificationKey = `vapi:${callId}`;
        const row = {
          id: randomUUID(),
          qualification_key: qualificationKey,
          organization_id: attempt.organization_id,
          lead_id: attempt.lead_id,
          call_attempt_id: attempt.id,
          status,
          score,
          answers: structured,
          summary,
          next_action: String(structured.next_action || "Human review").slice(0, 255),
          qualified_at: isoNow(),
          created_at: isoNow(),
          updated_at: isoNow(),
        };
        await database("qualifications").insert(row).onConflict("qualification_key").merge({
          status: row.status,
          score: row.score,
          answers: row.answers,
          summary: row.summary,
          next_action: row.next_action,
          qualified_at: row.qualified_at,
          updated_at: row.updated_at,
        });
        await database("lead_inventory").where({ id: attempt.lead_id }).update({
          qualification_status: status,
          fit_score: score,
          updated_at: isoNow(),
        });
      }

      res.json({ data: { received: true, duplicate: false } });
    }, logger));
  },
};
