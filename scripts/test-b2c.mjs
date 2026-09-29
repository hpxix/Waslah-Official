import assert from "node:assert/strict";
import {
  createB2CPlan,
  normalizeSaudiPhone,
  scoreB2CCandidate,
  validateB2CPlan,
} from "../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js";

const planning = await createB2CPlan({}, "I sell iPhone 18 devices in Riyadh");
assert.equal(planning.intent.buyerType, "B2C");
assert.deepEqual(planning.intent.market.cities, ["Riyadh"]);
assert.equal(planning.acquisitionPlan.strategies.length, 1);
assert.equal(planning.acquisitionPlan.strategies[0].searchTerm, "مطلوب ايفون 18");
assert.equal(planning.acquisitionPlan.searchStrategyVersion, 6);
assert.equal(planning.acquisitionPlan.strategistVersion, "wasla-saudi-lead-search-strategist-v1");
assert.equal(planning.acquisitionPlan.strategies[0].sourceMode, "search");
assert.equal("tagName" in planning.acquisitionPlan.strategies[0], false);
assert.equal("taxonomyMatches" in planning, false);

const strategy = planning.acquisitionPlan.strategies[0];
const candidate = (title, bodyText = "") => ({
  postId: 1,
  authorId: 10,
  authorUsername: "seller",
  title,
  bodyText,
  city: "Riyadh",
  geoCity: "Riyadh",
  tags: ["هواتف"],
  postDate: Math.floor(Date.now() / 1000),
  updateDate: Math.floor(Date.now() / 1000),
  matchedStrategy: strategy,
});

assert.equal(scoreB2CCandidate(candidate("مطلوب ايفون 18 برو"), planning.acquisitionPlan).isQualified, true);
assert.equal(scoreB2CCandidate(candidate("ايفون 18 برو للبيع"), planning.acquisitionPlan).isQualified, false);
assert.equal(scoreB2CCandidate(candidate("جوال جديد", "أبي ايفون 18"), planning.acquisitionPlan).isQualified, true);
assert.equal(scoreB2CCandidate(candidate("ايفون 17 برو"), planning.acquisitionPlan).isQualified, false);
assert.equal(scoreB2CCandidate(candidate("أبي سواق خاص", "أبحث عن سائق للعائلة في الرياض"), planning.acquisitionPlan).isQualified, false);

const validated = await validateB2CPlan({}, "I sell iPhone 18 devices in Riyadh", {
  acquisitionPlan: { strategies: [{ tagName: "هواتف" }] },
});
assert.equal(validated.acquisitionPlan.strategies.length, 1);
assert.equal(validated.acquisitionPlan.strategies[0].searchTerm, "مطلوب ايفون 18");
assert.equal("tagName" in validated.acquisitionPlan.strategies[0], false);

assert.equal(normalizeSaudiPhone("966581447885"), "+966581447885");
assert.equal(normalizeSaudiPhone("+966581447885"), "+966581447885");
assert.equal(normalizeSaudiPhone("0581447885"), "+966581447885");
assert.equal(normalizeSaudiPhone("not a phone"), null);

console.log("B2C strategist planning, evidence fallback scoring, and Saudi phone normalization passed.");
