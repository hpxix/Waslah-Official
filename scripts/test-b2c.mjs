import assert from "node:assert/strict";
import {
  createB2CPlan,
  loadHarajTaxonomy,
  normalizeSaudiPhone,
  scoreB2CCandidate,
  selectB2CLeadPaths,
  validateB2CPlan,
} from "../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js";

function confirmPaths(plan, ids = plan.acquisitionPlan.leadPaths.map((path) => path.id)) {
  return selectB2CLeadPaths(plan, ids);
}

const planning = confirmPaths(await createB2CPlan({}, "I sell Netflix subscriptions in Riyadh"));
const taxonomy = await loadHarajTaxonomy();
const validTags = new Set(taxonomy.map((tag) => `${tag.id}:${tag.name}`));

assert.equal(planning.intent.buyerType, "B2C");
assert.equal(new Set(planning.acquisitionPlan.leadPaths.map((path) => path.id)).size, planning.acquisitionPlan.leadPaths.length);
assert.deepEqual(planning.intent.market.cities, ["Riyadh"]);
assert.ok(planning.acquisitionPlan.strategies.length >= 3);
assert.equal(planning.acquisitionPlan.strategies.filter((strategy) => strategy.sourceMode === "search").length, 3);
assert.ok(planning.acquisitionPlan.strategies
  .filter((strategy) => strategy.sourceMode !== "search")
  .every((strategy) => validTags.has(`${strategy.tagId}:${strategy.tagName}`)));
assert.ok(planning.acquisitionPlan.strategies.some((strategy) => strategy.tagName === "حسابات واشتراكات"));

const fishPlanning = confirmPaths(await createB2CPlan({}, "I sell live fish in Riyadh"));
const fishTags = fishPlanning.acquisitionPlan.strategies.map((strategy) => strategy.tagName);
assert.ok(fishTags.includes("أسماك وسلاحف"));
assert.ok(!fishTags.some((tag) => /قطط|كلاب|اراضي|فلل|شقق/.test(tag)));

const cattlePlanning = confirmPaths(await createB2CPlan({}, "I sell cow milkers to cattle owners in Saudi Arabia"));
const cattleTags = cattlePlanning.acquisitionPlan.strategies.map((strategy) => strategy.tagName);
assert.ok(cattleTags.includes("بقر"));
assert.ok(cattleTags.includes("معدات زراعية"));

const catFoodPlanning = confirmPaths(await createB2CPlan(
  {},
  "I sell a monthly premium cat-food delivery subscription to private cat owners in Jeddah",
));
const catFoodTags = catFoodPlanning.acquisitionPlan.strategies.map((strategy) => strategy.tagName);
assert.ok(catFoodTags.includes("قطط"));
assert.ok(!catFoodTags.includes("كلاب"));
assert.ok(!catFoodTags.some((tag) => /مطاعم|اطعمة ومشروبات|حفلات/.test(tag)));
assert.equal(catFoodPlanning.acquisitionPlan.preflight.aligned, true);
const catFoodKeywords = catFoodPlanning.acquisitionPlan.strategies.flatMap((strategy) => strategy.positiveKeywords);
assert.ok(!catFoodKeywords.some((keyword) => /^(premium|monthly|delivery|service|owner|customer)$/i.test(keyword)));

const movingPlanning = confirmPaths(await createB2CPlan(
  {},
  "I sell home moving and cleaning services to people relocating apartments in Riyadh",
));
const movingTags = movingPlanning.acquisitionPlan.strategies.map((strategy) => strategy.tagName);
assert.ok(movingTags.includes("خدمات نقل العفش"));
assert.ok(movingTags.includes("شقق للايجار"));
assert.equal(movingPlanning.acquisitionPlan.preflight.aligned, true);

const aquariumPlanning = confirmPaths(await createB2CPlan({}, "I sell aquarium maintenance to private fish owners in Dammam"));
assert.ok(aquariumPlanning.acquisitionPlan.strategies.some((strategy) => strategy.tagName === "مواشي وحيوانات وطيور"));
assert.ok(aquariumPlanning.acquisitionPlan.strategies.every((strategy) => strategy.requiresKeywordMatch));

const weddingPlanning = confirmPaths(await createB2CPlan({}, "I sell wedding photography packages in Jeddah"));
const weddingTags = weddingPlanning.acquisitionPlan.strategies
  .filter((strategy) => strategy.sourceMode !== "search")
  .map((strategy) => strategy.tagName);
assert.ok(weddingTags.length >= 1);
assert.ok(weddingTags.every((tag) => ["حفلات ومناسبات", "قاعة للايجار", "استراحات للايجار", "طاولات وكراسي", "فساتين"].includes(tag)));
assert.equal(new Set(weddingTags).size, weddingTags.length);
assert.ok(weddingPlanning.acquisitionPlan.strategies.every((strategy) => strategy.requiresKeywordMatch));

const fifaPlanning = confirmPaths(await createB2CPlan({}, "I sell FIFA 27 game codes at a 25 percent discount to gamers in Saudi Arabia"));
const fifaSearches = fifaPlanning.acquisitionPlan.strategies.filter((strategy) => strategy.phase === "fallback");
assert.deepEqual(fifaSearches.map((strategy) => strategy.searchTerm), ["FIFA", "FIFA 27", "FIFA 26"]);
assert.ok(fifaPlanning.acquisitionPlan.strategies.filter((strategy) => strategy.sourceMode !== "search").every((strategy) => strategy.phase === "primary"));
assert.ok(fifaSearches.every((strategy) => strategy.acceptSellerSignals));
const fifaSeller = scoreB2CCandidate({
  postId: 4,
  authorId: 40,
  authorUsername: "gamer",
  title: "للبيع FIFA بسعر ممتاز",
  bodyText: "",
  city: "Riyadh",
  geoCity: "Riyadh",
  tags: ["ألعاب"],
  postDate: Math.floor(Date.now() / 1000),
  updateDate: Math.floor(Date.now() / 1000),
  matchedStrategy: {
    tagName: fifaSearches[0].tagName,
    strategyType: fifaSearches[0].strategyType,
    weight: fifaSearches[0].weight,
    sourceMode: "search",
    searchTerm: fifaSearches[0].searchTerm,
  },
}, fifaPlanning.acquisitionPlan);
assert.equal(fifaSeller.marketplaceRole, "OWNER");
assert.equal(fifaSeller.isQualified, true);

const fabricPlanning = confirmPaths(await createB2CPlan({}, "I sell premium fabric used for hoodies to people and small clothing traders in Saudi Arabia"));
assert.deepEqual(
  fabricPlanning.acquisitionPlan.strategies.filter((strategy) => strategy.phase === "fallback").map((strategy) => strategy.searchTerm),
  ["هودي", "hoodie", "سويت شيرت"],
);

const validated = await validateB2CPlan({}, "I sell Netflix subscriptions", {
  intent: planning.intent,
  acquisitionPlan: {
    ...planning.acquisitionPlan,
    strategies: [{ ...planning.acquisitionPlan.strategies[0], tagId: "invented", tagName: "Invented category" }],
  },
});
assert.ok(validated.acquisitionPlan.strategies.every((strategy) => strategy.tagName !== "Invented category"));

const onePath = confirmPaths(planning, [planning.acquisitionPlan.leadPaths[0].id]);
assert.deepEqual(onePath.acquisitionPlan.selectedPathIds, [planning.acquisitionPlan.leadPaths[0].id]);
assert.equal(onePath.acquisitionPlan.leadPaths.filter((path) => path.selected).length, 1);

const directIntentPlan = {
  product: "خدمات تخطيط وتنظيم الحفلات",
  dealIntent: "sell",
  preflight: { aligned: true },
  strategies: [{
    tagName: "حفلات ومناسبات",
    strategyType: "DIRECT_INTENT",
    weight: 0.96,
    positiveKeywords: ["أبي منسقة حفلات", "مطلوب تجهيز ذكرى زواج"],
    negativeKeywords: ["خدمات تنظيم حفلات"],
    requiresKeywordMatch: true,
    cities: ["Dammam"],
  }],
};
const candidateBase = {
  postId: 1,
  authorId: 10,
  authorUsername: "customer",
  bodyText: "",
  city: "الشرقيه",
  geoCity: "Dammam",
  tags: ["حفلات ومناسبات"],
  postDate: Math.floor(Date.now() / 1000),
  updateDate: Math.floor(Date.now() / 1000),
  matchedStrategy: { tagName: "حفلات ومناسبات", strategyType: "DIRECT_INTENT", weight: 0.96 },
};
const demandCandidate = scoreB2CCandidate({ ...candidateBase, title: "مطلوب تجهيز ذكرى زواج وأبي منسقة حفلات في الدمام" }, directIntentPlan);
assert.equal(demandCandidate.demandEvidence, true);
assert.equal(demandCandidate.isQualified, true);
assert.equal(demandCandidate.marketplaceRole, "LIKELY_BUYER");

const supplierCandidate = scoreB2CCandidate({ ...candidateBase, postId: 2, title: "نوفر خدمات تنظيم حفلات وذكرى زواج في الدمام" }, directIntentPlan);
assert.equal(supplierCandidate.supplyEvidence, true);
assert.equal(supplierCandidate.isQualified, false);
assert.ok(["COMPETITOR", "SERVICE_PROVIDER"].includes(supplierCandidate.marketplaceRole));

const unrelatedDemand = scoreB2CCandidate({ ...candidateBase, postId: 3, title: "ابحث عن زواج مسيار في الدمام والخبر" }, {
  ...directIntentPlan,
  strategies: [{ ...directIntentPlan.strategies[0], positiveKeywords: ["ذكرى زواج", "الدمام"] }],
});
assert.equal(unrelatedDemand.demandEvidence, true);
assert.equal(unrelatedDemand.isQualified, false);

assert.equal(normalizeSaudiPhone("966581447885"), "+966581447885");
assert.equal(normalizeSaudiPhone("+966581447885"), "+966581447885");
assert.equal(normalizeSaudiPhone("0581447885"), "+966581447885");
assert.equal(normalizeSaudiPhone("not a phone"), null);

console.log("B2C planner, taxonomy validation, and Saudi phone normalization passed.");
