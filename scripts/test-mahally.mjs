import assert from 'node:assert/strict';
import {initialMahallyResults,merchantDomain,mahallyCityMatches,extractMerchantContacts,readMerchantContacts,runMahallyFallback,mahallyWorkerEvents} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/mahally.js';
import {browseMahally,searchResults,browserUrlAllowed} from '../services/mahally/browser.mjs';
import {contactPhoneHash,evaluateContactAuthorization} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/contact-authorization.js';

const searchHtml=hits=>`<script>window[Symbol.for("InstantSearchInitialResults")] = ${JSON.stringify({products_v2:{results:[{hits,nbHits:100}]}})};</script>`;
const productHtml=(id,domain='https://merchant.example')=>`<script type="application/json">${JSON.stringify({store:{id,domain}})}</script>`;
assert.equal(initialMahallyResults(searchHtml([{store_id:1,objectID:2}])).hits.length,1);
assert.equal(initialMahallyResults('<script>alert(1)</script>'),null);
assert.equal(merchantDomain(productHtml(1),'1'),'https://merchant.example');
assert.equal(merchantDomain(productHtml(2),'1'),null,'other store identity cannot supply merchant URL');
for(const domain of ['https://127.0.0.1','https://internal.local','http://merchant.example','https://cdn.salla.sa','https://mahally.com'])assert.equal(merchantDomain(productHtml(1,domain),'1'),null,domain);
const flight=JSON.stringify('7:'+JSON.stringify({store:{id:1,domain:'https://merchant.example'}}));
assert.equal(merchantDomain(`<script>self.__next_f.push([1,${flight}])</script>`,'1'),'https://merchant.example','Next flight JSON supported without evaluation');
assert.equal(mahallyCityMatches({city:{name:{ar:'الرياض',en:'Riyadh'}}},'riyadh'),true);
assert.equal(mahallyCityMatches({city:{name:{ar:'جدة'}}},'Riyadh'),false);
const contacts=extractMerchantContacts('<a href="tel:٠٥٥٥٥٥٥٠٠١">Call</a><a href="https://wa.me/966555555001">WhatsApp</a><p>support@merchant.example</p><p>05555 +14155552671</p>');
assert.deepEqual(contacts.phones,['+966555555001']);assert.deepEqual(contacts.emails,['support@merchant.example']);
const visited=[];
const pages={
 'https://merchant.example/robots.txt':{status:200,html:'User-agent: *\nDisallow: /private'},
 'https://merchant.example/':{status:200,html:'<a href="/contact">Contact</a><a href="https://other.example/contact">Other</a><a href="/private/contact">Contact</a>'},
 'https://merchant.example/contact':{status:200,html:'<a href="tel:0555555001">Call</a>'}};
const found=await readMerchantContacts('https://merchant.example',{sleep:async()=>{},fetchPage:async url=>{visited.push(url);assert.ok(pages[url],url);return {...pages[url],url};}});
assert.deepEqual(found.phones,['+966555555001']);assert.equal(visited.length,3);
assert.equal(visited.some(url=>url.includes('other.example')||url.includes('/private/')),false);
const hit=(store,id,city='Riyadh')=>({store_id:store,objectID:id,store_name:`Store ${store}`,city:{name:{en:city}}});
const snapshots=[[hit(1,11),hit(1,12),hit(2,21,'Jeddah')],[hit(1,11),hit(3,31)]];
let pageNumber=0,scrolls=0,productReads=0;
const fakePage={on(){},off(){},goto:async()=>({status:()=>200}),content:async()=>searchHtml(snapshots[Math.min(pageNumber,1)]),waitForTimeout:async()=>{},locator:()=>({first:()=>({count:async()=>0})}),evaluate:async()=>{pageNumber++;scrolls++;}};
const browserEvents=[];
for await(const event of browseMahally({query:'steam',city:'Riyadh',maxPages:4,maxStores:100},{page:fakePage,delay:async()=>{},fetchPage:async url=>{if(url.endsWith('robots.txt'))return {status:404};productReads++;const id=url.includes('/1/')?1:3;return {status:200,html:productHtml(id)};}}))browserEvents.push(event);
assert.deepEqual(browserEvents.filter(e=>e.type==='merchant').map(e=>e.storeId),['1','3']);
assert.equal(productReads,2,'one merchant lookup per store despite repeated products');
assert.equal(scrolls,2);assert.equal(browserEvents.at(-1).reason,'pagination_unavailable');
assert.equal(searchResults({results:[{index:'products_v2',query:'other',hits:[hit(1,1)]}]},'steam').length,0);
assert.equal(browserUrlAllowed('https://127.0.0.1/foo'),false);assert.equal(browserUrlAllowed('https://a-dsn.algolia.net/1/indexes'),true);

const event=(store,domain=`https://store${store}.example`)=>({type:'merchant',storeId:String(store),productId:String(store*10),domain,name:`Store ${store}`,city:'Riyadh',productUrl:`https://mahally.com/en/products/${store}/${store*10}/`});
const stats={},saved=[],phoneByStore={1:[],2:['+966555555001'],3:['+966555555001'],4:['+966555555002'],5:['+966555555003']};let checkpoints=0,contactReads=0;
const authorize=async scope=>({allowed:scope.authorId!=='5',detail:'consent_required'});
const config={env:{},plan:{keywordMatching:{productTerms:['steam']},strategies:[{cities:['Riyadh']}]},stats,target:2,authorize,
 events:async function*(){for(const i of [1,2,2,3,5,4])yield event(i);yield {type:'complete',reason:'pagination_unavailable'};},
 readContacts:async root=>{contactReads++;const id=Number(new URL(root).hostname.match(/\d+/)[0]);return {phones:phoneByStore[id],emails:[],sources:[root+'/contact']};},
 onCandidate:async(candidate,_qualification,contact)=>{saved.push({candidate,contact});return {created:true};},
 shouldStop:()=>saved.length>=2,checkpoint:async()=>{checkpoints++;}};
await runMahallyFallback(config);
assert.equal(saved.length,2);assert.equal(new Set(saved.map(x=>x.contact.contactMobile)).size,2);
assert.equal(saved[0].candidate.contactSubject.provider,'mahally');assert.equal(saved[0].candidate.authorId,null,'merchant IDs are never cast into Haraj IDs');
assert.equal(stats.mahally.stopReason,'target_reached');assert.ok(stats.mahally.exclusions.missing_phone);assert.ok(stats.mahally.exclusions.duplicated);assert.equal(contactReads,4,'denied store must not trigger contact retrieval');assert.ok(checkpoints>=5);
await runMahallyFallback(config);assert.equal(saved.length,2,'completed run cannot redeliver');
let granted=false,retrySaved=0,searchRuns=0;
const retryConfig={...config,stats:{},shouldStop:()=>retrySaved===1,authorize:async()=>({allowed:granted,detail:'consent_required'}),events:async function*(){searchRuns++;yield event(2);yield {type:'complete',reason:'page_limit'};},onCandidate:async()=>{retrySaved++;return {created:true};}};
await runMahallyFallback(retryConfig);assert.equal(retrySaved,0);assert.equal(retryConfig.stats.mahally.pendingMerchants.length,1);
granted=true;await runMahallyFallback(retryConfig);assert.equal(retrySaved,1,'new valid consent enables a previously excluded merchant on retry');assert.equal(searchRuns,1,'consent retry reuses only phone-free merchant metadata');
const interrupted={...config,stats:{},shouldStop:()=>false,events:async function*(){yield {type:'heartbeat'};}};
await assert.rejects(()=>runMahallyFallback(interrupted),{code:'MAHALLY_STREAM_INTERRUPTED'});
const now=Date.now(),record={id:'verified-fixture',organization_id:'workspace',provider:'mahally',author_id:'2',purpose:'lead_generation',status:'granted',actions:['lookup','save','reveal'],phone_hashes:[contactPhoneHash('0555555001','mahally')],evidence_reference:'verified-test',verified_by:'fixture',verified_at:new Date(now-1000),granted_at:new Date(now-1000),expires_at:new Date(now+60000)};
assert.equal(evaluateContactAuthorization(record,{organizationId:'workspace',authorId:'2',provider:'mahally',action:'save',phone:'0555555001'},now).allowed,true);
assert.equal(evaluateContactAuthorization(record,{organizationId:'workspace',authorId:'2',action:'save',phone:'0555555001'},now).allowed,false,'Haraj permission cannot authorize Mahally');
assert.equal(evaluateContactAuthorization({...record,status:'revoked'},{organizationId:'workspace',authorId:'2',provider:'mahally',action:'reveal',phone:'0555555001'},now).allowed,false);
let cancelled=false;
const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify(event(1))+'\n'));},cancel(){cancelled=true;}});
for await(const e of mahallyWorkerEvents({MAHALLY_WORKER_URL:'http://worker:8060',MAHALLY_WORKER_TOKEN:'x'.repeat(32)},{query:'steam'},undefined,async()=>new Response(stream))){assert.equal(e.type,'merchant');break;}
assert.equal(cancelled,true,'target completion closes the worker stream');
console.log('PASS: offline Mahally pagination, store/city identity, real-domain binding, contact-page limits, Saudi phones, target counts, store/phone deduplication, checkpoints, denied retrieval, provider isolation, revocation and cancellation. No live contacts collected.');
