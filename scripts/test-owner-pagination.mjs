import assert from "node:assert/strict";
import { createB2CPlan, shouldPauseForYield, admitOwnerProspect, ensureOwnerFallback } from "../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js";

const { acquisitionPlan: plan } = await createB2CPlan({}, "I sell PlayStation 5 in Riyadh");
const owner = plan.strategies.find((strategy) => strategy.strategyType === "OWNER_FALLBACK");
assert.ok(owner, "Sales plans must include the owner fallback");
assert.equal(owner.searchTerm, "بلايستيشن", "Owner retrieval uses the broad product term");
assert.ok(owner.phaseIndex > 0, "Ownership follows buying intent");
const buyer = plan.strategies[0];
for (let page = 1; page <= 100; page++) {
  const progress = { pagesFetched: page, qualifiedCount: 0, zeroYieldPages: page, noLeadPages: page };
  assert.equal(shouldPauseForYield(owner, progress), page >= 6, "Zero-yield owner searches rotate after six pages");
  assert.equal(shouldPauseForYield(buyer, progress), page >= 2, "Buyer trials rotate after two empty pages");
}
assert.equal(shouldPauseForYield(owner, { pagesFetched: 101, qualifiedCount: 1, zeroYieldPages: 0, noLeadPages: 0 }), false);
console.log("PASS: owner trials rotate after six empty pages; buyer trials after two.");
const service = ensureOwnerFallback({ fallback_strategies: [{ type: 'OWNER_FALLBACK', queries: [{ query: 'Book and Large-Format Printing Services (A0-A5)' }] }] }, '', { productName: 'Book and Large-Format Printing Services (A0-A5)' }, false);
assert.ok(service.fallback_strategies.every(phase => phase.type !== 'OWNER_FALLBACK'));
assert.ok(service.fallback_strategies.some(phase => phase.type === 'SERVICE_PARTNER'));
assert.ok(service.fallback_strategies.flatMap(phase => phase.queries).every(item => /[\u0600-\u06ff]/.test(item.query)));

const pcPlan = (await createB2CPlan({}, "I sell gaming PC in Riyadh")).acquisitionPlan;
const pcQueries = pcPlan.strategies.filter((s) => s.strategyType === "OWNER_FALLBACK").map((s) => s.searchTerm);
assert.deepEqual(pcQueries, ['بي سي'], 'fallback retrieval is one Saudi product term, not English or verbose queries');
assert.ok(pcPlan.strategies.find(s => s.strategyType === 'OWNER_FALLBACK').matchTerms.includes('PC'), 'English aliases remain available for matching');
const candidate = { title: "بي سي للبيع استخدام شخصي", bodyText: "", matchedStrategy: { strategyType: "OWNER_FALLBACK", searchTerm: "بي سي" } };
const lowScore = { score: 10, isQualified: false, irrelevantProbability: 10, competitorProbability: 0, explanation: "Owner without expressed purchase intent." };
const accepted = admitOwnerProspect(candidate, lowScore);
assert.equal(accepted.isQualified, true);
assert.equal(accepted.score, 10);
assert.equal(accepted.demandEvidence, false);
assert.equal(accepted.acceptanceBasis, "ownership_fallback");
assert.equal(admitOwnerProspect({ ...candidate, title: "سيارة للبيع" }, lowScore).isQualified, false);
assert.equal(admitOwnerProspect({ ...candidate, title: "متجر بي سي جملة" }, lowScore).isQualified, false);
assert.equal(admitOwnerProspect(candidate, { ...lowScore, irrelevantProbability: 90 }).isQualified, false);
assert.equal(admitOwnerProspect({ ...candidate, matchedStrategy: { strategyType: "DIRECT_PURCHASE_INTENT" } }, lowScore).isQualified, false);
console.log("PASS: Saudi PC vocabulary; low-score owners accepted honestly; unrelated ads and commercial competitors rejected.");
