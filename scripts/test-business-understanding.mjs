import assert from 'node:assert/strict';
import { cleanBusinessUnderstanding, missingBusinessUnderstanding, businessUnderstandingQuestion, groundBusinessUnderstanding, groundTargetFilters } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/business-understanding.js';
import { createB2CDiscoveryTurn } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';

const thin = { offer: 'Coffee beans', geography: 'Riyadh' };
assert.deepEqual(missingBusinessUnderstanding(thin), ['customer', 'customerOutcome', 'commercialModel', 'target', 'fitSignal']);
assert.match(businessUnderstandingQuestion('commercialModel', 'en', 'sell'), /repeat orders or one-off sales/i);
assert.equal(cleanBusinessUnderstanding({ offer: 'Mission context: user sells to consumers' }).offer, '');
assert.equal(groundBusinessUnderstanding({ commercialModel: '' }, 'I sell tomatoes to big stores in Riyadh for whole sale and individual sales').commercialModel, 'wholesale and retail/direct sales');
assert.doesNotMatch(businessUnderstandingQuestion('commercialModel', 'en'), /earn revenue|subscription|project/i);

const complete = {
  offer: 'Premium coffee beans for cafes', customer: 'Cafe owners who pay for beans',
  customerOutcome: 'Consistent fresh coffee for their guests', commercialModel: 'Recurring wholesale orders',
  target: 'Independent cafes in Riyadh', fitSignal: 'New or expanding cafe buying coffee supplies', geography: 'Riyadh',
};
assert.deepEqual(missingBusinessUnderstanding(complete), []);
assert.equal(groundTargetFilters({annualRevenueIncludes:['10M+ SAR'],companySizeIncludes:['51-200']},'I want medium to large companies').annualRevenueIncludes,undefined);
assert.deepEqual(groundTargetFilters({companySizeIncludes:['51-200']},'medium to large companies').companySizeIncludes,['51-200']);
assert.deepEqual(groundTargetFilters({annualRevenueIncludes:['10M+ SAR']},'Target companies with annual revenue above 10M SAR').annualRevenueIncludes,['10M+ SAR']);
assert.equal(groundTargetFilters({fundingStageIncludes:['Series A']},'I sell CRM software').fundingStageIncludes,undefined);
assert.equal(groundTargetFilters({annualRevenueIncludes:['10M+ SAR']},'اشتراكي ٤٩٩ ريال شهريًا').annualRevenueIncludes,undefined);

const high = await createB2CDiscoveryTurn({}, { message: 'Riyadh', transcript: ['user: I sell premium coffee beans'], language: 'en', reasoningMode: 'high' });
assert.equal(high.ready, false);
assert.ok(high.missing.includes('customerOutcome'));
assert.doesNotMatch(high.reply, /choose the number of leads/i);

const fast = await createB2CDiscoveryTurn({}, { message: 'Riyadh', transcript: ['user: I sell premium coffee beans'], language: 'en', reasoningMode: 'fast' });
assert.equal(fast.ready, true);
console.log('Business-understanding gate and high/fast behavior passed.');
