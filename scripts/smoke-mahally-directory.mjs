import {spawnSync} from 'node:child_process';
const source=`
import {mahallyWorkerEvents,readMerchantContacts} from '/directus/extensions/directus-extension-waslah-lead-agent/dist/mahally.js';
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
try {
 const health=await fetch(new URL('/health',process.env.MAHALLY_WORKER_URL),{signal:controller.signal});
 if(!health.ok)throw Error('Worker health failed');
 let merchants=0,phones=0;
 for await(const event of mahallyWorkerEvents(process.env,{query:'steam',city:'all',maxPages:1,maxStores:1},controller.signal)){
  if(event.type==='error')throw Error(event.code);
  if(event.type==='merchant'){
   merchants++;
   const contact=await readMerchantContacts(event.domain,{signal:controller.signal});
   phones=contact.businessPhones.length;
   break;
  }
 }
 console.log(JSON.stringify({enabled:process.env.MAHALLY_ENABLED,directory:process.env.MAHALLY_PUBLIC_DIRECTORY,merchants,publicBusinessPhones:phones,savedLeads:0,billed:0}));
 if(!merchants||!phones)process.exitCode=1;
}finally{clearTimeout(timer);controller.abort();}
`;
const result=spawnSync('docker',['-H','unix:///Users/altahan/.docker/run/docker.sock','exec','-i','waslah_directus','node','--input-type=module'],{input:source,encoding:'utf8',timeout:100000});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exitCode=result.status??1;
