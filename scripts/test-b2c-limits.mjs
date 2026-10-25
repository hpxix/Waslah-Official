import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LISTING_LIMITS, validateListingLimits, effectiveListingLimit, listingBudget } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-limits.js';
test('fresh installations use the measured 30-lead listing default', () => {
  assert.deepEqual(DEFAULT_LISTING_LIMITS, {30:32000,50:0,200:0});
});
test('limits validate all tiers and reject fractional, negative, omitted and excessive values', () => {
  assert.deepEqual(validateListingLimits({30:9000,50:15000,200:60000}), {30:9000,50:15000,200:60000});
  for (const value of [-1, 1.5, 10000001, '60000', undefined]) assert.throws(() => validateListingLimits({30:0,50:0,200:value}));
});
test('next higher lead tier applies, server ceiling wins, zero is uncapped', () => {
  const limits = {30:9000,50:15000,200:60000};
  assert.equal(effectiveListingLimit(limits, 40), 15000);
  assert.equal(effectiveListingLimit(limits, 200), 60000);
  assert.equal(effectiveListingLimit(limits, 200, 10000), 10000);
  assert.equal(effectiveListingLimit({30:0,50:0,200:0}, 200), 0);
});
test('concurrent page reservations cannot overshoot; empty pages release capacity', () => {
  const budget = listingBudget(101, 40);
  const a = budget.reserve(50), b = budget.reserve(50), c = budget.reserve(50);
  assert.equal(a.amount, 50); assert.equal(b.amount, 11); assert.equal(c.amount, 0);
  a.finish(20); b.finish(11);
  assert.equal(budget.used, 71);
  const d = budget.reserve(50); assert.equal(d.amount, 30); d.finish(30); d.finish(30);
  assert.equal(budget.used, 101); assert.equal(budget.reserve(50).amount, 0);
});
