import {createHash} from 'node:crypto';
import {normalizePublicPhone} from './contact-discovery.js';

const PUBLICATIONS='haraj_business_publications',SUPPRESSIONS='haraj_contact_suppressions';
const phoneHash=phone=>createHash('sha256').update(`haraj:${normalizePublicPhone(phone)}`).digest('hex');

// Evidence is written only by a trusted Haraj/provider verifier. The lead
// worker never creates it from a listing, a STORE label, or postContact.
export async function harajBusinessDirectoryDecision(database,organizationId,authorId,action,phone,now=Date.now()){
  try{
    if(database.schema&&!await database.schema.hasTable(SUPPRESSIONS))return null;
    const suppressed=await database(SUPPRESSIONS).where({organization_id:organizationId,author_id:String(authorId)}).first();
    if(suppressed)return {allowed:false,reason:'not_authorized',detail:'consent_revoked',status:'revoked'};
    if(!['save','reveal','download'].includes(action)||!normalizePublicPhone(phone))return null;
    if(database.schema&&!await database.schema.hasTable(PUBLICATIONS))return null;
    const publication=await database(PUBLICATIONS).where({organization_id:organizationId,author_id:String(authorId),phone_hash:phoneHash(phone)})
      .whereNull('revoked_at').where('observed_at','<=',new Date(now).toISOString()).where('expires_at','>',new Date(now).toISOString()).orderBy('observed_at','desc').first();
    if(!publication)return null;
    return {allowed:true,status:'public_business_directory',contactKind:'public_business',basis:'haraj_verified_business_publication',authorizationId:publication.id,expiresAt:publication.expires_at};
  }catch(error){if(error.code==='42P01')return null;throw error;}
}

// Called only from the locked revocation workflow. A tombstone takes priority
// over both a personal grant and older publication evidence.
export async function suppressHarajBusinessDirectory(trx,organizationId,authorId,reason='subject_withdrawal'){
  try{
    await trx(SUPPRESSIONS).insert({organization_id:organizationId,author_id:String(authorId),reason}).onConflict(['organization_id','author_id']).ignore();
    await trx(PUBLICATIONS).where({organization_id:organizationId,author_id:String(authorId)}).whereNull('revoked_at').update({revoked_at:new Date().toISOString()});
  }catch(error){if(error.code!=='42P01')throw error;}
}
