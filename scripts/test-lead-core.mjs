// Run in the existing Directus container; all test data is rolled back.
// docker exec -i waslah_directus node --input-type=module < scripts/test-lead-core.mjs
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import endpoint from '/directus/extensions/directus-extension-waslah-lead-agent/dist/index.js';
import { persistQualifiedB2CLead, runB2CCampaign } from '/directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import { compileKeywordPlan } from '/directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-keywords.js';
const require = createRequire(import.meta.url);
const knex = createRequire(require.resolve('@directus/api'))('knex');
const db = knex({ client: 'pg', connection: { host: process.env.DB_HOST, port: process.env.DB_PORT || 5432, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE } });
const trx = await db.transaction();
const originalFetch = globalThis.fetch;
const env = { N8N_WEBHOOK_SECRET: 'rollback-test-secret', N8N_LEAD_AGENT_WEBHOOK_URL: 'https://workflow.invalid/test' };
const routes = new Map();
const router = Object.fromEntries(['get', 'post', 'patch', 'put', 'delete'].map(method => [method, (path, handler) => routes.set(`${method} ${path}`, handler)]));
const tenants = [0, 1].map(() => ({ org: randomUUID(), user: randomUUID(), wallet: randomUUID() }));
let dispatches = 0;
async function call(tenant, method, path, body = {}, params = {}, query = {}) {
  let status = 200, output;
  const res = { status(code) { status = code; return res; }, json(value) { output = value; return res; } };
  await routes.get(`${method} ${path}`)({ accountability: { user: tenant.user }, body, params, query, headers: { 'x-waslah-workflow-secret': env.N8N_WEBHOOK_SECRET } }, res);
  return { status, ...output };
}
try {
  endpoint.handler(router, { services: {}, database: trx, getSchema: async () => ({}), env, logger: { info() {}, warn() {}, error() {} } });
  globalThis.fetch = async (url) => {
    assert.equal(url, env.N8N_LEAD_AGENT_WEBHOOK_URL, 'unexpected network request blocked');
    dispatches++;
    return Response.json({ accepted: true });
  };
  for (const tenant of tenants) {
    await trx('directus_users').insert({ id: tenant.user, email: `core-${tenant.user}@example.invalid`, status: 'active' });
    await trx('organizations').insert({ id: tenant.org, owner_user: tenant.user, name: 'Core rollback QA', slug: `core-${tenant.org}`, status: 'active' });
    await trx('customer_profiles').insert({ id: randomUUID(), user_id: tenant.user, organization_id: tenant.org, phone_e164: `qa-${tenant.org.slice(0, 16)}`, avatar_seed: 'qa', locale: 'en', phone_verified_at: new Date().toISOString() });
    await trx('wallets').insert({ id: tenant.wallet, organization_id: tenant.org, currency: 'SAR', balance_halalas: 0 });
  }
  const [a, b] = tenants;
  const payload = { query: 'Restaurant owners in Riyadh', target_count: 30, criteria: {}, idempotency_key: 'same-search' };
  assert.equal((await call(a, 'post', '/requests', payload)).status, 402);
  assert.equal(dispatches, 0, 'no source run without credits');
  await trx('wallets').where({ id: a.wallet }).update({ balance_halalas: 3000 });
  const accepted = await call(a, 'post', '/requests', payload);
  assert.equal(accepted.status, 202, JSON.stringify(accepted));
  assert.equal((await call(a, 'post', '/requests', payload)).data.id, accepted.data.id);
  assert.equal(dispatches, 1, 'idempotent start');
  assert.equal(Number((await trx('wallets').where({ id: a.wallet }).first()).balance_halalas), 3000, 'no charge before delivery');
  const requestId = accepted.data.id;
  const delivery = { request_id: requestId, leads: [{ name: 'QA Contact', company: 'QA Restaurant', title: 'Owner', phone: '+966500000001', company_image_url: 'https://example.com/logo.png', source: 'verified_business_records', source_reference: randomUUID() }] };
  assert.equal((await call(a, 'post', '/integrations/leads', delivery)).status, 202);
  assert.equal((await call(a, 'post', '/integrations/leads', delivery)).status, 202);
  const balance = Number((await trx('wallets').where({ id: a.wallet }).first()).balance_halalas);
  assert.equal(balance, 2900, 'one delivered lead costs 1 SAR, duplicate delivery is free');
  const inventory = await call(a, 'get', '/leads');
  assert.equal(inventory.data.length, 1);
  assert.equal(inventory.data[0].name, 'QA Contact');
  assert.equal(inventory.data[0].phone, '+966500000001');
  assert.equal(inventory.data[0].company_image_url, 'https://example.com/logo.png');
  assert.equal(inventory.data[0].revealed, true);
  assert.equal((await call(b, 'get', '/leads')).data.length, 0, 'inventory is tenant scoped');
  assert.equal((await call(b, 'get', '/requests/:id', {}, { id: requestId })).status, 404);
  assert.equal((await call(a, 'get', '/requests/:id', {}, { id: requestId })).data.status, 'sourced');
  assert.equal((await call(b, 'get', '/requests/:id/results', {}, { id: requestId })).status, 404);
  const leadId = inventory.data[0].id;

  // Relevance protocol fixture: never sends a real research job.
  Object.assign(env, { RELEVANCE_API_KEY: "test-key", RELEVANCE_PROJECT_ID: "test-project", RELEVANCE_REGION: "d7b62b", RELEVANCE_AGENT_ID: "test-agent" });
  assert.equal((await call(a, 'post', '/leads/:id/research', {}, { id: leadId })).status, 400, "missing LinkedIn blocked");
  await trx("lead_inventory").where({ id: leadId }).update({ linkedin_url: "https://www.linkedin.com/in/rollback-qa/" });
  let paidRuns = 0, researchReads = 0;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith("https://api-d7b62b.stack.tryrelevance.com/latest/agents/"));
    if (url.endsWith("/trigger")) {
      paidRuns++;
      const body = JSON.parse(options.body);
      assert.deepEqual(body, { agent_id: "test-agent", message: { role: "user", content: "https://www.linkedin.com/in/rollback-qa" } });
      return Response.json({ conversation_id: "qa-task" });
    }
    researchReads++;
    if (url.endsWith("/metadata")) return Response.json({ metadata: { conversation: { state: "completed" } } });
    return Response.json({ results: [{ content: { type: "agent-message", text: JSON.stringify({ executive_summary: "QA evidence only", buying_signals: ["QA signal"], sources: ["https://example.org/evidence"] }) } }] });
  };
  assert.equal((await call(b, "post", "/leads/:id/research", {}, { id: leadId })).status, 403, "other workspace cannot research");
  const started = await call(a, "post", "/leads/:id/research", {}, { id: leadId });
  assert.equal(started.status, 202, JSON.stringify(started));
  assert.equal(started.data.status, "researching");
  assert.equal(started.data.report._relevance, undefined, "job metadata private");
  assert.equal((await call(a, "post", "/leads/:id/research", {}, { id: leadId })).status, 202);
  assert.equal(paidRuns, 1, "repeated click reuses job");
  await trx("lead_research_reports").where({ lead_id: leadId }).update({ updated_at: new Date(Date.now() - 10000).toISOString() });
  const completed = await call(a, "get", "/leads/:id/research", {}, { id: leadId });
  assert.equal(completed.data.status, "completed", JSON.stringify(completed));
  assert.equal(completed.data.report.sections[0].content, "QA evidence only");
  assert.equal((await call(a, "get", "/research")).data.length, 1);
  assert.equal((await call(b, "get", "/research")).data.length, 0);
  assert.equal((await call(a, "post", "/leads/:id/research", {}, { id: leadId })).status, 200);
  assert.equal(paidRuns, 1, "completed report opens without paid run");
  assert.equal(researchReads, 2, "completed report needs no provider reads");

  // An ambiguous submission must not be retriggered.
  globalThis.fetch = async () => { paidRuns++; throw new Error("simulated timeout"); };
  assert.equal((await call(a, "post", "/leads/:id/research", { refresh: true }, { id: leadId })).status, 502);
  assert.equal((await call(a, "post", "/leads/:id/research", {}, { id: leadId })).status, 409);
  const uncertain = await call(a, "get", "/leads/:id/research", {}, { id: leadId });
  assert.equal(uncertain.data.retry_allowed, false);
  assert.equal(paidRuns, 2);
  console.log("PASS: Relevance async lifecycle, LinkedIn validation, tenant isolation, saved cache, duplicate and ambiguous-submission protection.");
  globalThis.fetch = async (url) => {
    assert.equal(url, env.N8N_LEAD_AGENT_WEBHOOK_URL);
    dispatches++;
    return Response.json({ accepted: true });
  };

  await trx('lead_inventory').where({ id: leadId }).update({ source: 'b2c' });
  assert.equal((await call(a, 'post', '/leads/:id/research', {}, { id: leadId })).status, 400, 'B2C research is rejected server-side');

  await trx('wallets').where({ id: a.wallet }).update({ balance_halalas: 20000 });
  const large = await call(a, 'post', '/requests', { ...payload, target_count: 200, idempotency_key: 'large-search' });
  const many = Array.from({ length: 205 }, (_, index) => ({ company: `Core QA company ${index}`, source_reference: randomUUID(), source: 'verified_business_records' }));
  const ingested = await call(a, 'post', '/integrations/leads', { request_id: large.data.id, leads: many });
  assert.equal(ingested.status, 202, JSON.stringify(ingested));
  const results = await call(a, 'get', '/requests/:id/results', {}, { id: large.data.id }, { limit: 200 });
  assert.equal(results.data.length, 200, '200 option is not truncated to 100');
  assert.equal(Number((await trx('wallets').where({ id: a.wallet }).first()).balance_halalas), 0, 'provider cannot exceed selected quantity');
  const before = await trx('wallet_transactions').where({ organization_id: a.org }).count('id as count').first();
  await call(a, 'post', '/integrations/leads', { request_id: large.data.id, leads: many });
  assert.equal((await trx('wallet_transactions').where({ organization_id: a.org }).count('id as count').first()).count, before.count);
  await trx('wallets').where({ id: a.wallet }).update({ balance_halalas: 100 });
  const campaign = { id: randomUUID(), organization_id: a.org, user_id: a.user, request_id: requestId, name: 'Rollback B2C test', original_prompt: 'QA purchase', status: 'READY', target_lead_count: 30, intent: {}, acquisition_plan: {}, stats: {} };
  await trx('b2c_campaigns').insert(campaign);
  const candidate = { postId: 999999123, authorId: 999999123, authorUsername: 'QA individual', city: 'Riyadh', title: 'QA item', tags: [], matchedStrategy: { query: 'اختبار', searchTerm: 'اختبار', englishTerm: 'QA', sourceMode: 'search', strategyType: 'DIRECT_INTENT', weight: 1 } };
  const qualification = { score: 85, identityConfidence: 85, purchasePropensity: 80, evidenceStrength: 85, marketplaceRole: 'SELLER', explanation: 'Synthetic persistence test', matchedSignals: ['QA'] };
  const inventoryId = await persistQualifiedB2CLead(trx, campaign, candidate, qualification, { contactMobile: '+966500000002' });
  await persistQualifiedB2CLead(trx, campaign, candidate, qualification, { contactMobile: '+966500000002' });
  const stored = await trx('b2c_leads').where({ campaign_id: campaign.id });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].inventory_id, inventoryId, 'inventory exists before required reference is inserted');
  assert.equal(Number((await trx('wallets').where({ id: a.wallet }).first()).balance_halalas), 0, 'B2C persistence bills once');
  assert.equal((await call(a, 'get', '/b2c/campaigns/:id/leads', {}, { id: campaign.id }, { limit: 30 })).data.length, 1, 'B2C endpoint returns persisted result');
  const runRequest = { ...(await trx('lead_requests').where({ id: requestId }).first()), id: randomUUID(), idempotency_key: randomUUID(), result_count: 0, status: 'sourcing' };
  await trx('lead_requests').insert(runRequest);
  const strategy = { pathId: 'pipeline-test', searchTerm: 'بي سي', strategyType: 'OWNER_FALLBACK', phaseIndex: 0, weight: 1 };
  const runCampaign = { ...campaign, id: randomUUID(), request_id: runRequest.id, target_lead_count: 2, acquisition_plan: JSON.stringify({ product: 'PC games', dealIntent: 'sell', strategies: [strategy], qualification: { minimumLeadScore: 65 } }) };
  await trx('b2c_campaigns').insert(runCampaign);
  await trx('wallets').where({ id: a.wallet }).update({ balance_halalas: 1000 });
  const ads = Array.from({ length: 4 }, (_, i) => ({ id: 999999200 + i, authorId: 999999200 + i, authorUsername: `pipeline-${i}`, title: 'بي سي قيمنق للبيع', bodyTEXT: i === 0 ? 'استخدام شخصي جوال ٠٥٠١٢٣٤٥٦٧' : 'استخدام شخصي', city: 'Riyadh' }));
  const qualifiedIds = new Set();
  const contactIds = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      const input = JSON.parse(body.messages[1].content);
      assert.ok(input.advertisements, 'query generation is never invoked');
      const items = input.advertisements.map(ad => {
        const strong = ad.postId !== 999999203;
        if (strong) qualifiedIds.add(ad.postId);
        return { postId: ad.postId, verdict: strong ? 'STRONG' : 'REJECT', ...qualification, scoreScale: 100, score: strong ? 85 : 0, competitorProbability: strong ? 0 : 100, irrelevantProbability: 0, negativeSignals: [] };
      });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ items }) } }] });
    }
    assert.equal(url, 'https://source.invalid/graphql', 'all real paid requests blocked');
    if (body.variables.search) return Response.json({ data: { search: { items: ads, pageInfo: { hasNextPage: false } } } });
    const postId = body.variables.postId;
    assert.ok(qualifiedIds.has(postId), 'qualification must precede contact');
    contactIds.push(postId);
    const count = await trx('b2c_leads').where({ campaign_id: runCampaign.id }).count('id as count').first();
    assert.equal(Number(count.count), 1, 'public-phone lead is already durable before next lookup');
    return Response.json({ data: { postContact: { contactMobile: postId === 999999201 ? null : '+966501234568' } } });
  };
  const runStats = await runB2CCampaign({ database: trx, campaignId: runCampaign.id, env: { OPENROUTER_API_KEY: 'test', HARAJ_BEARER_TOKEN: 'test', HARAJ_GRAPHQL_BASE_URL: 'https://source.invalid/graphql', B2C_CONTACT_CONCURRENCY: 1, B2C_JEV_SHADOW: 'false' }, logger: { warn() {}, error() {} } });
  assert.equal(runStats.uniqueLeads, 2);
  assert.deepEqual(contactIds, [999999201, 999999202], 'no lookup for public phone or rejected ad; empty lookup releases slot');
  assert.equal(Number((await trx('lead_requests').where({ id: runRequest.id }).first()).result_count), 2);
  const capped = await persistQualifiedB2CLead(trx, runCampaign, { ...candidate, authorId: 999999300 }, qualification, { contactMobile: '+966501234569' }, true);
  assert.equal(capped.reason, 'target_reached');
  assert.equal(Number((await trx('wallets').where({ id: a.wallet }).first()).balance_halalas), 800);
  const duplicateRequest = { ...runRequest, id: randomUUID(), idempotency_key: randomUUID() };
  await trx('lead_requests').insert(duplicateRequest);
  const duplicateCampaign = { ...runCampaign, id: randomUUID(), request_id: duplicateRequest.id };
  await trx('b2c_campaigns').insert(duplicateCampaign);
  const duplicate = await persistQualifiedB2CLead(trx, duplicateCampaign, { ...candidate, authorId: 999999999 }, qualification, { contactMobile: '+966501234567' }, true);
  assert.equal(duplicate.reason, 'duplicate', 'workspace dedupe is checked inside the saving transaction');
  assert.equal(duplicate.committedCount, 0, 'duplicates do not increment delivery');
  assert.equal(Number((await trx('wallets').where({ id: a.wallet }).first()).balance_halalas), 800, 'duplicate cannot charge');
  await trx('b2c_campaigns').where({ id: duplicateCampaign.id }).update({ status: 'RUNNING' });
  assert.equal((await call(b, 'post', '/b2c/campaigns/:id/cancel', {}, { id: duplicateCampaign.id })).status, 404, 'another workspace cannot stop the run');
  assert.equal((await call(a, 'post', '/b2c/campaigns/:id/cancel', {}, { id: duplicateCampaign.id })).data.status, 'CANCELLED');
  assert.equal((await call(a, 'post', '/b2c/campaigns/:id/cancel', {}, { id: duplicateCampaign.id })).data.status, 'CANCELLED', 'repeated stop is idempotent');
  const afterStop = await persistQualifiedB2CLead(trx, duplicateCampaign, { ...candidate, authorId: 999999998 }, qualification, { contactMobile: '+966501234569' }, true);
  assert.equal(afterStop.reason, 'cancelled', 'late contact results cannot save after cancellation');
  await runB2CCampaign({ database: trx, campaignId: duplicateCampaign.id, env: {}, logger: {} });
  assert.equal((await trx('lead_requests').where({ id: duplicateRequest.id }).first()).status, 'cancelled', 'queued continuation cannot restart a cancelled run');
  assert.equal(Number((await trx('wallets').where({ id: a.wallet }).first()).balance_halalas), 800, 'stopped run cannot charge');
  console.log('PASS: stop authorization, idempotency, late-save prevention, no charging and no queued restart.');
  await trx('b2c_campaigns').where({ id: duplicateCampaign.id }).update({ status: 'RUNNING' });
  await trx('lead_requests').where({ id: duplicateRequest.id }).update({ status: 'sourcing' });
  let signalStarted;
  const searchStarted = new Promise(resolve => { signalStarted = resolve; });
  let aborted = false;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(options.signal.reason); }, { once: true });
    signalStarted();
  });
  const activeRun = runB2CCampaign({ database: trx, campaignId: duplicateCampaign.id, env: { HARAJ_BEARER_TOKEN: 'test', HARAJ_GRAPHQL_BASE_URL: 'https://source.invalid/graphql' }, logger: {} });
  await searchStarted;
  await call(a, 'post', '/b2c/campaigns/:id/cancel', {}, { id: duplicateCampaign.id });
  await activeRun;
  assert.equal(aborted, true, 'Stop aborts an in-flight HTTP search rather than merely hiding animation');
  assert.equal((await trx('b2c_campaigns').where({ id: duplicateCampaign.id }).first()).status, 'CANCELLED');
  console.log('PASS: in-flight provider request aborted and cancellation preserved.');
  const keywordRequest = { ...runRequest, id: randomUUID(), idempotency_key: randomUUID(), target_count: 1 };
  await trx('lead_requests').insert(keywordRequest);
  const compiled = compileKeywordPlan({ productTerms: ['بي سي', 'PC'], intentTerms: ['مطلوب'], buyerQueries: ['مطلوب بي سي'], ownerTerms: [{ term: 'بي سي', aliases: ['بي سي', 'PC'] }], titleExclusions: ['جراب'], commercialTerms: ['متجر'] }, ['Riyadh']);
  const keywordCampaign = { ...runCampaign, id: randomUUID(), request_id: keywordRequest.id, target_lead_count: 1, acquisition_plan: JSON.stringify({ product: 'PC', dealIntent: 'sell', keywordMatching: compiled.matching, strategies: compiled.strategies, qualification: { minimumLeadScore: 0 } }) };
  await trx('b2c_campaigns').insert(keywordCampaign);
  const searched = [];
  let keywordContacts = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://source.invalid/graphql', 'keyword mode must never call an AI provider, even with Jev enabled');
    const body = JSON.parse(options.body);
    if (body.variables.search) {
      searched.push(body.variables.search);
      const items = body.variables.search === 'مطلوب بي سي' ? [] : [
        { id: 999998801, authorId: 999998801, title: 'جراب بي سي', bodyTEXT: '', city: 'Riyadh' },
        { id: 999998802, authorId: 999998802, title: 'PC للبيع استعمال شخصي', bodyTEXT: '', city: 'Riyadh' },
      ];
      return Response.json({ data: { search: { items, pageInfo: { hasNextPage: false } } } });
    }
    assert.equal(body.variables.postId, 999998802, 'excluded listing cannot trigger contact lookup');
    keywordContacts++;
    return Response.json({ data: { postContact: { contactMobile: '+966501234570' } } });
  };
  await runB2CCampaign({ database: trx, campaignId: keywordCampaign.id, env: { OPENROUTER_API_KEY: 'test', B2C_JEV_SHADOW: 'true', B2C_JEV_OPENROUTER_API_KEY: 'test', HARAJ_BEARER_TOKEN: 'test', HARAJ_GRAPHQL_BASE_URL: 'https://source.invalid/graphql' }, logger: {} });
  let keywordFinished;
  for (let i = 0; i < 20; i++) {
    keywordFinished = await trx('b2c_campaigns').where({ id: keywordCampaign.id }).first();
    if (['COMPLETED', 'FAILED'].includes(keywordFinished.status)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(keywordFinished.status, 'COMPLETED', keywordFinished.error_message);
  assert.deepEqual(searched, ['مطلوب بي سي', 'بي سي']);
  assert.equal(keywordContacts, 1);
  const keywordLead = await trx('b2c_leads').where({ campaign_id: keywordCampaign.id }).first();
  assert.match(keywordLead.explanation, /buying intent is unconfirmed/);
  assert.equal(keywordLead.score, 65);
  console.log('PASS: keyword buyer-first/owner fallback delivers through real DB with zero AI calls and no contact lookup for excluded ads.');
  assert.equal((await call(a, 'get', '/admin/b2c-listing-limits')).status, 403);
  assert.equal((await call(a, 'put', '/admin/b2c-listing-limits', { limits: {30:3,50:5,200:60000} })).status, 403);
  const policyId = randomUUID();
  await trx('directus_policies').insert({ id: policyId, name: 'Rollback limit admin', admin_access: true });
  await trx('directus_access').insert({ id: randomUUID(), user: a.user, policy: policyId });
  assert.equal((await call(a, 'put', '/admin/b2c-listing-limits', { limits: {30:-1,50:5,200:60000} })).status, 400);
  assert.equal((await call(a, 'put', '/admin/b2c-listing-limits', { limits: {30:3,50:5,200:60000} })).status, 200);
  assert.equal((await call(a, 'get', '/admin/b2c-listing-limits')).data.limits[200], 60000);
  const cappedRequest = { ...runRequest, id: randomUUID(), idempotency_key: randomUUID(), target_count: 30 };
  await trx('lead_requests').insert(cappedRequest);
  const cappedCampaign = { ...keywordCampaign, id: randomUUID(), request_id: cappedRequest.id, target_lead_count: 30 };
  await trx('b2c_campaigns').insert(cappedCampaign);
  let requestedListings = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://source.invalid/graphql');
    const body = JSON.parse(options.body);
    assert.ok(body.variables.search, 'rejected listings must not trigger contact requests');
    requestedListings += body.variables.limit;
    return Response.json({ data: { search: { items: Array.from({ length: body.variables.limit }, (_, i) => ({ id: 8888000 + i, title: 'unrelated', bodyTEXT: '' })), pageInfo: { hasNextPage: true } } } });
  };
  const cappedStats = await runB2CCampaign({ database: trx, campaignId: cappedCampaign.id, env: { HARAJ_BEARER_TOKEN: 'test', HARAJ_GRAPHQL_BASE_URL: 'https://source.invalid/graphql' }, logger: {} });
  assert.equal(requestedListings, 3);
  assert.equal(cappedStats.listingLimitSnapshot, 3);
  assert.equal(cappedStats.listingsFetchedTotal, 3);
  assert.match((await trx('b2c_campaigns').where({id:cappedCampaign.id}).first()).error_message, /configured limit of 3/);
  console.log('PASS: admin-only validated limits persist, audit, and enforce exact listing cutoff in the runner.');
  console.log('PASS: full B2C pipeline qualifies before contact, bypasses public phones, releases empty slots, commits immediately and enforces target/billing atomically.');
  console.log('PASS: balance gate, accepted jobs, duplicate starts/callbacks, actual-delivery billing, visible contacts/logo, tenant isolation, B2C research gate, 200 results and quantity cap.');
} finally {
  globalThis.fetch = originalFetch;
  await trx.rollback();
  await db.destroy();
  console.log('All QA fixtures rolled back. No real source runs or customer credit changes.');
}
