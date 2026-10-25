import test from 'node:test';
import assert from 'node:assert/strict';
import { contactScheduler, qualificationKey, shadowJev, shadowAudit, runPagePipeline, validQualification, recoverQualification, cheapCandidateReject } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-pipeline.js';

const validReview = (postId) => ({ postId, scoreScale: 100, verdict: 'STRONG', score: 90, identityConfidence: 90, purchasePropensity: 80, evidenceStrength: 90, competitorProbability: 0, irrelevantProbability: 0, matchedSignals: ['ownership'], negativeSignals: [], marketplaceRole: 'owner', explanation: 'Evidence' });
test('qualification scale is explicit; fractions and ambiguous legacy scores are retried', () => {
  assert.equal(validQualification(validReview(1)), true);
  assert.equal(validQualification({ ...validReview(1), score: 0.9 }), false);
  assert.equal(validQualification({ ...validReview(1), score: 1 }), false);
  assert.equal(validQualification({ ...validReview(1), scoreScale: undefined }), false);
});
test('batch recovery preserves valid decisions and retries only unresolved IDs', async () => {
  const calls = [];
  const result = await recoverQualification([{ postId: 1 }, { postId: 2 }], async batch => {
    calls.push(batch.map(c => c.postId));
    return { items: calls.length === 1 ? [validReview(1)] : [validReview(2)] };
  });
  assert.deepEqual(calls, [[1, 2], [2]]);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.unresolved, []);
});
test('invalid batches are bounded and remain unresolved, not rejected', async () => {
  let calls = 0;
  const result = await recoverQualification([{ postId: 1 }], async () => { calls++; return { items: [{ ...validReview(1), score: 0.9 }] }; });
  assert.equal(calls, 3);
  assert.deepEqual(result.unresolved, [1]);
  assert.equal(result.items.length, 0);
});
test('provider outage during recovery preserves completed decisions before stopping', async () => {
  let calls = 0;
  const failure = Object.assign(new Error('Provider unavailable'), { code: 'B2C_AI_UNAVAILABLE' });
  const result = await recoverQualification([{ postId: 1 }, { postId: 2 }], async () => {
    if (++calls === 1) return { items: [validReview(1)] };
    throw failure;
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.items.map(item => item.postId), [1]);
  assert.deepEqual(result.unresolved, [2]);
  assert.equal(result.fatalError, failure);
});
test('cheap filter removes explicit closed listings but preserves negation and Saudi vocabulary', () => {
  assert.equal(cheapCandidateReject({ title: 'تم البيع' }), 'closed');
  assert.equal(cheapCandidateReject({ title: 'لم يتم البيع بي سي قيمنق' }), null);
  assert.equal(cheapCandidateReject({ title: 'بي سي قيمنق' }), null);
});
import { publicSaudiPhone, normalizeSaudiPhone, qualifyCandidates } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('direct qualification rejects obvious junk without any paid request', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No network allowed'); };
  try {
    const decisions = await qualifyCandidates({ OPENROUTER_API_KEY: 'local-filter-test' }, [
      { postId: 1, title: 'تم البيع', bodyText: 'بي سي' },
      { postId: 2, title: 'ابحث عن عمل', bodyText: 'مدير مقهى' },
      { postId: 3, title: '', bodyText: '' },
    ], {});
    assert.equal(calls, 0);
    assert.equal(decisions.length, 3);
    assert.ok(decisions.every(item => item.qualificationMode === 'local_reject' && !item.isQualified));
  } finally { globalThis.fetch = originalFetch; }
});

test('search overlaps review, buffers remain bounded, and workers overlap', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let fetched = 0, reviewed = 0, active = 0, peak = 0, depth = 0;
  async function* source() { for (let i = 0; i < 20; i++) { fetched++; yield i; } }
  const run = runPagePipeline({ sources: [source()], capacity: 2, workers: 2, onDepth: n => { depth = Math.max(depth, n); }, consume: async () => {
    peak = Math.max(peak, ++active); await gate; reviewed++; active--;
  }});
  await delay(10);
  assert.equal(reviewed, 0); assert.ok(fetched > 2 && fetched <= 5, 'search fetches ahead, but not indefinitely');
  assert.equal(peak, 2); assert.equal(depth, 2);
  release(); await run; assert.equal(reviewed, 20);
});
test('pipeline cancellation wakes backpressure waiters without deadlock', async () => {
  const controller = new AbortController();
  async function* source() { for (let i = 0; i < 100; i++) yield i; }
  const run = runPagePipeline({ sources: [source()], capacity: 1, workers: 1, signal: controller.signal, consume: async () => { await delay(10); } });
  controller.abort(new Error('stopped'));
  await assert.rejects(run, /stopped/);
});
test('pipeline review failure propagates and halts search', async () => {
  let fetched = 0;
  async function* source() { for (let i = 0; i < 100; i++) { fetched++; yield i; } }
  await assert.rejects(runPagePipeline({ sources: [source()], capacity: 1, workers: 1, consume: async () => { throw new Error('provider down'); } }), /provider down/);
  assert.ok(fetched < 100);
});

test('reservations cap requests and stop at the exact committed target', async () => {
  let active = 0, peak = 0, calls = 0;
  const queue = contactScheduler({ target: 20, initialCount: 18, concurrency: 8, process: async () => {
    peak = Math.max(peak, ++active); calls++;
    await delay(5); active--;
    return { created: true };
  }});
  for (let i = 0; i < 100; i++) await queue.submit(i, i);
  assert.equal(await queue.drain(), 20);
  assert.equal(calls, 2); assert.equal(peak, 2);
});
test('no-phone and duplicate results release slots until target is reached', async () => {
  const seen = [];
  const queue = contactScheduler({ target: 3, concurrency: 2, process: async i => {
    seen.push(i); await delay(1); return { created: i >= 4 };
  }});
  for (let i = 0; i < 20; i++) await queue.submit(i, i);
  assert.equal(await queue.drain(), 3); assert.equal(seen.length, 7);
});
test('fast result commits while a slow contact is still running', async () => {
  let release;
  const slow = new Promise(resolve => { release = resolve; });
  let fastSaved = false;
  const queue = contactScheduler({ target: 2, concurrency: 2, process: async i => {
    if (i === 1) await slow; else fastSaved = true;
    return { created: true };
  }});
  await queue.submit(1, 1); await queue.submit(2, 2);
  await delay(5); assert.equal(fastSaved, true); assert.equal(queue.committed, 1);
  release(); assert.equal(await queue.drain(), 2);
});
test('same seller is serialized, and a failed ad does not discard their next ad', async () => {
  let active = 0, peak = 0;
  const queue = contactScheduler({ target: 1, concurrency: 8, process: async i => {
    peak = Math.max(peak, ++active); await delay(2); active--; return { created: i === 2 };
  }});
  await queue.submit(1, 'seller'); await queue.submit(2, 'seller');
  assert.equal(await queue.drain(), 1); assert.equal(peak, 1);
});
test('out-of-order committed counts do not double count leads', async () => {
  const queue = contactScheduler({ target: 3, concurrency: 3, process: async i => {
    await delay(i === 1 ? 10 : 1); return { created: true, committedCount: i };
  }});
  await queue.submit(1, 1); await queue.submit(2, 2);
  assert.equal(await queue.drain(), 2);
});
test('fatal persistence errors drain in-flight work and surface as errors', async () => {
  let drained = false;
  const queue = contactScheduler({ target: 2, concurrency: 2, process: async i => {
    if (i === 1) { await delay(1); throw new Error('database offline'); }
    await delay(10); drained = true; return { created: true };
  }});
  await queue.submit(1, 1); await queue.submit(2, 2);
  await assert.rejects(queue.drain(), /database offline/); assert.equal(drained, true);
});
test('Arabic and Persian public digits work without matching longer numeric IDs', () => {
  assert.equal(publicSaudiPhone({ bodyText: 'جوال ٠٥٠ ١٢٣ ٤٥٦٧' }), '+966501234567');
  assert.equal(normalizeSaudiPhone('۰۰۹۶۶۵۰۱۲۳۴۵۶۷'), '+966501234567');
  assert.equal(publicSaudiPhone({ bodyText: 'ID 150123456789012' }), null);
});
test('cache identity changes with content, strategy and evaluator version', () => {
  const candidate = { postId: 1, title: 'بي سي', matchedStrategy: { strategyType: 'OWNER_FALLBACK' } };
  const key = qualificationKey(candidate, { product: 'games' });
  assert.notEqual(key, qualificationKey({ ...candidate, title: 'new title' }, { product: 'games' }));
  assert.notEqual(key, qualificationKey(candidate, { product: 'coffee' }));
  assert.notEqual(key, qualificationKey(candidate, { product: 'games' }, 'next'));
});
test('Jev returns three-way shadow decisions with full strategy context', async () => {
  const ads = [1, 2, 3].map(postId => ({ postId, bodyText: 'بي سي قيمنق', matchedStrategy: { strategyType: 'OWNER_FALLBACK' } }));
  const results = await shadowJev({ AI_GATEWAY_API_KEY: 'test' }, ads, { dealIntent: 'sell' }, async (_, request) => {
    const body = JSON.parse(request.body);
    assert.match(body.state, /OWNER_FALLBACK/); assert.match(body.state, /dealIntent/);
    return Response.json({ answers: { ad_0: { type: 'boolean', probability: 0.95 }, ad_1: { type: 'boolean', probability: 0.05 }, ad_2: { type: 'boolean', probability: 0.5 } } });
  });
  assert.deepEqual(results.map(x => x.decision), ['PASS', 'REJECT', 'UNCERTAIN']);
});
test('OpenRouter Jev uses the Decisions API and parses noul probabilities', async () => {
  const ads = [{ postId: '1', title: 'بي سي قيمنق' }, { postId: '2' }];
  const results = await shadowJev({ B2C_JEV_OPENROUTER_API_KEY: 'test-router', AI_GATEWAY_API_KEY: 'unused' }, ads, {}, async (url, request) => {
    assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
    assert.equal(request.headers.Authorization, 'Bearer test-router');
    const body = JSON.parse(request.body);
    assert.equal(body.model, 'typesafe/jev-1.13');
    assert.equal(body.questions.ad_0.type, 'noul');
    return { ok: true, json: async () => ({ answers: { ad_0: { type: 'noul', noul: 0.95 }, ad_1: { type: 'noul', noul: null } } }) };
  });
  assert.equal(results[0].decision, 'PASS');
  assert.equal(results[0].provider, 'openrouter');
  assert.equal(results[1].decision, 'UNCERTAIN');
  for (const response of [{ ok: false, status: 429 }, { ok: true, json: async () => ({ answers: {} }) }]) {
    assert.equal((await shadowJev({ B2C_JEV_OPENROUTER_API_KEY: 'test' }, ads, {}, async () => response))[0].decision, 'UNCERTAIN');
  }
});

test('missing credentials, HTTP errors and malformed Jev output never reject', async () => {
  const ads = [{ postId: 1 }];
  const unconfigured = await shadowJev({}, ads, {}, () => { throw new Error('must not call'); });
  assert.equal(unconfigured[0].reason, 'unconfigured');
  for (const response of [new Response('', { status: 429 }), Response.json({ answers: { ad_0: { type: 'boolean', probability: '0' } } })]) {
    assert.equal((await shadowJev({ AI_GATEWAY_API_KEY: 'test' }, ads, {}, async () => response))[0].decision, 'UNCERTAIN');
  }
});
test('shadow disagreement is not reported as a measured false-rejection rate', () => {
  const sample = { reason: 'shadow', decision: 'REJECT', authoritativeQualified: true, manuallyReviewed: false };
  assert.equal(shadowAudit([sample]).rejectDisagreementRate, 1);
  assert.equal(shadowAudit([sample]).falseRejectAuditRate, null);
  assert.equal(shadowAudit([{ ...sample, manuallyReviewed: true, manualQualified: true }]).falseRejectAuditRate, 1);
});
test('AI transport failure is explicit, records its cause, and never uses local scoring', async () => {
  const originalFetch = globalThis.fetch;
  const diagnostics = [];
  globalThis.fetch = async () => { throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }); };
  try {
    // Explicitly select the primary transport and omit backup credentials so
    // this offline fixture cannot enter the native HTTPS fallback adapter.
    await assert.rejects(qualifyCandidates({ OPENAI_API_KEY: 'secret-primary', B2C_OPENAI_QUALIFICATION_MODEL:'gpt-5-mini', B2C_OPENROUTER_QUALIFICATION_MODEL:'openai/gpt-5-mini', __b2cDiagnostics: diagnostics }, [{ postId: 1, title: 'بي سي', bodyText: 'للبيع', matchedStrategy: { strategyType: 'OWNER_FALLBACK', searchTerm: 'بي سي' } }], { product: 'games', qualification: { minimumLeadScore: 65 } }), error => error.code === 'B2C_AI_UNAVAILABLE');
    assert.equal(diagnostics.length, 1);
    assert.ok(diagnostics.every(item => item.code === 'ENOTFOUND' && item.elapsedMs >= 0));
    assert.ok(!JSON.stringify(diagnostics).includes('secret-'));
  } finally { globalThis.fetch = originalFetch; }
});

test('a rate-limited primary is bypassed on following batches', async () => {
  const originalFetch = globalThis.fetch;
  let primary = 0, fallback = 0;
  const candidate = { postId: 1, title: 'بي سي', bodyText: 'للبيع', matchedStrategy: { searchTerm: 'بي سي' } };
  globalThis.fetch = async url => {
    if (url.includes('api.openai.com')) { primary++; return Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 }); }
    fallback++; return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [validReview(1)] }) } }] });
  };
  try {
    const env = { OPENAI_API_KEY: 'cooldown-primary', OPENROUTER_API_KEY: 'cooldown-secondary', B2C_OPENAI_QUALIFICATION_MODEL:'gpt-5-mini', B2C_OPENROUTER_QUALIFICATION_MODEL:'openai/gpt-5-mini' };
    for (let i = 0; i < 2; i++) assert.equal((await qualifyCandidates(env, [candidate], { qualification: { minimumLeadScore: 65 } }))[0].isQualified, true);
    assert.equal(primary, 1); assert.equal(fallback, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('review budget stops before a paid request and is not retried as an AI error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('must not fetch'); };
  try {
    await assert.rejects(qualifyCandidates({ OPENROUTER_API_KEY: 'budget-test', __b2cReviewBudget: { limitUsd: 0.001, reservedUsd: 0, requests: 0, inputUsdPerMillion: 1, outputUsdPerMillion: 4 } }, [{ postId: 1, title: 'بي سي', bodyText: '', matchedStrategy: {} }], {}), error => error.code === 'B2C_REVIEW_BUDGET');
  } finally { globalThis.fetch = originalFetch; }
});
