import { cheapCandidateReject } from './b2c-pipeline.js';

export const KEYWORD_VERSION = 'saudi-keyword-v1';
// The successful 200/200 reference used local keyword qualification and public
// listing phones. Preserve that execution contract without hardcoding its offer,
// cities, queries, or customer target into other campaigns.
export const LITE_EXECUTION_PROFILE = 'public-keyword-paging-v1';
export function usesPublicKeywordProfile(plan) {
  return plan?.keywordMatching?.version === KEYWORD_VERSION;
}
const strings = { type: 'array', minItems: 1, maxItems: 16, items: { type: 'string' } };
export const keywordPlanSchema = {
  type: 'object', additionalProperties: false,
  required: ['productTerms', 'intentTerms', 'titleExclusions', 'commercialTerms', 'buyerQueries', 'ownerTerms'],
  properties: {
    productTerms: strings, intentTerms: strings,
    titleExclusions: { ...strings, minItems: 0 }, commercialTerms: { ...strings, minItems: 0 },
    buyerQueries: { ...strings, maxItems: 3 },
    ownerTerms: { type: 'array', minItems: 1, maxItems: 6, items: {
      type: 'object', additionalProperties: false, required: ['term', 'aliases'],
      properties: { term: { type: 'string' }, aliases: strings },
    } },
  },
};

export function keywordText(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\u064b-\u065f\u0670ـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function includesTerm(text, term) {
  const normalized = keywordText(term);
  return !!normalized && ` ${keywordText(text)} `.includes(` ${normalized} `);
}
const RESTAURANT_TERMS = new Set(['مطعم', 'مطاعم', 'restaurant', 'restaurants', 'كافيه', 'كافيهات', 'مقهى', 'مقاهي', 'cafe', 'cafes', 'تموين', 'catering']);
const RESTAURANT_TRANSFER = /\b(?:for sale|for takeover|takeover|for rent|lease|leased|equipment for sale|job|hiring|wanted|seeking|chef|manager|design|decoration|rental|rent a|truck|bus|car wash)\b|(?:للبيع|للتقبيل|تقبيل|تنازل|للايجار|للإيجار|معدات|وظيفة|توظيف|مطلوب موظف|باحث عن عمل|ابحث عن عمل|تصميم|ديكور|سيارة|سيارات|كلب|جرو|مطعّم|مطعم ضد|لقاح)/iu;
const RESTAURANT_OPERATION = /\b(?:menu|meals|food orders|order food|serving food|restaurant owner|cafe owner|operating restaurant|operating cafe|we operate|we run|our restaurant|our cafe)\b|(?:وجبات|طلبات الطعام|قائمة الطعام|قائمة الوجبات|نقدم الطعام|نقدم الوجبات|نقدم القهوة|نملك مطعم|ندير مطعم|مطعمنا|كافيهنا|مطعم شغال|مطعم قائم|كافيه شغال|كافيه قائم)/iu;

// A sector word alone is not evidence of an operating business. In particular,
// diacritic removal makes vaccinated "مطعّم" collide with restaurant "مطعم".
function restaurantFallbackIssue(candidate, strategy) {
  if (!(strategy.matchTerms || []).some(term => RESTAURANT_TERMS.has(keywordText(term)))) return null;
  const title = String(candidate.title || '');
  const body = String(candidate.bodyText || '');
  const titleHasSector = (strategy.matchTerms || []).some(term => RESTAURANT_TERMS.has(keywordText(term)) && includesTerm(title, term));
  if (!titleHasSector) return 'Restaurant or cafe appears only incidentally in the description.';
  if (RESTAURANT_TRANSFER.test(title) || RESTAURANT_TRANSFER.test(body)) return 'The advertisement concerns another activity, a transfer, equipment, or employment.';
  if (!RESTAURANT_OPERATION.test(`${title}\n${body}`)) return 'No evidence that this advertiser operates a restaurant or cafe.';
  return null;
}

export function requiresSectorFallbackApproval(plan, sampleSize, directQualified) {
  if (!plan?.keywordMatching || plan.fallbackApproved === true || sampleSize < 100 || directQualified > 0) return false;
  const strategies = plan.strategies || [];
  return strategies.some(strategy => strategy.strategyType === 'DIRECT_PURCHASE_INTENT')
    && strategies.some(strategy => strategy.strategyType === 'OWNER_FALLBACK'
      && (strategy.matchTerms || []).some(term => RESTAURANT_TERMS.has(keywordText(term))));
}
const clean = (values, max = 16) => [...new Set((Array.isArray(values) ? values : []).map(v => String(v).trim()).filter(v => keywordText(v) && v.length <= 80 && !/[\r\n]/.test(v)))].slice(0, max);
const OWNER_NOISE = new Set(['للبيع', 'مطلوب', 'جديد', 'مستعمل', 'الرياض', 'جدة', 'جده', 'الدمام', 'الخبر', 'مكة', 'مكه', 'المدينة', 'المدينه']);
function cleanOwnerTerm(value, intentTerms) {
  const words = String(value || '').trim().split(/\s+/).filter(word => word && !OWNER_NOISE.has(keywordText(word)));
  const term = words.slice(0, 3).join(' ');
  if (!keywordText(term) || !/[\p{L}\p{N}]/u.test(term) || intentTerms.some(intent => includesTerm(term, intent))) return '';
  return term;
}

// Search aliases are not only matching vocabulary. When the original owner
// routes are product aliases themselves (rather than a distinct proxy such as
// cow/sheep for a milking machine), every unused Saudi-Arabic alias is also a
// legitimate recovery route. This lets a campaign spend its configured listing
// budget across the full approved vocabulary instead of stopping after the
// first singular/plural spelling reaches the end of its pages.
export function expandKeywordStrategies(plan, cities = []) {
  const strategies = Array.isArray(plan?.strategies) ? [...plan.strategies] : [];
  const productTerms = clean(plan?.keywordMatching?.productTerms);
  if (!productTerms.length || !strategies.length) return strategies;
  const ownerStrategies = strategies.filter(strategy => strategy.strategyType === 'OWNER_FALLBACK');
  const normalizedProducts = new Set(productTerms.map(keywordText));
  const ownerUsesProductVocabulary = ownerStrategies.some(strategy =>
    [strategy.searchTerm, strategy.query, ...(strategy.matchTerms || [])]
      .some(term => normalizedProducts.has(keywordText(term))));
  if (!ownerUsesProductVocabulary) return strategies;
  const existing = new Set(strategies.map(strategy => keywordText(strategy.searchTerm || strategy.query)));
  const phaseIndex = Math.max(0, ...strategies.map(strategy => Number(strategy.phaseIndex || 0))) + 1;
  for (const term of productTerms) {
    const normalized = keywordText(term);
    if (!/[\u0621-\u064a]/.test(term) || term.split(/\s+/).length > 3 || existing.has(normalized)) continue;
    existing.add(normalized);
    strategies.push({
      query: term, searchTerm: term, phase: 'fallback-aliases', phaseIndex,
      strategyType: 'OWNER_FALLBACK', matchTerms: [term], sourceMode: 'search',
      requiresKeywordMatch: true, cities, weight: 0.9,
      pathId: `keyword-alias-${strategies.length}`,
      reason: 'Approved Saudi product alias recovery route',
    });
  }
  return strategies;
}

export function compileKeywordPlan(raw, cities = [], procurement = false) {
  const productTerms = clean(raw?.productTerms);
  const intentTerms = clean(raw?.intentTerms);
  const ownerTerms = (raw?.ownerTerms || []).slice(0, 6).map(item => {
    const term = cleanOwnerTerm(item.term, intentTerms);
    return term ? { term, aliases: clean([term, ...(item.aliases || [])]) } : null;
  }).filter(Boolean);
  // Keep the valid parts of a plan. One overlong or malformed buyer phrase must
  // not destroy otherwise useful ownership routes such as cows, sheep or goats.
  const buyerQueries = clean(raw?.buyerQueries, 3).filter(q => q.split(/\s+/).length <= 3
    && /[\u0621-\u064a]/.test(q)
    && productTerms.some(t => includesTerm(q, t))
    && intentTerms.some(t => includesTerm(q, t)));
  if (!productTerms.length || !intentTerms.length || !ownerTerms.length) {
    throw new Error('Wasla could not prepare a valid short search plan. Please retry.');
  }
  const matching = { version: KEYWORD_VERSION, productTerms, intentTerms, titleExclusions: clean(raw.titleExclusions), commercialTerms: clean(raw.commercialTerms) };
  const strategies = [];
  if (!procurement) for (const query of buyerQueries) strategies.push({ query, searchTerm: query, phase: 'primary', phaseIndex: 0, strategyType: 'DIRECT_PURCHASE_INTENT', matchTerms: productTerms });
  for (const item of ownerTerms) strategies.push({ query: item.term, searchTerm: item.term, phase: procurement ? 'primary' : 'fallback-1', phaseIndex: procurement ? 0 : 1, strategyType: procurement ? 'ACTIVE_OFFER' : 'OWNER_FALLBACK', matchTerms: item.aliases });
  const compiledStrategies = strategies.map((s, i) => ({ ...s, sourceMode: 'search', requiresKeywordMatch: true, cities, weight: 1, pathId: `keyword-${i}`, reason: s.strategyType === 'DIRECT_PURCHASE_INTENT' ? 'Product and purchase expression' : 'Matching product prospect; buying intent unconfirmed' }));
  return { matching, strategies: expandKeywordStrategies({ keywordMatching: matching, strategies: compiledStrategies }, cities) };
}

export function qualifyKeywordCandidate(candidate, plan) {
  const rules = plan.keywordMatching;
  const strategy = candidate.matchedStrategy || {};
  const buyer = strategy.strategyType === 'DIRECT_PURCHASE_INTENT';
  const fields = [candidate.title || '', candidate.bodyText || ''];
  const terms = buyer ? rules.productTerms : strategy.matchTerms || [];
  const matched = terms.filter(term => fields.some(field => includesTerm(field, term)));
  const exclusion = cheapCandidateReject(candidate)
    || rules.titleExclusions.find(term => includesTerm(candidate.title, term))
    || rules.commercialTerms.find(term => fields.some(field => includesTerm(field, term)))
    || (!buyer && plan.dealIntent === 'sell' && restaurantFallbackIssue(candidate, strategy));
  // Require intent and product in the same short clause, not an unrelated
  // "wanted: employee" elsewhere in a seller's description.
  const demand = fields.some(field => String(field).split(/[.!?؟،\n]/).some(clause => {
    const normalized = keywordText(clause);
    if (/(?:لا اريد|لا ابي|غير مطلوب|not looking|do not want)/.test(normalized)) return false;
    const words = normalized.split(' ');
    return words.some((_, index) => {
      const window = words.slice(index, index + 10).join(' ');
      return terms.some(term => includesTerm(window, term)) && rules.intentTerms.some(term => includesTerm(window, term))
        && !/(?:لا اريد|لا ابي|غير مطلوب|not looking|do not want)/.test(window);
    });
  }));
  const isQualified = !exclusion && matched.length > 0 && (!buyer || demand);
  return {
    isQualified, qualificationMode: KEYWORD_VERSION, acceptanceBasis: buyer ? 'keyword_intent' : 'keyword_owner',
    verdict: isQualified ? 'STRONG' : 'REJECT', score: isQualified ? (buyer ? 85 : 65) : 0, scoreMeaning: 'rule_tier_not_probability',
    identityConfidence: 0, purchasePropensity: 0, evidenceStrength: isQualified ? 100 : 0,
    demandEvidence: isQualified && buyer, supplyEvidence: isQualified && plan.dealIntent === 'buy',
    marketplaceRole: buyer ? 'POTENTIAL_BUYER' : 'PRODUCT_PROSPECT', matchedSignals: matched,
    negativeSignals: exclusion ? [exclusion] : [], irrelevantProbability: isQualified ? 0 : 100,
    competitorProbability: exclusion ? 100 : 0,
    explanation: exclusion ? `Excluded by rule: ${exclusion}.` : !matched.length ? 'No matching product term in title or description.' : buyer && !demand ? 'No nearby purchase-intent expression.' : buyer ? 'Product and purchase wording matched.' : 'Product match confirmed. Relevant ownership signal detected.',
  };
}

export function qualifyProductAdFallback(candidate,plan,hasPhone) {
  const fields=[candidate.title||'',candidate.bodyText||''];
  const matches=(plan.keywordMatching?.productTerms||[]).filter(term=>fields.some(field=>includesTerm(field,term)));
  // Qualification is keyword-only. Contact validity/authorization/deduplication
  // are separate delivery checks, not hidden relevance or business filters.
  const exclusion=null;
  const isQualified=Boolean(matches.length);
  return {isQualified,qualificationMode:KEYWORD_VERSION,acceptanceBasis:'product_ad_phone_fallback',verdict:isQualified?'STRONG':'REJECT',score:isQualified?65:0,scoreMeaning:'rule_tier_not_probability',grade:'MEDIUM',gradeBasis:'matching_product_ad_with_phone_not_verified_buyer',identityConfidence:0,purchasePropensity:0,evidenceStrength:isQualified?100:0,demandEvidence:false,supplyEvidence:false,marketplaceRole:'PRODUCT_AD_CONTACT',matchedSignals:matches,negativeSignals:exclusion?[exclusion]:[],irrelevantProbability:isQualified?0:100,competitorProbability:0,explanation:exclusion?`Excluded by rule: ${exclusion}.`:!matches.length?'No matching product term.':!hasPhone?'Matching product ad has no valid Saudi mobile in its title or description.':'Product advertisement with a phone number. Buying intent is not established.'};
}
