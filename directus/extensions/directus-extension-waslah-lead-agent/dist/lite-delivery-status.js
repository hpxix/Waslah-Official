// Explain delivery blockers before secondary traversal/time limits. These counts
// describe authorization decisions, not missing phone numbers or source scarcity.
export function liteDeliveryBlocker(stats, target) {
  const denied = Number(stats.contactExclusions?.not_authorized || 0);
  const commentDenied = Number(stats.commentDiscovery?.contactRejections?.not_authorized || 0);
  const merchantDenied = Number(stats.mahally?.exclusions?.not_authorized || 0);
  if (Number(stats.uniqueLeads || 0) > 0 || !(denied + commentDenied + merchantDenied)) return null;
  const fallback = stats.merchantFallbackStatus === 'disabled'
    ? ' Mahally/Salla fallback is disabled.'
    : stats.merchantFallbackStatus === 'unconfigured'
      ? ' Mahally/Salla fallback is not configured.' : '';
  return `No leads were saved out of ${target} requested. Contact authorization blocked ${denied} listing candidates and ${commentDenied} commenter accounts${merchantDenied ? ` and ${merchantDenied} stores` : ''}. Valid contact permissions must be provided before retrieval or delivery; retrying unchanged will not resolve this.${fallback}`;
}
