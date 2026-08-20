import axios from "axios";
import type { IntakeState, Lead } from "../types";

const directusUrl = (import.meta.env.VITE_DIRECTUS_URL as string | undefined) || "/directus";
const token = import.meta.env.VITE_DIRECTUS_TOKEN as string | undefined;
const leadAgentPath = import.meta.env.VITE_DIRECTUS_LEAD_AGENT_PATH || "/lead-agent";
const authStorageKey = "waslah-directus-session";

type DirectusSession = {
  access_token: string;
  refresh_token: string;
  expires: number;
  expires_at: number;
};

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
  };
  created_at: string;
  is_admin: boolean;
};

export type AdminLead = {
  id: string;
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
  };
};

export type LeadRequestReceipt = {
  id: string;
  status: string;
  target_count: number;
  workflow_dispatched: boolean;
};

export type SocialProvider = "google" | "microsoft" | "apple";

export type SocialIdentity = {
  id: string;
  email: string;
  name: string;
  provider: string;
  profile_complete: boolean;
};

export const hasDirectus = Boolean(directusUrl);

const client = axios.create({
  baseURL: directusUrl,
  withCredentials: true,
});

function readSession(): DirectusSession | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(authStorageKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as DirectusSession;
  } catch {
    window.localStorage.removeItem(authStorageKey);
    return null;
  }
}

function writeSession(session: DirectusSession | null) {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(authStorageKey, JSON.stringify(session));
  else window.localStorage.removeItem(authStorageKey);
}

function sessionToken() {
  return readSession()?.access_token || token;
}

async function refreshSession() {
  const current = readSession();
  if (!current?.refresh_token || !directusUrl) return null;
  try {
    const { data } = await client.post("/auth/refresh", { refresh_token: current.refresh_token, mode: "json" });
    const next = {
      ...data.data,
      expires_at: Date.now() + data.data.expires,
    } as DirectusSession;
    writeSession(next);
    return next.access_token;
  } catch {
    writeSession(null);
    return null;
  }
}

async function authenticatedRequest<T>(method: "get" | "post", path: string, payload?: unknown): Promise<T> {
  const perform = (accessToken?: string) => client.request({
    method,
    url: path,
    data: payload,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  let accessToken = sessionToken();
  try {
    const { data } = await perform(accessToken);
    return data?.data ?? data;
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !readSession()?.refresh_token) throw error;
    accessToken = await refreshSession() || undefined;
    if (!accessToken) throw error;
    const { data } = await perform(accessToken);
    return data?.data ?? data;
  }
}

async function authenticatedRaw<T>(path: string): Promise<T> {
  const perform = (accessToken?: string) => client.get(path, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  let accessToken = sessionToken();
  try {
    const { data } = await perform(accessToken);
    return data as T;
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !readSession()?.refresh_token) throw error;
    accessToken = await refreshSession() || undefined;
    if (!accessToken) throw error;
    const { data } = await perform(accessToken);
    return data as T;
  }
}

export function hasAuthSession() {
  return Boolean(readSession()?.access_token);
}

export async function listSocialProviders() {
  if (!directusUrl) return [] as SocialProvider[];
  const { data } = await client.get("/auth");
  const supported = new Set<SocialProvider>(["google", "microsoft", "apple"]);
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
  const { data } = await client.post("/auth/login", { email, password, mode: "json" });
  const session = {
    ...data.data,
    expires_at: Date.now() + data.data.expires,
  } as DirectusSession;
  writeSession(session);
  return session;
}

export async function logoutAccount() {
  const session = readSession();
  writeSession(null);
  if (session?.refresh_token && directusUrl) {
    await client.post("/auth/logout", { refresh_token: session.refresh_token, mode: "json" }).catch(() => undefined);
  }
}

export function getAccount() {
  return authenticatedRequest<AccountProfile>("get", `${leadAgentPath}/me`);
}

export function fetchAdminLeads(filters: {
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
  return authenticatedRequest<{ status: string; credited: boolean; welcome_credit_sar: number; balance_sar: number }>(
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

export async function runDirectusFlow<T>(path: string, payload: unknown): Promise<T> {
  if (!directusUrl) {
    throw new Error("Directus URL is not configured.");
  }
  const accessToken = sessionToken();
  const { data } = await client.post(path, payload, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  return data?.data ?? data;
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

  return localLeadIntake(message);
}

function localLeadIntake(message: string): IntakeState {
  const lower = message.toLowerCase();
  const hasIndustry = /clinic|restaurant|saas|agency|logistics|education|hotel|real estate|عياد|مطعم|مطاعم|تقني|لوجست|تعليم|فندق|فنادق|عقار|تسويق|وكال/.test(lower);
  const hasLocation = /riyadh|jeddah|dubai|saudi|uae|qatar|kuwait|london|usa|uk|رياض|جدة|دبي|السعود|المملكة|الإمارات|الامارات|قطر|كويت|لندن|أمريكا|امريكا|بريطانيا/.test(lower);
  const hasBuyer = /owner|founder|manager|director|head|ceo|marketing|operations|مالك|ملاك|مؤسس|مدير|رئيس|تنفيذي|تسويق|عمليات|صاحب|أصحاب|اصحاب/.test(lower);
  const confidence = [hasIndustry, hasLocation, hasBuyer].filter(Boolean).length * 34;
  const missing = [
    !hasIndustry && "target industry",
    !hasLocation && "location or market",
    !hasBuyer && "buyer role or decision maker",
  ].filter(Boolean) as string[];

  return {
    confidence: Math.min(confidence, 100),
    missing,
    summary: missing.length
      ? "I need a tighter target before spending Apify credits."
      : `${message} and prioritize accounts with clear buying intent.`,
    apifyActor: "apify/google-maps-scraper",
    apifyInput: {
      searchStringsArray: [message],
      maxCrawledPlacesPerSearch: 50,
      language: "en",
    },
  };
}

export async function fetchApifyLeads(intake: IntakeState): Promise<Lead[]> {
  if (hasDirectus) {
    await createLeadRequest({
      query: intake.summary,
      criteria: { ...intake.apifyInput, apify_actor: intake.apifyActor },
      target_count: safeTargetCount(intake.apifyInput.maxCrawledPlacesPerSearch),
    });
    return [];
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  return [];
}

export async function researchLead(lead: Lead, productSummary: string) {
  const flowPath = import.meta.env.VITE_DIRECTUS_RESEARCH_FLOW_PATH || "/flows/trigger/perplexity-research";
  if (hasDirectus) {
    try {
      return await runDirectusFlow(flowPath, { lead, productSummary });
    } catch {
      // Return a safe placeholder until the optional research flow is configured.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 900));
  return {
    leadId: lead.id,
    companySlug: lead.companySlug,
    strengths: ["Clear niche", "Visible demand signals", "Active online presence"],
    weaknesses: ["Follow-up path is fragmented", "No obvious automated proposal flow"],
    opportunities: ["Personalized outreach tied to recent business activity", "Faster qualification"],
    technologyStack: ["Website", "CRM unknown", "Email marketing unknown"],
    decisionMakers: [lead.title, "Founder", "Marketing lead"],
    recentUpdates: [`Last visible update around ${lead.lastSeenUpdateAt}`],
    sources: ["Perplexity result placeholder", "Company website", "Search results"],
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

function safeTargetCount(input: unknown) {
  const count = Number.parseInt(String(input || 20), 10);
  return Number.isFinite(count) ? Math.min(Math.max(count, 1), 100) : 20;
}
