// Run in the existing Directus container; all test data is rolled back.
// docker exec -i waslah_directus node --input-type=module < scripts/test-lead-core.mjs
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import endpoint from '/directus/extensions/directus-extension-waslah-lead-agent/dist/index.js';
import { persistQualifiedB2CLead } from '/directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
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
  const candidate = { postId: 999999123, authorId: 999999123, authorUsername: 'QA individual', city: 'Riyadh', title: 'QA item', tags: ['QA'], matchedStrategy: { tagName: 'QA', strategyType: 'DIRECT_INTENT', weight: 1 } };
  const qualification = { score: 85, identityConfidence: 85, purchasePropensity: 80, evidenceStrength: 85, marketplaceRole: 'SELLER', explanation: 'Synthetic persistence test', matchedSignals: ['QA'] };
  const inventoryId = await persistQualifiedB2CLead(trx, campaign, candidate, qualification, { contactMobile: '+966500000002' });
  await persistQualifiedB2CLead(trx, campaign, candidate, qualification, { contactMobile: '+966500000002' });
  const stored = await trx('b2c_leads').where({ campaign_id: campaign.id });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].inventory_id, inventoryId, 'inventory exists before required reference is inserted');
  assert.equal(Number((await trx('wallets').where({ id: a.wallet }).first()).balance_halalas), 0, 'B2C persistence bills once');
  assert.equal((await call(a, 'get', '/b2c/campaigns/:id/leads', {}, { id: campaign.id }, { limit: 30 })).data.length, 1, 'B2C endpoint returns persisted result');
  console.log('PASS: balance gate, accepted jobs, duplicate starts/callbacks, actual-delivery billing, visible contacts/logo, tenant isolation, B2C research gate, 200 results and quantity cap.');
} finally {
  globalThis.fetch = originalFetch;
  await trx.rollback();
  await db.destroy();
  console.log('All QA fixtures rolled back. No real source runs or customer credit changes.');
}
