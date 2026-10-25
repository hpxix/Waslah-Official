import {createHash} from 'node:crypto';
import {fetchWebsitePage,websiteUrl,robotsAllows,readablePage} from './website-reader.js';
import {normalizePublicPhone,redactContactText} from './contact-discovery.js';

const aliases={riyadh:'الرياض',jeddah:'جدة',jedda:'جدة',makkah:'مكة',mecca:'مكة',madinah:'المدينة',medina:'المدينة',dammam:'الدمام',khobar:'الخبر','al khobar':'الخبر',taif:'الطائف',tabuk:'تبوك',abha:'ابها',hail:'حائل',jazan:'جازان'};
export const normalizeMahallyCity=value=>{const s=String(value||'').normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/\s+/g,' ').trim();return aliases[s]||s;};
export const mahallyCities=hit=>{const names=hit?.city?.name;return typeof names==='string'?[names]:names&&typeof names==='object'?Object.values(names).filter(v=>typeof v==='string'):[];};
export const mahallyCityMatches=(hit,city)=>['','all','any','*','الكل'].includes(normalizeMahallyCity(city))||mahallyCities(hit).some(value=>normalizeMahallyCity(value)===normalizeMahallyCity(city));
export const mahallyProductKey=hit=>`${hit.store_id}:${hit.objectID}`;
export const mahallySignature=hits=>createHash('sha256').update(hits.map(mahallyProductKey).sort().join('|')).digest('hex');
export function initialMahallyResults(html){
  const marker='window[Symbol.for("InstantSearchInitialResults")]';
  const at=String(html).indexOf(marker);if(at<0)return null;
  const start=html.indexOf('{',html.indexOf('=',at+marker.length));if(start<0)return null;
  // Read one JSON object, without executing third-party scripts.
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<html.length;i++){
    const c=html[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){try{return JSON.parse(html.slice(start,i+1)).products_v2?.results?.[0]||null;}catch{return null;}}
  }return null;
}
const entities=value=>String(value||'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#(?:39|x27);/gi,"'");
function jsonObjects(text){
  const out=[];let start=-1,depth=0,quoted=false,escaped=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(start<0){if(c==='{'){start=i;depth=1;}continue;}if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){try{out.push(JSON.parse(text.slice(start,i+1)));}catch{}start=-1;}}
  return out;
}
export function merchantDomain(html,storeId){
  const domains=new Set();
  const visit=(value,depth=0)=>{
    if(depth>18||!value)return;
    if(typeof value==='string'&&value.length<1_500_000){try{const decoded=JSON.parse(value);if(decoded!==value)visit(decoded,depth+1);}catch{for(const object of jsonObjects(value))visit(object,depth+1);}return;}
    if(typeof value!=='object')return;
    if(String(value.id??value.store_id??'')===String(storeId)&&typeof value.domain==='string'){
      try{const url=websiteUrl(value.domain);const h=url.hostname;
        if(!['mahally.com','salla.sa','salla.network'].some(domain=>h===domain||h.endsWith('.'+domain)))domains.add(url.origin);
      }catch{}
    }
    for(const child of Object.values(value))visit(child,depth+1);
  };
  for(const match of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    const script=entities(match[1]);visit(script);
    // Next flight data wraps JSON strings inside push([...]) calls.
    for(const token of script.matchAll(/"(?:[^"\\]|\\.)*"/g))visit(token[0]);
  }
  return domains.size===1?[...domains][0]:null; // Ambiguous/unbound analytics domains are not merchant identity.
}
export function extractMerchantContacts(html){
  const links=[...String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map(m=>entities(m[1]));
  const scripts=[...String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.length<100000&&/telephone|whatsapp_mobile|"email"|"phone"/i.test(s));
  const text=[readablePage(html),...links,...scripts].join(' ').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const phones=[...new Set([...text.matchAll(/(?<!\d)(?:\+?966|00966|0)[\s.()-]*5(?:[\s.()-]*\d){8}(?!\d)/g)].map(m=>normalizePublicPhone(m[0].replace(/[\s.()-]/g,''))).filter(Boolean))];
  // Directory mode uses explicit merchant contact links, not numbers in
  // customer reviews, arbitrary page text or unrelated JavaScript identifiers.
  const businessPhones=[...new Set(links.flatMap(link=>{
    try{if(/^tel:/i.test(link))return [normalizePublicPhone(link.slice(4))];
      const u=new URL(link);if(['wa.me','api.whatsapp.com','web.whatsapp.com'].includes(u.hostname))return [normalizePublicPhone(u.searchParams.get('phone')||u.pathname.slice(1))];
    }catch{}return [];
  }).filter(Boolean))];
  const emails=[...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(s=>s.toLowerCase()).filter(s=>! /\.(?:png|jpg|jpeg|svg|webp|js|css)$/.test(s)))];
  return {phones,businessPhones,emails,links};
}
export async function readMerchantContacts(root,{fetchPage=fetchWebsitePage,signal,delayMs=1500,maxPages=5,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const origin=websiteUrl(root).origin,queue=[origin+'/'],visited=new Set(),phones=new Set(),businessPhones=new Set(),emails=new Set(),sources=[];
  const robots=await fetchPage(origin+'/robots.txt',{signal,origin,maxBytes:200000});
  if(robots.status!==404&&robots.status!==200)throw Object.assign(Error('Merchant robots unavailable'),{code:'MERCHANT_ROBOTS_UNAVAILABLE'});
  const rules=robots.status===200?robots.html:'';
  while(queue.length&&visited.size<Math.min(5,maxPages)){
    signal?.throwIfAborted();const url=queue.shift();if(visited.has(url)||!robotsAllows(rules,new URL(url).pathname))continue;visited.add(url);
    const page=await fetchPage(url,{signal,origin});if(page.status!==200){if([401,403,429].includes(page.status))throw Object.assign(Error('Merchant access restricted'),{code:'MERCHANT_ACCESS_RESTRICTED'});continue;}
    const found=extractMerchantContacts(page.html);found.phones.forEach(p=>phones.add(p));found.businessPhones.forEach(p=>businessPhones.add(p));found.emails.forEach(e=>emails.add(e));if(found.phones.length||found.emails.length)sources.push(page.url||url);
    for(const link of found.links){try{const next=websiteUrl(new URL(link,page.url||url).href);if(next.origin===origin&&!next.search&&/contact|about|اتصل|تواصل|من[-_]نحن/iu.test(decodeURIComponent(next.pathname))&&!visited.has(next.href)&&!queue.includes(next.href))queue.push(next.href);}catch{}}
    if(queue.length)await sleep(Math.max(1500,delayMs));
  }return {phones:[...phones],businessPhones:[...businessPhones],emails:[...emails],sources,visited:visited.size};
}
// Worker sends metadata only. Phone retrieval happens here, after a fresh
// workspace/provider/merchant authorization decision, never in the browser worker.
export async function* mahallyWorkerEvents(env,input,signal,fetcher=fetch){
  if(!env.MAHALLY_WORKER_URL||String(env.MAHALLY_WORKER_TOKEN||'').length<32)throw Object.assign(Error('Mahally worker is not configured'),{code:'MAHALLY_UNCONFIGURED'});
  const response=await fetcher(new URL('/discover',env.MAHALLY_WORKER_URL),{method:'POST',headers:{authorization:`Bearer ${env.MAHALLY_WORKER_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(input),signal});
  if(!response.ok||!response.body){const error=await response.json().catch(()=>null);throw Object.assign(Error(`Mahally worker HTTP ${response.status}`),{code:/^MAHALLY_[A-Z_]+$/.test(error?.code||'')?error.code:'MAHALLY_WORKER_FAILED'});}
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  try{for(;;){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});if(buffer.length>2_000_000)throw Error('Mahally event size exceeded');let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line.trim())yield JSON.parse(line);}if(done){if(buffer.trim())throw Error('Incomplete Mahally event');break;}}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function runMahallyFallback(options){
  if(options.plan.audienceRoute!=='merchants')return runMahallyKeyword(options);
  const {stats,plan,checkpoint=async()=>{},shouldStop=()=>false}=options;
  const terms=[...new Set(plan.keywordMatching.productTerms)].slice(0,10);
  const state=stats.mahally?.version===2?stats.mahally:{version:2,keywordStates:{},seenStores:[],checked:0,delivered:0,exclusions:{},complete:false};
  stats.mahally=state;
  const refresh=()=>{
    const all=Object.values(state.keywordStates);state.checked=all.reduce((s,x)=>s+Number(x.checked||0),0);state.delivered=all.reduce((s,x)=>s+Number(x.delivered||0),0);
    state.exclusions={};for(const item of all)for(const [key,n] of Object.entries(item.exclusions||{}))state.exclusions[key]=(state.exclusions[key]||0)+n;
    state.seenStores=[...new Set(all.flatMap(x=>x.seenStores||[]))];state.keywordsProcessed=all.filter(x=>x.complete).length;
  };
  for(const term of terms){
    options.signal?.throwIfAborted();if(shouldStop())break;
    if(state.keywordStates[term]?.complete&&!state.keywordStates[term]?.pendingMerchants?.length)continue;
    const child={mahally:state.keywordStates[term]||{version:1,checked:0,delivered:0,seenStores:[...state.seenStores],exclusions:{},complete:false}};
    state.keywordStates[term]=child.mahally;state.keyword=term;
    await runMahallyKeyword({...options,stats:child,plan:{...plan,keywordMatching:{...plan.keywordMatching,productTerms:[term]}},checkpoint:async()=>{state.activity=child.mahally.activity;refresh();await checkpoint();}});
    refresh();await checkpoint();
  }
  state.complete=shouldStop()||terms.every(term=>state.keywordStates[term]?.complete);
  state.stopReason=shouldStop()?'target_reached':state.complete?'keyword_sources_exhausted':'pending_keywords';
  await checkpoint();return state;
}
async function runMahallyKeyword({env,plan,stats,target,authorize,onCandidate,recordDirectory,checkpoint=async()=>{},signal,events=mahallyWorkerEvents,readContacts=readMerchantContacts,shouldStop=()=>false}){
  const state=stats.mahally ||= {version:1,checked:0,delivered:0,seenStores:[],exclusions:{},complete:false};
  if(shouldStop()||(state.complete&&!state.pendingMerchants?.length))return state;
  const query=String(plan.keywordMatching?.productTerms?.[0]||'').trim(),cities=plan.strategies?.[0]?.cities||[];
  if(!query){state.stopReason='product_required';state.complete=true;await checkpoint();return state;}
  const city=cities[0]||'all',seen=new Set(state.seenStores),usedPhones=new Set();
  const exclude=reason=>{state.exclusions[reason]=(state.exclusions[reason]||0)+1;};
  const maxStores=Math.max(1,Math.ceil(target*1000/30));
  const sourceFinished=state.complete,sourceReason=state.stopReason,pending=state.pendingMerchants||[],revisiting=new Set(pending.map(item=>String(item.storeId)));
  state.pendingMerchants=[];state.complete=false;
  const sourceEvents=async function*(){yield* pending;if(sourceFinished)yield {type:'complete',reason:sourceReason};else yield* events(env,{query,city,maxPages:30,maxStores,skipStores:[...seen]},signal);};
  const retry=event=>state.pendingMerchants.push({...event,name:redactContactText(event.name)});
  try{
    for await(const event of sourceEvents()){
      signal?.throwIfAborted();if(shouldStop())break;
      if(event.type==='progress'){state.activity=event.activity;state.pages=event.pages||state.pages;await checkpoint();continue;}
      if(event.type==='complete'){state.complete=true;state.stopReason=event.reason;await checkpoint();break;}
      if(event.type==='error')throw Object.assign(Error('Mahally discovery failed'),{code:event.code||'MAHALLY_WORKER_FAILED'});
      if(event.type!=='merchant'||!/^\d{1,18}$/.test(String(event.storeId||''))||(seen.has(String(event.storeId))&&!revisiting.has(String(event.storeId))))continue;
      const revisit=revisiting.delete(String(event.storeId));
      if(!revisit&&state.checked>=maxStores){state.complete=true;state.stopReason='store_limit';break;}
      const storeId=String(event.storeId),root=websiteUrl(event.domain).origin;
      const normalizedCity=normalizeMahallyCity(city);if(!['all','any','*','الكل',''].includes(normalizedCity)&&normalizeMahallyCity(event.city)!==normalizedCity){exclude('city_mismatch');continue;}
      if(!revisit)state.checked++;seen.add(storeId);state.seenStores=[...seen];
      const lookup=await authorize({provider:'mahally',authorId:storeId,action:'lookup'});
      const directoryMode=String(env.MAHALLY_PUBLIC_DIRECTORY||'false')==='true'&&typeof recordDirectory==='function';
      if(!lookup.allowed&&(!directoryMode||lookup.detail==='consent_revoked')){exclude(lookup.detail||'not_authorized');if(lookup.detail!=='consent_revoked')retry(event);await checkpoint();continue;}
      let contact;
      try{contact=await readContacts(root,{signal});}catch(error){signal?.throwIfAborted();exclude(error.code||'merchant_read_failed');retry(event);await checkpoint();continue;}
      if(directoryMode){
        contact.phones=contact.businessPhones||[];
        if(contact.phones.length)await recordDirectory({storeId,domain:root,productUrl:event.productUrl,sourceUrls:contact.sources,phones:contact.phones});
      }
      let saved=false;
      let authorizationMissing=false;
      for(const phone of [...new Set(contact.phones.map(normalizePublicPhone).filter(Boolean))]){
        if(usedPhones.has(phone)){exclude('duplicated');continue;}
        const permission=await authorize({provider:'mahally',authorId:storeId,action:'save',phone});
        if(!permission.allowed){exclude(permission.detail||'not_authorized');authorizationMissing=true;continue;}
        const candidate={postId:`mahally:${event.productId}`,authorId:null,authorUsername:`mahally:${storeId}`,title:query,bodyText:'',city:event.city,url:event.productUrl,tags:[],contactSubject:{provider:'mahally',authorId:storeId},merchant:{storeId,name:event.name,domain:root,productUrl:event.productUrl,contactSourceUrls:contact.sources,cityBasis:'mahally_listing_not_verified_residence'},businessContact:{phones:[phone],origin:'official_merchant_website'},matchedStrategy:{strategyType:'MAHALLY_MERCHANT',searchTerm:query,query,pathId:'mahally-merchants',weight:1}};
        const qualification={isQualified:true,score:65,identityConfidence:0,purchasePropensity:0,evidenceStrength:100,grade:'MEDIUM',gradeBasis:'merchant_selling_matching_product_not_confirmed_buyer',marketplaceRole:'MERCHANT_CONTACT',matchedSignals:[query],demandEvidence:false,explanation:'Store selling the searched product. Contact published on its merchant website; listing city is not independently verified. Not a confirmed buyer.'};
        const result=await onCandidate(candidate,qualification,{contactMobile:phone});
        if(result?.created){usedPhones.add(phone);state.delivered++;saved=true;break;}
        exclude(result?.reason||'not_saved');
        if(result?.reason==='not_authorized')authorizationMissing=true;
      }
      if(!contact.phones.length)exclude('missing_phone');
      if(!saved&&contact.phones.length)exclude('no_deliverable_phone');
      if(!saved&&authorizationMissing)retry(event);
      await checkpoint();if(shouldStop()){state.complete=true;state.stopReason='target_reached';break;}
    }
    if(!state.complete&&!shouldStop())throw Object.assign(Error('Mahally worker ended without a completion event'),{code:'MAHALLY_STREAM_INTERRUPTED'});
    await checkpoint();return state;
  }catch(error){state.stopReason=error.code||'MAHALLY_FAILED';await checkpoint();throw error;}
}
