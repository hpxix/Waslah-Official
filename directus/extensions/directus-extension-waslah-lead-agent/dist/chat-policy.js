// Quantity policy is product logic, not something a language model can change.
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const copy = value => Array.isArray(value) ? value.map(copy) : object(value)
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
const normalized = value => String(value || '').normalize('NFKC').toLowerCase()
  .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[\u064b-\u065f\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا')
  .replace(/\bthirty\b|ثلاثين|ثلاثون/g, '30').replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
const number = '30(?!\\d)';
const falseMinimum = [
  new RegExp(`\\b(?:minimum|min|minimal|smallest)(?:\\s+(?:lead|contact|prospect|order|search|quantity|count|package|size|number|amount|is|of|starts|at|must|be|requires?)){0,8}\\s*[:=]?\\s*${number}\\b`),
  new RegExp(`\\b${number}\\s*(?:(?:lead|contact|prospect)s?\\s+)?(?:minimum|min)\\b`),
  new RegExp(`\\b(?:cannot|can't|can’t|unable to|not able to|don't|do not|won't|will not)(?:\\s+\\w+){0,8}\\s+(?:less|fewer|below|under)(?:\\s+than)?\\s+${number}\\b`),
  new RegExp(`\\b(?:need|needs|require|requires|must|have to|has to)(?:\\s+\\w+){0,5}\\s+(?:at least|minimum(?: of)?)\\s+${number}\\b`),
  new RegExp(`\\b(?:packages?|plans?|searches?|orders?|quantities|runs?)\\s+(?:(?:only|all|normally|currently|must)\\s+)*(?:start|starts|begin|begins)(?:\\s+(?:at|from|with))?\\s+${number}\\b`),
  new RegExp(`(?:الحد\\s+(?:الادنى|الاقل)|اقل\\s+(?:عدد|كميه|كمية|باقه|باقة))(?:\\s+[\\p{L}]+){0,6}\\s*[:=]?\\s*${number}`, 'u'),
  new RegExp(`(?:لا يمكن|لايمكن|ما نقدر|مانقدر|ما اقدر|مااقدر|مو ممكن|غير ممكن|ما ينفع|ماينفع|لا نقبل)(?:\\s+[\\p{L}]+){0,8}\\s+(?:ب?اقل من|دون)\\s*${number}`, 'u'),
  new RegExp(`(?:لازم|يلزم|يجب|نحتاج|تحتاج)(?:\\s+[\\p{L}]+){0,6}\\s+(?:على الاقل\\s*${number}|${number}\\s*(?:عميل|عملاء|جهات اتصال)?\\s*على الاقل)`, 'u'),
  new RegExp(`(?:الباقات|الطلبات|الكميات|البحث)(?:\\s+[\\p{L}]+){0,4}\\s+(?:تبدا|تبتدي|تبداء)(?:\\s+(?:من|عند|ب))?\\s*${number}`, 'u'),
  new RegExp(`${number}(?:\\s+[\\p{L}]+){0,6}\\s+(?:كحد ادنى|كحد اقل|على الاقل)`, 'u'),
];

export function claimsFalseMinimum(value) {
  const text = normalized(value);
  // A correction saying there is no 30-lead minimum is already correct.
  if (/\b(?:no|not a|isn't a|is not a)\s+(?:fixed\s+)?(?:minimum(?: of)?\s+30|30\s+(?:lead\s+)?minimum)\b|(?:ما فيه|مافيه|لا يوجد|ليس هناك)\s+حد\s+ادنى\s*(?:من|ل)?\s*30/.test(text)) return false;
  return falseMinimum.some(pattern => pattern.test(text));
}

const quantityText = language => language === 'ar'
  ? 'تقدر تطلب أي عدد من 1 إلى 200 عميل، حتى لو للتجربة. كم عميل تبي؟'
  : 'You can request any number from 1 to 200 leads, including a small trial. How many would you like?';
const summaryPolicy = language => language === 'ar' ? 'العدد المخصص المتاح: من 1 إلى 200 عميل.' : 'Custom quantity: 1 to 200 leads.';

function removeMinimumClaims(value) {
  return String(value || '').split(/(?<=[.!?؟؛])\s+|\n+/u)
    .filter(sentence => !claimsFalseMinimum(sentence)).join(' ').trim();
}

// The caller MUST resolve this prior from the same authenticated conversation
// and model. This helper deliberately does not consult account/global memory.
export function restoreConfirmedBrief(priorReadyIntake, { language = 'en' } = {}) {
  const prior = priorReadyIntake;
  if (!object(prior) || prior.confidence !== 100 || prior.channel !== 'b2b'
    || !Array.isArray(prior.missing) || prior.missing.length
    || typeof prior.summary !== 'string' || !prior.summary.trim()
    || !object(prior.apifyInput) || !object(prior.businessUnderstanding)) return null;
  const filters = copy(prior.apifyInput);
  const searchQueries = copy(Array.isArray(prior.searchQueries) ? prior.searchQueries
    : Array.isArray(filters.searchStringsArray) ? filters.searchStringsArray : []);
  delete filters.searchStringsArray;
  return {
    text: quantityText(language), ready: true, summary: claimsFalseMinimum(prior.summary)
      ? [removeMinimumClaims(prior.summary), summaryPolicy(language)].filter(Boolean).join(' ') : prior.summary,
    missing: [], searchQueries, filters,
    businessUnderstanding: copy(prior.businessUnderstanding),
    signalTopics: copy(Array.isArray(prior.signalTopics) ? prior.signalTopics : []),
    ...(typeof prior.productDescription === 'string' ? { productDescription: prior.productDescription } : {}),
    ...(typeof prior.productOutcome === 'string' ? { productOutcome: prior.productOutcome } : {}),
  };
}

export function enforceLeadQuantityPolicy(generatedBrief, priorReadyIntake, language = 'en', quantityOnly = false) {
  const brief = object(generatedBrief) ? copy(generatedBrief) : {};
  // Only an exact quantity-only turn may recover a prior target. Target edits,
  // new chats, partial business intake, and unconfirmed briefs cannot use it.
  if (quantityOnly === true) {
    const restored = restoreConfirmedBrief(priorReadyIntake, { language });
    if (restored) return { ...brief, ...restored };
  }
  if (!claimsFalseMinimum(brief.text) && !claimsFalseMinimum(brief.summary)) return brief;
  const remainingText = removeMinimumClaims(brief.text);
  brief.text = [quantityText(language), remainingText].filter(Boolean).join('\n\n');
  if (claimsFalseMinimum(brief.summary)) brief.summary = [removeMinimumClaims(brief.summary), summaryPolicy(language)].filter(Boolean).join(' ');
  brief.ready = false;
  if (Array.isArray(brief.missing)) brief.missing = brief.missing.filter(item => !claimsFalseMinimum(item));
  return brief;
}
