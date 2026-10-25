import assert from 'node:assert/strict';
import {harajRuntimeMs,harajRuntime,enterHarajStage,harajDeadline,harajTimeLimitMessage} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/haraj-runtime.js';
import {orderedLiteStage,orderedLiteStrategies,liteAcquisitionLimits} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-acquisition-order.js';
import {configureHarajSafety,initialHarajState} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/haraj-safety.js';
import {fetchHarajSearch} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import {runPagePipeline,contactScheduler} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-pipeline.js';

assert.equal(harajRuntimeMs(30),300000);
assert.equal(harajRuntimeMs(50),500000);
assert.equal(harajRuntimeMs(60),600000);
assert.equal(harajRuntimeMs(200),2000000);
const runtime=harajRuntime(null,30,'initial',1000);
assert.equal(enterHarajStage(runtime,'buyer_intent',1000),76000);
assert.equal(enterHarajStage(runtime,'buyer_intent',70000),76000,'new pass cannot restart the stage clock');
const reloaded=harajRuntime(JSON.parse(JSON.stringify(runtime)),30,'initial',70000);
assert.equal(reloaded.deadlineAtMs,301000,'process recovery does not reset wall clock');
assert.equal(enterHarajStage(reloaded,'product_comments',76000),151000);
assert.equal(enterHarajStage(reloaded,'product_ads',151000),301000);
const retry=harajRuntime(reloaded,30,'explicit-retry',401000);
assert.equal(retry.deadlineAtMs,701000);
assert.deepEqual(retry.stoppedStages,{});
const early=harajRuntime(null,30,'initial',1000);
enterHarajStage(early,'buyer_intent',1000);
assert.equal(enterHarajStage(early,'product_comments',10000),107000,'unused buyer time transfers to remaining stages');
assert.equal(enterHarajStage(early,'product_ads',20000),301000);

const plan={keywordMatching:{productTerms:['CCTV']},strategies:[{strategyType:'DIRECT_PURCHASE_INTENT',searchTerm:'ابي CCTV'}]};
const strategies=orderedLiteStrategies(plan),limits=liteAcquisitionLimits(30);
assert.equal(orderedLiteStage(strategies,{},null,'buyer_intent',limits,{}, {buyer_intent:'time_limit'}),'product_comments');
assert.equal(orderedLiteStage(strategies,{},null,'buyer_intent',limits,{}, {buyer_intent:'time_limit',product_comments:'time_limit'}),'product_ads');
assert.equal(orderedLiteStage(strategies,{},null,'buyer_intent',limits,{}, {buyer_intent:true,product_comments:true,product_ads:true}),null);

// Inject a clock: no real five-minute waits or provider traffic in tests.
let expire,scheduled,cancelled;
const clock={now:()=>1000,schedule:(fn,ms)=>{expire=fn;scheduled=ms;return 123;},cancel:id=>{cancelled=id;}};
const deadline=harajDeadline(runtime,'buyer_intent',null,clock);
assert.equal(scheduled,75000);expire();assert.equal(deadline.signal.reason.code,'HARAJ_STAGE_TIME_LIMIT');
deadline.close();assert.equal(cancelled,123);
const late=harajDeadline(runtime,null,null,{...clock,now:()=>301001});
assert.equal(late.signal.aborted,true);assert.equal(late.signal.reason.code,'HARAJ_TIME_LIMIT');
const user=new AbortController();const controlled=harajDeadline(runtime,null,user.signal,clock);
user.abort(new Error('User stopped'));assert.equal(controlled.signal.reason.message,'User stopped');controlled.close();
assert.match(harajTimeLimitMessage(runtime,4,30),/5m time limit.*4 of 30.*does not mean the source was exhausted/);

// Real fetch wrapper + guard: interrupt JSON body reading and verify that the
// deadline releases the lease without globally pausing the connection.
const originalFetch=globalThis.fetch;
const state=initialHarajState();Object.assign(state,{paused:false,reason:null});
const guard=configureHarajSafety({store:{transact:async fn=>fn(state)},notify:async()=>{}});
try {
  const budget=harajDeadline(harajRuntime(null,30,'initial',1000),null,null,clock);
  globalThis.fetch=async()=>({status:200,ok:true,headers:new Headers(),json:async()=>{expire();throw budget.signal.reason;}});
  await assert.rejects(fetchHarajSearch({HARAJ_SEARCH_URL:'https://graphql.haraj.com.sa/',__b2cSignal:budget.signal},{search:'CCTV'},{publicOnly:true}),{code:'HARAJ_TIME_LIMIT'});
  assert.equal(state.paused,false);assert.equal(state.failures,0);assert.equal(state.lease,null);assert.equal(state.requests,1);
  budget.close();
  const queued=harajDeadline(harajRuntime(null,30,'initial',1000),null,null,clock);
  state.nextAt=Date.now()+100000;
  let calls=0;
  const work=guard.execute({kind:'search',signal:queued.signal},async()=>{calls++;return {value:{},empty:false};});
  expire();await assert.rejects(work,{code:'HARAJ_TIME_LIMIT'});assert.equal(calls,0,'queued request never starts after deadline');queued.close();
} finally {globalThis.fetch=originalFetch;}

// Abort drains producer/consumer/contact workers; no background save starts.
const stop=new AbortController();let saves=0;
const scheduler=contactScheduler({target:30,concurrency:4,process:async()=>{
  await new Promise(resolve=>setImmediate(resolve));stop.signal.throwIfAborted();saves++;return {created:true};
}});
const task=runPagePipeline({sources:[(async function*(){yield [1,2,3];})()],signal:stop.signal,
  consume:async items=>{for(const item of items){stop.signal.throwIfAborted();await scheduler.submit(item,item);stop.abort(new Error('deadline'));}}});
await assert.rejects(task,/deadline/);await assert.rejects(scheduler.drain(),/deadline/);assert.equal(saves,0);
console.log('PASS: proportional persistent Haraj deadlines, stage fairness, explicit retries, queue/HTTP-body cancellation, pipeline drain and no false provider pause. No live requests.');
