import assert from 'node:assert/strict';
import { createHarajSafety, configureHarajSafety, initialHarajState, DEFAULT_HARAJ_LIMITS, retryAfterAt, validateHarajEndpoint, classifyHarajFailure, assertHarajSearchReady } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/haraj-safety.js';
import { fetchHarajPostContact, fetchHarajSearch } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import { configureProviderCreditAlerts, notifyProviderSafetyPause } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/provider-credit-alerts.js';
import {harajPublicError} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/haraj-public-error.js';

function fixture(overrides = {}) {
  let time = Date.parse('2026-10-18T10:00:00Z');
  const state = { ...initialHarajState(), ...overrides };
  let tail = Promise.resolve();
  const store = { transact(fn) { const task = tail.then(() => fn(state)); tail = task.catch(() => {}); return task; } };
  const notifications = [];
  const options = { store, now: () => time, sleep: async ms => { time += ms; await new Promise(resolve => setTimeout(resolve, 0)); }, notify: async event => { notifications.push(event); return true; } };
  return { state, store, options, guard: createHarajSafety(options), notifications, advance: ms => { time += ms; } };
}
const search = { kind: 'search' };
const contact = cacheKey => ({ kind: 'contact', cacheKey });
const ok = () => ({ value: { phone: 'synthetic' }, empty: false, status: 200 });
const empty = () => ({ value: { phone: null }, empty: true, status: 200 });
async function enable(f, limits = DEFAULT_HARAJ_LIMITS) { await f.guard.control({ action: 'resume', limits, confirmed: true, actor: 'test-admin' }); }

for (const responseMs of [1000, 5000]) {
  const f = fixture(); await enable(f);
  const startedAt = f.options.now();
  await f.guard.execute(search, () => { f.advance(responseMs); return ok(); });
  let nextStartedAt;
  await f.guard.execute(search, () => { nextStartedAt = f.options.now(); return ok(); });
  assert.equal(nextStartedAt - startedAt, Math.max(responseMs, DEFAULT_HARAJ_LIMITS.intervalMs),
    'slow provider I/O satisfies start-to-start pacing without an extra completion delay');
  assert.equal(f.state.requests, 2);
}
for (const kind of ['search', 'contact']) {
  for (const lateSuccess of [false, true]) {
    const f = fixture(); await enable(f); f.state.failures = 3;
    const controller = new AbortController();
    const reason = new Error('campaign deadline reached');
    const startedAt = f.options.now();
    await assert.rejects(() => f.guard.execute({ kind, cacheKey: 'cancelled-contact', signal: controller.signal }, () => {
      f.advance(1000);
      controller.abort(reason);
      if (!lateSuccess) throw reason;
      return ok();
    }), error => error === reason);
    assert.equal(f.state.lease, null, 'a cancelled operation immediately releases its lease');
    assert.equal(f.state.failures, 3, 'client cancellation does not change the provider error streak');
    assert.equal(f.state.paused, false);
    assert.equal(f.state.requests, 1, 'cancelled requests still count toward actual provider usage');
    assert.equal(f.state.contacts, kind === 'contact' ? 1 : 0);
    assert.equal(f.state.cache['cancelled-contact'], undefined, 'cancelled calls cannot publish late contacts');
    assert.equal(f.notifications.length, 0);
    assert.ok(f.state.events.some(event => event.kind === 'request_cancelled'));
    assert.ok(!f.state.events.some(event => event.outcome === 'request_failed'));
    let nextStartedAt;
    await f.guard.execute(search, () => { nextStartedAt = f.options.now(); return ok(); });
    assert.equal(nextStartedAt - startedAt, DEFAULT_HARAJ_LIMITS.intervalMs,
      'cancellation keeps normal spacing without adding transient-error backoff');
  }
}
{
  const f = fixture(); await enable(f);
  const controller = new AbortController();
  await assert.rejects(() => f.guard.execute({ ...search, signal: controller.signal }, () => {
    controller.abort(new Error('campaign deadline reached'));
    throw { status: 429, retryAfter: '120' };
  }), /rate_limited/);
  assert.equal(f.state.paused, true, 'a concurrent local cancellation must not erase a real provider denial');
  assert.ok(f.state.retryAt >= f.options.now() + 120000);
}

for(const kind of ['search','comments','profile','posts']){
  const f=fixture();await enable(f);f.state.lease={id:'dead-reader',kind,until:f.options.now()-1};
  const before=f.state.requests;let calls=0;
  await f.guard.execute(search,()=>{calls++;return ok();});
  assert.equal(calls,1);assert.equal(f.state.paused,false);assert.equal(f.state.requests,before+1);
  assert.ok(f.state.events.some(event=>event.kind==='expired_read_lease_recovered'));
}
{
  const f=fixture();await enable(f);let settle;
  const old=f.guard.execute(search,()=>new Promise(resolve=>{settle=resolve;}));
  while(!settle)await new Promise(resolve=>setTimeout(resolve,0));
  f.advance(61_000);await createHarajSafety(f.options).execute(search,ok);
  settle(ok());await assert.rejects(()=>old,error=>error.code==='HARAJ_REQUEST_FAILED');
  assert.equal(f.state.paused,false,'late reader must not pause the account after lease recovery');
  assert.ok(f.state.events.some(event=>event.kind==='late_read_discarded'));
}
{
  const f=fixture();await enable(f);f.state.lease={id:'uncertain-reveal',kind:'contact',until:f.options.now()-1};
  await assert.rejects(()=>f.guard.execute(search,()=>assert.fail('never replay uncertain reveals')),/interrupted_request_review_required/);
  assert.match(harajPublicError({code:'HARAJ_SAFETY_PAUSED',message:'interrupted_request_review_required'}).message,/previous search was interrupted/i);
  assert.equal(harajPublicError({code:'SQL_ERROR',message:'password=secret'}),null,'unknown server errors stay private');
}

{
  const f=fixture();await enable(f);
  for(let attempt=0;attempt<6;attempt++){
    await assert.rejects(()=>f.guard.execute(search,()=>{throw {status:503};}),error=>error.code==='HARAJ_REQUEST_FAILED');
    assert.equal(f.state.paused,false,'transient failures never become a permanent account lock');
  }
  assert.equal(f.state.requests,6,'backoff does not reset usage');
  assert.equal(f.notifications.length,0,'transient failures do not send administrative lockout alerts');
  await f.guard.execute(search,ok);assert.equal(f.state.failures,0);
}
{
  const f=fixture({paused:true,reason:'request_failed',requests:123,contacts:7,events:[{kind:'search',outcome:'request_failed',status:502}],retryAt:Date.parse('2026-10-18T10:02:00Z')});
  const view=await f.guard.status();
  assert.equal(view.paused,false);assert.equal(f.state.requests,123);assert.equal(f.state.contacts,7);
  assert.ok(f.state.nextAt>=Date.parse('2026-10-18T10:02:00Z'),'Retry-After remains enforced after legacy recovery');
  for(const reason of ['admin_paused','authentication_rejected','access_restricted','rate_limited','invalid_response','daily_request_budget_reached']){
    const blocked=fixture({paused:true,reason,events:[{outcome:'request_failed',status:503}]});
    assert.equal((await blocked.guard.status()).paused,true,reason);
  }
  const badRequest=fixture({paused:true,reason:'request_failed',events:[{outcome:'request_failed',status:400}]});
  assert.equal((await badRequest.guard.status()).paused,true,'client/protocol failures are not automatically retried');
}

{
  const f = fixture(); let called = 0;
  await assert.rejects(() => f.guard.execute(search, () => { called++; return ok(); }), /waiting for administrator setup/);
  assert.equal(called, 0, 'new guard must fail closed before network I/O');
  await assert.rejects(() => f.guard.control({ action: 'resume', limits: DEFAULT_HARAJ_LIMITS, confirmed: false }), /Confirm authorized/);
  await enable(f);
  let inFlight = 0; let peak = 0; const starts = [];
  const otherWorker = createHarajSafety(f.options);
  await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? f.guard : otherWorker).execute(search, async () => {
    peak = Math.max(peak, ++inFlight); starts.push(f.options.now());
    await new Promise(resolve => setTimeout(resolve, 2)); inFlight--; return ok();
  })));
  assert.equal(peak, 1, 'multiple workers/campaigns share one network lease');
  assert.equal(starts.length, 8);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 3000, 'shared minimum spacing');
  assert.equal(f.state.requests, 8);
}
{
  const f = fixture(); await enable(f);
  let calls = 0;
  await f.guard.execute(contact('post-1'), () => { calls++; return empty(); });
  const restarted = createHarajSafety(f.options);
  await restarted.execute(contact('post-1'), () => { calls++; return ok(); });
  assert.equal(calls, 1, 'negative contacts are cached across worker restarts');
  assert.equal(f.state.contacts, 1);
  const view = await f.guard.status();
  assert.ok(!Object.hasOwn(view, 'cache'), 'admin status never exposes cached contact data');
  await f.guard.execute(contact('success'), ok);
  for (let i = 0; i < 4; i++) await f.guard.execute(contact(`empty-${i}`), empty);
  await f.guard.execute(contact('empty-5'), empty);
  assert.equal(f.state.contactsPaused, true, 'a previous success does not disable the phone circuit');
  assert.equal(f.state.paused, false, 'missing phone data alone does not block listing search');
  await restarted.execute(search, ok);
  await restarted.execute(search, ok);
  assert.equal(f.notifications.filter(event => event.scope === 'contacts').length, 1, 'public search does not repeat the phone-pause alert');
  let probes = 0;
  await restarted.execute(contact('another-empty'), () => { probes++; return ok(); });
  assert.equal(probes, 0, 'phone circuit never probes after empty results');
}
for (const error of [{ status: 401 }, { status: 403 }, { status: 429, retryAfter: '120' }, { status: 200, code: 'ACCOUNT_BLOCKED' }]) {
  const f = fixture(); await enable(f); let calls = 0;
  await assert.rejects(() => f.guard.execute(contact('post'), () => { calls++; throw error; }), /Contact retrieval paused/);
  await assert.rejects(() => createHarajSafety(f.options).execute(search, () => { calls++; return ok(); }), /Contact retrieval paused/);
  assert.equal(calls, 1, 'restrictions stop the entire account without retrying');
  await assert.rejects(() => f.guard.control({ action: 'setup', confirmed: true }), /Initial setup cannot clear/);
  if (error.status === 429) await assert.rejects(() => enable(f), /Retry-After/);
  assert.ok(!JSON.stringify(f.state.events).includes('ACCOUNT_BLOCKED'), 'raw provider code/message is not persisted');
}
{
  const f = fixture(); await enable(f, { ...DEFAULT_HARAJ_LIMITS, contactsPerDay: 2 });
  await f.guard.execute(contact('one'), ok); await f.guard.execute(contact('two'), ok);
  await f.guard.execute(contact('three'), () => assert.fail('phone budget must prevent network I/O'));
  assert.equal(f.state.contactsPaused, true);
  await f.guard.execute(search, ok);
  await enable(f, { ...DEFAULT_HARAJ_LIMITS, contactsPerDay: 2 });
  assert.equal(f.state.contacts, 2, 'admin resume does not reset usage');
  await f.guard.execute(contact('three'), () => assert.fail('resume must not reset the daily phone budget'));
  f.advance(86400000);
  await f.guard.execute(search, ok);
  assert.equal(f.state.contactsPaused, true, 'phone circuit persists until admin review');
}
{
  const f = fixture();
  await f.guard.control({ action: 'setup', confirmed: true, actor: 'operator-request' });
  assert.equal(f.state.paused, false);
  assert.equal(f.state.requests, 0, 'setup never tests the token');
  assert.deepEqual(f.state.limits, DEFAULT_HARAJ_LIMITS);
  await f.guard.control({ action: 'pause' });
  await assert.rejects(() => f.guard.control({ action: 'setup', confirmed: true }), /Initial setup cannot clear/);
}
{
  const f = fixture(); await enable(f, { ...DEFAULT_HARAJ_LIMITS, requestsPerDay: 2, contactsPerDay: 2 });
  await f.guard.execute(search, ok); await f.guard.execute(search, ok);
  await assert.rejects(() => f.guard.execute(search, ok), /daily_request_budget_reached/);
  f.advance(86400000);
  await assert.rejects(() => f.guard.execute(search, ok), /daily_request_budget_reached/, 'daily rollover never clears an account-wide stop');
}
{
  const f=fixture();await enable(f,{...DEFAULT_HARAJ_LIMITS,requestsPerDay:0});
  f.state.day='2026-10-18';f.state.requests=1000;
  assert.doesNotThrow(()=>assertHarajSearchReady(f.state,f.options.now()));
  await f.guard.execute(search,ok);
  assert.equal(f.state.requests,1001,'uncapped mode keeps the usage counter');
  assert.equal(f.state.paused,false);
  f.state.limits.requestsPerDay=1000;
  assert.throws(()=>assertHarajSearchReady(f.state,f.options.now()),/daily_request_budget_reached/,'preflight rejects an exhausted finite quota before queueing a run');
  f.state.limits.requestsPerDay=0;f.state.paused=true;f.state.reason='access_restricted';
  assert.throws(()=>assertHarajSearchReady(f.state,f.options.now()),/access_restricted/,'uncapped mode must not bypass provider denials');
}
{
  const f = fixture(); await enable(f); f.state.lease = { id: 'dead-worker', until: f.options.now() - 1 };
  await assert.rejects(() => f.guard.execute(search, ok), /interrupted_request_review_required/);
  await enable(f); assert.equal(f.state.lease, null);
  f.state.lease = { id: 'active-worker', until: f.options.now() + 60000 };
  await f.guard.control({ action: 'pause' });
  await assert.rejects(() => enable(f), /current request/);
  f.advance(61000); await enable(f);
  const signal = AbortSignal.abort(new Error('cancelled'));
  const before = f.state.requests;
  await assert.rejects(() => f.guard.execute({ ...search, signal }, ok), /cancelled/);
  assert.equal(f.state.requests, before);
}
{
  const base = Date.parse('2026-10-18T10:00:00Z');
  assert.equal(retryAfterAt('120', base), base + 120000);
  assert.equal(retryAfterAt('Sun, 18 Oct 2026 10:02:00 GMT', base), base + 120000);
  assert.equal(validateHarajEndpoint('https://graphql.haraj.com.sa/'), 'https://graphql.haraj.com.sa/');
  const metadataUrl = 'https://graphql.haraj.com.sa/?queryName=Search&lang=ar&clientId=ios&version=5.0.0';
  assert.equal(validateHarajEndpoint(metadataUrl), metadataUrl, 'legitimate configured API metadata is preserved');
  const platformVersion = 'https://graphql.haraj.com.sa/?queryName=search&lang=en&clientId=test-client&version=9.0.0%20(iOS%2018)';
  assert.equal(validateHarajEndpoint(platformVersion), platformVersion, 'platform version labels with encoded spaces and parentheses are valid');
  assert.throws(() => validateHarajEndpoint('https://graphql.haraj.com.sa/?queryName=Search&queryName=Other'));
  assert.throws(() => validateHarajEndpoint('https://graphql.haraj.com.sa/?lang=invalid'));
  assert.throws(() => validateHarajEndpoint('https://graphql.haraj.com.sa/?queryName=Search&token=secret'));
  for (const invalid of ['secret-token', 'https://evil.example/', 'http://graphql.haraj.com.sa/', 'https://token@graphql.haraj.com.sa/', 'https://graphql.haraj.com.sa/?token=secret']) {
    assert.throws(() => validateHarajEndpoint(invalid), error => error.safetyPause && !error.message.includes(invalid));
  }
  assert.equal(classifyHarajFailure({ status: 200, message: 'Token expired' }), 'authentication_rejected');
}
// Exercise the actual GraphQL wrapper with entirely synthetic HTTP responses.
{
  const savedFetch = globalThis.fetch;
  const f = fixture(); configureHarajSafety(f.options); await enable(f);
  const env = { HARAJ_BEARER_TOKEN: 'synthetic-test-only', HARAJ_GRAPHQL_BASE_URL: 'https://graphql.haraj.com.sa/', HARAJ_SEARCH_URL: 'https://graphql.haraj.com.sa/?queryName=Search&lang=ar&clientId=ios&version=5.0.0', HARAJ_POST_CONTACT_URL: 'https://graphql.haraj.com.sa/?queryName=PostContactQuery&lang=ar&clientId=ios&version=5.0.0' };
  globalThis.fetch = async url => {
    assert.equal(url, env.HARAJ_SEARCH_URL, 'actual wrapper accepts configured search URL with metadata');
    return { ok: true, status: 200, json: async () => ({ data: { search: { items: [{ id: 1 }], pageInfo: { hasNextPage: false } } } }) };
  };
  assert.equal((await fetchHarajSearch(env, { search: 'synthetic', limit: 1 })).items.length, 1);
  for (const pageInfo of [undefined, null, {hasNextPage:null}]) {
    globalThis.fetch = async () => ({ok:true,status:200,json:async()=>({data:{search:{items:[],pageInfo}}})});
    const page = await fetchHarajSearch(env, {search:'synthetic empty'});
    assert.equal(page.pageInfo.hasNextPage,false,'A valid empty terminal page must not pause all campaigns');
    assert.equal((await f.guard.status()).paused,false);
  }
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    assert.equal(_url, env.HARAJ_POST_CONTACT_URL, 'actual wrapper accepts configured contact URL with metadata');
    calls++;
    assert.equal(JSON.parse(init.body).variables.isManualRequest, false);
    return { ok: true, status: 200, json: async () => ({ data: { postContact: { contactMobile: '0555555123' } } }) };
  };
  try {
    await fetchHarajPostContact(env, 123);
    await fetchHarajPostContact(env, 123);
    assert.equal(calls, 1, 'actual wrapper uses shared successful-contact cache');
    globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ errors: [{ message: 'Account suspended', extensions: { code: 'FORBIDDEN' } }] }), headers: { get: () => null } }; };
    await assert.rejects(() => fetchHarajPostContact(env, 456), /access_restricted/);
    await assert.rejects(() => fetchHarajSearch({ ...env, HARAJ_BEARER_TOKEN: 'another-synthetic-token' }, {}), /access_restricted/);
    assert.equal(calls, 2, 'token replacement cannot bypass a persistent pause');
    const invalid = fixture(); configureHarajSafety(invalid.options); await enable(invalid);
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => null });
    await assert.rejects(() => fetchHarajSearch(env, {}), /invalid_response/);
  } finally { globalThis.fetch = savedFetch; }
}
{
  const emails = [];
  configureProviderCreditAlerts({ send: async message => { emails.push(message); }, logger: { warn() {}, error() {} } });
  await Promise.all(Array.from({ length: 3 }, () => notifyProviderSafetyPause({ reason: 'rate_limited' })));
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'mastergotmemes@gmail.com');
  assert.match(emails[0].subject, /PAUSED/);
  assert.match(emails[0].text, /does not necessarily mean credits are depleted/);
}
console.log('Haraj safety checks passed: shared queue, budgets, restart persistence, cache, circuit, Retry-After, token isolation, redaction and alerts. No provider requests made.');
