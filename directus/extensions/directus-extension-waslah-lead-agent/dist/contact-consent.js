import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {suppressMerchantDirectory} from './merchant-directory.js';
import {CONTACT_ACTIONS,CONTACT_AUTHORIZATION_TABLE,contactPhoneHash,createContactAuthorizer,lockContactSubject,auditContactEvent,consentTime} from './contact-authorization.js';

const REQUESTS='wasla_contact_consent_requests',EVENTS='wasla_contact_consent_events';
export const CONSENT_STATEMENT_VERSION='haraj-commercial-contact-v2';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const subject=value=>/^\d{1,18}$/.test(String(value||''))?String(value):null;
const providerValue=value=>{if(!['haraj','mahally'].includes(value))throw Error('INVALID_SUBJECT');return value;};
const digest=value=>createHash('sha256').update(value).digest('hex');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function canonicalConsentJson(value){
  if(Array.isArray(value))return '['+value.map(canonicalConsentJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalConsentJson(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export function validateConsentActions(input){
  if(!Array.isArray(input)||!input.length||input.length>CONTACT_ACTIONS.length||input.some(action=>!CONTACT_ACTIONS.includes(action)))throw Error('INVALID_ACTIONS');
  return [...new Set([...input,...(input.includes('save')?['lookup']:[])])].sort();
}
export function consentPortalUrl(configured,id){
  try{const url=new URL(configured);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return null;url.searchParams.set('request_id',id);return url.href;}catch{return null;}
}
export function consentBridgeConfigured(env){return String(env.HARAJ_CONSENT_SIGNING_SECRET||'').length>=32&&String(env.HARAJ_CONSENT_BRIDGE_TOKEN||'').length>=32&&Boolean(env.HARAJ_CONSENT_ISSUER);}
export function verifyConsentSignature(env,headers,body,now=Date.now()){
  if(!consentBridgeConfigured(env))throw Error('BRIDGE_UNCONFIGURED');
  const timestamp=String(headers['x-consent-timestamp']||''),eventId=String(headers['x-consent-event-id']||''),signature=String(headers['x-consent-signature']||'');
  if(!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp)*1000)>300_000||!uuid(eventId)||body?.event_id!==eventId||body?.issuer!==env.HARAJ_CONSENT_ISSUER||!/^sha256=[a-f0-9]{64}$/.test(signature))throw Error('INVALID_ATTESTATION');
  const canonical=canonicalConsentJson(body);
  if(Buffer.byteLength(canonical)>32_000)throw Error('INVALID_ATTESTATION');
  const expected=createHmac('sha256',env.HARAJ_CONSENT_SIGNING_SECRET).update(`${timestamp}.${eventId}.${canonical}`).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')))throw Error('INVALID_ATTESTATION');
  return {eventId,receiptDigest:digest(canonical)};
}
function publicRequest(row,env,now=Date.now()){return {id:row.id,provider:row.provider||'haraj',authorId:row.author_id,status:row.status==='pending'&&consentTime(row.expires_at)<=now?'expired':row.status,actions:parse(row.actions),statementVersion:row.statement_version,disclosure:parse(row.disclosure),expiresAt:row.expires_at,grantExpiresAt:row.grant_expires_at,authorizationId:row.authorization_id||null,consentUrl:consentPortalUrl(row.provider==='mahally'?env.MAHALLY_CONSENT_PORTAL_URL:env.HARAJ_CONSENT_PORTAL_URL,row.id),verificationConfigured:consentBridgeConfigured(env)};}
export function createConsentWorkflow({database,env,now=Date.now}){
  const time=()=>new Date(now()).toISOString();
  async function request({organizationId,organizationName,userId,authorId,actions,expiresAt,provider='haraj'}){
    provider=providerValue(provider);
    authorId=subject(authorId);if(!authorId)throw Error('INVALID_SUBJECT');
    actions=validateConsentActions(actions);
    const end=Date.parse(expiresAt);if(!Number.isFinite(end)||end<=now()||end>now()+366*86400_000)throw Error('INVALID_EXPIRY');
    return database.transaction(async trx=>{
      await lockContactSubject(trx,organizationId,authorId,{exclusive:true,provider});
      const recent=await trx(REQUESTS).where({organization_id:organizationId,author_id:authorId,provider}).where('created_at','>',new Date(now()-3600_000).toISOString()).count('* as total').first();
      if(Number(recent?.total)>=5)throw Error('REQUEST_RATE_LIMIT');
      const row={id:randomUUID(),organization_id:organizationId,author_id:authorId,provider,requested_by:userId,actions:JSON.stringify(actions),statement_version:provider==='mahally'?'mahally-commercial-contact-v1':CONSENT_STATEMENT_VERSION,
        disclosure:JSON.stringify({recipientWorkspaceId:organizationId,recipientWorkspaceName:organizationName,provider,purpose:'lead_generation',actions,expiresAt:new Date(end).toISOString(),callingProvider:actions.includes('call')?'Wasla calling integration (Vapi)':null,notice:'Optional commercial-contact permission. Approve only the actions and exact numbers you choose. Public posting does not imply consent. Revoke through the verified provider portal or the recipient workspace. Already downloaded data cannot be remotely recalled.'}),
        status:'pending',created_at:time(),expires_at:new Date(Math.min(end,now()+86400_000)).toISOString(),grant_expires_at:new Date(end).toISOString()};
      await trx(REQUESTS).insert(row);
      await auditContactEvent(trx,{organization_id:organizationId,author_id:authorId,provider,request_id:row.id,actor:String(userId),event_type:'consent_requested',detail:'subject_confirmation_required'});
      return publicRequest(row,env,now());
    });
  }
  async function challenge(id){
    if(!uuid(id))throw Error('REQUEST_NOT_FOUND');
    return database.transaction(async trx=>{
      const row=await trx(REQUESTS).where({id}).forUpdate().first();
      if(!row||row.status!=='pending'||consentTime(row.expires_at)<=now())throw Error('REQUEST_NOT_ACTIVE');
      if(row.challenge_hash)throw Error('CHALLENGE_ALREADY_ISSUED');
      const token=randomBytes(32).toString('base64url');
      await trx(REQUESTS).where({id}).update({challenge_hash:digest(token),challenge_expires_at:new Date(Math.min(consentTime(row.expires_at),now()+1800_000)).toISOString()});
      await auditContactEvent(trx,{organization_id:row.organization_id,author_id:row.author_id,provider:row.provider||'haraj',request_id:id,actor:env.HARAJ_CONSENT_ISSUER,event_type:'challenge_issued',detail:'first_party_identity_and_phone_verification_required'});
      return {...publicRequest(row,env,now()),challenge:token};
    });
  }
  async function attest(headers,body){
    const {eventId,receiptDigest}=verifyConsentSignature(env,headers,body,now());
    if(!['grant','revoke'].includes(body.type))throw Error('INVALID_ATTESTATION');
    return database.transaction(async trx=>{
      // Event lock serializes retries, even if the receipt has not been inserted.
      await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',[`consent-event:${eventId}`]);
      const prior=await trx(EVENTS).where({event_id:eventId}).first();
      if(prior){if(prior.receipt_digest!==receiptDigest)throw Error('REPLAY_CONFLICT');return {authorizationId:prior.authorization_id,status:'already_processed'};}
      let authorization;
      if(body.type==='grant'){
        if(!uuid(body.request_id))throw Error('INVALID_ATTESTATION');
        const snapshot=await trx(REQUESTS).where({id:body.request_id}).first();
        if(!snapshot)throw Error('REQUEST_NOT_FOUND');
        await lockContactSubject(trx,snapshot.organization_id,snapshot.author_id,{exclusive:true,provider:snapshot.provider||'haraj'});
        const row=await trx(REQUESTS).where({id:body.request_id}).forUpdate().first();
        if(row.status!=='pending'||consentTime(row.expires_at)<=now()||!Number.isFinite(consentTime(row.challenge_expires_at))||consentTime(row.challenge_expires_at)<=now()||!row.challenge_hash||typeof body.challenge!=='string'||body.challenge.length>128||!timingSafeEqual(Buffer.from(row.challenge_hash,'hex'),Buffer.from(digest(body.challenge),'hex')))throw Error('REQUEST_NOT_ACTIVE');
        const provider=row.provider||'haraj';
        if((body.provider||'haraj')!==provider||String(body.subject_author_id)!==row.author_id||body.statement_version!==row.statement_version||body.verification_method!==(provider==='mahally'?'merchant_identity_and_phone_verification':'haraj_session_and_phone_verification')||!['personal','public_business'].includes(body.contact_kind))throw Error('SUBJECT_VERIFICATION_REQUIRED');
        const actions=validateConsentActions(body.actions),requested=parse(row.actions);
        if(actions.some(action=>!requested.includes(action)))throw Error('SCOPE_ESCALATION');
        const end=Date.parse(body.expires_at);if(!Number.isFinite(end)||end<=now()||end>consentTime(row.grant_expires_at))throw Error('INVALID_EXPIRY');
        if(!Array.isArray(body.verified_phones)||!body.verified_phones.length||body.verified_phones.length>12)throw Error('INVALID_PHONE_SCOPE');
        const hashes=body.verified_phones.map(phone=>contactPhoneHash(phone,provider));if(hashes.some(hash=>!hash))throw Error('INVALID_PHONE_SCOPE');
        authorization={id:randomUUID(),organization_id:row.organization_id,author_id:row.author_id,provider,purpose:'lead_generation',status:'granted',actions:JSON.stringify(actions),phone_hashes:JSON.stringify([...new Set(hashes)]),policy_version:2,contact_kind:body.contact_kind,request_id:row.id,receipt_digest:receiptDigest,evidence_reference:`${provider}-consent-event:${eventId}`,verified_by:env.HARAJ_CONSENT_ISSUER,verified_at:time(),granted_at:time(),expires_at:new Date(end).toISOString()};
        await trx(CONTACT_AUTHORIZATION_TABLE).insert(authorization);
        await trx(REQUESTS).where({id:row.id}).update({status:'granted',authorization_id:authorization.id,challenge_hash:null});
      }else{
        if(!uuid(body.authorization_id)||!subject(body.subject_author_id))throw Error('INVALID_ATTESTATION');
        const snapshot=await trx(CONTACT_AUTHORIZATION_TABLE).where({id:body.authorization_id,author_id:String(body.subject_author_id)}).first();
        if(!snapshot)throw Error('AUTHORIZATION_NOT_FOUND');
        if((body.provider||'haraj')!==snapshot.provider)throw Error('SUBJECT_VERIFICATION_REQUIRED');
        await lockContactSubject(trx,snapshot.organization_id,snapshot.author_id,{exclusive:true,provider:snapshot.provider});
        authorization=await trx(CONTACT_AUTHORIZATION_TABLE).where({id:snapshot.id}).forUpdate().first();
        // A subject's withdrawal cancels all overlapping grants in this
        // workspace, not merely the latest receipt for the same number.
        await trx(CONTACT_AUTHORIZATION_TABLE).where({organization_id:authorization.organization_id,author_id:authorization.author_id,provider:authorization.provider}).update({status:'revoked',revoked_at:time()});
        if(authorization.provider==='mahally')await suppressMerchantDirectory(trx,authorization.organization_id,authorization.author_id);
        await trx(REQUESTS).where({organization_id:authorization.organization_id,author_id:authorization.author_id,provider:authorization.provider,status:'pending'}).update({status:'cancelled',challenge_hash:null});
      }
      await trx(EVENTS).insert({event_id:eventId,receipt_digest:receiptDigest,processed_at:time(),authorization_id:authorization.id,event_type:body.type});
      await auditContactEvent(trx,{organization_id:authorization.organization_id,author_id:authorization.author_id,provider:authorization.provider,authorization_id:authorization.id,request_id:authorization.request_id||null,actor:env.HARAJ_CONSENT_ISSUER,event_type:body.type==='grant'?'consent_granted':'consent_revoked',detail:body.type==='grant'?'verified_subject_confirmation':'subject_revocation'});
      return {authorizationId:authorization.id,status:body.type==='grant'?'authorized':'revoked'};
    });
  }
  async function revoke({organizationId,authorId,userId,provider='haraj'}){
    provider=providerValue(provider);
    authorId=subject(authorId);if(!authorId)throw Error('INVALID_SUBJECT');
    return database.transaction(async trx=>{
      await lockContactSubject(trx,organizationId,authorId,{exclusive:true,provider});
      if(provider==='mahally')await suppressMerchantDirectory(trx,organizationId,authorId);
      await trx(CONTACT_AUTHORIZATION_TABLE).where({organization_id:organizationId,author_id:authorId,provider}).update({status:'revoked',revoked_at:time()});
      await trx(REQUESTS).where({organization_id:organizationId,author_id:authorId,provider,status:'pending'}).update({status:'cancelled',challenge_hash:null});
      await auditContactEvent(trx,{organization_id:organizationId,author_id:authorId,provider,actor:String(userId),event_type:'consent_revoked',detail:'workspace_subject_scopes_revoked'});
      return {status:'revoked',authorId};
    });
  }
  return {request,challenge,attest,revoke};
}

export function registerContactConsentRoutes(router,{database,env,logger,route,customerContext,ApiError}){
  const workflow=createConsentWorkflow({database,env});
  const wrap=handler=>route(async(req,res)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');try{await handler(req,res);}catch(error){
    if(error instanceof ApiError)throw error;
    const known=['INVALID_ACTIONS','INVALID_SUBJECT','INVALID_EXPIRY','REQUEST_RATE_LIMIT','REQUEST_NOT_FOUND','REQUEST_NOT_ACTIVE','CHALLENGE_ALREADY_ISSUED','BRIDGE_UNCONFIGURED','INVALID_ATTESTATION','SUBJECT_VERIFICATION_REQUIRED','SCOPE_ESCALATION','INVALID_PHONE_SCOPE','AUTHORIZATION_NOT_FOUND','REPLAY_CONFLICT'];
    if(known.includes(error.message))throw new ApiError(error.message==='REQUEST_RATE_LIMIT'?429:error.message==='BRIDGE_UNCONFIGURED'?503:400,error.message,'Consent action could not complete: '+error.message+'.');
    throw error;
  }},logger);
  const bridge=req=>{const supplied=String(req.headers.authorization||'').replace(/^Bearer /i,'');const expected=String(env.HARAJ_CONSENT_BRIDGE_TOKEN||'');if(!consentBridgeConfigured(env)||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new ApiError(401,'CONSENT_BRIDGE_AUTH_REQUIRED','Trusted consent bridge authentication is required.');};
  router.post('/contact-consent/requests',wrap(async(req,res)=>{const {organization,userId}=await customerContext(database,req);const result=await workflow.request({organizationId:organization.id,organizationName:organization.name,userId,authorId:req.body?.author_id,provider:req.body?.provider||'haraj',actions:req.body?.actions,expiresAt:req.body?.expires_at});res.status(201).json({data:result});}));
  router.get('/contact-consent/requests/:id',wrap(async(req,res)=>{const {organization}=await customerContext(database,req);if(!uuid(req.params.id))throw new ApiError(404,'REQUEST_NOT_FOUND','Consent request not found.');const row=await database(REQUESTS).where({id:req.params.id,organization_id:organization.id}).first();if(!row)throw new ApiError(404,'REQUEST_NOT_FOUND','Consent request not found.');res.json({data:publicRequest(row,env)});}));
  router.post('/contact-consent/status',wrap(async(req,res)=>{const {organization}=await customerContext(database,req);const authorId=subject(req.body?.author_id),action=req.body?.action,provider=providerValue(req.body?.provider||'haraj');if(!authorId||!CONTACT_ACTIONS.includes(action))throw new ApiError(400,'INVALID_SCOPE','A provider subject ID and explicit action are required.');res.json({data:await createContactAuthorizer(database,organization.id)({authorId,provider,action,phone:req.body?.phone})});}));
  router.post('/contact-consent/revoke',wrap(async(req,res)=>{const {organization,userId}=await customerContext(database,req);res.json({data:await workflow.revoke({organizationId:organization.id,userId,authorId:req.body?.author_id,provider:req.body?.provider||'haraj'})});}));
  router.get('/contact-consent/audit',wrap(async(req,res)=>{const {organization}=await customerContext(database,req);const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));const query=database('wasla_contact_audit').where({organization_id:organization.id});if(req.query.author_id){const id=subject(req.query.author_id);if(!id)throw new ApiError(400,'INVALID_SUBJECT','Invalid Haraj author ID.');query.where({author_id:id});}res.json({data:await query.orderBy('created_at','desc').orderBy('id','desc').limit(limit)});}));
  router.post('/integrations/contact-consent/requests/:id/challenge',wrap(async(req,res)=>{bridge(req);res.json({data:await workflow.challenge(req.params.id)});}));
  router.post('/integrations/contact-consent/events',wrap(async(req,res)=>{res.json({data:await workflow.attest(req.headers,req.body)});}));
}
