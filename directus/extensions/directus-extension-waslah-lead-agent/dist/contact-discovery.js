// Pure discovery over an already authorized response. No network, persistence,
// STORE classification, business wording, or implied consent in these helpers.
export function normalizePublicPhone(value) {
  let digits=String(value||'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g,'');
  if(digits.startsWith('00966'))digits=digits.slice(2);
  if(/^05\d{8}$/.test(digits))digits=`966${digits.slice(1)}`;
  return /^9665\d{8}$/.test(digits)?`+${digits}`:null;
}
const phoneLike=/(?:\+?[\d٠-٩۰-۹][\s().-]*){7,16}/g;
export function redactContactText(value){return String(value||'').replace(phoneLike,match=>{const digits=match.replace(/[^\d٠-٩۰-۹]/g,'');return normalizePublicPhone(match)||(digits.length>=9&&/^(?:\+|0|5|966|٠|٥|٩٦٦)/u.test(match.trim()))?'[phone redacted]':match;});}
const exclusion=(reason,detail,source)=>({reason,detail,source,stage:'discovery'});
function collect(raw,source,metadata){
  const candidates=[],exclusions=[],seen=new Set();
  if(!raw.length)exclusions.push(exclusion('missing','no_phone_field',source));
  for(const value of raw){
    const phone=normalizePublicPhone(value);
    if(!phone){exclusions.push(exclusion('invalid','invalid_saudi_mobile',source));continue;}
    if(seen.has(phone)){exclusions.push(exclusion('duplicated','duplicate_in_source',source));continue;}
    seen.add(phone);candidates.push({phone,...metadata});
  }
  return {candidates,exclusions};
}
export function discoverProfileContacts(profile,author){
  if(!profile)return {candidates:[],exclusions:[exclusion('missing','profile_unavailable','profile')]};
  if(!author?.authorId||String(profile.id)!==String(author.authorId))return {candidates:[],exclusions:[exclusion('ownership_mismatch','profile_author_mismatch','profile')]};
  return collect((profile.contacts||[]).filter(c=>c.type==='PHONE').map(c=>c.info),'profile',{
    origin:'authorized_profile',profileCity:null,sourceUrl:`https://haraj.com.sa/users/${encodeURIComponent(author.authorUsername)}/`,
  });
}
export function discoverPostContacts(posts,author){
  const candidates=[],exclusions=[];let owned=false;
  for(const post of posts||[]){
    if(!author?.authorId||String(post.authorId)!==String(author.authorId)){exclusions.push(exclusion('ownership_mismatch','ad_author_mismatch','ad'));continue;}
    owned=true;
    const text=`${post.title||''}\n${post.bodyTEXT||post.bodyText||''}`;
    const result=collect(text.match(phoneLike)||[],'ad',{origin:'authorized_ad',profileCity:post.city||post.geoCity||null,sourceUrl:`https://haraj.com.sa/${String(post.id||'')}/`,businessPostId:post.id});
    candidates.push(...result.candidates);exclusions.push(...result.exclusions);
  }
  if(!owned)exclusions.push(exclusion('missing','no_owned_ads','ad'));
  return {candidates,exclusions};
}
export async function selectAuthorizedContact(discovery,{authorId,authorizeContact=async()=>({allowed:false,detail:'authorization_unconfigured'}),knownPhones=new Set()}={}){
  const exclusions=[...discovery.exclusions],accepted=[],seen=new Set(knownPhones);
  for(const candidate of discovery.candidates){
    // Check before returning/retaining a value, including duplicates. An
    // exclusion contains no phone, hashes, raw response, or provider error.
    const decision=await authorizeContact({authorId,action:'save',phone:candidate.phone});
    if(!decision?.allowed){exclusions.push({reason:'not_authorized',detail:decision?.detail||'consent_required',stage:'eligibility'});continue;}
    if(seen.has(candidate.phone)){exclusions.push({reason:'duplicated',detail:'already_known',stage:'eligibility'});continue;}
    seen.add(candidate.phone);accepted.push({...candidate,authorizationId:decision.authorizationId});
  }
  const first=accepted[0];
  return {contact:first?{phones:accepted.map(c=>c.phone),origin:first.origin,profileCity:first.profileCity,sourceUrl:first.sourceUrl,businessPostId:first.businessPostId,authorizationIds:[...new Set(accepted.map(c=>c.authorizationId))]}:null,exclusions};
}
