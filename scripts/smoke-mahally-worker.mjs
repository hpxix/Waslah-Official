import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mahallyWorkerEvents} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/mahally.js';

const name='waslah_mahally_smoke_'+randomUUID().replaceAll('-','');
const token=randomBytes(32).toString('hex');
const args=['-H','unix:///Users/altahan/.docker/run/docker.sock'];
const docker=(command,options={})=>{const result=spawnSync('docker',[...args,...command],{encoding:'utf8',timeout:30000,...options});if(result.status!==0)throw Error(result.stderr||result.error?.message||'Docker command failed');return (result.stdout+(command[0]==='logs'?result.stderr:'')).trim();};
let started=false;
try{
  docker(['run','-d','--rm','--name',name,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--security-opt','seccomp=infra/mahally-seccomp.json','--shm-size','512m','--tmpfs','/tmp:size=512m,mode=1777','-p','127.0.0.1:18060:8060','-e','MAHALLY_WORKER_TOKEN','waslah/mahally:local'],{env:{...process.env,MAHALLY_WORKER_TOKEN:token}});started=true;
  for(let i=0;i<30;i++){try{const health=await fetch('http://127.0.0.1:18060/health');if(health.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
  let merchants=0,completion=null;
  try{for await(const event of mahallyWorkerEvents({MAHALLY_WORKER_URL:'http://127.0.0.1:18060',MAHALLY_WORKER_TOKEN:token},{query:'steam',city:'all',maxPages:1,maxStores:1},controller.signal)){
    if(event.type==='error')throw Error(event.code);
    if(event.type==='merchant'){if(!event.domain||!event.storeId||Object.hasOwn(event,'phone'))throw Error('Invalid metadata event');merchants++;completion='merchant_discovered';break;}
    if(event.type==='complete')completion=event.reason;
  }}finally{clearTimeout(timer);controller.abort();}
  console.log(JSON.stringify({merchants,completion,phoneRequests:0,newLeads:0,billed:0}));
  if(!merchants)throw Error('Live merchant discovery did not succeed');
}catch(error){if(started){const logs=docker(['logs','--tail','8',name]);if(logs)console.error(logs);}throw error;}
finally{if(started)docker(['rm','-f',name]);}
