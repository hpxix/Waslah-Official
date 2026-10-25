import assert from 'node:assert/strict';
import { createB2CPlan, validSearchExpression } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';

const plan = await createB2CPlan({}, 'user: I own a bussiness that i sells laptops especially macbooks\nassistant: Understood. What exact product or service should appear in the advertisers’ titles?\nuser: Riyadh');
assert.equal(plan.intent.productName, 'ماك بوك');
assert(plan.acquisitionPlan.strategies.every(s => validSearchExpression(s.searchTerm)));
assert(plan.acquisitionPlan.strategies.some(s => s.searchTerm === 'ماك بوك'));
assert(!validSearchExpression('user: I own a business'));
await assert.rejects(() => createB2CPlan({}, 'user: something unclear\nassistant: what?'));
console.log('B2C product extraction regressions passed');
