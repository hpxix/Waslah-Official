import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptSocialCredentials, decryptSocialCredentials, growthServiceEnv,
  contentEditUpdates, claimContentPublishing, publishingFailureState, normalizeSocialCredentials,
} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/index.js';

const env = { SOCIAL_TOKEN_ENCRYPTION_KEY: 'test-only-encryption-secret-at-least-24-chars', POSTIZ_BASE_URL: 'https://publisher.example/public/v1', CHATWOOT_BASE_URL: 'https://inbox.example' };
function database(rows) {
  return () => {
    let matches = () => true;
    const query = {
      where(values) { const previous = matches; matches = row => previous(row) && Object.entries(values).every(([key, value]) => row[key] === value); return query; },
      whereIn(key, values) { const previous = matches; matches = row => previous(row) && values.includes(row[key]); return query; },
      orderBy() { return query; },
      async first() { return rows.find(matches); },
      async update(values) { const found = rows.filter(matches); found.forEach(row => Object.assign(row, values)); return found.length; },
    };
    return query;
  };
}

test('credentials are randomized, authenticated, and never stored as plaintext', () => {
  const credentials = { api_key: 'test-customer-key' };
  const encrypted = encryptSocialCredentials(env, credentials);
  assert.ok(!encrypted.includes(credentials.api_key));
  assert.notEqual(encrypted, encryptSocialCredentials(env, credentials));
  assert.deepEqual(decryptSocialCredentials(env, encrypted), credentials);
  assert.throws(() => decryptSocialCredentials({ ...env, SOCIAL_TOKEN_ENCRYPTION_KEY: 'different-key-long-enough-for-testing' }, encrypted));
  const parts = encrypted.split('.');
  parts[2] = Buffer.alloc(16).toString('base64url');
  assert.throws(() => decryptSocialCredentials(env, parts.join('.')));
});

test('server service keys are not implicitly shared with any tenant', async () => {
  const shared = { ...env, POSTIZ_API_KEY: 'server-key', CHATWOOT_API_ACCESS_TOKEN: 'server-token', CHATWOOT_ACCOUNT_ID: '1' };
  assert.equal(await growthServiceEnv(database([]), shared, 'tenant-a', 'postiz'), null);
  assert.equal(await growthServiceEnv(database([]), shared, 'tenant-a', 'chatwoot'), null);
  assert.equal((await growthServiceEnv(database([]), { ...shared, POSTIZ_ORGANIZATION_ID: 'tenant-a' }, 'tenant-a', 'postiz')).POSTIZ_API_KEY, 'server-key');
  assert.equal(await growthServiceEnv(database([]), { ...shared, POSTIZ_ORGANIZATION_ID: 'tenant-a' }, 'tenant-b', 'postiz'), null);
});

test('service routing decrypts only the requesting tenant credentials', async () => {
  const rows = ['tenant-a', 'tenant-b'].flatMap((organization_id, index) => [
    { organization_id, provider: 'postiz', credentials_encrypted: encryptSocialCredentials(env, { api_key: organization_id + '-key' }) },
    { organization_id, provider: 'chatwoot', credentials_encrypted: encryptSocialCredentials(env, { account_id: String(index + 1), access_token: organization_id + '-token' }) },
  ]);
  for (const tenant of ['tenant-a', 'tenant-b']) {
    const postiz = await growthServiceEnv(database(rows), env, tenant, 'postiz');
    assert.equal(postiz.POSTIZ_API_KEY, tenant + '-key');
    assert.deepEqual(Object.keys(postiz).sort(), ['POSTIZ_API_KEY', 'POSTIZ_BASE_URL']);
    const chatwoot = await growthServiceEnv(database(rows), env, tenant, 'chatwoot');
    assert.equal(chatwoot.CHATWOOT_API_ACCESS_TOKEN, tenant + '-token');
  }
  assert.equal(await growthServiceEnv(database(rows), env, 'tenant-c', 'postiz'), null);
  assert.equal(await growthServiceEnv(database(rows), {}, 'tenant-a', 'postiz'), null);
});

test('invalid Chatwoot account IDs and missing keys are rejected', () => {
  assert.throws(() => normalizeSocialCredentials('chatwoot', { account_id: '../2', access_token: 'token' }), { code: 'INVALID_CHATWOOT_ACCOUNT' });
  assert.throws(() => normalizeSocialCredentials('postiz', {}), { code: 'SOCIAL_CREDENTIALS_INCOMPLETE' });
});

test('content edits reset approval, including attempts to edit and approve together', () => {
  const item = { status: 'draft', approval_status: 'approved' };
  const update = contentEditUpdates(item, { copy: 'New copy', approval_status: 'approved' });
  assert.equal(update.approval_status, 'pending');
  assert.equal(update.status, 'draft');
  assert.equal(contentEditUpdates(item, { approval_status: 'approved' }).approval_status, 'approved');
  assert.throws(() => contentEditUpdates(item, { title: '' }), { code: 'CONTENT_REQUIRED' });
  assert.throws(() => contentEditUpdates(item, { scheduled_for: 'invalid-date' }), { code: 'INVALID_SCHEDULE_DATE' });
  for (const status of ['publishing', 'scheduled', 'published', 'unknown']) assert.throws(() => contentEditUpdates({ status }, { copy: 'changed' }), { code: 'CONTENT_LOCKED' });
});

test('only one concurrent publishing request can claim the approved version', async () => {
  const item = { id: 'content-1', organization_id: 'tenant-a', status: 'draft', approval_status: 'approved', updated_at: '2026-09-09T00:00:00Z' };
  const rows = [{ ...item }];
  const db = database(rows);
  const results = await Promise.allSettled([claimContentPublishing(db, item, 'tenant-a'), claimContentPublishing(db, item, 'tenant-a')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(rows[0].status, 'publishing');
  await assert.rejects(claimContentPublishing(db, item, 'tenant-b'), { code: 'CONTENT_CHANGED' });
});

test('stale versions cannot publish after an edit', async () => {
  const stale = { id: '1', organization_id: 'a', status: 'draft', approval_status: 'approved', updated_at: 'old' };
  await assert.rejects(claimContentPublishing(database([{ ...stale, updated_at: 'new' }]), stale, 'a'), { code: 'CONTENT_CHANGED' });
});

test('ambiguous provider outcomes cannot be retried automatically', () => {
  assert.equal(publishingFailureState(false, new Error('upload failed')), 'failed');
  assert.equal(publishingFailureState(true, new Error('network timeout')), 'unknown');
  assert.equal(publishingFailureState(true, { code: 'POSTIZ_REQUEST_FAILED', providerStatus: 500 }), 'unknown');
  assert.equal(publishingFailureState(true, { code: 'POSTIZ_REQUEST_FAILED', providerStatus: 422 }), 'failed');
});
