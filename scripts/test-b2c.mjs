import assert from "node:assert/strict";
import {
  createB2CPlan,
  loadHarajTaxonomy,
  normalizeSaudiPhone,
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
assert.deepEqual(planning.intent.market.cities, ["Riyadh"]);
assert.ok(planning.acquisitionPlan.strategies.length >= 3);
assert.ok(planning.acquisitionPlan.strategies.every((strategy) => validTags.has(`${strategy.tagId}:${strategy.tagName}`)));
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
assert.deepEqual(weddingPlanning.acquisitionPlan.strategies.map((strategy) => strategy.tagName), ["حفلات ومناسبات"]);
assert.ok(weddingPlanning.acquisitionPlan.strategies[0].requiresKeywordMatch);

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

assert.equal(normalizeSaudiPhone("966581447885"), "+966581447885");
assert.equal(normalizeSaudiPhone("+966581447885"), "+966581447885");
assert.equal(normalizeSaudiPhone("0581447885"), "+966581447885");
assert.equal(normalizeSaudiPhone("not a phone"), null);

console.log("B2C planner, taxonomy validation, and Saudi phone normalization passed.");
