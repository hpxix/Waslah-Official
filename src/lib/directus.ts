import axios from "axios";
import type { IntakeState, Lead } from "../types";

const directusUrl = import.meta.env.VITE_DIRECTUS_URL as string | undefined;
const token = import.meta.env.VITE_DIRECTUS_TOKEN as string | undefined;

export const hasDirectus = Boolean(directusUrl);

const client = axios.create({
  baseURL: directusUrl,
  headers: token ? { Authorization: `Bearer ${token}` } : undefined,
});

export async function runDirectusFlow<T>(path: string, payload: unknown): Promise<T> {
  if (!directusUrl) {
    throw new Error("Directus URL is not configured.");
  }
  const { data } = await client.post(path, payload);
  return data?.data ?? data;
}

export async function understandLeadAsk(message: string, transcript: string[]): Promise<IntakeState> {
  const flowPath = import.meta.env.VITE_DIRECTUS_AI_FLOW_PATH || "/flows/trigger/waslah-ai";
  if (hasDirectus) {
    return runDirectusFlow<IntakeState>(flowPath, { message, transcript });
  }

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
  const flowPath = import.meta.env.VITE_DIRECTUS_APIFY_FLOW_PATH || "/flows/trigger/apify-leads";
  if (hasDirectus) {
    return runDirectusFlow<Lead[]>(flowPath, intake);
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  return [];
}

export async function researchLead(lead: Lead, productSummary: string) {
  const flowPath = import.meta.env.VITE_DIRECTUS_RESEARCH_FLOW_PATH || "/flows/trigger/perplexity-research";
  if (hasDirectus) {
    return runDirectusFlow(flowPath, { lead, productSummary });
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
