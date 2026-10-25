import { randomUUID } from 'node:crypto';

const base = process.env.WASLA_BASE_URL || 'http://localhost:8055';
const runId = Date.now();
const email = `b2c.qa.${runId}@example.com`;
const password = `Qa!${randomUUID()}9`;
const phone = `+96659${String(runId).slice(-7)}`;
const adminEmail = process.env.DIRECTUS_ADMIN_EMAIL;
const adminPassword = process.env.DIRECTUS_ADMIN_PASSWORD;
const conversationId = randomUUID();
const prompt = 'I own a Riyadh shop that sells custom gaming PCs to individual consumers. I want people in Riyadh who are actively looking to buy a gaming PC. If direct buyers are limited, include private owners listing their personal PC because they may be upgrading. Exclude computer shops, wholesalers, professional resellers, accessories-only ads, repair services, and job seekers.';

async function request(path, { method = 'GET', token, body } = {}) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await fetch(base + path, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload.data;
    if (![429, 503].includes(response.status) || attempt === 8) throw new Error(`${method} ${path} failed (${response.status}): ${payload?.errors?.[0]?.message || payload?.message || 'unknown'}`);
    await new Promise(resolve => setTimeout(resolve, attempt * 1500));
  }
}

await request('/lead-agent/auth/register', { method: 'POST', body: {
  email, password, name: 'B2C Yield QA', business: `Riyadh Gaming PC QA ${runId}`, phone,
  privacy_accepted: true, permissions_accepted: true, consent_version: 'qa-2026-10-04', marketing_consent: false, plan: 'launch',
} });
const session = await request('/auth/login', { method: 'POST', body: { email, password, mode: 'json' } });
const token = session.access_token;
if (!token) throw new Error('Fresh account login returned no access token.');
if (!adminEmail || !adminPassword) throw new Error('Set DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD for paid-plan smoke testing.');
const adminSession = await request('/auth/login', { method: 'POST', body: { email: adminEmail, password: adminPassword, mode: 'json' } });
const sales = await request('/lead-agent/admin/sales-requests', { token: adminSession.access_token });
const sale = sales.find(row => row.email === email);
if (!sale) throw new Error('New account did not enter the sales queue.');
await request(`/lead-agent/admin/sales-requests/${sale.id}/activate`, { method: 'POST', token: adminSession.access_token, body: {
  plan: 'launch', payment_received: true, payment_reference: `qa-payment-${runId}`,
} });
const chat = await request('/lead-agent/b2c/chat', { method: 'POST', token, body: {
  message: prompt, transcript: [], language: 'en', conversation_id: conversationId, deal_intent: 'sell', reasoning_mode: 'high',
} });
if (!chat.ready || !chat.planning) throw new Error(`AI did not produce a ready plan: ${(chat.missing || []).join(', ')}`);
const campaign = await request('/lead-agent/b2c/campaigns', { method: 'POST', token, body: {
  prompt, targetLeadCount: 30, planning: chat.planning, name: 'Fresh-account B2C yield benchmark',
} });
await request(`/lead-agent/b2c/campaigns/${campaign.id}/run`, { method: 'POST', token, body: {} });
console.log(JSON.stringify({ stage: 'started', email, campaignId: campaign.id, queries: chat.planning.acquisitionPlan.strategies.map(s => s.searchTerm), target: 30 }));
let current;
let last = '';
const deadline = Date.now() + 30 * 60 * 1000;
while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 5000));
  current = await request(`/lead-agent/b2c/campaigns/${campaign.id}`, { token });
  const stats = current.stats || {};
  const line = JSON.stringify({ stage: current.status, listings: stats.listingsFetchedTotal ?? stats.postsFetched ?? 0, qualified: stats.candidatesQualified ?? 0, contactAttempts: stats.contactAttempts ?? 0, contacts: stats.contactsResolved ?? 0, leads: stats.uniqueLeads ?? 0, limit: stats.listingLimitSnapshot ?? null, elapsed: stats.elapsedSeconds ?? null });
  if (line !== last) console.log(line);
  last = line;
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(current.status)) break;
}
if (!current || !['COMPLETED', 'FAILED', 'CANCELLED'].includes(current.status)) throw new Error('Campaign did not reach a terminal state within 30 minutes.');
const stats = current.stats || {};
console.log(JSON.stringify({ stage: 'final', email, campaignId: campaign.id, status: current.status, error: current.error_message || null, listings: stats.listingsFetchedTotal ?? stats.postsFetched ?? 0, qualified: stats.candidatesQualified ?? 0, contactAttempts: stats.contactAttempts ?? 0, contacts: stats.contactsResolved ?? 0, leads: stats.uniqueLeads ?? 0, listingsPerLead: stats.uniqueLeads ? Number(((stats.listingsFetchedTotal ?? stats.postsFetched ?? 0) / stats.uniqueLeads).toFixed(2)) : null, firstLeadSeconds: stats.timeToFirstLeadSeconds ?? null, elapsedSeconds: stats.elapsedSeconds ?? null, limit: stats.listingLimitSnapshot ?? null }));
