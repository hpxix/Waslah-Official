export const LIMITS_KEY = 'internal_b2c_listing_limits';
// Calibrated from the 2026-10-04 fresh-account gaming-PC benchmark:
// 23,029 listings produced 30 verified leads (about 768 per lead). The 32,000
// default adds ~39% headroom and remains fully adjustable from Admin.
export const DEFAULT_LISTING_LIMITS = { 30: 32000, 50: 0, 200: 0 };
export function validateListingLimits(value) {
  if (!value || Object.keys(value).some(key => !['30', '50', '200'].includes(key)) || ['30', '50', '200'].some(key => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 10000000)) {
    throw new Error('Provide whole-number listing limits for 30, 50 and 200 leads, between 0 and 10,000,000. Zero means no admin cap.');
  }
  return { 30: value[30], 50: value[50], 200: value[200] };
}
export async function readListingLimits(database) {
  const row = await database('feature_flags').where({ feature_key: LIMITS_KEY }).first();
  return row ? validateListingLimits(typeof row.configuration === 'string' ? JSON.parse(row.configuration) : row.configuration) : { ...DEFAULT_LISTING_LIMITS };
}
export function effectiveListingLimit(limits, target, emergencyLimit = 0) {
  const tier = target <= 30 ? 30 : target <= 50 ? 50 : 200;
  const positive = [limits[tier], Number(emergencyLimit)].filter(n => Number.isFinite(n) && n > 0);
  return positive.length ? Math.min(...positive) : 0;
}
// Reserve before awaiting HTTP so concurrent producers cannot oversubscribe.
export function listingBudget(maximum, initial = 0) {
  let used = initial, reserved = 0;
  return {
    get used() { return used; },
    reserve(wanted) {
      const amount = maximum ? Math.max(0, Math.min(wanted, maximum - used - reserved)) : wanted;
      reserved += amount;
      let settled = false;
      return { amount, finish(returned) {
        if (settled) return;
        settled = true; reserved -= amount; used += Math.min(amount, Math.max(0, returned));
      } };
    },
  };
}
