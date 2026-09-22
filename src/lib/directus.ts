import axios from "axios";
import type { B2CPlanning, CompanyResearch, IntakeState, Lead } from "../types";

const directusUrl = (import.meta.env.VITE_DIRECTUS_URL as string | undefined) || "/directus";
const leadAgentPath = import.meta.env.VITE_DIRECTUS_LEAD_AGENT_PATH || "/lead-agent";
let accessToken: string | undefined;

export type AccountProfile = {
  id: string;
  email: string;
  name: string;
  business: string;
  organization_id: string;
  phone: string;
  phone_verified: boolean;
  avatar_seed: string;
  wallet: {
    currency: "SAR";
    balance_halalas: number;
    balance: number;
    credits: number;
  };
  welcome_offer: {
    credit_sar: number;
    included_leads: number;
  };
  created_at: string;
  is_admin: boolean;
};

export type AdminLead = {
  id: string;
  delivery_id: string;
  request_id: string;
  user_id: string;
  user_email: string | null;
  organization_id: string;
  organization_name: string | null;
  account_first_name: string | null;
  account_last_name: string | null;
  purpose: string | null;
  requested_leads: number;
  provider: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  delivered_at: string;
  name: string | null;
  title: string | null;
  company: string;
  email: string | null;
  phone: string | null;
  person_image_url: string | null;
  company_image_url: string | null;
  website: string | null;
  linkedin_url: string | null;
  company_linkedin_url: string | null;
  location: string | null;
  industry: string | null;
  seniority: string | null;
  company_size: number | null;
  annual_revenue: string | null;
  review_score: string | null;
  review_count: number | null;
  source: string;
  source_reference: string | null;
  fit_score: number;
  qualification_status: string;
  enrichment_status: "enriched" | "partial" | "raw";
  enrichment_score: number;
  enrichment_summary: string | null;
  enrichment_signals: string[];
  last_enriched_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type AdminLeadResponse = {
  data: AdminLead[];
  meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    enrichment: Record<string, number>;
    sources: Array<{ value: string; count: number }>;
    queries: Array<{
      id: string;
      prompt: string;
      campaign_name: string | null;
      requested_count: number;
      delivered_count: number;
      last_delivery_at: string;
    }>;
  };
};

export type PlatformCapabilities = {
  features: Record<string, boolean>;
  lead_types: Array<"b2b" | "b2c">;
  updated_at: string | null;
};

export type AdminAccount = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone_e164: string | null;
  organization_id: string;
  organization_name: string;
  status: string;
  credits: number;
  generated_leads: number;
  chat_turns: number;
  created_at: string;
};

export type AdminFeature = {
  key: string;
  name: string;
  description: string | null;
  enabled_global: boolean;
  enabled: boolean;
  overridden: boolean;
  configuration: Record<string, unknown>;
  updated_at: string;
};

export type AdminProvider = {
  id: string;
  provider_key: string;
  name: string;
  channel: "b2b" | "b2c";
  provider_type: "apify";
  actor_id: string;
  token_hint: string | null;
  has_token: boolean;
  enabled: boolean;
  priority: number;
  configuration: Record<string, unknown>;
  updated_at: string;
};

export type AdminChatLog = {
  id: string;
  user_email: string | null;
  conversation_id: string | null;
  lead_type: "b2b" | "b2c" | null;
  deal_intent: "buy" | "sell" | null;
  message: string;
  response: string | null;
  understood_data: Record<string, unknown>;
  outcome: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

export type AdminMemory = {
  id: string;
  user_email: string | null;
  organization_name: string | null;
  last_summary: string | null;
  last_outcome: string | null;
  source_turn_count: number;
  confidence: number;
  understood_data: { latest?: Record<string, unknown>; observations?: Array<Record<string, unknown>>; owner_persona?: Record<string, unknown> };
  updated_at: string;
};

export type AdminB2CCampaign = {
  id: string;
  request_id: string;
  username: string;
  user_email: string | null;
  organization_name: string | null;
  name: string;
  original_prompt: string;
  deal_intent: "buy" | "sell";
  status: string;
  target_count: number;
  delivered_count: number;
  intent: Record<string, unknown>;
  acquisition_plan: Record<string, unknown>;
  public_explanation: B2CExplanation;
  internal_audit: {
    algorithm: string;
    source_api: string | null;
    contact_api: string | null;
    api_operations: string[];
    api_queries: Array<{ tag: string; cities: string[]; strategy_type: string; weight: number; pages: number; results_per_page: number; mode?: string; phase?: string; progress?: { nextPage?: number; pagesFetched?: number; postsFetched?: number; exhausted?: boolean } | null }>;
    qualification_thresholds: Record<string, number>;
    execution_rules: Array<{ id: string; label: string }>;
    execution_ledger: Array<{ at: string; pass: number; code: string; [key: string]: unknown }>;
    exact_count_contract: { requested: number; delivered: number; remaining: number };
    recovery: { enabled: boolean; round: number; maximum_rounds: number; fallback_activated: boolean; source_exhausted: boolean; contact_authentication: string };
    stages: string[];
    stats: Record<string, unknown>;
    sourcing_explanation: unknown;
  };
  created_at: string;
};

export type AdminB2CLeadAdvertisement = {
  post_id: number | null;
  title: string;
  body: string;
  url: string;
  tags: string[];
  city: string;
  matched_signals: string[];
  strategy_type: string;
  strategy_weight: number;
};

export type AdminB2CLeadEvidence = {
  id: string;
  inventory_id: string | null;
  display_name: string;
  author_username: string | null;
  phone: string | null;
  city: string | null;
  score: number;
  tier: string;
  marketplace_role: string;
  explanation: string;
  status: string;
  qualification_status: string;
  advertisements: AdminB2CLeadAdvertisement[];
  created_at: string;
};

export type AdminB2CActivity = {
  campaign: { id: string; name: string; status: string; stats: Record<string, number> };
  summary: { ads_returned: number; unique_sellers: number; contact_attempts: number; phones_resolved: number; rejected_without_phone: number };
  activity: Array<{
    id: string;
    fetched_ad: { operation: string; post_id: number; title: string; body: string; url: string; city: string; tags: string[]; author_username: string };
    request: { tag: string; strategy_type: string; weight: number };
    qualification: { status: string; score: number; marketplace_role: string; explanation: string; matched_signals: string[]; rejection_reasons: string[] };
    contact_call: { operation: string; attempted: boolean; outcome: string };
    created_at: string;
    updated_at: string;
  }>;
};

export type LeadRequestReceipt = {
  id: string;
  status: string;
  target_count: number;
  workflow_dispatched: boolean;
};

export type B2CCampaign = {
  id: string;
  requestId: string;
  name: string;
  originalPrompt: string;
  intent: B2CPlanning["intent"];
  acquisitionPlan: B2CPlanning["acquisitionPlan"];
  targetLeadCount: number;
  status: "DRAFT" | "READY" | "QUEUED" | "RUNNING" | "PAUSED" | "PARTIAL" | "COMPLETED" | "FAILED";
  stats: {
    postsFetched: number;
    candidatesQualified: number;
    contactsResolved: number;
    uniqueLeads: number;
    hotLeads: number;
    warmLeads: number;
    sourceExhausted?: boolean;
    maxAds?: number;
    nextPage?: number;
    searchPass?: number;
  };
  explanation: B2CExplanation;
  errorMessage: string | null;
};

export type B2CExplanation = {
  thinking: string;
  understanding: string;
  sourcing: string;
  metrics: { analyzed: number; qualified: number; delivered: number; requested: number };
};

type B2CLead = {
  id: string;
  inventoryId: string | null;
  sourceInternal: "b2c";
  authorId: number | null;
  authorUsername: string | null;
  phone: string | null;
  city: string | null;
  score: number;
  tier: "HOT" | "WARM" | "EXPERIMENTAL";
  identityConfidence: number;
  purchasePropensity: number;
  marketplaceRole: string;
  explanation: string;
  evidence: Array<{
    postId: number;
    title: string;
    tags: string[];
    city: string | null;
    matchedSignals: string[];
    strategyType: string;
  }>;
  status: string;
  revealed: boolean;
  updatedAt: string;
};

export type SocialProvider = "google" | "microsoft";

export type SocialIdentity = {
  id: string;
  email: string;
  name: string;
  provider: string;
  profile_complete: boolean;
};

export type SocialChannelProvider =
  | "postiz"
  | "chatwoot"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "tiktok"
  | "snapchat"
  | "custom";

export type SocialCredentialField = {
  key: string;
  label: string;
  required: boolean;
  kind: "text" | "secret" | "url";
};

export type SocialProviderDefinition = {
  id: SocialChannelProvider;
  name: string;
  description: string;
  credential_fields: SocialCredentialField[];
  capabilities: string[];
  oauth_ready: boolean;
  required_environment: string[];
  present_environment: string[];
};

export type SocialConnection = {
  id: string;
  provider: SocialChannelProvider;
  display_name: string;
  external_account_id: string | null;
  status: "configured" | "ready" | "needs_attention";
  is_preferred: boolean;
  auth_mode: "credentials" | "oauth";
  credential_hints: {
    fields_present: string[];
    masked: Record<string, string>;
  };
  configuration: Record<string, unknown>;
  capabilities: string[];
  autonomy_level: "draft_only" | "scheduled" | "guarded";
  approval_policy: "always" | "sensitive_only" | "policy_based";
  webhook_status: string;
  last_verified_at: string | null;
  last_connected_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SocialActivity = {
  id: string;
  connection_id: string | null;
  provider: SocialChannelProvider;
  event_type: string;
  status: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SocialProviderOverview = {
  providers: SocialProviderDefinition[];
  security: {
    encrypted_at_rest: boolean;
    dedicated_encryption_key: boolean;
    tenant_isolated: boolean;
    secrets_returned_to_browser: boolean;
  };
  orchestration: Array<{
    id: "postiz" | "chatwoot" | "langfuse";
    name: string;
    ready: boolean;
    required_environment: string[];
  }>;
};

export type GrowthBrandProfile = {
  id: string | null;
  company_name: string;
  website: string;
  industry: string;
  description: string;
  value_proposition: string;
  products_services: string[];
  brand_voice: string;
  brand_values: string[];
  target_markets: string[];
  goals: string[];
  tone_rules: string[];
  colors: string[];
  logo_url: string;
  completion_score: number;
  created_at: string | null;
  updated_at: string | null;
};

export type AudienceSegment = {
  id: string;
  name: string;
  type: "B2B" | "B2C";
  description: string;
  pains: string[];
  triggers: string[];
  jobs_to_be_done: string[];
  channels: SocialChannelProvider[];
  geography: string[];
  estimated_size: number;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

export type GrowthCampaign = {
  id: string;
  name: string;
  objective: string;
  audience_segment_id: string | null;
  status: "draft" | "active" | "paused" | "completed";
  channels: SocialChannelProvider[];
  strategy: Record<string, unknown>;
  metrics: {
    reach?: number;
    engagements?: number;
    conversations?: number;
    opportunities?: number;
    won?: number;
  };
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GrowthContentItem = {
  id: string;
  campaign_id: string | null;
  connection_id: string | null;
  title: string;
  channel: "instagram" | "facebook" | "tiktok";
  format: string;
  copy: string;
  media: Array<{ id?: string; path?: string }>;
  status: "draft" | "publishing" | "scheduled" | "published" | "failed" | "unknown";
  approval_status: "pending" | "approved";
  scheduled_for: string | null;
  postiz_post_id: string | null;
  published_at: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  rationale?: string;
  visual_direction?: string;
};

export type CustomerJourney = {
  id: string;
  lead_id: string | null;
  segment_id: string | null;
  display_name: string;
  stage: "engaged" | "matched" | "offered" | "won";
  stage_order: number;
  source: string | null;
  engagement_score: number;
  next_action: string | null;
  owner_name: string | null;
  value_halalas: number;
  last_activity_at: string | null;
};

export type GrowthOverview = {
  brand: GrowthBrandProfile;
  audiences: AudienceSegment[];
  campaigns: GrowthCampaign[];
  content: GrowthContentItem[];
  journeys: CustomerJourney[];
  funnel: Array<{
    stage: CustomerJourney["stage"];
    order: number;
    count: number;
    value_halalas: number;
    customers: Array<{ id: string; display_name: string; engagement_score: number; next_action: string | null }>;
  }>;
  connections: SocialConnection[];
  infrastructure: { postiz: boolean; chatwoot: boolean; langfuse: boolean; ai: boolean };
};

export type InboxConversation = {
  id: number;
  display_id: number;
  status: string;
  unread_count: number;
  last_activity_at: number;
  contact: { name: string; phone: string | null; email: string | null; avatar: string | null };
  inbox: { name: string; channel_type: string };
  last_message: string;
};

export const hasDirectus = Boolean(directusUrl);

const client = axios.create({
  baseURL: directusUrl,
  withCredentials: true,
});

async function refreshSession() {
  if (!directusUrl) return null;
  try {
    const { data } = await client.post("/auth/refresh", { mode: "cookie" });
    accessToken = data?.data?.access_token;
    return accessToken || null;
  } catch {
    accessToken = undefined;
    return null;
  }
}

async function authenticatedRequest<T>(method: "get" | "post" | "put" | "patch" | "delete", path: string, payload?: unknown): Promise<T> {
  const perform = (accessToken?: string) => client.request({
    method,
    url: path,
    data: payload,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  let requestToken = accessToken;
  try {
    const { data } = await perform(requestToken);
    return data?.data ?? data;
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
    requestToken = await refreshSession() || undefined;
    if (!requestToken) throw error;
    const { data } = await perform(requestToken);
    return data?.data ?? data;
  }
}

async function authenticatedRaw<T>(path: string): Promise<T> {
  const perform = (accessToken?: string) => client.get(path, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  let requestToken = accessToken;
  try {
    const { data } = await perform(requestToken);
    return data as T;
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
    requestToken = await refreshSession() || undefined;
    if (!requestToken) throw error;
    const { data } = await perform(requestToken);
    return data as T;
  }
}

export function hasAuthSession() {
  return Boolean(accessToken);
}

export async function listSocialProviders() {
  if (!directusUrl) return [] as SocialProvider[];
  const { data } = await client.get("/auth");
  const supported = new Set<SocialProvider>(["google", "microsoft"]);
  return (data?.data ?? [])
    .map((provider: { name?: string }) => String(provider.name || "").toLowerCase())
    .filter((provider: string): provider is SocialProvider => supported.has(provider as SocialProvider));
}

export function socialLoginUrl(provider: SocialProvider) {
  if (!directusUrl) throw new Error("Directus URL is not configured.");
  const redirect = `${window.location.origin}/auth/social`;
  return `${String(directusUrl).replace(/\/$/, "")}/auth/login/${provider}?redirect=${encodeURIComponent(redirect)}`;
}

export function getSocialIdentity() {
  return authenticatedRequest<SocialIdentity>("get", `${leadAgentPath}/auth/social/identity`);
}

export function completeSocialAccount(payload: { business: string; phone: string; locale: string; privacy_accepted: boolean; permissions_accepted: boolean; consent_version: string }) {
  return authenticatedRequest<{ user_id: string; organization_id: string; profile_complete: boolean }>(
    "post",
    `${leadAgentPath}/auth/social/complete`,
    payload,
  );
}

export async function registerAccount(payload: {
  email: string;
  password: string;
  name: string;
  business: string;
  phone: string;
  privacy_accepted: boolean;
  permissions_accepted: boolean;
  consent_version: string;
}) {
  if (!directusUrl) throw new Error("Directus URL is not configured.");
  const { data } = await client.post(`${leadAgentPath}/auth/register`, payload);
  return data?.data ?? data;
}

export async function loginAccount(email: string, password: string) {
  if (!directusUrl) throw new Error("Directus URL is not configured.");
  const { data } = await client.post("/auth/login", { email, password, mode: "cookie" });
  accessToken = data?.data?.access_token;
  return data?.data;
}

export async function logoutAccount() {
  accessToken = undefined;
  if (directusUrl) await client.post("/auth/logout", { mode: "cookie" }).catch(() => undefined);
}

export function getAccount() {
  return authenticatedRequest<AccountProfile>("get", `${leadAgentPath}/me`);
}

export function fetchCapabilities() {
  return authenticatedRequest<PlatformCapabilities>("get", `${leadAgentPath}/capabilities`);
}

export function fetchAdminAccounts() {
  return authenticatedRequest<AdminAccount[]>("get", `${leadAgentPath}/admin/accounts`);
}

export function fetchAdminFeatures(account?: string) {
  const query = account ? `?account=${encodeURIComponent(account)}` : "";
  return authenticatedRequest<{ account: AdminAccount | null; features: AdminFeature[] }>("get", `${leadAgentPath}/admin/features${query}`);
}

export function updateAdminFeature(key: string, enabled_global: boolean) {
  return authenticatedRequest<AdminFeature>("patch", `${leadAgentPath}/admin/features/${encodeURIComponent(key)}`, { enabled_global });
}

export function updateAdminFeatureOverride(key: string, account: string, enabled: boolean | null) {
  return authenticatedRequest<{ account: AdminAccount; features: AdminFeature[] }>("put", `${leadAgentPath}/admin/features/${encodeURIComponent(key)}/override`, { account, enabled });
}

export function fetchAdminProviders() {
  return authenticatedRequest<AdminProvider[]>("get", `${leadAgentPath}/admin/providers`);
}

export function createAdminProvider(payload: { key: string; name: string; actor_id: string; token: string; channel: "b2b" | "b2c"; priority: number }) {
  return authenticatedRequest<AdminProvider>("post", `${leadAgentPath}/admin/providers`, payload);
}

export function updateAdminProvider(id: string, payload: Partial<Pick<AdminProvider, "name" | "actor_id" | "enabled" | "priority">> & { token?: string }) {
  return authenticatedRequest<AdminProvider>("patch", `${leadAgentPath}/admin/providers/${encodeURIComponent(id)}`, payload);
}

export function deleteAdminProvider(id: string) {
  return authenticatedRequest<{ deleted: boolean; id: string }>("delete", `${leadAgentPath}/admin/providers/${encodeURIComponent(id)}`);
}

export function adjustAdminCredits(payload: { scope: "global" | "account"; account?: string; credits_delta: number; reason: string }) {
  return authenticatedRequest<{ scope: string; credits_delta: number; affected_accounts: number }>("post", `${leadAgentPath}/admin/credits/adjust`, payload);
}

export function fetchAdminChatLogs() {
  return authenticatedRequest<AdminChatLog[]>("get", `${leadAgentPath}/admin/chat-logs?limit=100`);
}

export function fetchAdminMemory() {
  return authenticatedRequest<AdminMemory[]>("get", `${leadAgentPath}/admin/memory`);
}

export function fetchAdminB2CCampaigns() {
  return authenticatedRequest<AdminB2CCampaign[]>("get", `${leadAgentPath}/admin/b2c-campaigns`);
}

export function fetchAdminB2CCampaignLeads(id: string) {
  return authenticatedRequest<AdminB2CLeadEvidence[]>("get", `${leadAgentPath}/admin/b2c-campaigns/${encodeURIComponent(id)}/leads`);
}

export function fetchAdminB2CCampaignActivity(id: string) {
  return authenticatedRequest<AdminB2CActivity>("get", `${leadAgentPath}/admin/b2c-campaigns/${encodeURIComponent(id)}/activity`);
}

export function fetchSocialProviders() {
  return authenticatedRequest<SocialProviderOverview>("get", `${leadAgentPath}/socials/providers`);
}

export function fetchSocialConnections() {
  return authenticatedRequest<SocialConnection[]>("get", `${leadAgentPath}/socials/connections`);
}

export function fetchSocialActivity(limit = 30) {
  return authenticatedRequest<SocialActivity[]>("get", `${leadAgentPath}/socials/activity?limit=${limit}`);
}

export type SaveSocialConnectionPayload = {
  provider?: SocialChannelProvider;
  display_name?: string;
  auth_mode?: "credentials" | "oauth";
  credentials?: Record<string, string>;
  configuration?: Record<string, unknown>;
  autonomy_level?: SocialConnection["autonomy_level"];
  approval_policy?: SocialConnection["approval_policy"];
  is_preferred?: boolean;
};

export function createSocialConnection(payload: SaveSocialConnectionPayload & { provider: SocialChannelProvider; credentials: Record<string, string> }) {
  return authenticatedRequest<SocialConnection>("post", `${leadAgentPath}/socials/connections`, payload);
}

export function updateSocialConnection(id: string, payload: SaveSocialConnectionPayload) {
  return authenticatedRequest<SocialConnection>("patch", `${leadAgentPath}/socials/connections/${encodeURIComponent(id)}`, payload);
}

export function setPreferredSocialConnection(id: string) {
  return authenticatedRequest<SocialConnection>("post", `${leadAgentPath}/socials/connections/${encodeURIComponent(id)}/preferred`, {});
}

export function validateSocialConnection(id: string) {
  return authenticatedRequest<{
    connection: SocialConnection;
    checks: {
      credentials_complete: boolean;
      encrypted_at_rest: boolean;
      tenant_isolated: boolean;
      oauth_app_ready: boolean;
      external_api_tested: boolean;
    };
  }>("post", `${leadAgentPath}/socials/connections/${encodeURIComponent(id)}/validate`, {});
}

export function disconnectSocialConnection(id: string) {
  return authenticatedRequest<{ id: string; disconnected: boolean }>("delete", `${leadAgentPath}/socials/connections/${encodeURIComponent(id)}`);
}

export function fetchGrowthOverview() {
  return authenticatedRequest<GrowthOverview>("get", `${leadAgentPath}/growth/overview`);
}

export function saveGrowthBrand(payload: Omit<GrowthBrandProfile, "id" | "completion_score" | "created_at" | "updated_at">) {
  return authenticatedRequest<GrowthBrandProfile>("put", `${leadAgentPath}/growth/brand`, payload);
}

export type AudienceSegmentInput = Omit<AudienceSegment, "id" | "status" | "created_at" | "updated_at">;

export function createAudienceSegment(payload: AudienceSegmentInput) {
  return authenticatedRequest<AudienceSegment>("post", `${leadAgentPath}/growth/audiences`, payload);
}

export function updateAudienceSegment(id: string, payload: Partial<AudienceSegmentInput> & { status?: AudienceSegment["status"] }) {
  return authenticatedRequest<AudienceSegment>("patch", `${leadAgentPath}/growth/audiences/${encodeURIComponent(id)}`, payload);
}

export function createGrowthCampaign(payload: {
  name: string;
  objective: string;
  audience_segment_id?: string | null;
  channels: SocialChannelProvider[];
  strategy?: Record<string, unknown>;
  start_at?: string | null;
  end_at?: string | null;
}) {
  return authenticatedRequest<GrowthCampaign>("post", `${leadAgentPath}/growth/campaigns`, payload);
}

export type GrowthContentInput = {
  title: string;
  channel: GrowthContentItem["channel"];
  format: string;
  copy: string;
  campaign_id?: string | null;
  connection_id?: string | null;
  scheduled_for?: string | null;
  media?: GrowthContentItem["media"];
};

export function createGrowthContent(payload: GrowthContentInput) {
  return authenticatedRequest<GrowthContentItem>("post", `${leadAgentPath}/growth/content`, payload);
}

export function generateGrowthContent(payload: {
  brief: string;
  channel: GrowthContentItem["channel"];
  format?: string;
  audience_segment_id?: string | null;
  campaign_id?: string | null;
  connection_id?: string | null;
  scheduled_for?: string | null;
  media?: GrowthContentItem["media"];
}) {
  return authenticatedRequest<GrowthContentItem>("post", `${leadAgentPath}/growth/content/generate`, payload);
}

export function updateGrowthContent(id: string, payload: Partial<Pick<GrowthContentItem, "title" | "copy" | "format" | "connection_id" | "scheduled_for" | "approval_status" | "media">>) {
  return authenticatedRequest<GrowthContentItem>("patch", `${leadAgentPath}/growth/content/${encodeURIComponent(id)}`, payload);
}

export function publishGrowthContent(id: string) {
  return authenticatedRequest<GrowthContentItem>("post", `${leadAgentPath}/growth/content/${encodeURIComponent(id)}/publish`, {});
}

export function syncGrowthPublishingConnections() {
  return authenticatedRequest<{ synced: number }>("post", `${leadAgentPath}/growth/publishing/sync`, {});
}

export function fetchGrowthInbox() {
  return authenticatedRequest<{ configured: boolean; conversations: InboxConversation[] }>("get", `${leadAgentPath}/growth/inbox`);
}

export function suggestGrowthConversationReply(id: number) {
  return authenticatedRequest<{ suggestion: string }>("post", `${leadAgentPath}/growth/inbox/${encodeURIComponent(id)}/suggest`, {});
}

export function replyToGrowthConversation(id: number, content: string) {
  return authenticatedRequest<{ id: number; status: string; content: string }>("post", `${leadAgentPath}/growth/inbox/${encodeURIComponent(id)}/reply`, { content });
}

export function fetchAdminLeads(filters: {
  account?: string;
  request?: string;
  search?: string;
  enrichment?: string;
  qualification?: string;
  source?: string;
  sort?: string;
  page?: number;
  limit?: number;
} = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return authenticatedRaw<AdminLeadResponse>(`${leadAgentPath}/admin/leads?${params.toString()}`);
}

export function requestPhoneVerification() {
  return authenticatedRequest<{ verification_id?: string; status: string; expires_at?: string; dev_code?: string }>(
    "post",
    `${leadAgentPath}/auth/phone/request`,
    {},
  );
}

export function confirmPhoneVerification(code: string) {
  return authenticatedRequest<{ status: string; credited: boolean; welcome_credit_sar: number; welcome_included_leads: number; balance_sar: number }>(
    "post",
    `${leadAgentPath}/auth/phone/confirm`,
    { code },
  );
}

export function createLeadRequest(payload: { query: string; criteria: Record<string, unknown>; target_count: number }) {
  return authenticatedRequest<LeadRequestReceipt>("post", `${leadAgentPath}/requests`, payload);
}

export function apiErrorMessage(error: unknown, fallback = "Something went wrong.") {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error?.message || error.response?.data?.errors?.[0]?.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export function apiErrorCode(error: unknown) {
  if (!axios.isAxiosError(error)) return undefined;
  return error.response?.data?.error?.code || error.response?.data?.errors?.[0]?.extensions?.code;
}

export async function runDirectusFlow<T>(path: string, payload: unknown): Promise<T> {
  if (!directusUrl) {
    throw new Error("Directus URL is not configured.");
  }
  return authenticatedRequest<T>("post", path, payload);
}

export async function understandLeadAsk(message: string, transcript: string[]): Promise<IntakeState> {
  const flowPath = import.meta.env.VITE_DIRECTUS_AI_FLOW_PATH || "/flows/trigger/waslah-ai";
  if (hasDirectus) {
    try {
      return await runDirectusFlow<IntakeState>(flowPath, { message, transcript });
    } catch {
      // Keep intake usable while the optional AI flow is not configured.
    }
  }

  const userContext = transcript.filter((line) => /^user:/i.test(line) && !/^user:\s*(Mission context:|سياق المهمة:)/i.test(line))
    .map((line) => line.replace(/^user:\s*/i, ""));
  return localLeadIntake([...new Set([...userContext, message])].join(". "));
}

export type WaslaConversationResult =
  | { mode: "assistant"; text: string }
  | { mode: "lead"; intake: IntakeState; text: string };

async function chatWithWasla(message: string, transcript: string[], language: "ar" | "en", conversationId?: string, leadType?: "b2c" | "b2b" | null, objective?: "buy" | "sell") {
  return authenticatedRequest<{ text: string; intake?: IntakeState }>("post", `${leadAgentPath}/chat`, { message, transcript, language, conversation_id: conversationId, lead_type: leadType, deal_intent: objective });
}

async function chatWithB2CWasla(message: string, transcript: string[], language: "ar" | "en", conversationId?: string, objective?: "buy" | "sell", planning?: B2CPlanning) {
  return authenticatedRequest<{ text: string; planning: B2CPlanning | null; ready: boolean; missing: string[]; brief: string; stage?: string }>("post", `${leadAgentPath}/b2c/chat`, {
    message,
    transcript,
    language,
    conversation_id: conversationId,
    deal_intent: objective,
    planning,
  });
}

export async function converseWithWasla(
  message: string,
  transcript: string[],
  language: "ar" | "en",
  objective: "buy" | "sell" = "buy",
  conversationId?: string,
  leadType?: "b2c" | "b2b" | null,
  currentPlanning?: B2CPlanning,
): Promise<WaslaConversationResult> {
  const leadRequest = leadType ? message.trim().length >= 3 : isLeadSearchRequest(message);
  if (leadRequest && leadType === "b2c") {
    try {
      const response = await chatWithB2CWasla(message, transcript, language, conversationId, objective, currentPlanning);
      if (!response.ready || !response.planning) {
        return {
          mode: "lead",
          text: response.text,
          intake: {
            confidence: Math.max(34, 100 - Math.max(response.missing.length, 1) * 33),
            summary: response.brief || (language === "ar" ? "نبني وصف العميل المثالي" : "Building the ideal customer profile"),
            missing: response.missing,
            apifyActor: "",
            apifyInput: {},
            channel: "b2c",
            originalPrompt: response.brief || message,
            ...(response.planning ? { b2cPlanning: response.planning } : {}),
          },
        };
      }
      return {
        mode: "lead",
        text: response.text,
        intake: {
          confidence: response.ready && response.planning.acquisitionPlan.strategies.length ? 100 : 66,
          summary: `${response.planning.intent.productName} — ${response.planning.acquisitionPlan.targetProfiles.join(", ")}`,
          missing: response.planning.acquisitionPlan.strategies.length ? [] : [language === "ar" ? "وصف أوضح للمنتج" : "a clearer product description"],
          apifyActor: "",
          apifyInput: {},
          channel: "b2c",
          originalPrompt: response.brief || message,
          b2cPlanning: response.planning,
        },
      };
    } catch {
      const fallback = localB2CIntake(message, language);
      return {
        mode: "lead",
        intake: fallback,
        text: objective === "buy"
          ? language === "ar"
            ? "ما الذي تريد شراءه من الأفراد، وما أهم المواصفات أو الحالة أو الميزانية، وفي أي مدينة؟"
            : "What do you want to buy from individuals, what specifications, condition, or budget matter, and in which city?"
          : language === "ar"
            ? "ما المنتج أو الخدمة التي تبيعها، ومن هو العميل المثالي لها، وفي أي مدينة؟"
            : "What product or service are you selling, who is the ideal customer, and which city should we target?",
      };
    }
  }
  try {
    const chat = await chatWithWasla(message, transcript, language, conversationId, leadType, objective);
    const intake = chat.intake || (leadRequest ? await understandLeadAsk(message, transcript) : null);
    if (leadRequest && intake) return { mode: "lead", intake, text: chat.text };
    return { mode: "assistant", text: chat.text };
  } catch {
    if (leadRequest) {
      const intake = await understandLeadAsk(message, transcript);
      return {
        mode: "lead",
        intake,
        text: intake.confidence === 100
          ? (language === "ar" ? `المهمة جاهزة: ${intake.summary}` : `Ready: ${intake.summary}`)
          : (language === "ar" ? `ما زلنا نحتاج: ${intake.missing.join("، ")}.` : `Still missing ${intake.missing.join(", ")}.`),
      };
    }
    return { mode: "assistant", text: waslaProductAnswer(message, language) };
  }
}

function localB2CIntake(message: string, language: "ar" | "en"): IntakeState {
  const product = message
    .replace(/^\s*(?:find|search|source|generate|i\s+(?:sell|offer)|we\s+(?:sell|offer)|ابحث|اعثر|أبيع|ابيع|نبيع)\s+/i, "")
    .trim();
  return {
    confidence: 34,
    summary: product || (language === "ar" ? "عرضك للمستهلك" : "your consumer offer"),
    missing: language === "ar" ? ["المنتج أو الخدمة", "العميل المثالي", "المدينة"] : ["product or service", "ideal customer", "city or region"],
    apifyActor: "",
    apifyInput: {},
    channel: "b2c",
    originalPrompt: message,
  };
}

export function isLeadSearchRequest(message: string) {
  return /^\s*(?:find|search|source|generate)\b|find me|find (?:a|some|the)|search for|looking for|\b(?:make|give|build|generate|source)\b.{0,50}\bleads?\b|leads? (?:in|for|from)|target (?:companies|buyers)|ابحث|اعثر|دور لي|أبغى|ابغى|أريد|اريد|هات لي|عملاء (?:في|من|لـ)|استهدف/i.test(message);
}

function waslaProductAnswer(message: string, language: "ar" | "en") {
  const value = message.toLowerCase();
  const ar = language === "ar";
  if (/hello|hi|hey|مرحبا|هلا|السلام/.test(value)) {
    return ar
      ? "أهلاً! أنا مساعد وصلة. أقدر أشرح لك المنصة، الرصيد، البحث العميق، أو أبدأ معك مهمة عملاء جديدة."
      : "Hi! I’m Wasla’s assistant. I can explain the product, credits, deep research, or help you start a new lead mission.";
  }
  if (/price|pricing|plan|package|cost|سعر|أسعار|باق|تكلف/.test(value)) {
    return ar
      ? "لدى وصلة باقتان أساسيتان: Launch بسعر 2,999 ر.س وتشمل 3,000 عميل مثرى و1,500 بحث عميق، وScale بسعر 3,999 ر.س وتشمل 6,000 عميل و3,000 بحث. باقة Autopilot مخصصة وتضيف التأهيل والاتصال وحجز الاجتماعات."
      : "Wasla has two core plans: Launch at 2,999 SAR with 3,000 enriched leads and 1,500 deep researches, and Scale at 3,999 SAR with 6,000 leads and 3,000 researches. Autopilot is custom and adds qualification, calling, and meeting booking.";
  }
  if (/credit|wallet|balance|lead cost|رصيد|محفظ|خصم|كم عميل/.test(value)) {
    return ar
      ? "كل 10 أرصدة تساوي 1 ر.س وتكشف عميلاً واحداً. لا يُخصم شيء أثناء صياغة الطلب؛ الخصم يحدث فقط عند كشف سجل جديد، والسجل نفسه لا يُخصم مرتين. الحسابات الجديدة تحصل على 30 عميلاً مجاناً ورصيد 100 ر.س بعد توثيق الجوال."
      : "Every 10 credits equal 1 SAR and reveal one lead. Drafting a request costs nothing; credit is charged only when a new record is revealed, and the same record is never charged twice. New accounts receive 30 free leads and 100 SAR credit after phone verification.";
  }
  if (/deep research|research|insight|بحث عميق|رؤى|تحليل/.test(value)) {
    return ar
      ? "البحث العميق يجمع إشارات الشركة، صناع القرار، الفرص، المخاطر، والتحديثات الحديثة في ملف واحد. بعد وصول العملاء افتح قسم العملاء لبحث حساب محدد، ثم راجع الأنماط والتوصيات في صفحة الرؤى."
      : "Deep research combines company signals, decision makers, opportunities, risks, and recent updates into one account brief. Once leads arrive, research a specific account from Leads and review patterns and recommendations in Insights.";
  }
  if (/lead|search|source|عميل|عملاء|مصدر|جمع/.test(value)) {
    return ar
      ? "صف القطاع والمدينة وصانع القرار بلغة طبيعية. أوضح لك أي معيار ناقص، ثم أنقل المهمة إلى قسم العملاء حيث تظهر السجلات واحداً بعد الآخر بعد التحقق منها."
      : "Describe the industry, location, and decision maker in natural language. I’ll clarify anything missing, then move the mission to Leads where verified records appear one by one.";
  }
  if (/privacy|secure|data|permission|خصوص|أمان|بيانات|صلاح/.test(value)) {
    return ar
      ? "بيانات الحساب والطلبات والعملاء محفوظة داخل مساحة شركتك ولا تظهر إلا للمستخدمين المخولين. وصلة لا تبيع بياناتك، وتكشف بيانات التواصل فقط ضمن الصلاحيات والرصيد المتاح."
      : "Account, request, and lead data stays inside your company workspace and is visible only to authorized users. Wasla does not sell your data, and contact details are revealed only within your permissions and available credit.";
  }
  if (/chat|history|conversation|محادث|سجل/.test(value)) {
    return ar
      ? "كل محادثة تحفظ عنوانها ورسائلها تلقائياً. استخدم مبدّل المحادثات في الأعلى لبدء محادثة جديدة أو الرجوع إلى طلب سابق، ثم تابع نتائجه من قسم العملاء."
      : "Each conversation automatically keeps its title and messages. Use the chat switcher at the top to start a new chat or reopen an earlier request, then follow its results in Leads.";
  }
  return ar
    ? "وصلة هي مساحة مبيعات مدعومة بالذكاء الاصطناعي: تفهم العميل الذي تريده، تجمع وتثري الحسابات، ترتبها حسب الملاءمة، تدعم البحث العميق، ثم تساعد فريقك على التأهيل والعروض والتواصل من مكان واحد. اسألني عن أي جزء وسأشرحه لك."
    : "Wasla is an AI-assisted sales workspace. It understands your target buyer, sources and enriches accounts, ranks fit, supports deep research, and helps your team qualify, propose, and follow up from one place. Ask me about any part and I’ll explain it.";
}

function localLeadIntake(message: string): IntakeState {
  const lower = message.toLowerCase();
  const isArabic = /[\u0600-\u06ff]/.test(message);
  const hasIndustry = /clinic|restaurant|cafe|coffee|saas|agency|logistics|education|hotel|real estate|عياد|مطعم|مطاعم|مقهى|مقاهي|كافيه|قهوة|تقني|لوجست|تعليم|فندق|فنادق|عقار|تسويق|وكال/.test(lower);
  const hasLocation = /riyadh|jeddah|dubai|saudi|uae|qatar|kuwait|london|usa|uk|رياض|جدة|دبي|السعود|المملكة|الإمارات|الامارات|قطر|كويت|لندن|أمريكا|امريكا|بريطانيا/.test(lower);
  const hasBuyer = /owner|founder|manager|director|head|ceo|marketing|operations|مالك|ملاك|مؤسس|مدير|رئيس|تنفيذي|تسويق|عمليات|صاحب|أصحاب|اصحاب/.test(lower);
  const confidence = [hasIndustry, hasLocation, hasBuyer].filter(Boolean).length * 34;
  const missing = [
    !hasIndustry && (isArabic ? "القطاع المستهدف" : "target industry"),
    !hasLocation && (isArabic ? "المدينة أو السوق" : "location or market"),
    !hasBuyer && (isArabic ? "صانع القرار" : "buyer role or decision maker"),
  ].filter(Boolean) as string[];

  return {
    confidence: Math.min(confidence, 100),
    missing,
    summary: missing.length
      ? (isArabic ? "أحتاج تحديداً أدق قبل استخدام رصيد البحث." : "I need a tighter target before using sourcing credits.")
      : (isArabic ? `${message} مع إعطاء الأولوية للحسابات ذات نية الشراء الواضحة.` : `${message} and prioritize accounts with clear buying intent.`),
    apifyActor: "apify/google-maps-scraper",
    apifyInput: {
      searchStringsArray: [message],
      maxCrawledPlacesPerSearch: 50,
      language: "en",
    },
  };
}

export async function fetchApifyLeads(intake: IntakeState, objective: "buy" | "sell" = "buy", targetLeadCount = 30): Promise<Lead[]> {
  if (intake.channel === "b2c") return fetchB2CLeads(intake, targetLeadCount, objective);
  if (hasDirectus) {
    const actorInput = leadFinderInput(intake);
    actorInput.maxCrawledPlacesPerSearch = safeTargetCount(targetLeadCount);
    const request = await createLeadRequest({
      query: intake.summary,
      criteria: { apify_actor: "compass/crawler-google-places", apify_input: actorInput },
      target_count: safeTargetCount(actorInput.maxCrawledPlacesPerSearch),
    });
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1800 : 2000));
      const rows = await authenticatedRequest<Array<{
        id: string;
        name: string | null;
        title: string | null;
        company: string;
        email: string | null;
        phone: string | null;
        location: string | null;
        industry: string | null;
        source: string;
        fit_score: number;
      }>>("get", `${leadAgentPath}/requests/${request.id}/results?limit=${actorInput.maxCrawledPlacesPerSearch}`);
      if (rows.length) return rows.map(apiLeadToLead);
      const requests = await authenticatedRequest<Array<{ id: string; status: string; error_message?: string | null }>>("get", `${leadAgentPath}/requests`);
      const current = requests.find((item) => item.id === request.id);
      if (current?.status === "failed") throw new Error(current.error_message || "Lead sourcing failed.");
    }
    throw new Error("Lead sourcing is taking longer than expected. The request is still running in Leads.");
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  return [];
}

type ApiWorkspaceLead = {
  id: string;
  name: string | null;
  title: string | null;
  company: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  industry: string | null;
  source: string;
  fit_score: number;
  company_size?: number | null;
  annual_revenue?: string | null;
  qualification_status?: string | null;
  updated_at?: string | null;
  company_image_url?: string | null;
  person_image_url?: string | null;
  website?: string | null;
  revealed?: boolean;
  research_status?: Lead["researchStatus"];
  linkedin_url?: string | null;
  enrichment_summary?: string | null;
};

function apiLeadToLead(row: ApiWorkspaceLead): Lead {
  const revenue = Number(String(row.annual_revenue || "0").replace(/[^0-9.-]/g, ""));
  return {
    id: row.id,
    name: row.name || "",
    title: row.title || "",
    company: row.company,
    email: row.email || "",
    linkedinUrl: row.linkedin_url || undefined,
    qualificationReason: row.enrichment_summary || undefined,
    phone: row.phone || undefined,
    companyImageUrl: row.company_image_url || undefined,
    personImageUrl: row.person_image_url || undefined,
    website: row.website || undefined,
    revealed: row.revealed,
    researchStatus: row.research_status,
    location: row.location || "",
    source: row.source,
    status: row.qualification_status === "qualified" ? "qualified" : "new",
    fitScore: row.fit_score || 70,
    revenueEstimate: Number.isFinite(revenue) ? revenue : 0,
    employees: row.company_size || 0,
    industry: row.industry || "",
    companySlug: row.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    lastSeenUpdateAt: row.updated_at || new Date().toISOString().slice(0, 10),
    tags: [row.industry, row.location].filter(Boolean) as string[],
  };
}

export async function fetchWorkspaceLeads(): Promise<Lead[]> {
  if (!hasDirectus) return [];
  const rows = await authenticatedRequest<ApiWorkspaceLead[]>("get", `${leadAgentPath}/leads?limit=500`);
  return rows.map(apiLeadToLead);
}

export type LeadJob = {
  id: string;
  status: string;
  target_count: number;
  result_count: number;
  error_message?: string | null;
  provider?: string;
  provider_job_id?: string | null;
  b2cCampaign?: B2CCampaign | null;
  created_at?: string;
  updated_at?: string;
};

export type LeadRun = {
  id: string;
  type: "b2b" | "b2c";
  title: string;
  query: string;
  deal_intent: "buy" | "sell";
  status: string;
  target_count: number;
  result_count: number;
  explanation: B2CExplanation | null;
  created_at: string;
  updated_at: string;
};

export type BusinessDocument = {
  id: string;
  file_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: "processing" | "ready" | "partial" | "failed";
  summary: string;
  extracted_data: Record<string, unknown> & { confidence?: number };
  readable_sections: string[];
  unreadable_sections: Array<{ section: string; reason: string }>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessPersona = { profile: GrowthBrandProfile; documents: BusinessDocument[] };

// READY means a brief/campaign exists but sourcing has not started. Treating it
// as active caused every workspace visit to poll forever for a job doing no work.
export const isLeadJobRunning = (job: LeadJob | null) => Boolean(job && ["queued", "running", "sourcing", "dispatched", "processing"].includes(job.status.toLowerCase()));

export function fetchLeadJob(id: string) {
  return authenticatedRequest<LeadJob>("get", `${leadAgentPath}/requests/${encodeURIComponent(id)}`);
}

export function fetchLeadJobs() {
  return authenticatedRequest<LeadJob[]>("get", `${leadAgentPath}/requests`);
}

export function fetchLeadRuns() {
  return authenticatedRequest<LeadRun[]>("get", `${leadAgentPath}/lead-runs`);
}

export async function fetchLeadRunLeads(id: string): Promise<Lead[]> {
  const rows = await authenticatedRequest<ApiWorkspaceLead[]>("get", `${leadAgentPath}/requests/${encodeURIComponent(id)}/results?limit=200`);
  return rows.map(apiLeadToLead);
}

export function fetchBusinessPersona() {
  return authenticatedRequest<BusinessPersona>("get", `${leadAgentPath}/business-persona`);
}

export function uploadBusinessDocument(payload: { file_name: string; mime_type: string; content_base64: string }) {
  return authenticatedRequest<BusinessDocument>("post", `${leadAgentPath}/business-persona/documents`, payload);
}

export function deleteBusinessDocument(id: string) {
  return authenticatedRequest<{ id: string; deleted: boolean }>("delete", `${leadAgentPath}/business-persona/documents/${encodeURIComponent(id)}`);
}

export function confirmBusinessPersona(documentIds?: string[]) {
  return authenticatedRequest<BusinessPersona>("post", `${leadAgentPath}/business-persona/confirm`, { document_ids: documentIds || [] });
}

export function continueB2CCampaign(campaignId: string) {
  return authenticatedRequest<B2CCampaign>("post", `${leadAgentPath}/b2c/campaigns/${encodeURIComponent(campaignId)}/run`, {});
}

// Starting and observing are separate: leaving Chat or refreshing never launches a second paid search.
export async function startLeadGeneration(intake: IntakeState, objective: "buy" | "sell", requestedCount: number): Promise<LeadJob> {
  const count = safeTargetCount(requestedCount);
  if (intake.channel === "b2c") {
    const campaign = await authenticatedRequest<B2CCampaign>("post", `${leadAgentPath}/b2c/campaigns`, {
      prompt: objective === "buy" ? `[PROCUREMENT_FROM_CONSUMERS] ${intake.originalPrompt || intake.summary}` : intake.originalPrompt || intake.summary,
      targetLeadCount: count, planning: intake.b2cPlanning,
    });
    const started = await authenticatedRequest<B2CCampaign>("post", `${leadAgentPath}/b2c/campaigns/${campaign.id}/run`, {});
    return { id: campaign.requestId, status: "sourcing", provider: "b2c", provider_job_id: campaign.id, target_count: count, result_count: 0, b2cCampaign: started };
  }
  const request = await createLeadRequest({
    query: intake.summary,
    criteria: { apify_actor: "compass/crawler-google-places", apify_input: { ...leadFinderInput(intake), maxCrawledPlacesPerSearch: count }, deal_intent: objective },
    target_count: count,
  });
  if (!request.workflow_dispatched) throw new Error("Lead sourcing could not start. No credits have been charged.");
  return { ...request, result_count: 0 };
}

async function fetchB2CLeads(intake: IntakeState, requestedLeadCount: number, objective: "buy" | "sell" = "sell"): Promise<Lead[]> {
  if (!hasDirectus) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return [];
  }
  const targetLeadCount = safeTargetCount(requestedLeadCount);
  const campaign = await authenticatedRequest<B2CCampaign>("post", `${leadAgentPath}/b2c/campaigns`, {
    prompt: objective === "buy" ? `[PROCUREMENT_FROM_CONSUMERS] ${intake.originalPrompt || intake.summary}` : intake.originalPrompt || intake.summary,
    targetLeadCount,
    planning: intake.b2cPlanning,
  });
  await authenticatedRequest<B2CCampaign>("post", `${leadAgentPath}/b2c/campaigns/${campaign.id}/run`, {});
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1200 : 2000));
    const [current, rows] = await Promise.all([
      authenticatedRequest<B2CCampaign>("get", `${leadAgentPath}/b2c/campaigns/${campaign.id}`),
      authenticatedRequest<B2CLead[]>("get", `${leadAgentPath}/b2c/campaigns/${campaign.id}/leads?limit=${targetLeadCount}`),
    ]);
    if (rows.length >= targetLeadCount || current.status === "COMPLETED" || current.status === "PARTIAL") return rows.map(b2cLeadToLead);
    if (current.status === "FAILED") throw new Error(current.errorMessage || "B2C lead sourcing failed.");
  }
  throw new Error("B2C sourcing is taking longer than expected. The campaign is still running in Leads.");
}

function b2cLeadToLead(lead: B2CLead): Lead {
  const primaryEvidence = lead.evidence[0];
  const username = lead.authorUsername || `B2C prospect ${lead.authorId || ""}`.trim();
  return {
    id: lead.inventoryId || lead.id,
    name: username,
    title: lead.marketplaceRole === "SELLER"
      ? (lead.tier === "HOT" ? "Matched individual seller" : "Potential individual seller")
      : (lead.tier === "HOT" ? "High-intent consumer" : "Potential consumer"),
    company: username,
    email: "Protected until reveal",
    phone: lead.phone || undefined,
    location: lead.city || primaryEvidence?.city || "Saudi Arabia",
    source: "b2c",
    status: lead.tier === "HOT" ? "qualified" : "new",
    fitScore: lead.score,
    revenueEstimate: 0,
    employees: 0,
    industry: primaryEvidence?.tags?.[0] || primaryEvidence?.strategyType || "Consumer marketplace",
    companySlug: username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `b2c-${lead.id}`,
    lastSeenUpdateAt: lead.updatedAt || new Date().toISOString().slice(0, 10),
    tags: [...new Set([lead.tier, lead.marketplaceRole, ...(primaryEvidence?.matchedSignals || [])])],
  };
}

function leadFinderInput(intake: IntakeState) {
  const queries = intake.apifyInput.searchStringsArray;
  if (Array.isArray(queries) && queries.length && intake.apifyActor === "compass/crawler-google-places") {
    return { searchStringsArray: queries.filter((query): query is string => typeof query === "string" && Boolean(query.trim())).slice(0, 4), maxCrawledPlacesPerSearch: 30, language: "en", includeWebResults: false };
  }
  const text = `${intake.summary} ${JSON.stringify(intake.apifyInput)}`.toLowerCase();
  const countMatch = text.match(/\b(\d{1,3})\b/);
  const fetchCount = safeTargetCount(countMatch?.[1] || intake.apifyInput.fetch_count || intake.apifyInput.maxCrawledPlacesPerSearch || 20);
  const industry = /dental|dentist|أسنان|اسنان/.test(text)
    ? "dental and cosmetic clinics"
    : /clinic|عياد/.test(text)
      ? "clinics"
      : /restaurant|مطعم/.test(text)
        ? "restaurants"
        : /cafe|coffee|مقاه|قهوة/.test(text)
          ? "cafes"
          : /logistics|لوجست/.test(text)
            ? "logistics companies"
            : /real estate|عقار/.test(text)
              ? "real estate companies"
              : /construction|مقاول|إنشاء|انشاء/.test(text)
                ? "construction companies"
                : /marketing|agency|تسويق|وكال/.test(text)
                  ? "marketing agencies"
                  : "businesses";
  const location = /riyadh|رياض/.test(text)
    ? "Riyadh"
    : /jeddah|جدة/.test(text)
      ? "Jeddah"
      : /dubai|دبي/.test(text)
        ? "Dubai"
        : /uae|emirates|الإمارات|الامارات/.test(text)
          ? "United Arab Emirates"
          : "Saudi Arabia";
  return {
    searchStringsArray: [`${industry} in ${location}`],
    maxCrawledPlacesPerSearch: fetchCount,
    language: "en",
    includeWebResults: false,
  };
}

export async function researchLead(lead: Lead, refresh = false): Promise<CompanyResearch> {
  const result = await authenticatedRequest<ResearchResponse>("post", `${leadAgentPath}/leads/${lead.id}/research`, { refresh });
  return mapResearchReport(lead, result);
}

export async function fetchWorkspaceResearch(): Promise<CompanyResearch[]> {
  const result = await authenticatedRequest<ResearchResponse[]>("get", `${leadAgentPath}/research`);
  return result.map((row) => mapResearchReport({ id: row.lead_id, companySlug: "" }, row));
}

export async function getLeadResearch(lead: Lead): Promise<CompanyResearch | null> {
  if (!hasDirectus) return null;
  const result = await authenticatedRequest<ResearchResponse | null>("get", `${leadAgentPath}/leads/${lead.id}/research`);
  return result ? mapResearchReport(lead, result) : null;
}

type ResearchPerson = { name?: string; title?: string; linkedin_url?: string };
type ResearchNews = { title?: string; summary?: string; date?: string; url?: string };
type ResearchSource = string | { url?: string };
type ResearchResponse = {
  lead_id: string;
  error_message?: string;
  retry_allowed?: boolean;
  status: string;
  updated_at: string;
  report: Record<string, unknown> & {
    strengths?: string[]; risks?: string[]; technologies?: string[]; products_services?: string[];
    hiring_and_growth_signals?: string[]; competitors?: string[]; leadership?: ResearchPerson[];
    recent_news?: ResearchNews[]; sources?: ResearchSource[];
    company_overview?: string; company_description?: string; website?: string; logo_url?: string;
    person_photo_url?: string; market_position?: string; performance_summary?: string;
    size_and_locations?: string; funding_and_revenue?: string;
    pitch_strategy?: { executive_summary?: string; pain_points?: string[]; value_propositions?: string[]; opening_message?: string; discovery_questions?: string[]; objections_and_responses?: Array<{ objection: string; response: string }>; next_best_action?: string };
  };
};

function mapResearchReport(lead: Pick<Lead, "id" | "companySlug">, value: ResearchResponse): CompanyResearch {
  const report = value.report || {};
  return {
    leadId: lead.id,
    companySlug: lead.companySlug,
    status: value.status as CompanyResearch["status"],
    sections: Array.isArray(report.sections) ? report.sections as CompanyResearch["sections"] : undefined,
    markdown: typeof report.markdown === "string" ? report.markdown : undefined,
    errorMessage: value.error_message,
    retryAllowed: value.retry_allowed,
    strengths: report.strengths || [],
    weaknesses: report.risks || [],
    opportunities: report.pitch_strategy?.value_propositions || [],
    technologyStack: report.technologies || [],
    decisionMakers: (report.leadership || []).map((item) => `${item.name || ""}${item.title ? ` — ${item.title}` : ""}`),
    recentUpdates: (report.recent_news || []).map((item) => item.title || "").filter(Boolean),
    sources: (report.sources || []).map((item) => typeof item === "string" ? item : item.url || "").filter(Boolean),
    updatedAt: value.updated_at || new Date().toISOString(),
    companyOverview: report.company_overview,
    companyDescription: report.company_description,
    website: report.website,
    logoUrl: report.logo_url,
    personPhotoUrl: report.person_photo_url,
    marketPosition: report.market_position,
    performanceSummary: report.performance_summary,
    productsServices: report.products_services || [],
    sizeAndLocations: report.size_and_locations,
    leadership: (report.leadership || []).map((item) => ({ name: item.name || "", title: item.title || "", linkedinUrl: item.linkedin_url })),
    recentNews: (report.recent_news || []).map((item) => ({ title: item.title || "", summary: item.summary || "", date: item.date, url: item.url })),
    risks: report.risks || [],
    hiringAndGrowthSignals: report.hiring_and_growth_signals || [],
    fundingAndRevenue: report.funding_and_revenue,
    competitors: report.competitors || [],
    pitchStrategy: report.pitch_strategy ? {
      executiveSummary: report.pitch_strategy.executive_summary,
      painPoints: report.pitch_strategy.pain_points || [],
      valuePropositions: report.pitch_strategy.value_propositions || [],
      openingMessage: report.pitch_strategy.opening_message,
      discoveryQuestions: report.pitch_strategy.discovery_questions || [],
      objectionsAndResponses: report.pitch_strategy.objections_and_responses || [],
      nextBestAction: report.pitch_strategy.next_best_action,
    } : undefined,
  };
}

function safeTargetCount(input: unknown) {
  const count = Number.parseInt(String(input || 20), 10);
  return Number.isFinite(count) ? Math.min(Math.max(count, 1), 200) : 20;
}
