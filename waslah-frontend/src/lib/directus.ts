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

export type WaslaConversationResult =
  | { mode: "assistant"; text: string }
  | { mode: "lead"; intake: IntakeState; text: string };

async function chatWithWasla(message: string, transcript: string[], language: "ar" | "en") {
  return authenticatedRequest<{ text: string }>("post", `${leadAgentPath}/chat`, { message, transcript, language });
}

export async function converseWithWasla(message: string, transcript: string[], language: "ar" | "en"): Promise<WaslaConversationResult> {
  const leadRequest = isLeadSearchRequest(message);
  try {
    const [chat, intake] = await Promise.all([
      chatWithWasla(message, transcript, language),
      leadRequest ? understandLeadAsk(message, transcript) : Promise.resolve(null),
    ]);
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
      ? "كل 20 رصيداً تساوي 1 ر.س وتكشف عميلاً واحداً. لا يُخصم شيء أثناء صياغة الطلب؛ الخصم يحدث فقط عند كشف سجل جديد، والسجل نفسه لا يُخصم مرتين. الحسابات الجديدة تحصل على 30 ر.س بعد توثيق الجوال."
      : "Every 20 credits equal 1 SAR and reveal one lead. Drafting a request costs nothing; credit is charged only when a new record is revealed, and the same record is never charged twice. New accounts receive 30 SAR after phone verification.";
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

export async function fetchApifyLeads(intake: IntakeState): Promise<Lead[]> {
  if (hasDirectus) {
    const actorInput = leadFinderInput(intake);
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
      if (rows.length) return rows.map((row) => ({
        id: row.id,
        name: row.name || "Decision maker",
        title: row.title || "Decision maker",
        company: row.company,
        email: row.email || "Protected until reveal",
        phone: row.phone || undefined,
        location: row.location || "",
        source: row.source,
        status: "new",
        fitScore: row.fit_score || 70,
        revenueEstimate: 0,
        employees: 0,
        industry: row.industry || "",
        companySlug: row.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        lastSeenUpdateAt: new Date().toISOString().slice(0, 10),
        tags: [row.industry, row.location].filter(Boolean) as string[],
      }));
      const requests = await authenticatedRequest<Array<{ id: string; status: string; error_message?: string | null }>>("get", `${leadAgentPath}/requests`);
      const current = requests.find((item) => item.id === request.id);
      if (current?.status === "failed") throw new Error(current.error_message || "Lead sourcing failed.");
    }
    throw new Error("Lead sourcing is taking longer than expected. The request is still running in Leads.");
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  return [];
}

function leadFinderInput(intake: IntakeState) {
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
    sources: ["Deep research result", "Company website", "Public business records"],
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

function safeTargetCount(input: unknown) {
  const count = Number.parseInt(String(input || 20), 10);
  return Number.isFinite(count) ? Math.min(Math.max(count, 1), 100) : 20;
}
