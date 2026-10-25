import assert from 'node:assert/strict';
import { discoverCommentBuyers, commentInterest, normalizePublicPhone } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-comment-buyers.js';
import { discoverProfileContacts, discoverPostContacts } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/contact-discovery.js';
import { contactScheduler } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-pipeline.js';
import { fetchPublicHarajConnection, fetchHarajSearch } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import { configureHarajSafety, initialHarajState, DEFAULT_HARAJ_LIMITS } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/haraj-safety.js';
import { COMMENTS_QUERY, PROFILE_QUERY, AUTHOR_POSTS_QUERY } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-comment-buyers.js';
const ad={id:185033253,authorId:99,title:'كاميرات مراقبة',city:'جدة',commentEnabled:true,commentCount:5,URL:'/11185033253/Surveillance_Cameras/'};
const comment=(id,body)=>({id,authorId:id,authorUsername:`business-${id}`,status:1,body,date:1790077115});
assert.equal(commentInterest(comment(1,'بكم'),ad).grade,'VERY_HIGH');
assert.equal(commentInterest(comment(1,'خارجية او داخلية'),ad).grade,'VERY_HIGH');
assert.equal(commentInterest(comment(2,'عطن رقمك بتواصل معاك'),ad).grade,'EXCELLENT');
assert.equal(commentInterest(comment(1,':: private comment ::'),ad),null);
for(const body of ['تم الشراء','غير مهتم','متوفر لدينا']) assert.ok(commentInterest(comment(1,body),ad),'public commenters are not excluded by semantic intent');
assert.equal(commentInterest(comment(99,'بكم'),ad),null);
assert.equal(discoverProfileContacts({id:'1',type:'USER',contacts:[{type:'PHONE',info:'0555555001'}]},comment(1,'بكم')).candidates.length,1);
assert.equal(discoverProfileContacts({id:'1',type:'USER',contacts:[{type:'PHONE',description:'Business sales',info:'0555555001'}]},comment(1,'بكم')).candidates.length,1);
assert.equal(commentInterest(comment(1,'السلام عليكم'),ad).grade,'MEDIUM');
const profile=id=>({id:String(id),type:'STORE',contacts:[{type:'PHONE',info:`055555500${id}`},{type:'PHONE',info:`055555500${id}`} ]});
assert.deepEqual(discoverProfileContacts(profile(1),comment(1,'بكم')).candidates.map(c=>c.phone),['+966555555001']);
assert.equal(normalizePublicPhone('٠٥٥٥٥٥٥٠٠١'),'+966555555001');
assert.equal(discoverProfileContacts(profile(2),comment(1,'بكم')).candidates.length,0);
assert.equal(discoverPostContacts([{authorId:1,title:'سيارة للبيع',bodyTEXT:'0555555001'}],comment(1,'بكم')).candidates.length,1);
const publicBusiness={authorId:3,id:30,title:'شركة حراسات امنية',bodyTEXT:'نقدم خدمات للتواصل 0555555003',city:'أبها',URL:'/30/'};
const extractPhone=post=>normalizePublicPhone(post.bodyText.match(/05\d{8}/)?.[0]);
assert.equal(discoverPostContacts([publicBusiness],comment(3,'بكم')).candidates[0].profileCity,'أبها');
let committed=0; const saved=[]; const calls=[];
const scheduler=contactScheduler({target:3,concurrency:1,process:async item=>{saved.push(item);committed++;return {created:true,committedCount:committed};}});
const stats={};
const config={authorizeContact:async()=>({allowed:true,authorizationId:'synthetic-consent'}),plan:{keywordMatching:{productTerms:['كاميرات']},strategies:[{cities:['جدة']}]},target:3,stats,
 fetchSearch:async()=>{calls.push('search');return {items:[ad],pageInfo:{hasNextPage:false}};},
 fetchComments:async()=>{calls.push('comments');return {items:[comment(1,'بكم'),comment(2,'عطن رقمك بتواصل معاك'),comment(3,'خارجية او داخلية'),comment(4,':: private comment ::')],pageInfo:{hasNextPage:false}};},
 fetchProfile:async id=>{calls.push(`profile:${id}`);return id===3?null:profile(id);},
 fetchPosts:async()=>({items:[publicBusiness],pageInfo:{hasNextPage:false}}),extractPhone,
 shouldStop:()=>scheduler.committed>=3,
 onCandidate:async(candidate,qualification)=>{const before=scheduler.committed;const task=await scheduler.submit({candidate,qualification},String(candidate.authorId));if(task)await task.done;await scheduler.drain();return {created:scheduler.committed>before};},
};
await discoverCommentBuyers(config);
assert.equal(saved.length,3);assert.equal(stats.commentDiscovery.delivered,3);
assert.equal(stats.commentDiscovery.stopReason,'target_reached');
assert.equal(saved[0].qualification.grade,'EXCELLENT');
assert.equal(new Set(saved.map(x=>x.candidate.businessContact.phones[0])).size,3,'same listing must not share commenter phones');
assert.ok(saved.every(x=>x.candidate.city==='جدة'));
assert.equal(saved.find(x=>x.candidate.authorId===3).candidate.buyerComment.profileCity,'أبها');
assert.equal(calls.includes('profile:4'),false);
const count=calls.length;await discoverCommentBuyers(config);assert.equal(calls.length,count,'completed primary does not rerun');
const error=new Error('provider paused');await assert.rejects(()=>discoverCommentBuyers({...config,stats:{},shouldStop:()=>false,fetchSearch:async()=>{throw error;}}),error);
const aborted=new AbortController();aborted.abort();await assert.rejects(()=>discoverCommentBuyers({...config,stats:{},shouldStop:()=>false,signal:aborted.signal}));
const bounded={};await discoverCommentBuyers({...config,stats:bounded,shouldStop:()=>false,options:{requestBudget:1}});assert.equal(bounded.commentDiscovery.requests,1);
assert.equal(bounded.commentDiscovery.complete,false,'request limit is a checkpoint, not exhaustion');
let resumedDelivered=0,searchCalls=0;const profileCalls=[];const resumable={};
const resumeConfig={...config,stats:resumable,shouldStop:()=>resumedDelivered===3,options:{requestBudget:2},
 fetchSearch:async()=>{searchCalls++;return {items:[ad],pageInfo:{hasNextPage:false}};},
 fetchProfile:async id=>{profileCalls.push(id);return id===3?null:profile(id);},
 onCandidate:async()=>{resumedDelivered++;return {created:true};}};
for(let pass=0;pass<5&&!resumable.commentDiscovery?.complete;pass++)await discoverCommentBuyers(resumeConfig);
assert.equal(resumedDelivered,3);assert.equal(resumable.commentDiscovery.complete,true);
assert.equal(searchCalls,1,'saved seed pages must not be fetched again');
assert.equal(new Set(profileCalls).size,profileCalls.length,'finished profile lookups must not repeat across passes');
const realNow=Date.now;let elapsedBudget=0;Date.now=()=>elapsedBudget;
try {
  const timed={};await discoverCommentBuyers({...config,stats:timed,shouldStop:()=>false,fetchSearch:async()=>{elapsedBudget=15_001;return {items:[ad],pageInfo:{hasNextPage:true}};}});
  assert.equal(timed.commentDiscovery.requests,1);assert.equal(timed.commentDiscovery.stopReason,'time_budget');
} finally {Date.now=realNow;}
const failedScheduler=contactScheduler({target:1,process:async()=>{throw error;}});const failure=await failedScheduler.submit({},'a');await failure.done;await assert.rejects(()=>failedScheduler.drain(),error);
console.log('PASS: comment intent, private/seller exclusions, professional contact identity, phone deduplication, source market, independent commenter phones, scheduler commits/errors, bounded requests, cancellation and resume.');
const state=initialHarajState();let clock=Date.now();
const guard=configureHarajSafety({store:{transact:async fn=>fn(state)},now:()=>clock,sleep:async ms=>{clock+=ms;},notify:async()=>{}});
await guard.control({action:'resume',confirmed:true,limits:DEFAULT_HARAJ_LIMITS,actor:'fixture'});
const originalFetch=globalThis.fetch;const network=[];
globalThis.fetch=async(url,options)=>{
  assert.equal(options.headers.Authorization,undefined,'public operations must not transmit bearer credentials');
  const payload=JSON.parse(options.body);assert.equal('token' in payload.variables,false);
  const field=new URL(url).hostname==='matjar.haraj.com.sa'?'profile':new URL(url).searchParams.get('queryName');network.push(field);
  return {ok:true,status:200,headers:new Headers(),json:async()=>({data:{[field]:field==='profile'?null:{items:[],pageInfo:{hasNextPage:false}}}})};
};
try {
  const env={HARAJ_SEARCH_URL:'https://graphql.haraj.com.sa/?queryName=search',HARAJ_BEARER_TOKEN:'must-not-send'};
  await fetchHarajSearch(env,{search:'كاميرات',page:0},{publicOnly:true});
  await fetchPublicHarajConnection(env,'comments',COMMENTS_QUERY,{postId:1,page:0,newestFirst:true});
  assert.equal(await fetchPublicHarajConnection(env,'profile',PROFILE_QUERY,{id:'1'}),null);
  await fetchPublicHarajConnection(env,'posts',AUTHOR_POSTS_QUERY,{authorUsername:'fixture',page:0});
  assert.deepEqual(network,['search','comments','profile','posts']);assert.equal(state.requests,4);
  assert.equal(state.contacts,0);assert.equal(state.paused,false);
} finally {globalThis.fetch=originalFetch;}
console.log('PASS: actual GraphQL wrappers, nullable profiles, shared guard accounting, no bearer/private token, no phone reveal calls. No provider traffic sent.');
