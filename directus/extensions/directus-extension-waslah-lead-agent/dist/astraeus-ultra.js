export const ASTRAEUS_ULTRA_ACTOR_ID = 'VYRyEF4ygTTkaIghe';
let schemaCache = null;
let schemaCachedAt = 0;

export async function getAstraeusUltraSchema(token) {
  if (schemaCache && Date.now() - schemaCachedAt < 6 * 60 * 60 * 1000) return schemaCache;
  if (!token) throw new Error('Astraeus Ultra sourcing is not configured.');
  const response = await fetch(`https://api.apify.com/v2/actors/${ASTRAEUS_ULTRA_ACTOR_ID}/builds/default`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Astraeus Ultra filter definitions are unavailable (${response.status}).`);
  const payload = await response.json();
  const raw = payload?.data?.inputSchema;
  const schema = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!schema || typeof schema.properties !== 'object' || !schema.properties.hasPhone || !schema.properties.personLocationCountryIncludes) {
    throw new Error('Astraeus Ultra filter definitions are invalid.');
  }
  schemaCache = schema;
  schemaCachedAt = Date.now();
  return schema;
}

const ENUMS = {
  seniorityIncludes: ['c_suite', 'vp', 'director', 'manager', 'senior', 'entry', 'owner', 'partner', 'intern'],
  seniorityExcludes: ['c_suite', 'vp', 'director', 'manager', 'senior', 'entry', 'owner', 'partner', 'intern'],
  functionIncludes: ['engineering', 'sales', 'marketing', 'finance', 'operations', 'human_resources', 'information_technology', 'business_development', 'support', 'education', 'consulting'],
  functionExcludes: ['engineering', 'sales', 'marketing', 'finance', 'operations', 'human_resources', 'information_technology', 'business_development', 'support', 'education', 'consulting'],
  companySizeIncludes: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'],
  companySizeExcludes: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'],
  annualRevenueIncludes: ['lt_1m', '1m_10m', '10m_50m', '50m_200m', '200m_1b', 'gt_1b'],
  annualRevenueExcludes: ['lt_1m', '1m_10m', '10m_50m', '50m_200m', '200m_1b', 'gt_1b'],
};

const LIST_FIELDS = new Set([
  'personTitleIncludes', 'personTitleExcludes', 'seniorityIncludes', 'seniorityExcludes',
  'functionIncludes', 'functionExcludes', 'personLocationCityIncludes', 'personLocationCityExcludes',
  'personLocationStateIncludes', 'personLocationStateExcludes',
  'companyNameIncludes', 'companyNameExcludes', 'companyIndustryIncludes', 'companyIndustryExcludes',
  'companyKeywordIncludes', 'companyKeywordExcludes', 'companySizeIncludes', 'companySizeExcludes',
  'companyLocationCityIncludes', 'companyLocationCityExcludes', 'companyLocationStateIncludes', 'companyLocationStateExcludes',
  'companyLocationCountryIncludes', 'annualRevenueIncludes', 'annualRevenueExcludes',
  'fundingStageIncludes', 'fundingStageExcludes', 'technologiesIncludes', 'technologiesExcludes',
  'companyDomainIncludes', 'companyDomainExcludes', 'emailStatusIncludes', 'emailStatusExcludes',
]);

const stringList = (value) => Array.isArray(value)
  ? [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, 8).map((item) => item.slice(0, 100))
  : [];

export function buildAstraeusUltraInput(raw, count, actorSchema = null) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const properties = actorSchema?.properties || null;
  const input = {};
  for (const field of LIST_FIELDS) {
    const values = stringList(source[field]);
    if (!values.length) continue;
    const allowed = properties?.[field]?.items?.enum || ENUMS[field] || null;
    const accepted = allowed
      ? values.map((value) => allowed.find((choice) => String(choice).toLowerCase() === value.toLowerCase())).filter(Boolean)
      : values;
    if (accepted.length) input[field] = [...new Set(accepted)];
  }
  if (input.companyLocationCountryIncludes?.length) {
    input.companyLocationCountryIncludes = input.companyLocationCountryIncludes.filter((country) => country === 'Saudi Arabia');
    if (!input.companyLocationCountryIncludes.length) delete input.companyLocationCountryIncludes;
  }
  for (const field of ['companyEmployeeMin', 'companyEmployeeMax']) {
    const value = Number(source[field]);
    if (Number.isSafeInteger(value) && value > 0 && value <= 1_000_000) input[field] = value;
  }
  // An unmatched industry label can still be a useful company-description keyword;
  // dropping it outright would silently turn a precise search into a broad one.
  if (properties?.companyIndustryIncludes?.items?.enum) {
    const accepted = new Set(input.companyIndustryIncludes || []);
    const extra = stringList(source.companyIndustryIncludes).filter((value) => ![...accepted].some((match) => match.toLowerCase() === value.toLowerCase()));
    if (extra.length) input.companyKeywordIncludes = [...new Set([...(input.companyKeywordIncludes || []), ...extra])].slice(0, 8);
  }
  input.personLocationCountryIncludes = ['Saudi Arabia'];
  input.hasEmail = true;
  input.hasPhone = true;
  input.roleMatchMode = 'all';
  input.companyMatchMode = 'all';
  input.companyNameMatchMode = 'phrase';
  input.companyKeywordMode = 'phrase';
  input.companyDomainMatchMode = 'strict';
  input.totalResults = Math.max(1, Math.min(200, Math.trunc(Number(count) || 1)));
  input.countOnly = false;
  input.resetProgress = false;
  input.dontSaveProgress = false;
  return input;
}

export function astraeusUltraMissing(input, { productDescription = '', productOutcome = '', fast = false } = {}) {
  const missing = [];
  if (!fast && (!productDescription.trim() || !productOutcome.trim())) missing.push('product and customer outcome');
  if (!input.companyIndustryIncludes?.length && !input.companyKeywordIncludes?.length && !input.companyNameIncludes?.length && !input.companyDomainIncludes?.length) missing.push('target company type or industry');
  if (!input.personTitleIncludes?.length && !input.seniorityIncludes?.length && !input.functionIncludes?.length) missing.push('decision-maker role');
  return missing;
}

export function isSaudiAstraeusUltraLead(item) {
  if (item?.rowType && item.rowType !== 'lead') return false;
  if (item?.recordType && item.recordType !== 'lead') return false;
  const country = String(item?.personCountry || item?.person_country || '').trim().toLowerCase();
  const phone = String(item?.phone || item?.mobile_number || item?.phone_number || '').trim();
  const email = String(item?.email || item?.personal_email || '').trim();
  return ['saudi arabia', 'السعودية', 'المملكة العربية السعودية', 'ksa'].includes(country)
    && Boolean(phone) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
