import assert from 'node:assert/strict';
import { hasSuperiorAccess, effectiveFeatureEnabled, platformAdminUrl, applyAdminPolicyScope } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/admin-access.js';
const admin = { status: 'active', admin_access: true };
assert.equal(hasSuperiorAccess(admin), true);
for (const identity of [null, {}, { isAdmin: true }, { email: 'admin@example.com' }, { status: 'active', admin_access: 'true' }, { status: 'suspended', admin_access: true }, { status: 'active', admin_access: false }]) assert.equal(hasSuperiorAccess(identity), false);
assert.equal(effectiveFeatureEnabled(false, { enabled: false }, admin), true, 'trusted active admin bypasses customer/global model locks');
assert.equal(effectiveFeatureEnabled(false, null, null), false);
assert.equal(effectiveFeatureEnabled(true, { enabled: false }, { status: 'active', admin_access: false }), false, 'customer override remains enforced');
assert.equal(effectiveFeatureEnabled(false, { enabled: true }, null), true);
assert.equal(platformAdminUrl('http://localhost:8055'), 'http://localhost:8055/admin/');
assert.equal(platformAdminUrl('https://example.com/directus'), 'https://example.com/directus/admin/');
assert.equal(platformAdminUrl('javascript:alert(1)'), null);
assert.equal(platformAdminUrl('https://secret@example.com'), null);
for (const role of [null, undefined, '', 'verified-role']) {
  const conditions = [];
  const builder = { where(key, value) { conditions.push(['where', key, value]); return this; }, orWhere(key, value) { conditions.push(['or', key, value]); return this; } };
  applyAdminPolicyScope(builder, 'verified-user', role);
  assert.deepEqual(conditions[0], ['where', 'access.user', 'verified-user']);
  assert.equal(conditions.length, role ? 2 : 1, 'roleless accounts cannot match unrelated directly assigned admin policies');
}
console.log('Admin access checks passed: server identity, revocation, customer isolation and safe advanced-admin links.');
