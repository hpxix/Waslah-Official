import assert from 'node:assert/strict';
import { enforceLeadQuantityPolicy, restoreConfirmedBrief } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/chat-policy.js';

const businessUnderstanding = { offer: 'Website development', customer: 'Marketing agencies', customerOutcome: 'More enquiries', commercialModel: 'Project-based', target: 'Marketing agency founders', fitSignal: 'Marketing agency', geography: 'Riyadh' };
const prior = { confidence: 100, channel: 'b2b', missing: [], summary: 'Marketing agency founders in Riyadh', apifyInput: { personTitleIncludes: ['Founder'], companyLocationCityIncludes: ['Riyadh'], companyIndustryIncludes: ['Marketing & Advertising'], searchStringsArray: ['marketing agencies Riyadh'] }, businessUnderstanding, productDescription: 'Website development', productOutcome: 'More enquiries', signalTopics: ['agency growth'] };
for (const text of [
  'The minimum is 30 leads.', 'The minimum order is 30 contacts.', 'A 30-lead minimum applies.',
  'We cannot search for fewer than 30 leads.', 'I need at least 30 leads to start.', 'Searches start from 30 leads.',
  'Our smallest package is 30.', 'The minimum is thirty leads.',
  'الحد الأدنى هو 30 عميل.', 'الحد الأدنى للبحث هو ٣٠ عميل.', 'أقل عدد متاح هو ثلاثين عميل.',
  'ما نقدر نبدأ بأقل من 30 عميل.', 'لازم تطلب على الأقل ٣٠ عميل.', 'الباقات تبدأ من 30 عميل.',
]) {
  const result = enforceLeadQuantityPolicy({ text, summary: 'New target: clinics in Jeddah', ready: true, missing: ['geography'], businessUnderstanding: { offer: 'CRM' }, filters: { companyLocationCityIncludes: ['Jeddah'] } }, prior, 'en', false);
  assert.equal(result.ready, false, `False minimum must not establish readiness: ${text}`);
  assert.match(result.text, /1 to 200/);
  assert.deepEqual(result.missing, ['geography'], 'Missing business details are retained');
  assert.deepEqual(result.filters.companyLocationCityIncludes, ['Jeddah'], 'Target edits must never recover old filters');
  assert.equal(result.businessUnderstanding.offer, 'CRM');
}
const restored = enforceLeadQuantityPolicy({ text: 'Minimum 30 leads', ready: false, summary: 'Incomplete', missing: ['minimum 30'] }, prior, 'ar', true);
assert.equal(restored.ready, true);
assert.equal(restored.summary, prior.summary);
assert.deepEqual(restored.filters.personTitleIncludes, ['Founder']);
assert.equal(restored.filters.searchStringsArray, undefined);
assert.deepEqual(restored.searchQueries, ['marketing agencies Riyadh']);
assert.deepEqual(restored.businessUnderstanding, businessUnderstanding);
assert.deepEqual(restored.missing, []);
assert.match(restored.text, /من 1 إلى 200/);
assert.equal(restored.productDescription, 'Website development');
assert.equal(enforceLeadQuantityPolicy({}, prior, 'en', true).ready, true, 'Confirmed quantity-only turns can bypass the model');
assert.equal(restoreConfirmedBrief(prior).ready, true);
for (const invalid of [null, { ...prior, confidence: 50 }, { ...prior, confidence: '100' }, { ...prior, channel: 'b2c' }, { ...prior, missing: ['customerOutcome'] }, { ...prior, businessUnderstanding: null }, { ...prior, apifyInput: null }, { ...prior, summary: '' }]) {
  assert.equal(restoreConfirmedBrief(invalid), null);
  const result = enforceLeadQuantityPolicy({ text: 'Minimum 30 leads', ready: false, missing: ['customerOutcome'] }, invalid, 'en', true);
  assert.equal(result.ready, false, 'An unconfirmed prior cannot establish readiness');
  assert.deepEqual(result.missing, ['customerOutcome']);
}
const summaryOnly = enforceLeadQuantityPolicy({ text: 'Which city?', summary: 'Clinics in Jeddah. Minimum 30 leads.', ready: true, missing: ['commercialModel'] }, prior);
assert.match(summaryOnly.summary, /Clinics in Jeddah/);
assert.match(summaryOnly.summary, /1 to 200/);
assert.doesNotMatch(summaryOnly.summary, /Minimum 30/);
assert.match(summaryOnly.text, /Which city/);
assert.equal(summaryOnly.ready, false);
for (const text of ['I will find 30 founders in Riyadh.', 'You can request any number from 1 to 200 leads.', 'There is no minimum of 30 leads.']) {
  const brief = { text, summary: 'Founders in Riyadh', ready: true, missing: [] };
  assert.deepEqual(enforceLeadQuantityPolicy(brief, prior, 'en', false), brief, 'Legitimate quantities and corrections remain unchanged');
}
const snapshot = JSON.stringify(prior);
const cloned = restoreConfirmedBrief(prior);
cloned.filters.personTitleIncludes.push('CEO');
cloned.businessUnderstanding.offer = 'Changed';
assert.equal(JSON.stringify(prior), snapshot, 'Restoration must not mutate server-scoped intake');
console.log('Chat quantity policy: false Arabic/English minimum claims, confirmed quantity-only recovery, target isolation, missing business details and immutable restoration passed. No external calls.');
