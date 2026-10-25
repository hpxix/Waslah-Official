import assert from 'node:assert/strict';
import { createB2CDiscoveryTurn } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';

const transcript = ['user: I sell premium coffee beans', 'assistant: Which city do you deliver to?'];
const ready = await createB2CDiscoveryTurn({}, { message: 'Riyadh', transcript, language: 'en', reasoningMode: 'fast' });
assert.equal(ready.ready, true);
assert.deepEqual(ready.missing, []);
assert.doesNotMatch(ready.reply, /advertis|haraj|keywords|who do you think|started|underway/i);
for (const message of ['200', '?', 'nope']) {
  const next = await createB2CDiscoveryTurn({}, { message, transcript: [...transcript, 'user: Riyadh', `assistant: ${ready.reply}`], language: 'en', reasoningMode: 'fast' });
  assert.equal(next.ready, true);
  assert.doesNotMatch(next.reply, /target audience|started|underway/i);
}
const ar = await createB2CDiscoveryTurn({}, { message: 'الرياض', transcript: ['user: أبيع حبوب القهوة'], language: 'ar', reasoningMode: 'fast' });
assert.equal(ar.ready, true);
const first = await createB2CDiscoveryTurn({}, { message: 'I sell MacBooks', language: 'en' });
assert.equal(first.ready, false);
assert.match(first.reply, /city/);
const greetingWithOldBusiness = await createB2CDiscoveryTurn({}, {
  message: 'Hi',
  language: 'en',
  businessContext: 'Previous business: iPhones and laptops. Previous city: Riyadh. Previous outcome: ready_for_quantity.',
});
assert.equal(greetingWithOldBusiness.ready, false);
assert.match(greetingWithOldBusiness.reply, /Hey!.*Great to see you/iu);
const livestockNeedsCompatibility = await createB2CDiscoveryTurn({}, {
  message: 'Riyadh, Saudi Arabia',
  transcript: ['user: I sell cow milking machines'],
  language: 'en',
  reasoningMode: 'fast',
});
assert.equal(livestockNeedsCompatibility.ready, false);
assert.deepEqual(livestockNeedsCompatibility.missing, ['animal compatibility']);
assert.match(livestockNeedsCompatibility.reply, /cows.*sheep.*goats/i);
const livestock = await createB2CDiscoveryTurn({}, {
  message: 'yes, find people who own cows or sheep',
  transcript: [
    'user: I sell cow milking machines',
    'assistant: Which city do you serve?',
    'user: Riyadh, Saudi Arabia',
    'assistant: Which animals does the machine support?',
  ],
  language: 'en',
  reasoningMode: 'fast',
});
assert.equal(livestock.ready, true);
assert.match(livestock.summary, /milking machine/i);
assert.doesNotMatch(livestock.reply, /what product or service/i);
const supplierRequest = await createB2CDiscoveryTurn({}, {
  message: 'Find me companies that sells مواد غذائية for restaurants in riyadh saudi arabia',
  language: 'en',
});
assert.equal(supplierRequest.ready, false);
assert.deepEqual(supplierRequest.missing, ['target audience']);
assert.match(supplierRequest.reply, /supplier.*restaurants.*buy|companies.*supply.*restaurants/i);
assert.doesNotMatch(supplierRequest.reply, /Astraeus/i);
const supplierConfirmed = await createB2CDiscoveryTurn({}, {
  message: 'Supplier companies',
  transcript: ['user: Find me companies that sells مواد غذائية for restaurants in riyadh saudi arabia', `assistant: ${supplierRequest.reply}`],
  language: 'en',
});
assert.equal(supplierConfirmed.ready, false);
assert.match(supplierConfirmed.reply, /Lite can.t reliably verify/i);
assert.doesNotMatch(supplierConfirmed.reply, /Astraeus/i);
const supplierLiteFollowup = await createB2CDiscoveryTurn({}, {
  message: 'ok, can you do it on Lite',
  transcript: ['user: Find me companies that sells مواد غذائية for restaurants in riyadh saudi arabia', `assistant: ${supplierRequest.reply}`],
  language: 'en',
});
assert.equal(supplierLiteFollowup.ready, false);
assert.match(supplierLiteFollowup.reply, /Lite can.t reliably verify/i);
assert.doesNotMatch(supplierLiteFollowup.reply, /Astraeus|what does your customer already own/i);
const restaurantBuyers = await createB2CDiscoveryTurn({}, {
  message: 'Restaurants that buy from me',
  transcript: ['user: Find me companies that sells مواد غذائية for restaurants in riyadh saudi arabia', `assistant: ${supplierRequest.reply}`],
  language: 'en',
});
assert.match(restaurantBuyers.summary, /I sell مواد غذائية to restaurants in Riyadh/i);
assert.doesNotMatch(restaurantBuyers.summary, /companies that sells/i);
const approvedFallback = await createB2CDiscoveryTurn({}, {
  message: 'Yes, include operating restaurants if direct buyers are scarce',
  transcript: ['user: I sell food supplies to restaurants in Riyadh', 'assistant: May I include operating restaurants without stated purchase intent?'],
  language: 'en',
});
assert.match(approvedFallback.summary, /\[APPROVED_SECTOR_FALLBACK\]/);
console.log('Discovery flow regressions passed: coffee, MacBooks, quantity, clarification, Arabic, provider unavailable.');
