// Source-side filters are not proof that a returned record actually satisfies
// the customer's brief. Keep this check conservative and fail closed.
const normalized = (value) => String(value || '')
  .normalize('NFKC').toLocaleLowerCase('en')
  .replace(/[\u064b-\u065f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim().replace(/\s+/g, ' ');

const phrases = (values) => Array.isArray(values)
  ? values.map(normalized).filter(Boolean)
  : [];

function includesPhrase(haystack, needle) {
  return (` ${haystack} `).includes(` ${needle} `);
}

export function classifyUltraLead(item, input) {
  const companyCategory = normalized([
    item.companyName, item.company_name, item.companyIndustry, item.industry,
  ].filter(Boolean).join(' '));
  const companyText = normalized([companyCategory, item.companyDescription, item.company_description].filter(Boolean).join(' '));
  const titleText = normalized([item.job_title, item.position, item.personTitle].filter(Boolean).join(' '));
  const industryTargets = phrases(input.companyIndustryIncludes);
  const keywordTargets = phrases(input.companyKeywordIncludes);
  const companyTargets = phrases(input.companyNameIncludes);
  const titleTargets = phrases(input.personTitleIncludes);
  const personCity = normalized(item.personCity || item.person_city);
  const companyCity = normalized(item.companyCity || item.company_city);
  const excludedCompanies = [...phrases(input.companyIndustryExcludes), ...phrases(input.companyKeywordExcludes), ...phrases(input.companyNameExcludes)];
  const excludedTitles = phrases(input.personTitleExcludes);

  if (excludedCompanies.some((term) => includesPhrase(companyText, term))) return 'excluded';
  if (excludedTitles.some((term) => includesPhrase(titleText, term))) return 'excluded';
  if (industryTargets.length && !industryTargets.some((term) => includesPhrase(companyCategory, term))) return 'related';
  if (keywordTargets.length && !keywordTargets.some((term) => includesPhrase(companyCategory, term))) return 'related';
  if (companyTargets.length && !companyTargets.some((term) => includesPhrase(normalized(item.companyName || item.company_name), term))) return 'related';
  if (titleTargets.length && !titleTargets.some((term) => includesPhrase(titleText, term))) return 'related';
  if (phrases(input.personLocationCityIncludes).length && !phrases(input.personLocationCityIncludes).includes(personCity)) return 'related';
  if (phrases(input.companyLocationCityIncludes).length && !phrases(input.companyLocationCityIncludes).includes(companyCity)) return 'related';
  return 'exact';
}
