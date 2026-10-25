// Run inside the Directus container, feeding this file to node --input-type=module.
// Creates and removes only a unique isolated test schema. Never calls a provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createHarajSafety, postgresHarajStore, DEFAULT_HARAJ_LIMITS } from '/directus/extensions/directus-extension-waslah-lead-agent/dist/haraj-safety.js';

const require = createRequire(import.meta.url);
const folder = readdirSync('/directus/node_modules/.pnpm').find(name => name.startsWith('knex@'));
const knex = require(`/directus/node_modules/.pnpm/${folder}/node_modules/knex`);
const connection = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD };
const root = knex({ client: 'pg', connection });
const schema = `haraj_safety_test_${randomUUID().replaceAll('-', '')}`;
const databases = [];
let created = false;
globalThis.fetch = () => { throw new Error('Network fetch is forbidden in this test.'); };
try {
  await root.raw(`CREATE SCHEMA "${schema}"`); created = true;
  const makeGuard = () => {
    const database = knex({ client: 'pg', connection, searchPath: [schema], pool: { min: 0, max: 2 } });
    databases.push(database);
    return createHarajSafety({ store: postgresHarajStore(database), notify: async () => true });
  };
  const a = makeGuard(); const b = makeGuard();
  const statuses = await Promise.all([a.status(), b.status()]);
  assert.ok(statuses.every(state => state.paused), 'concurrent cold starts initialize paused');
  await a.control({ action: 'resume', confirmed: true, actor: 'offline-test', limits: { ...DEFAULT_HARAJ_LIMITS, intervalMs: 1000, contactsPerDay: 2 } });
  let active = 0; let peak = 0; const starts = [];
  const operation = async () => {
    peak = Math.max(peak, ++active); starts.push(Date.now());
    await new Promise(resolve => setTimeout(resolve, 20)); active--;
    return { value: { postContact: { contactMobile: 'synthetic' } }, empty: false };
  };
  await Promise.all([a.execute({ kind: 'contact', cacheKey: 'a' }, operation), b.execute({ kind: 'contact', cacheKey: 'b' }, operation)]);
  assert.equal(peak, 1);
  assert.ok(starts[1] - starts[0] >= 1000);
  await b.execute({ kind: 'contact', cacheKey: 'c' }, () => assert.fail('phone budget prevents I/O'));
  const restarted = makeGuard();
  const state = await restarted.status();
  assert.equal(state.paused, false);
  assert.equal(state.contactsPaused, true);
  assert.equal(state.contacts, 2);
  assert.equal(state.requests, 2);
  assert.ok(!Object.hasOwn(state, 'cache'));
  await restarted.execute({ kind: 'contact', cacheKey: 'd' }, () => assert.fail('phone pause survives restart'));
  assert.equal(starts.length, 2);
  await restarted.execute({ kind: 'search' }, () => ({ value: { search: { items: [] } }, empty: false }));
  await restarted.control({ action: 'pause' });
  await assert.rejects(() => makeGuard().execute({ kind: 'search' }, operation), /admin_paused/);
  console.log('PostgreSQL guard checks passed: concurrent initialization, cross-worker lease/spacing, shared budget and restart-persistent pause. No provider calls.');
} finally {
  await Promise.all(databases.map(database => database.destroy()));
  if (created) await root.raw(`DROP SCHEMA "${schema}" CASCADE`);
  await root.destroy();
}
