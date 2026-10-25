// Execute inside the existing Directus container. All provider and AI calls are mocks.
// All SQL changes, including any new tables, are rolled back at the end.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import knexFactory from '/directus/node_modules/.pnpm/knex@3.1.0_mysql2@3.15.3_pg@8.16.3_sqlite3@5.1.7_tedious@18.6.1/node_modules/knex/knex.js';
import { createAstraeusRouter, ASTRAEUS_DEFAULTS } from '/directus/extensions/directus-extension-waslah-lead-agent/dist/astraeus-router.js';

const database = knexFactory({ client: 'pg', connection: { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD }, pool: { min: 0, max: 1 } });
const rollback = new Error('ROLLBACK_TEST_FIXTURES');
let launches = 0, usage = 0, uncertain = false;
const accountId = `router-test-${randomUUID()}`;
const record = { name: 'Test Contact', company: 'Test Company', phone: '+966551234567', country: 'Saudi Arabia', city: 'Riyadh' };
async function fetcher(url, options = {}) {
  assert.ok(url.startsWith('https://api.apify.com/v2/'));
  const parsed = new URL(url), path = parsed.pathname.replace('/v2', '');
  let body;
  if (path === '/users/me') body = { data: { id: accountId, plan: { id: 'FREE', monthlyBasePriceUsd: 0, monthlyUsageCreditsUsd: 5 } } };
  else if (path === '/users/me/limits') body = { data: { monthlyUsageCycle: { startAt: 'test-cycle' }, limits: { maxMonthlyUsageUsd: 5 }, current: { monthlyUsageUsd: usage, activeActorJobCount: 0 } } };
  else if (path.startsWith('/acts/')) body = { data: { id: path.split('/').at(-1), currentPricingInfo: { pricingModel: 'PRICE_PER_DATASET_ITEM', pricePerUnitUsd: .001 }, stats: { actorReviewRating: 5, actorReviewCount: 100 } } };
  else if (path.endsWith('/builds/default')) body = { data: { buildNumber: '1.0.0', inputSchema: { type: 'object', properties: { companyLocationCountryIncludes: { type:'array' }, totalResults:{type:'integer'}, hasPhone:{type:'boolean'}, hasEmail:{type:'boolean'}, roleMatchMode:{type:'string'},companyMatchMode:{type:'string'} } } } };
  else if (path.endsWith('/validate-input')) { assert.equal(options.method, 'POST'); body = { valid: true }; }
  else if (path.endsWith('/runs')) {
    assert.equal(options.method, 'POST');
    assert.equal(parsed.searchParams.get('forcePermissionLevel'), 'LIMITED_PERMISSIONS');
    assert.ok(Number(parsed.searchParams.get('maxTotalChargeUsd')) <= .5);
    assert.equal(parsed.searchParams.get('restartOnError'), 'false');
    assert.equal(parsed.searchParams.get('build'), '1.0.0');
    launches++;
    if (uncertain) throw new Error('Simulated lost launch response');
    body = { data: { id: `fixture-run-${launches}`, status: 'SUCCEEDED', defaultDatasetId: 'fixture-dataset' } };
  } else if (path === '/datasets/fixture-dataset/items') body = [record];
  else throw new Error(`Unexpected mocked provider request: ${path}`);
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
async function ask(instructions) {
  assert.ok(instructions.startsWith('Review relevance'), 'AI may review relevance only, never choose a source or create provider input');
  return { leads: [{ index: 0, ...record, accepted: true, matches_requested_criteria: true, location: 'Riyadh', reason: 'Fixture fit' }] };
}
try {
  await database.transaction(async trx => {
    const engine = createAstraeusRouter({ database: trx, env: { APIFY_TOKEN: 'fixture-not-a-real-token' }, ask, fetcher });
    await engine.updateSettings(ASTRAEUS_DEFAULTS);
    const request = { id: randomUUID(), query: 'Test company Saudi Arabia', criteria: {}, target_count: 1 };
    const result = await engine.execute(request);
    assert.equal(result.leads.length, 1);
    assert.equal(result.leads[0].phone, record.phone);
    assert.equal(launches, 1);
    await assert.rejects(engine.execute(request), /already has a provider reservation/);
    assert.equal(launches, 1, 'Replay must not launch another Actor');
    usage = 4.99;
    await assert.rejects(engine.execute({ ...request, id: randomUUID() }), /credits are exhausted/);
    assert.equal(launches, 1, 'No launch when account budget exhausted');
    usage = 0; uncertain = true;
    await assert.rejects(engine.execute({ ...request, id: randomUUID(), criteria: { model: 'astraeus_ultra' } }), /lost launch response/);
    assert.equal(launches, 2);
    await assert.rejects(engine.execute({ ...request, id: randomUUID() }), /reconciliation/);
    assert.equal(launches, 2, 'Uncertain launch blocks further Actor starts');
    const rows = await trx('wasla_astraeus_runs').where({ account_id: accountId });
    assert.equal(rows.filter(row=>Number(row.reserved_usd)>0).length, 2);
    assert.ok(rows.some(row => row.status === 'uncertain'));
    assert.ok(rows.some(row => row.status === 'selection_failed' && row.audit.error), 'Pre-launch failures retain a zero-cost audit');
    throw rollback;
  });
} catch (error) { if (error !== rollback) throw error; }
finally { await database.destroy(); }
console.log('Mocked-provider SQL reservation, replay, exhaustion and uncertain-launch tests passed. All SQL rolled back; no external calls.');
