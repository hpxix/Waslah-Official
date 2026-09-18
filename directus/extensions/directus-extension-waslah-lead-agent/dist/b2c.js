import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const taxonomyCache = new Map();
const RECIPE_CATALOG = JSON.parse(readFileSync(resolve(moduleDirectory, "data/b2c_recipes.json"), "utf8"))
  .map((recipe) => ({ ...recipe, test: new RegExp(recipe.pattern, "i") }));

const POSTS_QUERY = `query FetchAds(
  $id: [Int] = null
  $city: String = null
  $cities: [String]
  $authorUsername: String = null
  $page: Int = null
  $limit: Int = null
  $afterPostDate: Int = null
  $afterUpdateDate: Int = null
  $beforeUpdateDate: Int = null
  $beforePostDate: Int = null
  $tag: String = null
  $near: String = null
  $onlyWithImage: Boolean = null
  $onlyWithVideo: Boolean = null
  $orderMainByPostId: Boolean = null
  $notTag: String = null
) {
  posts(
    id: $id
    city: $city
    cities: $cities
    authorUsername: $authorUsername
    page: $page
    limit: $limit
    afterPostDate: $afterPostDate
    afterUpdateDate: $afterUpdateDate
    beforeUpdateDate: $beforeUpdateDate
    beforePostDate: $beforePostDate
    tag: $tag
    near: $near
    onlyWithImage: $onlyWithImage
    onlyWithVideo: $onlyWithVideo
    orderMainByPostId: $orderMainByPostId
    notTag: $notTag
  ) {
    items {
      id title postDate updateDate authorUsername authorId URL bodyTEXT bodyHTML thumbURL
      hasImage hasVideo city geoCity geoNeighborhood geoHash tags imagesList commentEnabled
      commentStatus isPromoted commentCount upRank downRank status postType tagsFilters
      generalInfo { key value }
      price { formattedPrice inputPrice }
    }
    pageInfo { hasNextPage }
    viewOptions { hasSellersList mustLoginToView }
  }
}`;

const CONTACT_QUERY = `query PostContactQuery($postId: Int!, $isManualRequest: Boolean) {
  postContact(postId: $postId, isManualRequest: $isManualRequest) {
    contactText contactMobile shouldEnableWhatsApp
  }
}`;

const ROLE_VALUES = [
  "LIKELY_BUYER", "OWNER", "CONSUMER", "SELLER", "RESELLER", "COMPETITOR", "SERVICE_PROVIDER", "UNKNOWN",
];

const STRATEGY_VALUES = [
  "DIRECT_INTENT", "ADJACENT_INTENT", "BEHAVIORAL_PROXY", "DEVICE_PROXY", "OWNERSHIP_PROXY",
];

const RECIPE_HINTS = [
  {
    test: /fish|aquarium|aquatic|pond|سمك|اسماك|أسماك|حوض|احواض|أحواض/i,
    profiles: ["aquarium owner", "fish keeper", "pond owner", "aquatic hobbyist"],
    signals: ["fish ownership", "aquarium activity", "pond and aquatic supplies activity"],
    tags: ["أسماك وسلاحف", "اسماك", "مواشي وحيوانات وطيور"],
    positiveKeywords: ["سمك", "اسماك", "أسماك", "حوض", "احواض", "أحواض", "فلتر", "aquarium", "fish", "pond"],
    negativeKeywords: ["متجر", "محل", "مؤسسة", "جملة", "نوفر"],
    requireKeywordMatch: true,
  },
  {
    test: /cow|cattle|dairy|milker|milking|bovine|farm|agri|livestock|sheep|camel|مزرعة|زراعة|مواشي|غنم|ابل|إبل|بقر|ابقار|أبقار|حلاب|حلب/i,
    profiles: ["cattle owner", "dairy farm owner", "livestock operator", "agricultural equipment buyer"],
    signals: ["cattle ownership", "dairy farming activity", "livestock equipment activity"],
    tags: ["بقر", "منتجات ابقار", "معدات زراعية", "مواشي وحيوانات وطيور"],
  },
  {
    test: /netflix|stream|streaming|اشتراك|اشتراكات|نتفلكس|شاهد|iptv/i,
    profiles: ["digital entertainment consumer", "gamer", "smart-TV owner", "paid subscription user"],
    signals: ["subscription activity", "gaming activity", "smart TV ownership"],
    tags: ["حسابات واشتراكات", "ألعاب إلكترونية", "اجهزة بلاي ستيشن PS", "العاب بلاي ستيشن PS", "العاب اكس بوكس Xbox", "تلفزيونات"],
  },
  {
    test: /game|gaming|playstation|xbox|gamer|ألعاب|العاب|بلايستيشن|اكس بوكس/i,
    profiles: ["gamer", "console owner", "digital entertainment consumer"],
    signals: ["gaming activity", "console ownership", "game purchase activity"],
    tags: ["ألعاب إلكترونية", "اجهزة بلاي ستيشن PS", "العاب بلاي ستيشن PS", "العاب اكس بوكس Xbox"],
  },
  {
    test: /(?:\bpet(?:s)?\b|\bcat(?:s)?\b|\bdog(?:s)?\b|قطط|كلاب)/i,
    profiles: ["pet owner", "animal-care buyer"],
    signals: ["pet ownership", "pet supplies activity", "animal care interest"],
    tags: ["حيوانات وطيور", "قطط", "كلاب", "مستلزمات الحيوانات"],
  },
  {
    test: /(?:\blaptop(?:s)?\b|\bnotebook computer(?:s)?\b|لابتوب|لاب توب|حاسب محمول)/i,
    profiles: ["laptop shopper", "student or professional replacing a computer", "gaming laptop buyer"],
    signals: ["laptop purchase activity", "computer ownership and upgrade activity", "laptop accessory activity"],
    tags: ["لابتوب", "لاب توب", "أجهزة كمبيوتر", "ملحقات كمبيوتر"],
  },
  {
    test: /car|vehicle|auto|سيار|مركبة|قطع غيار/i,
    profiles: ["vehicle owner", "automotive enthusiast", "car-accessory buyer"],
    signals: ["vehicle ownership", "car parts activity", "automotive accessory interest"],
    tags: ["حراج السيارات", "قطع غيار وملحقات", "اكسسوارات السيارات"],
  },
  {
    test: /tv|television|home entertainment|تلفزيون|شاشة|رسيفر/i,
    profiles: ["home entertainment user", "smart-TV owner"],
    signals: ["TV ownership", "home entertainment activity", "receiver activity"],
    tags: ["تلفزيونات وصوتيات", "تلفزيونات", "شاشة", "رسيفرات"],
  },
];

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

async function structuredResponse(env, name, schema, instructions, input, maxOutputTokens = 2200) {
  if (!env.OPENAI_API_KEY) return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.B2C_OPENAI_MODEL || env.OPENAI_CHAT_MODEL || "gpt-5.6-terra",
      instructions,
      input: JSON.stringify(input),
      text: { format: { type: "json_schema", name, strict: true, schema } },
      reasoning: { effort: "low" },
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

function flattenTaxonomy(nodes, parentId = null, depth = 0, output = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const names = [...new Set([node.name, node.locale?.ar, node.locale?.en].filter(Boolean).map(String))];
    if (String(node.id) !== "0" && names.length) {
      output.push({
        id: String(node.id),
        name: String(node.name || node.locale?.ar || node.locale?.en),
        parentId: node.mom_id != null ? String(node.mom_id) : parentId,
        type: node.type || null,
        depth,
        names,
        searchable: normalizeText(names.join(" ")),
      });
    }
    flattenTaxonomy(node.children, String(node.id), depth + 1, output);
  }
  return output;
}

export async function loadHarajTaxonomy(env = {}) {
  const taxonomyPath = env.HARAJ_TAXONOMY_PATH || resolve(moduleDirectory, "data/haraj_tags.json");
  if (!taxonomyCache.has(taxonomyPath)) {
    taxonomyCache.set(taxonomyPath, readFile(taxonomyPath, "utf8").then((value) => flattenTaxonomy(JSON.parse(value))));
  }
  return taxonomyCache.get(taxonomyPath);
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

function recipeFor(input) {
  const value = String(input || "");
  const inputTokens = meaningfulTokens(value);
  const candidates = [...RECIPE_CATALOG, ...RECIPE_HINTS]
    .map((recipe, index) => {
      const match = value.match(recipe.test);
      if (!match) return null;
      const contextTokens = new Set(meaningfulTokens(`${(recipe.profiles || []).join(" ")} ${(recipe.signals || []).join(" ")} ${(recipe.tags || []).join(" ")}`));
      const overlap = inputTokens.filter((token) => contextTokens.has(token) || [...contextTokens].some((candidate) => candidate.length > 4 && token.length > 4 && (candidate.includes(token) || token.includes(candidate)))).length;
      const phraseSpecificity = meaningfulTokens(match[0]).length * 18 + Math.min(match[0].length, 40);
      // Hand-curated category hints represent explicit product nouns (cat,
      // cattle, laptop, vehicle, etc.) and must outrank broad catalogue
      // recipes such as food, jobs, or general services when both happen to
      // match the same brief.
      const explicitCategoryBoost = RECIPE_HINTS.includes(recipe) ? 120 : 0;
      return { recipe, score: explicitCategoryBoost + overlap * 30 + phraseSpecificity - index * 0.001 };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.recipe || null;
}

function recipeTagsForPrompt(recipe, prompt) {
  if (!recipe) return [];
  const value = String(prompt || "");
  const asksForCats = /\bcat(?:s)?\b|قطط/i.test(value);
  const asksForDogs = /\bdog(?:s)?\b|كلاب/i.test(value);
  return recipe.tags.filter((tag) => {
    if (asksForCats && !asksForDogs && /كلاب/.test(tag)) return false;
    if (asksForDogs && !asksForCats && /قطط/.test(tag)) return false;
    return true;
  });
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
  const recipe = recipeFor(cleanPrompt);
  const productName = cleanPrompt
    .replace(/^(?:i\s+(?:sell|offer|provide)|we\s+(?:sell|offer|provide)|أبيع|ابيع|نبيع|أقدم|اقدم)\s+/i, "")
    .replace(/[.!؟]+$/g, "")
    .slice(0, 160) || "Customer offer";
  const cities = cityList(cleanPrompt);
  const profiles = procurement ? ["credible individual seller", "private owner offering the requested item"] : recipe?.profiles || ["consumer with observable marketplace interest", "owner of a related product"];
  const signals = procurement ? ["active sale listing", "matching item ownership", "recent seller activity"] : recipe?.signals || ["related marketplace activity", "recent ownership signal", "adjacent category interest"];
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
    // The model's demand-side interpretation is authoritative here. Recipes are
    // execution fallbacks, not a licence to replace the user's audience with a
    // same-word category (for example "cables" accidentally becoming camels).
    return sanitizeIntent(result, fallback);
  } catch {
    return fallback;
  }
}

const OPPORTUNITY_TAG_NAMES = [
  "مشاريع واستثمارات", "وظائف عمارة وبناء", "كهربائي مباني", "مقاول مباني",
  "وظائف بناء اخرى", "وظيفة شبكات واتصالات", "وظائف تقنية اخرى", "وظائف امن وسلامة",
  "وظائف صناعية", "وظائف صناعية اخرى", "حراج العقار", "خدمات مقاولات",
  "نقل عفش", "خدمات تنظيف", "اثاث", "شقق للايجار", "فلل للبيع", "اراضي للبيع",
  "معدات زراعية", "مواشي وحيوانات وطيور", "حراج السيارات", "قطع غيار وملحقات",
  "اجهزة كمبيوتر", "أجهزة شبكات", "تلفزيونات وصوتيات", "مستلزمات الحيوانات",
];

const leadPathSchema = {
  type: "object", additionalProperties: false, required: ["paths"],
  properties: {
    paths: {
      type: "array", minItems: 1, maxItems: 4,
      items: {
        type: "object", additionalProperties: false,
        required: ["tagId", "name", "strategyType", "advertiserRole", "reason", "requiredSignals", "excludedSignals", "confidence", "question"],
        properties: {
          tagId: { type: "string" },
          name: { type: "string" },
          strategyType: { type: "string", enum: STRATEGY_VALUES },
          advertiserRole: { type: "string" },
          reason: { type: "string" },
          requiredSignals: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } },
          excludedSignals: { type: "array", maxItems: 10, items: { type: "string" } },
          confidence: { type: "number" },
          question: { type: "string" },
        },
      },
    },
  },
};

function opportunityCandidates(intent, taxonomy) {
  const source = `${intent.productName} ${intent.productDescription} ${intent.idealCustomerProfiles.map((item) => `${item.name} ${item.description}`).join(" ")} ${intent.behavioralSignals.map((item) => `${item.signal} ${item.reason}`).join(" ")} ${intent.retrievalHypotheses.map((item) => `${item.label} ${item.description}`).join(" ")}`;
  const sourceTokens = meaningfulTokens(source);
  const scored = taxonomy.map((tag) => {
    const tagTokens = meaningfulTokens(tag.searchable);
    const overlap = sourceTokens.filter((token) => tagTokens.some((candidate) => candidate === token || (candidate.length > 3 && token.length > 3 && (candidate.includes(token) || token.includes(candidate))))).length;
    const opportunityBoost = OPPORTUNITY_TAG_NAMES.some((name) => normalizeText(name) === normalizeText(tag.name)) ? 28 : 0;
    return { tag, score: overlap * 24 + opportunityBoost - tag.depth };
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  const selected = [];
  const used = new Set();
  for (const item of scored) {
    if (used.has(item.tag.id)) continue;
    used.add(item.tag.id);
    selected.push(item.tag);
    if (selected.length >= 45) break;
  }
  return selected;
}

function fallbackLeadPaths(intent, candidates) {
  return candidates.slice(0, 3).map((tag, index) => ({
    id: `path-${tag.id}`,
    tagId: tag.id,
    tagName: tag.name,
    name: `${tag.name} opportunity signals`,
    strategyType: index === 0 ? "ADJACENT_INTENT" : "BEHAVIORAL_PROXY",
    advertiserRole: "A person or business publicly showing a need related to the customer's offer",
    reason: `Activity in ${tag.name} may expose a current project, ownership event, or need that the offer can solve.`,
    requiredSignals: meaningfulTokens(`${intent.productName} ${intent.behavioralSignals.map((item) => item.signal).join(" ")}`).slice(0, 10),
    excludedSignals: ["seller of the same service", "competitor", "job seeker"],
    confidence: Math.max(55, 72 - index * 6),
    question: `Are you interested in leads showing active ${tag.name} demand?`,
    selected: false,
  }));
}

async function createLeadPaths(env, intent, taxonomy, prompt) {
  // A recognized offer must start from its validated marketplace categories.
  // Without this, broad AI wording can make a precise offer (for example,
  // Netflix subscriptions) inherit unrelated generic categories such as cars
  // or real estate before the customer has a chance to approve a path.
  const recipe = recipeFor(prompt);
  const recipeTags = recipeTagsForPrompt(recipe, prompt);
  const candidates = recipeTags.length
    ? taxonomy.filter((tag) => tag.names.some((name) => recipeTags.some((recipeTag) => normalizeText(name) === normalizeText(recipeTag))))
    : opportunityCandidates(intent, taxonomy);
  if (!candidates.length) return [];
  let result = null;
  try {
    result = await structuredResponse(
      env,
      "waslah_b2c_lead_paths",
      leadPathSchema,
      `You are Wasla's Lead Path Architect for Saudi B2C prospecting. Think like "sell shovels to gold miners": choose public activity created by people who may NEED the customer's offer, never merely the category where competitors sell that same offer. Build 2-4 distinct, causally defensible paths from the supplied taxonomy candidates only. A tag is a discovery surface, never sufficient proof. Each path must specify the advertiser role, mandatory evidence words/signals, exclusions, confidence from 0 to 100, and one natural confirmation question. requiredSignals and excludedSignals must be short literal Arabic search phrases likely to occur in an advertisement, not explanatory sentences. For contractors, prefer downstream project/hiring/renovation/installation signals over contractor-service advertisements. Reject animal, pet, agriculture, or unrelated categories unless the offer genuinely serves them. Return only the schema.`,
      {
        customer_request: prompt,
        offer: intent,
        taxonomy_candidates: candidates.map((tag) => ({ id: tag.id, name: tag.name, aliases: tag.names })),
      },
      2600,
    );
  } catch (error) {
    if (env.B2C_PATH_DEBUG === "true") throw error;
    result = null;
  }
  const byId = new Map(candidates.map((tag) => [tag.id, tag]));
  const paths = (Array.isArray(result?.paths) ? result.paths : []).map((path) => {
    const tag = byId.get(String(path.tagId));
    if (!tag) return null;
    return {
      id: `path-${tag.id}`,
      tagId: tag.id,
      tagName: tag.name,
      name: String(path.name).slice(0, 180),
      strategyType: STRATEGY_VALUES.includes(path.strategyType) ? path.strategyType : "BEHAVIORAL_PROXY",
      advertiserRole: String(path.advertiserRole).slice(0, 300),
      reason: String(path.reason).slice(0, 700),
      requiredSignals: [...new Set(path.requiredSignals.map(String).filter(Boolean))].slice(0, 10),
      excludedSignals: [...new Set(path.excludedSignals.map(String).filter(Boolean))].slice(0, 10),
      confidence: numeric(Number(path.confidence) > 0 && Number(path.confidence) <= 1 ? Number(path.confidence) * 100 : path.confidence, 65),
      question: String(path.question).slice(0, 320),
      selected: false,
    };
  }).filter(Boolean);
  return paths.length ? paths : fallbackLeadPaths(intent, candidates);
}

function strategiesFromPaths(paths, intent, procurement) {
  return paths.map((path) => ({
    tagId: path.tagId,
    tagName: path.tagName,
    strategyType: path.strategyType,
    weight: Math.max(0.45, Math.min(1, path.confidence / 100)),
    positiveKeywords: [...new Set([...(procurement ? ["للبيع", "بيع", "for sale"] : []), ...path.requiredSignals])].slice(0, 20),
    negativeKeywords: [...new Set(path.excludedSignals)].slice(0, 20),
    requiresKeywordMatch: true,
    cities: intent.market.cities,
    reason: path.reason,
    pathId: path.id,
    advertiserRole: path.advertiserRole,
  }));
}

export function selectB2CLeadPaths(planning, selection) {
  const paths = planning?.acquisitionPlan?.leadPaths || [];
  // Keep the user's explicit choice intact. The client may send either the
  // command form (SELECT_PATHS:path-a,path-b) or an array of path IDs.
  // Normalising only these IDs prevents a click on one card from inheriting
  // stale `selected` flags from the rest of a previous plan.
  const rawSelection = Array.isArray(selection) ? selection.join(",") : String(selection || "");
  const requested = rawSelection.replace(/^SELECT_PATHS?:/i, "").split(",").map((value) => value.trim()).filter(Boolean);
  const selectedIds = new Set(requested);
  const selected = paths.filter((path) => selectedIds.has(String(path.id)) || selectedIds.has(String(path.tagId)));
  if (!selected.length) throw new Error("Choose at least one proposed lead path before sourcing.");
  return {
    ...planning,
    acquisitionPlan: {
      ...planning.acquisitionPlan,
      leadPaths: paths.map((path) => ({ ...path, selected: selected.some((item) => item.id === path.id) })),
      selectedPathIds: selected.map((path) => path.id),
      pathSelectionRequired: false,
      targetProfiles: planning.acquisitionPlan.targetProfiles,
      strategies: strategiesFromPaths(selected, planning.intent, planning.acquisitionPlan.dealIntent === "buy"),
      preflight: { ...planning.acquisitionPlan.preflight, aligned: true, selectedTags: selected.map((path) => path.tagName), unexpectedTags: [] },
    },
  };
}

export function mapSignalsToHarajTags(signals, taxonomy, prompt = "") {
  // The customer's own product description outranks AI-generated signal wording.
  // This prevents a generic term such as "animal" from sending a cattle or fish
  // mission into an unrelated pet category.
  const recipe = recipeFor(prompt);
  const requestedRecipeTags = recipeTagsForPrompt(recipe, prompt);
  const requestedNames = new Set(requestedRecipeTags.map(normalizeText));
  const matches = [];
  const stopWords = new Set(["activity", "ownership", "interest", "user", "consumer", "buyer", "digital", "observable", "marketplace", "related", "recent", "product", "service", "owner", "likely"]);
  if (recipe) {
    for (const requestedName of requestedRecipeTags) {
      const tag = taxonomy.find((item) => item.names.some((name) => normalizeText(name) === normalizeText(requestedName)));
      if (tag) matches.push({ tagId: tag.id, tagName: tag.name, parentId: tag.parentId, type: tag.type, relevanceScore: 100, matchedSignal: recipe.signals[0], reason: "Validated reusable B2C recipe match." });
    }
    // A validated recipe is deliberately closed: do not dilute it with fuzzy,
    // unrelated taxonomy matches produced from generic behavioral language.
    return matches;
  }
  for (const signal of signals) {
    const signalTokens = tokens(`${signal.signal} ${signal.reason}`).filter((token) => token.length > 2 && !stopWords.has(token));
    for (const tag of taxonomy) {
      const tagTokens = tokens(tag.searchable).filter((token) => token.length > 2);
      const overlap = signalTokens.filter((token) => tagTokens.some((candidate) => candidate === token || (candidate.length > 3 && token.length > 3 && (candidate.includes(token) || token.includes(candidate))))).length;
      const recipeMatch = requestedNames.has(normalizeText(tag.name)) || tag.names.some((name) => requestedNames.has(normalizeText(name)));
      const lexicalScore = Math.min(84, overlap * 24 + (normalizeText(signal.signal) === normalizeText(tag.name) ? 35 : 0) - tag.depth * 2);
      const score = recipeMatch ? 99 : lexicalScore;
      if (score < 22) continue;
      matches.push({ tagId: tag.id, tagName: tag.name, parentId: tag.parentId, type: tag.type, relevanceScore: score, matchedSignal: signal.signal, reason: signal.reason });
    }
  }
  return matches.sort((left, right) => right.relevanceScore - left.relevanceScore);
}

function strategyTypeFor(match, index) {
  if (/اشتراك|subscription/i.test(`${match.tagName} ${match.matchedSignal}`)) return "DIRECT_INTENT";
  if (/جهاز|device|playstation|xbox|تلفزيون|شاشة|سيار|معدات/i.test(`${match.tagName} ${match.matchedSignal}`)) return "DEVICE_PROXY";
  if (/ملك|owner|ownership/i.test(match.matchedSignal)) return "OWNERSHIP_PROXY";
  return index === 0 ? "ADJACENT_INTENT" : "BEHAVIORAL_PROXY";
}

export async function createB2CPlan(env, prompt) {
  const procurement = /\[PROCUREMENT_FROM_CONSUMERS\]/.test(prompt);
  const intent = await createLeadIntent(env, prompt);
  const taxonomy = await loadHarajTaxonomy(env);
  if (!procurement) {
    const leadPaths = await createLeadPaths(env, intent, taxonomy, prompt);
    if (!leadPaths.length) throw new Error("Wasla needs a more specific product description before it can build a reliable B2C audience.");
    return {
      intent,
      acquisitionPlan: {
        product: intent.productName,
        dealIntent: "sell",
        targetProfiles: intent.idealCustomerProfiles.map((profile) => profile.name),
        leadPaths,
        selectedPathIds: [],
        pathSelectionRequired: true,
        strategies: [],
        qualification: {
          minimumLeadScore: numeric(env.B2C_MINIMUM_LEAD_SCORE, 65),
          minimumIdentityConfidence: numeric(env.B2C_MINIMUM_IDENTITY_CONFIDENCE, 60),
          minimumPurchasePropensity: numeric(env.B2C_MINIMUM_PURCHASE_PROPENSITY, 55),
        },
        preflight: {
          aligned: false,
          matchedAudience: intent.idealCustomerProfiles.map((profile) => profile.name).slice(0, 4),
          expectedTags: leadPaths.map((path) => path.tagName),
          selectedTags: [],
          unexpectedTags: [],
        },
      },
      taxonomyMatches: leadPaths.map((path) => ({ tagId: path.tagId, tagName: path.tagName, relevanceScore: path.confidence, matchedSignal: path.requiredSignals[0], reason: path.reason })),
    };
  }
  const allMatches = mapSignalsToHarajTags(intent.behavioralSignals, taxonomy, prompt);
  const used = new Set();
  const selected = allMatches.filter((match) => !used.has(match.tagId) && used.add(match.tagId)).slice(0, numeric(env.B2C_MAX_STRATEGIES, 6, 1, 10));
  if (!selected.length) throw new Error("Wasla needs a more specific product description before it can build a reliable B2C audience.");
  const recipe = recipeFor(prompt);
  const exactOfferTokens = meaningfulTokens(intent.productName).slice(0, 8);
  const strategies = selected.map((match, index) => {
    const strategyType = strategyTypeFor(match, index);
    const recipeWeight = strategyType === "DIRECT_INTENT" ? 1 : strategyType === "ADJACENT_INTENT" ? 0.85 : strategyType === "BEHAVIORAL_PROXY" ? 0.78 : 0.72;
    return {
      tagId: match.tagId,
      tagName: match.tagName,
      strategyType,
      weight: Math.max(0.35, Math.min(recipeFor(prompt) ? recipeWeight : 1, (match.relevanceScore || 60) / 100)),
      positiveKeywords: [...new Set([...(procurement ? ["للبيع", "بيع", "for sale", "seller"] : []), ...(recipe?.positiveKeywords || []), ...meaningfulTokens(match.matchedSignal), ...exactOfferTokens])].slice(0, 20),
      negativeKeywords: procurement
        ? [...new Set([...(recipe?.negativeKeywords || []), `مطلوب ${intent.productName}`, `أبحث عن ${intent.productName}`, `wanted ${intent.productName}`, `looking to buy ${intent.productName}`])]
        : [...new Set([...(recipe?.negativeKeywords || []), `بيع ${intent.productName}`, `sell ${intent.productName}`, `reseller ${intent.productName}`])],
      requiresKeywordMatch: Boolean(recipe?.requireKeywordMatch),
      cities: intent.market.cities,
      reason: match.reason,
    };
  });
  const recipeTags = recipeTagsForPrompt(recipe, prompt);
  const expectedTags = new Set(recipeTags.map(normalizeText));
  const unexpectedTags = recipe ? strategies.map((strategy) => strategy.tagName).filter((tag) => !expectedTags.has(normalizeText(tag))) : [];
  return {
    intent,
    acquisitionPlan: {
      product: intent.productName,
      dealIntent: procurement ? "buy" : "sell",
      targetProfiles: intent.idealCustomerProfiles.map((profile) => profile.name),
      strategies,
      qualification: {
        minimumLeadScore: numeric(env.B2C_MINIMUM_LEAD_SCORE, 65),
        minimumIdentityConfidence: numeric(env.B2C_MINIMUM_IDENTITY_CONFIDENCE, 60),
        minimumPurchasePropensity: numeric(env.B2C_MINIMUM_PURCHASE_PROPENSITY, 55),
      },
      preflight: {
        aligned: unexpectedTags.length === 0,
        matchedAudience: recipe?.profiles?.slice(0, 4) || intent.idealCustomerProfiles.map((profile) => profile.name).slice(0, 4),
        expectedTags: recipeTags,
        selectedTags: strategies.map((strategy) => strategy.tagName),
        unexpectedTags,
      },
    },
    taxonomyMatches: allMatches.slice(0, 20),
  };
}

export async function validateB2CPlan(env, prompt, supplied) {
  const procurement = /\[PROCUREMENT_FROM_CONSUMERS\]/.test(prompt);
  let plan;
  if (!procurement && supplied?.acquisitionPlan?.leadPaths?.length) {
    const taxonomy = await loadHarajTaxonomy(env);
    const validTags = new Set(taxonomy.map((tag) => tag.id));
    const cleanPaths = supplied.acquisitionPlan.leadPaths.filter((path) => validTags.has(String(path.tagId)));
    // `selectedPathIds` is the source of truth. Do not let legacy card state
    // select every proposed path when the user approved just one.
    const selectedIds = Array.isArray(supplied.acquisitionPlan.selectedPathIds)
      ? supplied.acquisitionPlan.selectedPathIds
      : cleanPaths.filter((path) => path.selected === true).map((path) => path.id);
    plan = selectB2CLeadPaths({
      ...supplied,
      acquisitionPlan: { ...supplied.acquisitionPlan, leadPaths: cleanPaths },
    }, selectedIds.join(","));
  } else {
    plan = await createB2CPlan(env, prompt);
  }
  if (plan.acquisitionPlan.pathSelectionRequired || !plan.acquisitionPlan.strategies?.length) {
    throw new Error("Confirm a buyer-side lead path with Wasla before starting this campaign.");
  }
  if (!plan.acquisitionPlan.preflight?.aligned) {
    throw new Error(`Wasla rejected a mismatched B2C audience plan before sourcing: ${plan.acquisitionPlan.preflight.unexpectedTags.join(", ")}`);
  }
  return plan;
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
  if (!url || !env.HARAJ_BEARER_TOKEN) throw new Error("Haraj API configuration is incomplete.");
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
        const requestError = new Error(payload.errors?.[0]?.message || `Haraj returned ${response.status}`);
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

export async function fetchHarajPosts(env, input) {
  const data = await harajGraphql(env, env.HARAJ_POSTS_URL || env.HARAJ_GRAPHQL_BASE_URL, POSTS_QUERY, input);
  return data?.posts || { items: [], pageInfo: { hasNextPage: false } };
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
    matchedStrategy: { tagName: strategy.tagName, strategyType: strategy.strategyType, weight: strategy.weight },
  };
}

function recencyScore(timestamp) {
  if (!timestamp) return 20;
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  const days = Math.max(0, (Date.now() - milliseconds) / 86_400_000);
  return Math.max(10, Math.round(100 - days * 1.5));
}

function cheapQualification(candidate, plan) {
  const procurement = plan.dealIntent === "buy";
  const strategy = plan.strategies.find((item) => item.tagName === candidate.matchedStrategy.tagName) || candidate.matchedStrategy;
  const text = normalizeText(`${candidate.title} ${candidate.bodyText} ${candidate.tags.join(" ")}`);
  const positive = (strategy.positiveKeywords || []).filter((keyword) => {
    const normalized = normalizeText(keyword);
    return normalized && !GENERIC_INTENT_TOKENS.has(normalized) && text.includes(normalized);
  });
  // Haraj categories are Arabic while many customer briefs are English. A
  // candidate returned inside a preflight-validated category is itself an
  // observable relevance signal, even when no English brief token appears in
  // the Arabic advertisement body.
  const meetsRequiredKeyword = !strategy.requiresKeywordMatch || positive.length > 0;
  const categoryMatched = plan.preflight?.aligned !== false && Boolean(strategy.tagName) && meetsRequiredKeyword;
  const positiveSignalCount = positive.length + (categoryMatched ? 1 : 0);
  const negative = (strategy.negativeKeywords || []).filter((keyword) => text.includes(normalizeText(keyword)));
  const exactOffer = meaningfulTokens(plan.product);
  const exactOfferHits = exactOffer.filter((token) => text.includes(token)).length;
  const activeSeller = /بيع|للبيع|متوفر|أعرض|اعرض|sell|for sale|available|owner/i.test(text);
  const likelyCompetitor = !procurement && (negative.length > 0 || (strategy.strategyType === "DIRECT_INTENT" && exactOfferHits > 0 && /بيع|للبيع|متجر|نوفر|sell|shop|store|متوفر/i.test(text)));
  const identityConfidence = numeric(42 + strategy.weight * 35 + Math.min(positiveSignalCount * 7, 20), 60);
  const purchasePropensity = numeric(35 + strategy.weight * 30 + Math.min(positiveSignalCount * 8, 24) + (procurement && activeSeller ? 18 : 0) - (likelyCompetitor ? 55 : 0), 55);
  const evidenceStrength = numeric(38 + Math.min((candidate.bodyText.length / 80), 28) + candidate.tags.length * 4 + positiveSignalCount * 6, 55);
  const recency = recencyScore(candidate.updateDate || candidate.postDate);
  const candidateCities = [candidate.city, candidate.geoCity].filter(Boolean).map(canonicalCity);
  const geographyFit = !strategy.cities?.length || strategy.cities.some((city) => candidateCities.includes(canonicalCity(city))) ? 100 : 35;
  const competitorProbability = likelyCompetitor ? 92 : exactOfferHits > 0 && strategy.strategyType === "DIRECT_INTENT" ? 48 : 8;
  const irrelevantProbability = positiveSignalCount === 0 ? (strategy.weight < 0.8 ? 48 : 24) : 8;
  const score = numeric(
    identityConfidence * 0.30 + purchasePropensity * 0.30 + evidenceStrength * 0.15 + recency * 0.10 + 55 * 0.10 + geographyFit * 0.05
      - competitorProbability * 0.25 - irrelevantProbability * 0.15,
    0,
  );
  const marketplaceRole = procurement && activeSeller ? "SELLER" : likelyCompetitor ? "COMPETITOR" : strategy.strategyType === "OWNERSHIP_PROXY" ? "OWNER" : "LIKELY_BUYER";
  return {
    isQualified: score >= 45 && !likelyCompetitor && meetsRequiredKeyword,
    marketplaceRole, identityConfidence, purchasePropensity, evidenceStrength, recencyScore: recency,
    sellerActivityScore: 55, geographyFit, competitorProbability, irrelevantProbability,
    matchedSignals: positive.length ? positive : categoryMatched ? [candidate.matchedStrategy.tagName] : [], negativeSignals: negative,
    explanation: procurement && activeSeller
      ? "The listing is an active offer from a potential individual seller matching the purchase request."
      : likelyCompetitor
      ? "The listing appears to sell the customer's exact offer and is likely a competitor."
      : `Recent ${candidate.matchedStrategy.tagName} activity provides an observable ${candidate.matchedStrategy.strategyType.toLowerCase().replaceAll("_", " ")} signal.`,
    score,
  };
}

const qualificationSchema = {
  type: "object", additionalProperties: false,
  required: ["marketplaceRole", "identityConfidence", "purchasePropensity", "evidenceStrength", "competitorProbability", "irrelevantProbability", "matchedSignals", "negativeSignals", "explanation"],
  properties: {
    marketplaceRole: { type: "string", enum: ROLE_VALUES },
    identityConfidence: { type: "number" }, purchasePropensity: { type: "number" }, evidenceStrength: { type: "number" },
    competitorProbability: { type: "number" }, irrelevantProbability: { type: "number" },
    matchedSignals: { type: "array", items: { type: "string" }, maxItems: 8 },
    negativeSignals: { type: "array", items: { type: "string" }, maxItems: 8 }, explanation: { type: "string" },
  },
};

async function qualifyCandidate(env, candidate, plan) {
  const procurement = plan.dealIntent === "buy";
  const cheap = cheapQualification(candidate, plan);
  if (!cheap.isQualified) return cheap;
  if (!env.OPENAI_API_KEY || String(env.B2C_LLM_QUALIFICATION_ENABLED || "false") !== "true") {
    return {
      ...cheap,
      isQualified: cheap.score >= plan.qualification.minimumLeadScore
        && cheap.identityConfidence >= plan.qualification.minimumIdentityConfidence
        && cheap.purchasePropensity >= plan.qualification.minimumPurchasePropensity,
    };
  }
  try {
    const semantic = await structuredResponse(
      env,
      "waslah_b2c_candidate_qualification",
      qualificationSchema,
      procurement
        ? "Classify one marketplace candidate as a credible individual seller for the customer's purchase request. Active sellers and owners are desired; wanted posts from other buyers are not. Category match alone is insufficient. Use only supplied evidence; never infer sensitive personal traits. Scores are 0-100. Return only the schema."
        : "Classify one public-activity candidate as a potential buyer of the customer's offer. Category match alone is not sufficient. For an adjacent-intent or ownership-proxy strategy, a person's post offering a related asset can prove that they are its OWNER and may be relevant; do not reject them merely because that particular post is a sale. Mark direct sellers of the customer's exact offer as competitors, and distinguish resellers and service providers. Use only supplied evidence; never infer sensitive personal traits. Scores are 0-100. Return only the schema.",
      { mission_intent: procurement ? "buy_from_individual_seller" : "sell_to_consumer", customer_offer: plan.product, target_profiles: plan.targetProfiles, strategy: candidate.matchedStrategy, candidate: { title: candidate.title, body: candidate.bodyText, tags: candidate.tags, city: candidate.city, postDate: candidate.postDate } },
      900,
    );
    if (!semantic) return cheap;
    const merged = {
      ...cheap,
      marketplaceRole: ROLE_VALUES.includes(semantic.marketplaceRole) ? semantic.marketplaceRole : cheap.marketplaceRole,
      identityConfidence: numeric(semantic.identityConfidence, cheap.identityConfidence), purchasePropensity: numeric(semantic.purchasePropensity, cheap.purchasePropensity),
      evidenceStrength: numeric(semantic.evidenceStrength, cheap.evidenceStrength), competitorProbability: numeric(semantic.competitorProbability, cheap.competitorProbability),
      irrelevantProbability: numeric(semantic.irrelevantProbability, cheap.irrelevantProbability), matchedSignals: semantic.matchedSignals?.map(String).slice(0, 8) || cheap.matchedSignals,
      negativeSignals: semantic.negativeSignals?.map(String).slice(0, 8) || cheap.negativeSignals, explanation: String(semantic.explanation || cheap.explanation).slice(0, 1200),
    };
    const ownershipProxy = candidate.matchedStrategy.strategyType !== "DIRECT_INTENT";
    if (ownershipProxy && ["OWNER", "SELLER"].includes(merged.marketplaceRole) && merged.competitorProbability < 40) {
      merged.purchasePropensity = Math.max(merged.purchasePropensity, cheap.purchasePropensity, 60);
    }
    merged.score = numeric(merged.identityConfidence * 0.30 + merged.purchasePropensity * 0.30 + merged.evidenceStrength * 0.15 + merged.recencyScore * 0.10 + merged.sellerActivityScore * 0.10 + merged.geographyFit * 0.05 - merged.competitorProbability * 0.25 - merged.irrelevantProbability * 0.15, 0);
    const disallowedRoles = procurement
      ? ["LIKELY_BUYER", "COMPETITOR", "SERVICE_PROVIDER", "UNKNOWN"]
      : ownershipProxy
        ? ["RESELLER", "COMPETITOR", "SERVICE_PROVIDER", "UNKNOWN"]
        : ["SELLER", "RESELLER", "COMPETITOR", "SERVICE_PROVIDER", "UNKNOWN"];
    merged.isQualified = !disallowedRoles.includes(merged.marketplaceRole) && merged.score >= plan.qualification.minimumLeadScore && merged.identityConfidence >= plan.qualification.minimumIdentityConfidence && merged.purchasePropensity >= plan.qualification.minimumPurchasePropensity;
    return merged;
  } catch {
    return cheap;
  }
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
  const candidateKey = `${campaign.id}:${candidate.postId}:${candidate.matchedStrategy.tagName}`;
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
    location: sellerLead.city, industry: candidate.matchedStrategy.tagName, source: "b2c", source_reference: String(candidate.authorId || candidate.authorUsername || candidate.postId),
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
    categoryAlignment: stats.relevanceSample?.aligned ?? null,
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
    cachedNoPhoneSkips: Number(previousStats.cachedNoPhoneSkips || 0),
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
  };
  await updateCampaign(database, campaign.id, "RUNNING", stats);
  try {
    const basePages = numeric(env.HARAJ_MAX_PAGES_PER_STRATEGY, 3, 1, 20);
    const limit = numeric(env.HARAJ_DEFAULT_LIMIT, 50, 1, 100);
    const strategyCount = Math.max(1, (plan.strategies || []).length);
    const maxAds = numeric(env.B2C_MAX_ADS_PER_CAMPAIGN, 20_000, 500, 100_000);
    const remainingLeads = Math.max(0, Number(campaign.target_lead_count) - existingCount);
    const observedYield = existingCount > 0 && Number(previousStats.postsFetched || 0) > 0
      ? existingCount / Number(previousStats.postsFetched)
      : 0.01;
    const projectedPages = Math.ceil((remainingLeads * 1.35) / (Math.max(observedYield, 0.004) * limit * strategyCount));
    const remainingAdBudget = Math.max(0, maxAds - Number(previousStats.postsFetched || 0));
    const pagesAllowedByBudget = Math.floor(remainingAdBudget / (limit * strategyCount));
    // Persist and expose progress after a small group of pages instead of holding
    // one very large acquisition pass open. The queued continuation below keeps
    // moving through fresh pages until the requested lead count is reached.
    const pagesPerStreamingPass = numeric(env.B2C_STREAMING_PAGES_PER_PASS, 1, 1, 20);
    const maxPages = pagesAllowedByBudget > 0
      ? Math.max(1, Math.min(Math.max(basePages, projectedPages), pagesAllowedByBudget, pagesPerStreamingPass))
      : 0;
    const defaultPage = numeric(env.HARAJ_DEFAULT_PAGE, 0, 0, 1000);
    const startPage = Number.isFinite(Number(previousStats.nextPage))
      ? numeric(previousStats.nextPage, defaultPage, 0, 1000)
      : existingCount > 0 && Number(previousStats.postsFetched || 0) > 0
        ? defaultPage + basePages
        : defaultPage;
    stats.searchPass = Number(previousStats.searchPass || 0) + 1;
    stats.pageStart = startPage;
    stats.pagesPerStrategy = maxPages;
    stats.nextPage = startPage + maxPages;
    stats.maxAds = maxAds;
    stats.sourceExhausted = false;
    const qualifiedCandidates = [];
    let passPostsEvaluated = 0;
    let passQualified = 0;
    let exhaustedStrategies = 0;
    for (const strategy of plan.strategies || []) {
      for (let page = startPage, pageCount = 0; pageCount < maxPages; page += 1, pageCount += 1) {
        const result = await fetchHarajPosts(env, { tag: strategy.tagName, cities: strategy.cities?.length ? strategy.cities.map(harajCityName) : null, page, limit });
        const items = Array.isArray(result.items) ? result.items : [];
        stats.postsFetched += items.length;
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
          const failed = !aligned || sampleRate < minimumRate;
          stats.relevanceSample = {
            size: stats.relevanceSamplePosts,
            qualified: stats.relevanceSampleQualified,
            rate: Number(sampleRate.toFixed(4)),
            aligned,
            selectedTags: plan.preflight?.selectedTags || plan.strategies.map((item) => item.tagName),
            status: failed ? "failed" : sampleRate > broadRate ? "warning" : "passed",
            reason: !aligned
              ? "The selected source categories do not match the requested audience."
              : sampleRate < minimumRate
                ? "The first sample produced too few relevant candidates."
                : sampleRate > broadRate
                  ? "The first sample is unusually broad and should be reviewed for precision."
                  : "The first sample shows sufficient category alignment and candidate relevance.",
          };
          await updateCampaign(database, campaign.id, "RUNNING", stats);
          if (failed) throw new Error(`B2C relevance preflight failed: ${stats.relevanceSample.reason}`);
        }
        await updateCampaign(database, campaign.id, "RUNNING", stats);
        if (!result.pageInfo?.hasNextPage) {
          exhaustedStrategies += 1;
          break;
        }
      }
    }
    stats.sourceExhausted = exhaustedStrategies >= strategyCount;

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
    const contactsResolvedAtStart = stats.contactsResolved;
    stats.passContactAttempts = 0;
    stats.stoppedEarly = false;

    const selectedCandidateKeys = new Set(uniqueCandidates.map(({ candidate }) => `${campaign.id}:${candidate.postId}:${candidate.matchedStrategy.tagName}`));
    for (const { candidate, qualification } of qualifiedCandidates) {
      const candidateKey = `${campaign.id}:${candidate.postId}:${candidate.matchedStrategy.tagName}`;
      if (selectedCandidateKeys.has(candidateKey)) continue;
      await database("b2c_candidates").where({ candidate_key: candidateKey }).update({
        status: "REJECTED_DUPLICATE_SELLER",
        qualification: dbJson({ ...qualification, isQualified: false, rejectionReasons: [...new Set([...(qualification.rejectionReasons || []), "A stronger advertisement from the same seller was selected"]) ] }),
        updated_at: new Date().toISOString(),
      });
    }

    const cacheWindowHours = numeric(env.B2C_CONTACT_CACHE_HOURS, 24, 1, 720);
    const cacheSince = new Date(Date.now() - cacheWindowHours * 3_600_000).toISOString();
    const [knownPhoneRows, noPhoneRows] = await Promise.all([
      database("b2c_leads").select("author_id", "author_username", "phone").where({ organization_id: campaign.organization_id }).whereNotNull("phone"),
      database("b2c_candidates").select("author_id", "author_username", "post_id").where({ organization_id: campaign.organization_id }).whereIn("status", ["REJECTED_NO_PHONE", "REJECTED_CACHED_NO_PHONE"]).where("updated_at", ">", cacheSince),
    ]);
    const phoneCache = new Map();
    for (const row of knownPhoneRows) {
      const key = row.author_id != null ? `author:${row.author_id}` : row.author_username ? `username:${normalizeText(row.author_username)}` : null;
      if (key && normalizeSaudiPhone(row.phone)) phoneCache.set(key, normalizeSaudiPhone(row.phone));
    }
    const noPhoneCache = new Set(noPhoneRows.map((row) => row.author_id != null
      ? `author:${row.author_id}`
      : row.author_username
        ? `username:${normalizeText(row.author_username)}`
        : `post:${row.post_id}`));
    const earlyStopSample = numeric(env.B2C_NO_PHONE_EARLY_STOP_SAMPLE, 30, 10, 100);

    for (const { key, candidate, qualification } of uniqueCandidates) {
      if (stats.uniqueLeads >= Number(campaign.target_lead_count)) break;
      stats.contactCandidatesProcessed += 1;
      const candidateKey = `${campaign.id}:${candidate.postId}:${candidate.matchedStrategy.tagName}`;
      let resolvedPhone = phoneCache.get(key) || normalizeSaudiPhone(`${candidate.title} ${candidate.bodyText}`.match(/(?:\+?966|0)?5\d{8}/)?.[0]);
      let contact = resolvedPhone ? { contactMobile: resolvedPhone } : null;
      if (phoneCache.has(key)) stats.cachedContactHits += 1;
      if (!resolvedPhone && noPhoneCache.has(key)) {
        stats.cachedNoPhoneSkips += 1;
        await database("b2c_candidates").where({ candidate_key: candidateKey }).update({
          status: "REJECTED_CACHED_NO_PHONE",
          qualification: dbJson({ ...qualification, isQualified: false, rejectionReasons: [...new Set([...(qualification.rejectionReasons || []), `No phone was returned for this seller within the last ${cacheWindowHours} hours`])] }),
          updated_at: new Date().toISOString(),
        });
        continue;
      }
      if (!resolvedPhone) {
        stats.contactAttempts += 1;
        stats.passContactAttempts += 1;
        try {
          contact = await fetchHarajPostContact(env, candidate.postId);
          resolvedPhone = normalizeSaudiPhone(contact?.contactMobile || String(contact?.contactText || "").match(/(?:\+?966|0)?5\d{8}/)?.[0]);
        } catch (error) {
          logger?.warn?.(`Haraj contact lookup failed for post ${candidate.postId}: ${String(error?.message || error)}`);
          contact = {};
        }
      }
      if (!resolvedPhone) {
        noPhoneCache.add(key);
        await database("b2c_candidates").where({ candidate_key: candidateKey }).update({
          status: "REJECTED_NO_PHONE",
          qualification: dbJson({ ...qualification, isQualified: false, rejectionReasons: [...new Set([...(qualification.rejectionReasons || []), "No verified Saudi mobile number available"]) ] }),
          updated_at: new Date().toISOString(),
        });
        if (stats.passContactAttempts >= earlyStopSample && stats.contactsResolved === contactsResolvedAtStart) {
          stats.stoppedEarly = true;
          stats.earlyStopReason = `No verified phone numbers in the first ${stats.passContactAttempts} unique contact lookups of this pass`;
          break;
        }
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
    }
    const shouldContinue = stats.uniqueLeads < Number(campaign.target_lead_count)
      && !stats.sourceExhausted
      && stats.postsFetched < maxAds
      && maxPages > 0;
    if (shouldContinue) {
      await database("lead_requests").where({ id: campaign.request_id }).update({ status: "sourcing", result_count: stats.uniqueLeads, error_message: null, updated_at: new Date().toISOString() });
      await updateCampaign(database, campaign.id, "QUEUED", stats, null);
      setTimeout(() => runB2CCampaign({ database, env, campaignId: campaign.id, logger }).catch(() => undefined), 250);
      return stats;
    }
    const finalStatus = stats.uniqueLeads >= Number(campaign.target_lead_count) ? "COMPLETED" : stats.uniqueLeads > 0 ? "PARTIAL" : "FAILED";
    const requestStatus = finalStatus === "COMPLETED" ? "sourced" : finalStatus.toLowerCase();
    const finalMessage = finalStatus === "FAILED"
      ? stats.stoppedEarly
        ? stats.earlyStopReason
        : "Wasla could not validate any matching B2C prospects from this search."
      : null;
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
  const profiles = (plan.targetProfiles || intent.idealCustomerProfiles?.map((item) => item.name) || []).slice(0, 4);
  const signals = (intent.behavioralSignals || []).map((item) => item.signal).filter(Boolean).slice(0, 4);
  const cities = intent.market?.cities?.length ? intent.market.cities : [intent.market?.country || "Saudi Arabia"];
  return {
    thinking: `Wasla translated ${product} into a real-world audience and focused the search on ${cities.join(", ")}.`,
    understanding: profiles.length
      ? `The strongest likely matches were ${profiles.join(", ")}.`
      : `Wasla identified people whose recent activity indicates a practical need for ${product}.`,
    sourcing: `Wasla analyzed ${Number(stats.postsFetched || 0).toLocaleString()} public activity signals${signals.length ? ` such as ${signals.join(", ")}` : ""}, qualified ${Number(stats.candidatesQualified || 0).toLocaleString()} candidates, and delivered ${Number(stats.uniqueLeads || 0).toLocaleString()} distinct prospects.`,
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

export { jsonValue, STRATEGY_VALUES };
