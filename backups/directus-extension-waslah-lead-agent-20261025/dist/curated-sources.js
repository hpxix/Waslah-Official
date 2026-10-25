// User-approved catalog. Provider choice and input construction are JavaScript,
// never LLM output. Metadata/prices/schemas are refreshed before every launch.
export const CURATED_SOURCES = Object.freeze([
  { key: 'pipeline-ppe', slug: 'pipelinelabs/lead-scraper-apollo-zoominfo-lusha-ppe', id: 'kVYdvNOefemtiDXO5', kind: 'business', adapter: 'pipeline', phones: true },
  { key: 'zillow', slug: 'memo23/zillow-agents-leads-scraper-ppe', id: 'PEThILhPOtwFx9HWK', kind: 'us_agents', adapter: 'zillow', phones: true, limitation: 'US agents only; not a Saudi source or proof of property ownership.' },
  { key: 'microworlds', slug: 'microworlds/leads-finder', id: 'heLL6fUofdPgRXZie', kind: 'business', adapter: 'micro', phones: true, limitation: 'Mobile enrichment carries a documented additional charge.' },
  { key: 'pipeline-email', slug: 'pipelinelabs/leads-finder-with-emails-apollo-lusha-zoominfo', id: 'eY5rI8N4dDhAVyxlq', kind: 'business', adapter: 'pipeline', phones: true },
  { key: 'peaky', slug: 'peakydev/leads-scraper-ppe', id: 'T1XDXWc1L92AfIJtd', kind: 'business', adapter: 'peaky', phones: true },
  { key: 'pipeline', slug: 'pipelinelabs/lead-scraper-apollo-zoominfo-lusha', id: 'VYRyEF4ygTTkaIghe', kind: 'business', adapter: 'pipeline', phones: true },
  { key: 'brave', slug: 'braveleads/leads-finder-linkedin-apollo-leads-generator', id: 'jGzQBaO651moSvamI', kind: 'business', adapter: 'brave', phones: true, minimumResults: 100 },
  { key: 'bayut', slug: 'memo23/apify-bayut-scraper', id: 'GLe30YgAs5xqzNBQg', kind: 'property', adapter: 'bayut', phones: true, limitation: 'Advertiser/agent contacts, not verified owners. Saudi live URLs only; instant database is UAE.' },
  { key: 'propertyfinder', slug: 'azzouzana/propertyfinder-leads-scraper', id: 'WtGEogxz34rP2TC0R', kind: 'agents', adapter: 'propertyfinder', phones: true, limitation: 'Agent/broker directories, not property ownership records.' },
  { key: 'etimad', slug: 'jungle_synthesizer/etimad-saudi-government-tenders-scraper', id: 'mIxFAQcxn2XZn4Ivx', kind: 'tenders', adapter: 'etimad', phones: false, limitation: 'Public notices only; documents/eligibility and bid submission remain on official Etimad.' },
  { key: 'gathern', slug: 'sian.agency/gathern-property-scraper', id: 'cgGj5l6SPlpKRlu7o', kind: 'rentals', adapter: 'gathern', phones: false, freePlanLimit: 25, limitation: 'Saudi rental units, not Airbnb data or verified owners. No documented phone coverage. FREE plan returns at most 25 units per run.' },
  { key: 'opensooq', slug: 'stealth_mode/opensooq-product-search-scraper', id: 'h3NMsbTYtrHHuMMLe', kind: 'marketplace', adapter: 'opensooq', phones: true, limitation: 'Advertiser phones only when already accessible; no phone-unlocking calls.' },
]);
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const list = v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : typeof v === 'string' && v.trim() ? [v.trim()] : [];
export const fold = v => String(v || '').normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cities = [ ['Riyadh', 'الرياض', 'riyadh'], ['Jeddah', 'جدة', 'jeddah'], ['Dammam', 'الدمام', 'dammam'], ['Khobar', 'الخبر', 'al-khobar'], ['Makkah', 'مكة', 'makkah'], ['Madinah', 'المدينة المنورة', 'madinah'], ['Abha', 'أبها', 'abha'], ['Taif', 'الطائف', 'taif'], ['Tabuk', 'تبوك', 'tabuk'], ['Hail', 'حائل', 'hail'], ['Jazan', 'جازان', 'jazan'] ];
export function cityName(v) { return cities.find(c => c.some(x => fold(x) === fold(v)))?.[0] || String(v || '').trim(); }
function pickCity(text) { return cities.find(c => c.slice(0, 2).some(x => fold(text).includes(fold(x))))?.[0] || ''; }
export function routeIntent(brief) {
  const f = object(brief.filters) ? brief.filters : {};
  const query = String(brief.query || '');
  const target = [query, brief.business?.target, brief.business?.customer].filter(Boolean).join(' ');
  const t = fold(target);
  const urls = target.match(/https:\/\/[^\s<>"']+/g) || [];
  const url = urls.find(u => /(?:bayut\.|propertyfinder\.|gathern\.co|opensooq\.com|zillow\.com)/i.test(u));
  const city = cityName(list(f.companyLocationCityIncludes)[0] || list(f.personLocationCityIncludes)[0] || pickCity(target));
  const district = String(list(f.districtIncludes)[0] || f.district || target.match(/(?:district\s+(?:of\s+)?|حي\s+)([\p{L}\p{N} -]{2,45})/iu)?.[1] || '').split(/\s+(?:in|of|في|بالرياض|بجدة)\s*/i)[0].trim();
  let kind = 'business';
  // Source-specific names are an explicit request, not an LLM-selected Actor.
  if (/etimad|اعتماد|منافسات حكوم|مناقصات حكوم|government tender|government bid/.test(t)) kind = 'tenders';
  else if (/zillow/.test(t)) kind = 'us_agents';
  else if (/gathern|جاذرن|airbnb|اير بي|furnished|مفروش|شاليه|chalet|اجار يومي|short term|vacation rental/.test(t)) kind = 'rentals';
  else if (/propertyfinder|property finder|بروبرتي فايندر|real estate agent|real estate broker|وسيط عقار|وسطاء عقار|وكلاء عقار/.test(t)) kind = 'agents';
  else if (/bayut|بيوت|property owner|real estate owner|ملاك عقار|مالك عقار|ملاك العقار|اصحاب العقار|عقارات للبيع|property listing/.test(t)) kind = 'property';
  else if (/opensooq|open sooq|السوق المفتوح|classified|marketplace seller/.test(t)) kind = 'marketplace';
  const companyOnly = /companies only|company leads only|شركات فقط|قائمه شركات/.test(t) && !/ceo|director|manager|مدير|موظف|مالك|صاحب/.test(t);
  const ownerOnly = /owner|ملاك|مالك|اصحاب العقار/.test(t) && ['property', 'rentals'].includes(kind) && !/listing contacts|agents are fine|advertisers are fine|جهات الاعلان|الوسطاء مناسب/.test(t);
  const noWebsite = /(?:without|no|don't have|do not have|doesn't have|does not have)\s+(?:a\s+)?website|بدون موقع|ليس لديها موقع|لا تملك موقع/.test(t);
  const weakWebsite = /(?:weak|poor|outdated|bad)\s+website|website\s+(?:is\s+)?(?:weak|poor|outdated)|موقع ضعيف|موقع قديم|بموقع ضعيف/.test(t);
  const listingKeyword = query.replace(/\b(?:find me|find|search for|opensooq|open sooq|marketplace|sellers?|listings?|in|saudi arabia)\b/gi,' ').replace(/ابحث عن|ابحث|السوق المفتوح|بائعين|البائعين|اعلانات|إعلانات|السعودية|\bفي\b/g,' ').replace(city ? new RegExp(city,'gi') : /$^/,' ').replace(/\s+/g,' ').trim();
  return { kind, city, district, sourceUrl: url || '', companyOnly, ownerOnly, noWebsite, weakWebsite, keyword: list(f.companyKeywordIncludes).join(' ') || String(f.keyword || listingKeyword).slice(0, 180), target };
}
export function sourcesFor(intent, ultra) {
  if (intent.kind === 'us_agents') throw new Error('Zillow covers US agents, not Saudi leads. This workspace currently sources Saudi targets.');
  if (intent.kind === 'rentals' && ultra) throw new Error('Gathern provides Saudi rental-property data but no documented owner phones. Ultra cannot promise phone-qualified owners from this source.');
  if (intent.ownerOnly) throw new Error('These property sources identify advertisers/agents, not verified owners. Confirm that listing contacts are acceptable, or provide a source explicitly identifying owners.');
  if (intent.kind === 'rentals' && !intent.city) throw new Error('Which Saudi city should the rental-property search cover?');
  return CURATED_SOURCES.filter(s => s.kind === intent.kind);
}
export function currentPrice(actor, now = Date.now()) {
  return actor.currentPricingInfo || [...(actor.pricingInfos || [])].filter(p => Date.parse(p.startedAt) <= now).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
}
// Conservative documented FREE-tier event estimate, never the paid-plan headline.
export function curatedCost(actor, source, count, ultra, memoryMbytes = 1024) {
  const price = currentPrice(actor);
  const minimumUsd = Number(price?.minimalMaxTotalChargeUsd || 0);
  if (!price || !Number.isFinite(minimumUsd) || minimumUsd < 0) return null;
  if (price.pricingModel === 'PRICE_PER_DATASET_ITEM') {
    if (typeof price.pricePerUnitUsd !== 'number' || !Number.isFinite(price.pricePerUnitUsd) || price.pricePerUnitUsd < 0) return null;
    return { minimumUsd, estimateUsd: Math.max(minimumUsd, price.pricePerUnitUsd * Math.max(count, source.minimumResults || 0)), pricingModel: price.pricingModel };
  }
  if (price.pricingModel !== 'PAY_PER_EVENT') return null;
  let estimate = 0;
  const events = price.pricingPerEvent?.actorChargeEvents;
  if (!object(events) || !Object.keys(events).length) return null;
  for (const [key, event] of Object.entries(events)) {
    const unit = event.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd ?? event.eventPriceUsd;
    if (!Number.isFinite(unit) || unit < 0) return null;
    if (key === 'apify-actor-start') estimate += unit * Math.max(1, memoryMbytes / 1024);
    else if (event.isPrimaryEvent || /lead|result|rentalunit|data-record|dataset-item/i.test(key)) estimate += unit * Math.max(count, source.minimumResults || 0);
    else if (!['bayut', 'zillow'].includes(source.adapter)) return null;
    // Bayut optional DLD/monitoring/db events are explicitly disabled by adapter.
  }
  if (source.adapter === 'micro' && ultra) estimate += .01 * count;
  return { minimumUsd, estimateUsd: Math.max(minimumUsd, estimate), pricingModel: price.pricingModel };
}
const countryAliases = { 'saudi arabia': 'Saudi Arabia', 'السعوديه': 'Saudi Arabia', 'ksa': 'Saudi Arabia', 'sa': 'Saudi Arabia' };
const seniorityAliases = { 'c level': 'c_suite', 'c suite': 'c_suite' };
const functionAliases = { 'human resources': 'human_resources', 'hr': 'human_resources', 'it': 'information_technology', 'business development': 'business_development' };
const roleGroups = {
  CEO: ['CEO','Chief Executive Officer','مدير تنفيذي','المدير التنفيذي','رئيس تنفيذي','الرئيس التنفيذي'],
  Founder: ['Founder','مؤسس','المؤسس'],
  'Co-Founder': ['CoFounder','Co-Founder','Co Founder','شريك مؤسس','الشريك المؤسس'],
  Owner: ['Owner','مالك','المالك','صاحب شركة','صاحب الشركة','مالك الشركة','صاحب مؤسسة','صاحب المؤسسة','مالك المؤسسة','صاحب منشأة','صاحب المنشأة','مالك المنشأة'],
  'General Manager': ['General Manager','مدير عام','المدير العام'],
  'Sales Manager': ['Sales Manager','مدير مبيعات','مدير المبيعات'],
  'Business Development Manager': ['Business Development Manager','مدير تطوير أعمال','مدير تطوير الأعمال'],
};
const roleAliases = Object.fromEntries(Object.entries(roleGroups).flatMap(([name, values]) => values.map(value => [fold(value), name])));
const industryAliases = {
  'marketing agency': 'Marketing & Advertising', 'marketing agencies': 'Marketing & Advertising', 'marketing': 'Marketing & Advertising', 'وكالات التسويق': 'Marketing & Advertising', 'وكاله تسويق': 'Marketing & Advertising',
  'marketing and advertising': 'Marketing & Advertising', 'marketing advertising': 'Marketing & Advertising', 'التسويق والاعلان': 'Marketing & Advertising', 'تسويق واعلان': 'Marketing & Advertising',
  'digital marketing': 'Marketing & Advertising', 'التسويق الرقمي': 'Marketing & Advertising',
  'public relations and communications': 'Public Relations & Communications',
  dental: 'Dental', dentistry: 'Dental', dentist: 'Dental', dentists: 'Dental', 'dental clinic': 'Dental', 'dental clinics': 'Dental', 'dental practice': 'Dental', 'dental practices': 'Dental',
  'عيادات الاسنان': 'Dental', 'عيادات اسنان': 'Dental', 'عياده الاسنان': 'Dental', 'عياده اسنان': 'Dental', 'طب الاسنان': 'Dental', 'اطباء الاسنان': 'Dental',
  hospital: 'Hospital', hospitals: 'Hospital', 'مستشفى': 'Hospital', 'مستشفيات': 'Hospital',
  'hospital health care': 'Hospital & Health Care', 'hospital and health care': 'Hospital & Health Care', 'hospitals and health care': 'Hospital & Health Care',
};
const canonical = (v, key = '') => {
  const value = fold(v);
  if (/industry/i.test(key)) return industryAliases[value] || v;
  if (/country/i.test(key)) return countryAliases[value] || v;
  if (/city|cities|company_locations/i.test(key)) return countryAliases[value] || cityName(v);
  if (/seniority/i.test(key)) return seniorityAliases[value] || v;
  if (/function|department/i.test(key)) return functionAliases[value] || v;
  if (/personTitle|contact_job|excludeTitle|^role$/i.test(key)) return roleAliases[value] || seniorityAliases[value] || v;
  return v; // Names, domains and keywords are literal customer data.
};
const sameSchemaValue = (choice, value, key) => fold(choice) === fold(value) || fold(canonical(choice, key)) === fold(canonical(value, key));
function employeeRange(value) {
  const v = String(value).replace(/,/g, '').trim();
  const match = v.match(/^(\d+)\s*(?:-\s*(\d+)|(\+))?$/);
  return match ? [Number(match[1]), match[3] ? Infinity : Number(match[2] || match[1])] : null;
}
// Schema minimums are authoritative; never shrink below one to fit a budget.
export function sourceMinimumResults(source, schema) {
  const key = source.adapter === 'pipeline' || source.adapter === 'peaky' ? 'totalResults'
    : source.adapter === 'micro' ? 'max_result' : source.adapter === 'brave' ? 'maxResults'
    : source.adapter === 'opensooq' ? 'max_items_per_url' : 'maxItems';
  return Math.max(1, source.minimumResults || 1, Number(schema?.properties?.[key]?.minimum) || 1);
}
export function schemaInput(input, schema) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    const spec = schema.properties?.[key];
    if (!spec) throw new Error(`Source does not support requested filter: ${key}.`);
    const convert = x => {
      const v = canonical(x, key), choices = spec.enum || spec.items?.enum;
      if (!choices) return v;
      const match = choices.find(c => fold(c) === fold(x)) ?? choices.find(c => sameSchemaValue(c, v, key));
      if (match === undefined) throw new Error(`Unsupported ${key} value: ${String(x).slice(0, 60)}.`);
      return match;
    };
    output[key] = Array.isArray(value) ? [...new Set(value.map(convert))] : typeof value === 'string' ? convert(value) : value;
  }
  for (const key of schema.required || []) if (output[key] === undefined) throw new Error(`Source requires ${key}.`);
  return output;
}
function sourceUrl(value, domain, defaultValue) {
  const u = new URL(value || defaultValue);
  if (u.protocol !== 'https:' || u.username || u.password || !domain.test(u.hostname)) throw new Error('Use a public HTTPS search URL on the selected Saudi source.');
  return u.href;
}
export function buildSourceInput(source, brief, intent, count, ultra, schema, postFilters = []) {
  const f = object(brief.filters) ? brief.filters : {};
  const input = {};
  const set = (key, v) => { if (v !== undefined && v !== '' && (!Array.isArray(v) || v.length)) input[key] = v; };
  const roles = list(f.personTitleIncludes).length ? list(f.personTitleIncludes) : /ceo|chief executive/.test(fold(intent.target)) ? ['CEO'] : /sales manager|مدير مبيعات/.test(fold(intent.target)) ? ['Sales Manager'] : [];
  if (count < sourceMinimumResults(source, schema)) throw new Error('Requested source batch is below its documented minimum.');
  if (source.adapter === 'pipeline') {
    // Known target-filter fields only: never pass provider controls from the client.
    for (const [key, value] of Object.entries(f)) if (/^(?:personTitle|seniority|function|personFirstName|personLastName|personLocation|companyName|companyIndustry|companyKeyword|companySize|companyDomain|companyLocation|annualRevenue|fundingStage|technologies|emailStatus)(?:Includes|Excludes)$/.test(key)) set(key, value);
    set('personTitleIncludes', roles);
    input.companyLocationCountryIncludes = ['Saudi Arabia'];
    if (intent.city) input.companyLocationCityIncludes = [intent.city];
    input.totalResults = count;
    input.hasPhone = ultra;
    if (schema.properties.hasEmail) input.hasEmail = list(f.emailStatusIncludes).length > 0;
    if (Array.isArray(input.functionIncludes) && input.functionIncludes.some(v => fold(v) === 'executive')) {
      // Legacy intake used a department label where the vendor expects a function.
      input.functionIncludes = input.functionIncludes.filter(v => fold(v) !== 'executive');
      if (!input.functionIncludes.length) delete input.functionIncludes;
      if (!list(input.seniorityIncludes).length) input.seniorityIncludes = ['c_suite'];
    }
    input.roleMatchMode = 'any';
    input.companyMatchMode = 'all';
    // A wildcard exclusion is not a supported "no website" filter.
    if (list(input.companyDomainExcludes).some(v => /[*?]/.test(v))) {
      delete input.companyDomainExcludes;
      postFilters.push({ key: 'websitePresence', values: ['not_recorded'], enforcement: 'Check the source website/domain field; never treat missing data as verified absence.' });
    }
    // Company-only rows require a company-mode source, not invented employees.
    if (intent.companyOnly) throw new Error('This source returns people; a company-mode adapter is required.');
  } else if (['peaky', 'brave', 'micro'].includes(source.adapter)) {
    const micro = source.adapter === 'micro';
    set(micro ? 'contact_job_titles' : 'personTitle', roles);
    set(micro ? 'contact_job_not_titles' : 'excludeTitle', list(f.personTitleExcludes));
    set(micro ? 'company_industry' : 'industry', list(f.companyIndustryIncludes));
    set(micro ? 'company_not_industry' : 'excludeIndustry', list(f.companyIndustryExcludes));
    set(micro ? 'keywords' : 'webKeywords', list(f.companyKeywordIncludes));
    set(micro ? 'company_domains' : 'companyDomain', list(f.companyDomainIncludes));
    set(micro ? 'company_locations' : 'companyCountry', micro ? [intent.city || 'Saudi Arabia'] : ['Saudi Arabia']);
    if (intent.city && !micro) {
      if (schema.properties.companyCity) input.companyCity = [intent.city];
      else postFilters.push({key:'companyLocationCityIncludes',values:[intent.city],operator:'any',enforcement:'Require explicit requested-city evidence in the returned record; reject missing or different city.'});
    }
    if (!micro) set('seniority', list(f.seniorityIncludes));
    if (micro) input.include_mobile = ultra;
    if (intent.companyOnly) {
      if (micro) throw new Error('This source has no company-only mode.');
      input[source.adapter === 'peaky' ? 'companyMode' : 'onlycompany'] = true;
    }
    // Do not silently discard more restrictive target filters when translating.
    const supported = new Set(['personTitleIncludes','personTitleExcludes','companyIndustryIncludes','companyIndustryExcludes','companyKeywordIncludes','companyDomainIncludes','companyLocationCountryIncludes','companyLocationCityIncludes','seniorityIncludes','searchStringsArray']);
    for (const [key, value] of Object.entries(f)) if (list(value).length && !supported.has(key)) postFilters.push({ key, values: value, enforcement: 'Require evidence in relevance review; reject when missing.' });
    input[micro ? 'max_result' : source.adapter === 'peaky' ? 'totalResults' : 'maxResults'] = count;
  } else if (source.adapter === 'bayut') {
    const city = cities.find(c => c[0] === intent.city)?.[2];
    if (intent.city && !city && !intent.sourceUrl) throw new Error('Provide a Bayut.sa search URL for this city.');
    input.startUrls = [sourceUrl(intent.sourceUrl, /^(?:www\.)?bayut\.sa$/, `https://www.bayut.sa/en/for-sale/property/${city || 'saudi-arabia'}/`)];
    input.maxItems = count; input.fullDetails = true; input.enrichEmails = false;
    input.instantDatabase = false; input.enrichDld = false; input.monitoringMode = false;
    input.maxConcurrency = 1; input.maxRequestRetries = 0;
  } else if (source.adapter === 'propertyfinder') {
    input.startUrl = sourceUrl(intent.sourceUrl, /^(?:www\.)?propertyfinder\.sa$/, 'https://www.propertyfinder.sa/en/find-agent/search');
    input.maxItems = count;
  } else if (source.adapter === 'gathern') {
    input.searchMode = 'byCity'; input.cities = [intent.city]; input.maxResults = count; input.maxPages = 3; input.lang = 'ar';
  } else if (source.adapter === 'opensooq') {
    input.region = 'sa'; input.keyword = intent.keyword; input.max_items_per_url = count; input.page = 1; input.sort_by = 'recent';
    if (intent.sourceUrl) input.urls = [sourceUrl(intent.sourceUrl, /^(?:www\.)?sa\.opensooq\.com$/, '')];
  } else if (source.adapter === 'etimad') input.maxItems = count;
  else throw new Error('No approved Saudi adapter exists for this source.');
  // A specific dental request must not become a city-wide owner search when
  // the provider offers only broad medical industry enums. Use its documented
  // keyword filter as a retrieval hint; strict dental evidence is still required.
  if (list(f.companyIndustryIncludes).some(value => canonical(value, 'industry') === 'Dental')) {
    const industryKey = source.adapter === 'pipeline' ? 'companyIndustryIncludes' : source.adapter === 'micro' ? 'company_industry' : 'industry';
    const keywordKey = source.adapter === 'pipeline' ? 'companyKeywordIncludes' : source.adapter === 'micro' ? 'keywords' : 'webKeywords';
    const choices = schema.properties?.[industryKey]?.items?.enum || schema.properties?.[industryKey]?.enum;
    if (choices && !choices.some(choice => sameSchemaValue(choice, 'Dental', industryKey)) && schema.properties?.[keywordKey] && !list(input[keywordKey]).length) input[keywordKey] = ['dental'];
  }
  // Broad customer labels (e.g. "agency") are not provider industry enums.
  // Keep their exact post-filter, but use a native keyword retrieval hint rather
  // than fetching unrelated city-wide records. Never AND one unknown OR branch
  // onto other supported alternatives.
  const industryKey = source.adapter === 'pipeline' ? 'companyIndustryIncludes' : source.adapter === 'micro' ? 'company_industry' : 'industry';
  const keywordKey = source.adapter === 'pipeline' ? 'companyKeywordIncludes' : source.adapter === 'micro' ? 'keywords' : 'webKeywords';
  const industryValues = list(input[industryKey]);
  const industryChoices = schema.properties?.[industryKey]?.items?.enum || schema.properties?.[industryKey]?.enum;
  if (industryValues.length && industryChoices && industryValues.every(v => !industryChoices.some(c => sameSchemaValue(c, v, industryKey)))
    && schema.properties?.[keywordKey] && !list(input[keywordKey]).length) input[keywordKey] = industryValues.map(v => /^(agency|agencies|وكاله|وكالات)$/u.test(fold(v)) ? 'agency' : String(v));
  // Translate overlapping employee buckets for retrieval and retain the original
  // range for exact record review (50+ must not silently become 51+).
  const sizeSpec = schema.properties?.companySizeIncludes;
  const sizeChoices = sizeSpec?.items?.enum || sizeSpec?.enum;
  if (sizeChoices && list(input.companySizeIncludes).some(v => !sizeChoices.some(c => sameSchemaValue(c, v, 'companySizeIncludes')))) {
    const original = list(input.companySizeIncludes), ranges = original.map(employeeRange);
    if (ranges.every(Boolean)) {
      const expanded = sizeChoices.filter(c => { const r = employeeRange(c); return r && ranges.some(v => r[0] <= v[1] && v[0] <= r[1]); });
      if (expanded.length && ranges.every(v => sizeChoices.some(c => { const r = employeeRange(c); return r && r[0] <= v[1] && v[0] <= r[1]; }))) {
        input.companySizeIncludes = expanded;
        postFilters.push({ key: 'companySizeIncludes', values: original, operator: 'any', enforcement: 'Require original employee range using companySize/companySizeRange; overlapping buckets alone do not prove an exact boundary.' });
      }
    }
  }
  // A provider lacking a filter is not permission to widen the saved target:
  // preserve that constraint explicitly for the separate record-level review.
  for (const [key, value] of Object.entries(input)) {
    const spec = schema.properties?.[key];
    if (!spec) {
      if (Array.isArray(value) && !value.length) { delete input[key]; continue; }
      throw new Error(`Source does not support requested filter: ${key}.`);
    }
    const choices = spec.enum || spec.items?.enum;
    if (choices && Array.isArray(value)) {
      const missing = value.filter(v=>!choices.some(c=>sameSchemaValue(c, v, key)));
      if (missing.length) {
        const exclusion = /excludes|exclude|not_/i.test(key);
        // Includes are alternatives: do not turn (A OR B) into (A AND B).
        postFilters.push({ key, values: exclusion ? missing : value, operator: exclusion ? 'none' : 'any', enforcement: exclusion ? 'Exclude these values when evidenced; do not silently discard exclusions.' : 'Require evidence for ANY ONE requested alternative, not all of them; reject missing evidence.' });
        if (exclusion) { input[key] = value.filter(v=>!missing.includes(v)); if (!input[key].length) delete input[key]; }
        else delete input[key];
      }
    }
  }
  return schemaInput(input, schema);
}
export function normalizePhone(value) {
  let phone = String(value || '').replace(/[()\s.\-]/g, '');
  if (/^05\d{8}$/.test(phone)) phone = `+966${phone.slice(1)}`;
  if (/^00[1-9]\d{7,14}$/.test(phone)) phone = `+${phone.slice(2)}`;
  return /^\+?[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
export function recordPhones(record) {
  const found = [];
  const add = (v, label) => {
    if (Array.isArray(v)) return v.slice(0, 20).forEach(item => add(item, label));
    if (object(v)) return Object.entries(v).forEach(([k, val]) => { if (/number|phone|mobile|cell|whatsapp/i.test(k)) add(val, `${label} ${k}`); });
    if (!['string', 'number'].includes(typeof v)) return;
    const number = normalizePhone(v);
    if (number && !found.some(p => p.number === number)) found.push({ number, label: /proxy/i.test(label) ? 'Listing relay' : /whatsapp/i.test(label) ? 'WhatsApp' : /cell|mobile/i.test(label) ? 'Mobile' : 'Phone' });
  };
  const visit = (v, depth = 0) => {
    if (!object(v) || depth > 5) return;
    for (const [key, item] of Object.entries(v)) {
      if (/reveal|token|key|has.?phone|count|verified/i.test(key)) continue;
      if (/phone|mobile|cell|whatsapp/i.test(key)) add(item, key);
      else if (object(item)) visit(item, depth + 1);
    }
  };
  visit(record);
  return found.slice(0, 12);
}
function get(record, paths) { for (const path of paths) { const v = path.split('.').reduce((o, k) => o?.[k], record); if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function fieldStrings(value, depth = 0) {
  if (depth > 3) return [];
  if (typeof value === 'string') return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(v => fieldStrings(v, depth + 1));
  if (object(value)) return ['name', 'label', 'industry', 'industries', 'primary', 'secondary'].flatMap(k => fieldStrings(value[k], depth + 1));
  return [];
}
export function recordIndustry(record) {
  return [...new Set([record.industry, record.companyIndustry, record.company_industry, record.organization_industry, record.organization_industries, record.company?.industry, record.organization?.industry].flatMap(v => fieldStrings(v)))].join(', ');
}
export function recordMatchesIndustry(record, filters = {}) {
  const industry = fold(recordIndustry(record).split(',').map(value => canonical(value.trim(), 'industry')).join(', '));
  const dentalEvidence = fold([
    recordIndustry(record), record.name, record.companyName, record.company_name, record.company, record.organization,
    record.companySpecialties, record.company_specialties, record.organization_specialties, record.specialties, record.company?.specialties, record.organization?.specialties,
    record.companyDescription, record.company_description, record.organization_description, record.description, record.company?.description, record.organization?.description,
  ].flatMap(value => fieldStrings(value)).join(' '));
  const entityEvidence = fold([record.companyName, record.company_name, record.company?.name, record.organization?.name, record.companyDescription, record.company_description, record.company?.description].flatMap(value => fieldStrings(value)).join(' '));
  const match = value => fold(canonical(value, 'industry')) === 'dental'
    ? /(?:^| )(?:dental|dentistry|dentists?)(?: |$)|(?:^| )(?:ال)?اسنان(?: |$)/u.test(dentalEvidence)
    : canonical(value, 'industry') === 'Hospital' ? /(?:^| )(?:hospitals?|مستشفي|مستشفيات|المستشفي)(?: |$)/u.test(entityEvidence)
    : /^(agency|agencies|وكاله|وكالات)$/u.test(fold(value)) ? /(?:^| )(?:agency|agencies|وكاله|وكالات|الوكاله|الوكالات)(?: |$)/u.test(`${industry} ${dentalEvidence}`)
    : industry.includes(fold(canonical(value, 'industry')));
  const include = list(filters.companyIndustryIncludes), exclude = list(filters.companyIndustryExcludes);
  return Boolean((!include.length || include.some(match)) && exclude.every(value =>
    (fold(canonical(value, 'industry')) === 'dental' ? dentalEvidence : canonical(value, 'industry') === 'Hospital' ? entityEvidence && (industry || match('Dental')) : industry) && !match(value)));
}
export function recordMatchesRole(record, filters = {}) {
  const title = fold(get(record, ['job_title','jobTitle','title','position','headline']));
  const variants = value => {
    const role = fold(value);
    const group = roleAliases[role];
    if (group === 'Founder') return [...roleGroups.Founder, ...roleGroups['Co-Founder']].map(fold);
    // A specific co-founder request must not broaden to every sole founder.
    if (group) return roleGroups[group].map(fold);
    return [role];
  };
  const match = value => variants(value).some(role => {
    const padded = ` ${title} `;
    // Arabic joins "and" to the next role (e.g. "والمدير التنفيذي").
    // Match only whole known phrases, never arbitrary substrings or acronyms.
    return padded.includes(` ${role} `) || /^[\u0600-\u06ff]/u.test(role) && padded.includes(` و${role} `);
  });
  const include = list(filters.personTitleIncludes), exclude = list(filters.personTitleExcludes);
  return Boolean((!include.length || (title && include.some(match))) && (!exclude.length || (title && !exclude.some(match))));
}
export function geoText(record) {
  const result = [];
  const walk = (v, depth = 0, geo = false) => {
    if (depth > 7) return;
    if (typeof v === 'string' && geo) result.push(v);
    else if (Array.isArray(v)) v.forEach(x => walk(x, depth + 1, geo));
    else if (object(v)) for (const [k, x] of Object.entries(v)) walk(x, depth + 1, geo || /country|city|address|location|region|district|neigh|nhood|market|tender_area|execution_place/i.test(k));
  };
  walk(record);
  return result.join(' ');
}
export function recordMatchesGeo(record, intent) {
  const g = fold(geoText(record));
  const saudi = /saudi|السعوديه|\bksa\b|\bsa\b/.test(g) || cities.some(c => c.slice(0, 2).some(x => g.includes(fold(x))));
  if (!saudi) return false;
  const aliases = cities.find(c => c[0] === intent.city)?.slice(0, 2) || [intent.city];
  return (!intent.city || aliases.some(c => g.includes(fold(c)))) && (!intent.district || g.includes(fold(intent.district)));
}
export function normalizeSourceRecord(record, source, intent, ultra) {
  if (!object(record) || !recordMatchesGeo(record, intent)) return null;
  const phones = recordPhones(record);
  if (ultra && !phones.length) return null;
  const property = ['bayut', 'gathern', 'opensooq'].includes(source.adapter);
  const company = get(record, ['company.name','company_name','companyName','organization.name','organization_name','organizationName','agency.name','agencyName','broker.name','company']);
  const first = get(record, ['first_name','firstName']), last = get(record, ['last_name','lastName']);
  const name = get(record, property ? ['contactName','agentName','agent.name','seller.name','member_display_name','member_user_name','User Name','Seller Name','name','propertyTitle','title','Title'] : ['full_name','fullName','name','person_name','personName','contactName']) || [first,last].filter(Boolean).join(' ') || company;
  if (!name) return null;
  const domain = get(record, ['company.website','company_website','companyWebsite','companyDomain','company_domain','organization.website_url','organization.website','organization_website_url','organization_primary_domain','website','website_url']);
  const website = domain && !/^https?:\/\//i.test(domain) ? `https://${domain}` : domain;
  if (intent.noWebsite && website) return null;
  // A directory cannot establish website quality. For an OR request, only the
  // missing-record branch is supported, explicitly labelled as unverified.
  if (intent.weakWebsite && !intent.noWebsite) return null;
  let source_reference = get(record, ['url','URL','listingUrl','listing_url','profileUrl','profile_url','source_url']);
  if (!source_reference && source.adapter === 'opensooq' && /^\/search\/\d+$/.test(record.post_url || '')) source_reference = `https://sa.opensooq.com${record.post_url}`;
  return { name, company: company || name,
    title: property ? source.adapter === 'gathern' ? 'Rental listing' : source.adapter === 'opensooq' ? 'Marketplace advertiser' : 'Property listing contact' : get(record, ['job_title','jobTitle','title','position','headline']) || (source.adapter === 'propertyfinder' ? 'Real estate agent / broker' : ''),
    email: get(record, ['email','work_email','workEmail','emailAddress','agentEmail','contact.email']), phone: phones[0]?.number || null, phone_numbers: phones,
    website, linkedin_url: get(record, ['linkedin_url','linkedinUrl','linkedin','person.linkedin_url']),
    location: intent.city || geoText(record).slice(0,200), industry: recordIndustry(record) || (property ? 'Property / marketplace listing' : ''),
    source_reference, source_actor: source.slug, contact_kind: source.kind === 'business' ? 'business_contact' : source.adapter === 'gathern' ? 'rental_listing' : 'advertiser_or_agent',
    reason: intent.noWebsite ? 'No company website recorded in this source; absence and buying need are not independently verified.' : source.limitation || 'Matches the requested source and location; buying need is not verified.' };
}
export function normalizeTender(record, now = Date.now()) {
  if (!object(record)) return null;
  const url = get(record, ['tender_url','url']);
  try { const u = new URL(url); if (u.protocol !== 'https:' || u.hostname !== 'tenders.etimad.sa') return null; } catch { return null; }
  const deadline = get(record, ['submission_deadline']);
  const parsed = Date.parse(deadline && !/[zZ]|[+-]\d\d:\d\d$/.test(deadline) ? `${deadline}+03:00` : deadline);
  if (!Number.isFinite(parsed) || parsed <= now) return null;
  return { title: get(record, ['tender_name']), agency: get(record, ['agency_name']), activity: get(record, ['tender_activity']), location: get(record, ['execution_place','tender_area']), deadline, reference: get(record, ['reference_number','tender_number']), url, bookletPrice: record.condition_booklet_price ?? null, requiredDocuments: list(record.required_documents).slice(0,20) };
}

export function tenderMatchesBrief(tender, brief) {
  const requested = fold(`${brief.query || ''} ${brief.business?.offer || ''}`);
  const available = fold(`${tender.title} ${tender.activity}`);
  const groups = [ /construction|contracting|مقاولات|تشييد|انشاءات/, /cleaning|نظافه/, /maintenance|صيانه/, /electrical|كهرباء/, /software|information technology|برمج|تقنيه المعلومات/ ];
  const matchers = [ /construction|مقاول|تشييد|انشاء|بناء|ترميم/, /cleaning|نظافه/, /maintenance|صيانه/, /electrical|كهرباء/, /software|برمج|تقنيه المعلومات|انظمه رقميه/ ];
  const group = groups.findIndex(pattern=>pattern.test(requested));
  return group < 0 || matchers[group].test(available);
}
