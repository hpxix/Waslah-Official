// Operational pressure, not a prediction of provider enforcement or approved limits.
export function harajPerformance(state, now = Date.now()) {
  const requests = (state.events || []).filter(e => ['search', 'contact', 'comments', 'profile', 'posts'].includes(e.kind));
  const sample = requests.filter(e => Date.parse(e.at) >= now - 86400000 && Date.parse(e.at) <= now);
  const successful = sample.filter(e => e.outcome === 'ok' || e.outcome === 'empty').length;
  const failed = sample.length - successful;
  const durations = sample.map(e => e.durationMs).filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  const percentile = p => durations.length ? durations[Math.max(0, Math.ceil(durations.length * p) - 1)] : null;
  const today = new Date(now).toISOString().slice(0, 10);
  const dailyRequests = state.day === today ? Number(state.requests || 0) : 0;
  const dailyContacts = state.day === today ? Number(state.contacts || 0) : 0;
  const usage = state.limits.requestsPerDay>0 ? Math.min(1, dailyRequests / state.limits.requestsPerDay) : 0;
  const reasons = [];
  let score = Math.round(usage * 30);
  if (usage >= .8) reasons.push('budget_pressure');
  if (failed) { score += Math.round(failed / sample.length * 45); reasons.push('response_errors'); }
  if (state.limits.intervalMs < 3000) { score += 15; reasons.push('fast_pacing'); }
  if (state.emptyContacts > 0) { score += Math.min(10, state.emptyContacts * 2); reasons.push('empty_contacts'); }
  if (state.contactsPaused) reasons.push('contacts_paused');
  if (state.paused) { score = Math.max(score, 75); reasons.unshift('connection_paused'); }
  if (['rate_limited', 'access_restricted', 'authentication_rejected'].includes(state.reason)) score = Math.max(score, 90);
  if (!sample.length) reasons.push('no_recent_samples');
  const known = sample.length > 0 || state.paused;
  score = known ? Math.min(100, score) : null;
  return {
    generatedAt: new Date(now).toISOString(), windowHours: 24, eventCapacity: 50,
    sampleCount: sample.length, successful, failed,
    successRate: sample.length ? Math.round(successful / sample.length * 1000) / 10 : null,
    httpOkCount: sample.filter(e => e.status >= 200 && e.status < 300).length,
    medianMs: percentile(.5), p95Ms: percentile(.95), latencySampleCount: durations.length,
    dailyRequests, dailyContacts, day: today,
    maximumRequestsPerMinute: Math.round(60000 / state.limits.intervalMs * 10) / 10,
    lastRequestAt: requests.at(-1)?.at || null,
    risk: { score, level: score === null ? 'unknown' : score >= 70 ? 'review' : score >= 30 ? 'elevated' : 'low', reasons },
  };
}
