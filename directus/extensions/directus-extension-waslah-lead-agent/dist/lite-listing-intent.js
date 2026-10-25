// Listing intent is an observation about the ad, never a prediction of purchase intent.
const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', bull: '•', rlm: '', lrm: '' };

export function cleanListingText(value, limit = 1400) {
  let text = String(value || '');
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === '#') {
        const hex = entity[1]?.toLowerCase() === 'x';
        const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return ENTITY_MAP[entity.toLowerCase()] ?? match;
    });
    if (decoded === text) break;
    text = decoded;
  }
  return text.replace(/<[^>]+>/g, ' ').replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, limit);
}

const rules = [
  { intent: 'sold_or_closed', pattern: /تم\s*(?:البيع|بيعه|التأجير)|(?:^|\s)مباع(?:\s|$)|sold\s*out|already\s*sold|no\s*longer\s*available/i, body: true },
  { intent: 'seeking_work', pattern: /(?:أبحث|ابحث)\s+عن\s+(?:عمل|وظيف[هة])|looking\s+for\s+(?:work|a\s+job)|مطلوب\s+وظيف[هة]/i, body: true },
  { intent: 'seeking_to_rent', pattern: /(?:مطلوب|ابغى|أبغى|أحتاج|احتاج|ابحث\s+عن|أبحث\s+عن).{0,35}(?:إيجار|ايجار|استئجار)|looking\s+to\s+rent/i },
  { intent: 'seeking_to_buy', pattern: /(?:^|[\s:،])(?:مطلوب|ابغى|أبغى|ابي|أبي|احتاج|أحتاج|ادور|أدور|ابحث\s+عن|أبحث\s+عن|أرغب\s+في\s+شراء)(?=[\s:،]|$)|\b(?:wanted|looking\s+to\s+buy|want\s+to\s+buy|need\s+to\s+buy)\b/i },
  { intent: 'offering_for_rent', pattern: /للإيجار|للايجار|تأجير|تاجير|معروض\s+للإيجار|for\s+rent|available\s+for\s+rent/i },
  { intent: 'offering_for_sale', pattern: /للبيع|معروض\s+للبيع|for\s+sale|for\s+takeover|selling\s+my|أبيع|ابيع/i },
  { intent: 'offering_service', pattern: /نقدم|نوفر\s+لك|متخصص(?:ون|ين)?\s+في|خدمات?\s+(?:توصيل|تصميم|صيانة|تنظيف|تسويق|نقل|تصوير)|(?:^|\s)(?:تصميم|طباعة|برمجة|صيانة|تركيب|تنفيذ)\s+|\b(?:we\s+offer|our\s+services|service\s+provider)\b/i },
  { intent: 'product_listed', pattern: /(?:^|\s)(?:السعر|بسعر|متوفر|تتوفر|يوجد|للبيع|للتواصل|السعر\s*[:：]|price\s*[:：]|available\s+in|contact\s+for\s+price)(?:\s|[:：]|$)/i },
];

export function classifyListingIntent(title, body) {
  const cleanTitle = cleanListingText(title, 300);
  const cleanBody = cleanListingText(body, 4000);
  // A clear closure or job-seeking statement in the body overrides a sales-like title.
  for (const rule of rules.slice(0, 2)) {
    const match = `${cleanTitle}\n${cleanBody}`.match(rule.pattern);
    if (match) return { intent: rule.intent, signal: match[0].trim() };
  }
  for (const rule of rules.slice(2)) {
    const match = cleanTitle.match(rule.pattern) || cleanBody.slice(0, 500).match(rule.pattern);
    if (match) return { intent: rule.intent, signal: match[0].trim() };
  }
  return { intent: 'not_stated', signal: null };
}

export function productFromListingTitle(value) {
  const title = cleanListingText(value, 240)
    .replace(/(?:https?:\/\/|www\.)\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, ' ')
    .replace(/(?:\+?966|05)\d[\d\s-]{6,}\d/g, ' ')
    .replace(/\b\d{8,}\b/g, ' ')
    .replace(/(?:^|\s)(?:للبيع|للإيجار|للايجار|مطلوب|عرض|فرصة|جديد|مستعمل|بيع|اتصل|للتواصل|for sale|for rent|wanted|selling|available|call)(?=\s|$)/gi, ' ')
    .replace(/[|،,:;!؟()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const words = title.split(' ').filter(Boolean).slice(0, 6);
  const product = words.join(' ').slice(0, 72).trim();
  return /[\p{L}]/u.test(product) ? product : null;
}

export function englishProductCategory(product) {
  if (!product) return null;
  const categories = [
    [/قطع\s*غيار|spare\s*parts|auto\s*parts/i, 'Spare parts'],
    [/بوكلين|بوكليِن|حفار|excavat/i, 'Excavator'],
    [/شاحن[هة]|truck/i, 'Truck'],
    [/سيار[هة]|car\b|vehicle/i, 'Car'],
    [/شقق?|شقة|apartment/i, 'Apartment'],
    [/فيلا|villa/i, 'Villa'],
    [/أرض|ارض|land\b|plot\b/i, 'Land'],
    [/جوال|هاتف|آيفون|ايفون|iphone|phone/i, 'Phone'],
    [/لابتوب|حاسب|كمبيوتر|laptop|computer/i, 'Computer'],
    [/ثلاج[هة]|refrigerator|fridge/i, 'Refrigerator'],
    [/أثاث|اثاث|furniture/i, 'Furniture'],
  ];
  return categories.find(([pattern]) => pattern.test(product))?.[1] || null;
}

export function listingPreviewFromEvidence(evidence, marketplaceRole = '') {
  if (!Array.isArray(evidence)) return null;
  const listing = evidence.find((item) => item && (item.bodyText || item.title));
  if (!listing) return null;
  const title = cleanListingText(listing.title, 300);
  const body = cleanListingText(listing.bodyText, 4000);
  if (!title && !body) return null;
  // Return only a short product name, never the full ad wording or contact details.
  const intent = classifyListingIntent(title, body).intent;
  const product = productFromListingTitle(title);
  const ownerSignal = /^owner$/i.test(String(marketplaceRole).trim());
  return { intent, product, productCategoryEn: englishProductCategory(product), ownership: ownerSignal && intent === 'offering_for_sale' ? 'likely_owner' : 'unverified' };
}
