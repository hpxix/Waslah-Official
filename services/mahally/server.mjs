import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {browseMahally,browserUrlAllowed} from './browser.mjs';
import {fetchWebsitePage} from '../../directus/extensions/directus-extension-waslah-lead-agent/dist/website-reader.js';

const token=String(process.env.MAHALLY_WORKER_TOKEN||'');
if(token.length<32)throw Error('MAHALLY_WORKER_TOKEN must contain at least 32 characters');
let running=0;
createServer(async(req,res)=>{
  if(req.url==='/health'&&req.method==='GET'){res.end(JSON.stringify({ok:true,busy:running}));return;}
  const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(Buffer.byteLength(supplied)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))){res.writeHead(401).end();return;}
  if(req.url!=='/discover'||req.method!=='POST'){res.writeHead(404).end();return;}
  if(running>=2){res.writeHead(429,{'Retry-After':'15'}).end();return;}
  let browser,started=false;const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),15*60*1000);
  res.on('close',()=>abort.abort());
  try{
    let body='';for await(const chunk of req){body+=chunk;if(body.length>128000){res.writeHead(413).end();return;}}
    const input=JSON.parse(body),query=String(input.query||'').trim(),city=String(input.city||'all').trim();
    if(!query||query.length>160||city.length>100||!Array.isArray(input.skipStores||[])){res.writeHead(400).end();return;}
    const maxPages=Math.min(30,Math.max(1,Math.floor(Number(input.maxPages)||30))),maxStores=Math.min(10000,Math.max(1,Math.floor(Number(input.maxStores)||2000)));
    running++;started=true;
    browser=await chromium.launch({headless:true,chromiumSandbox:true});
    abort.signal.addEventListener('abort',()=>browser?.close().catch(()=>{}),{once:true});
    const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:900},serviceWorkers:'block',acceptDownloads:false});
    // Only fixed marketplace/search/CDN hosts enter Chromium. Merchant websites
    // are read by the DNS-pinned HTTPS reader in the Directus process.
    await context.route('**/*',route=>browserUrlAllowed(route.request().url())?route.continue():route.abort());
    const page=await context.newPage();res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store','x-accel-buffering':'no'});
    const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(JSON.stringify({type:'heartbeat'})+'\n');},10000);
    const fetchPage=async(url,options)=>{
      if(!/^https:\/\/mahally\.com\/en\/products\/\d+\/\d+\/$/.test(url))return fetchWebsitePage(url,options);
      // Product data is rendered through the same ordinary public browser flow
      // as search. No HTTP fallback, cookie substitution, CAPTCHA or stealth mode.
      const productPage=await context.newPage();
      try{const response=await productPage.goto(url,{waitUntil:'domcontentloaded',timeout:30000});return {status:response?.status()||0,html:await productPage.content(),url:productPage.url()};}
      finally{await productPage.close();}
    };
    try{for await(const event of browseMahally({query,city,maxPages,maxStores,skipStores:input.skipStores||[]},{page,fetchPage,signal:abort.signal})){
      if(abort.signal.aborted)break;if(!res.write(JSON.stringify(event)+'\n'))await once(res,'drain',{signal:abort.signal});
    }}finally{clearInterval(heartbeat);}
    if(!res.destroyed)res.end();
  }catch(error){const code=error.code||(!browser?'MAHALLY_BROWSER_START_FAILED':'MAHALLY_DISCOVERY_FAILED');console.error(JSON.stringify({event:'mahally_error',code,message:String(error.message||'').split('\n')[0].slice(0,250)}));if(!res.headersSent)res.writeHead(400,{'content-type':'application/x-ndjson'});if(!res.destroyed)res.end(JSON.stringify({type:'error',code})+'\n');}
  finally{clearTimeout(timer);if(browser)await browser.close().catch(()=>{});if(started)running--;}
}).listen(8060,'0.0.0.0');
