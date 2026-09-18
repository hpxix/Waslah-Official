// Run inside the existing Directus container. All fixtures use a rolled-back transaction.
// docker exec -i waslah_directus node --input-type=module < scripts/test-growth-integration.mjs
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import endpoint, { encryptSocialCredentials } from '/directus/extensions/directus-extension-waslah-lead-agent/dist/index.js';
const require = createRequire(import.meta.url);
const apiRequire = createRequire(require.resolve('@directus/api'));
const knex = apiRequire('knex');
const db = knex({ client: 'pg', connection: { host: process.env.DB_HOST, port: process.env.DB_PORT || 5432, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE } });
const trx = await db.transaction();
const originalFetch = globalThis.fetch;
let submissionCount = 0;
const testEnv = { SOCIAL_TOKEN_ENCRYPTION_KEY: 'growth-integration-test-secret-32chars', POSTIZ_BASE_URL: 'https://postiz.invalid/public/v1', CHATWOOT_BASE_URL: 'https://chatwoot.invalid' };
const routes = new Map();
const router = Object.fromEntries(['get', 'post', 'patch', 'put', 'delete'].map(method => [method, (path, handler) => routes.set(`${method} ${path}`, handler)]));
const logger = { error() {}, info() {}, warn() {} };
const tenantA = { org: randomUUID(), user: randomUUID(), name: 'a' };
const tenantB = { org: randomUUID(), user: randomUUID(), name: 'b' };
async function request(tenant, method, path, body = {}, id) {
  let status = 200;
  let result;
  const response = { status(code) { status = code; return response; }, json(value) { result = value; return response; } };
  await routes.get(`${method} ${path}`)({ accountability: { user: tenant.user }, body, params: { id }, query: {} }, response);
  return { status, ...result };
}
try {
  endpoint.handler(router, { services: {}, database: trx, env: testEnv, logger, getSchema: async () => ({}) });
  for (const tenant of [tenantA, tenantB]) {
    await trx('organizations').insert({ id: tenant.org, name: `Growth rollback QA ${tenant.name}`, slug: `growth-qa-${tenant.org}`, status: 'active' });
    await trx('customer_profiles').insert({ id: randomUUID(), user_id: tenant.user, organization_id: tenant.org, phone_e164: `qa-${tenant.org.slice(0, 16)}`, avatar_seed: 'qa', locale: 'en' });
    for (const provider of ['postiz', 'chatwoot']) {
      const credentials = provider === 'postiz' ? { api_key: `key-${tenant.name}` } : { access_token: `token-${tenant.name}`, account_id: tenant.name === 'a' ? '1' : '2' };
      await trx('social_connections').insert({ id: randomUUID(), organization_id: tenant.org, provider, display_name: provider, credentials_encrypted: encryptSocialCredentials(testEnv, credentials), updated_at: new Date().toISOString() });
    }
  }
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'postiz.invalid') {
      const tenant = options.headers.Authorization === 'key-a' ? 'a' : options.headers.Authorization === 'key-b' ? 'b' : null;
      assert.ok(tenant, 'request uses a scoped test workspace key');
      if (parsed.pathname.endsWith('/integrations')) return Response.json([{ id: `facebook-${tenant}`, name: `Farm ${tenant}`, identifier: 'facebook', disabled: false }]);
      if (parsed.pathname.endsWith('/posts')) {
        submissionCount += 1;
        assert.equal(JSON.parse(options.body).posts[0].integration.id, `facebook-${tenant}`);
        return Response.json([{ postId: `scheduled-${tenant}`, integration: `facebook-${tenant}` }]);
      }
    }
    if (parsed.hostname === 'chatwoot.invalid') {
      const account = options.headers.api_access_token === 'token-a' ? '1' : '2';
      assert.ok(parsed.pathname.startsWith(`/api/v1/accounts/${account}/`), 'inbox token and tenant account stay aligned');
      return Response.json({ data: { payload: [{ id: Number(account), meta: { sender: { name: `Customer ${account}` } }, messages: [] }] } });
    }
    throw new Error('Unexpected outbound call blocked by test');
  };
  const synced = await request(tenantA, 'post', '/growth/publishing/sync');
  assert.equal(synced.status, 200, JSON.stringify(synced));
  assert.equal(synced.data.synced, 1);
  await request(tenantA, 'post', '/growth/publishing/sync');
  const channels = await trx('social_connections').where({ organization_id: tenantA.org, provider: 'facebook' });
  assert.equal(channels.length, 1, 'repeat sync does not duplicate the publishing account');
  assert.equal((await trx('social_connections').where({ organization_id: tenantB.org, provider: 'facebook' })).length, 0);
  const created = await request(tenantA, 'post', '/growth/content', { title: 'QA draft', copy: 'Synthetic test copy', channel: 'facebook', connection_id: channels[0].id });
  assert.equal(created.status, 201, JSON.stringify(created));
  const id = created.data.id;
  assert.equal((await request(tenantB, 'patch', '/growth/content/:id', { copy: 'other tenant' }, id)).status, 404);
  assert.equal((await request(tenantA, 'post', '/growth/content/:id/publish', {}, id)).status, 409);
  assert.equal(submissionCount, 0);
  assert.equal((await request(tenantA, 'patch', '/growth/content/:id', { approval_status: 'approved' }, id)).data.approval_status, 'approved');
  assert.equal((await request(tenantA, 'patch', '/growth/content/:id', { copy: 'Revised', approval_status: 'approved' }, id)).data.approval_status, 'pending');
  await request(tenantA, 'patch', '/growth/content/:id', { approval_status: 'approved' }, id);
  const published = await request(tenantA, 'post', '/growth/content/:id/publish', {}, id);
  assert.equal(published.status, 200, JSON.stringify(published));
  assert.equal(published.data.status, 'scheduled');
  await request(tenantA, 'post', '/growth/content/:id/publish', {}, id);
  assert.equal(submissionCount, 1, 'repeat scheduling returns the original receipt');
  assert.equal((await request(tenantA, 'patch', '/growth/content/:id', { copy: 'late edit' }, id)).status, 409);
  for (const [tenant, contact] of [[tenantA, 'Customer 1'], [tenantB, 'Customer 2']]) {
    const inbox = await request(tenant, 'get', '/growth/inbox');
    assert.equal(inbox.data.conversations[0].contact.name, contact);
    const publicConnections = await request(tenant, 'get', '/socials/connections');
    assert.ok(!JSON.stringify(publicConnections).includes('credentials_encrypted'));
    assert.ok(!JSON.stringify(publicConnections).includes(`key-${tenant.name}`));
  }
  console.log('PASS: real database routes; tenant isolation; account sync; approval reset; duplicate scheduling; immutable submissions; inbox routing; secret redaction.');
} finally {
  globalThis.fetch = originalFetch;
  await trx.rollback();
  await db.destroy();
  console.log('All synthetic fixtures rolled back; no real social API calls made.');
}
