import assert from 'node:assert/strict';
import { sourceReadiness } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/source-readiness.js';

const ready = (query, options = { ultra: true, language: 'en' }) => sourceReadiness({ query }, options);
assert.equal(ready('Find marketing agency founders in Riyadh'), null);
assert.equal(ready('Find marketing agency founders in Riyadh without a website'), null);
assert.equal(ready('Find marketing agencies without a website or with a weak website in Riyadh').code, 'website_condition_choice');
assert.equal(ready('وكالات التسويق في الرياض بدون موقع أو بموقع ضعيف', { ultra: true, language: 'ar' }).code, 'website_condition_choice');
assert.equal(ready('شركات في الرياض ما عندها مواقع أو مواقعها قديمة').code, 'website_condition_choice');
assert.equal(ready('Find agencies with an outdated website in Riyadh').code, 'website_review_required');
assert.equal(ready('أبغى شركات مواقعها ضعيفة في الرياض', { ultra: true, language: 'ar' }).code, 'website_review_required');
assert.equal(sourceReadiness({ query: 'Marketing agency founders in Riyadh', business: { fitSignal: 'weak website' } }).code, 'website_review_required');
assert.equal(sourceReadiness({ query: 'Marketing agency founders in Riyadh', business: { offer: 'I improve weak websites' } }), null, 'The seller offer must not become a target condition');
assert.equal(ready('Find property owners in Riyadh').code, 'ownership_confirmation_required');
assert.equal(ready('ملاك العقارات في الرياض', { ultra: true, language: 'ar' }).code, 'ownership_confirmation_required');
assert.equal(ready('Bayut property owners in Riyadh; agents are fine'), null, 'Explicit consent remains a listing-contact request');
assert.equal(ready('Find Airbnb owners in Riyadh').code, 'ultra_rental_phones_unavailable');
assert.equal(ready('Find Gathern furnished apartments in Riyadh').code, 'ultra_rental_phones_unavailable');
assert.equal(ready('Find Airbnb owners in Riyadh', { ultra: false }).code, 'ownership_confirmation_required');
assert.equal(ready('Find Gathern furnished apartments', { ultra: false }).code, 'rental_city_required');
assert.equal(ready('Find Gathern furnished apartments in Riyadh', { ultra: false }), null);
assert.equal(ready('Find Zillow agents in Riyadh').code, 'saudi_source_unavailable');
assert.equal(ready('Find real estate agents in Jeddah'), null);
assert.equal(ready('OpenSooq marketplace sellers in Riyadh'), null);
assert.equal(sourceReadiness(null), null);

for (const query of ['Find marketing agencies without a website or with a weak website', 'Find agencies with a weak website', 'Find property owners in Riyadh', 'Gathern furnished apartments', 'Zillow agents in Riyadh']) {
  for (const language of ['en', 'ar']) {
    const result = ready(query, { ultra: true, language });
    assert.ok(result?.code && result.text && result.missing.length);
    assert.ok(!/apify|gathern|zillow|bayut|propertyfinder|api|actor/i.test(result.text), 'User-facing messages must not expose internal providers');
    if (language === 'ar') assert.match(result.text, /[\u0600-\u06ff]/);
  }
}
const original = { query: 'Find property owners in Riyadh', filters: { companyLocationCityIncludes: ['Riyadh'] } };
const before = JSON.stringify(original);
sourceReadiness(original, { ultra: true });
assert.equal(JSON.stringify(original), before, 'Preflight must never rewrite the target or imply consent');
console.log('Source readiness: supported targets, website choices, ownership consent, Ultra rental phones, Saudi coverage, city and bilingual messages passed. No external calls.');
