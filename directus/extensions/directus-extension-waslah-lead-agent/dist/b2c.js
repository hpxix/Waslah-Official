import { createHash, randomUUID } from "node:crypto";

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

async function structuredResponse(env, name, schema, instructions, input, maxOutputTokens = 2200, reasoningEffort = "low") {
  if (!env.OPENAI_API_KEY) return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.B2C_OPENAI_MODEL || env.OPENAI_CHAT_MODEL || "gpt-5.6-terra",
      instructions,
      input: JSON.stringify(input),
      text: { format: { type: "json_schema", name, strict: true, schema } },
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxOutputTokens,
      store: false,
    }),
    signal: AbortSignal.timeout(numeric(env.B2C_AI_TIMEOUT_MS, 55_000, 5_000, 120_000)),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned ${response.status}`);
  const text = responseText(payload);
  return text ? JSON.parse(text) : null;
}

const GENERIC_INTENT_TOKENS = new Set([
  "activity", "buyer", "buyers", "customer", "customers", "consumer", "consumers", "delivery", "monthly",
  "need", "needs", "offer", "owner", "owners", "premium", "product", "products", "recent", "recently",
  "service", "services", "subscription", "target", "people", "private", "sell", "selling", "want",
  "and", "for", "from", "into", "the", "their", "them", "this", "with",
  "عميل", "عملاء", "خدمة", "خدمات", "منتج", "منتجات", "بيع", "مميز", "توصيل", "شهري",
]);

function meaningfulTokens(input) {
  return tokens(input).filter((token) => token.length > 2 && !GENERIC_INTENT_TOKENS.has(token));
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
  const productName = cleanPrompt
    .replace(/^(?:i\s+(?:sell|offer|provide)|we\s+(?:sell|offer|provide)|أبيع|ابيع|نبيع|أقدم|اقدم)\s+/i, "")
    .replace(/[.!؟]+$/g, "")
    .slice(0, 160) || "Customer offer";
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
        ? "Extract a grounded B2C procurement intent for Saudi Arabia. The customer wants to buy from individual owners or sellers, so model credible seller profiles and observable active-offer signals. Never describe them as prospective buyers. Never infer sensitive or unsupported personal facts. The buyerType must be B2C. Weights are 0-100. Return only the schema."
        : "Extract a grounded B2C lead intent for Saudi Arabia. Model buyer profiles through observable marketplace behavior. Never infer sensitive or unsupported personal facts. The buyerType must be B2C. Weights are 0-100. Return only the schema.",
      { customer_request: prompt, default_market: "Saudi Arabia" },
    );
    // The model's grounded interpretation is authoritative. Execution reduces
    // it to one concrete Saudi-Arabic product expression in the next step.
    return sanitizeIntent(result, fallback);
  } catch {
    return fallback;
  }
}

const searchPhraseSchema = {
  type: "object", additionalProperties: false, required: ["queries"],
  properties: {
    queries: {
      type: "array", minItems: 1, maxItems: 1,
      items: {
        type: "object", additionalProperties: false,
        required: ["term", "englishTerm", "reason"],
        properties: {
          term: { type: "string" }, englishTerm: { type: "string" }, reason: { type: "string" },
        },
      },
    },
  },
};

function knownSaudiSearchTerm(prompt) {
  const value = String(prompt || "");
  const model = value.match(/\b(?:iphone|ايفون|آيفون)\s*(\d{1,2})\b/i)?.[1];
  if (/\biphone\b|ايفون|آيفون/i.test(value)) return { term: `ايفون${model ? ` ${model}` : ""}`, englishTerm: `iPhone${model ? ` ${model}` : ""}` };
  if (/\b(?:pc|computer|gaming pc)\b|كمبيوتر|بي\s*سي/i.test(value)) return { term: "كمبيوتر", englishTerm: "PC" };
  if (/\b(?:fifa|fc\s*\d{2})\b|فيفا/i.test(value)) return { term: "فيفا", englishTerm: "FIFA" };
  if (/\bplaystation\b|بلايستيشن|بلاي ستيشن/i.test(value)) return { term: "بلايستيشن", englishTerm: "PlayStation" };
  if (/\bxbox\b|اكس بوكس|إكس بوكس/i.test(value)) return { term: "اكس بوكس", englishTerm: "Xbox" };
  if (/\blaptop\b|لابتوب|لاب توب/i.test(value)) return { term: "لابتوب", englishTerm: "laptop" };
  if (/\bcar\b|سيار(?:ة|ات)/i.test(value)) return { term: "سيارة", englishTerm: "car" };
  const arabicTokens = meaningfulTokens(value).filter((token) => /\p{Script=Arabic}/u.test(token)).slice(0, 3);
  return arabicTokens.length ? { term: arabicTokens.join(" "), englishTerm: "" } : null;
}

function fallbackSearchPhrases(prompt, intent) {
  const chosen = knownSaudiSearchTerm(`${prompt} ${intent.productName}`);
  if (!chosen) return [];
  return [{
    ...chosen,
    reason: "The one Saudi-market product expression shared across the customer's selling or buying context.",
  }];
}

async function createSearchPhrases(env, prompt, intent, procurement) {
  const fallback = fallbackSearchPhrases(prompt, intent);
  try {
    const result = await structuredResponse(
      env,
      "waslah_b2c_search_phrases",
      searchPhraseSchema,
      `Understand exactly what the customer is selling or buying and return exactly ONE concise Saudi-market Arabic search expression. It must be the common product word an ordinary Saudi advertiser puts in a title, written in Arabic or Saudi transliteration. Preserve a model or version when it identifies the product: iPhone 18 becomes ايفون 18. A PC shop becomes كمبيوتر. Return an English equivalent in englishTerm only for strict title matching; the actual search term must remain Arabic. Use one product expression of at most three short tokens, never a persona, profession, sentence, broad industry, tag, category, synonym list, or marketing phrase. Never mention any platform, API, provider, scraping, tag, or category. Return only the schema.`,
      { customer_request: prompt, offer: intent },
      1400,
    );
    const seen = new Set();
    const queries = (Array.isArray(result?.queries) ? result.queries : []).map((item) => ({
      term: String(item.term || "").trim().slice(0, 80),
      englishTerm: String(item.englishTerm || "").trim().slice(0, 80),
      reason: String(item.reason || "").slice(0, 500),
    })).filter((item) => item.term && /\p{Script=Arabic}/u.test(item.term) && meaningfulTokens(item.term).length <= 3 && !seen.has(normalizeText(item.term)) && seen.add(normalizeText(item.term)));
    return queries.length === 1 ? queries : fallback;
  } catch {
    return fallback;
  }
}

const discoverySchema = {
  type: "object", additionalProperties: false,
  required: ["reply", "ready", "summary", "missing", "knownFacts", "answeredTopics", "confidence"],
  properties: {
    reply: { type: "string" }, ready: { type: "boolean" }, summary: { type: "string" },
    missing: { type: "array", items: { type: "string" }, maxItems: 5 },
    knownFacts: { type: "array", items: { type: "string" }, maxItems: 30 },
    answeredTopics: { type: "array", items: { type: "string" }, maxItems: 20 },
    confidence: { type: "number" },
  },
};

function uncertainReply(text) {
  return /\b(?:idk|i don'?t know|not sure|no idea|wdym|what do you mean|lol|you (?:choose|tell me|recommend)|recommend for me)\b|ما ادري|مادري|لا اعرف|مو متأكد|وش تقصد|انت اختر|اقترح/i.test(String(text || ""));
}

export async function createB2CDiscoveryTurn(env, { message, transcript = [], language = "ar", dealIntent = "sell", businessContext = null, reasoningMode = "high" } = {}) {
  const cleanTranscript = (Array.isArray(transcript) ? transcript : []).map(String)
    .filter((line) => !/^\s*(?:user|assistant)?\s*(?:mission|business|user) context\s*:/i.test(line)).slice(-80);
  const currentMessage = normalizeText(message);
  while (cleanTranscript.length) {
    const last = cleanTranscript.at(-1);
    const lastUserText = /^\s*user\s*:/i.test(last) ? last.replace(/^\s*user\s*:\s*/i, "") : "";
    if (!lastUserText || normalizeText(lastUserText) !== currentMessage) break;
    cleanTranscript.pop();
  }
  const conversationText = [...cleanTranscript, `user: ${message}`].join("\n");
  const fallbackReply = language === "ar"
    ? "فهمت. ما المنتج أو الخدمة المحددة التي تريد أن يظهر اسمها في إعلانات العملاء؟"
    : "Understood. What exact product or service should appear in the advertisers’ titles?";
  const assistantQuestionCount = cleanTranscript.filter((line) => /^assistant\s*:/i.test(line) && /[?؟]/.test(line)).length;
  const fastFinalTurn = reasoningMode === "fast" && assistantQuestionCount >= 4;
  const modeInstructions = reasoningMode === "fast"
    ? `FAST PROMPTING 1.5X MODE: finish qualification in no more than five assistant questions total, preferably three. ${fastFinalTurn ? "The question limit is now reached. Do not ask another question. Infer sensible defaults from the business context, set ready=true, leave missing empty, and produce a decisive cumulative brief." : `You have already asked ${assistantQuestionCount} qualification question(s). Ask only the single highest-impact remaining question, or set ready=true immediately if the brief is actionable.`}`
    : "HIGH REASONING MODE: reason through the business model, value chain, downstream buyers, purchase triggers, and adjacent demand—the way a shovel seller identifies gold miners. Challenge weak audience assumptions and synthesize the strongest lead path before declaring the brief ready.";
  let result = null;
  try {
    result = await structuredResponse(env, "waslah_b2c_discovery", discoverySchema,
      `You are Wasla's premium conversational growth strategist. ${modeInstructions} Keep discovery concise and commercially useful. Learn only what materially improves this lead campaign: the exact product or service, whether the user is buying or selling, geography, model or version when relevant, and important exclusions. The execution method is one Saudi-Arabic product expression searched across advertisement titles, so the brief must identify one concrete product expression rather than a category tree or audience taxonomy. Never ask how many customers the user already has, whether they have a customer or lead list, whether they want to retarget existing customers, or request their customer data. Be curious, commercially sharp, and natural—not a form or technical planning screen. Preserve all earlier facts, never repeat a question, and ask one highest-impact question per turn. Format longer replies with concise Markdown bullets and put the next question on its own final line. Never mention or imply any platform, marketplace, API, data provider, category database, scraping method, tag, schema, path, or internal implementation. If the user delegates a choice, make a concrete recommendation and advance. Mark ready when the exact product expression, direction, and geography are understood. Reply in ${language === "ar" ? "Arabic" : "English"}. Return only the schema.`,
      { latest_message: message, conversation: cleanTranscript, deal_intent: dealIntent, business_context: businessContext }, 1800, reasoningMode === "high" ? "high" : "low");
  } catch { result = null; }
  if (!result) {
    const delegated = uncertainReply(message) && /recommend|you (?:choose|tell me)|انت اختر|اقترح/i.test(String(message));
    return { reply: fallbackReply, ready: delegated, summary: conversationText.slice(0, 1800), missing: delegated ? [] : [language === "ar" ? "المنتج أو الخدمة المحددة" : "the exact product or service"], knownFacts: [], answeredTopics: [], confidence: delegated ? 65 : 45 };
  }
  const delegated = /recommend|you (?:choose|tell me)|recommend for me|انت اختر|اقترح/i.test(String(message));
  const lastAssistant = [...cleanTranscript].reverse().find((line) => /^assistant\s*:/i.test(line))?.replace(/^assistant\s*:\s*/i, "").trim();
  let reply = String(result.reply || "").trim();
  if (!reply || (lastAssistant && normalizeText(lastAssistant) === normalizeText(reply))) reply = fallbackReply;
  if (fastFinalTurn && /[?؟]\s*$/.test(reply)) {
    reply = reply.replace(/(?:^|\n)[^\n?؟]*[?؟]\s*$/, "").trim();
    if (!reply) reply = language === "ar" ? "اكتملت الصورة. سأستخدم أفضل الافتراضات التجارية من إجاباتك وأجهز مسار العملاء الآن." : "The brief is clear. I’ll use the strongest commercial assumptions from your answers and prepare the lead path now.";
  }
  const hasDiscoveryExchange = cleanTranscript.some((line) => /^assistant\s*:/i.test(line));
  const asksAnotherQuestion = /[?؟]\s*$/.test(reply);
  const ready = (Boolean(result.ready) || fastFinalTurn) && !asksAnotherQuestion && (fastFinalTurn || delegated || hasDiscoveryExchange) && (fastFinalTurn || !uncertainReply(message) || delegated);
  return { reply, ready, summary: String(result.summary || conversationText).slice(0, 2000), missing: fastFinalTurn ? [] : (Array.isArray(result.missing) ? result.missing : []).map(String).slice(0, 5), knownFacts: (Array.isArray(result.knownFacts) ? result.knownFacts : []).map(String).slice(0, 30), answeredTopics: (Array.isArray(result.answeredTopics) ? result.answeredTopics : []).map(String).slice(0, 20), confidence: fastFinalTurn ? Math.max(78, numeric(result.confidence, 55)) : numeric(Number(result.confidence) > 0 && Number(result.confidence) <= 1 ? Number(result.confidence) * 100 : result.confidence, 55) };
}

function strategiesFromSearchPhrases(phrases, intent, procurement) {
  return (phrases || []).map((phrase) => ({
    query: phrase.term,
    sourceMode: "search",
    phase: "primary",
    searchTerm: phrase.term,
    englishTerm: phrase.englishTerm || "",
    strategyType: procurement ? "DIRECT_INTENT" : "BEHAVIORAL_PROXY",
    weight: 1,
    requiresKeywordMatch: true,
    cities: intent.market.cities,
    reason: phrase.reason,
    pathId: `search-${createHash("sha1").update(normalizeText(phrase.term)).digest("hex").slice(0, 12)}`,
    advertiserRole: procurement ? "An individual publicly offering the requested item" : "A person whose public activity indicates a plausible need for the customer's offer",
  }));
}

export async function createB2CPlan(env, prompt) {
  const procurement = /\[PROCUREMENT_FROM_CONSUMERS\]/.test(prompt);
  const intent = await createLeadIntent(env, prompt);
  const searchPhrases = await createSearchPhrases(env, prompt, intent, procurement);
  const queryStrategies = strategiesFromSearchPhrases(searchPhrases, intent, procurement)
    .map((strategy) => ({ ...strategy, phase: "primary" }));
  return {
    intent,
    acquisitionPlan: {
      product: intent.productName,
      dealIntent: procurement ? "buy" : "sell",
      targetProfiles: intent.idealCustomerProfiles.map((profile) => profile.name),
      searchPhrases,
      searchStrategyVersion: 5,
      sourceViability: "query_only",
      strategies: queryStrategies,
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

export async function validateB2CPlan(env, prompt) {
  const queryOnlyPlan = await createB2CPlan(env, prompt);
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
  if (!url || !env.HARAJ_BEARER_TOKEN) throw new Error("The sourcing connection is incomplete.");
  const attempts = numeric(options.attempts ?? env.HARAJ_REQUEST_RETRIES, 3, 1, 5);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST", headers: harajHeaders(env), body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(numeric(options.timeoutMs ?? env.HARAJ_REQUEST_TIMEOUT_MS, 20_000, 2_000, 120_000)),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.errors?.length) {
        const requestError = new Error(payload.errors?.[0]?.message || `The sourcing provider returned ${response.status}`);
        requestError.status = response.status;
        requestError.retryAfter = response.headers.get("retry-after");
        throw requestError;
      }
      return payload.data;
    } catch (error) {
      lastError = error;
      const retryable = !error?.status || error.status === 429 || error.status >= 500;
      if (!retryable || attempt + 1 >= attempts) break;
      const retryAfterMs = Number(error.retryAfter) > 0 ? Number(error.retryAfter) * 1_000 : 0;
      const exponentialMs = 500 * (2 ** attempt) + Math.floor(Math.random() * 250);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(retryAfterMs, exponentialMs)));
    }
  }
  throw lastError;
}

export async function fetchHarajSearch(env, input) {
  const data = await harajGraphql(env, env.HARAJ_SEARCH_URL || env.HARAJ_GRAPHQL_BASE_URL || env.HARAJ_POSTS_URL, SEARCH_QUERY, input);
  return data?.search || { items: [], pageInfo: { hasNextPage: false } };
}

export async function fetchHarajPostContact(env, postId) {
  const data = await harajGraphql(
    env,
    env.HARAJ_POST_CONTACT_URL || env.HARAJ_GRAPHQL_BASE_URL,
    CONTACT_QUERY,
    { postId: Number(postId), isManualRequest: true },
    { attempts: numeric(env.HARAJ_CONTACT_RETRIES, 2, 1, 3), timeoutMs: numeric(env.HARAJ_CONTACT_TIMEOUT_MS, 5_000, 2_000, 15_000) },
  );
  return data?.postContact || {};
}

export function normalizeSaudiPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(2);
  if (digits.startsWith("05") && digits.length === 10) digits = `966${digits.slice(1)}`;
  else if (digits.startsWith("5") && digits.length === 9) digits = `966${digits}`;
  if (!/^9665\d{8}$/.test(digits)) return null;
  return `+${digits}`;
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
      weight: strategy.weight,
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
  const normalizedTitle = normalizeText(candidate.title);
  const variants = [strategy.searchTerm || strategy.query, strategy.englishTerm]
    .map(normalizeText)
    .filter(Boolean);
  const matchedSignals = [...new Set(variants.filter((phrase) => normalizedTitle.includes(phrase)))];
  const titleMatched = matchedSignals.length > 0;
  const recency = recencyScore(candidate.updateDate || candidate.postDate);
  const candidateCities = [candidate.city, candidate.geoCity].filter(Boolean).map(canonicalCity);
  const geographyFit = !strategy.cities?.length || strategy.cities.some((city) => candidateCities.includes(canonicalCity(city))) ? 100 : 35;
  const requestedPhrase = strategy.searchTerm || strategy.query || "";
  return {
    isQualified: titleMatched,
    marketplaceRole: plan.dealIntent === "buy" ? "SELLER" : "OWNER",
    identityConfidence: titleMatched ? 100 : 0,
    purchasePropensity: titleMatched ? 100 : 0,
    evidenceStrength: titleMatched ? 100 : 0,
    recencyScore: recency,
    sellerActivityScore: titleMatched ? 100 : 0,
    geographyFit,
    competitorProbability: 0,
    irrelevantProbability: titleMatched ? 0 : 100,
    matchedSignals,
    negativeSignals: [],
    demandEvidence: false,
    supplyEvidence: false,
    explanation: titleMatched
      ? `The advertisement title contains the required search expression "${matchedSignals[0]}".`
      : `Rejected because the advertisement title does not contain "${requestedPhrase}" or its English equivalent.`,
    score: titleMatched ? 100 : 0,
  };
}
async function qualifyCandidate(_env, candidate, plan) {
  return scoreB2CCandidate(candidate, plan);
}

function leadTier(score) {
  if (score >= 80) return "HOT";
  if (score >= 65) return "WARM";
  return "EXPERIMENTAL";
}

function evidenceFrom(candidate, qualification) {
  return {
    postId: candidate.postId, title: candidate.title, bodyText: candidate.bodyText, tags: candidate.tags,
    city: candidate.city || candidate.geoCity, matchedSignals: qualification.matchedSignals,
    strategyType: candidate.matchedStrategy.strategyType, strategyWeight: candidate.matchedStrategy.weight, url: candidate.url,
  };
}

async function saveCandidate(database, campaign, candidate, qualification) {
  const candidateKey = `${campaign.id}:${candidate.postId}:${candidate.matchedStrategy.searchTerm || candidate.matchedStrategy.query}`;
  const row = {
    id: randomUUID(), candidate_key: candidateKey, organization_id: campaign.organization_id, campaign_id: campaign.id,
    post_id: candidate.postId, author_id: candidate.authorId, author_username: candidate.authorUsername || null,
    title: candidate.title, body_text: candidate.bodyText || null, city: candidate.city || candidate.geoCity || null,
    tags: dbJson(candidate.tags), post_date: candidate.postDate || null, update_date: candidate.updateDate || null,
    strategy: dbJson(candidate.matchedStrategy), qualification: dbJson(qualification), status: qualification.isQualified ? "QUALIFIED" : "REJECTED",
    raw_payload: dbJson(candidate), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  await database("b2c_candidates").insert(row).onConflict("candidate_key").merge({ qualification: row.qualification, status: row.status, updated_at: row.updated_at });
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
  const evidence = existing ? jsonValue(existing.evidence, []) : [];
  if (!evidence.some((item) => Number(item.postId) === candidate.postId)) evidence.push(evidenceFrom(candidate, qualification));
  const score = Math.max(Number(existing?.score || 0), qualification.score);
  const leadKey = existing?.lead_key || `${campaign.id}:${phone || candidate.authorId || normalizeText(candidate.authorUsername) || candidate.postId}`;
  const values = {
    lead_key: leadKey, organization_id: campaign.organization_id, campaign_id: campaign.id, source_internal: "haraj",
    author_id: candidate.authorId, author_username: candidate.authorUsername || null, phone: phone || existing?.phone || null,
    city: candidate.city || candidate.geoCity || existing?.city || null, score, tier: leadTier(score),
    identity_confidence: Math.max(Number(existing?.identity_confidence || 0), qualification.identityConfidence),
    purchase_propensity: Math.max(Number(existing?.purchase_propensity || 0), qualification.purchasePropensity),
    marketplace_role: qualification.marketplaceRole, explanation: qualification.explanation,
    evidence: dbJson(evidence), status: existing?.status || "DELIVERED", updated_at: now,
  };
  // Prepare first; persist after the inventory record exists (inventory_id is required).
  const leadId = existing?.id || randomUUID();
  return { id: leadId, ...values, evidence, phone, created: !existing };
}

function genericFingerprint(candidate, phone) {
  return createHash("sha256").update(`haraj|${phone || ""}|${candidate.authorId || ""}|${normalizeText(candidate.authorUsername)}`).digest("hex");
}

async function syncGenericLead(database, campaign, sellerLead, candidate, qualification) {
  const fingerprint = genericFingerprint(candidate, sellerLead.phone);
  const now = new Date().toISOString();
  const normalized = {
    name: candidate.authorUsername || null, title: "Matched B2C prospect", company: candidate.authorUsername || `B2C prospect ${candidate.authorId || candidate.postId}`,
    company_normalized: normalizeText(candidate.authorUsername || `b2c-${candidate.authorId || candidate.postId}`), email: null, phone: sellerLead.phone,
    location: sellerLead.city, industry: candidate.matchedStrategy.searchTerm || candidate.matchedStrategy.query, source: "b2c", source_reference: String(candidate.authorId || candidate.authorUsername || candidate.postId),
    fit_score: sellerLead.score, qualification_status: sellerLead.tier === "HOT" ? "qualified" : "new", enrichment_status: "enriched",
    enrichment_score: qualification.evidenceStrength, enrichment_summary: qualification.explanation,
    enrichment_signals: dbJson(qualification.matchedSignals), raw_payload: dbJson({ sellerLead, evidence: sellerLead.evidence }), last_enriched_at: now, updated_at: now,
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
  await database("b2c_campaigns").where({ id: campaignId }).update({ status, stats: dbJson(stats), error_message: errorMessage, updated_at: new Date().toISOString() });
}

const B2C_EXECUTION_RULES = [
  { id: "exact-count-contract", label: "Exact requested count is the completion contract" },
  { id: "single-saudi-query", label: "Use one concrete Saudi-Arabic product expression for the campaign" },
  { id: "title-match-only", label: "An advertisement qualifies only when its title contains the Arabic expression or its English equivalent" },
  { id: "verified-phone-only", label: "Only leads with a valid Saudi mobile number are delivered and charged" },
  { id: "organization-wide-deduplication", label: "Never redeliver the same seller or phone to the same workspace" },
  { id: "fresh-page-cursors", label: "Continue from page zero through every fresh result page until the target or true source exhaustion" },
  { id: "authenticated-contact-resolution", label: "Resolve contact data with the configured authenticated connection" },
  { id: "no-partial-success", label: "A short batch is never marked as a completed campaign" },
];

function appendExecutionEvent(stats, code, detail = {}) {
  const ledger = Array.isArray(stats.executionLedger) ? stats.executionLedger : [];
  ledger.push({ at: new Date().toISOString(), pass: Number(stats.searchPass || 0), code, ...detail });
  stats.executionLedger = ledger.slice(-400);
}

export async function persistQualifiedB2CLead(database, campaign, candidate, qualification, contact) {
  return database.transaction(async (trx) => {
    const sellerLead = await mergeSellerLead(trx, campaign, candidate, qualification, contact);
    const inventory = await syncGenericLead(trx, campaign, sellerLead, candidate, qualification);
    const { created, evidence, ...leadValues } = sellerLead;
    const storedLead = { ...leadValues, evidence: dbJson(evidence), inventory_id: inventory.id };
    if (created) await trx("b2c_leads").insert({ ...storedLead, created_at: new Date().toISOString() });
    else await trx("b2c_leads").where({ id: sellerLead.id }).update(storedLead);
    if (created) await chargeFetchedLead(trx, campaign, sellerLead, inventory);
    return inventory.id;
  });
}

export async function runB2CCampaign({ database, env, campaignId, logger }) {
  const campaign = await database("b2c_campaigns").where({ id: campaignId }).first();
  if (!campaign) throw new Error("B2C campaign not found.");
  const plan = jsonValue(campaign.acquisition_plan, {});
  const previousStats = jsonValue(campaign.stats, {});
  const existingAggregate = await database("b2c_leads").where({ campaign_id: campaign.id }).select("tier").count("id as count").groupBy("tier");
  const existingCount = existingAggregate.reduce((sum, row) => sum + Number(row.count), 0);
  const stats = {
    postsFetched: Number(previousStats.postsFetched || 0),
    candidatesQualified: Number(previousStats.candidatesQualified || 0),
    contactsResolved: Number(previousStats.contactsResolved || 0),
    contactAttempts: Number(previousStats.contactAttempts || 0),
    cachedContactHits: Number(previousStats.cachedContactHits || 0),
    contactCandidatesProcessed: Number(previousStats.contactCandidatesProcessed || 0),
    uniqueLeads: existingCount,
    hotLeads: Number(existingAggregate.find((row) => row.tier === "HOT")?.count || 0),
    warmLeads: Number(existingAggregate.find((row) => row.tier === "WARM")?.count || 0),
    startedAt: previousStats.startedAt || campaign.created_at || new Date().toISOString(),
    firstLeadAt: previousStats.firstLeadAt || null,
    relevanceSample: previousStats.relevanceSample || null,
    relevanceSamplePosts: Number(previousStats.relevanceSamplePosts || 0),
    relevanceSampleQualified: Number(previousStats.relevanceSampleQualified || 0),
    uniqueCandidatesTotal: Number(previousStats.uniqueCandidatesTotal || 0),
    duplicateCandidatesSkippedTotal: Number(previousStats.duplicateCandidatesSkippedTotal || 0),
    executionRules: B2C_EXECUTION_RULES,
    executionLedger: Array.isArray(previousStats.executionLedger) ? previousStats.executionLedger : [],
    exactCountContract: { requested: Number(campaign.target_lead_count || 0), delivered: existingCount, remaining: Math.max(0, Number(campaign.target_lead_count || 0) - existingCount) },
  };
  await updateCampaign(database, campaign.id, "RUNNING", stats);
  try {
    const limit = numeric(env.HARAJ_DEFAULT_LIMIT, 50, 1, 100);
    const strategies = Array.isArray(plan.strategies) ? plan.strategies : [];
    const configuredMaxAds = Number(env.B2C_MAX_ADS_PER_CAMPAIGN || 0);
    // Zero means exhaustive. A deployment may still set an explicit emergency
    // ceiling, but ordinary campaigns keep paging until the target or true end.
    const maxAds = Number.isFinite(configuredMaxAds) && configuredMaxAds > 0
      ? Math.min(Math.floor(configuredMaxAds), 10_000_000)
      : 0;
    const pagesPerStreamingPass = numeric(env.B2C_STREAMING_PAGES_PER_PASS, 1, 1, 20);
    const defaultPage = Math.max(0, Math.floor(Number(env.HARAJ_DEFAULT_PAGE || 0)));
    const strategyProgress = jsonValue(previousStats.strategyProgress, {}) || {};
    const strategyKey = (strategy) => String(strategy.pathId || strategy.searchTerm || strategy.query);
    for (const strategy of strategies) {
      const key = strategyKey(strategy);
      const saved = strategyProgress[key] || {};
      strategyProgress[key] = {
        query: strategy.searchTerm || strategy.query,
        nextPage: Math.max(defaultPage, Math.floor(Number(saved.nextPage ?? defaultPage))),
        pagesFetched: Math.max(0, Math.floor(Number(saved.pagesFetched || 0))),
        postsFetched: Math.max(0, Math.floor(Number(saved.postsFetched || 0))),
        exhausted: Boolean(saved.exhausted),
        lastPageSignature: saved.lastPageSignature || null,
        repeatedPageCount: Math.max(0, Math.floor(Number(saved.repeatedPageCount || 0))),
      };
    }
    stats.searchPass = Number(previousStats.searchPass || 0) + 1;
    appendExecutionEvent(stats, "PASS_STARTED", { delivered: stats.uniqueLeads, requested: Number(campaign.target_lead_count) });
    stats.pagesPerStrategy = pagesPerStreamingPass;
    stats.strategyProgress = strategyProgress;
    stats.maxAds = maxAds || null;
    stats.sourceExhausted = strategies.length === 0 || strategies.every((strategy) => strategyProgress[strategyKey(strategy)].exhausted);
    const qualifiedCandidates = [];
    let passPostsEvaluated = 0;
    let passQualified = 0;
    for (const strategy of strategies) {
      const progress = strategyProgress[strategyKey(strategy)];
      if (progress.exhausted || (maxAds > 0 && stats.postsFetched >= maxAds)) continue;
      for (let pageCount = 0; pageCount < pagesPerStreamingPass; pageCount += 1) {
        if (maxAds > 0 && stats.postsFetched >= maxAds) break;
        const page = progress.nextPage;
        const result = await fetchHarajSearch(env, {
          search: strategy.searchTerm || strategy.query,
          cities: strategy.cities?.length ? strategy.cities.map(harajCityName) : null,
          page,
          limit,
        });
        const items = Array.isArray(result.items) ? result.items : [];
        stats.postsFetched += items.length;
        progress.postsFetched += items.length;
        progress.pagesFetched += 1;
        progress.nextPage = page + 1;
        const pageSignature = createHash("sha1").update(items.map((item) => String(item?.id || "")).join(",")).digest("hex");
        progress.repeatedPageCount = pageSignature === progress.lastPageSignature ? progress.repeatedPageCount + 1 : 0;
        progress.lastPageSignature = pageSignature;
        if (!result.pageInfo?.hasNextPage || progress.repeatedPageCount >= 2) progress.exhausted = true;
        appendExecutionEvent(stats, "PAGE_FETCHED", {
          query: strategy.searchTerm || strategy.query,
          mode: "search",
          phase: strategy.phase || "primary",
          page,
          returned: items.length,
          nextPage: progress.nextPage,
          exhausted: progress.exhausted,
        });
        await updateCampaign(database, campaign.id, "RUNNING", stats);
        for (const post of items) {
          const candidate = normalizeCandidate(post, strategy);
          if (!Number.isFinite(candidate.postId)) continue;
          passPostsEvaluated += 1;
          if (!stats.relevanceSample) stats.relevanceSamplePosts += 1;
          const qualification = await qualifyCandidate(env, candidate, plan);
          await saveCandidate(database, campaign, candidate, qualification);
          if (!qualification.isQualified || qualification.score < plan.qualification.minimumLeadScore) continue;
          stats.candidatesQualified += 1;
          passQualified += 1;
          if (!stats.relevanceSample) stats.relevanceSampleQualified += 1;
          qualifiedCandidates.push({ candidate, qualification });
        }
        if (!stats.relevanceSample && stats.relevanceSamplePosts >= 100) {
          const sampleRate = stats.relevanceSampleQualified / stats.relevanceSamplePosts;
          const minimumRate = Math.max(0, Math.min(1, Number(env.B2C_RELEVANCE_SAMPLE_MIN_RATE || 0.01)));
          const broadRate = Math.max(minimumRate, Math.min(1, Number(env.B2C_RELEVANCE_SAMPLE_BROAD_RATE || 0.45)));
          const aligned = plan.preflight?.aligned !== false;
          const failed = !aligned;
          stats.relevanceSample = {
            size: stats.relevanceSamplePosts,
            qualified: stats.relevanceSampleQualified,
            rate: Number(sampleRate.toFixed(4)),
            aligned,
            selectedQueries: plan.preflight?.selectedQueries || plan.strategies.map((item) => item.searchTerm || item.query),
            status: failed ? "failed" : (sampleRate < minimumRate || sampleRate > broadRate) ? "warning" : "passed",
            reason: !aligned
              ? "The selected search expression does not match the requested offer."
              : sampleRate < minimumRate
                ? "The first sample produced too few relevant candidates."
                : sampleRate > broadRate
                  ? "The first sample is unusually broad and should be reviewed for precision."
                  : "The first sample shows sufficient exact-title matches.",
          };
          await updateCampaign(database, campaign.id, "RUNNING", stats);
          if (failed) throw new Error(`B2C relevance preflight failed: ${stats.relevanceSample.reason}`);
        }
        await updateCampaign(database, campaign.id, "RUNNING", stats);
        if (progress.exhausted) break;
      }
    }
    stats.sourceExhausted = strategies.length === 0 || strategies.every((strategy) => strategyProgress[strategyKey(strategy)].exhausted);

    const sellerKey = (candidate) => candidate.authorId != null
      ? `author:${candidate.authorId}`
      : candidate.authorUsername
        ? `username:${normalizeText(candidate.authorUsername)}`
        : `post:${candidate.postId}`;
    const bestBySeller = new Map();
    for (const item of qualifiedCandidates) {
      const key = sellerKey(item.candidate);
      const current = bestBySeller.get(key);
      if (!current || item.qualification.score > current.qualification.score) bestBySeller.set(key, item);
    }
    const uniqueCandidates = [...bestBySeller.entries()]
      .map(([key, item]) => ({ key, ...item }))
      .sort((left, right) => right.qualification.score - left.qualification.score);
    stats.uniqueCandidates = uniqueCandidates.length;
    stats.duplicateCandidatesSkipped = Math.max(0, qualifiedCandidates.length - uniqueCandidates.length);
    stats.uniqueCandidatesTotal += stats.uniqueCandidates;
    stats.duplicateCandidatesSkippedTotal += stats.duplicateCandidatesSkipped;
    stats.passContactAttempts = 0;

    const selectedCandidateKeys = new Set(uniqueCandidates.map(({ candidate }) => `${campaign.id}:${candidate.postId}:${candidate.matchedStrategy.searchTerm || candidate.matchedStrategy.query}`));
    for (const { candidate, qualification } of qualifiedCandidates) {
      const candidateKey = `${campaign.id}:${candidate.postId}:${candidate.matchedStrategy.searchTerm || candidate.matchedStrategy.query}`;
      if (selectedCandidateKeys.has(candidateKey)) continue;
      await database("b2c_candidates").where({ candidate_key: candidateKey }).update({
        status: "REJECTED_DUPLICATE_SELLER",
        qualification: dbJson({ ...qualification, isQualified: false, rejectionReasons: [...new Set([...(qualification.rejectionReasons || []), "A stronger advertisement from the same seller was selected"]) ] }),
        updated_at: new Date().toISOString(),
      });
    }

    const [knownPhoneRows, previouslyDeliveredRows] = await Promise.all([
      database("b2c_leads").select("author_id", "author_username", "phone").where({ organization_id: campaign.organization_id }).whereNotNull("phone"),
      database("b2c_leads").select("author_id", "author_username", "phone").where({ organization_id: campaign.organization_id }).whereNot({ campaign_id: campaign.id }),
    ]);
    const phoneCache = new Map();
    for (const row of knownPhoneRows) {
      const key = row.author_id != null ? `author:${row.author_id}` : row.author_username ? `username:${normalizeText(row.author_username)}` : null;
      if (key && normalizeSaudiPhone(row.phone)) phoneCache.set(key, normalizeSaudiPhone(row.phone));
    }
    const previouslyDeliveredSellers = new Set();
    const previouslyDeliveredPhones = new Set();
    for (const row of previouslyDeliveredRows) {
      if (row.author_id != null) previouslyDeliveredSellers.add(`author:${row.author_id}`);
      if (row.author_username) previouslyDeliveredSellers.add(`username:${normalizeText(row.author_username)}`);
      const phone = normalizeSaudiPhone(row.phone);
      if (phone) previouslyDeliveredPhones.add(phone);
    }
    for (const { key, candidate, qualification } of uniqueCandidates) {
      if (stats.uniqueLeads >= Number(campaign.target_lead_count)) break;
      stats.contactCandidatesProcessed += 1;
      const candidateKey = `${campaign.id}:${candidate.postId}:${candidate.matchedStrategy.searchTerm || candidate.matchedStrategy.query}`;
      if (previouslyDeliveredSellers.has(key)) {
        await database("b2c_candidates").where({ candidate_key: candidateKey }).update({
          status: "REJECTED_ALREADY_DELIVERED",
          qualification: dbJson({ ...qualification, isQualified: false, rejectionReasons: [...new Set([...(qualification.rejectionReasons || []), "This person was already delivered to the organization in an earlier campaign"]) ] }),
          updated_at: new Date().toISOString(),
        });
        continue;
      }
      let resolvedPhone = phoneCache.get(key) || null;
      let contact = resolvedPhone ? { contactMobile: resolvedPhone } : null;
      if (phoneCache.has(key)) stats.cachedContactHits += 1;
      if (!resolvedPhone) {
        stats.contactAttempts += 1;
        stats.passContactAttempts += 1;
        try {
          contact = await fetchHarajPostContact(env, candidate.postId);
          resolvedPhone = normalizeSaudiPhone(contact?.contactMobile || String(contact?.contactText || "").match(/(?:\+?966|0)?5\d{8}/)?.[0]);
        } catch (error) {
          logger?.warn?.(`Haraj contact lookup failed for post ${candidate.postId}: ${String(error?.message || error)}`);
          const status = Number(error?.status || 0) || null;
          stats.contactErrors = Number(stats.contactErrors || 0) + 1;
          if (status === 401 || status === 403) stats.contactAuthentication = "rejected";
          appendExecutionEvent(stats, "CONTACT_LOOKUP_FAILED", { postId: candidate.postId, status, retryable: status === 429 || !status || status >= 500 });
          contact = {};
        }
      }
      if (!resolvedPhone) {
        await database("b2c_candidates").where({ candidate_key: candidateKey }).update({
          status: "REJECTED_NO_PHONE",
          qualification: dbJson({ ...qualification, isQualified: false, rejectionReasons: [...new Set([...(qualification.rejectionReasons || []), "No verified Saudi mobile number available"]) ] }),
          updated_at: new Date().toISOString(),
        });
        continue;
      }
      if (previouslyDeliveredPhones.has(resolvedPhone)) {
        await database("b2c_candidates").where({ candidate_key: candidateKey }).update({
          status: "REJECTED_ALREADY_DELIVERED",
          qualification: dbJson({ ...qualification, isQualified: false, rejectionReasons: [...new Set([...(qualification.rejectionReasons || []), "This verified phone was already delivered to the organization in an earlier campaign"]) ] }),
          updated_at: new Date().toISOString(),
        });
        continue;
      }
      stats.contactsResolved += 1;
      phoneCache.set(key, resolvedPhone);
      contact = { ...(contact || {}), contactMobile: resolvedPhone };
      await persistQualifiedB2CLead(database, campaign, candidate, qualification, contact);
      const aggregate = await database("b2c_leads").where({ campaign_id: campaign.id }).select("tier").count("id as count").groupBy("tier");
      stats.uniqueLeads = aggregate.reduce((sum, row) => sum + Number(row.count), 0);
      if (!stats.firstLeadAt && stats.uniqueLeads > 0) stats.firstLeadAt = new Date().toISOString();
      stats.hotLeads = Number(aggregate.find((row) => row.tier === "HOT")?.count || 0);
      stats.warmLeads = Number(aggregate.find((row) => row.tier === "WARM")?.count || 0);
      await updateCampaign(database, campaign.id, "RUNNING", stats);
      await database("lead_requests").where({ id: campaign.request_id }).update({ result_count: stats.uniqueLeads, updated_at: new Date().toISOString() });
      stats.exactCountContract = { requested: Number(campaign.target_lead_count), delivered: stats.uniqueLeads, remaining: Math.max(0, Number(campaign.target_lead_count) - stats.uniqueLeads) };
      appendExecutionEvent(stats, "LEAD_DELIVERED", { delivered: stats.uniqueLeads, requested: Number(campaign.target_lead_count) });
    }
    const shouldContinue = stats.uniqueLeads < Number(campaign.target_lead_count)
      && !stats.sourceExhausted
      && !(maxAds > 0 && stats.postsFetched >= maxAds);
    if (shouldContinue) {
      appendExecutionEvent(stats, "NEXT_PASS_QUEUED", { delivered: stats.uniqueLeads, remaining: Number(campaign.target_lead_count) - stats.uniqueLeads });
      await database("lead_requests").where({ id: campaign.request_id }).update({ status: "sourcing", result_count: stats.uniqueLeads, error_message: null, updated_at: new Date().toISOString() });
      await updateCampaign(database, campaign.id, "QUEUED", stats, null);
      setTimeout(() => runB2CCampaign({ database, env, campaignId: campaign.id, logger }).catch(() => undefined), 250);
      return stats;
    }
    const finalStatus = stats.uniqueLeads >= Number(campaign.target_lead_count) ? "COMPLETED" : "FAILED";
    const requestStatus = finalStatus === "COMPLETED" ? "sourced" : finalStatus.toLowerCase();
    const finalMessage = finalStatus === "FAILED"
      ? stats.contactAuthentication === "rejected"
        ? "Wasla could not finish contact verification. The secure sourcing connection must be refreshed before this run can continue."
        : `Wasla reached the end of every result page for the approved search expression after delivering ${stats.uniqueLeads} of ${Number(campaign.target_lead_count)} requested leads.`
      : null;
    appendExecutionEvent(stats, finalStatus === "COMPLETED" ? "EXACT_TARGET_REACHED" : "TERMINAL_SHORTFALL", { delivered: stats.uniqueLeads, requested: Number(campaign.target_lead_count), sourceExhausted: stats.sourceExhausted, maxAdsReached: maxAds > 0 && stats.postsFetched >= maxAds });
    await database("lead_requests").where({ id: campaign.request_id }).update({ status: requestStatus, result_count: stats.uniqueLeads, error_message: finalMessage, updated_at: new Date().toISOString() });
    await updateCampaign(database, campaign.id, finalStatus, stats, finalMessage);
    return stats;
  } catch (error) {
    const message = String(error?.message || error).slice(0, 2000);
    await database("lead_requests").where({ id: campaign.request_id }).update({ status: "failed", error_message: message, updated_at: new Date().toISOString() });
    await updateCampaign(database, campaign.id, "FAILED", stats, message);
    logger?.error?.(error);
    throw error;
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
    thinking: `Wasla reduced ${product} to one precise market expression and focused the search on ${cities.join(", ")}.`,
    understanding: `Only advertisements whose titles contained “${query}” or its English equivalent were considered.`,
    sourcing: `Wasla analyzed ${Number(stats.postsFetched || 0).toLocaleString()} public advertisements, qualified ${Number(stats.candidatesQualified || 0).toLocaleString()} exact-title matches, and delivered ${Number(stats.uniqueLeads || 0).toLocaleString()} distinct prospects with verified Saudi mobile numbers.`,
    metrics: { analyzed: Number(stats.postsFetched || 0), qualified: Number(stats.candidatesQualified || 0), delivered: Number(stats.uniqueLeads || 0), requested: Number(row.target_lead_count || 0) },
  };
}

export function serializeCampaign(row) {
  return {
    id: row.id, requestId: row.request_id, name: row.name, originalPrompt: row.original_prompt,
    intent: jsonValue(row.intent, {}), acquisitionPlan: jsonValue(row.acquisition_plan, {}), targetLeadCount: row.target_lead_count,
    status: row.status, stats: jsonValue(row.stats, {}), explanation: buildPublicB2CExplanation(row), errorMessage: row.error_message || null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function serializeB2CLead(row, revealed = false) {
  const phone = row.phone ? (revealed ? row.phone : `*** ${String(row.phone).slice(-4)}`) : null;
  const evidence = jsonValue(row.evidence, []).map((item) => ({
    postId: item.postId,
    title: item.title,
    tags: Array.isArray(item.tags) ? item.tags : [],
    city: item.city || null,
    matchedSignals: Array.isArray(item.matchedSignals) ? item.matchedSignals : [],
    strategyType: item.strategyType,
    strategyWeight: item.strategyWeight,
  }));
  return {
    id: row.id, inventoryId: row.inventory_id, sourceInternal: "b2c", authorId: row.author_id,
    authorUsername: row.author_username, phone, city: row.city, score: row.score, tier: row.tier,
    identityConfidence: row.identity_confidence, purchasePropensity: row.purchase_propensity,
    marketplaceRole: row.marketplace_role, explanation: row.explanation, evidence, status: row.status,
    revealed, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export { jsonValue };
