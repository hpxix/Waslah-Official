import test from 'node:test';
import assert from 'node:assert/strict';
import { compileKeywordPlan, qualifyKeywordCandidate, includesTerm, requiresSectorFallbackApproval, LITE_EXECUTION_PROFILE, usesPublicKeywordProfile } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-keywords.js';
import { createB2CPlan, qualifyCandidates, admitOwnerProspect, isSupplierSearchRequest, shouldAttemptRemoteContact } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
const raw = { productTerms: ['بي سي', 'PC'], intentTerms: ['مطلوب', 'ابي', 'ابغى', 'looking for'], buyerQueries: ['مطلوب بي سي', 'ابي بي سي'], ownerTerms: [{ term: 'بي سي', aliases: ['بي سي', 'PC'] }], titleExclusions: ['كفر', 'جراب'], commercialTerms: ['متجر', 'بالجملة', 'our store'] };
const compiled = compileKeywordPlan(raw, ['Riyadh']);
const plan = { dealIntent: 'sell', keywordMatching: compiled.matching };
const ad = (title, bodyText = '', owner = false) => ({ title, bodyText, matchedStrategy: compiled.strategies[owner ? 2 : 0] });
test('Lite uses the successful public-keyword execution profile without private lookups', async () => {
  const generated=await createB2CPlan({},'I sell gaming PC in Riyadh');
  assert.equal(generated.acquisitionPlan.executionProfile,LITE_EXECUTION_PROFILE);
  assert.equal(generated.acquisitionPlan.contactMode,'public_only');
  assert.equal(usesPublicKeywordProfile(generated.acquisitionPlan),true);
  assert.equal(usesPublicKeywordProfile({}),false);
  assert.equal(shouldAttemptRemoteContact({contactAttempts:0,contactLookupMode:'public_contacts_only'}),false);
});
test('buyer phase requires product and nearby purchase wording in title or body', () => {
  assert.equal(qualifyKeywordCandidate(ad('أبِي بي سي'), plan).isQualified, true);
  assert.equal(qualifyKeywordCandidate(ad('طلب', 'looking for PC'), plan).isQualified, true);
  assert.equal(qualifyKeywordCandidate(ad('بي سي للبيع'), plan).isQualified, false);
  assert.equal(qualifyKeywordCandidate(ad('بي سي للبيع', 'مطلوب موظف'), plan).isQualified, false);
  assert.equal(qualifyKeywordCandidate(ad('لا ابي بي سي'), plan).isQualified, false);
});
test('owner fallback requires product, honors exclusions, never gets rescued by legacy admission', () => {
  for (const title of ['سيارة للبيع', 'جراب بي سي', 'متجر بي سي', 'تم البيع بي سي']) {
    const candidate = ad(title, '', true);
    assert.equal(admitOwnerProspect(candidate, qualifyKeywordCandidate(candidate, plan)).isQualified, false, title);
  }
  const result = qualifyKeywordCandidate(ad('PC للبيع استخدام شخصي', '', true), plan);
  assert.equal(result.isQualified, true);
  assert.equal(result.demandEvidence, false);
  assert.match(result.explanation, /ownership signal/i);
});
test('normalization supports Arabic digits, diacritics and whole phrases, not substrings', () => {
  assert.equal(includesTerm('آيفون ١٨', 'ايفون 18'), true);
  assert.equal(includesTerm('بناء', 'بن'), false);
  assert.equal(includesTerm('PCX', 'PC'), false);
  assert.equal(includesTerm('بي-سي', 'بي سي'), true);
});
test('Lite asks for clarification instead of treating supplier-company searches as consumers', async () => {
  const request = 'Find me companies that sells مواد غذائية for restaurants in riyadh saudi arabia';
  assert.equal(isSupplierSearchRequest(request), true);
  assert.equal(isSupplierSearchRequest('I sell food supplies to restaurants that buy from me in Riyadh'), false);
  await assert.rejects(createB2CPlan({}, request), (error) => /Lite cannot verify supplier companies/i.test(error.message) && !/Astraeus/i.test(error.message));
});
test('restaurant fallback requires evidence of an operating restaurant, not an incidental word', () => {
  const restaurant = compileKeywordPlan({
    productTerms: ['مواد غذائية', 'food supplies'], intentTerms: ['شراء', 'طلب'], buyerQueries: ['مواد غذائية شراء'],
    ownerTerms: [{ term: 'مطعم', aliases: ['مطعم', 'restaurant'] }, { term: 'كافيه', aliases: ['كافيه', 'cafe'] }],
    titleExclusions: [], commercialTerms: ['شركة', 'مورد'],
  }, ['Riyadh']);
  const strategy = restaurant.strategies.find(item => item.searchTerm === 'مطعم');
  const restaurantPlan = { dealIntent: 'sell', keywordMatching: restaurant.matching };
  const result = (title, bodyText) => qualifyKeywordCandidate({ title, bodyText, matchedStrategy: strategy }, restaurantPlan);
  assert.equal(result('مطعم يقدم وجبات يوميا', 'نقدم الطعام والوجبات للزبائن في الرياض').isQualified, true);
  assert.equal(result('Golden Dog', 'الصحة: مطعّم، نظيف ونشيط').isQualified, false);
  assert.equal(result('سيارة كلاسيكية للإيجار', 'مناسبة لافتتاح مطعم أو كافيه').isQualified, false);
  assert.equal(result('سيارة مطعّم داخلية كاربون', 'إضافات ديكور للسيارة').isQualified, false);
  assert.equal(result('مطعم للبيع في الرياض', 'مطعم مجهز بالكامل').isQualified, false);
  assert.equal(result('Restaurant Chef', 'Looking for a job').isQualified, false);
  assert.equal(result('تصميم ديكور مطعم', 'تصميم ثلاثي الأبعاد').isQualified, false);
  assert.equal(requiresSectorFallbackApproval({ ...restaurantPlan, strategies: restaurant.strategies }, 163, 0), true);
  assert.equal(requiresSectorFallbackApproval({ ...restaurantPlan, strategies: restaurant.strategies }, 163, 1), false);
  assert.equal(requiresSectorFallbackApproval({ ...restaurantPlan, strategies: restaurant.strategies }, 80, 0), false);
  assert.equal(requiresSectorFallbackApproval({ ...restaurantPlan, strategies: restaurant.strategies, fallbackApproved: true }, 163, 0), false);
});
test('planner keeps valid ownership routes when one generated phrase is malformed', () => {
  const withoutBuyer = compileKeywordPlan({ ...raw, buyerQueries: ['مطلوب بي سي قيمنق الرياض'] });
  assert.equal(withoutBuyer.strategies.some(item => item.strategyType === 'DIRECT_PURCHASE_INTENT'), false);
  const cleanedOwner = compileKeywordPlan({ ...raw, ownerTerms: [{ term: 'بي سي للبيع', aliases: ['PC'] }] });
  assert.equal(cleanedOwner.strategies.at(-1).searchTerm, 'بي سي');
  assert.ok(compiled.strategies[0].phaseIndex < compiled.strategies[2].phaseIndex);
});
test('product-owner campaigns search every approved Saudi alias before source exhaustion', () => {
  const fruit = compileKeywordPlan({
    productTerms: ['خضار', 'خضروات', 'خضار طازجة', 'فواكه', 'فاكهة', 'fruits'],
    intentTerms: ['مطلوب', 'ابي'], buyerQueries: ['مطلوب خضار'],
    ownerTerms: [{ term: 'خضار', aliases: ['خضار', 'خضروات'] }, { term: 'فواكه', aliases: ['فواكه', 'فاكهة'] }],
    titleExclusions: [], commercialTerms: [],
  }, ['Riyadh']);
  assert.deepEqual(
    fruit.strategies.filter(item => item.strategyType === 'OWNER_FALLBACK').map(item => item.searchTerm),
    ['خضار', 'فواكه', 'خضروات', 'خضار طازجة', 'فاكهة'],
  );
  assert.ok(fruit.strategies.filter(item => item.phase === 'fallback-aliases').every(item => item.cities[0] === 'Riyadh'));
});
test('new campaign reviews use zero AI requests, even with provider credentials present', async () => {
  const generated = await createB2CPlan({}, 'I sell gaming PC in Riyadh');
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Paid qualification forbidden'); };
  try {
    const [result] = await qualifyCandidates({ OPENAI_API_KEY: 'test', OPENROUTER_API_KEY: 'test' }, [ad('ابي بي سي')], generated.acquisitionPlan);
    assert.equal(result.isQualified, true);
  } finally { globalThis.fetch = original; }
});
test('known Saudi products recover from a malformed generated plan', async () => {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    const content = call === 1
      ? { productName: 'gaming PC', productDescription: 'Custom gaming PCs for consumers', price: null, currency: null, market: { country: 'Saudi Arabia', cities: ['Riyadh'] }, buyerType: 'B2C', idealCustomerProfiles: [{ name: 'PC gamer', description: 'Consumer buying a gaming PC', weight: 90 }], behavioralSignals: [{ signal: 'Looking for a gaming PC', reason: 'Direct purchase intent', weight: 95 }], negativeSignals: [{ signal: 'Computer shop', reason: 'Professional reseller' }], retrievalHypotheses: [{ label: 'Direct buyer', description: 'Asks to buy a gaming PC', expectedIntentStrength: 95 }] }
      : { productTerms: ['بي سي'], intentTerms: ['مطلوب'], buyerQueries: ['عبارة طويلة جدا وغير صالحة بي سي'], ownerTerms: [{ term: 'بي سي للبيع', aliases: ['PC'] }], titleExclusions: [], commercialTerms: [] };
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  };
  try {
    const plan = await createB2CPlan({ OPENROUTER_API_KEY: 'test' }, 'I sell gaming PCs in Riyadh');
    assert.equal(plan.acquisitionPlan.strategies[0].searchTerm, 'مطلوب بي سي');
    assert.deepEqual(plan.acquisitionPlan.strategies.filter(item => item.strategyType === 'OWNER_FALLBACK').map(item => item.searchTerm), ['بي سي', 'بي سي قيمنق', 'تجميعة', 'PC', 'gaming PC', 'كمبيوتر', 'تجميعة قيمنق']);
  } finally { globalThis.fetch = original; }
});
test('livestock equipment builds direct and animal-owner fallback routes without AI', async () => {
  const plan = await createB2CPlan({}, 'I sell cow milking machines in Riyadh and they work for cows and sheep');
  const terms = plan.acquisitionPlan.strategies.filter(item => item.strategyType === 'OWNER_FALLBACK').map(item => item.searchTerm);
  assert.deepEqual(terms, ['بقر', 'غنم']);
  assert.ok(plan.acquisitionPlan.strategies.some(item => item.searchTerm === 'مطلوب حلابه'));
});
