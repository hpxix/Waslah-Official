import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createConsentWorkflow,canonicalConsentJson,verifyConsentSignature,validateConsentActions,consentPortalUrl,CONSENT_STATEMENT_VERSION,registerContactConsentRoutes} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/contact-consent.js';
import {createContactAuthorizer,authorizeContactExport,contactPhoneHash,evaluateContactAuthorization} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/contact-authorization.js';

// Transactional in-memory fixture. PostgreSQL locking is separately exercised
// by test-contact-consent-postgres.mjs; this fixture does not claim race coverage.
function fixtureDatabase(){
  let tables={};const locks=[];
  const db=table=>{
    const filters=[],order=[];let maximum=Infinity;
    const rows=()=>{let selected=(tables[table]||[]).filter(row=>filters.every(test=>test(row)));for(const [key,direction] of [...order].reverse())selected=selected.slice().sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(direction==='desc'?-1:1));return selected.slice(0,maximum);};
    const q={where(key,op,value){if(typeof key==='object')filters.push(row=>Object.entries(key).every(([k,v])=>row[k]===v));else filters.push(row=>op==='>'?row[key]>value:row[key]===value);return q;},whereIn(key,values){filters.push(row=>values.includes(row[key]));return q;},orderBy(key,direction){order.push([key,direction]);return q;},limit(n){maximum=n;return q;},forUpdate(){return q;},forShare(){return q;},select(){return q;},count(){return {first:async()=>({total:rows().length})};},first:async()=>structuredClone(rows()[0]),insert:async row=>{tables[table]||=[];tables[table].push(structuredClone(row));},update:async patch=>{const chosen=rows();for(const row of chosen)Object.assign(row,patch);return chosen.length;},then(resolve,reject){return Promise.resolve(structuredClone(rows())).then(resolve,reject);}};
    return q;
  };
  db.isTransaction=true;db.raw=async(sql,bindings)=>{locks.push({sql,bindings});};
  db.transaction=async fn=>{const prior=structuredClone(tables);try{return await fn(db);}catch(error){tables=prior;throw error;}};
  db.rows=table=>tables[table]||[];db.locks=locks;return db;
}
const env={HARAJ_CONSENT_SIGNING_SECRET:'fixture-signing-secret-not-for-production-123',HARAJ_CONSENT_BRIDGE_TOKEN:'fixture-bridge-token-not-for-production-456',HARAJ_CONSENT_ISSUER:'haraj-test',HARAJ_CONSENT_PORTAL_URL:'https://consent.example.test/haraj'};
let clock=Date.parse('2026-10-22T12:00:00Z');
const db=fixtureDatabase(),workflow=createConsentWorkflow({database:db,env,now:()=>clock});
const org=randomUUID(),user=randomUUID(),phone='+966555555001',other='+966555555002';
const context={organizationId:org,organizationName:'Fixture workspace',userId:user,authorId:'12',actions:['save','reveal','download','call'],expiresAt:'2026-11-22T12:00:00Z'};
function signed(body,offset=0){const timestamp=String(Math.floor(clock/1000)+offset),eventId=body.event_id;return {'x-consent-timestamp':timestamp,'x-consent-event-id':eventId,'x-consent-signature':'sha256='+createHmac('sha256',env.HARAJ_CONSENT_SIGNING_SECRET).update(`${timestamp}.${eventId}.${canonicalConsentJson(body)}`).digest('hex')};}
function grantBody(request,challenge,extra={}){return {event_id:randomUUID(),issuer:env.HARAJ_CONSENT_ISSUER,type:'grant',request_id:request.id,subject_author_id:'12',statement_version:CONSENT_STATEMENT_VERSION,verification_method:'haraj_session_and_phone_verification',contact_kind:'personal',actions:context.actions,expires_at:context.expiresAt,verified_phones:[phone],challenge,...extra};}
const authorize=createContactAuthorizer(db,org,{now:()=>clock});
assert.deepEqual(validateConsentActions(['save']),['lookup','save']);
assert.throws(()=>validateConsentActions(['export']),/INVALID_ACTIONS/);
assert.equal(consentPortalUrl('http://unsafe.test',randomUUID()),null);
const requested=await workflow.request(context);
assert.equal(requested.status,'pending');assert.equal(Object.hasOwn(requested,'challenge'),false);
assert.equal(requested.disclosure.recipientWorkspaceId,org);
assert.equal((await authorize({authorId:'12',action:'lookup'})).status,'consent_required');
const challenge=await workflow.challenge(requested.id);
assert.ok(challenge.challenge.length>=43);
assert.ok(!JSON.stringify(db.rows('wasla_contact_consent_requests')).includes(challenge.challenge),'only challenge hash is stored');
await assert.rejects(()=>workflow.challenge(requested.id),/CHALLENGE_ALREADY_ISSUED/);
const body=grantBody(requested,challenge.challenge);
assert.throws(()=>verifyConsentSignature(env,signed(body,301),body,clock),/INVALID_ATTESTATION/);
assert.throws(()=>verifyConsentSignature(env,signed(body),{...body,actions:['call']},clock),/INVALID_ATTESTATION/);
assert.throws(()=>verifyConsentSignature({},signed(body),body,clock),/BRIDGE_UNCONFIGURED/);
const wrongSubject=grantBody(requested,challenge.challenge,{subject_author_id:'13'});
await assert.rejects(()=>workflow.attest(signed(wrongSubject),wrongSubject),/SUBJECT_VERIFICATION_REQUIRED/);
const wrongChallenge=grantBody(requested,'fabricated');await assert.rejects(()=>workflow.attest(signed(wrongChallenge),wrongChallenge),/REQUEST_NOT_ACTIVE/);
const receipt=await workflow.attest(signed(body),body);
assert.equal(receipt.status,'authorized');
assert.equal((await workflow.attest(signed(body),body)).status,'already_processed');
const altered={...body,expires_at:'2026-11-21T12:00:00Z'};await assert.rejects(()=>workflow.attest(signed(altered),altered),/REPLAY_CONFLICT/);
const replay={...body,event_id:randomUUID()};await assert.rejects(()=>workflow.attest(signed(replay),replay),/REQUEST_NOT_ACTIVE/);
for(const action of ['lookup','save','reveal','download','call'])assert.equal((await authorize({authorId:'12',action,phone})).allowed,true,action);
assert.equal((await authorize({authorId:'12',action:'save',phone:other})).status,'phone_scope_required');
assert.equal((await createContactAuthorizer(db,randomUUID(),{now:()=>clock})({authorId:'12',action:'save',phone})).allowed,false);
assert.ok(db.locks.some(lock=>lock.sql.includes('lock_shared')));assert.ok(db.locks.some(lock=>lock.sql.includes('pg_advisory_xact_lock(')));
assert.ok(!JSON.stringify(db.rows('wasla_contact_authorizations')).includes(phone),'registry contains phone hashes, not raw numbers');

// An independent scope for another number must not shadow existing permissions.
clock+=1000;
const secondRequest=await workflow.request({...context,actions:['save','reveal']});const secondChallenge=await workflow.challenge(secondRequest.id);
const second=grantBody(secondRequest,secondChallenge.challenge,{actions:['save','reveal'],verified_phones:[other],contact_kind:'public_business'});
await workflow.attest(signed(second),second);
assert.equal((await authorize({authorId:'12',action:'call',phone})).allowed,true);
assert.equal((await authorize({authorId:'12',action:'call',phone:other})).allowed,false,'business label never implies outreach permission');
assert.equal((await authorize({authorId:'12',action:'reveal',phone:other})).allowed,true);

// Fresh export must honor explicit action scopes, not prior browser or payment state.
const paidLead={id:randomUUID(),source:'haraj',author_id:'12',phone,raw_payload:{phone_numbers:[{number:phone},{number:other}]}};
assert.equal((await authorizeContactExport(db,paidLead,org,{action:'call'})).phone,phone);
const pending=await workflow.request(context),pendingChallenge=await workflow.challenge(pending.id);
const revoke={event_id:randomUUID(),issuer:env.HARAJ_CONSENT_ISSUER,type:'revoke',authorization_id:receipt.authorizationId,subject_author_id:'12'};
await workflow.attest(signed(revoke),revoke);
for(const number of [phone,other])assert.equal((await authorize({authorId:'12',action:'reveal',phone:number})).status,'revoked');
assert.equal((await authorizeContactExport(db,paidLead,org,{action:'download'})).phone,null);
const stale=grantBody(pending,pendingChallenge.challenge);await assert.rejects(()=>workflow.attest(signed(stale),stale),/REQUEST_NOT_ACTIVE/);
assert.equal((await workflow.attest(signed(body),body)).status,'already_processed');
assert.equal((await authorize({authorId:'12',action:'save',phone})).allowed,false,'receipt replay cannot restore revoked grants');
const audits=JSON.stringify(db.rows('wasla_contact_audit'));assert.ok(!audits.includes(phone));assert.ok(!audits.includes(challenge.challenge));
assert.ok(db.rows('wasla_contact_audit').some(row=>row.event_type==='consent_revoked'));
assert.ok(db.rows('wasla_contact_audit').some(row=>row.event_type==='authorization_decision'&&row.allowed===false));

const newRequest=await workflow.request({...context,authorId:'20',actions:['save']});
const newChallenge=await workflow.challenge(newRequest.id);
const escalation=grantBody(newRequest,newChallenge.challenge,{subject_author_id:'20',actions:['save','call']});await assert.rejects(()=>workflow.attest(signed(escalation),escalation),/SCOPE_ESCALATION/);
clock+=1801_000;const expired=grantBody(newRequest,newChallenge.challenge,{subject_author_id:'20',actions:['save']});await assert.rejects(()=>workflow.attest(signed(expired),expired),/REQUEST_NOT_ACTIVE/);
const v1={...db.rows('wasla_contact_authorizations')[0],status:'granted',revoked_at:null,policy_version:1,actions:['save','export'],phone_hashes:[contactPhoneHash(phone)]};
assert.equal(evaluateContactAuthorization(v1,{organizationId:org,authorId:'12',action:'download',phone},clock).allowed,true);
assert.equal(evaluateContactAuthorization(v1,{organizationId:org,authorId:'12',action:'call',phone},clock).allowed,false);

// Route authorization: workspace cannot be selected by the request body;
// challenge delivery is never available to a customer or arbitrary bearer.
const routes=new Map(),router={post:(path,fn)=>routes.set('POST '+path,fn),get:(path,fn)=>routes.set('GET '+path,fn)};
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
registerContactConsentRoutes(router,{database:db,env,logger:{},route:fn=>fn,customerContext:async()=>({organization:{id:org,name:'fixture'},userId:user}),ApiError});
const res={set(){return res;},status(){return res;},json(value){res.body=value;return res;}};
await assert.rejects(()=>routes.get('POST /integrations/contact-consent/requests/:id/challenge')({headers:{authorization:'Bearer customer-token'},params:{id:requested.id}},res),error=>error.status===401);
await assert.rejects(()=>routes.get('GET /contact-consent/requests/:id')({params:{id:randomUUID()},headers:{}},res),error=>error.status===404);
console.log('PASS: signed first-party consent request/challenge/grant lifecycle, exact scopes, independent permissions, USER/personal and business classification, replay/expiry/escalation, revoke all overlapping grants, stale-request cancellation, paid export denial, phone-free audit and protected routes.');
