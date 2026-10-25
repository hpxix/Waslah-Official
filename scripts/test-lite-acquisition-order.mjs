import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {liteAcquisitionLimits,orderedLiteStrategies,orderedLiteStage,nextLiteStage,liteStrategyKey} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-acquisition-order.js';
import {listingBudget} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-limits.js';
import {discoverCommentBuyers} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-comment-buyers.js';
import {qualifyCandidates} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
const plan={keywordMatching:{version:'saudi-keyword-v1',productTerms:['كاميرات مراقبة','كميرات','CCTV'],intentTerms:['مطلوب','ابي'],titleExclusions:['جراب'],commercialTerms:['متجر','بالجملة','متوفر لدينا']},dealIntent:'sell',strategies:[{pathId:'buyer',searchTerm:'مطلوب كاميرات مراقبة',phaseIndex:0,strategyType:'DIRECT_PURCHASE_INTENT',cities:['Riyadh']},{searchTerm:'عقارات',strategyType:'OWNER_FALLBACK'}]};
const strategies=orderedLiteStrategies(plan),progress={};
assert.equal(strategies[0].strategyType,'DIRECT_PURCHASE_INTENT');
assert.ok(!strategies.some(strategy=>strategy.searchTerm==='عقارات'),'unrelated ownership proxies do not enter product-ad fallback');
assert.deepEqual(strategies.filter(strategy=>strategy.strategyType==='PRODUCT_AD_FALLBACK').map(strategy=>strategy.searchTerm),['كاميرات مراقبة','كميرات','CCTV']);
const limits=liteAcquisitionLimits(30);
assert.deepEqual(limits,{total:1000,buyer_intent:250,product_comments:250,product_ads:500});
const usage={buyer_intent:249,product_comments:0,product_ads:0};
assert.equal(orderedLiteStage(strategies,{},undefined,'product_ads',limits,usage),'buyer_intent');
usage.buyer_intent=250;
assert.equal(orderedLiteStage(strategies,{},undefined,'buyer_intent',limits,usage),'product_comments');
usage.product_comments=250;
assert.equal(orderedLiteStage(strategies,{},undefined,'buyer_intent',limits,usage),'product_ads');
usage.product_ads=500;
assert.equal(orderedLiteStage(strategies,{},undefined,'buyer_intent',limits,usage),null,'no restart after cap on retry');
const budget=listingBudget(250,200),reservations=Array.from({length:8},()=>budget.reserve(50));
assert.equal(reservations.reduce((sum,r)=>sum+r.amount,0),50,'concurrent readers cannot exceed stage cap');
reservations.forEach(r=>r.finish(r.amount));assert.equal(budget.used,250);
let stage=orderedLiteStage(strategies,progress,undefined);
assert.equal(stage,'buyer_intent');
stage=orderedLiteStage(strategies,progress,undefined,nextLiteStage(stage));assert.equal(stage,'product_comments');
stage=orderedLiteStage(strategies,progress,{complete:false},nextLiteStage(stage));assert.equal(stage,'product_ads','a comments checkpoint must not starve the ad fallback');
stage=orderedLiteStage(strategies,progress,{complete:false},nextLiteStage(stage));assert.equal(stage,'buyer_intent','resume remaining sources with saved cursors');
for(const strategy of strategies)progress[liteStrategyKey(strategy)]={exhausted:true};
assert.equal(orderedLiteStage(strategies,progress,{complete:false}),'product_comments');
assert.equal(orderedLiteStage(strategies,progress,{complete:true}),null);
const fallback=strategies.find(strategy=>strategy.strategyType==='PRODUCT_AD_FALLBACK');
const ad=(title,bodyText)=>({postId:1,authorId:1,title,bodyText,matchedStrategy:fallback});
const cases=[
  [ad('متجر كاميرات مراقبة','متوفر لدينا بالجملة 0555555001'),true],
  [ad('للبيع','CCTV ٠٥٥٥٥٥٥٠٠١'),true],
  [ad('كاميرات مراقبة','بدون رقم منشور'),true],
  [ad('سيارة للبيع','0555555001'),false],
  [ad('كاميرات مراقبة','+14155552671'),true],
  [ad('تم البيع كاميرات مراقبة','0555555001'),true],
  [ad('باحث عن عمل CCTV','بدون رقم'),true],
];
const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('No provider calls allowed');};
try{
  for(const [candidate,expected] of cases){const [decision]=await qualifyCandidates({},[candidate],plan);assert.equal(decision.isQualified,expected,candidate.title);assert.equal(decision.demandEvidence,false);assert.equal(decision.grade,'MEDIUM');}
  const [buyer]=await qualifyCandidates({},[{...ad('متجر كاميرات مراقبة','0555555001'),matchedStrategy:strategies[0]}],plan);
  assert.equal(buyer.isQualified,false,'the broader ad rule does not loosen the buyer-intent stage');
}finally{globalThis.fetch=originalFetch;}
const runner=readFileSync(new URL('../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js',import.meta.url),'utf8');
assert.ok(runner.includes("(!orderedFlow || acquisitionStage==='product_comments')"));
assert.ok(runner.includes('if (progress.exhausted || orderedFlow) break;'));
assert.ok(runner.includes("authorizeContact:createContactAuthorizer(database,campaign.organization_id)"));
assert.ok(runner.includes('authorizeContactSave(trx,campaign.organization_id,candidate,phone'));
assert.ok(runner.includes("candidate.matchedStrategy?.strategyType!=='PRODUCT_AD_FALLBACK'"),'no minimum score gate for keyword ads');
assert.ok(runner.includes('plan.keywordMatching && !orderedFlow'),'legacy expansion cannot overwrite ordered strategies');
const commentStats={};let lookups=0;
const comments=Array.from({length:300},(_,i)=>({id:i+1,authorId:i+1,authorUsername:`fixture-${i+1}`,body:'السلام عليكم',status:1}));
const config={plan,stats:commentStats,target:30,options:{accountLimit:250,seedListingLimit:250,timeBudgetMs:300000},
 fetchSearch:async()=>({items:[{id:1,authorId:999,title:'منتج',bodyTEXT:'CCTV',commentEnabled:true,commentCount:300,city:'Riyadh'}],pageInfo:{hasNextPage:false}}),
 fetchComments:async()=>({items:comments,pageInfo:{hasNextPage:false}}),
 authorizeContact:async()=>{lookups++;return {allowed:false,detail:'consent_required'};},
 fetchProfile:async()=>{throw Error('Unauthorized contact retrieval');},fetchPosts:async()=>{throw Error('Unauthorized contact retrieval');},onCandidate:async()=>{throw Error('Unauthorized save');}};
await discoverCommentBuyers(config);
assert.equal(commentStats.commentDiscovery.accountsProcessed,250);
assert.equal(commentStats.commentDiscovery.stopReason,'account_limit');
assert.equal(lookups,250);
await discoverCommentBuyers(config);assert.equal(lookups,250,'retry cannot process another 250');
console.log('PASS: persistent 250 buyer listings -> 250 distinct commenter accounts -> 500 keyword listings; no cap overshoot; English/Arabic title/body keywords only; phone delivery and authorization remain separate.');
