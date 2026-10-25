import assert from 'node:assert/strict';
import {discoverProfileContacts,discoverPostContacts,selectAuthorizedContact,normalizePublicPhone} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/contact-discovery.js';
import {contactPhoneHash,evaluateContactAuthorization,createContactAuthorizer,authorizeContactExport,redactUnauthorizedContactData} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/contact-authorization.js';
import {discoverCommentBuyers} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-comment-buyers.js';
import {persistQualifiedB2CLead} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import {contactScheduler} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-pipeline.js';

const phone='+966555555001',other='+966555555002',author={authorId:1,authorUsername:'fixture'};
const now=Date.parse('2026-10-22T12:00:00Z');
const record={id:'consent-1',organization_id:'org',author_id:'1',provider:'haraj',purpose:'lead_generation',status:'granted',actions:['lookup','save','export'],phone_hashes:[contactPhoneHash(phone)],evidence_reference:'verified-first-party-fixture',verified_by:'trusted-fixture',verified_at:'2026-10-22T10:00:00Z',granted_at:'2026-10-22T10:00:00Z',expires_at:'2027-10-22T10:00:00Z'};
const scope={organizationId:'org',authorId:1,action:'save',phone};
const evaluate=(row=record,extra={})=>evaluateContactAuthorization(row,{...scope,...extra},now);
const profile=(type,description)=>({id:1,type,contacts:[{type:'PHONE',description,info:phone}]});
for(const type of ['USER','STORE'])for(const description of ['', 'personal', 'sales company مبيعات']){
  const discovery=discoverProfileContacts(profile(type,description),author);
  assert.equal(discovery.candidates.length,1,`${type}/${description} must discover identically`);
  const denied=await selectAuthorizedContact(discovery,{authorId:1});
  assert.equal(denied.contact,null,'classification never grants permission');
  assert.equal(denied.exclusions.at(-1).reason,'not_authorized');
  const allowed=await selectAuthorizedContact(discovery,{authorId:1,authorizeContact:async s=>evaluate(record,s)});
  assert.deepEqual(allowed.contact.phones,[phone]);
}
assert.equal(discoverProfileContacts({...profile('STORE','sales'),id:2},author).exclusions[0].reason,'ownership_mismatch');
assert.equal(discoverProfileContacts(null,author).exclusions[0].reason,'missing');
assert.equal(discoverProfileContacts({id:1,contacts:[{type:'PHONE',info:'123'}]},author).exclusions[0].reason,'invalid');
const duplicate=discoverProfileContacts({id:1,contacts:[{type:'PHONE',info:phone},{type:'PHONE',info:'0555555001'}]},author);
assert.equal(duplicate.exclusions[0].reason,'duplicated');
assert.equal(normalizePublicPhone('٠٥٥٥٥٥٥٠٠١'),phone);
assert.equal(normalizePublicPhone('+14155552671'),null);
assert.equal(normalizePublicPhone('0112345678'),null);
const ad={id:20,authorId:1,title:'My used bicycle',bodyTEXT:phone};
assert.deepEqual(discoverPostContacts([ad],author).candidates.map(c=>c.phone),[phone]);
assert.equal(discoverPostContacts([{...ad,authorId:2}],author).candidates.length,0);
assert.equal(discoverPostContacts([{...ad,bodyTEXT:''}],author).exclusions[0].reason,'missing');
assert.equal(evaluate().allowed,true);
for(const change of [{status:'revoked'},{revoked_at:'2026-10-22T11:00:00Z'},{evidence_reference:''},{verified_by:''},{verified_at:'2027-01-01'},{expires_at:'2025-01-01'},{granted_at:'2027-01-01'},{phone_hashes:[]},{actions:['lookup']},{provider:'other'},{purpose:'other'},{organization_id:'other'},{author_id:'2'}])assert.equal(evaluate({...record,...change}).allowed,false,JSON.stringify(change));
assert.equal(evaluate(null).allowed,false);
assert.equal(evaluate(record,{phone:other}).detail,'phone_not_authorized');
assert.equal(evaluate({allowed:true,type:'STORE',description:'sales'}).allowed,false);
const discovery=discoverProfileContacts({id:1,contacts:[{type:'PHONE',info:phone},{type:'PHONE',info:other}]},author);
const partial=await selectAuthorizedContact(discovery,{authorId:1,authorizeContact:async s=>evaluate(record,s)});
assert.deepEqual(partial.contact.phones,[phone]);
assert.equal(partial.exclusions[0].reason,'not_authorized');
const known=await selectAuthorizedContact(duplicate,{authorId:1,authorizeContact:async s=>evaluate(record,s),knownPhones:new Set([phone])});
assert.equal(known.contact,null);assert.equal(known.exclusions.at(-1).reason,'duplicated');
assert.ok(!JSON.stringify(partial.exclusions).includes(phone));

function databaseWith(rows){
  const db=()=>{const q={where(){return q;},orderBy(){return q;},limit(){return q;},forShare(){db.locked=true;return q;},then(resolve,reject){return Promise.resolve(rows).then(resolve,reject);}};return q;};return db;
}
const db=databaseWith([record]);
assert.equal((await createContactAuthorizer(db,'org',{lock:true,now:()=>now})({authorId:1,action:'save',phone})).allowed,true);
assert.equal(db.locked,true);
const revokedDb=databaseWith([{...record,status:'revoked'},record]);
assert.equal((await createContactAuthorizer(revokedDb,'org',{now:()=>now})({authorId:1,action:'save',phone})).allowed,false,'older grants cannot bypass latest revocation');
const missingDb=()=>{throw Object.assign(new Error('missing table'),{code:'42P01'});};
assert.equal((await createContactAuthorizer(missingDb,'org')({authorId:1,action:'lookup'})).detail,'consent_registry_unconfigured');
const legacy={id:'lead',source:'b2c',author_id:1,phone,raw_payload:{phone_numbers:[{number:phone},{number:other}],contacts:[{info:555555002}]},evidence:[{buyerComment:{},businessContact:{phones:[phone,other]}}]};
const hidden=await authorizeContactExport(databaseWith([]),legacy,'org');
assert.equal(hidden.phone,null);assert.ok(!JSON.stringify(hidden).includes(phone));assert.ok(!JSON.stringify(hidden).includes(other));
const visible=await authorizeContactExport(db,legacy,'org');
assert.equal(visible.phone,phone);assert.ok(!JSON.stringify(visible).includes(other));
const shape=await authorizeContactExport(db,{source:'haraj',author_id:1,phone},'org');
assert.equal(Object.hasOwn(shape,'raw_payload'),false);
assert.equal(redactUnauthorizedContactData({authorId:555555001,phone:555555001}).authorId,555555001,'identity keys are not phone fields');

let fetched=0,saved=0;
const stats={};
await discoverCommentBuyers({plan:{keywordMatching:{productTerms:['كاميرات']},strategies:[{cities:['جدة']}]},target:1,stats,shouldStop:()=>false,
  fetchSearch:async()=>({items:[{id:20,authorId:99,title:'كاميرات',city:'جدة',commentEnabled:true,commentCount:1}],pageInfo:{hasNextPage:false}}),
  fetchComments:async()=>({items:[{id:1,authorId:1,authorUsername:'fixture',body:'بكم',status:1}],pageInfo:{hasNextPage:false}}),
  fetchProfile:async()=>{fetched++;return profile('USER','');},fetchPosts:async()=>{fetched++;return {items:[]};},onCandidate:async()=>{saved++;return {created:true};}});
assert.equal(fetched,0,'deny before phone-bearing requests');assert.equal(saved,0);
assert.equal(stats.commentDiscovery.contactExclusions[0].reason,'not_authorized');
assert.ok(!JSON.stringify(stats).includes(phone));

let writes=0;
const trx=table=>{const q={where(){return q;},forUpdate(){return q;},forShare(){return q;},orderBy(){return q;},limit(){return q;},first:async()=>table==='lead_requests'?{result_count:0}:{status:'RUNNING'},insert(){writes++;throw Error('must not write');},then(resolve,reject){return Promise.resolve([]).then(resolve,reject);}};return q;};
trx.raw=async()=>{};const database={transaction:fn=>fn(trx)};
const deniedSave=await persistQualifiedB2CLead(database,{id:'campaign',organization_id:'org',request_id:'request',target_lead_count:30},{authorId:1,businessContact:{phones:[phone]}},{},{contactMobile:phone},true);
assert.equal(deniedSave.reason,'not_authorized');assert.equal(writes,0,'no inventory write or billing without authorization');
const scheduler=contactScheduler({target:1,process:async()=>({created:false,reason:'not_authorized'})});
const task=await scheduler.submit({},'fixture');assert.equal((await task.done).reason,'not_authorized');await scheduler.drain();
console.log('PASS: classification-neutral discovery; ownership, validation, duplicates; verified scope, expiry, revocation; denied lookup/write/export; legacy redaction; structured exclusions; scheduler propagation. Synthetic fixtures only.');
