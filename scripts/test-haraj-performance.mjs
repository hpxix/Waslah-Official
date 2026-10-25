import assert from 'node:assert/strict';
import { harajPerformance } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/haraj-performance.js';
import { createHarajSafety, initialHarajState, DEFAULT_HARAJ_LIMITS } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/haraj-safety.js';

const now = Date.parse('2026-10-22T03:00:00Z');
const base = { ...initialHarajState(), paused: false, reason: null, day: '2026-10-22', requests: 20 };
const at = delta => new Date(now - delta).toISOString();
const events = [
  {at: at(90000000), kind:'search', outcome:'ok', status:200, durationMs:9000},
  {at: at(5000), kind:'admin_resume'},
  {at: at(4000), kind:'search', outcome:'ok', status:200, durationMs:100},
  {at: at(3000), kind:'contact', outcome:'empty', status:200, durationMs:500},
  {at: at(2000), kind:'search', outcome:'invalid_response', status:200},
  {at: at(1000), kind:'search', outcome:'rate_limited', status:429, durationMs:700},
];
const p = harajPerformance({...base, events}, now);
assert.equal(p.sampleCount, 4, 'exclude admin actions and requests older than 24h');
assert.equal(p.successRate, 50, 'HTTP 200 with invalid data is not a successful response');
assert.equal(p.httpOkCount, 3);
assert.equal(p.medianMs, 500);
assert.equal(p.p95Ms, 700);
assert.equal(p.latencySampleCount, 3, 'old untimed events are not invented latency samples');
assert.equal(p.dailyRequests, 20);
assert.equal(p.maximumRequestsPerMinute, 20);
assert.equal(harajPerformance({...base, day:'2026-10-21'}, now).dailyRequests, 0, 'display UTC rollover without resetting persisted budgets');
assert.equal(harajPerformance(base, now).risk.score, null, 'no evidence is unknown, not healthy');
assert.equal(harajPerformance({...base, paused:true, reason:'invalid_response'}, now).risk.score, 75);
assert.ok(harajPerformance({...base, paused:true, reason:'access_restricted'}, now).risk.score >= 90);
assert.ok(harajPerformance({...base, requests:900, events, limits:{...base.limits,intervalMs:1000}}, now).risk.reasons.includes('fast_pacing'));

let time = now;
const state = {...initialHarajState(), reason:'invalid_response', day:'2026-10-22', requests:42, contacts:5, contactsPaused:true, contactPauseReason:'repeated_empty_contacts', emptyContacts:5};
const guard = createHarajSafety({store:{transact:async fn=>fn(state)},now:()=>time, sleep:async ms=>{time+=ms;},notify:async()=>{}});
const limits = {...DEFAULT_HARAJ_LIMITS,intervalMs:6000};
await assert.rejects(()=>guard.control({action:'configure',limits,confirmed:false}), /Confirm authorized/);
assert.equal(state.limits.intervalMs,3000);
await guard.control({action:'configure',limits,confirmed:true,actor:'synthetic-admin'});
assert.equal(state.paused,true,'saving performance never releases a pause');
assert.equal(state.contactsPaused,true);
assert.equal(state.requests,42);
assert.equal(state.limits.intervalMs,6000);
assert.equal(state.events.at(-1).kind,'admin_configure');
await assert.rejects(()=>guard.control({action:'configure',limits:{...limits,intervalMs:0},confirmed:true}), /Invalid Haraj safety limit/);
state.retryAt=time+60000;
await assert.rejects(()=>guard.control({action:'resume',limits,confirmed:true,searchOnly:true}), /Retry-After/);
state.retryAt=null;
await guard.control({action:'resume',limits,confirmed:true,searchOnly:true,actor:'synthetic-admin'});
assert.equal(state.paused,false);
assert.equal(state.contactsPaused,true,'listing-only release preserves the phone circuit');
assert.equal(state.emptyContacts,5);
assert.equal(state.requests,42,'resume never resets billing/budget evidence');
assert.equal(state.contacts,5);
assert.equal(state.events.at(-1).scope,'search');
await guard.execute({kind:'search'},async()=>{time+=275;return{value:{},status:200};});
const view=await guard.status();
assert.equal(view.events.at(-1).durationMs,275);
assert.equal(view.performance.p95Ms,275);
assert.equal(view.performance.sampleCount,1);
assert.ok(!Object.hasOwn(view,'cache'));
await guard.control({action:'pause'});
await guard.control({action:'resume',limits,confirmed:true,searchOnly:false,actor:'synthetic-admin'});
assert.equal(state.contactsPaused,false,'phone release requires explicit full-scope admin action');
assert.equal(state.contacts,5);
await assert.rejects(()=>guard.execute({kind:'search'},async()=>{throw Object.assign(new Error('synthetic raw response must stay private'),{status:200,code:'HARAJ_INVALID_RESPONSE',responseDiagnostic:'missing_pagination'});}),/invalid_response/);
assert.equal(state.events.at(-1).diagnostic,'missing_pagination');
assert.ok(!JSON.stringify(state.events).includes('synthetic raw response'));
await guard.control({action:'resume',limits,confirmed:true,searchOnly:true,actor:'synthetic-admin'});
await assert.rejects(()=>guard.execute({kind:'search'},async()=>{throw Object.assign(new Error('untrusted error'),{status:200,code:'HARAJ_INVALID_RESPONSE',responseDiagnostic:'not-allowlisted-sensitive-text'});}),/invalid_response/);
assert.ok(!Object.hasOwn(state.events.at(-1),'diagnostic'),'untrusted response detail is never persisted');
console.log('Haraj performance checks passed: valid-data vs HTTP success, latency, UTC usage, unknown/stale data, reviewed settings, scoped release, audit, cooldown and budget preservation. No provider calls.');
