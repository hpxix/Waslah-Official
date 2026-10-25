export const LITE_MODE_PREFIX = 'internal_lite_mode_';
// Ordered fallback: buyer intent -> product comments -> product ads with phones.
// Explicit account-only source restrictions remain available to administrators.
export const DEFAULT_LITE_SEARCH_MODE = 'mixed';
export const LITE_SEARCH_MODES = ['mixed', 'comments_only', 'listings_only'];
export function validateLiteSearchMode(mode) {
  if (!LITE_SEARCH_MODES.includes(mode)) throw new Error('Choose mixed, comments_only or listings_only.');
  return mode;
}
export async function readLiteSearchMode(database, userId) {
  const row = await database('feature_flags').where({ feature_key: `${LITE_MODE_PREFIX}${userId}` }).first();
  if (!row) return DEFAULT_LITE_SEARCH_MODE;
  const config = typeof row.configuration === 'string' ? JSON.parse(row.configuration) : row.configuration;
  return validateLiteSearchMode(config?.mode);
}
export function liteRoutePolicy(mode) {
  validateLiteSearchMode(mode);
  return { comments: mode !== 'listings_only', listings: mode !== 'comments_only' };
}

export function liteWorkRemaining(policy,stats) {
  return Boolean((policy.listings && !stats.sourceExhausted)
    || (policy.comments && stats.commentDiscovery && !stats.commentDiscovery.complete));
}
