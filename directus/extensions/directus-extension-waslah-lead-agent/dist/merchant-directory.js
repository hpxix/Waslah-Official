import {createHash} from 'node:crypto';
import {websiteUrl} from './website-reader.js';
import {normalizePublicPhone} from './contact-discovery.js';
const TABLE='wasla_merchant_directory';
const parsed=value=>typeof value==='string'?JSON.parse(value):value;
const hash=phone=>createHash('sha256').update(`mahally:${normalizePublicPhone(phone)}`).digest('hex');
const lock=(trx,org,id)=>trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[`mahally-consent:${org}:${id}`]);

// Called only by the server's authenticated discovery pipeline, after reading
// the bound merchant domain. There is no client endpoint for minting evidence.
export async function recordMerchantDirectoryContact(database,organizationId,{storeId,domain,productUrl,sourceUrls,phones},now=Date.now()){
  const origin=websiteUrl(domain).origin;
  const product=new URL(productUrl);
  if(product.origin!=='https://mahally.com'||!new RegExp(`^/(?:en/)?products/${String(storeId).replace(/[^0-9]/g,'')}/[0-9]+/?$`).test(product.pathname)||!/^\d{1,18}$/.test(String(storeId)))throw Error('INVALID_MERCHANT_BINDING');
  const sources=[...new Set(sourceUrls||[])].filter(url=>{try{return websiteUrl(url).origin===origin;}catch{return false;}});
  const valid=[...new Set((phones||[]).map(normalizePublicPhone).filter(Boolean))];
  if(!sources.length||!valid.length)throw Error('MISSING_MERCHANT_PUBLICATION_EVIDENCE');
  return database.transaction(async trx=>{
    await lock(trx,organizationId,String(storeId));
    const current=await trx(TABLE).where({organization_id:organizationId,author_id:String(storeId)}).first();
    if(current?.status==='revoked')return false;
    const row={organization_id:organizationId,author_id:String(storeId),status:'active',domain:origin,product_url:product.href,
      source_urls:JSON.stringify(sources),phone_hashes:JSON.stringify(valid.map(hash)),observed_at:new Date(now).toISOString(),expires_at:new Date(now+30*86400000).toISOString()};
    await trx(TABLE).insert(row).onConflict(['organization_id','author_id']).merge(row);
    return true;
  });
}
export async function merchantDirectoryDecision(database,organizationId,authorId,action,phone,now=Date.now()){
  let row;
  try{row=await database(TABLE).where({organization_id:organizationId,author_id:String(authorId)}).first();}
  catch(error){if(error.code==='42P01')return null;throw error;}
  if(!row)return null;
  if(row.status==='revoked')return {allowed:false,reason:'not_authorized',detail:'consent_revoked',status:'revoked'};
  if(!['save','reveal','download'].includes(action)||!normalizePublicPhone(phone))return null;
  if(Date.parse(row.expires_at)<=now)return null;
  if(!parsed(row.phone_hashes).includes(hash(phone)))return null;
  return {allowed:true,status:'public_business_directory',contactKind:'public_business',basis:'merchant_published_business_contact',expiresAt:row.expires_at};
}
export async function suppressMerchantDirectory(trx,organizationId,authorId,now=Date.now()){
  // Caller holds the same exclusive subject lock as consent revocation.
  await trx(TABLE).insert({organization_id:organizationId,author_id:String(authorId),status:'revoked',revoked_at:new Date(now).toISOString()})
    .onConflict(['organization_id','author_id']).merge({status:'revoked',revoked_at:new Date(now).toISOString()});
}
