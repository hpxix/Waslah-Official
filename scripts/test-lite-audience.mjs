import assert from 'node:assert/strict';
import {audienceRoute,audienceQuestion,routeMarker} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-audience.js';
import {createB2CAudienceTurn,createB2CPlan,validateB2CPlan,qualifyCandidates} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import {chatQuestionReply} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/chat-model.js';
import {runMahallyFallback} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/mahally.js';
const question=audienceQuestion('en');
assert.equal(audienceRoute('yes',[`assistant: ${question}`]),'merchants');
assert.equal(audienceRoute('no',[`assistant: ${question}`]),'marketplace');
assert.equal(audienceRoute("my client couldn't have an ecommerce"),'marketplace');
assert.equal(audienceRoute('Find ecommerce store owners selling cameras'),'merchants');
assert.equal(audienceRoute('لا',[`assistant: ${audienceQuestion('ar')}`]),'marketplace');
assert.equal(audienceRoute('yes',['assistant: Is your product a camera?']),null,'unrelated yes does not choose a route');
assert.equal(audienceRoute('my client cannot have an ecommerce',['user: target online stores']),'marketplace','latest correction wins');
for(const message of ['what is wasla','what is wasla and what wasla lite?','difference between lite and ultra','وش الفرق بين لايت والترا']){
 const reply=chatQuestionReply(message,'ar');assert.match(reply,/Lite/);assert.match(reply,/Astraeus/);assert.match(reply,/Ultra/);
 const turn=await createB2CAudienceTurn({}, {message,language:'en'});assert.equal(turn.conversational,true);assert.equal(turn.ready,false);
}
const request='find me people that want to buy security cameras in Riyadh Saudi Arabia';
const transcript=['user: what is wasla',`assistant: ${chatQuestionReply('what is wasla','en')}`];
const initial=await createB2CAudienceTurn({}, {message:request,transcript,language:'en',reasoningMode:'fast'});
assert.equal(initial.ready,false);assert.deepEqual(initial.missing,['customer_sales_channel']);assert.equal(initial.reply,question);
const history=[...transcript,`user: ${request}`,`assistant: ${question}`];
for(const [answer,route,count] of [['yes','merchants',10],['no','marketplace',6]]){
 const turn=await createB2CAudienceTurn({}, {message:answer,transcript:history,language:'en',reasoningMode:'fast'});
 assert.equal(turn.ready,true);assert.equal(turn.audienceRoute,route);assert.ok(turn.summary.includes(routeMarker(route)));
 const planning=await createB2CPlan({},turn.summary);assert.equal(planning.acquisitionPlan.audienceRoute,route);assert.equal(planning.acquisitionPlan.keywordMatching.productTerms.length,count);
 const retry=await validateB2CPlan({},request,planning);assert.equal(retry.acquisitionPlan.audienceRoute,route,'route survives creation and retries');
 for(const strategy of planning.acquisitionPlan.strategies)assert.equal(strategy.strategyType,'PRODUCT_AD_FALLBACK');
 const [match]=await qualifyCandidates({},[{postId:1,title:'تم البيع CCTV',bodyText:'',matchedStrategy:planning.acquisitionPlan.strategies[0]}],planning.acquisitionPlan);
 assert.equal(match.isQualified,true,'keyword in title alone qualifies regardless sold/commercial status');
}
// Merchant acquisition traverses ten independent product keywords, preserves
// store deduplication and stops exactly when the durable target is fulfilled.
const stats={},queries=[];let saved=0;
const options={env:{},plan:{audienceRoute:'merchants',keywordMatching:{productTerms:Array.from({length:10},(_,i)=>`product${i}`)},strategies:[{cities:['Riyadh']}]},stats,target:2,
 authorize:async()=>({allowed:true}),events:async function*(_env,input){queries.push(input.query);yield {type:'merchant',storeId:String(queries.length),productId:'1',domain:'https://example.com',productUrl:`https://mahally.com/en/products/${queries.length}/1/`,name:'Store',city:'Riyadh'};yield {type:'complete',reason:'pagination_unavailable'};},
 readContacts:async()=>({phones:['+966555555001'],sources:['https://example.com/contact']}),onCandidate:async()=>({created:++saved<=2}),shouldStop:()=>saved>=2};
await runMahallyFallback(options);assert.equal(saved,2);assert.equal(queries.length,2);assert.equal(stats.mahally.delivered,2);assert.equal(stats.mahally.stopReason,'target_reached');
const exhaustive={};queries.length=0;saved=0;
await runMahallyFallback({...options,stats:exhaustive,onCandidate:async()=>({created:false,reason:'duplicate'}),shouldStop:()=>false});
assert.equal(queries.length,10);assert.equal(exhaustive.mahally.complete,true);
console.log('PASS: friendly model Q&A bypasses intake; explicit yes/no/corrections; six vs ten product keywords; route persistence; keyword-only qualification; ten-term merchant traversal and exact target stop.');
