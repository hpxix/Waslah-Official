import { includesTerm, keywordText } from './b2c-keywords.js';
import { normalizePublicPhone, discoverProfileContacts, discoverPostContacts, selectAuthorizedContact, redactContactText } from './contact-discovery.js';
export { normalizePublicPhone, discoverProfileContacts, discoverPostContacts, selectAuthorizedContact } from './contact-discovery.js';

export const COMMENT_DISCOVERY_VERSION = 'consent-gated-comment-buyers-v3';
export const COMMENTS_QUERY = `query Comments($postId:Int!,$page:Int,$newestFirst:Boolean){comments(postId:$postId,page:$page,newestFirst:$newestFirst){items{id authorUsername authorId body status date isReply replyToCommentId} pageInfo{hasNextPage}}}`;
export const PROFILE_QUERY = `query PublicProfile($id:ID!){profile(id:$id){id handler type contacts{type info description}}}`;
export const AUTHOR_POSTS_QUERY = `query FetchAds($authorUsername:String,$page:Int,$limit:Int){posts(authorUsername:$authorUsername,page:$page,limit:$limit){items{id title bodyTEXT authorUsername authorId city geoCity URL} pageInfo{hasNextPage} viewOptions{mustLoginToView}}}`;

export function commentInterest(comment, sourceAd) {
  const body=keywordText(comment?.body);
  if(!body || /private comment|تعليق خاص|تم حذف|محذوف/i.test(body) || Number(comment.status)!==1
    || String(comment.authorId)===String(sourceAd.authorId) || !comment.authorId || !comment.authorUsername) return null;
  if(/(?:ابغ[ىي]|ابي|احتاج|اريد|ارغب|عطن رقمك|عطني رقمك|عطنا رقمك|بتواصل|كيف اطلب|كيف اشتري|i want|i need|how to order|send.*number)/iu.test(body)) return {grade:'EXCELLENT',score:95,basis:'explicit_purchase_or_contact_request'};
  if(/(?:بكم|كم سعر|السعر|سعرها|سعره|متوفر|موجود|خارج[iي]ه|داخل[iي]ه|ضمان|التوصيل|الشحن|مواصفات|how much|price|available|warranty|delivery|indoor|outdoor)/iu.test(body)) return {grade:'VERY_HIGH',score:90,basis:'price_availability_or_product_question'};
  return {grade:'MEDIUM',score:60,basis:'public_comment_on_matching_product_not_confirmed_interest'};
}
export function harajUrl(value) {
  try { const url=new URL(String(value||''),'https://haraj.com.sa/'); return url.protocol==='https:' && url.hostname==='haraj.com.sa'?url.href:null; } catch {return null;}
}
const bounded=(value,fallback,max)=>Math.min(max,Math.max(1,Math.floor(Number(value)||fallback)));

// All network functions are injected, and must use the shared provider guard.
// Phone-bearing requests require prior verified authorization. An authorized
// USER and STORE follow exactly the same discovery and eligibility paths.
export async function discoverCommentBuyers({plan,stats,target,fetchSearch,fetchComments,fetchProfile,fetchPosts,authorizeContact=async()=>({allowed:false,detail:'authorization_unconfigured'}),onCandidate,shouldStop=()=>false,checkpoint=async()=>{},signal,options={}}) {
  const state=stats.commentDiscovery ||= {version:COMMENT_DISCOVERY_VERSION,requests:0,ads:0,comments:0,interested:0,publicBusinessContacts:0,delivered:0,seenAds:[],seenAuthors:[],complete:false};
  if(state.version!==COMMENT_DISCOVERY_VERSION && state.stopReason!=='target_reached'){
    Object.assign(state,{version:COMMENT_DISCOVERY_VERSION,seenAds:[],seenAuthors:[],complete:false,cursor:null,pendingAuthors:[],seedBatch:null});
  }
  if(state.complete && !['time_budget','request_budget','page_budget'].includes(state.stopReason) || shouldStop()) return state;
  state.complete=false;
  state.cursor ||= {term:0,page:0,ad:0,commentPage:0};
  state.pendingAuthors ||= [];
  for(const item of state.pendingAuthors)delete item.contact;
  state.contactExclusions ||= [];
  state.countedAds ||= [...(state.seenAds||[])];
  state.profileTypes ||= {};
  state.contactRejections ||= {noPublicBusinessContact:0,unavailablePosts:0};
  state.accountsProcessed=Number(state.accountsProcessed||state.seenAuthors?.length||0);
  state.seedListings=Number(state.seedListings||0);
  const accountLimit=Number(options.accountLimit)||Infinity;
  const seedListingLimit=Number(options.seedListingLimit)||Infinity;
  const passRequests=state.requests;
  const budget=bounded(options.requestBudget,Math.min(160,target*5+10),1000);
  const deadline=Date.now()+bounded(options.timeBudgetMs,15_000,300_000);
  const seedPages=bounded(options.seedPages,3,20), commentPages=bounded(options.commentPages,3,20), authorPages=bounded(options.authorPages,2,10);
  const terms=[...new Set((plan.keywordMatching?.productTerms||[]).map(s=>String(s).trim()).filter(Boolean))].slice(0,8);
  const seenAds=new Set(state.seenAds||[]),seenAuthors=new Set(state.seenAuthors||[]);
  const countedAds=new Set(state.countedAds);
  const queuedAuthors=new Set(state.pendingAuthors.map(item=>String(item.comment.authorId)));
  const available=()=>{signal?.throwIfAborted();return state.accountsProcessed<accountLimit&&state.requests-passRequests<budget&&Date.now()<deadline&&!shouldStop();};
  const call=async fn=>{if(!available())return null;state.requests++;const result=await fn();await checkpoint();return result;};
  const exclude=(authorId,reasons)=>{for(const reason of reasons){state.contactRejections[reason.reason]=(state.contactRejections[reason.reason]||0)+1;state.contactExclusions.push({authorId:String(authorId),reason:reason.reason,detail:reason.detail,stage:reason.stage||'authorization',source:reason.source||null});}state.contactExclusions=state.contactExclusions.slice(-200);};
  const finishAuthor=async comment=>{seenAuthors.add(String(comment.authorId));state.accountsProcessed++;state.seenAuthors=[...seenAuthors];state.pendingAuthors.shift();queuedAuthors.delete(String(comment.authorId));await checkpoint();};
  const resolveNext=async()=>{
    const item=state.pendingAuthors[0];if(!item||!available())return;
    const {comment,interest,ad,term}=item;
    const lookup=await authorizeContact({authorId:comment.authorId,action:'lookup'});
    if(!lookup?.allowed){exclude(comment.authorId,[{reason:'not_authorized',detail:lookup?.detail||'consent_required'}]);await finishAuthor(comment);return;}
    let discovery;
    if(!item.profileChecked){
      const profile=await call(()=>fetchProfile(comment.authorId));
      state.profileTypes[profile?.type||'UNAVAILABLE']=(state.profileTypes[profile?.type||'UNAVAILABLE']||0)+1;
      discovery=discoverProfileContacts(profile,comment);item.profileChecked=true;
    } else {
      const posts=await call(()=>fetchPosts(comment.authorUsername,item.postPage||0));
      discovery=discoverPostContacts(posts?.items,comment);
      item.postPage=(item.postPage||0)+1;
      if(!posts||posts.viewOptions?.mustLoginToView){state.contactRejections.unavailablePosts++;item.postsFinished=true;}
      else item.postsFinished=!posts.pageInfo?.hasNextPage||item.postPage>=authorPages;
    }
    const {contact,exclusions}=await selectAuthorizedContact(discovery,{authorId:comment.authorId,authorizeContact});
    exclude(comment.authorId,exclusions);
    if(!contact&&exclusions.some(reason=>reason.reason==='not_authorized')){await finishAuthor(comment);return;}
    if(!contact&&!item.postsFinished){await checkpoint();return;}
    if(contact){
      state.publicBusinessContacts++;
      const city=ad.city||ad.geoCity;
      const qualification={isQualified:true,qualificationMode:COMMENT_DISCOVERY_VERSION,acceptanceBasis:'public_product_comment',verdict:'STRONG',score:interest.score,scoreMeaning:'evidence_tier_not_probability',grade:interest.grade,gradeBasis:interest.basis,identityConfidence:0,purchasePropensity:0,evidenceStrength:interest.score,marketplaceRole:'COMMENT_PROSPECT',matchedSignals:[comment.body],demandEvidence:interest.score>=90,supplyEvidence:false,explanation:`Public comment on a matching product listing: “${String(comment.body).slice(0,180)}”. Market: ${city}, from the source listing, not verified residence. Contact use requires verified authorization. A comment alone does not confirm current buying intent.`};
      const candidate={postId:ad.id,authorId:comment.authorId,authorUsername:comment.authorUsername,title:ad.title,bodyText:comment.body,city,geoCity:city,tags:ad.tags||[],postDate:comment.date,updateDate:comment.date,url:harajUrl(ad.URL),businessContact:contact,buyerComment:{id:comment.id,body:comment.body,date:comment.date,sourcePostId:ad.id,sourcePostUrl:harajUrl(ad.URL),sourcePostTitle:ad.title,marketCity:city,profileCity:contact.profileCity,cityBasis:'source_listing_market',profileUrl:`https://haraj.com.sa/users/${encodeURIComponent(comment.authorUsername)}/`},matchedStrategy:{strategyType:'PRODUCT_COMMENT_BUYER',searchTerm:term,query:term,weight:1,pathId:'comment-buyers',phase:'comment-buyers',phaseIndex:-1}};
      const result=await onCandidate(candidate,qualification);state.delivered+=Number(result?.created===true);
      if(['duplicate','duplicated','not_authorized'].includes(result?.reason))exclude(comment.authorId,[{reason:result.reason==='duplicate'?'duplicated':result.reason,detail:result.detail||'persistence_check',stage:'save'}]);
    } else state.contactRejections.noPublicBusinessContact++;
    await finishAuthor(comment);
  };
  let pagesThisPass=0,commentPagesThisPass=0,yielded=false;
  try {
    while(state.pendingAuthors.length&&available())await resolveNext();
    outer: for(let ti=state.cursor.term;ti<terms.length;ti++) for(let page=state.cursor.page;;page++){
      if(!available()) break outer;
      if(pagesThisPass>=seedPages){yielded=true;break outer;}
      const term=terms[ti];state.cursor.term=ti;state.cursor.page=page;pagesThisPass++;
      let seeds=state.seedBatch?.term===term&&state.seedBatch?.page===page?state.seedBatch.value:null;
      if(!seeds){
        if(state.seedListings>=seedListingLimit){state.sourcesExhausted=true;break outer;}
        seeds=await call(()=>fetchSearch({search:term,cities:plan.strategies?.[0]?.cities||[],page,limit:Math.min(50,seedListingLimit-state.seedListings)}));
        if(seeds){state.seedListings+=(seeds.items||[]).length;state.seedBatch={term,page,value:{pageInfo:seeds.pageInfo,items:(seeds.items||[]).map(({id,title,bodyTEXT,authorId,city,geoCity,URL,tags,status,commentEnabled,commentCount})=>({id,title,bodyTEXT,authorId,city,geoCity,URL,tags,status,commentEnabled,commentCount}))}};}
      }
      if(!seeds) break outer;
      for(let ai=state.cursor.ad;ai<(seeds.items||[]).length;ai++){
        if(!available()) break outer;
        const ad=seeds.items[ai];state.cursor.ad=ai;
        if(seenAds.has(ad.id)){state.cursor.ad=ai+1;continue;}
        const city=ad.city||ad.geoCity;
        if(!terms.some(t=>includesTerm(ad.title||'',t)||includesTerm(ad.bodyTEXT||'',t)) || !ad.commentEnabled || !(ad.commentCount>0)){state.cursor.ad=ai+1;continue;}
        if(!countedAds.has(ad.id)){state.ads++;countedAds.add(ad.id);state.countedAds=[...countedAds];}
        let finishedAd=true;
        for(let cp=state.cursor.commentPage;;cp++){
          if(!available())break outer;
          if(commentPagesThisPass>=commentPages){yielded=true;break outer;}
          const comments=await call(()=>fetchComments(ad.id,cp));if(!comments){yielded=true;break outer;}
          commentPagesThisPass++;
          state.comments+=(comments.items||[]).length;
          const best=new Map();
          for(const comment of comments.items||[]){const interest=commentInterest(comment,ad);if(!interest)continue;const key=String(comment.authorId);if(!best.has(key)||best.get(key).interest.score<interest.score)best.set(key,{comment,interest});}
          for(const {comment,interest} of [...best.values()].sort((a,b)=>b.interest.score-a.interest.score)){
            const authorKey=String(comment.authorId);if(seenAuthors.has(authorKey)||queuedAuthors.has(authorKey))continue;
            if(state.accountsProcessed+state.pendingAuthors.length>=accountLimit)break;
            state.interested++;
            state.pendingAuthors.push({comment:{...comment,body:redactContactText(comment.body)},interest,ad:{id:ad.id,title:redactContactText(ad.title),authorId:ad.authorId,city,URL:ad.URL,tags:ad.tags},term});queuedAuthors.add(authorKey);
          }
          state.cursor.commentPage=cp+1;
          // A bounded lookup step lets scanning advance without waiting for an
          // entire author's ad history. The durable queue survives every pass.
          await resolveNext();await checkpoint();
          if(!comments.pageInfo?.hasNextPage)break;
        }
        if(finishedAd){seenAds.add(ad.id);state.seenAds=[...seenAds];state.cursor.ad=ai+1;state.cursor.commentPage=0;}
        await checkpoint();
      }
      state.cursor.ad=0;state.cursor.commentPage=0;state.cursor.page=page+1;
      state.seedBatch=null;
      if(!seeds.pageInfo?.hasNextPage){state.cursor.term=ti+1;state.cursor.page=0;break;}
    }
    while(state.pendingAuthors.length&&available())await resolveNext();
    state.sourcesExhausted=Boolean(state.sourcesExhausted||state.cursor.term>=terms.length);
    state.complete=shouldStop()||state.accountsProcessed>=accountLimit||(state.sourcesExhausted&&!state.pendingAuthors.length);
    state.stopReason=shouldStop()?'target_reached':state.accountsProcessed>=accountLimit?'account_limit':state.complete?'bounded_sources_exhausted':state.requests-passRequests>=budget?'request_budget':Date.now()>=deadline?'time_budget':yielded?'page_budget':'bounded_sources_exhausted';
    await checkpoint();return state;
  } catch(error){state.lastErrorCode=error.code||'REQUEST_FAILED';await checkpoint();throw error;}
}
