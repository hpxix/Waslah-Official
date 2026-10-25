// Feed to node --input-type=module inside Directus. Local API only.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
const base = 'http://127.0.0.1:8055';
let temporaryUser;
let adminToken;
async function request(path, token, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function login(email, password) {
  const result = await request('/auth/login', null, 'POST', { email, password });
  assert.equal(result.status, 200, 'local authentication must succeed');
  return result.body.data.access_token;
}
try {
  adminToken = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  const scope = await request('/lead-agent/admin/control-scope', adminToken);
  assert.equal(scope.status, 200);
  assert.equal(scope.body.data.superior_access, true);
  assert.equal(scope.body.data.provider_restrictions_bypassed, false);
  const flags = await request('/lead-agent/admin/features', adminToken);
  const adminCaps = await request('/lead-agent/capabilities', adminToken);
  assert.equal(adminCaps.status, 200);
  for (const flag of flags.body.data.features) assert.equal(adminCaps.body.data.features[flag.key], true, `admin may access ${flag.key} even if globally locked`);
  assert.equal((await request('/lead-agent/admin/control-scope', null)).status, 401);
  const email = `admin-access-test-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const created = await request('/users', adminToken, 'POST', { email, password, first_name: 'Temporary authorization test', role: process.env.WASLAH_CUSTOMER_ROLE_ID || '8c62f1c4-258c-4d77-92f2-33f87db31765', status: 'active' });
  assert.ok([200, 201].includes(created.status), 'create isolated temporary customer');
  temporaryUser = created.body.data.id;
  assert.match(temporaryUser, /^[0-9a-f-]{36}$/);
  const customerToken = await login(email, password);
  assert.equal((await request('/lead-agent/admin/control-scope', customerToken)).status, 403);
  assert.equal((await request('/lead-agent/admin/providers', customerToken)).status, 403);
  const customerCaps = await request('/lead-agent/capabilities', customerToken);
  assert.equal(customerCaps.status, 200);
  for (const flag of flags.body.data.features) assert.equal(customerCaps.body.data.features[flag.key], flag.enabled_global, 'temporary customer retains global restrictions');
  console.log(JSON.stringify({ adminCapabilities: 'all_enabled', normalCustomerAdminAccess: 'denied', normalCustomerFlags: 'unchanged', providerCalls: 0 }));
} finally {
  if (temporaryUser && adminToken) {
    const removed = await request(`/users/${temporaryUser}`, adminToken, 'DELETE');
    assert.equal(removed.status, 204, 'remove only the temporary test identity');
    console.log('Temporary authorization-test user removed.');
  }
}
