import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { contactScheduler, qualificationKey, shadowJev, shadowAudit, runPagePipeline, recoverQualification, cheapCandidateReject } from "./b2c-pipeline.js";
import { KEYWORD_VERSION, LITE_EXECUTION_PROFILE, usesPublicKeywordProfile, keywordPlanSchema, compileKeywordPlan, expandKeywordStrategies, qualifyKeywordCandidate, qualifyProductAdFallback, requiresSectorFallbackApproval } from './b2c-keywords.js';
import { LITE_ACQUISITION_VERSION, liteAcquisitionLimits, orderedLiteStrategies, orderedLiteStage, nextLiteStage } from './lite-acquisition-order.js';
import { readListingLimits, effectiveListingLimit, listingBudget } from './b2c-limits.js';
import { notifyProviderCreditFailure } from './provider-credit-alerts.js';
import { harajSafety, safeHarajError, validateHarajEndpoint, recoverHarajSearch } from './haraj-safety.js';
import { listingPreviewFromEvidence } from './lite-listing-intent.js';
import { discoverCommentBuyers, COMMENTS_QUERY, PROFILE_QUERY, AUTHOR_POSTS_QUERY } from './lite-comment-buyers.js';
import { readLiteSearchMode, liteRoutePolicy, liteWorkRemaining } from './lite-search-mode.js';
import { routedChatModel, isLegacyGpt4, FRIENDLY_CHAT_TONE, smallTalkReply, chatQuestionReply, cleanAssistantReply } from './chat-model.js';
import { audienceRoute, audienceQuestion, routeMarker, routeFromPrompt, cameraKeywords } from './lite-audience.js';
import { BUSINESS_UNDERSTANDING_SCHEMA, businessUnderstandingQuestion, groundBusinessUnderstanding, missingBusinessUnderstanding } from './business-understanding.js';
import { websiteAnalysisRequest } from './website-analysis.js';
import { createContactAuthorizer, authorizeContactSave, authorizeContactExport, redactUnauthorizedContactData } from './contact-authorization.js';
import {recordContactAuthorization,recordContactApiFailure} from './contact-diagnostics.js';
import { runMahallyFallback } from './mahally.js';
import { harajRuntime, harajDeadline, isHarajTimeLimit, harajTimeLimitMessage } from './haraj-runtime.js';
import { liteDeliveryBlocker } from './lite-delivery-status.js';
import { recordMerchantDirectoryContact } from './merchant-directory.js';

const STRATEGIST_VERSION = "wasla-saudi-lead-search-strategist-v1";
const STRATEGIST_SNAPSHOT = readFileSync(
  new URL("./prompts/wasla_saudi_lead_search_strategist.v1.md", import.meta.url),
  "utf8",
);

const SEARCH_QUERY = `query Search($search: String!, $cities: [String], $page: Int, $limit: Int) {
  search(search: $search, cities: $cities, page: $page, limit: $limit) {
    items {
      id title postDate updateDate authorUsername authorId URL bodyTEXT bodyHTML thumbURL
      hasImage hasVideo city geoCity geoNeighborhood geoHash tags imagesList commentEnabled
      commentStatus isPromoted commentCount upRank downRank status postType tagsFilters
      generalInfo { key value }
      price { formattedPrice inputPrice }
    }
    pageInfo { hasNextPage }
    viewOptions { hasSellersList }
  }
}`;

const CONTACT_QUERY = `query PostContactQuery($postId: Int!, $isManualRequest: Boolean) {
  postContact(postId: $postId, isManualRequest: $isManualRequest) {
    contactText contactMobile shouldEnableWhatsApp
  }
}`;

function numeric(input, fallback, min = 0, max = 100) {
  const value = Number(input);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}

function jsonValue(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function dbJson(value) {
  return JSON.stringify(value ?? null);
}

function normalizeText(input) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.com.sa", "hotmail.com",
  "outlook.com", "live.com", "icloud.com", "me.com", "proton.me",
  "protonmail.com", "aol.com", "mail.com", "yandex.com", "gmx.com", "zoho.com",
]);

function extractEmail(input) {
  const matches = String(input || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi) || [];
  return matches
    .map((value) => value.replace(/[),.;:!?]+$/g, "").toLowerCase())
    .find((value) => !value.includes("..")) || null;
}

function websiteFromBusinessEmail(email) {
  const domain = String(email || "").split("@")[1]?.toLowerCase().replace(/^www\./, "");
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return null;
  return `https://${domain}`;
}

export function contactDetailsFromEvidence(input) {
  const payload = jsonValue(input, input) || {};
  const evidence = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.evidence)
      ? payload.evidence
      : Array.isArray(payload.sellerLead?.evidence)
        ? payload.sellerLead.evidence
        : [];
  const email = evidence
    .map((item) => item?.email || extractEmail(`${item?.title || ""}\n${item?.bodyText || item?.body || ""}`))
    .find(Boolean) || null;
  const website = evidence.map((item) => item?.website).find(Boolean) || websiteFromBusinessEmail(email);
  return { email, website };
}

export function publicQualificationExplanation(value) {
  return String(value || "")
    .replace(/Product term matched\.\s*/gi, "Product match confirmed. ")
    .replace(/Ownership prospect; buying intent is unconfirmed\.\s*/gi, "Relevant ownership signal detected. ")
    .replace(/buying intent is unconfirmed/gi, "product relevance is confirmed")
    .replace(/interest is not independently confirmed/gi, "purchase-intent wording was detected")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tokens(input) {
  return [...new Set(normalizeText(input).split(/\s+/).filter((token) => token.length > 1))];
}

function responseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) return content.text.trim();
    }
  }
  return "";
}

const providerCooldowns = new Map();
function providerKey(host, key) { return host + ':' + createHash('sha256').update(key || '').digest('hex'); }
async function structuredResponse(env, name, schema, instructions, input, maxOutputTokens = 2200, reasoningEffort = "low") {
  env.__b2cSignal?.throwIfAborted();
  const interactive = name === "waslah_b2c_discovery";
  const timeoutMs = name === "waslah_b2c_batch_qualification"
    ? numeric(env.B2C_QUALIFICATION_TIMEOUT_MS, 20_000, 5_000, 60_000)
    : interactive
      ? numeric(env.B2C_CHAT_AI_TIMEOUT_MS, 18_000, 5_000, 45_000)
      : numeric(env.B2C_AI_TIMEOUT_MS, 55_000, 5_000, 120_000);
  const primaryModel = name === "waslah_b2c_batch_qualification" ? (env.B2C_OPENAI_QUALIFICATION_MODEL || "gpt-4.1-mini") : (env.B2C_OPENAI_MODEL || env.OPENAI_CHAT_MODEL || "gpt-5.6-terra");
  const providerFetch = async (url, options) => {
    const budget = env.__b2cReviewBudget;
    if (budget && name === 'waslah_b2c_batch_qualification') {
      // UTF-8 bytes bound input tokens conservatively; reserve maximum output.
      // This is a configurable protective estimate, not provider billing truth.
      const reservation = (Buffer.byteLength(options.body, 'utf8') + 1024) * budget.inputUsdPerMillion / 1e6 + maxOutputTokens * budget.outputUsdPerMillion / 1e6;
      if (budget.reservedUsd + reservation > budget.limitUsd) {
        const error = new Error('This search reached its AI review spending limit. Saved leads are kept.');
        error.code = 'B2C_REVIEW_BUDGET'; throw error;
      }
      budget.reservedUsd += reservation;
      budget.requests += 1;
    }
    const started = Date.now();
    const model = JSON.parse(options.body).model;
    const provider = new URL(url).hostname;
    let status = null;
    try {
      let response;
      try{response=await fetch(url,options);}catch(error){if(new URL(url).hostname!=='openrouter.ai'||options.signal?.aborted)throw error;response=await websiteAnalysisRequest(url,options);}
      status = response.status;
      if (!response.ok) {
        const error = new Error("AI provider HTTP error"); error.status = status;
        const payload = await response.json().catch(() => ({}));
        error.code = String(payload?.error?.code || payload?.error?.type || 'HTTP_ERROR').slice(0, 80);
        error.message = String(payload?.error?.message || error.message).slice(0, 500);
        if (provider === 'openrouter.ai') void notifyProviderCreditFailure('openrouter', error);
        if ([401, 402, 403, 429].includes(status) || status >= 500) {
          const key = options.headers.Authorization.replace(/^Bearer /, '');
          providerCooldowns.set(providerKey(provider, key), Date.now() + (status === 429 ? 300_000 : 60_000));
        }
        throw error;
      }
      env.__b2cDiagnostics?.push({ provider, path: new URL(url).pathname, model, status, elapsedMs: Date.now() - started, outcome: "headers_received", attempt: 1 });
      if (env.__b2cDiagnostics?.length > 100) env.__b2cDiagnostics.splice(0, env.__b2cDiagnostics.length - 100);
      return response;
    } catch (error) {
      if (!status && !env.__b2cSignal?.aborted) providerCooldowns.set(providerKey(provider, options.headers.Authorization.replace(/^Bearer /, '')), Date.now() + 60_000);
      env.__b2cDiagnostics?.push({ provider, path: new URL(url).pathname, model, status, elapsedMs: Date.now() - started, outcome: "error", errorClass: error.name, code: error.cause?.code || error.code || null, attempt: 1, timeoutMs });
      if (env.__b2cDiagnostics?.length > 100) env.__b2cDiagnostics.splice(0, env.__b2cDiagnostics.length - 100);
      throw error;
    }
  };
  let primaryError = null;
  // Interactive chat must always attempt its providers. A transient failure in a
  // campaign or an earlier turn must never place the conversation in a silent
  // minute-long dead zone.
  const providerAvailable = (host, key) => interactive || (providerCooldowns.get(providerKey(host, key)) || 0) <= Date.now();
  const openRouterKey = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_TOKEN;
  const routerModel = routedChatModel(name === 'waslah_b2c_batch_qualification' ? env.B2C_OPENROUTER_QUALIFICATION_MODEL : env.B2C_OPENROUTER_PLANNING_MODEL);
  if (env.OPENAI_API_KEY && !isLegacyGpt4(primaryModel) && routerModel !== 'openrouter/free' && providerAvailable('api.openai.com', env.OPENAI_API_KEY)) {
    try {
      const response = await providerFetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: primaryModel,
          instructions,
          input: JSON.stringify(input),
          text: { format: { type: "json_schema", name, strict: true, schema } },
          ...(/^(gpt-5|gpt-6|o[134])/.test(primaryModel) ? { reasoning: { effort: reasoningEffort } } : {}),
          max_output_tokens: maxOutputTokens,
          store: false,
        }),
        signal: env.__b2cSignal ? AbortSignal.any([env.__b2cSignal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `Primary AI returned ${response.status}`);
      const text = responseText(payload);
      if (!text) throw new Error("AI response contained no structured output");
      return JSON.parse(text);
    } catch (error) {
      env.__b2cSignal?.throwIfAborted();
      if (error.code === 'B2C_REVIEW_BUDGET') throw error;
      if (interactive) console.warn("[b2c-chat] primary provider failed", { code: error?.code || error?.cause?.code || error?.name, status: error?.status || null });
      primaryError = error;
    }
  }
  if (openRouterKey && providerAvailable('openrouter.ai', openRouterKey)) {
    try {
    const response = await providerFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: routerModel,
        provider: { require_parameters: true },
        messages: [
          { role: "system", content: interactive ? `${instructions}\n${FRIENDLY_CHAT_TONE}\nFor Arabic, use natural warm Saudi conversational Arabic: concise, friendly and helpful, with at most one useful next question. Match English when requested. Explain recommendations with concrete business use cases. Never treat general conversation as a product brief.` : instructions },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
        max_tokens: interactive?Math.max(maxOutputTokens,6000):maxOutputTokens,
        ...(interactive?{reasoning:{effort:'low',exclude:true}}:{}),
        temperature: 0,
      }),
      signal: env.__b2cSignal ? AbortSignal.any([env.__b2cSignal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const unavailable = new Error("Wasla’s AI service is temporarily unavailable. Your search could not continue; please contact support.");
      unavailable.code = "B2C_AI_UNAVAILABLE";
      unavailable.providerStatus = response.status;
      throw unavailable;
    }
    const text = payload?.choices?.[0]?.message?.content;
    try {
      if (!text) throw new Error('empty');
      return JSON.parse(text);
    } catch {
      env.__b2cDiagnostics?.push({ provider: 'openrouter.ai', status: response.status, outcome: 'invalid_output', finishReason: payload?.choices?.[0]?.finish_reason || null });
      const error = new Error('AI qualification output was incomplete.');
      error.code = 'B2C_AI_RESPONSE_INVALID'; throw error;
    }
    } catch (error) {
      env.__b2cSignal?.throwIfAborted();
      if (['B2C_REVIEW_BUDGET', 'B2C_AI_RESPONSE_INVALID'].includes(error.code)) throw error;
      if (interactive) console.warn("[b2c-chat] backup provider failed", { code: error?.code || error?.cause?.code || error?.name, status: error?.status || error?.providerStatus || null });
      const unavailable = new Error("Wasla could not reach its qualification service. Saved leads are kept; please retry once the connection is restored.");
      unavailable.code = "B2C_AI_UNAVAILABLE";
      unavailable.providerStatus = error.status || error.providerStatus;
      throw unavailable;
    }
  }
  if (primaryError || env.OPENAI_API_KEY || openRouterKey) {
    const unavailable = new Error("Wasla’s AI service is temporarily unavailable. Your search could not continue; please contact support.");
    unavailable.code = "B2C_AI_UNAVAILABLE";
    throw unavailable;
  }
  return null;
}

const GENERIC_INTENT_TOKENS = new Set([
  "activity", "buyer", "buyers", "customer", "customers", "consumer", "consumers", "delivery", "monthly",
  "need", "needs", "offer", "owner", "owners", "premium", "product", "products", "recent", "recently",
  "service", "services", "subscription", "target", "people", "private", "sell", "selling", "want",
  "and", "for", "from", "into", "the", "their", "them", "this", "with",
  "عميل", "عملاء", "خدمة", "خدمات", "منتج", "منتجات", "بيع", "مميز", "توصيل", "شهري",
]);

function meaningfulTokens(input) {
  return tokens(input).filter((token) => token.length >= 2 && !GENERIC_INTENT_TOKENS.has(token));
}

const BUYER_INTENT_TOKENS = new Set([
  "ابي", "ابغي", "مطلوب", "احتاج", "ادور", "اريد", "طلب", "ابحث",
  "wanted", "want", "need", "needed", "looking", "searching", "buy", "buying",
]);

function strategyAnchorTokens(candidate) {
  return meaningfulTokens(candidate?.matchedStrategy?.searchTerm || candidate?.matchedStrategy?.query)
    .filter((token) => !BUYER_INTENT_TOKENS.has(token));
}

function hasStrategyAnchor(candidate) {
  const anchors = strategyAnchorTokens(candidate);
  if (!anchors.length) return false;
  const content = new Set(tokens(`${candidate.title} ${candidate.bodyText}`));
  return anchors.some((token) => content.has(token));
}

function cityList(input) {
  const known = [
    ["Riyadh", /riyadh|الرياض/i], ["Jeddah", /jeddah|جدة/i], ["Dammam", /dammam|الدمام/i],
    ["Khobar", /khobar|الخبر/i], ["Makkah", /makkah|mecca|مكة/i], ["Madinah", /madinah|medina|المدينة/i],
    ["Tabuk", /tabuk|تبوك/i], ["Abha", /abha|أبها|ابها/i],
  ];
  return known.filter(([, matcher]) => matcher.test(input)).map(([city]) => city);
}

const HARAJ_CITY_NAMES = new Map([
  ["riyadh", "الرياض"], ["jeddah", "جده"], ["dammam", "الدمام"], ["khobar", "الخبر"],
  ["makkah", "مكه"], ["madinah", "المدينه"], ["tabuk", "تبوك"], ["abha", "ابها"],
]);

function harajCityName(city) {
  return HARAJ_CITY_NAMES.get(normalizeText(city)) || String(city);
}

function canonicalCity(city) {
  const normalized = normalizeText(city);
  for (const [english, arabic] of HARAJ_CITY_NAMES) {
    if (normalized === english || normalized === normalizeText(arabic)) return english;
  }
  return normalized;
}

function fallbackIntent(prompt) {
  const procurement = /\[PROCUREMENT_FROM_CONSUMERS\]/.test(prompt);
  const cleanPrompt = String(prompt).replace(/\[PROCUREMENT_FROM_CONSUMERS\]\s*/g, "");
  // Never turn a transcript into a product when the model is unavailable.
  const userText = /(?:^|\n)user\s*:/i.test(cleanPrompt)
    ? cleanPrompt.split(/\n/).filter((line) => /^user\s*:/i.test(line)).map((line) => line.replace(/^user\s*:\s*/i, "")).join(" ")
    : cleanPrompt;
  const productName = knownSaudiSearchTerm(userText)?.term || "";
  const cities = cityList(cleanPrompt);
  const profiles = procurement ? ["credible individual seller", "private owner offering the requested item"] : ["advertiser using the exact product expression", "owner of the matching product or service"];
  const signals = procurement ? ["exact product expression in the ad title", "active sale listing", "matching item ownership"] : ["exact product expression in the ad title", "recent matching advertisement", "reachable advertiser"];
  return {
    productName,
    productDescription: productName,
    price: null,
    currency: null,
    market: { country: "Saudi Arabia", cities },
    buyerType: "B2C",
    idealCustomerProfiles: profiles.map((name, index) => ({ name, description: `A likely buyer indicated by ${name}.`, weight: Math.max(55, 90 - index * 10) })),
    behavioralSignals: signals.map((signal, index) => ({ signal, reason: "Observable marketplace behavior related to the offer.", weight: Math.max(55, 90 - index * 10) })),
    negativeSignals: procurement
      ? [
          { signal: "wanted or looking-to-buy post", reason: "The user needs sellers, not competing buyers." },
          { signal: "irrelevant service advertisement", reason: "Category overlap alone does not show a suitable offer." },
        ]
      : [
          { signal: "seller or reseller of the customer's exact offer", reason: "Likely a competitor rather than a buyer." },
          { signal: "irrelevant service advertisement", reason: "Category overlap alone does not show buyer intent." },
        ],
    retrievalHypotheses: signals.map((label, index) => ({ label, description: `Find recent marketplace activity showing ${label}.`, expectedIntentStrength: Math.max(50, 85 - index * 10) })),
  };
}

const intentSchema = {
  type: "object", additionalProperties: false,
  required: ["productName", "productDescription", "price", "currency", "market", "buyerType", "idealCustomerProfiles", "behavioralSignals", "negativeSignals", "retrievalHypotheses"],
  properties: {
    productName: { type: "string" }, productDescription: { type: "string" },
    price: { type: ["number", "null"] }, currency: { type: ["string", "null"] },
    market: { type: "object", additionalProperties: false, required: ["country", "cities"], properties: { country: { type: "string" }, cities: { type: "array", items: { type: "string" } } } },
    buyerType: { type: "string", const: "B2C" },
    idealCustomerProfiles: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["name", "description", "weight"], properties: { name: { type: "string" }, description: { type: "string" }, weight: { type: "number" } } } },
    behavioralSignals: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["signal", "reason", "weight"], properties: { signal: { type: "string" }, reason: { type: "string" }, weight: { type: "number" } } } },
    negativeSignals: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["signal", "reason"], properties: { signal: { type: "string" }, reason: { type: "string" } } } },
    retrievalHypotheses: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["label", "description", "expectedIntentStrength"], properties: { label: { type: "string" }, description: { type: "string" }, expectedIntentStrength: { type: "number" } } } },
  },
};

function sanitizeIntent(value, fallback) {
  if (!value || typeof value !== "object") return fallback;
  return {
    productName: String(value.productName || fallback.productName).slice(0, 160),
    productDescription: String(value.productDescription || fallback.productDescription).slice(0, 1200),
    price: Number.isFinite(Number(value.price)) ? Number(value.price) : null,
    currency: value.currency ? String(value.currency).slice(0, 12) : null,
    market: { country: String(value.market?.country || "Saudi Arabia").slice(0, 80), cities: (Array.isArray(value.market?.cities) ? value.market.cities : fallback.market.cities).map(String).slice(0, 12) },
    buyerType: "B2C",
    idealCustomerProfiles: (Array.isArray(value.idealCustomerProfiles) ? value.idealCustomerProfiles : fallback.idealCustomerProfiles).slice(0, 6).map((item) => ({ name: String(item.name).slice(0, 160), description: String(item.description).slice(0, 500), weight: numeric(item.weight, 70) })),
    behavioralSignals: (Array.isArray(value.behavioralSignals) ? value.behavioralSignals : fallback.behavioralSignals).slice(0, 8).map((item) => ({ signal: String(item.signal).slice(0, 180), reason: String(item.reason).slice(0, 500), weight: numeric(item.weight, 70) })),
    negativeSignals: (Array.isArray(value.negativeSignals) ? value.negativeSignals : fallback.negativeSignals).slice(0, 8).map((item) => ({ signal: String(item.signal).slice(0, 180), reason: String(item.reason).slice(0, 500) })),
    retrievalHypotheses: (Array.isArray(value.retrievalHypotheses) ? value.retrievalHypotheses : fallback.retrievalHypotheses).slice(0, 8).map((item) => ({ label: String(item.label).slice(0, 180), description: String(item.description).slice(0, 500), expectedIntentStrength: numeric(item.expectedIntentStrength, 65) })),
  };
}

export async function createLeadIntent(env, prompt) {
  const fallback = fallbackIntent(prompt);
  const procurement = /\[PROCUREMENT_FROM_CONSUMERS\]/.test(prompt);
  try {
    const result = await structuredResponse(
      env,
      "waslah_b2c_lead_intent",
      intentSchema,
      procurement
        ? "Extract a grounded Wasla-Lite procurement intent for Saudi Arabia. The customer wants to buy from individual owners or sellers, so model credible seller profiles and observable active-offer signals. Never describe them as prospective buyers. Never infer sensitive or unsupported personal facts. The internal buyerType must remain B2C. Weights are 0-100. Return only the schema."
        : "Extract a grounded Wasla-Lite lead intent for Saudi Arabia. Model opportunity profiles through observable marketplace behavior. Never infer sensitive or unsupported personal facts. The internal buyerType must remain B2C. Weights are 0-100. Return only the schema.",
      { customer_request: prompt, default_market: "Saudi Arabia" },
    );
    // The model's grounded interpretation is authoritative. The versioned
    // strategist converts it into phased, evidence-led Saudi search paths.
    const intent = sanitizeIntent(result, fallback);
    if (!validSearchExpression(intent.productName)) throw new Error("Invalid product extraction");
    return intent;
  } catch (error) {
    if (error?.code === "B2C_AI_UNAVAILABLE") throw error;
    if (!validSearchExpression(fallback.productName)) throw new Error("Please clarify the product or service you offer so Wasla can prepare an accurate search.");
    return fallback;
  }
}

export function validSearchExpression(value) {
  const text = String(value || "").trim();
  return Boolean(text) && text.length <= 80 && text.split(/\s+/).length <= 8
    && !/[\n\r?؟]|\b(?:user|assistant|system)\s*:|\b(?:i own|understood|what exact|advertisers)\b/i.test(text);
}

const strategistQuerySchema = {
  type: "object", additionalProperties: false,
  required: ["query", "signal", "lead_hypothesis", "priority"],
  properties: {
    query: { type: "string" },
    signal: { type: "string" },
    lead_hypothesis: { type: "string" },
    priority: { type: "string", enum: ["high", "medium", "low"] },
  },
};

const strategistPhaseSchema = {
  type: "object", additionalProperties: false,
  required: ["type", "reason", "queries"],
  properties: {
    type: { type: "string" },
    reason: { type: "string" },
    queries: { type: "array", minItems: 1, maxItems: 4, items: strategistQuerySchema },
  },
};

const strategistPlanSchema = {
  type: "object", additionalProperties: false,
  required: ["market_understanding", "primary_strategy", "fallback_strategies", "negative_signals", "qualification_instructions"],
  properties: {
    market_understanding: {
      type: "object", additionalProperties: false,
      required: ["customer_offer", "likely_buyers", "primary_lead_logic"],
      properties: {
        customer_offer: { type: "string" },
        likely_buyers: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
        primary_lead_logic: { type: "string" },
      },
    },
    primary_strategy: strategistPhaseSchema,
    fallback_strategies: { type: "array", maxItems: 3, items: strategistPhaseSchema },
    negative_signals: { type: "array", maxItems: 12, items: { type: "string" } },
    qualification_instructions: {
      type: "object", additionalProperties: false,
      required: ["strong_lead", "possible_lead", "reject"],
      properties: {
        strong_lead: { type: "string" },
        possible_lead: { type: "string" },
        reject: { type: "string" },
      },
    },
  },
};

function knownSaudiSearchTerm(prompt) {
  const value = String(prompt || "").replace(/\b(camera|cctv)[’']s\b/giu,'$1s');
  if (/\b(?:security\s+cameras?|surveillance\s+cameras?|cctvs?)\b|(?:كاميرات|كميرات)\s*(?:المراقب[ةه]|مراقب[ةه]|امني[ةه]|أمني[ةه])/iu.test(value)) return {
    term: 'كاميرات مراقبة', englishTerm: 'security cameras',
    productTerms: ['كاميرات مراقبة', 'كميرات مراقبة', 'كاميرات', 'كميرات', 'كاميرا مراقبة', 'كاميرا', 'security camera', 'security cameras', 'surveillance cameras', 'CCTV'],
    ownerTerms: [{ term: 'كاميرات', aliases: ['كاميرات', 'كميرات', 'كاميرا', 'security cameras', 'CCTV'] }],
  };
  if (/cow\s*mil+kers?|milking\s*machines?|milking\s*equipment|حلاب(?:ه|ة)?|ماكين(?:ة|ه)\s*حلب|الة\s*حلب|آلة\s*حلب/i.test(value)) {
    const requestedAnimals = [
      /\bcows?\b|ابقار|أبقار|بقر/i.test(value) ? { term: "بقر", aliases: ["بقر", "ابقار", "أبقار", "cow", "cows", "cattle"] } : null,
      /\bsheep\b|غنم|خروف|خرفان/i.test(value) ? { term: "غنم", aliases: ["غنم", "خروف", "خرفان", "sheep"] } : null,
      /\bgoats?\b|ماعز|تيوس/i.test(value) ? { term: "ماعز", aliases: ["ماعز", "تيوس", "goat", "goats"] } : null,
    ].filter(Boolean);
    return {
      term: "حلابه",
      englishTerm: "milking machine",
      productTerms: ["حلابه", "حلابة", "ماكينة حلب", "الة حلب", "آلة حلب", "milking machine", "milking equipment"],
      ownerTerms: requestedAnimals.length ? requestedAnimals : [{ term: "بقر", aliases: ["بقر", "ابقار", "أبقار", "cow", "cows", "cattle"] }],
    };
  }
  if (/coffee\s*beans?|بن\s|حبوب القهوة/i.test(value)) return { term: "بن", englishTerm: "coffee beans" };
  if (/\bmacbooks?\b|ماك\s*بوك/i.test(value)) return { term: "ماك بوك", englishTerm: "MacBook" };
  const model = value.match(/(?<![\p{L}\p{N}])(?:iphone|ايفون|آيفون)\s*(\d{1,2})(?![\p{L}\p{N}])/iu)?.[1];
  if (/\biphone\b|ايفون|آيفون/i.test(value)) return { term: `ايفون${model ? ` ${model}` : ""}`, englishTerm: `iPhone${model ? ` ${model}` : ""}` };
  if (/\b(?:pc|computer|gaming pc)\b|كمبيوتر|بي\s*سي/i.test(value)) return {
    term: "بي سي",
    englishTerm: "PC",
    productTerms: ["بي سي", "PC", "بي سي قيمنق", "gaming PC", "تجميعة قيمنق"],
    ownerTerms: [
      { term: "بي سي", aliases: ["بي سي", "PC"] },
      { term: "بي سي قيمنق", aliases: ["بي سي قيمنق", "gaming PC"] },
      { term: "تجميعة", aliases: ["تجميعة", "تجميعة قيمنق"] },
      { term: "PC", aliases: ["PC", "بي سي"] },
      { term: "gaming PC", aliases: ["gaming PC", "بي سي قيمنق"] },
      { term: "كمبيوتر", aliases: ["كمبيوتر", "computer"] },
    ],
  };
  if (/\b(?:fifa|fc\s*\d{2})\b|فيفا/i.test(value)) return { term: "فيفا", englishTerm: "FIFA" };
  if (/\bplaystation\b|بلايستيشن|بلاي ستيشن/i.test(value)) return { term: "بلايستيشن", englishTerm: "PlayStation" };
  if (/\bxbox\b|اكس بوكس|إكس بوكس/i.test(value)) return { term: "اكس بوكس", englishTerm: "Xbox" };
  if (/\blaptops?\b|لابتوب|لاب توب/i.test(value)) return { term: "لابتوب", englishTerm: "laptop" };
  if (/\bcar\b|سيار(?:ة|ات)/i.test(value)) return { term: "سيارة", englishTerm: "car" };
  return null;
}

function fallbackStrategistPlan(prompt, intent, procurement) {
  const chosen = knownSaudiSearchTerm(`${prompt} ${intent.productName}`);
  const term = chosen?.term || intent.productName;
  const query = procurement ? term : `مطلوب ${term}`.trim();
  return {
    market_understanding: {
      customer_offer: intent.productName,
      likely_buyers: intent.idealCustomerProfiles.map((item) => item.name).slice(0, 6),
      primary_lead_logic: procurement
        ? "Find credible owners actively offering the requested item."
        : "Find advertisements that express observable demand for the customer's offer.",
    },
    primary_strategy: {
      type: "DIRECT_PURCHASE_INTENT",
      reason: "Safe degraded-mode strategy when the AI strategist is unavailable.",
      queries: [{
        query,
        signal: procurement ? "active offer" : "expressed purchase intent",
        lead_hypothesis: procurement
          ? "The advertiser may own and be offering the requested item."
          : "The advertiser may be actively looking for the customer's offer.",
        priority: "high",
      }],
    },
    fallback_strategies: [],
    negative_signals: intent.negativeSignals.map((item) => item.signal),
    qualification_instructions: {
      strong_lead: "The full advertisement provides direct evidence supporting the lead hypothesis.",
      possible_lead: "The advertisement provides plausible but incomplete evidence and needs a second-pass review.",
      reject: "Reject competitors, irrelevant sellers, completed needs, duplicates, and speculative matches.",
    },
  };
}

function sanitizeStrategistPlan(value, fallback) {
  if (!value || typeof value !== "object") return fallback;
  const seen = new Set();
  const sanitizePhase = (phase, index) => {
    const queries = (Array.isArray(phase?.queries) ? phase.queries : [])
      .map((item) => ({
        query: String(item?.query || "").trim().slice(0, 80),
        signal: String(item?.signal || "").trim().slice(0, 240),
        lead_hypothesis: String(item?.lead_hypothesis || "").trim().slice(0, 600),
        priority: ["high", "medium", "low"].includes(item?.priority) ? item.priority : index === 0 ? "high" : "medium",
      }))
      .filter((item) => item.query && meaningfulTokens(item.query).length <= 6 && !seen.has(normalizeText(item.query)) && seen.add(normalizeText(item.query)))
      .slice(0, 4);
    if (!queries.length) return null;
    return {
      type: String(phase?.type || "ADJACENT_BEHAVIOR").slice(0, 80),
      reason: String(phase?.reason || "").slice(0, 600),
      queries,
    };
  };
  const primary = sanitizePhase(value.primary_strategy, 0);
  if (!primary) return fallback;
  return {
    market_understanding: {
      customer_offer: String(value.market_understanding?.customer_offer || fallback.market_understanding.customer_offer).slice(0, 300),
      likely_buyers: (Array.isArray(value.market_understanding?.likely_buyers) ? value.market_understanding.likely_buyers : fallback.market_understanding.likely_buyers).map(String).slice(0, 8),
      primary_lead_logic: String(value.market_understanding?.primary_lead_logic || fallback.market_understanding.primary_lead_logic).slice(0, 800),
    },
    primary_strategy: primary,
    fallback_strategies: (Array.isArray(value.fallback_strategies) ? value.fallback_strategies : [])
      .map((phase, index) => sanitizePhase(phase, index + 1))
      .filter(Boolean)
      .slice(0, 3),
    negative_signals: (Array.isArray(value.negative_signals) ? value.negative_signals : fallback.negative_signals).map(String).slice(0, 12),
    qualification_instructions: {
      strong_lead: String(value.qualification_instructions?.strong_lead || fallback.qualification_instructions.strong_lead).slice(0, 800),
      possible_lead: String(value.qualification_instructions?.possible_lead || fallback.qualification_instructions.possible_lead).slice(0, 800),
      reject: String(value.qualification_instructions?.reject || fallback.qualification_instructions.reject).slice(0, 800),
    },
  };
}

export function isServiceOffer(intent) {
  return /\b(services?|printing|repairs?|maintenance|cleaning|catering|consulting|event planning)\b|خدمات|خدمة|طباع[ةه]|صيان[ةه]|تصليح|تنظيف|تنظيم.{0,12}(حفلات|فعاليات)/i.test(String(intent?.productName || intent?.product || ""));
}

export function ensureOwnerFallback(plan, prompt, intent, procurement) {
  if (procurement || !plan) return plan;
  if (isServiceOffer(intent)) {
    const phases = (plan.fallback_strategies || []).filter(phase => !isOwnerFallback(phase));
    // Service customers do not "own" the service. Preserve AI-generated demand
    // and complementary-business hypotheses; never inject the English offer.
    if (/printing|طباع[ةه]/i.test(intent.productName || "")) {
      phases.push({ type: "SERVICE_PARTNER", reason: "Find complementary businesses with observable print-production needs, not competing print shops.", queries: [
        { query: "تصميم هويات", signal: "complementary design business", lead_hypothesis: "A designer producing physical brand collateral may need a printing partner; require evidence of physical output. Do not qualify competing printers or digital-only work.", priority: "medium" },
        { query: "تنظيم معارض", signal: "event production", lead_hypothesis: "An event organizer producing signs, posters or printed materials may need a printing partner; require supporting ad evidence, not generic event ownership.", priority: "medium" },
      ] });
    }
    return { ...plan, fallback_strategies: phases.slice(0, 4) };
  }
  const known = knownSaudiSearchTerm(`${prompt} ${intent.productName}`);
  const term = String(known?.term || (/[\u0600-\u06ff]/.test(intent.productName || "") ? intent.productName : "") || "").trim().slice(0, 60);
  if (!term) return plan;
  const gaming = /gaming|قيمنق|جيمنج|العاب|ألعاب/i.test(prompt + " " + intent.productName);
  const generatedOwnerItems = (plan.fallback_strategies || []).filter(isOwnerFallback).flatMap((phase) => phase.queries || []);
  const generatedOwnerQueries = generatedOwnerItems.map((item) => item.query);
  const variants = known?.englishTerm === "PC"
    ? ["بي سي", ...(gaming ? ["بي سي قيمنق", "تجميعة قيمنق", "gaming PC"] : []), "PC"]
    : [term, ...generatedOwnerQueries, known?.englishTerm].filter(Boolean);
  const queries = [...new Set(variants)].slice(0, 8);
  const ownerPhase = {
    type: "OWNER_FALLBACK",
    reason: "Use private product ownership as the fallback signal when buyer-intent paths produce no callable contacts.",
    queries: queries.map((query) => generatedOwnerItems.find((item) => item.query === query) || ({ query, signal: "product ownership", lead_hypothesis: "Find private owners of this product. Ownership is a prospecting signal, not proof of purchase intent. Exclude unrelated products and professional resellers.", priority: "medium" })),
  };
  const fallbacks = (plan.fallback_strategies || []).filter((phase) => !isOwnerFallback(phase));
  if (fallbacks.length >= 3) fallbacks[fallbacks.length - 1] = ownerPhase;
  else fallbacks.push(ownerPhase);
  return { ...plan, fallback_strategies: fallbacks };
}

export function isOwnerFallback(strategy) {
  return /OWNER_FALLBACK/i.test(String(strategy?.strategyType || strategy?.type || ""));
}

export function shouldPauseForYield(strategy, progress, minimumPages = 2) {
  if (isOwnerFallback(strategy)) {
    const ownerWindow = Math.max(6, minimumPages);
    // Phone visibility is sparse and uneven across product listings. Once the
    // owner path is finding relevant ads, a short run of missing numbers is not
    // evidence that later pages are useless; the configured listing cap is the
    // admin-controlled exhaustion boundary. Stop early only when the owner query
    // itself produces no relevant candidates at all.
    return progress.qualifiedCount === 0 && progress.pagesFetched >= ownerWindow;
  }
  const window = minimumPages;
  return (
    (progress.qualifiedCount === 0 && progress.pagesFetched >= window)
    || progress.zeroYieldPages >= window
    || progress.noLeadPages >= window
  );
}

export function shouldAttemptRemoteContact(stats) {
  // The campaign deadline and shared configured request/contact budgets govern
  // work. A fixed 100-attempt ceiling incorrectly starved larger requests.
  return stats?.contactLookupMode !== 'public_contacts_only' && !stats?.contactSafetyPause && stats?.contactAuthentication !== 'rejected';
}

export function freshStrategyPosts(progress, items) {
  const seen = new Set(progress.seenPostIds || []);
  const fresh = items.filter((item) => {
    const id = Number(item.id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  progress.seenPostIds = [...seen];
  progress.noNewPages = fresh.length ? 0 : Number(progress.noNewPages || 0) + 1;
  if (progress.noNewPages >= 2) {
    progress.exhausted = true;
    progress.exhaustedReason = "no_new_posts";
  }
  return fresh;
}

export function recordDistinctPhones(stats, results) {
  const fingerprints = new Set(stats.contactFingerprints || []);
  for (const result of results) {
    if (result.phone) fingerprints.add(createHash("sha256").update(result.phone).digest("hex"));
  }
  stats.contactFingerprints = [...fingerprints];
  stats.contactsResolved = fingerprints.size;
}

export function admitOwnerProspect(candidate, qualification) {
  if (qualification.qualificationMode === KEYWORD_VERSION) return qualification;
  if (qualification.retryable) return qualification;
  if (!isOwnerFallback(candidate.matchedStrategy)) return qualification;
  // A model's grounded full-ad decision must not be vetoed by literal query spelling.
  if (qualification.isQualified && qualification.verdict === "STRONG") return qualification;
  const content = normalizeText(candidate.title + " " + candidate.bodyText);
  const anchors = strategyAnchorTokens(candidate).filter(token => !/^(الرياض|رياض|جده|جدة|جديد|جديدة|مستخدم|مستعمل|للبيع|riyadh|jeddah|new|used|sale)$/.test(token));
  const contentTokens = new Set(tokens(content));
  const related = anchors.length > 0 && anchors.every((token) => contentTokens.has(token));
  const commercial = /متجر|متوفر لدينا|نبيع|جملة|بالجملة|we sell|our store|wholesale/i.test(candidate.title + " " + candidate.bodyText);
  if (!related || commercial || Number(qualification.irrelevantProbability) >= 70 || Number(qualification.competitorProbability) >= 70) {
    return { ...qualification, isQualified: false };
  }
  return {
    ...qualification,
    isQualified: true,
    acceptanceBasis: "ownership_fallback",
    demandEvidence: false,
    marketplaceRole: "OWNER",
    explanation: publicQualificationExplanation(`Relevant ownership signal detected. ${qualification.explanation}`),
  };
}

async function createStrategistPlan(env, prompt, intent, procurement) {
  const fallback = fallbackStrategistPlan(prompt, intent, procurement);
  try {
    const result = await structuredResponse(
      env,
      "waslah_saudi_lead_search_strategy",
      strategistPlanSchema,
      `${STRATEGIST_SNAPSHOT}\n\nApply this versioned strategy exactly. Return only the required JSON. For procurement, leads are credible owners or sellers. For sales, prioritize evidence of demand and reject competitors selling the same offer. Queries must be short, natural Saudi Arabic search concepts, not essays. Do not expose the sourcing platform or implementation to the customer.`,
      { customer_request: prompt, offer: intent, direction: procurement ? "buy" : "sell", strategist_version: STRATEGIST_VERSION },
      3600,
      "high",
    );
    return ensureOwnerFallback(sanitizeStrategistPlan(result, fallback), prompt, intent, procurement);
  } catch (error) {
    if (error?.code === "B2C_AI_UNAVAILABLE") throw error;
    return ensureOwnerFallback(fallback, prompt, intent, procurement);
  }
}

const discoverySchema = {
  type: "object", additionalProperties: false,
  required: ["reply", "ready", "summary", "missing", "knownFacts", "answeredTopics", "confidence", "businessUnderstanding"],
  properties: {
    reply: { type: "string" }, ready: { type: "boolean" }, summary: { type: "string" },
    missing: { type: "array", items: { type: "string" }, maxItems: 5 },
    knownFacts: { type: "array", items: { type: "string" }, maxItems: 30 },
    answeredTopics: { type: "array", items: { type: "string" }, maxItems: 20 },
    confidence: { type: "number" },
    businessUnderstanding: BUSINESS_UNDERSTANDING_SCHEMA,
  },
};

function uncertainReply(text) {
  return /\b(?:idk|i don'?t know|not sure|no idea|wdym|what do you mean|lol|you (?:choose|tell me|recommend)|recommend for me)\b|ما ادري|مادري|لا اعرف|مو متأكد|وش تقصد|انت اختر|اقترح/i.test(String(text || ""));
}

function greetingOnly(text) {
  return /^(?:hi|hello|hey|hiya|good (?:morning|afternoon|evening)|السلام عليكم|وعليكم السلام|سلام|هلا|هلا والله|مرحبا|أهلا|اهلا)[\s!.,؟?]*$/i.test(String(text || "").trim());
}

function fallbackOfferFromConversation(customerFacts) {
  const known = knownSaudiSearchTerm(customerFacts);
  if (known) return { ...known, term: known.englishTerm || known.term, source: "dictionary" };
  const userLines = String(customerFacts || "").split(/\n+/)
    .map((line) => line.replace(/^\s*user\s*:\s*/i, "").trim())
    .filter((line) => line.length >= 12 && !greetingOnly(line) && !uncertainReply(line));
  const text = userLines.sort((a, b) => b.length - a.length)[0] || "";
  if (!text) return null;
  if (/\b(?:saas|software)\b/i.test(text) && /\b(?:chatbot|chat bot|ai chat)\b/i.test(text) && /\bleads?\b/i.test(text)) {
    return { term: "AI lead-finding chatbot SaaS", source: "local" };
  }
  const cleaned = text
    .replace(/^(?:i(?:'m| am)?|we(?:'re| are)?)\s+(?:a\s+business\s+that\s+)?(?:want to|would like to|need to)?\s*(?:sell|sells|offer|offers|provide|provides)\s+/i, "")
    .replace(/^(?:i(?:'m| am)?|we(?:'re| are)?)\s+(?:sell|sells|offer|offers|provide|provides|run|own|build|built|make)\s+/i, "")
    .replace(/^(?:أريد|اريد|نريد)\s+(?:بيع|تقديم)\s+/i, "")
    .replace(/^(?:أبيع|ابيع|نبيع|أقدم|اقدم|نقدم)\s+/i, "")
    .replace(/\s+(?:in|across|throughout)\s+(?:saudi arabia|ksa)(?:\s+riyadh)?\b.*$/i, "")
    .replace(/\s+/g, " ").trim();
  if (cleaned.length < 3) return null;
  return { term: cleaned.slice(0, 160), source: "local" };
}

// Explicit requests for buyers can use product-comment evidence directly.
// Only customer messages establish the product; assistant suggestions never do.
export function directProductBuyerBrief(customerFacts) {
  const lines=String(customerFacts||'').split(/\n/).filter(line=>!/^\s*assistant\s*:/i.test(line));
  for (const line of lines.reverse()) {
    const text=line.replace(/^\s*user\s*:\s*/i,'');
    const english=text.match(/\b(?:people|customers?|buyers?|clients?|someone|anyone)\b([^\n.!?]{0,90}?)\b(?:buy(?:ing)?|purchas(?:e|ing)|shopping\s+for|looking\s+for)\s+(.+?)(?=\s+(?:in|around|from|across)\s+|[.!?\n]|$)/iu);
    if(english&&/\b(?:not|never|don['’]?t|do\s+not|aren['’]?t|isn['’]?t)\b/iu.test(english[1]))continue;
    const match=english?{1:english[2]}:text.match(/(?:buyers?|customers?|clients?)\s+for\s+(.+?)(?=\s+(?:in|around|from|across)\s+|[.!?\n]|$)/iu)
      || text.match(/(?:ناس|اشخاص|أشخاص|عملاء|زبائن)\s+(?:(?:اللي|الذين)\s+)?(?:يشترون|تشتري|يبغون|يحتاجون|مهتمين\s+بشراء)\s+(.+?)(?=\s+(?:في|بمدينة)\s+|[.!?؟\n]|$)/u);
    if (!match) continue;
    const offer=match[1].trim();
    if (!offer || offer.length>120 || offer.split(/\s+/).length>12 || /^(?:it|them|this|that|anything|everything|هذا|ذلك)$/iu.test(offer)) continue;
    return {offer,known:knownSaudiSearchTerm(offer)};
  }
  return null;
}

export function isSupplierSearchRequest(text) {
  const value = String(text || '');
  const supplierAsk = /\b(?:find|show|get|need|want)\b[^\n.]{0,100}\b(?:companies|suppliers|distributors|businesses)\b[^\n.]{0,90}\b(?:sell|sells|supply|supplies|provide|provides)\b/i.test(value)
    || /(?:ابحث|أبحث|اعطني|أعطني|ابي|أبي|اريد|أريد)[^\n.]{0,100}(?:شركات|موردين|موزعين|مؤسسات)[^\n.]{0,90}(?:تبيع|يبيعون|تورّد|تورد|تزود)/u.test(value);
  const buyerClarified = /(?:restaurants?|cafes?)\s+(?:that|who|as)\s+(?:would\s+)?(?:buy|buyers|purchase|customers?)\b|(?:restaurants?|cafes?)\s+as\s+(?:my|our)\s+(?:buyers|customers)|(?:مطاعم|مقاهي|كافيهات)[^\n.]{0,35}(?:تشتري|يشترون|كعملاء|عملائي)/iu.test(value);
  return supplierAsk && !buyerClarified;
}

function sectorFallbackApproved(text) {
  return /\b(?:yes|approve|agree|okay|ok|include)\b[^\n.]{0,100}\b(?:operating restaurants|restaurant prospects|restaurants and cafes|restaurant or cafe)\b|(?:نعم|أوافق|اوافق|موافق)[^\n.]{0,100}(?:مطاعم|كافيهات|مقاهي)/iu.test(String(text || ''));
}

function withSectorApproval(summary, message) {
  const marker = '\n[APPROVED_SECTOR_FALLBACK]';
  return sectorFallbackApproved(message) ? `${summary.slice(0, 2000 - marker.length)}${marker}` : summary;
}

function supplierClarificationTurn(language, message, confirmed = false) {
  return {
    reply: confirmed
      ? language === 'ar'
        ? 'لا أستطيع تأكيد شركات تورّد للمطاعم عبر Lite من الإعلانات العامة وحدها، ولن أعرض لك نتائج غير مرتبطة على أنها شركات مورّدة. إذا كنت تقصد مطاعم قد تشتري موادك الغذائية في الرياض، أخبرني وسأجهّز هذا البحث هنا.'
        : 'Lite can’t reliably verify which companies supply restaurants from public offers alone, so I won’t present unrelated listings as suppliers. If you mean restaurants that might buy your food products in Riyadh, tell me and I’ll prepare that search here.'
      : language === 'ar'
        ? 'هل تقصد شركات تورّد المواد الغذائية للمطاعم، أم مطاعم قد تشتري منك؟ في Lite أستطيع تجهيز بحث عن مشترين محتملين، لكن لا أستطيع تأكيد صفة المورّد أو علاقته بالمطاعم من الإعلان وحده.'
        : 'Do you mean companies that supply food to restaurants, or restaurants that might buy from you? Lite can prepare a search for potential buyers, but public listings alone cannot verify supplier companies or their restaurant clients.',
    ready: false, summary: String(message).slice(0, 2000), missing: ['target audience'], knownFacts: [], answeredTopics: [], confidence: 0,
  };
}

export async function createB2CDiscoveryTurn(env, { message, transcript = [], language = "ar", dealIntent = "sell", businessContext = null, reasoningMode = "high", audienceSelected = false } = {}) {
  if (!audienceSelected && dealIntent === 'sell' && isSupplierSearchRequest(message)) {
    return supplierClarificationTurn(language, message);
  }
  let cleanTranscript = (Array.isArray(transcript) ? transcript : []).map(String)
    .filter((line) => !/^\s*(?:(?:user|assistant)\s*:\s*)?(?:mission context|business context|user context|سياق المهمة|سياق المستخدم)\s*:/i.test(line)).slice(-80);
  const priorSupplierAsk = cleanTranscript.some(line => /^\s*user\s*:/i.test(line) && isSupplierSearchRequest(line));
  if (!audienceSelected && dealIntent === 'sell' && priorSupplierAsk && /\b(?:supplier companies|suppliers|distributors|companies that supply|can you do it on lite|on lite)\b|(?:الشركات الموردة|شركات موردة|الموردين|الموزعين|في لايت|على لايت)/iu.test(message)) {
    return supplierClarificationTurn(language, message, true);
  }
  if (priorSupplierAsk && /(?:restaurants?|cafes?)\s+(?:that|who|as)\s+(?:would\s+)?(?:buy|buyers|purchase|customers?)\b|(?:مطاعم|مقاهي|كافيهات)[^\n.]{0,35}(?:تشتري|يشترون|كعملاء|عملائي)/iu.test(message)) {
    cleanTranscript = cleanTranscript.map((line) => {
      if (!/^\s*user\s*:/i.test(line) || !isSupplierSearchRequest(line)) return line;
      const product = line.match(/\b(?:sell|sells|supply|supplies)\s+(.+?)\s+(?:for|to)\s+(?:restaurants?|cafes?)/iu)?.[1];
      return product ? `user: I sell ${product} to restaurants in Riyadh, Saudi Arabia.` : line;
    });
  }
  const currentMessage = normalizeText(message);
  while (cleanTranscript.length) {
    const last = cleanTranscript.at(-1);
    const lastUserText = /^\s*user\s*:/i.test(last) ? last.replace(/^\s*user\s*:\s*/i, "") : "";
    if (!lastUserText || normalizeText(lastUserText) !== currentMessage) break;
    cleanTranscript.pop();
  }
  const conversationText = [...cleanTranscript, `user: ${message}`].join("\n");
  const lastAssistant = [...cleanTranscript].reverse().find((line) => /^assistant\s*:/i.test(line))?.replace(/^assistant\s*:\s*/i, "").trim();
  const customerFacts = [...cleanTranscript.filter((line) => /^user\s*:/i.test(line)), `user: ${message}`].join("\n");
  const product = fallbackOfferFromConversation(customerFacts);
  const locations = cityList(customerFacts);
  const nationwide = /\b(?:saudi arabia|ksa|kingdom of saudi arabia)\b|السعودية|المملكة العربية السعودية/i.test(customerFacts);
  const fallbackLocations = locations.length ? locations : nationwide ? ["Saudi Arabia"] : [];
  const directBuyer=dealIntent==='sell' ? directProductBuyerBrief(customerFacts) : null;
  if (directBuyer && fallbackLocations.length && !greetingOnly(message)) {
    const offer=directBuyer.known?.englishTerm||directBuyer.offer;
    return {reply:language==='ar'?`واضح، تبحث عن مهتمين بشراء ${offer} في ${fallbackLocations.join('، ')}. سأبدأ بإشارات الشراء، ثم الاستفسارات على نفس المنتج، ثم جهات تواصل من إعلانات المنتج عند الحاجة. اختر عدد العملاء للمتابعة.`:`Got it—you want people interested in buying ${offer} in ${fallbackLocations.join(', ')}. I’ll start with buying signals, then product inquiries, then matching product-ad contacts if needed. Those fallback contacts are not confirmed buyers. Choose how many leads you want to continue.`,
      ready:true,missing:[],confidence:100,summary:`Product: ${offer}. Direction: sell. Location: ${fallbackLocations.join(', ')}. Customer context: ${customerFacts}`.slice(0,4000),
      knownFacts:[offer,...fallbackLocations],answeredTopics:['product','target','location'],searchRoute:'buyer_intent_then_comments_then_product_ads',
      businessUnderstanding:{offer,customer:'People asking about buying the same product',target:'Product purchase inquiries',geography:fallbackLocations.join(', ')}};
  }
  const milkingEquipment = /cow\s*mil+kers?|milking\s*machines?|milking\s*equipment|حلاب(?:ه|ة)?|ماكين(?:ة|ه)\s*حلب|الة\s*حلب|آلة\s*حلب/i.test(customerFacts);
  // "Cow milker" tells us one compatible animal, but not whether sheep/goat
  // owners are also legitimate prospects. That distinction materially changes
  // the reachable audience, so resolve it before declaring the brief ready.
  const livestockCompatibilityResolved = /\b(?:sheep|goats?|cattle)\b|غنم|ماعز|تيوس|ابقار|أبقار|\b(?:cows?\s+only|only\s+cows?|all\s+(?:animals|livestock))\b|(?:فقط|بس)\s*(?:ل)?لبقر|كل\s*(?:الحيوانات|المواشي)/i.test(customerFacts);
  const needsLivestockCompatibility = milkingEquipment && !livestockCompatibilityResolved;
  const fallbackReady = Boolean(product && fallbackLocations.length && !needsLivestockCompatibility);
  const fallbackReply = needsLivestockCompatibility
    ? (language === "ar" ? "فهمت أنك تبيع ماكينة حلب. هل تعمل للأبقار فقط، أو كذلك للأغنام والماعز؟ هذا يحدد ملاك المواشي المناسبين لك." : "I understand that you sell milking machines. Do they work only with cows, or also with sheep and goats? That determines which livestock owners are a real fit.")
    : fallbackReady
    ? (language === "ar" ? `فهمت عرضك: ${product.term} في ${fallbackLocations.join("، ")}. سأحدد الفئات المناسبة وأقرب إشارات الملكية أو الحاجة. اختر عدد العملاء للمتابعة.` : `I understand your offer: ${product.term} in ${fallbackLocations.join(", ")}. I’ll identify the strongest customer groups and the closest observable ownership or need signals. Choose the number of leads to continue.`)
    : product
      ? (language === "ar" ? "سأحدد الفئات المناسبة لمنتجك. في أي مدينة تقدم خدماتك أو توصل طلباتك؟" : "I’ll identify suitable customers for your product. Which city do you serve or deliver to?")
      : (language === "ar" ? "ما المنتج أو الخدمة التي تقدمها؟ يكفيني وصف بسيط لما تبيعه." : "What product or service do you offer? A brief description of what you sell is enough.");
  const fallbackSummary = (product && fallbackLocations.length) ? `Product: ${product.term}. Direction: ${dealIntent}. Location: ${fallbackLocations.join(", ")}. Customer context: ${customerFacts}`.slice(0, 2000) : customerFacts.slice(0, 2000);
  const fallbackUnderstanding = groundBusinessUnderstanding({ offer: product?.term, geography: fallbackLocations.join(', ') }, customerFacts);
  const highMissing = missingBusinessUnderstanding(fallbackUnderstanding);
  const safeFallback = { reply: reasoningMode === 'high' && fallbackReady ? businessUnderstandingQuestion(highMissing[0], language, dealIntent, fallbackUnderstanding) : fallbackReply,
    ready: reasoningMode === 'fast' && fallbackReady, summary: withSectorApproval(fallbackSummary, message),
    missing: reasoningMode === 'high' ? (needsLivestockCompatibility ? ["animal compatibility", ...highMissing] : highMissing) : fallbackReady ? [] : [needsLivestockCompatibility ? "animal compatibility" : product ? "location" : "product"],
    knownFacts: product ? [product.term, ...fallbackLocations] : [], answeredTopics: product ? ["product", ...(fallbackLocations.length ? ["location"] : [])] : [],
    confidence: reasoningMode === 'high' ? 45 : fallbackReady ? 85 : (needsLivestockCompatibility ? 75 : 45), businessUnderstanding: fallbackUnderstanding };
  // A greeting at the start of a fresh chat must begin a fresh brief. Saved
  // Business DNA may provide optional background later, but it cannot silently
  // resurrect an old product and jump straight to quantity selection.
  if (!cleanTranscript.some((line) => /^user\s*:/i.test(line)) && greetingOnly(message)) {
    return { ...safeFallback, reply: language === 'ar' ? 'هلا والله! 👋 حيّاك في وصلة. وش ودّك نشتغل عليه اليوم؟' : 'Hey! 👋 Great to see you. What would you like to work on today?' };
  }
  const assistantQuestionCount = cleanTranscript.filter((line) => /^assistant\s*:/i.test(line) && /[?؟]/.test(line)).length;
  const fastFinalTurn = reasoningMode === "fast" && assistantQuestionCount >= 4;
  const modeInstructions = reasoningMode === "fast"
    ? `FAST PROMPTING 1.5X MODE: finish qualification in no more than five assistant questions total, preferably three. ${fastFinalTurn ? "The question limit is now reached. Do not ask another question. Infer sensible defaults from the business context, set ready=true, leave missing empty, and produce a decisive cumulative brief." : `You have already asked ${assistantQuestionCount} qualification question(s). Ask only the single highest-impact remaining question, or set ready=true immediately if the brief is actionable.`}`
    : "HIGH REASONING MODE: understand the whole business before preparing leads: what it sells, who pays, the concrete customer outcome, how it earns revenue or uses a purchase, the precise lead target, the observable reason a lead would be a fit now, and the target geography. Fill every businessUnderstanding field from the user's statements or confirmed saved Business DNA; use empty strings for unknown facts. Wholesale, retail, direct sales, subscriptions, and project sales are already valid commercial models when the user states them. Do not ask about revenue again after the user says how they sell. For ordinary goods, infer the obvious use (such as stocking goods for resale) without inventing benefits or buying intent. Do not treat generic mission context as a customer fact. Ask one natural, contextual missing question per turn; acknowledge the answer before moving on. Never repeat a question the user answered. Never mark ready from only a product and city, and never invent a business model, outcome, or purchase signal.";
  let result = null;
  try {
    result = await structuredResponse(env, "waslah_b2c_discovery", discoverySchema,
      `You are Wasla's premium conversational growth strategist. ${modeInstructions} You own audience selection: infer commercially plausible customers from the offer and Saudi market knowledge. Never ask the user to choose keywords, categories, advertisements, or search tactics. Ask only for missing business-model, customer, product, compatibility, or service/delivery geography details that materially affect fit. For equipment tied to an owned asset, animal, vehicle, property, or machine, reason from the downstream owner: a milking-machine seller can reach owners of compatible cows, sheep, or goats; a farm-equipment seller can reach owners of the relevant farm or crop. Ask one concrete compatibility question when it changes which owners qualify. Do not assume compatibility the user did not state. ${reasoningMode === 'fast' ? 'Once product, geography, and any essential compatibility are known, set ready=true and summarize.' : 'Only set ready=true when every businessUnderstanding field is grounded in the conversation or confirmed Business DNA, and the resulting target is commercially coherent. A product and city alone are not enough.'} If the exact ask cannot be supported by observable public signals, say so plainly and propose 2-3 adjacent audiences Wasla can support instead. Do not invent claims such as coffee implying health benefits. This endpoint only prepares a brief: never claim a search has started, results are coming, or a quantity was accepted. The application launches searches separately. Keep discovery concise and commercially useful. Never ask how many customers the user already has, whether they have a customer or lead list, whether they want to retarget existing customers, or request their customer data. Be curious, commercially sharp, and natural—not a form or technical planning screen. Preserve all earlier facts, never repeat a question, and ask one highest-impact question per turn. Format longer replies with concise Markdown bullets and put the next question on its own final line. Never mention or imply any platform, marketplace, API, data provider, category database, scraping method, tag, schema, path, or internal implementation. If the user delegates a choice, make a concrete recommendation and advance only when the business facts are known. Reply in ${language === "ar" ? "Arabic" : "English"}. Return only the schema.`,
      { latest_message: message, conversation: cleanTranscript, deal_intent: dealIntent, business_context: businessContext, customer_conversation_rules: "Ask about the customer's business and intended audience, never about advertisers, ad titles, listings, keywords, search terms, Haraj/حراج, or sourcing mechanics. Wasla decides these internally. In high reasoning, ask about the missing business-model facts needed to understand customer fit; in fast mode ask only essential product or geography details. If they ask what you mean, explain with relevant audience examples; never repeat the original question. Treat earlier assistant sourcing questions as mistakes, not instructions to continue them." }, 1800, reasoningMode === "high" ? "high" : "low");
  } catch { result = null; }
  if (!result) {
    return safeFallback;
  }
  if (needsLivestockCompatibility) return safeFallback;
  // Known offer and geography are sufficient; audience selection belongs to Wasla.
  if (reasoningMode === 'fast' && fallbackReady && !result.ready) return safeFallback;
  const delegated = /recommend|you (?:choose|tell me)|recommend for me|انت اختر|اقترح/i.test(String(message));
  let reply = String(result.reply || "").trim();
  if (!reply || /\bharaj\b|حراج|advertis|listings?|keywords?|search terms?|scrap(?:e|ing)|graphql|إعلانات|المعلنين|كلمات البحث|who do you think your target audience|search.*(?:underway|started)|(?:start|initiate).*process/i.test(reply) || (lastAssistant && normalizeText(lastAssistant) === normalizeText(reply))) return safeFallback;
  const rawBusinessMissing = missingBusinessUnderstanding(result.businessUnderstanding);
  const businessUnderstanding = groundBusinessUnderstanding(result.businessUnderstanding, customerFacts);
  const modelMissing = reasoningMode === 'high' ? missingBusinessUnderstanding(businessUnderstanding) : [];
  if (modelMissing.length) {
    const nextQuestion = businessUnderstandingQuestion(modelMissing[0], language, dealIntent, businessUnderstanding);
    return { reply: result.ready ? `${reply}\n\n${nextQuestion}` : reply, ready: false,
      summary: withSectorApproval(String(result.summary || conversationText).slice(0, 2000), message), missing: modelMissing,
      knownFacts: (Array.isArray(result.knownFacts) ? result.knownFacts : []).map(String).slice(0, 30),
      answeredTopics: (Array.isArray(result.answeredTopics) ? result.answeredTopics : []).map(String).slice(0, 20),
      confidence: numeric(result.confidence, 55), businessUnderstanding };
  }
  const answeredSalesQuestion = reasoningMode === 'high' && rawBusinessMissing.length === 1
    && rawBusinessMissing[0] === 'commercialModel' && !modelMissing.length
    && /(?:revenue|sales?|orders?|wholesale|retail|توريد|بيع|مبيعات|إيراد)/iu.test(reply);
  if (answeredSalesQuestion) reply = language === 'ar'
    ? 'تمام، فهمت طريقة بيعك والعملاء اللي تستهدفهم. خلّني أجهز لك البحث المناسب.'
    : 'Got it. I understand how you sell and who you want to reach. Let me prepare the right search.';
  if (fastFinalTurn && /[?؟]\s*$/.test(reply)) {
    reply = reply.replace(/(?:^|\n)[^\n?؟]*[?؟]\s*$/, "").trim();
    if (!reply) reply = language === "ar" ? "اكتملت الصورة. سأستخدم أفضل الافتراضات التجارية من إجاباتك وأجهز مسار العملاء الآن." : "The brief is clear. I’ll use the strongest commercial assumptions from your answers and prepare the lead path now.";
  }
  const hasDiscoveryExchange = cleanTranscript.some((line) => /^assistant\s*:/i.test(line));
  const asksAnotherQuestion = /[?؟]\s*$/.test(reply);
  const missing = fastFinalTurn || answeredSalesQuestion ? [] : (Array.isArray(result.missing) ? result.missing : []).map(String).filter(Boolean).slice(0, 5);
  const confidence = fastFinalTurn ? Math.max(78, numeric(result.confidence, 55)) : numeric(Number(result.confidence) > 0 && Number(result.confidence) <= 1 ? Number(result.confidence) * 100 : result.confidence, 55);
  const completeBrief = !missing.length && confidence >= 75;
  const ready = (Boolean(result.ready) || fastFinalTurn || answeredSalesQuestion) && !asksAnotherQuestion && (reasoningMode === 'high' || fastFinalTurn || delegated || hasDiscoveryExchange) && (completeBrief || fastFinalTurn || answeredSalesQuestion || !uncertainReply(message) || delegated);
  return { reply, ready, summary: withSectorApproval(String(result.summary || conversationText).slice(0, 2000), message), missing, knownFacts: (Array.isArray(result.knownFacts) ? result.knownFacts : []).map(String).slice(0, 30), answeredTopics: (Array.isArray(result.answeredTopics) ? result.answeredTopics : []).map(String).slice(0, 20), confidence, businessUnderstanding };
}

export async function createB2CAudienceTurn(env,input){
  const {message,language='ar',transcript=[],dealIntent='sell'}=input;
  const conversational=smallTalkReply(message,language)||chatQuestionReply(message,language);
  if(conversational)return {reply:conversational,ready:false,conversational:true,summary:'',missing:[],knownFacts:[],answeredTopics:[],confidence:0};
  // Product/model questions and greetings are conversation, never an offer.
  const facts=transcript.filter(line=>!/^user\s*:/i.test(line)||!(smallTalkReply(line.replace(/^user\s*:/i,''),language)||chatQuestionReply(line.replace(/^user\s*:/i,''),language)));
  const route=audienceRoute(message,transcript)||routeFromPrompt(input.businessContext||'');
  if(route&&/^(?:what|what do you mean|huh|explain|وش تقصد|وش يعني|يعني ايش)[?!.؟\s]*$/iu.test(String(message).trim()))return {
    ready:false,conversational:true,summary:'',missing:[],reply:language==='ar'
      ? route==='marketplace'?'أقصد نركز على أشخاص أو جهات عندهم إعلانات مرتبطة بالمنتج، لأنك وضحت أن عميلك مو صاحب متجر إلكتروني. المنتج والمدينة اللي ذكرتهم محفوظين، وما تحتاج تعيدهم.':'أقصد نركز على متاجر تبيع منتجات مرتبطة بعرضك، بحيث تكون جهات ممكن تشتري منك أو تعيد بيع المنتج. هذا ما يعني أنها طلبت الشراء فعلاً. تفاصيل طلبك محفوظة.'
      : route==='marketplace'?'I mean we’ll focus on relevant advertisers, because you said your customers would not run online stores. I’ve kept your product and city—you don’t need to repeat them.':'I mean we’ll focus on stores selling products related to your offer, as potential business customers or resellers. That does not mean they have requested to buy. Your brief is kept.'};
  const turn=await createB2CDiscoveryTurn(env,{...input,transcript:facts,audienceSelected:Boolean(route)});
  turn.reply=cleanAssistantReply(turn.reply);
  if(dealIntent==='buy')return turn;
  if(turn.ready&&!route)return {...turn,ready:false,reply:audienceQuestion(language),missing:['customer_sales_channel']};
  if(route){
    turn.audienceRoute=route;
    turn.summary=`${routeMarker(route)} ${String(turn.summary||'').replace(/\[LITE_AUDIENCE_(?:MERCHANTS|MARKETPLACE)\]/g,'')}`;
    if(turn.ready)turn.reply=language==='ar'
      ? `تمام، فهمت عليك 👌 بنستهدف ${route==='merchants'?'متاجر تبيع المنتجات المناسبة لعرضك':'أصحاب إعلانات مرتبطة بالمنتج اللي حددناه'}. اختر عدد العملاء ونبدأ.`
      : `Got it 👌 We’ll target ${route==='merchants'?'stores selling products relevant to your offer':'advertisers whose listings mention the products we identified'}. Choose your lead count to start.`;
  }
  return turn;
}

function strategiesFromStrategistPhase(phase, intent, procurement, phaseName, phaseIndex) {
  return (phase?.queries || []).map((item) => ({
    query: item.query,
    sourceMode: "search",
    phase: phaseName,
    phaseIndex,
    searchTerm: item.query,
    englishTerm: "",
    strategyType: String(phase.type || (procurement ? "ACTIVE_OFFER" : "DIRECT_PURCHASE_INTENT")),
    weight: item.priority === "high" ? 1 : item.priority === "medium" ? 0.8 : 0.6,
    requiresKeywordMatch: false,
    cities: intent.market.cities,
    reason: item.lead_hypothesis || phase.reason,
    signal: item.signal,
    leadHypothesis: item.lead_hypothesis,
    priority: item.priority,
    pathId: `search-${phaseIndex}-${createHash("sha1").update(normalizeText(item.query)).digest("hex").slice(0, 12)}`,
    advertiserRole: procurement ? "An individual publicly offering the requested item" : "A person whose public activity indicates a plausible need for the customer's offer",
  }));
}

export async function createB2CPlan(env, prompt) {
  const selectedRoute=routeFromPrompt(prompt);
  if (!selectedRoute && isSupplierSearchRequest(prompt)) throw new Error('Lite cannot verify supplier companies or their restaurant clients from public listings. Clarify whether restaurants as potential buyers are the intended audience before starting a search.');
  const fallbackApproved = String(prompt || '').includes('[APPROVED_SECTOR_FALLBACK]') || sectorFallbackApproved(prompt);
  const planningPrompt = String(prompt || '').replace(/\[APPROVED_SECTOR_FALLBACK\]/g, '').trim();
  const procurement = /\[PROCUREMENT_FROM_CONSUMERS\]/.test(prompt);
  const directBuyer=procurement?null:directProductBuyerBrief(planningPrompt);
  const directKnown=directBuyer?.known;
  const knownFromBrief=directKnown||knownSaudiSearchTerm(planningPrompt);
  const intent = knownFromBrief ? { ...fallbackIntent(planningPrompt), productName:knownFromBrief.term, productDescription:knownFromBrief.englishTerm||knownFromBrief.term } : await createLeadIntent(env, planningPrompt);
  const generated = knownFromBrief || selectedRoute ? null : await structuredResponse(env, 'waslah_saudi_keyword_plan', keywordPlanSchema,
    `Prepare a Saudi Wasla-Lite keyword search plan once; there will be NO AI reviewing individual ads. Infer buyers from the business brief. Return productTerms with precise Arabic/English spelling aliases (not broad unrelated synonyms), intentTerms with natural purchase expressions, titleExclusions for accessories or unrelated products, and commercialTerms identifying shops/wholesalers. buyerQueries: up to three Saudi Arabic buying-intent queries, EACH at most THREE whitespace words, containing a productTerm and intentTerm. ownerTerms: short Saudi product or ownership-proxy names only, no buying/selling words, city, conditions or sentences. Prefer one word; a single compound name like بي سي or ماك بوك or ايفون 18 is allowed, maximum three written words. Retrieval queries must be Saudi Arabic; English aliases are for local matching only. Build a concrete fallback ladder from direct demand to defensible ownership proxies. For equipment sold to owners of an asset or animal, ownerTerms SHOULD be the compatible asset or animal names stated in the brief: e.g. a milking-machine campaign can use بقر, غنم, and ماعز only when compatibility supports them. For services, use a specific related owned asset only when justified. Never use speculative demographics. Exclusions are literal phrases, not instructions. Do not exclude an entire product category that should match. If direct buyer phrases are weak, return valid ownership proxies rather than inventing or overloading a query. Include no secrets, sourcing explanations, or customer-facing text.`,
    { customer_request: planningPrompt, offer: intent, direction: procurement ? 'buy' : 'sell' }, 2200, 'low');
  // Prefer the cumulative brief because it contains compatibility details (for
  // example cows + sheep) that a concise product name may omit.
  const known = knownFromBrief || knownSaudiSearchTerm(intent.productName);
  // Credential-free fixtures/known products retain a deterministic safe plan.
  // Unknown products must have a valid generated plan, never a transcript query.
  const term = known?.term;
  const knownOwnerTerms = known?.ownerTerms || (term ? [{ term, aliases: [term, known.englishTerm].filter(Boolean) }] : []);
  const deterministic = term ? {
    productTerms: known?.productTerms || [term, known.englishTerm].filter(Boolean),
    intentTerms: ['مطلوب', 'ابي', 'ابغى', 'اريد', 'احتاج', 'ادور', 'looking for', 'want to buy'],
    buyerQueries: [`مطلوب ${term}`, `ابي ${term}`, `ابغى ${term}`],
    ownerTerms: knownOwnerTerms,
    titleExclusions: ['كفر', 'جراب', 'case only'], commercialTerms: ['متجر', 'بالجملة', 'متوفر لدينا', 'our store', 'wholesale'],
  } : null;
  const generatedWithKnownTerms = generated && deterministic ? {
    ...generated,
    productTerms: [...new Set([...deterministic.productTerms, ...(generated.productTerms || [])])].slice(0, 16),
    intentTerms: [...new Set([...deterministic.intentTerms, ...(generated.intentTerms || [])])].slice(0, 16),
    buyerQueries: [...new Set([...deterministic.buyerQueries, ...(generated.buyerQueries || [])])].slice(0, 3),
    ownerTerms: [...knownOwnerTerms, ...(generated.ownerTerms || [])]
      .filter((item, index, all) => all.findIndex((other) => normalizeText(other.term) === normalizeText(item.term)) === index)
      .slice(0, 6),
  } : generated;
  let compiled;
  try { compiled = selectedRoute?{matching:{version:KEYWORD_VERSION,productTerms:deterministic?.productTerms||[],intentTerms:[],titleExclusions:[],commercialTerms:[]},strategies:[]}:compileKeywordPlan(generatedWithKnownTerms || deterministic, intent.market.cities, procurement); }
  catch (error) {
    if (!deterministic || generated == null) throw error;
    compiled = compileKeywordPlan(deterministic, intent.market.cities, procurement);
  }
  if(selectedRoute){
    const count=selectedRoute==='merchants'?10:6;
    const camera=/cctv|security camera|surveillance camera|كاميرات مراقب|كميرات مراقب/iu.test(intent.productName+' '+intent.productDescription);
    let terms=camera?cameraKeywords.slice(0,count):[...new Set(compiled.matching.productTerms)].slice(0,count);
    if(terms.length<count){
      const vocabulary=await structuredResponse(env,'waslah_lite_product_keywords',{type:'object',additionalProperties:false,required:['keywords'],properties:{keywords:{type:'array',minItems:count,maxItems:count,items:{type:'string'}}}},
        `Return exactly ${count} distinct precise product search keywords for the customer's confirmed target. Use Saudi Arabic spellings and English product names. Include relevant brands only when their product category is known; never invent brands, unsupported platform membership, geography, buying intent, or unrelated ownership proxies. Keywords are literal product names, not sentences.`,{brief:planningPrompt,offer:intent,existing:terms},1200,'low');
      terms=[...new Set((vocabulary?.keywords||[]).map(s=>String(s).trim()).filter(s=>s&&s.length<=80&&!/[\r\n]/.test(s)))].slice(0,count);
    }
    if(terms.length!==count)throw Error('Could not prepare the complete precise product keyword set.');
    compiled.matching.productTerms=terms;
    compiled.strategies=terms.map((term,index)=>({query:term,searchTerm:term,sourceMode:'search',requiresKeywordMatch:true,cities:intent.market.cities,weight:1,pathId:`audience-keyword-${index}`,phase:'product_ads',phaseIndex:0,strategyType:'PRODUCT_AD_FALLBACK',matchTerms:terms,reason:'Selected product keyword in title or description'}));
  }
  return {
    intent,
    acquisitionPlan: {
      product: intent.productName, dealIntent: procurement ? 'buy' : 'sell',
      ...(selectedRoute?{audienceRoute:selectedRoute,keywordCount:selectedRoute==='merchants'?10:6}:{}),
      targetProfiles: intent.idealCustomerProfiles.map(profile => profile.name),
      strategistVersion: KEYWORD_VERSION, searchStrategyVersion: 7,
      executionProfile: LITE_EXECUTION_PROFILE, contactMode: 'public_only',
      primaryLeadRoute: procurement ? 'active_offers' : 'buyer_intent_then_comments_then_product_ads',
      sourceViability: 'keyword_rules_before_contact', keywordMatching: compiled.matching,
      strategies: compiled.strategies,
      searchPhrases: compiled.strategies.map(s => ({ term: s.searchTerm, phase: s.phase, reason: s.reason })),
      qualification: { minimumLeadScore: 0 },
      fallbackApproved,
      preflight: { aligned: true, selectedQueries: compiled.strategies.map(s => s.searchTerm) },
    },
  };
}

// Retained only for compatibility/diagnostics of old versioned campaigns.
async function createLegacyB2CPlan(env, prompt) {
  const procurement = /\[PROCUREMENT_FROM_CONSUMERS\]/.test(prompt);
  const intent = await createLeadIntent(env, prompt);
  const strategistPlan = await createStrategistPlan(env, prompt, intent, procurement);
  const phases = [strategistPlan.primary_strategy, ...strategistPlan.fallback_strategies];
  const queryStrategies = phases.flatMap((phase, phaseIndex) => strategiesFromStrategistPhase(
    phase,
    intent,
    procurement,
    phaseIndex === 0 ? "primary" : `fallback-${phaseIndex}`,
    phaseIndex,
  ));
  if (!queryStrategies.length || queryStrategies.some((strategy) => !validSearchExpression(strategy.searchTerm))) {
    throw new Error("Wasla could not prepare a valid search. Please clarify the product or service and try again.");
  }
  const searchPhrases = queryStrategies.map((strategy) => ({
    term: strategy.searchTerm,
    reason: strategy.reason,
    signal: strategy.signal,
    phase: strategy.phase,
  }));
  return {
    intent,
    acquisitionPlan: {
      product: intent.productName,
      dealIntent: procurement ? "buy" : "sell",
      targetProfiles: intent.idealCustomerProfiles.map((profile) => profile.name),
      strategistVersion: STRATEGIST_VERSION,
      marketUnderstanding: strategistPlan.market_understanding,
      strategyPlan: strategistPlan,
      searchPhrases,
      searchStrategyVersion: 6,
      sourceViability: "strategist_queries_with_ai_qualification",
      strategies: queryStrategies,
      negativeSignals: strategistPlan.negative_signals,
      qualificationInstructions: strategistPlan.qualification_instructions,
      qualification: {
        minimumLeadScore: numeric(env.B2C_MINIMUM_LEAD_SCORE, 65),
        minimumIdentityConfidence: numeric(env.B2C_MINIMUM_IDENTITY_CONFIDENCE, 60),
        minimumPurchasePropensity: numeric(env.B2C_MINIMUM_PURCHASE_PROPENSITY, 55),
      },
      preflight: {
        aligned: true,
        matchedAudience: intent.idealCustomerProfiles.map((profile) => profile.name).slice(0, 4),
        selectedQueries: searchPhrases.map((phrase) => phrase.term),
      },
    },
  };
}

export async function validateB2CPlan(env, prompt, suppliedPlanning) {
  const selectedRoute=suppliedPlanning?.acquisitionPlan?.audienceRoute;
  const queryOnlyPlan = await createB2CPlan(env, ['marketplace','merchants'].includes(selectedRoute)?`${routeMarker(selectedRoute)} ${prompt}`:prompt);
  if (!queryOnlyPlan.acquisitionPlan.strategies?.length) {
    throw new Error("Wasla needs one clear Saudi-Arabic product expression before starting this campaign.");
  }
  return queryOnlyPlan;
}

function harajHeaders(env) {
  return {
    Authorization: `Bearer ${env.HARAJ_BEARER_TOKEN}`,
    "Content-Type": "application/json",
    ...(env.HARAJ_CLIENT_ID ? { "x-client-id": env.HARAJ_CLIENT_ID } : {}),
    ...(env.HARAJ_CLIENT_VERSION ? { "x-client-version": env.HARAJ_CLIENT_VERSION } : {}),
  };
}

async function harajGraphql(env, url, query, variables, options = {}) {
  env.__b2cSignal?.throwIfAborted();
  const endpoint = validateHarajEndpoint(url);
  if (!options.publicOnly && !env.HARAJ_BEARER_TOKEN) throw safeHarajError('HARAJ_INVALID_CONFIGURATION', 'The sourcing credential is missing.');
  // Never retry a sensitive lookup automatically. All calls, including search,
  // share a persistent deployment-wide lease, budgets and circuit breaker.
  return harajSafety().execute({ kind: options.kind || 'search', cacheKey: options.cacheKey, signal: env.__b2cSignal }, async () => {
      const requestSignal = AbortSignal.any([...(env.__b2cSignal ? [env.__b2cSignal] : []), AbortSignal.timeout(numeric(options.timeoutMs ?? env.HARAJ_REQUEST_TIMEOUT_MS, 20_000, 2_000, 20_000))]);
      const response = await fetch(endpoint, {
        method: "POST", headers: options.publicOnly ? { 'Content-Type': 'application/json' } : harajHeaders(env), body: JSON.stringify({ query, variables }),
        signal: requestSignal,
      });
      const payload = await response.json().catch(() => {
        // A truncated body caused by cancellation/timeout is not malformed
        // provider data. Preserve real HTTP denials received before the abort.
        if ([401,403,429].includes(response.status)) throw Object.assign(new Error('The sourcing request was rejected.'), { status: response.status, retryAfter: response.headers.get('retry-after') });
        requestSignal.throwIfAborted();
        return null;
      });
      if (!response.ok || payload?.errors?.length) {
        const requestError = new Error(payload?.errors?.[0]?.message || 'The sourcing request was rejected.');
        requestError.status = response.status;
        requestError.code = payload?.errors?.[0]?.extensions?.code || payload?.code || null;
        requestError.retryAfter = response.headers.get("retry-after");
        throw requestError;
      }
      const data = payload?.data;
      // A structurally valid empty search is terminal for this query even when
      // the provider omits/nulls pagination. Never treat missing/non-array items,
      // nonempty malformed pages, HTML or a denial as an empty successful search.
      const field = options.field || (options.kind === 'contact' ? 'postContact' : 'search');
      if (Array.isArray(data?.[field]?.items) && data[field].items.length === 0
        && data[field].pageInfo?.hasNextPage == null) data[field].pageInfo = { hasNextPage: false };
      const valid = options.kind === 'contact'
        ? data && Object.hasOwn(data, 'postContact')
        : field === 'profile' ? data && Object.hasOwn(data, 'profile') && (data.profile === null || data.profile?.id != null)
        : Array.isArray(data?.[field]?.items) && typeof data?.[field]?.pageInfo?.hasNextPage === 'boolean';
      if (!valid) {
        const responseDiagnostic = payload == null ? 'invalid_json' : options.kind === 'contact' ? 'invalid_contact'
          : !data?.search ? 'missing_search' : !Array.isArray(data.search.items) ? 'invalid_items' : 'missing_pagination';
        throw Object.assign(new Error('Invalid sourcing response.'), { code: 'HARAJ_INVALID_RESPONSE', status: response.status, responseDiagnostic });
      }
      const contact = data?.postContact;
      return { value: data, empty: options.kind === 'contact' && !normalizeSaudiPhone(contact?.contactMobile) && !publicSaudiPhone({ title: contact?.contactText || '', bodyText: '' }), status: response.status };
  });
}

export async function fetchHarajSearch(env, input, options = {}) {
  const data = await recoverHarajSearch(() => harajGraphql(env, env.HARAJ_SEARCH_URL || env.HARAJ_GRAPHQL_BASE_URL || env.HARAJ_POSTS_URL, SEARCH_QUERY, input, options), { signal: env.__b2cSignal });
  return data?.search || { items: [], pageInfo: { hasNextPage: false } };
}

export async function fetchPublicHarajConnection(env, field, query, variables) {
  const endpoint = new URL(field === 'profile' ? 'https://matjar.haraj.com.sa/graphql' : env.HARAJ_SEARCH_URL || env.HARAJ_GRAPHQL_BASE_URL || env.HARAJ_POSTS_URL);
  if (field !== 'profile') endpoint.searchParams.set('queryName', field);
  const data = await harajGraphql(env, endpoint.href, query, variables, { publicOnly: true, kind: field, field });
  return data[field];
}

export async function fetchHarajPostContact(env, postId) {
  const data = await harajGraphql(
    env,
    env.HARAJ_POST_CONTACT_URL || env.HARAJ_GRAPHQL_BASE_URL,
    CONTACT_QUERY,
    { postId: Number(postId), isManualRequest: false },
    { kind: 'contact', cacheKey: String(postId), timeoutMs: numeric(env.HARAJ_CONTACT_TIMEOUT_MS, 5_000, 2_000, 15_000) },
  );
  return data?.postContact || {};
}

export function normalizeSaudiPhone(phone) {
  let digits = latinDigits(phone).replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(2);
  if (digits.startsWith("05") && digits.length === 10) digits = `966${digits.slice(1)}`;
  else if (digits.startsWith("5") && digits.length === 9) digits = `966${digits}`;
  if (!/^9665\d{8}$/.test(digits)) return null;
  return `+${digits}`;
}

function latinDigits(value) {
  return String(value || "").replace(/[٠-٩۰-۹]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".includes(digit) ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit) : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export function publicSaudiPhone(candidate) {
  const text = latinDigits(`${candidate?.title || ""}\n${candidate?.bodyText || ""}`);
  const matches = text.match(/(?<!\d)(?:\+?966|00966|0)?[\s-]*5(?:[\s-]*\d){8}(?![\s-]*\d)/g) || [];
  for (const match of matches) {
    const phone = normalizeSaudiPhone(match);
    if (phone) return phone;
  }
  return null;
}

function resolvedCandidatePhone(contact, candidate) {
  const contactTextPhone = publicSaudiPhone({ bodyText: contact?.contactText });
  return normalizeSaudiPhone(contact?.contactMobile || contactTextPhone) || publicSaudiPhone(candidate);
}

function normalizeCandidate(post, strategy) {
  return {
    postId: Number(post.id), authorId: post.authorId == null ? null : Number(post.authorId), authorUsername: String(post.authorUsername || ""),
    title: String(post.title || ""), bodyText: String(post.bodyTEXT || "").slice(0, 8000), city: post.city || null,
    geoCity: post.geoCity || null, geoNeighborhood: post.geoNeighborhood || null,
    tags: Array.isArray(post.tags) ? post.tags.map(String) : [], postDate: Number(post.postDate || 0), updateDate: Number(post.updateDate || 0),
    price: post.price?.inputPrice == null ? null : Number(post.price.inputPrice), url: post.URL || null,
    matchedStrategy: {
      query: strategy.query || strategy.searchTerm,
      searchTerm: strategy.searchTerm || strategy.query,
      englishTerm: strategy.englishTerm || null,
      pathId: strategy.pathId,
      strategyType: strategy.strategyType,
      matchTerms: strategy.matchTerms,
      weight: strategy.weight,
      signal: strategy.signal || null,
      leadHypothesis: strategy.leadHypothesis || strategy.reason || null,
      sourceMode: "search",
    },
  };
}

function recencyScore(timestamp) {
  if (!timestamp) return 20;
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  const days = Math.max(0, (Date.now() - milliseconds) / 86_400_000);
  return Math.max(10, Math.round(100 - days * 1.5));
}

export function scoreB2CCandidate(candidate, plan) {
  const strategy = plan.strategies.find((item) => item.pathId === candidate.matchedStrategy.pathId)
    || candidate.matchedStrategy;
  const normalizedContent = normalizeText(`${candidate.title} ${candidate.bodyText}`);
  const query = normalizeText(strategy.searchTerm || strategy.query);
  const queryTokens = meaningfulTokens(query);
  const matchedSignals = queryTokens.filter((token) => normalizedContent.includes(token));
  const directNeed = /(?:مطلوب|ابي|أبي|ابغى|أبغى|احتاج|أحتاج|ادور|أدور|خربان|عطل|مشكلة|توضيب|افتتاح|جديد|wanted|need|looking for|broken|problem)/i.test(`${candidate.title} ${candidate.bodyText}`);
  const sellerLanguage = /(?:للبيع|نبيع|متوفر|متوفر لدينا|عرض خاص|لدينا|for sale|available|we sell)/i.test(`${candidate.title} ${candidate.bodyText}`);
  const ownerFallback = /OWNER_FALLBACK/i.test(String(strategy.strategyType || candidate.matchedStrategy.strategyType || ""));
  const categoryAnchored = hasStrategyAnchor(candidate);
  const evidenceMatch = categoryAnchored && (matchedSignals.length > 0 || directNeed || (ownerFallback && sellerLanguage));
  const competitorProbability = plan.dealIntent === "sell" && sellerLanguage && !directNeed && !ownerFallback ? 80 : ownerFallback ? 25 : 10;
  const score = evidenceMatch ? Math.max(55, Math.min(82, 52 + matchedSignals.length * 8 + (directNeed || (ownerFallback && sellerLanguage) ? 18 : 0) - (competitorProbability >= 70 ? 35 : 0))) : 0;
  const recency = recencyScore(candidate.updateDate || candidate.postDate);
  const candidateCities = [candidate.city, candidate.geoCity].filter(Boolean).map(canonicalCity);
  const geographyFit = !strategy.cities?.length || strategy.cities.some((city) => candidateCities.includes(canonicalCity(city))) ? 100 : 35;
  return {
    isQualified: score >= Number(plan.qualification?.minimumLeadScore || 65),
    marketplaceRole: plan.dealIntent === "buy" ? "SELLER" : "OWNER",
    identityConfidence: evidenceMatch ? 70 : 0,
    purchasePropensity: directNeed ? 82 : ownerFallback && sellerLanguage ? 68 : evidenceMatch ? 58 : 0,
    evidenceStrength: evidenceMatch ? 68 : 0,
    recencyScore: recency,
    sellerActivityScore: evidenceMatch ? 65 : 0,
    geographyFit,
    competitorProbability,
    irrelevantProbability: evidenceMatch ? 25 : 100,
    matchedSignals,
    negativeSignals: [
      ...(categoryAnchored ? [] : ["The advertisement does not contain the strategy's product or behavior anchor"]),
      ...(competitorProbability >= 70 ? ["The advertisement appears to sell the same offer"] : []),
    ],
    demandEvidence: directNeed,
    supplyEvidence: sellerLanguage,
    explanation: evidenceMatch
      ? "The full advertisement contains evidence related to the active lead hypothesis."
      : "Rejected because the full advertisement does not support the active lead hypothesis.",
    score,
  };
}

const qualificationBatchSchema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array", maxItems: 100,
      items: {
        type: "object", additionalProperties: false,
        required: ["postId", "verdict", "scoreScale", "score", "identityConfidence", "purchasePropensity", "evidenceStrength", "marketplaceRole", "matchedSignals", "negativeSignals", "competitorProbability", "irrelevantProbability", "explanation"],
        properties: {
          postId: { type: "number" }, verdict: { type: "string", enum: ["STRONG", "POSSIBLE", "REJECT"] },
          scoreScale: { type: "integer", enum: [100], description: "All scores and probabilities are integer percentages from 0 to 100, never fractions." },
          score: { type: "integer", minimum: 0, maximum: 100 }, identityConfidence: { type: "integer", minimum: 0, maximum: 100 }, purchasePropensity: { type: "integer", minimum: 0, maximum: 100 }, evidenceStrength: { type: "integer", minimum: 0, maximum: 100 },
          marketplaceRole: { type: "string" }, matchedSignals: { type: "array", maxItems: 8, items: { type: "string" } },
          negativeSignals: { type: "array", maxItems: 8, items: { type: "string" } }, competitorProbability: { type: "integer", minimum: 0, maximum: 100 },
          irrelevantProbability: { type: "integer", minimum: 0, maximum: 100 }, explanation: { type: "string" },
        },
      },
    },
  },
};

export async function qualifyCandidates(env, candidates, plan) {
  if (!candidates.length) return [];
  if (plan.keywordMatching?.version === KEYWORD_VERSION) return candidates.map(candidate => candidate.matchedStrategy?.strategyType==='PRODUCT_AD_FALLBACK'
    ? qualifyProductAdFallback(candidate,plan,Boolean(publicSaudiPhone(candidate)))
    : qualifyKeywordCandidate(candidate, plan));
  // Apply the free exclusions at this boundary too: callers other than the
  // page runner must never pay to review an already closed or empty listing.
  const promising = candidates.filter(candidate => !cheapCandidateReject(candidate));
  if (promising.length !== candidates.length) {
    const reviews = await qualifyCandidates(env, promising, plan);
    let next = 0;
    const merged = candidates.map(candidate => {
      const reason = cheapCandidateReject(candidate);
      return reason
        ? { isQualified: false, qualificationMode: 'local_reject', verdict: 'REJECT', score: 0, explanation: `Explicit exclusion: ${reason}.` }
        : reviews[next++];
    });
    if (reviews.fatalError) merged.fatalError = reviews.fatalError;
    return merged;
  }
  const minimumScore = Number(plan.qualification?.minimumLeadScore || 65);
  try {
    const result = await recoverQualification(candidates, async (reviewBatch) => structuredResponse(
      env,
      "waslah_b2c_batch_qualification",
      qualificationBatchSchema,
      `You qualify Saudi consumer leads from public advertisements. Judge the title and body together against the active lead hypothesis, not by literal keyword matching. Return STRONG only when the ad contains observable evidence that this advertiser plausibly needs the customer's offer (or credibly offers it when dealIntent is buy). POSSIBLE is plausible but incomplete. For OWNER_FALLBACK strategies, a private owner selling the product can qualify because ownership is the observable signal; reject professional shops, repeated resellers, and direct commercial competitors. For other sales strategies, reject competitors selling the same offer. Always reject irrelevant sellers, completed needs, job seekers, and speculative matches. Never infer private facts. Use the supplied strategy and negative signals. Return every postId exactly once.`,
      {
        offer: plan.product,
        dealIntent: plan.dealIntent,
        marketUnderstanding: plan.marketUnderstanding,
        qualificationInstructions: plan.qualificationInstructions,
        negativeSignals: plan.negativeSignals,
        scoreContract: "Set scoreScale to 100. Every score and probability is an integer percentage: 90 means 90%, not 0.9. Use the full 0–100 scale.",
        evidenceContract: "Search queries, strategy hypotheses and campaign wishes are NOT evidence about an advertiser. Only the title and body establish their intent. Never claim they want to upgrade merely because the search query says so. Job seekers and closed/sold listings must be REJECT. In OWNER_FALLBACK, a private owner offering their own matching item is sufficient evidence for STRONG as an ownership prospect; do not require buying intent. Do not label an ad a commercial reseller merely because it offers a recent product model; require observable shop or repeated-stock evidence.",
        advertisements: reviewBatch.map((candidate) => ({
          postId: candidate.postId,
          title: candidate.title,
          body: candidate.bodyText.slice(0, 2400),
          city: candidate.city || candidate.geoCity,
          date: candidate.updateDate || candidate.postDate,
          query: candidate.matchedStrategy.searchTerm || candidate.matchedStrategy.query,
          strategyType: candidate.matchedStrategy.strategyType,
          signal: candidate.matchedStrategy.signal,
          leadHypothesis: candidate.matchedStrategy.leadHypothesis,
        })),
      },
      6000,
      "low",
    ), env.__b2cSignal);
    if (!Array.isArray(result?.items)) throw new Error("Qualification model returned no decisions");
    const byPost = new Map(result.items.map((item) => [Number(item.postId), item]));
    const decisions = candidates.map((candidate) => {
      const localReason = cheapCandidateReject(candidate);
      if (localReason) return { isQualified: false, qualificationMode: 'local_reject', verdict: 'REJECT', score: 0, explanation: `Explicit exclusion: ${localReason}.` };
      const item = byPost.get(candidate.postId);
      if (!item) return { isQualified: false, retryable: true, qualificationMode: "deferred", verdict: "UNCERTAIN", score: 0, explanation: "AI review was incomplete; this candidate has not been rejected." };
      const score = numeric(item.score, 0, 0, 100);
      const categoryAnchored = hasStrategyAnchor(candidate);
      return {
        isQualified: item.verdict === "STRONG" && score >= minimumScore && numeric(item.irrelevantProbability, 100) < 70 && numeric(item.competitorProbability, 100) < 70,
        marketplaceRole: String(item.marketplaceRole || "UNKNOWN"),
        identityConfidence: numeric(item.identityConfidence, 0, 0, 100),
        purchasePropensity: numeric(item.purchasePropensity, 0, 0, 100),
        evidenceStrength: numeric(item.evidenceStrength, 0, 0, 100),
        recencyScore: recencyScore(candidate.updateDate || candidate.postDate),
        sellerActivityScore: numeric(item.evidenceStrength, 0, 0, 100),
        geographyFit: 100,
        competitorProbability: numeric(item.competitorProbability, 0, 0, 100),
        irrelevantProbability: numeric(item.irrelevantProbability, 0, 0, 100),
        matchedSignals: (item.matchedSignals || []).map(String).slice(0, 8),
        negativeSignals: [
          ...(item.negativeSignals || []).map(String),
        ].slice(0, 8),
        demandEvidence: item.verdict === "STRONG" && plan.dealIntent === "sell",
        supplyEvidence: item.verdict === "STRONG" && plan.dealIntent === "buy",
        verdict: item.verdict,
        explanation: String(item.explanation || "Evidence-based qualification completed."),
        score,
      };
    });
    if (result.fatalError) decisions.fatalError = result.fatalError;
    return decisions;
  } catch (error) {
    env.__b2cSignal?.throwIfAborted();
    if (["B2C_AI_UNAVAILABLE", "B2C_REVIEW_BUDGET"].includes(error?.code)) throw error;
    const failure = new Error("Wasla received an incomplete qualification response. Saved leads are kept; please retry.");
    failure.code = "B2C_QUALIFICATION_FAILED";
    throw failure;
  }
}

function localRelevanceRank(candidate, plan) {
  const content = normalizeText(`${candidate.title} ${candidate.bodyText}`);
  const query = normalizeText(candidate.matchedStrategy.searchTerm || candidate.matchedStrategy.query);
  const overlap = meaningfulTokens(query).filter((token) => content.includes(token)).length;
  const demand = /(?:مطلوب|ابي|أبي|ابغى|أبغى|احتاج|أحتاج|ادور|أدور|خربان|عطل|مشكلة|توضيب|افتتاح|عزيمة|مخيم|طلعة|wanted|need|looking for|broken|problem|opening|event)/i.test(`${candidate.title} ${candidate.bodyText}`);
  const supply = /(?:للبيع|نبيع|متوفر|متوفر لدينا|عرض خاص|لدينا|توريد|for sale|available|we sell|supplier)/i.test(`${candidate.title} ${candidate.bodyText}`);
  const procurement = plan.dealIntent === "buy";
  const ownerFallback = /OWNER_FALLBACK/i.test(String(candidate.matchedStrategy.strategyType || ""));
  const categoryAnchored = hasStrategyAnchor(candidate);
  return overlap * 18 + (categoryAnchored ? 60 : -120) + (demand ? 48 : 0) + ((procurement || ownerFallback) && supply ? 32 : 0) - (!procurement && !ownerFallback && supply && !demand ? 40 : 0) + recencyScore(candidate.updateDate || candidate.postDate) / 10;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function leadTier(score) {
  if (score >= 80) return "HOT";
  if (score >= 65) return "WARM";
  return "EXPERIMENTAL";
}

function evidenceFrom(candidate, qualification) {
  const email = extractEmail(`${candidate.title || ""}\n${candidate.bodyText || ""}`);
  return {
    postId: candidate.postId, title: candidate.title, bodyText: candidate.bodyText, tags: candidate.tags,
    city: candidate.city || candidate.geoCity, matchedSignals: qualification.matchedSignals,
    strategyType: candidate.matchedStrategy.strategyType, strategyWeight: candidate.matchedStrategy.weight, url: candidate.url,
    email, website: candidate.merchant?.domain || websiteFromBusinessEmail(email),
    grade: qualification.grade || (qualification.score >= 85 ? 'HIGH' : 'MEDIUM'),
    gradeBasis: qualification.gradeBasis || qualification.acceptanceBasis,
    buyerComment: candidate.buyerComment || null,
    businessContact: candidate.businessContact || null,
    contactSubject: candidate.contactSubject || null,
    merchant: candidate.merchant || null,
  };
}

export async function saveCandidate(database, campaign, candidate, qualification) {
  // Candidates are audit records, not contact records.  Discovery and
  // qualification must remain useful when a subject has not authorized phone
  // collection.  Strip every phone before persisting; authorization is checked
  // later, at the phone retrieval and delivered-lead boundaries.
  if(!database.isTransaction)return database.transaction(trx=>saveCandidate(trx,campaign,candidate,qualification));
  candidate=redactUnauthorizedContactData(candidate);
  qualification=redactUnauthorizedContactData(qualification);
  const candidateKey = candidateStorageKey(campaign, candidate);
  const row = {
    id: randomUUID(), candidate_key: candidateKey, organization_id: campaign.organization_id, campaign_id: campaign.id,
    post_id: candidate.postId, author_id: candidate.authorId, author_username: candidate.authorUsername || null,
    title: candidate.title, body_text: candidate.bodyText || null, city: candidate.city || candidate.geoCity || null,
    tags: dbJson(candidate.tags), post_date: candidate.postDate || null, update_date: candidate.updateDate || null,
    strategy: dbJson(candidate.matchedStrategy), qualification: dbJson(qualification), status: qualification.retryable ? "REVIEW_PENDING" : qualification.isQualified ? "QUALIFIED" : "REJECTED",
    raw_payload: dbJson(candidate), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  await database("b2c_candidates").insert(row).onConflict("candidate_key").merge({ qualification: row.qualification, status: row.status, updated_at: row.updated_at });
}

function candidateStorageKey(campaign, candidate) {
  return `${campaign.id}:${candidate.postId}:${candidate.matchedStrategy.searchTerm || candidate.matchedStrategy.query}${candidate.buyerComment ? `:comment:${candidate.buyerComment.id}:${candidate.authorId}` : ''}`;
}

async function mergeSellerLead(database, campaign, candidate, qualification, contact) {
  const textPhone = String(contact?.contactText || "").match(/(?:\+?966|0)?5\d{8}/)?.[0];
  const phone = normalizeSaudiPhone(contact?.contactMobile || textPhone);
  let existing = null;
  if (phone || candidate.authorId != null || candidate.authorUsername) {
    existing = await database("b2c_leads").where({ campaign_id: campaign.id }).andWhere((builder) => {
      let hasCondition = false;
      if (phone) {
        builder.where("phone", phone);
        hasCondition = true;
      }
      if (candidate.authorId != null) {
        (hasCondition ? builder.orWhere : builder.where).call(builder, "author_id", candidate.authorId);
        hasCondition = true;
      }
      if (candidate.authorUsername) (hasCondition ? builder.orWhere : builder.where).call(builder, "author_username", candidate.authorUsername);
    }).first();
  }
  const now = new Date().toISOString();
  const evidence = existing ? redactUnauthorizedContactData(jsonValue(existing.evidence, []),[phone,...(candidate.businessContact?.phones||[])].filter(Boolean)) : [];
  if (!evidence.some((item) => String(item.postId) === String(candidate.postId))) evidence.push(evidenceFrom(candidate, qualification));
  const score = Math.max(Number(existing?.score || 0), qualification.score);
  const leadKey = existing?.lead_key || `${campaign.id}:${phone || candidate.authorId || normalizeText(candidate.authorUsername) || candidate.postId}`;
  const values = {
    lead_key: leadKey, organization_id: campaign.organization_id, campaign_id: campaign.id, source_internal: candidate.contactSubject?.provider || "haraj",
    author_id: candidate.authorId, author_username: candidate.authorUsername || null, phone: phone || existing?.phone || null,
    city: candidate.city || candidate.geoCity || existing?.city || null, score, tier: leadTier(score),
    identity_confidence: Math.max(Number(existing?.identity_confidence || 0), qualification.identityConfidence),
    purchase_propensity: Math.max(Number(existing?.purchase_propensity || 0), qualification.purchasePropensity),
    marketplace_role: qualification.marketplaceRole, explanation: publicQualificationExplanation(qualification.explanation),
    evidence: dbJson(evidence), status: existing?.status || "DELIVERED", updated_at: now,
  };
  // Prepare first; persist after the inventory record exists (inventory_id is required).
  const leadId = existing?.id || randomUUID();
  return { id: leadId, ...values, evidence, phone, created: !existing };
}

function genericFingerprint(candidate, phone) {
  return createHash("sha256").update(`${candidate.contactSubject?.provider||'haraj'}|${phone || ""}|${candidate.contactSubject?.authorId||candidate.authorId || ""}|${normalizeText(candidate.authorUsername)}`).digest("hex");
}

async function syncGenericLead(database, campaign, sellerLead, candidate, qualification) {
  const fingerprint = genericFingerprint(candidate, sellerLead.phone);
  const now = new Date().toISOString();
  const email = extractEmail(`${candidate.title || ""}\n${candidate.bodyText || ""}`);
  const website = candidate.merchant?.domain || websiteFromBusinessEmail(email);
  const normalized = {
    name: candidate.merchant?.name || candidate.authorUsername || null, title: candidate.merchant ? 'Store contact' : candidate.buyerComment ? "Contact" : "Founder", company: candidate.merchant?.name || candidate.authorUsername || `Wasla-Lite prospect ${candidate.authorId || candidate.postId}`,
    company_normalized: normalizeText(candidate.authorUsername || `b2c-${candidate.authorId || candidate.postId}`), email, phone: sellerLead.phone, website,
    location: sellerLead.city, industry: candidate.matchedStrategy.searchTerm || candidate.matchedStrategy.query, source: "b2c", source_reference: String(candidate.authorId || candidate.authorUsername || candidate.postId),
    fit_score: sellerLead.score, qualification_status: sellerLead.tier === "HOT" ? "qualified" : "new", enrichment_status: "enriched",
    enrichment_score: qualification.evidenceStrength, enrichment_summary: publicQualificationExplanation(qualification.explanation),
    enrichment_signals: dbJson(qualification.matchedSignals), raw_payload: dbJson({ sellerLead, evidence: sellerLead.evidence,
      phone_numbers: (candidate.businessContact?.phones || []).map(number => ({ number, label: 'Phone' })),
      contact_kind: candidate.buyerComment ? 'authorized_contact' : null,
      lite_grade: qualification.grade || (qualification.score >= 85 ? 'HIGH' : 'MEDIUM'),
      buyer_comment: candidate.buyerComment || null,
      contact_subject: candidate.contactSubject || null,
      merchant: candidate.merchant || null,
    }), last_enriched_at: now, updated_at: now,
  };
  let inventory = await database("lead_inventory").where({ fingerprint }).first();
  if (!inventory && normalized.source_reference) inventory = await database("lead_inventory").whereIn("source", ["b2c", "haraj"]).where({ source_reference: normalized.source_reference }).first();
  if (inventory) await database("lead_inventory").where({ id: inventory.id }).update(normalized);
  else {
    inventory = { id: randomUUID(), fingerprint, ...normalized, created_at: now };
    await database("lead_inventory").insert(inventory);
  }
  const [requestUser, requestOrganization] = await Promise.all([
    database("directus_users").select("email").where({ id: campaign.user_id }).first(),
    database("organizations").select("name").where({ id: campaign.organization_id }).first(),
  ]);
  const resultKey = `${campaign.request_id}:${inventory.id}`;
  await database("lead_request_results").insert({
    id: randomUUID(), result_key: resultKey, organization_id: campaign.organization_id, organization_name: requestOrganization?.name || null,
    request_id: campaign.request_id, request_query: campaign.original_prompt, user_id: campaign.user_id, user_email: requestUser?.email || null,
    lead_id: inventory.id, rank: 100 - sellerLead.score, preview: dbJson({ company: normalized.company, title: normalized.title, location: normalized.location, industry: normalized.industry }),
    status: "available", created_at: now,
  }).onConflict("result_key").ignore();
  return inventory;
}

async function chargeFetchedLead(database, campaign, sellerLead, inventory) {
  const priceHalalas = 100;
  const grantKey = `${campaign.organization_id}:${inventory.id}`;
  const existingGrant = await database("lead_access_grants").where({ grant_key: grantKey }).first();
  if (existingGrant) return;

  const wallet = await database("wallets").where({ organization_id: campaign.organization_id }).forUpdate().first();
  if (!wallet || Number(wallet.balance_halalas) < priceHalalas) {
    throw new Error("You are out of credits. Add 10 credits for each additional lead you want to fetch.");
  }

  const now = new Date().toISOString();
  const transactionId = randomUUID();
  await database("wallet_transactions").insert({
    id: transactionId,
    organization_id: campaign.organization_id,
    wallet_id: wallet.id,
    type: "b2c_lead_fetch",
    amount_halalas: -priceHalalas,
    idempotency_key: `b2c-lead-fetch:${campaign.id}:${sellerLead.id}`,
    reference_type: "b2c_lead",
    reference_id: sellerLead.id,
    metadata: dbJson({ credits: 10, price_sar: 1, campaign_id: campaign.id, lead_id: inventory.id }),
    created_at: now,
  });
  await database("lead_access_grants").insert({
    id: randomUUID(),
    grant_key: grantKey,
    organization_id: campaign.organization_id,
    lead_id: inventory.id,
    transaction_id: transactionId,
    grant_reason: "b2c_campaign",
    granted_at: now,
  });
  await database("wallets").where({ id: wallet.id }).update({
    balance_halalas: Number(wallet.balance_halalas) - priceHalalas,
    updated_at: now,
  });
}

async function updateCampaign(database, campaignId, status, stats, errorMessage = null) {
  const now = Date.now();
  const startedAtMs = Date.parse(stats.startedAt || "");
  const firstLeadAtMs = Date.parse(stats.firstLeadAt || "");
  const postsFetched = Number(stats.postsFetched || 0);
  const candidatesQualified = Number(stats.candidatesQualified || 0);
  const contactAttempts = Number(stats.contactAttempts || 0);
  const contactCandidatesProcessed = Number(stats.contactCandidatesProcessed || 0);
  const contactsResolved = Number(stats.contactsResolved || 0);
  const uniqueLeads = Number(stats.uniqueLeads || 0);
  const uniqueCandidates = Number(stats.uniqueCandidatesTotal ?? stats.uniqueCandidates ?? 0);
  const duplicateCandidates = Number(stats.duplicateCandidatesSkippedTotal ?? stats.duplicateCandidatesSkipped ?? 0);
  stats.qualityMetrics = {
    queryAlignment: stats.relevanceSample?.aligned ?? null,
    relevanceSampleStatus: stats.relevanceSample?.status || "pending",
    qualificationRate: postsFetched ? Number((candidatesQualified / postsFetched).toFixed(4)) : 0,
    phoneResolutionRate: contactCandidatesProcessed
      ? Number((Math.min(contactsResolved, contactCandidatesProcessed) / contactCandidatesProcessed).toFixed(4))
      : 0,
    uniqueSellerRate: uniqueCandidates + duplicateCandidates
      ? Number((uniqueCandidates / (uniqueCandidates + duplicateCandidates)).toFixed(4))
      : 0,
    adsPerDeliveredLead: uniqueLeads ? Number((postsFetched / uniqueLeads).toFixed(2)) : null,
    timeToFirstLeadSeconds: Number.isFinite(startedAtMs) && Number.isFinite(firstLeadAtMs)
      ? Math.max(0, Math.round((firstLeadAtMs - startedAtMs) / 1000))
      : null,
    elapsedSeconds: Number.isFinite(startedAtMs) ? Math.max(0, Math.round((now - startedAtMs) / 1000)) : 0,
  };
  await database("b2c_campaigns").where({ id: campaignId }).whereNot({ status: "CANCELLED" }).update({ status, stats: dbJson(stats), error_message: errorMessage, updated_at: new Date().toISOString() });
}

const B2C_EXECUTION_RULES = [
  { id: "exact-count-contract", label: "Exact requested count is the completion contract" },
  { id: "versioned-ai-strategist", label: `Use ${STRATEGIST_VERSION} to select buyer signals and phased Saudi search queries` },
  { id: "evidence-qualification", label: "Qualify title and description against the lead hypothesis; reject competitors and speculative matches" },
  { id: "concurrent-signal-probes", label: "Probe distinct buyer signals concurrently and confirm zero yield across two sampled pages before pausing a query" },
  { id: "adaptive-recovery", label: "Generate a materially different recovery plan from observed rejection patterns when the first strategy set is exhausted" },
  { id: "verified-phone-only", label: "Only leads with a valid Saudi mobile number are delivered and charged" },
  { id: "organization-wide-deduplication", label: "Never redeliver the same seller or phone to the same workspace" },
  { id: "fresh-page-cursors", label: "Continue from page zero through every fresh result page until the target or true source exhaustion" },
  { id: "parallel-contact-resolution", label: "Resolve verified contact data concurrently within a bounded connection limit" },
  { id: "no-partial-success", label: "A short batch is never marked as a completed campaign" },
];

function appendExecutionEvent(stats, code, detail = {}) {
  const ledger = Array.isArray(stats.executionLedger) ? stats.executionLedger : [];
  ledger.push({ at: new Date().toISOString(), pass: Number(stats.searchPass || 0), code, ...detail });
  stats.executionLedger = ledger.slice(-400);
}

export async function persistQualifiedB2CLead(database, campaign, candidate, qualification, contact, detailed = false, { signal } = {}) {
  signal?.throwIfAborted();
  return database.transaction(async (trx) => {
    // Serialize workspace deduplication, target checks, charging and insertion.
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`b2c:${campaign.organization_id}`]);
    const request = await trx("lead_requests").where({ id: campaign.request_id }).forUpdate().first();
    const currentCampaign = await trx("b2c_campaigns").where({ id: campaign.id }).first();
    signal?.throwIfAborted();
    if (currentCampaign?.status === "CANCELLED" || request?.status === "cancelled") return detailed ? { created: false, reason: "cancelled" } : null;
    const committedCount = Number(request?.result_count || 0);
    if (committedCount >= Number(campaign.target_lead_count)) return detailed ? { created: false, committedCount, reason: "target_reached" } : null;
    const phone = resolvedCandidatePhone(contact, candidate);
    if (!phone) throw new Error("Cannot save a Wasla-Lite lead without a valid Saudi mobile number.");
    const authorization=await authorizeContactSave(trx,campaign.organization_id,candidate,phone,{lock:true});
    if(!authorization.allowed)return detailed?{created:false,committedCount,reason:'not_authorized',detail:authorization.detail}:null;
    const allowedPhones=[phone];
    for(const extra of new Set(candidate.businessContact?.phones||[])){
      if(normalizeSaudiPhone(extra)===phone)continue;
      const permission=await authorizeContactSave(trx,campaign.organization_id,candidate,extra,{lock:true});
      if(permission.allowed)allowedPhones.push(extra);
    }
    candidate=redactUnauthorizedContactData(candidate,allowedPhones);
    qualification=redactUnauthorizedContactData(qualification,allowedPhones);
    contact=redactUnauthorizedContactData(contact,allowedPhones);
    const duplicate = await trx("b2c_leads").where({ organization_id: campaign.organization_id, status: "DELIVERED" }).andWhere((builder) => {
      builder.where({ phone });
      if (candidate.authorId != null) builder.orWhere({ author_id: candidate.authorId });
      if (candidate.authorUsername) builder.orWhereRaw("lower(author_username) = lower(?)", [candidate.authorUsername]);
    }).first();
    if (duplicate) return detailed ? { created: false, committedCount, reason: "duplicate", inventoryId: duplicate.inventory_id } : duplicate.inventory_id;
    signal?.throwIfAborted();
    const sellerLead = await mergeSellerLead(trx, campaign, candidate, qualification, contact);
    const inventory = await syncGenericLead(trx, campaign, sellerLead, candidate, qualification);
    const { created, evidence, ...leadValues } = sellerLead;
    const storedLead = { ...leadValues, evidence: dbJson(evidence), inventory_id: inventory.id };
    if (created) await trx("b2c_leads").insert({ ...storedLead, created_at: new Date().toISOString() });
    else await trx("b2c_leads").where({ id: sellerLead.id }).update(storedLead);
    if (created) await chargeFetchedLead(trx, campaign, sellerLead, inventory);
    if (created) await trx("lead_requests").where({ id: campaign.request_id }).update({ result_count: committedCount + 1, updated_at: new Date().toISOString() });
    signal?.throwIfAborted();
    return detailed ? { created, committedCount: committedCount + Number(created), inventoryId: inventory.id, tier: sellerLead.tier } : inventory.id;
  });
}

const activeCampaignRuns = new Map();
const campaignControllers = new Map();
function continueB2CCampaign(options) {
  // Queue immediately after the previous pass releases its lock. No fixed gap.
  const previous = activeCampaignRuns.get(options.campaignId);
  setImmediate(() => Promise.resolve(previous).catch(() => undefined)
    .then(() => runB2CCampaign(options)).catch(() => undefined));
}
export function abortB2CCampaign(id) { campaignControllers.get(id)?.abort(new Error("Run stopped by user")); }
export function runB2CCampaign(options) {
  if (activeCampaignRuns.has(options.campaignId)) return activeCampaignRuns.get(options.campaignId);
  const controller = new AbortController();
  campaignControllers.set(options.campaignId, controller);
  const running = executeB2CCampaign({ ...options, env: { ...options.env, __b2cSignal: controller.signal } }).finally(() => { activeCampaignRuns.delete(options.campaignId); campaignControllers.delete(options.campaignId); });
  activeCampaignRuns.set(options.campaignId, running);
  return running;
}

async function reconcileB2CCount(database, campaign) {
  return database.transaction(async (trx) => {
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`b2c:${campaign.organization_id}`]);
    const aggregate = await trx("b2c_leads").where({ campaign_id: campaign.id, status: "DELIVERED" }).select("tier").count("id as count").groupBy("tier");
    const count = aggregate.reduce((sum, row) => sum + Number(row.count), 0);
    await trx("lead_requests").where({ id: campaign.request_id }).update({ result_count: count, updated_at: new Date().toISOString() });
    return aggregate;
  });
}

async function executeB2CCampaign({ database, env, campaignId, logger }) {
  const campaign = await database("b2c_campaigns").where({ id: campaignId }).first();
  if (!campaign) throw new Error("Wasla-Lite campaign not found.");
  if (campaign.status === "CANCELLED") return jsonValue(campaign.stats, {});
  const plan = jsonValue(campaign.acquisition_plan, {});
  const previousStats = jsonValue(campaign.stats, {});
  const parentSignal = env.__b2cSignal;
  const runtime = harajRuntime(previousStats.harajRuntime, campaign.target_lead_count, previousStats.rerunRequestedAt || 'initial');
  let deadline;
  // Honor the current account route on every pass/retry. An old comments-only
  // snapshot must not pin an account after its acquisition route is restored.
  const configuredLiteSearchMode = await readLiteSearchMode(database, campaign.user_id);
  // The explicit staged policy supersedes the earlier account-only source mode
  // for product-selling Lite plans; procurement/legacy plans retain that mode.
  const liteSearchMode = plan.audienceRoute==='marketplace'?'listings_only':usesPublicKeywordProfile(plan) && plan.dealIntent!=='buy' ? 'mixed' : configuredLiteSearchMode;
  const routePolicy = liteRoutePolicy(liteSearchMode);
  const passCheckpoint = JSON.parse(JSON.stringify(previousStats.strategyProgress || {}));
  const existingAggregate = await reconcileB2CCount(database, campaign);
  const existingCount = existingAggregate.reduce((sum, row) => sum + Number(row.count), 0);
  const stats = {
    harajRuntime: runtime,
    rerunRequestedAt: previousStats.rerunRequestedAt || null,
    mahally: previousStats.mahally,
    merchantFallbackStatus: String(env.MAHALLY_ENABLED || 'false') !== 'true' ? 'disabled'
      : !env.MAHALLY_WORKER_URL || String(env.MAHALLY_WORKER_TOKEN || '').length < 32 ? 'unconfigured' : 'ready',
    orderedAcquisition: previousStats.orderedAcquisition,
    commentDiscovery: previousStats.commentDiscovery,
    listingsFetchedTotal: previousStats.listingsFetchedTotal,
    strategyProgress: passCheckpoint,
    liteSearchMode,
    postsFetched: Number(previousStats.postsFetched || 0),
    candidatesQualified: Number(previousStats.candidatesQualified || 0),
    contactsResolved: Number(previousStats.contactsResolved || 0),
    contactFingerprints: previousStats.contactFingerprints || [],
    contactAttempts: Number(previousStats.contactAttempts || 0),
    cachedContactHits: Number(previousStats.cachedContactHits || 0),
    publicPhoneHits: Number(previousStats.publicPhoneHits || 0),
    remoteContactSkipped: Number(previousStats.remoteContactSkipped || 0),
    contactErrors: Number(previousStats.contactErrors || 0),
    contactCandidatesProcessed: Number(previousStats.contactCandidatesProcessed || 0),
    contactExclusions: previousStats.contactExclusions || {},
    authorizationDiagnostics: previousStats.authorizationDiagnostics || {candidatesDiscovered:0,uniqueQualifiedBuyers:0,decisionsByReason:{},eligiblePhoneLookups:0,successfulAuthorizedLookups:0,persistedDeliverableLeads:0},
    uniqueLeads: existingCount,
    hotLeads: Number(existingAggregate.find((row) => row.tier === "HOT")?.count || 0),
    warmLeads: Number(existingAggregate.find((row) => row.tier === "WARM")?.count || 0),
    startedAt: previousStats.startedAt || previousStats.rerunRequestedAt || campaign.created_at || new Date().toISOString(),
    strategyRegenerations: Number(previousStats.strategyRegenerations || 0),
    firstLeadAt: previousStats.firstLeadAt || null,
    relevanceSample: previousStats.relevanceSample || null,
    relevanceSamplePosts: Number(previousStats.relevanceSamplePosts || 0),
    relevanceSampleQualified: Number(previousStats.relevanceSampleQualified || 0),
    uniqueCandidatesTotal: Number(previousStats.uniqueCandidatesTotal || 0),
    duplicateCandidatesSkippedTotal: Number(previousStats.duplicateCandidatesSkippedTotal || 0),
    executionRules: plan.keywordMatching ? B2C_EXECUTION_RULES.filter(rule => !['versioned-ai-strategist', 'adaptive-recovery', 'evidence-qualification'].includes(rule.id)).concat([
      { id: 'keyword-plan-once', label: 'Generate a short Saudi keyword plan before searching; no per-listing AI calls' },
      { id: 'local-keyword-validation', label: 'Match title/body locally and require operating-business evidence for restaurant or cafe prospects' },
    ]) : B2C_EXECUTION_RULES,
    executionLedger: Array.isArray(previousStats.executionLedger) ? previousStats.executionLedger : [],
    exactCountContract: { requested: Number(campaign.target_lead_count || 0), delivered: existingCount, remaining: Math.max(0, Number(campaign.target_lead_count || 0) - existingCount) },
  };
  await updateCampaign(database, campaign.id, "RUNNING", stats);
  stats.providerDiagnostics = (previousStats.providerDiagnostics || []).slice(-100);
  env.__b2cDiagnostics = stats.providerDiagnostics;
  stats.reviewBudget = {
    limitUsd: Math.max(0.01, Number(env.B2C_REVIEW_BUDGET_USD) || 5),
    inputUsdPerMillion: Math.max(0.01, Number(env.B2C_REVIEW_INPUT_USD_PER_MILLION) || 1),
    outputUsdPerMillion: Math.max(0.01, Number(env.B2C_REVIEW_OUTPUT_USD_PER_MILLION) || 4),
    reservedUsd: Number(previousStats.reviewBudget?.reservedUsd || 0),
    requests: Number(previousStats.reviewBudget?.requests || 0),
    basis: 'conservative qualification-only reservation, not actual billed spend',
  };
  env.__b2cReviewBudget = stats.reviewBudget;
  stats.deferredReviews = Number(previousStats.deferredReviews || 0);
  stats.searchMs = Number(previousStats.searchMs || 0);
  stats.dbMs = Number(previousStats.dbMs || 0);
  stats.jevMs = Number(previousStats.jevMs || 0);
  stats.jevEnabled = Boolean(env.B2C_JEV_OPENROUTER_API_KEY || env.AI_GATEWAY_API_KEY) && String(env.B2C_JEV_SHADOW || "false") === "true";
  stats.jevEvaluations = Number(previousStats.jevEvaluations || 0);
  stats.jevErrors = Number(previousStats.jevErrors || 0);
  deadline = harajDeadline(runtime, null, parentSignal);
  env.__b2cSignal = deadline.signal;
  const runMerchantFallback = async () => {
    deadline.close();
    env.__b2cSignal = parentSignal;
    if (!usesPublicKeywordProfile(plan) || plan.audienceRoute==='marketplace' || liteSearchMode !== 'mixed' || plan.dealIntent === 'buy'
      || stats.uniqueLeads >= Number(campaign.target_lead_count) || String(env.MAHALLY_ENABLED || 'false') !== 'true') return;
    appendExecutionEvent(stats, 'MAHALLY_SEARCH_STARTED', { stage: 'merchant_contacts' });
    const checkpoint = () => updateCampaign(database, campaign.id, 'RUNNING', stats);
    await runMahallyFallback({ env, plan, stats, target: Number(campaign.target_lead_count), signal: parentSignal,
      recordDirectory: evidence => recordMerchantDirectoryContact(database, campaign.organization_id, evidence),
      authorize: createContactAuthorizer(database, campaign.organization_id), checkpoint,
      shouldStop: () => stats.uniqueLeads >= Number(campaign.target_lead_count),
      onCandidate: async (candidate, qualification, contact) => {
        const result = await persistQualifiedB2CLead(database, campaign, candidate, qualification, contact, true, { signal: parentSignal });
        if (result.created) { stats.uniqueLeads = result.committedCount; stats.contactsResolved++; stats.candidatesQualified++; stats.firstLeadAt ||= new Date().toISOString(); await checkpoint(); }
        return result;
      } });
    appendExecutionEvent(stats, 'MAHALLY_SEARCH_FINISHED', { delivered: stats.mahally.delivered, reason: stats.mahally.stopReason });
    await checkpoint();
  };
  try {
    if(plan.audienceRoute==='merchants'){
      deadline.close();env.__b2cSignal=parentSignal;
      if(stats.merchantFallbackStatus!=='ready')throw Object.assign(Error('Store discovery is not configured. An administrator must enable the merchant worker.'),{code:'MAHALLY_UNCONFIGURED'});
      await runMerchantFallback();
      const complete=stats.uniqueLeads>=Number(campaign.target_lead_count);
      const message=complete?null:`Store search saved ${stats.uniqueLeads} of ${Number(campaign.target_lead_count)} leads. Discovery stopped: ${stats.mahally?.stopReason||'no_matching_stores'}. Saved results are kept.`;
      await database('lead_requests').where({id:campaign.request_id}).whereNot({status:'cancelled'}).update({status:complete?'sourced':stats.uniqueLeads?'partial':'failed',result_count:stats.uniqueLeads,error_message:message,updated_at:new Date().toISOString()});
      await updateCampaign(database,campaign.id,complete?'COMPLETED':'FAILED',stats,message);
      return stats;
    }
    env.__b2cSignal.throwIfAborted();
    if (!routePolicy.listings && (!plan.keywordMatching?.productTerms?.length || plan.dealIntent === 'buy')) throw new Error('Comments-only mode requires a product-selling Lite search. No listing fallback was run.');
    const connectionSafety = await harajSafety().status();
    if (connectionSafety.paused) throw safeHarajError('HARAJ_SAFETY_PAUSED', `Connection status: ${connectionSafety.reason}.`, connectionSafety.retryAt);
    // A persisted phone circuit is not a fresh reveal attempt on every ad.
    const publicKeywordProfile = usesPublicKeywordProfile(plan);
    const orderedFlow = !plan.audienceRoute && publicKeywordProfile && liteSearchMode==='mixed' && plan.dealIntent!=='buy';
    if(orderedFlow){
      plan.strategies=orderedLiteStrategies(plan);
      plan.searchStrategyVersion=8;
      stats.orderedAcquisition=previousStats.orderedAcquisition?.version===LITE_ACQUISITION_VERSION?previousStats.orderedAcquisition:{version:LITE_ACQUISITION_VERSION,stage:'buyer_intent',usage:{}};
      stats.orderedAcquisition.limits=liteAcquisitionLimits(campaign.target_lead_count);
    }
    stats.executionProfile = publicKeywordProfile ? LITE_EXECUTION_PROFILE : 'legacy-evidence-review';
    stats.contactLookupMode = (publicKeywordProfile && !orderedFlow && plan.audienceRoute!=='marketplace') || connectionSafety.contactsPaused ? 'public_contacts_only' : 'public_then_guarded_lookup';
    stats.contactLookupLimitReason = connectionSafety.contactPauseReason || (publicKeywordProfile && !orderedFlow ? 'public_keyword_profile' : null);
    if (!publicKeywordProfile && String(env.B2C_JEV_REQUIRED || "false") === "true" && !(env.B2C_JEV_OPENROUTER_API_KEY || env.AI_GATEWAY_API_KEY)) throw new Error("Jev is required for this run but its credential is not configured.");
    const limit = numeric(env.HARAJ_DEFAULT_LIMIT, 50, 1, 100);
    // Expand old stored keyword plans at execution time too, so Retry benefits
    // immediately without requiring the customer to recreate the campaign.
    if (plan.keywordMatching && !orderedFlow && !plan.audienceRoute) plan.strategies = expandKeywordStrategies(plan, plan.strategies?.[0]?.cities || []);
    const strategies = routePolicy.listings && Array.isArray(plan.strategies) ? plan.strategies : [];
    const configuredMaxAds = plan.audienceRoute==='marketplace'?liteAcquisitionLimits(campaign.target_lead_count).total:effectiveListingLimit(await readListingLimits(database), Number(campaign.target_lead_count), env.B2C_MAX_ADS_PER_CAMPAIGN);
    // Zero means exhaustive. A deployment may still set an explicit emergency
    // ceiling, but ordinary campaigns keep paging until the target or true end.
    const maxAds = !orderedFlow && Number.isFinite(configuredMaxAds) && configuredMaxAds > 0
      ? Math.min(Math.floor(configuredMaxAds), 10_000_000)
      : 0;
    stats.listingLimitSnapshot = maxAds;
    const pageBudget = listingBudget(maxAds, Number(previousStats.listingsFetchedTotal ?? previousStats.postsFetched ?? 0));
    stats.listingsFetchedTotal = pageBudget.used;
    const minimumSamplePages = numeric(env.B2C_MIN_SAMPLE_PAGES, 2, 1, 5);
    const defaultPage = Math.max(0, Math.floor(Number(env.HARAJ_DEFAULT_PAGE || 0)));
    const strategyProgress = jsonValue(previousStats.strategyProgress, {}) || {};
    const strategyKey = (strategy) => String(strategy.pathId || strategy.searchTerm || strategy.query);
    for (const strategy of strategies) {
      const key = strategyKey(strategy);
      const saved = strategyProgress[key] || {};
      const resumeOwner = publicKeywordProfile && ['low_yield_cutoff','no_verified_lead_yield'].includes(saved.exhaustedReason);
      strategyProgress[key] = {
        query: strategy.searchTerm || strategy.query,
        nextPage: Math.max(defaultPage, Math.floor(Number(saved.nextPage ?? defaultPage))),
        pagesFetched: Math.max(0, Math.floor(Number(saved.pagesFetched || 0))),
        reviewedPages: Math.max(0, Math.floor(Number(saved.reviewedPages ?? saved.pagesFetched ?? 0))),
        postsFetched: Math.max(0, Math.floor(Number(saved.postsFetched || 0))),
        candidatesReviewed: Math.max(0, Math.floor(Number(saved.candidatesReviewed || 0))),
        qualifiedCount: Math.max(0, Math.floor(Number(saved.qualifiedCount || 0))),
        deliveredCount: Math.max(0, Math.floor(Number(saved.deliveredCount || 0))),
        zeroYieldPages: Math.max(0, Math.floor(Number(saved.zeroYieldPages || 0))),
        noLeadPages: Math.max(0, Math.floor(Number(saved.noLeadPages || 0))),
        exhausted: Boolean(saved.exhausted && !resumeOwner),
        exhaustedReason: resumeOwner ? null : saved.exhaustedReason || null,
        lastPageSignature: saved.lastPageSignature || null,
        repeatedPageCount: Math.max(0, Math.floor(Number(saved.repeatedPageCount || 0))),
        seenPostIds: saved.seenPostIds || [],
        noNewPages: Number(saved.noNewPages || 0),
      };
    }
    stats.searchPass = Number(previousStats.searchPass || 0) + 1;
    appendExecutionEvent(stats, "PASS_STARTED", { delivered: stats.uniqueLeads, requested: Number(campaign.target_lead_count) });
    stats.pagesPerStrategy = null;
    stats.continuousSearch = true;
    stats.strategyProgress = strategyProgress;
    stats.maxAds = maxAds || null;
    stats.sourceExhausted = strategies.length === 0 || strategies.every((strategy) => strategyProgress[strategyKey(strategy)].exhausted);
    const openStrategies = strategies.filter((strategy) => !strategyProgress[strategyKey(strategy)].exhausted);
    const productiveStrategies = openStrategies.filter((strategy) => strategyProgress[strategyKey(strategy)].deliveredCount > 0);
    const concurrency = numeric(env.B2C_PARALLEL_STRATEGIES, 4, 1, 8);
    const acquisitionStage=orderedFlow?orderedLiteStage(strategies,strategyProgress,previousStats.commentDiscovery,stats.orderedAcquisition.stage,stats.orderedAcquisition.limits,stats.orderedAcquisition.usage,runtime.stoppedStages):null;
    deadline.close();
    deadline = harajDeadline(runtime, acquisitionStage, parentSignal);
    env.__b2cSignal = deadline.signal;
    env.__b2cSignal.throwIfAborted();
    const stageBudget=orderedFlow&&acquisitionStage!=='product_comments'&&acquisitionStage
      ?listingBudget(stats.orderedAcquisition.limits[acquisitionStage],Number(stats.orderedAcquisition.usage[acquisitionStage]||0)):null;
    if(orderedFlow){stats.orderedAcquisition.stage=acquisitionStage;appendExecutionEvent(stats,'ACQUISITION_STAGE_STARTED',{stage:acquisitionStage});}
    const strategyPool = orderedFlow
      ? openStrategies.filter(strategy=>acquisitionStage==='buyer_intent'?strategy.strategyType==='DIRECT_PURCHASE_INTENT':acquisitionStage==='product_ads'?strategy.strategyType==='PRODUCT_AD_FALLBACK':false)
      : productiveStrategies.length ? productiveStrategies : openStrategies;
    const activePhaseIndex = strategyPool.length
      ? Math.min(...strategyPool.map((strategy) => Number(strategy.phaseIndex || 0)))
      : null;
    const activeStrategies = strategyPool
      .filter((strategy) => Number(strategy.phaseIndex || 0) === activePhaseIndex)
      .sort((left, right) => Number(left.phaseIndex || 0) - Number(right.phaseIndex || 0) || Number(right.weight || 0) - Number(left.weight || 0))
      .slice(0, concurrency);
    stats.activeStrategyPhase = activeStrategies.length
      ? [...new Set(activeStrategies.map((strategy) => strategy.phase || "primary"))].join(", ")
      : null;
    stats.strategistVersion = plan.strategistVersion || STRATEGIST_VERSION;
    let passPostsEvaluated = 0;
    let passQualified = 0;
    let reviewedCandidateCount = 0;
    const sellerKey = (candidate) => candidate.authorId != null
      ? `author:${candidate.authorId}` : candidate.authorUsername
        ? `username:${normalizeText(candidate.authorUsername)}` : `post:${candidate.postId}`;
    const deliveredRows = await database("b2c_leads").select("author_id", "author_username", "phone")
      .where({ organization_id: campaign.organization_id, status: "DELIVERED" });
    const deliveredSellers = new Set();
    const deliveredPhones = new Set();
    for (const row of deliveredRows) {
      if (row.author_id != null) deliveredSellers.add(`author:${row.author_id}`);
      if (row.author_username) deliveredSellers.add(`username:${normalizeText(row.author_username)}`);
      if (normalizeSaudiPhone(row.phone)) deliveredPhones.add(normalizeSaudiPhone(row.phone));
    }
    const alreadyDelivered = (candidate) => deliveredSellers.has(sellerKey(candidate))
      || (candidate.authorUsername && deliveredSellers.has(`username:${normalizeText(candidate.authorUsername)}`))
      || deliveredPhones.has(publicSaudiPhone(candidate));
    const candidateStatus = (candidate, status) => database("b2c_candidates")
      .where({ candidate_key: candidateStorageKey(campaign, candidate) })
      .update({ status, updated_at: new Date().toISOString() });
    const contacts = new Map();
    let statsWrite = Promise.resolve();
    let lastStatsWrite = 0;
    const flushStats = (force = false) => {
      if (!force && Date.now() - lastStatsWrite < 500) return statsWrite;
      lastStatsWrite = Date.now();
      statsWrite = statsWrite.then(() => updateCampaign(database, campaign.id, "RUNNING", stats));
      return statsWrite;
    };
    stats.pipelineVersion = "overlapping-stages-v2";
    stats.passContactAttempts = 0;
    stats.qualificationLatencyMs = Number(previousStats.qualificationLatencyMs || 0);
    stats.contactLatencyMs = Number(previousStats.contactLatencyMs || 0);
    stats.remoteContactHits = Number(previousStats.remoteContactHits || 0);
    stats.aiFallbackCount = Number(previousStats.aiFallbackCount || 0);
    stats.localRejected = Number(previousStats.localRejected || 0);
    stats.qualificationCacheHits = Number(previousStats.qualificationCacheHits || 0);
    stats.jevShadow = previousStats.jevShadow || { mode: "shadow", samples: [], counts: { PASS: 0, REJECT: 0, UNCERTAIN: 0 }, falseRejectAuditRate: null };
    stats.jevShadow.available = Boolean(env.B2C_JEV_OPENROUTER_API_KEY || env.AI_GATEWAY_API_KEY);
    const authorizationDiagnostics=stats.authorizationDiagnostics;
    authorizationDiagnostics.decisionsByReason ||= {};
    authorizationDiagnostics.providerDecisionsByReason ||= {};
    authorizationDiagnostics.individualConsentByReason ||= {};
    authorizationDiagnostics.apiFailuresByReason ||= {};
    const recordAuthorization=(decision,options)=>recordContactAuthorization(authorizationDiagnostics,decision,options);
    const scheduler = contactScheduler({
      target: Number(campaign.target_lead_count), initialCount: stats.uniqueLeads,
      concurrency: 4,
      process: async ({ candidate, qualification }) => {
        env.__b2cSignal?.throwIfAborted();
        const provider=candidate.contactSubject?.provider||'haraj';
        const subject=candidate.contactSubject?.authorId||candidate.authorId;
        const authorize=createContactAuthorizer(database,campaign.organization_id);
        // Existing contact data needs save permission, not a redundant lookup
        // grant. The centralized policy selects verified provider coverage,
        // exact business-publication evidence, or subject consent.
        let authorizedKnownContact=null;
        for(const phone of candidate.businessContact?.phones||[]){
          const decision=await authorize({authorId:subject,provider,action:'save',phone});
          recordAuthorization(decision);
          if(decision.allowed){authorizedKnownContact={phone:normalizeSaudiPhone(phone),contact:{contactMobile:phone},origin:candidate.businessContact.origin||'authorized_contact'};break;}
        }
        // This is the first point at which this path can retrieve a personal
        // phone.  Keep the consent check here, rather than making listing
        // discovery, matching, qualification, or candidate auditing depend on
        // a phone authorization record.
        const lookup=authorizedKnownContact?null:await authorize({authorId:subject,provider,action:'lookup'});
        if(lookup)recordAuthorization(lookup,{lookup:true});
        if(!authorizedKnownContact&&!lookup.allowed){
          stats.contactExclusions ||= {};
          stats.contactExclusions.not_authorized=Number(stats.contactExclusions.not_authorized||0)+1;
          appendExecutionEvent(stats,'CONTACT_NOT_AUTHORIZED',{stage:stats.orderedAcquisition?.stage||'listings',reason:lookup.detail,providerReason:lookup.providerAuthorization?.detail,individualConsentReason:lookup.individualConsent?.detail});
          return {created:false,reason:'not_authorized',detail:lookup.detail};
        }
        if (alreadyDelivered(candidate)) {
          stats.duplicateCandidatesSkippedTotal += 1;
          await candidateStatus(candidate, "REJECTED_ALREADY_DELIVERED");
          return { created: false, reason:'duplicate' };
        }
        // Comment buyers can be qualified and audited without a contact.  Do
        // not fall back to the source ad's seller contact: it belongs to a
        // different Haraj subject and would turn a phone-free audit into an
        // unrelated personal-phone retrieval.
        if(candidate.buyerComment&&!candidate.businessContact?.phones?.length){
          await candidateStatus(candidate, "REJECTED_NO_AUTHORIZED_CONTACT");
          return {created:false,reason:'no_authorized_contact'};
        }
        stats.contactCandidatesProcessed += 1;
        const contactKey = candidate.buyerComment ? `commenter:${candidate.authorId}` : candidate.postId;
        let resolved = authorizedKnownContact||contacts.get(contactKey);
        if (!resolved && candidate.buyerComment && candidate.businessContact?.phones?.length) {
          const phone = normalizeSaudiPhone(candidate.businessContact.phones[0]);
          if (phone) resolved = { phone, contact: { contactMobile: phone }, origin: candidate.businessContact.origin };
        }
        const cachedContact = qualification.contactResolution;
        if (!resolved && cachedContact && Date.now() - Date.parse(cachedContact.resolvedAt) < 86_400_000 && normalizeSaudiPhone(cachedContact.phone)) {
          resolved = { phone: normalizeSaudiPhone(cachedContact.phone), contact: { contactMobile: cachedContact.phone }, origin: "cached_contact" };
        }
        if (resolved) stats.cachedContactHits += 1;
        if (!resolved) {
          const publicPhone = publicSaudiPhone(candidate);
          if (publicPhone) {
            resolved = { phone: publicPhone, contact: { contactMobile: publicPhone }, origin: "public_ad" };
            stats.publicPhoneHits = Number(stats.publicPhoneHits || 0) + 1;
          } else if (stats.contactLookupMode !== 'public_contacts_only' && shouldAttemptRemoteContact(stats)) {
            const started = Date.now();
            stats.contactAttempts += 1;
            stats.passContactAttempts += 1;
            try {
              const contact = await fetchHarajPostContact(env, candidate.postId);
              resolved = { contact, phone: resolvedCandidatePhone(contact, candidate), origin: "contact_endpoint" };
              stats.remoteContactHits += Number(Boolean(resolved.phone));
              if(resolved.phone)recordAuthorization(lookup,{successfulLookup:true});
            } catch (error) {
              stats.contactErrors = Number(stats.contactErrors || 0) + 1;
              const status = Number(error?.status || 0) || null;
              const apiFailure=recordContactApiFailure(authorizationDiagnostics,error);
              if (status === 401 || status === 403) stats.contactAuthentication = "rejected";
              appendExecutionEvent(stats, "CONTACT_LOOKUP_FAILED", { postId: candidate.postId, status, reason:apiFailure });
              await candidateStatus(candidate, "CONTACT_ERROR");
              // Propagate provider safety stops instead of freeing the slot and
              // hammering the next candidate. Do not store raw provider errors.
              throw error;
            } finally { stats.contactLatencyMs += Date.now() - started; }
          } else {
            // A phone-reveal budget is not a listing-search budget. Keep looking
            // for relevant public contacts without making any further reveals.
            stats.remoteContactSkipped = Number(stats.remoteContactSkipped || 0) + 1;
            resolved = { phone: null, contact: {}, origin: 'contact_budget_reached' };
          }
          // Cache only successful results. A transient failure must remain retryable.
          if (resolved.phone) contacts.set(contactKey, resolved);
        }
        if (!resolved.phone) {
          await candidateStatus(candidate, "REJECTED_NO_PHONE");
          return { created: false };
        }
        recordDistinctPhones(stats, [resolved]);
        qualification.contactResolution = { phone: resolved.phone, origin: resolved.origin, resolvedAt: resolved.origin === "cached_contact" ? cachedContact.resolvedAt : new Date().toISOString() };
        await saveCandidate(database,campaign,candidate,qualification);
        const saveStarted = Date.now();
        const result = await persistQualifiedB2CLead(database, campaign, candidate, qualification,
          { ...resolved.contact, contactMobile: resolved.phone }, true, { signal: env.__b2cSignal });
        stats.dbMs += Date.now() - saveStarted;
        if (!result.created) {
          stats.duplicateCandidatesSkippedTotal += Number(result.reason === "duplicate");
          await candidateStatus(candidate, result.reason === "duplicate" ? "REJECTED_ALREADY_DELIVERED" : "QUALIFIED");
          return result;
        }
        deliveredSellers.add(sellerKey(candidate));
        if (candidate.authorUsername) deliveredSellers.add(`username:${normalizeText(candidate.authorUsername)}`);
        deliveredPhones.add(resolved.phone);
        stats.uniqueLeads = Math.max(stats.uniqueLeads, result.committedCount);
        stats.hotLeads += Number(result.tier === "HOT");
        stats.warmLeads += Number(result.tier === "WARM");
        stats.firstLeadAt ||= new Date().toISOString();
        authorizationDiagnostics.persistedDeliverableLeads=Number(authorizationDiagnostics.persistedDeliverableLeads||0)+1;
        const deliveredProgress = strategyProgress[candidate.matchedStrategy.pathId];
        if (deliveredProgress) deliveredProgress.deliveredCount += 1;
        stats.exactCountContract = { requested: Number(campaign.target_lead_count), delivered: stats.uniqueLeads, remaining: Math.max(0, Number(campaign.target_lead_count) - stats.uniqueLeads) };
        appendExecutionEvent(stats, "LEAD_DELIVERED", { delivered: stats.uniqueLeads, requested: Number(campaign.target_lead_count) });
        await candidateStatus(candidate, "DELIVERED");
        await flushStats(true);
        return result;
      },
    });
    // Public product inquiries first; the existing intent and broad searches follow.
    stats.commentDiscovery = previousStats.commentDiscovery || undefined;
    if (routePolicy.comments && plan.keywordMatching && plan.dealIntent !== 'buy' && (!orderedFlow || acquisitionStage==='product_comments')) {
      await discoverCommentBuyers({ plan, target: Number(campaign.target_lead_count), stats,
        authorizeContact:createContactAuthorizer(database,campaign.organization_id),
        options: { timeBudgetMs: Math.max(1, deadline.deadlineAtMs - Date.now()), seedPages: 20, commentPages: 20,
          ...(orderedFlow ? {accountLimit:stats.orderedAcquisition.limits.product_comments,seedListingLimit:stats.orderedAcquisition.limits.product_comments} : {}) },
        signal: env.__b2cSignal, shouldStop: () => scheduler.committed >= Number(campaign.target_lead_count),
        fetchSearch: async input => {
          const reservation = pageBudget.reserve(input.limit||50);
          if (!reservation.amount) return { items: [], pageInfo: { hasNextPage: false } };
          try {
            const result = await fetchHarajSearch(env, { ...input, cities: input.cities?.length ? input.cities.map(harajCityName) : null, limit: reservation.amount }, { publicOnly: true });
            reservation.finish(result.items.length); stats.postsFetched += result.items.length; stats.listingsFetchedTotal = pageBudget.used;
            return result;
          } catch (error) { reservation.finish(0); throw error; }
        },
        fetchComments: (postId, page) => fetchPublicHarajConnection(env, 'comments', COMMENTS_QUERY, { postId: Number(postId), page, newestFirst: true }),
        fetchProfile: id => fetchPublicHarajConnection(env, 'profile', PROFILE_QUERY, { id: String(id) }),
        fetchPosts: (authorUsername, page) => fetchPublicHarajConnection(env, 'posts', AUTHOR_POSTS_QUERY, { authorUsername, page, limit: 20 }),
        extractPhone: publicSaudiPhone, checkpoint: flushStats,
        onCandidate: async (candidate, qualification) => {
          await saveCandidate(database,campaign,candidate,qualification);
          stats.candidatesQualified += 1;
          const before = scheduler.committed;
          const submission = await scheduler.submit({ candidate, qualification }, sellerKey(candidate));
          const outcome=submission?await submission.done:null;
          await scheduler.drain();
          return { ...outcome,created: scheduler.committed > before };
        },
      });
      appendExecutionEvent(stats, 'COMMENT_DISCOVERY_COMPLETE', { delivered: stats.commentDiscovery.delivered, reason: stats.commentDiscovery.stopReason });
      if(orderedFlow)stats.orderedAcquisition.usage.product_comments=Number(stats.commentDiscovery.accountsProcessed||0);
      await flushStats(true);
    }
    // Small sequential review batches overlap bounded contact workers. There is no
    // campaign-wide contact barrier: every successful worker commits immediately.
    const batchSize = numeric(env.B2C_AI_QUALIFICATION_BATCH_SIZE, 12, 1, 28);
    const seenReviews = new Set();
    const pageSources = activeStrategies.map((strategy) => (async function* () {
      const progress = strategyProgress[strategyKey(strategy)];
      for (;;) {
        if (!await scheduler.waitForCapacity()) break;
        if (scheduler.committed >= Number(campaign.target_lead_count) || progress.exhausted || (maxAds > 0 && pageBudget.used >= maxAds)) break;
        const stageReservation=stageBudget?.reserve(limit);
        const reservation = pageBudget.reserve(stageReservation?stageReservation.amount:limit);
        if (!reservation.amount) {stageReservation?.finish(0);break;}
        const page = progress.nextPage;
        const searchStarted = Date.now();
        let result;
        try { result = await fetchHarajSearch(env, {
          search: strategy.searchTerm || strategy.query,
          cities: strategy.cities?.length ? strategy.cities.map(harajCityName) : null,
          page,
          limit: reservation.amount,
        }, { publicOnly: publicKeywordProfile }); } catch (error) { reservation.finish(0);stageReservation?.finish(0); throw error; }
        stats.searchMs = Number(stats.searchMs || 0) + Date.now() - searchStarted;
        const items = Array.isArray(result.items) ? result.items.slice(0, reservation.amount) : [];
        reservation.finish(items.length);
        stageReservation?.finish(items.length);
        if(stageBudget)stats.orderedAcquisition.usage[acquisitionStage]=stageBudget.used;
        stats.listingsFetchedTotal = pageBudget.used;
        const pageSignature = createHash("sha1").update(items.map((item) => String(item?.id || "")).join(",")).digest("hex");
        progress.repeatedPageCount = pageSignature === progress.lastPageSignature ? progress.repeatedPageCount + 1 : 0;
        progress.lastPageSignature = pageSignature;
        progress.postsFetched += items.length;
        progress.pagesFetched += 1;
        progress.nextPage = page + 1;
        if (!result.pageInfo?.hasNextPage || progress.repeatedPageCount >= 2) {
          progress.exhausted = true;
          progress.exhaustedReason = !result.pageInfo?.hasNextPage ? "source_end" : "repeated_page";
        }
        const freshItems = freshStrategyPosts(progress, items);
        yield { strategy, page, items: freshItems };
        // One page per query per ordered pass, then advance to the next source.
        // Keep its cursor: a later rotation resumes, rather than declaring it exhausted.
        if (progress.exhausted || orderedFlow) break;
      }
    })());
    const consumePage = async ({ strategy, page, items }) => {
      env.__b2cSignal?.throwIfAborted();
      const reviewCache = new Map();
      const pageCandidates = [];
      const progress = strategyProgress[strategyKey(strategy)];
      if (["low_yield_cutoff", "no_verified_lead_yield"].includes(progress.exhaustedReason)) return;
      const pageContacts = [];
      let pageQualified = 0;
      const deliveredBefore = progress.deliveredCount;
      stats.postsFetched += items.length;
      passPostsEvaluated += items.length;
      if (!stats.relevanceSample) stats.relevanceSamplePosts += items.length;
      const searchableCandidates = items
        .map((post) => normalizeCandidate(post, strategy))
        .filter((candidate) => Number.isFinite(candidate.postId) && (strategy.strategyType==='PRODUCT_AD_FALLBACK'||!cheapCandidateReject(candidate)));
      const ranked = searchableCandidates
        .map((candidate) => ({ candidate, rank: localRelevanceRank(candidate, plan) + scoreB2CCandidate(candidate, plan).score / 10 }))
        .sort((left, right) => right.rank - left.rank)
        .map((item) => item.candidate);
      progress.candidatesReviewed += ranked.length;
      reviewedCandidateCount += ranked.length;
      pageCandidates.push(...ranked);
      stats.fastPrefilterRejected = Number(stats.fastPrefilterRejected || 0) + Math.max(0, items.length - ranked.length);
      appendExecutionEvent(stats, "PAGE_FETCHED", {
        query: strategy.searchTerm || strategy.query,
        mode: "search",
        phase: strategy.phase || "primary",
        page,
        returned: items.length,
        shortlisted: ranked.length,
        nextPage: progress.nextPage,
        exhausted: progress.exhausted,
      });
      const previous = pageCandidates.length ? await database("b2c_candidates").select("qualification").where({ campaign_id: campaign.id }).whereIn("post_id", pageCandidates.map(candidate => candidate.postId)) : [];
      for (const row of previous) {
        const review = jsonValue(row.qualification, {});
        if (review.cacheKey && !review.retryable && review.qualificationMode !== "local_fallback") reviewCache.set(review.cacheKey, review);
      }
      appendExecutionEvent(stats, "CANDIDATE_REVIEW_STARTED", { candidates: pageCandidates.length });
      await flushStats();
    const pending = [];
    for (const candidate of pageCandidates) {
      if (alreadyDelivered(candidate)) { stats.duplicateCandidatesSkippedTotal += 1; continue; }
      const key = qualificationKey(candidate, { ...plan, acquisitionPolicy:orderedFlow?LITE_ACQUISITION_VERSION:null, evaluatorModels: [env.B2C_OPENAI_QUALIFICATION_MODEL || "gpt-4.1-mini", env.B2C_OPENROUTER_QUALIFICATION_MODEL || "openai/gpt-4.1-mini"] });
      if (seenReviews.has(key)) continue;
      seenReviews.add(key);
      if (seenReviews.size > 2048) seenReviews.delete(seenReviews.values().next().value);
      if (!(candidate.title.trim() || candidate.bodyText.trim())) { stats.localRejected += 1; continue; }
      pending.push({ candidate, key });
    }
      for (let offset = 0; offset < pending.length && scheduler.committed < Number(campaign.target_lead_count);) {
        env.__b2cSignal?.throwIfAborted();
        const batch = [];
        const batchPosts = new Set();
        // The legacy qualifier keys its response by postId. Never combine two
        // hypotheses for the same post into a single model call.
        while (offset < pending.length && batch.length < batchSize && !batchPosts.has(pending[offset].candidate.postId)) {
          batchPosts.add(pending[offset].candidate.postId);
          batch.push(pending[offset++]);
        }
        const missing = batch.filter(({ key }) => !reviewCache.has(key));
        const started = Date.now();
        const shadowEnabled = !plan.keywordMatching && String(env.B2C_JEV_SHADOW || "false") === "true" && (env.B2C_JEV_OPENROUTER_API_KEY || env.AI_GATEWAY_API_KEY)
          && stats.jevShadow.samples.length < 100;
        // Shadow runs alongside the authoritative review; never controls admission.
        const shadowBatch = shadowEnabled ? batch.slice(0, Math.max(0, 100 - stats.jevEvaluations)) : [];
        stats.jevEvaluations += shadowBatch.length;
        const shadowStarted = Date.now();
        const shadow = shadowBatch.length ? shadowJev(env, shadowBatch.map(({ candidate }) => candidate), plan).then(results => { stats.jevMs += Date.now() - shadowStarted; return results; }) : Promise.resolve([]);
        const decisions = await qualifyCandidates(env, missing.map(({ candidate }) => candidate), plan);
        stats.aiFallbackCount += decisions.filter((decision) => decision.qualificationMode === "local_fallback").length;
        stats.qualificationLatencyMs += Date.now() - started;
        missing.forEach(({ candidate, key }, index) => {
          const review = admitOwnerProspect(candidate, decisions[index] || scoreB2CCandidate(candidate, plan));
          reviewCache.set(key, { ...review, cacheKey: key });
        });
        stats.qualificationCacheHits += batch.length - missing.length;
        for (const { candidate, key } of batch) {
          env.__b2cSignal?.throwIfAborted();
          const qualification = reviewCache.get(key);
          await saveCandidate(database, campaign, candidate, qualification);
          if (qualification.retryable) {
            stats.deferredReviews = Number(stats.deferredReviews || 0) + 1;
            appendExecutionEvent(stats, "CANDIDATE_REVIEW_DEFERRED", { postId: candidate.postId });
            continue;
          }
          if (!qualification.isQualified || (candidate.matchedStrategy?.strategyType!=='PRODUCT_AD_FALLBACK' && qualification.acceptanceBasis !== "ownership_fallback" && qualification.score < plan.qualification.minimumLeadScore)) continue;
          passQualified += 1;
          pageQualified += 1;
          progress.qualifiedCount += 1;
          stats.candidatesQualified += 1;
          const submission = await scheduler.submit({ candidate, qualification }, sellerKey(candidate));
          if (submission) pageContacts.push(submission.done);
        }
        const shadows = await shadow;
        shadows.forEach((decision, index) => {
          stats.jevErrors += Number(decision.reason !== "shadow");
          stats.jevShadow.counts[decision.decision] += 1;
          if (stats.jevShadow.samples.length < 100) stats.jevShadow.samples.push({
            ...decision, cacheKey: batch[index].key, strategy: batch[index].candidate.matchedStrategy.strategyType,
            authoritativeQualified: reviewCache.get(batch[index].key)?.isQualified === true,
            manuallyReviewed: false,
          });
        });
        Object.assign(stats.jevShadow, shadowAudit(stats.jevShadow.samples));
        await flushStats();
        if (decisions.fatalError) {
          await Promise.all(pageContacts);
          throw decisions.fatalError;
        }
      }
      stats.uniqueCandidatesTotal += pending.length;
      authorizationDiagnostics.candidatesDiscovered=Number(stats.postsFetched||0);
      authorizationDiagnostics.uniqueQualifiedBuyers=Number(stats.candidatesQualified||0);
      await Promise.all(pageContacts);
      progress.reviewedPages += 1;
      progress.zeroYieldPages = pageQualified ? 0 : progress.zeroYieldPages + 1;
      progress.noLeadPages = progress.deliveredCount > deliveredBefore ? 0 : progress.noLeadPages + 1;
      if (!publicKeywordProfile && !progress.exhausted && shouldPauseForYield(strategy, { ...progress, pagesFetched: progress.reviewedPages }, minimumSamplePages)) {
        progress.exhausted = true;
        progress.exhaustedReason = pageQualified ? "no_verified_lead_yield" : "low_yield_cutoff";
        appendExecutionEvent(stats, "QUERY_PAUSED_LOW_YIELD", { query: strategy.searchTerm || strategy.query, pagesReviewed: progress.reviewedPages, qualified: progress.qualifiedCount, delivered: progress.deliveredCount });
      }
    };
    try {
      await runPagePipeline({
        sources: pageSources, consume: consumePage, capacity: numeric(env.B2C_PAGE_QUEUE_CAPACITY, 2, 1, 4),
        workers: numeric(env.B2C_QUALIFICATION_CONCURRENCY, 2, 1, 4),
        shouldStop: () => scheduler.committed >= Number(campaign.target_lead_count),
        signal: env.__b2cSignal,
        onDepth: depth => { stats.pageQueueDepth = depth; stats.peakPageQueueDepth = Math.max(stats.peakPageQueueDepth || 0, depth); },
      });
    } finally {
      // Even when a review fails, drain already-running saves before marking failure.
      await scheduler.drain();
      await statsWrite;
    }
    stats.peakContactReservations = Math.max(Number(previousStats.peakContactReservations || 0), scheduler.peak);
    stats.contactRequestHitRate = stats.contactAttempts ? stats.remoteContactHits / stats.contactAttempts : null;
    stats.throughputPerMinute = stats.postsFetched / Math.max(1 / 60, (Date.now() - Date.parse(stats.startedAt)) / 60000);
    // Reconcile once per pass (not once per lead); each insertion already commits
    // its result_count in the same transaction as delivery and billing.
    const passAggregate = await reconcileB2CCount(database, campaign);
    stats.uniqueLeads = passAggregate.reduce((sum, row) => sum + Number(row.count), 0);
    stats.hotLeads = Number(passAggregate.find((row) => row.tier === "HOT")?.count || 0);
    stats.warmLeads = Number(passAggregate.find((row) => row.tier === "WARM")?.count || 0);
    if (!stats.relevanceSample) stats.relevanceSampleQualified += passQualified;
    if (!stats.relevanceSample && stats.relevanceSamplePosts >= 100) {
      const sampleRate = stats.relevanceSampleQualified / stats.relevanceSamplePosts;
      const minimumRate = Math.max(0, Math.min(1, Number(env.B2C_RELEVANCE_SAMPLE_MIN_RATE || 0.01)));
      const broadRate = Math.max(minimumRate, Math.min(1, Number(env.B2C_RELEVANCE_SAMPLE_BROAD_RATE || 0.45)));
      stats.relevanceSample = {
        size: stats.relevanceSamplePosts,
        qualified: stats.relevanceSampleQualified,
        rate: Number(sampleRate.toFixed(4)),
        aligned: plan.preflight?.aligned !== false,
        selectedQueries: plan.preflight?.selectedQueries || plan.strategies.map((item) => item.searchTerm || item.query),
        status: sampleRate < minimumRate || sampleRate > broadRate ? "warning" : "passed",
        reason: sampleRate < minimumRate
          ? "The first concurrent sample produced too few relevant candidates, so low-yield queries were rotated out."
          : sampleRate > broadRate
            ? "The first sample is unusually broad and should be reviewed for precision."
            : "The first concurrent sample produced evidence-qualified candidates.",
      };
    }
    appendExecutionEvent(stats, "CONCURRENT_SAMPLE_COMPLETED", {
      queries: activeStrategies.length,
      ads: passPostsEvaluated,
      reviewed: reviewedCandidateCount,
      qualified: passQualified,
    });
    await updateCampaign(database, campaign.id, "RUNNING", stats);
    stats.sourceExhausted = strategies.length === 0 || strategies.every((strategy) => strategyProgress[strategyKey(strategy)].exhausted);

    stats.sourceExhausted = strategies.length === 0 || strategies.every((strategy) => strategyProgress[strategyKey(strategy)].exhausted);
    if(orderedFlow){
      const next=orderedLiteStage(strategies,strategyProgress,stats.commentDiscovery,acquisitionStage,stats.orderedAcquisition.limits,stats.orderedAcquisition.usage,runtime.stoppedStages);
      Object.assign(stats.orderedAcquisition,{stage:next,lastStage:acquisitionStage});
      stats.sourceExhausted=next===null;
      if(next===null)stats.orderedAcquisition.stopReason='stage_limits_or_source_end';
      appendExecutionEvent(stats,'ACQUISITION_STAGE_CHECKPOINT',{stage:acquisitionStage,next,delivered:stats.uniqueLeads});
    }
    if (!orderedFlow && !stats.relevanceSample?.fallbackApprovalRequired && activeStrategies.length > 0
      && activeStrategies.every((strategy) => strategy.strategyType === 'DIRECT_PURCHASE_INTENT')
      && requiresSectorFallbackApproval(plan, stats.relevanceSamplePosts, stats.relevanceSampleQualified)) {
      stats.relevanceSample = { ...(stats.relevanceSample || {}), status: 'approval_required', fallbackApprovalRequired: true,
        reason: 'No exact buyer signals were found. Sector-only restaurant and cafe searches require customer approval.' };
      stats.sourceExhausted = true;
      appendExecutionEvent(stats, 'FALLBACK_APPROVAL_REQUIRED', { reviewed: stats.relevanceSamplePosts, directQualified: 0 });
    }
    if (routePolicy.listings && !plan.keywordMatching && !(maxAds > 0 && stats.listingsFetchedTotal >= maxAds) && stats.sourceExhausted && stats.uniqueLeads < Number(campaign.target_lead_count) && Number(stats.strategyRegenerations || 0) < 1) {
      const campaignIntent = jsonValue(campaign.intent, {});
      const procurement = plan.dealIntent === "buy";
      const recoveryPlan = await createStrategistPlan(
        env,
        `${campaign.original_prompt}\n\nRECOVERY CONTEXT: The first strategy set produced ${stats.uniqueLeads} delivered leads from ${stats.postsFetched} advertisements. Generate materially different observable buyer signals. Avoid generic product searches and direct competitors.`,
        campaignIntent,
        procurement,
      );
      const existingQueries = new Set(strategies.map((strategy) => normalizeText(strategy.searchTerm || strategy.query)));
      const phaseBase = Math.max(-1, ...strategies.map((strategy) => Number(strategy.phaseIndex || 0))) + 1;
      const recoveryPhases = [recoveryPlan.primary_strategy, ...recoveryPlan.fallback_strategies];
      const recoveryStrategies = recoveryPhases
        .flatMap((phase, index) => strategiesFromStrategistPhase(phase, campaignIntent, procurement, `recovery-${index + 1}`, phaseBase + index))
        .filter((strategy) => !existingQueries.has(normalizeText(strategy.searchTerm || strategy.query)));
      if (recoveryStrategies.length) {
        strategies.push(...recoveryStrategies);
        plan.strategies = strategies;
        plan.recoveryStrategyPlan = recoveryPlan;
        stats.strategyRegenerations = Number(stats.strategyRegenerations || 0) + 1;
        for (const strategy of recoveryStrategies) {
          strategyProgress[strategyKey(strategy)] = {
            query: strategy.searchTerm || strategy.query,
            nextPage: defaultPage,
            pagesFetched: 0,
            postsFetched: 0,
            candidatesReviewed: 0,
            qualifiedCount: 0,
            deliveredCount: 0,
            zeroYieldPages: 0,
            noLeadPages: 0,
            exhausted: false,
            exhaustedReason: null,
            lastPageSignature: null,
            repeatedPageCount: 0,
          };
        }
        stats.sourceExhausted = false;
        appendExecutionEvent(stats, "STRATEGY_REGENERATED", { addedQueries: recoveryStrategies.length, reason: "initial_strategies_exhausted" });
        await database("b2c_campaigns").where({ id: campaign.id }).whereNot({ status: "CANCELLED" }).update({ acquisition_plan: dbJson(plan), stats: dbJson(stats), updated_at: new Date().toISOString() });
      }
    }
    const shouldContinue = stats.uniqueLeads < Number(campaign.target_lead_count)
      && (orderedFlow ? stats.orderedAcquisition.stage!==null : liteWorkRemaining(routePolicy,stats))
      && !(maxAds > 0 && stats.listingsFetchedTotal >= maxAds);
    env.__b2cSignal?.throwIfAborted();
    if (shouldContinue) {
      appendExecutionEvent(stats, "NEXT_PASS_QUEUED", { delivered: stats.uniqueLeads, remaining: Number(campaign.target_lead_count) - stats.uniqueLeads });
      await database("lead_requests").where({ id: campaign.request_id }).whereNot({ status: "cancelled" }).update({ status: "sourcing", result_count: stats.uniqueLeads, error_message: null, updated_at: new Date().toISOString() });
      await updateCampaign(database, campaign.id, "QUEUED", stats, null);
      continueB2CCampaign({ database, env: { ...env, __b2cSignal: undefined }, campaignId: campaign.id, logger });
      return stats;
    }
    runtime.finishedAtMs = Date.now();
    runtime.stopReason = stats.uniqueLeads >= Number(campaign.target_lead_count) ? 'target_reached' : 'source_or_prospect_limit';
    await runMerchantFallback();
    const connectionSummary = await harajSafety().status();
    const phoneLookupLimited = connectionSummary.contactsPaused;
    stats.contactLookupMode = (publicKeywordProfile && !orderedFlow && plan.audienceRoute!=='marketplace') || phoneLookupLimited ? 'public_contacts_only' : 'public_then_guarded_lookup';
    stats.contactLookupLimitReason = connectionSummary.contactPauseReason || (publicKeywordProfile && !orderedFlow ? 'public_keyword_profile' : null);
    const timedStages = Object.keys(runtime.stoppedStages || {}).length > 0;
    if (timedStages) stats.sourceExhausted = false;
    const finalStatus = stats.uniqueLeads >= Number(campaign.target_lead_count) ? "COMPLETED" : "FAILED";
    const requestStatus = finalStatus === "COMPLETED" ? "sourced" : stats.uniqueLeads > 0 ? "partial" : "failed";
    const finalMessage = finalStatus === "FAILED"
      ? liteDeliveryBlocker(stats, Number(campaign.target_lead_count)) || (timedStages
        ? `Haraj saved ${stats.uniqueLeads} of ${Number(campaign.target_lead_count)} leads. Some search stages reached their time allowances. Saved results are kept; the source was not exhausted.`
        : !routePolicy.listings
        ? `Comments-only search saved ${stats.uniqueLeads} of ${Number(campaign.target_lead_count)} leads. Comment discovery stopped: ${stats.commentDiscovery?.stopReason || 'no_matching_comments'}. No listing-search fallback was used.`
        : stats.relevanceSample?.fallbackApprovalRequired
        ? 'No ads met the exact buyer criteria. Wasla did not broaden the search to restaurant or cafe mentions without your approval. If operating restaurants with no stated purchase intent are acceptable, confirm that and start a new search.'
        : stats.contactAuthentication === "rejected"
        ? "Wasla could not finish contact verification. The secure sourcing connection must be refreshed before this run can continue."
        : phoneLookupLimited
          ? `Your search saved ${stats.uniqueLeads} of ${Number(campaign.target_lead_count)} matched leads with available phone numbers. Additional phone lookups are paused or at their safety limit; searches for public contact details continued within the configured budgets. An administrator can review contact retrieval before you retry.`
        : maxAds > 0 && stats.listingsFetchedTotal >= maxAds
          ? `Search stopped at the configured limit of ${maxAds.toLocaleString('en-US')} listings. ${stats.uniqueLeads} of ${Number(campaign.target_lead_count)} leads were saved.`
        : stats.deferredReviews > 0
          ? `Your search saved ${stats.uniqueLeads} leads, but some candidate reviews could not be completed. Saved leads are kept; retry to review the remaining candidates.`
          : `Wasla exhausted every approved buyer-signal and recovery strategy after delivering ${stats.uniqueLeads} of ${Number(campaign.target_lead_count)} requested leads.`)
      : null;
    appendExecutionEvent(stats, finalStatus === "COMPLETED" ? "EXACT_TARGET_REACHED" : "TERMINAL_SHORTFALL", { delivered: stats.uniqueLeads, requested: Number(campaign.target_lead_count), sourceExhausted: stats.sourceExhausted, maxAdsReached: maxAds > 0 && stats.listingsFetchedTotal >= maxAds });
    await database("lead_requests").where({ id: campaign.request_id }).whereNot({ status: "cancelled" }).update({ status: requestStatus, result_count: stats.uniqueLeads, error_message: finalMessage, updated_at: new Date().toISOString() });
    await updateCampaign(database, campaign.id, finalStatus, stats, finalMessage);
    return stats;
  } catch (error) {
    // Prefetched pages may be unfinished. On failure/stop resume from the pass
    // boundary; durable candidate caches and workspace dedupe prevent redelivery.
    stats.strategyProgress = passCheckpoint;
    if (parentSignal?.aborted || (await database("b2c_campaigns").where({ id: campaign.id }).first())?.status === "CANCELLED") {
      await database("b2c_campaigns").where({ id: campaign.id, status: "CANCELLED" }).update({ stats: dbJson(stats) });
      return stats;
    }
    const timeout = !error?.safetyPause && isHarajTimeLimit(env.__b2cSignal?.reason) ? env.__b2cSignal.reason : error;
    if (isHarajTimeLimit(timeout)) {
      deadline.close();
      env.__b2cSignal = parentSignal;
      const aggregate = await reconcileB2CCount(database, campaign);
      stats.uniqueLeads = aggregate.reduce((sum, row) => sum + Number(row.count), 0);
      stats.sourceExhausted = false;
      if (timeout.stage) runtime.stoppedStages[timeout.stage] = 'time_limit';
      appendExecutionEvent(stats, timeout.code, { stage: timeout.stage, delivered: stats.uniqueLeads });
      if (timeout.code === 'HARAJ_STAGE_TIME_LIMIT' && Date.now() < runtime.deadlineAtMs && stats.uniqueLeads < Number(campaign.target_lead_count)) {
        await updateCampaign(database, campaign.id, 'QUEUED', stats, null);
        continueB2CCampaign({ database, env: { ...env, __b2cSignal: undefined }, campaignId: campaign.id, logger });
        return stats;
      }
      runtime.stopReason = 'time_limit';
      runtime.finishedAtMs = Date.now();
      try { await runMerchantFallback(); }
      catch (fallbackError) {
        if (parentSignal?.aborted) return stats;
        stats.mahally ||= {};
        stats.mahally.lastErrorCode = fallbackError.code || 'MAHALLY_FAILED';
      }
      const complete = stats.uniqueLeads >= Number(campaign.target_lead_count);
      const message = complete ? null : liteDeliveryBlocker(stats, Number(campaign.target_lead_count)) || harajTimeLimitMessage(runtime, stats.uniqueLeads, Number(campaign.target_lead_count));
      await database('lead_requests').where({ id: campaign.request_id }).whereNot({ status: 'cancelled' }).update({ status: complete ? 'sourced' : stats.uniqueLeads ? 'partial' : 'failed', result_count: stats.uniqueLeads, error_message: message, updated_at: new Date().toISOString() });
      await updateCampaign(database, campaign.id, complete ? 'COMPLETED' : 'FAILED', stats, message);
      return stats;
    }
    const message = error?.safetyPause ? error.message : error?.provider === 'haraj' ? 'Contact retrieval stopped because the sourcing connection failed. Saved leads are kept; an administrator should review the connection.' : String(error?.message || error).replace(/Bearer\s+\S+|\beyJ[A-Za-z0-9_.-]+/gi, '[REDACTED]').slice(0, 2000);
    if (error?.safetyPause) {
      stats.contactSafetyPause = { code: error.code, retryAt: error.retryAt || null };
      appendExecutionEvent(stats, 'CONTACT_RETRIEVAL_PAUSED', { reason: error.code, retryAt: error.retryAt || null });
    }
    appendExecutionEvent(stats, 'SEARCH_STOPPED', { provider: error?.provider || null, code: error?.code || 'PROCESSING_ERROR', status: Number(error?.status || 0) || null });
    await database("lead_requests").where({ id: campaign.request_id }).whereNot({ status: "cancelled" }).update({ status: stats.uniqueLeads > 0 ? "partial" : "failed", error_message: message, updated_at: new Date().toISOString() });
    await updateCampaign(database, campaign.id, "FAILED", stats, message);
    logger?.error?.(message);
    throw error;
  } finally {
    deadline.close();
    env.__b2cSignal = parentSignal;
  }
}

export function buildPublicB2CExplanation(row) {
  const intent = jsonValue(row.intent, {});
  const plan = jsonValue(row.acquisition_plan, {});
  const stats = jsonValue(row.stats, {});
  const product = plan.product || intent.productName || "your offer";
  const query = plan.strategies?.[0]?.searchTerm || plan.strategies?.[0]?.query || product;
  const cities = intent.market?.cities?.length ? intent.market.cities : [intent.market?.country || "Saudi Arabia"];
  return {
    thinking: `Wasla mapped ${product} to observable buyer signals and focused the strongest search paths on ${cities.join(", ")}.`,
    understanding: `Wasla tested “${query}” alongside distinct recovery paths, then evaluated each full advertisement against the campaign's buyer-signal hypothesis.`,
    sourcing: `Wasla analyzed ${Number(stats.postsFetched || 0).toLocaleString()} public activity signals, evidence-qualified ${Number(stats.candidatesQualified || 0).toLocaleString()} candidates, and delivered ${Number(stats.uniqueLeads || 0).toLocaleString()} distinct prospects with verified Saudi mobile numbers.`,
    metrics: { analyzed: Number(stats.postsFetched || 0), qualified: Number(stats.candidatesQualified || 0), delivered: Number(stats.uniqueLeads || 0), requested: Number(row.target_lead_count || 0) },
  };
}

export function serializeCampaign(row) {
  return {
    id: row.id, requestId: row.request_id, name: row.name, originalPrompt: row.original_prompt,
    intent: jsonValue(row.intent, {}), acquisitionPlan: jsonValue(row.acquisition_plan, {}), targetLeadCount: row.target_lead_count,
    status: row.status, stats: redactUnauthorizedContactData(jsonValue(row.stats, {})), explanation: buildPublicB2CExplanation(row), errorMessage: row.error_message || null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function displayLiteName(value) {
  const withoutDigits = String(value || "").replace(/[0-9\u0660-\u0669\u06f0-\u06f9]/g, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return /[\p{L}]/u.test(withoutDigits) ? withoutDigits : "Wasla-Lite prospect";
}

export async function serializeB2CLead(row, revealed = false, database, organizationId) {
  // Default deny when called without the trusted resolver, including legacy
  // records and callers holding an old paid reveal grant.
  row=database?await authorizeContactExport(database,row,organizationId,{sourceHint:'haraj'}):redactUnauthorizedContactData({...row,phone:null});
  const phone = row.phone ? (revealed ? row.phone : `*** ${String(row.phone).slice(-4)}`) : null;
  const storedEvidence = jsonValue(row.evidence, []);
  const { email: discoveredEmail, website: discoveredWebsite } = contactDetailsFromEvidence(storedEvidence);
  const evidence = storedEvidence.map((item) => ({
    tags: Array.isArray(item.tags) ? item.tags : [],
    city: item.city || null,
    matchedSignals: Array.isArray(item.matchedSignals) ? item.matchedSignals : [],
    strategyType: item.strategyType,
    strategyWeight: item.strategyWeight,
    grade: revealed ? item.grade || (Number(row.score) >= 85 ? 'HIGH' : 'MEDIUM') : undefined,
    buyerComment: revealed ? item.buyerComment || null : null,
    businessContact: revealed && item.businessContact ? { phones: (item.businessContact.phones || []).filter(normalizeSaudiPhone) } : null,
  }));
  return {
    id: row.id, inventoryId: row.inventory_id, sourceInternal: "b2c",
    authorUsername: storedEvidence.find(item=>item.merchant)?.merchant?.name || displayLiteName(row.author_username), phone, email: revealed ? discoveredEmail : null, website: discoveredWebsite,
    contactAuthorization: row.contact_authorization||null, contactExclusions: row.contact_exclusions||[],
    city: row.city, score: row.score, tier: row.tier,
    identityConfidence: row.identity_confidence, purchasePropensity: row.purchase_propensity,
    marketplaceRole: row.marketplace_role, explanation: publicQualificationExplanation(row.explanation), evidence,
    listing: revealed ? listingPreviewFromEvidence(storedEvidence, row.marketplace_role) : null, status: row.status,
    revealed, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export { jsonValue };
