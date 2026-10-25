import assert from 'node:assert/strict';
import {
  configureProviderCreditAlerts,
  notifyProviderCreditFailure,
  providerCreditFailure,
} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/provider-credit-alerts.js';

const sent = [];
configureProviderCreditAlerts({ send: async (message) => { sent.push(message); }, logger: { warn() {}, error() {} } });

assert.equal(providerCreditFailure('haraj', { status: 401, message: 'Unauthorized' }), 'token expired or rejected');
assert.equal(providerCreditFailure('haraj', { status: 200, message: 'Insufficient credits' }), 'credits depleted');
assert.equal(providerCreditFailure('openrouter', { status: 402, message: 'Payment required' }), 'credits depleted');
assert.equal(providerCreditFailure('openrouter', { status: 429, message: 'Rate limited' }), null);
assert.equal(providerCreditFailure('haraj', { status: 500, message: 'Server error' }), null);

await Promise.all(Array.from({ length: 3 }, () => notifyProviderCreditFailure('haraj', { status: 401, message: 'Unauthorized' })));
await notifyProviderCreditFailure('openrouter', { status: 402, message: 'Insufficient credits' });
assert.equal(sent.length, 2);
assert.equal(sent[0].to, 'mastergotmemes@gmail.com');
assert.equal(sent[0].subject, 'WASLA OUT OF CREDITS*');
assert.match(sent[0].text, /Lite won't operate because phone numbers aren't there/);
assert.match(sent[1].text, /OpenRouter/);
console.log('Provider credit alert checks passed.');
