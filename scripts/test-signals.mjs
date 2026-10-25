import test from "node:test";
import assert from "node:assert/strict";
import { linkedinUrl, isSaudiProfile, providerRows, normalizePost, mergePerson, verifiedEmail, evaluateSignals, evaluateJevSignals, registerSignalRoutes, publicSignalRun } from "../directus/extensions/directus-extension-waslah-lead-agent/dist/signals.js";

test("only canonical LinkedIn URLs are accepted", () => {
  assert.equal(linkedinUrl("https://linkedin.com/posts/test/?tracking=x"), "https://www.linkedin.com/posts/test");
  for (const url of ["http://linkedin.com/posts/test", "https://linkedin.com.evil.com/posts/test", "https://user:pass@linkedin.com/posts/test", "https://127.0.0.1/posts/test", "https://linkedin.com/in/test"]) assert.equal(linkedinUrl(url), null);
});
test("Saudi location must have evidence and explicit country takes precedence", () => {
  assert.equal(isSaudiProfile({ location: { countryCode: "SA" } }), true);
  assert.equal(isSaudiProfile({ location: { countryCode: "US", linkedinText: "Riyadh" } }), false);
  assert.equal(isSaudiProfile({ location: "الرياض، السعودية" }), true);
  assert.equal(isSaudiProfile({ headline: "Selling to Saudi Arabia" }), false);
});
test("provider errors do not become empty results", () => {
  assert.throws(() => providerRows({ status: 500, elements: [] }));
  assert.throws(() => providerRows({ unexpected: [] }));
  assert.deepEqual(providerRows({ elements: [] }), []);
});
test("merge engagement retains signals without duplicating people", () => {
  const people = []; const post = { url: "https://www.linkedin.com/posts/topic" };
  const actor = { name: "Example", linkedinUrl: "https://www.linkedin.com/in/example/", position: "Founder" };
  mergePerson(people, { actor, commentary: "We need this" }, post, "comment");
  mergePerson(people, { actor, commentary: "We need this" }, post, "comment");
  mergePerson(people, { actor, reactionType: "LIKE" }, post, "reaction");
  assert.equal(people.length, 1); assert.equal(people[0].signals.length, 2);
});
test("catch-all, unknown and missing email verification fail closed", () => {
  assert.equal(verifiedEmail({ output: { valid: true, status: "valid" } }), true);
  for (const status of ["catch_all", "unknown", "invalid", "risky"]) assert.equal(verifiedEmail({ output: { valid: true, status } }), false);
  assert.equal(verifiedEmail({}), false);
});
test("judge uses bounded fallback and never silently rejects on model failure", async () => {
  let calls = 0;
  const result = await evaluateSignals({ OPENAI_API_KEY: "test", OPENROUTER_API_KEY: "test" }, { state: {}, questions: [{ id: "1" }] }, async () => {
    calls++; return calls === 1 ? new Response("{}", { status: 503 }) : Response.json({ choices: [{ message: { content: JSON.stringify({ answers: [{ id: "1", score: 2, role: "founder_exec", reason: "Relevant" }] }) } }] });
  });
  assert.equal(calls, 2); assert.equal(result.judge, "agent"); assert.equal(result.calibrated, false);
  await assert.rejects(evaluateSignals({ OPENAI_API_KEY: "test" }, { state: {}, questions: [{ id: "1" }] }, async () => Response.json({})), /EVALUATOR_UNAVAILABLE/);
});
test("Jev reviews Treg candidates without turning missing or malformed answers into rejections", async () => {
  const people = [{ id: 'p1', headline: 'Founder', signals: [{ kind: 'comment', text: 'We need this' }] }];
  const unconfigured = await evaluateJevSignals({}, { brief: 'Sales software', people }, async () => { throw new Error('must not call'); });
  assert.equal(unconfigured.status, 'unconfigured');
  const reviewed = await evaluateJevSignals({ B2C_JEV_OPENROUTER_API_KEY: 'test' }, { brief: 'Sales software', people }, async (url, options) => {
    assert.match(url, /\/alpha\/decisions$/);
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'typesafe/jev-1.13');
    return Response.json({ answers: { person_0: { type: 'noul', noul: 0.78 } } });
  });
  assert.equal(reviewed.status, 'reviewed');
  assert.equal(reviewed.answers[0].probability, 0.78);
  const invalid = await evaluateJevSignals({ B2C_JEV_OPENROUTER_API_KEY: 'test' }, { brief: 'Sales software', people }, async () => Response.json({ answers: { person_0: { type: 'noul', noul: 5 } } }));
  assert.equal(invalid.status, 'invalid_response');
  assert.equal(invalid.answers[0].probability, null);
});

// In-memory database and synthetic provider responses: no network or paid calls.
function harness({ noEmail = false, pending = false, duplicate = false, budget = 1, exhaustBudget = false } = {}) {
  const rows = []; const requests = []; const saved = []; const handlers = {};
  const db = (table) => {
    let predicates = [];
    const matches = () => (table === "lead_requests" ? rows : table === "wallets" ? [{ organization_id: "org1", balance_halalas: 999999 }] : duplicate ? [{}] : []).filter((r) => predicates.every((fn) => fn(r)));
    const q = {
      where(obj) { if (typeof obj === "object") predicates.push((r) => Object.entries(obj).every(([k, v]) => r[k] === v)); return q; },
      whereIn(key, values) { predicates.push((r) => values.includes(r[key])); return q; },
      first: async () => matches()[0],
      update: async (patch) => { const found = matches(); found.forEach((r) => Object.assign(r, structuredClone(patch))); return found.length; },
      insert: async (r) => { rows.push(structuredClone(r)); },
      join: () => q, whereRaw: () => q, orderBy: () => q, limit: () => q,
      then: (resolve, reject) => Promise.resolve(matches()).then(resolve, reject),
    }; return q;
  };
  db.transaction = async (fn) => fn(db); db.raw = async () => {};
  const router = { get: (p, f) => { handlers[`GET ${p}`] = f; }, post: (p, f) => { handlers[`POST ${p}`] = f; } };
  const post = { id: "post1", linkedinUrl: "https://www.linkedin.com/posts/test", content: "Our company needs revenue tooling", author: { name: "Author" }, engagement: { likes: 4 } };
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname; requests.push(path);
    if (path === "/api/v1/chat/completions") {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'openrouter/free');
      const input = JSON.parse(body.messages.at(-1).content);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ answers: input.questions.map((q) => ({ id: q.id, score: input.state.posts ? .9 : 2, role: "founder_exec", reason: "Relevant business evidence" })) }) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
    }
    let data;
    if (path.endsWith("post.search")) data = { elements: [post], pagination: { totalPages: 1 } };
    else if (path.endsWith("post.comments")) data = { elements: [{ actor: { name: "Test Person", linkedinUrl: "https://www.linkedin.com/in/test", position: "Founder" }, commentary: "We need this at our company" }] };
    else if (path.endsWith("post.reactions")) data = { elements: [] };
    else if (path.endsWith("profile.main")) data = { element: { location: { countryCode: "SA", linkedinText: "Riyadh" }, currentPosition: [{ companyName: "Example" }] } };
    else if (path.endsWith("email.find")) data = pending ? { _treg: { outcome: "pending" } } : { output: { email: noEmail ? null : "test@example.com" } };
    else if (path.endsWith("email.verify")) data = { output: { valid: true, status: "valid" } };
    else throw new Error(`Unmocked endpoint ${path}`);
    assert.ok(Number(options.headers["X-Treg-Route-Max-Cost"]) > 0);
    return Response.json(data, { status: pending && path.endsWith("email.find") ? 202 : 200, headers: { "X-Treg-Cost-Micro": exhaustBudget ? String(Math.round(Number(options.headers["X-Treg-Route-Max-Cost"]) * 1e6)) : "4000", "X-Treg-Call-Id": "fake" } });
  };
  registerSignalRoutes(router, { database: db, env: { TREG_TOKEN: "test", OPENROUTER_API_KEY: "signal-harness", N8N_WEBHOOK_SECRET: "test", SIGNAL_RUN_BUDGET_USD: budget }, logger: { warn() {}, error() {} }, route: (fn) => fn,
    customerContext: async (database, req) => ({ userId: req.user || "user1", organization: { id: "org1" } }), assertFeature: async () => {}, ApiError: class extends Error { constructor(status, code, message) { super(message); this.status = status; } }, fetcher,
    ingest: async (id, lead) => { saved.push(lead); rows.find((r) => r.id === id).result_count++; },
  });
  const understanding = {offer:'Revenue CRM software',customer:'Saudi business founders',customerOutcome:'Organize sales follow-up',commercialModel:'Monthly software subscription',target:'Saudi founders',fitSignal:'Revenue tooling discussions',geography:'Saudi Arabia'};
  const invoke = async (path, body = {}, extra = {}) => { let result; const res = { status() { return res; }, json(data) { result = data.data; } }; await handlers[path]({ body: { business_understanding: understanding, ...body }, params: {}, ...extra }, res); return result; };
  return { rows, requests, saved, invoke };
}
async function run(options) {
  const h = harness(options);
  await h.invoke("POST /signal-runs", { brief: "Revenue tools for Saudi founders", topics: ["revenue operations"], target_count: 1, idempotency_key: "once" });
  for (let i = 0; i < 100 && !["sourced", "partial", "failed"].includes(h.rows[0].status); i++) await new Promise((r) => setTimeout(r, 5));
  return h;
}
test("complete synthetic run delivers one verified lead and preserves evidence", async () => {
  const h = await run(); assert.equal(h.rows[0].status, "sourced"); assert.equal(h.saved.length, 1); assert.equal(h.saved[0].email, "test@example.com");
  const view = publicSignalRun(h.rows[0]); assert.equal(view.delivered, 1); assert.equal(view.people[0].signals.length, 1); assert.equal(view.calls, undefined); assert.ok(view.spend.tregMicro > 0);
  await assert.rejects(h.invoke("GET /signal-runs/:id", {}, { user: "other", params: { id: h.rows[0].id } }), /Run not found/);
  await h.invoke("POST /signal-runs", { brief: "Revenue tools for Saudi founders", topics: ["revenue"], target_count: 1, idempotency_key: "once" }); assert.equal(h.rows.length, 1);
});
test("no email is partial, not a delivered lead", async () => { const h = await run({ noEmail: true }); assert.equal(h.rows[0].status, "partial"); assert.equal(h.saved.length, 0); assert.equal(publicSignalRun(h.rows[0]).people[0].status, "no_email"); });
test("existing workspace email is not charged again", async () => { const h = await run({ duplicate: true }); assert.equal(h.saved.length, 0); assert.equal(publicSignalRun(h.rows[0]).people[0].status, "duplicate"); });
test("pending contact stops safely without replay or false success", async () => { const h = await run({ pending: true }); assert.equal(h.rows[0].status, "failed"); assert.equal(h.saved.length, 0); assert.equal(h.requests.filter((x) => x.endsWith("email.find")).length, 1); assert.ok(publicSignalRun(h.rows[0]).spend.reservedMicro > 0); });
test("invalid post input starts no paid work", async () => { const h = harness(); await assert.rejects(h.invoke("POST /signal-runs", { brief: "A valid business offer", topics: [], postUrls: ["http://localhost/admin"], idempotency_key: "x" }), /HTTPS LinkedIn/); assert.equal(h.requests.length, 0); });
test("high reasoning still requires a grounded business before any provider call", async () => { const h = harness(); await assert.rejects(h.invoke('POST /signal-runs', {business_understanding:{},brief:'Revenue tooling',topics:['crm'],idempotency_key:'unconfirmed'}),/Tell Wasla more/); assert.equal(h.requests.length,0); });
test("budget exhaustion stops before another billable call", async () => { const h = await run({ budget: .05, exhaustBudget: true }); const view = publicSignalRun(h.rows[0]); assert.equal(view.status, "failed"); assert.ok(view.message.includes("budget")); assert.equal(view.spend.tregMicro, 50000); assert.equal(h.saved.length, 0); });
test("cancellation prevents subsequent delivery", async () => { const h = harness(); await h.invoke("POST /signal-runs", { brief: "Revenue tools for Saudi founders", topics: ["revenue"], target_count: 1, idempotency_key: "cancel" }); await h.invoke("POST /signal-runs/:id/cancel", {}, { params: { id: h.rows[0].id } }); await new Promise((r) => setTimeout(r, 15)); assert.equal(h.rows[0].status, "cancelled"); assert.equal(h.saved.length, 0); });
