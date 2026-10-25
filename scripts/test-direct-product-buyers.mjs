import assert from 'node:assert/strict';
import {createB2CDiscoveryTurn,createB2CPlan,directProductBuyerBrief} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';

const request='find me people that would buy security cameras in riyadh saudi arabia';
const exactRequest='find me people that would want to buy security cameras in saudi arabia riyadh';
const exactTurn=await createB2CDiscoveryTurn({}, {message:exactRequest,language:'en',reasoningMode:'fast'});
assert.equal(exactTurn.ready,true);
assert.equal(exactTurn.searchRoute,'buyer_intent_then_comments_then_product_ads');
const failingRequest="find me people that are trying to buy security camera's cctvs in saudi arabia riyadh";
const failedReply='Your target details are saved, but I couldn’t prepare the search plan this time. Retry and I’ll use the same product and area without asking you to repeat your answers.';
const actualTranscript=[
 'user: Mission context: the user wants to sell to consumers. Understand the offer, ideal customer, geography, observable intent or ownership signals, categories, keywords, and exclusions.',
 'assistant: Let’s build a real audience for your offer. What product or service are you selling, and what core outcome does the customer get?',
 `user: ${failingRequest}`,`assistant: ${failedReply}`,`user: ${failingRequest}`,`assistant: ${failedReply}`,'user: yo dumbass try again',
];
const originalFetch=globalThis.fetch;
globalThis.fetch=()=>{throw new Error('Known-product chat must not call an AI provider');};
try{
 for(const message of [failingRequest,'yo dumbass try again']){
  const turn=await createB2CDiscoveryTurn({OPENROUTER_API_KEY:'fixture'}, {message,transcript:actualTranscript,language:'en',reasoningMode:'fast'});
  assert.equal(turn.ready,true);
  const planning=await createB2CPlan({OPENROUTER_API_KEY:'fixture'},turn.summary);
  assert.equal(planning.intent.productName,'كاميرات مراقبة');
  assert.deepEqual(planning.intent.market.cities,['Riyadh']);
  assert.equal(planning.acquisitionPlan.primaryLeadRoute,'buyer_intent_then_comments_then_product_ads');
 }
 for(const wording of ['people who are looking to buy CCTV’s','people interested in buying security cameras','people that need to purchase surveillance cameras','buyers for cctvs'])assert.ok(directProductBuyerBrief(`user: find ${wording} in Riyadh`)?.known,wording);
 assert.equal(directProductBuyerBrief('user: find people who do not want to buy security cameras in Riyadh'),null);
 const plan=await createB2CPlan({OPENROUTER_API_KEY:'fixture'},"I sell security camera’s in Riyadh");
 assert.equal(plan.intent.productName,'كاميرات مراقبة');
}finally{globalThis.fetch=originalFetch;}
const transcript=[];
for(const message of [request,'properties usually newly made properties they always need security cameras','property']) {
  const turn=await createB2CDiscoveryTurn({}, {message,transcript,language:'en',reasoningMode:'fast'});
  assert.equal(turn.ready,true);
  assert.deepEqual(turn.missing,[]);
  assert.equal(turn.searchRoute,'buyer_intent_then_comments_then_product_ads');
  assert.doesNotMatch(turn.reply,/already own|what product|which city/i);
  const plan=await createB2CPlan({},turn.summary);
  assert.equal(plan.acquisitionPlan.primaryLeadRoute,'buyer_intent_then_comments_then_product_ads');
  assert.ok(plan.acquisitionPlan.keywordMatching.productTerms.includes('كميرات'));
  assert.ok(plan.acquisitionPlan.strategies.every(strategy=>strategy.cities.includes('Riyadh')));
  assert.equal(plan.acquisitionPlan.dealIntent,'sell');
  transcript.push(`user: ${message}`,`assistant: ${turn.reply}`);
}
const ar=await createB2CDiscoveryTurn({}, {message:'ابي ناس يشترون كاميرات مراقبة في الرياض',language:'ar',reasoningMode:'high'});
assert.equal(ar.ready,true);
assert.equal(ar.searchRoute,'buyer_intent_then_comments_then_product_ads');
assert.equal(directProductBuyerBrief('assistant: Find people who buy cameras in Riyadh'),null);
assert.equal(directProductBuyerBrief('user: find people who buy it in Riyadh'),null);
const missingLocation=await createB2CDiscoveryTurn({}, {message:'find people who buy security cameras',language:'en',reasoningMode:'fast'});
assert.equal(missingLocation.ready,false);
assert.match(missingLocation.reply,/city/i);
console.log('PASS: exact screenshot conversation, retained product/city, Arabic and high mode, ordered acquisition planning, camera spelling aliases, and no assistant-invented target. No provider calls.');
