import {initialMahallyResults,mahallyCityMatches,mahallyCities,mahallyProductKey,merchantDomain} from '../../directus/extensions/directus-extension-waslah-lead-agent/dist/mahally.js';
import {fetchWebsitePage,robotsAllows} from '../../directus/extensions/directus-extension-waslah-lead-agent/dist/website-reader.js';

const BASE='https://mahally.com';
const NEXT=['a[rel="next"]','button[aria-label*="next" i]','a[aria-label*="next" i]','button:has-text("Load more")','button:has-text("Show more")','button:has-text("التالي")','a:has-text("التالي")','button:has-text("Next")'];
export function browserUrlAllowed(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['mahally.com','salla.sa','salla.network','algolia.net','algolianet.com','algolia.io','googleapis.com','gstatic.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}
}
export function searchResults(payload,query){
  return (Array.isArray(payload?.results)?payload.results:[payload]).filter(result=>{
    if(!Array.isArray(result?.hits)||!result.hits.every(h=>h&&h.store_id!=null&&h.objectID!=null))return false;
    return (result.index==='products_v2'||result.indexName==='products_v2')&&String(result.query||'').trim().toLowerCase()===query.trim().toLowerCase();
  });
}
// Page is injected so pagination/response handling can be exercised completely
// offline. Live callers supply a fresh, isolated Chromium context.
export async function* browseMahally({query,city,maxPages=30,maxStores=2000,skipStores=[]},{page,fetchPage=fetchWebsitePage,signal,delay=ms=>page.waitForTimeout(ms)}){
  const checked=new Set(skipStores.map(String)),products=new Set(),captured=[];
  const rules=await fetchPage(BASE+'/robots.txt',{signal,origin:BASE,maxBytes:200000});
  if(rules.status!==404&&(rules.status!==200||!robotsAllows(rules.html,'/en/browse/')))throw Object.assign(Error('Mahally automated search unavailable'),{code:'MAHALLY_ROBOTS_RESTRICTED'});
  const responseHandler=async response=>{
    if(response.status()!==200||!['xhr','fetch'].includes(response.request().resourceType()))return;
    if(!browserUrlAllowed(response.url()))return;
    try{for(const result of searchResults(await response.json(),query)){captured.push(result);if(captured.length>40)captured.shift();}}catch{}
  };
  page.on('response',responseHandler);
  let processed=0;
  try{
    const response=await page.goto(BASE+'/en/browse/?query='+encodeURIComponent(query),{waitUntil:'domcontentloaded',timeout:45000});
    if(response&&[401,403,429].includes(response.status()))throw Object.assign(Error('Mahally access restricted'),{code:'MAHALLY_ACCESS_RESTRICTED'});
    await delay(2500);
    for(let index=0;index<maxPages;index++){
      signal?.throwIfAborted();
      const ssr=initialMahallyResults(await page.content());
      const snapshots=[...captured,...(ssr?[ssr]:[])];
      const hits=snapshots.flatMap(result=>result.hits||[]).filter(hit=>hit?.store_id!=null&&hit?.objectID!=null&&!products.has(mahallyProductKey(hit)));
      const fresh=[...new Map(hits.map(hit=>[mahallyProductKey(hit),hit])).values()];
      if(!fresh.length){yield {type:'complete',reason:index?'pagination_unavailable':'no_search_results'};return;}
      yield {type:'progress',activity:'Reading Mahally product results',pages:index+1,products:fresh.length};
      for(const hit of fresh){
        signal?.throwIfAborted();products.add(mahallyProductKey(hit));
        const storeId=String(hit.store_id),productId=String(hit.objectID);
        if(checked.has(storeId)||!mahallyCityMatches(hit,city)||!/^\d+$/.test(storeId)||!/^\d+$/.test(productId))continue;
        if(processed>=maxStores){yield {type:'complete',reason:'store_limit'};return;}
        processed++;checked.add(storeId);
        const productUrl=`${BASE}/en/products/${storeId}/${productId}/`;
        if(rules.status===200&&!robotsAllows(rules.html,new URL(productUrl).pathname)){yield {type:'progress',activity:'Product page disallows automated reading',pages:index+1};continue;}
        yield {type:'progress',activity:'Finding the merchant website',pages:index+1};
        const product=await fetchPage(productUrl,{signal,origin:BASE});
        if([401,403,429].includes(product.status))throw Object.assign(Error('Mahally access restricted'),{code:'MAHALLY_ACCESS_RESTRICTED'});
        if(product.status!==200)continue;
        const domain=merchantDomain(product.html,storeId);
        if(domain)yield {type:'merchant',storeId,productId,domain,productUrl,name:String(hit.store_name||hit.org_store_name||'').slice(0,255),city:mahallyCities(hit).find(value=>mahallyCityMatches({city:{name:value}},city))||mahallyCities(hit)[0]||''};
        else yield {type:'progress',activity:'Merchant website could not be verified',pages:index+1};
        await delay(1500);
      }
      if(index+1>=maxPages){yield {type:'complete',reason:'page_limit'};return;}
      let advanced=false;
      for(const selector of NEXT){const control=page.locator(selector).first();try{if(await control.count()&&await control.isVisible()&&await control.isEnabled()){await control.click({timeout:5000});advanced=true;break;}}catch{}}
      if(!advanced)await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
      await delay(2500);
    }
  }finally{page.off('response',responseHandler);}
}
