// Explicit small live test only. Reuses an already-confirmed customer brief;
// never changes its filters, entitlements, budget settings, or safety circuits.
// Run inside Directus: node --input-type=module - < script --live SOURCE_UUID...
import {randomUUID} from 'node:crypto';
import knexFactory from '/directus/node_modules/.pnpm/knex@3.1.0_mysql2@3.15.3_pg@8.16.3_sqlite3@5.1.7_tedious@18.6.1/node_modules/knex/knex.js';
import {createAstraeusRouter} from '/directus/extensions/directus-extension-waslah-lead-agent/dist/astraeus-router.js';
const args=process.argv.slice(2);
if(args.shift()!=='--live'||!args.length||args.length>2||args.some(id=>!/^[a-f0-9-]{36}$/i.test(id)))throw Error('Explicit --live plus one or two confirmed source-request UUIDs required.');
const database=knexFactory({client:'pg',connection:{host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD},pool:{min:0,max:3}});
const parse=v=>typeof v==='string'?JSON.parse(v):v;
try{
  if(!process.env.N8N_WEBHOOK_SECRET)throw Error('Ingestion not configured');
  if(await database('lead_requests').whereIn('status',['queued','sourcing','running']).first())throw Error('Customer work is active; do not interrupt or duplicate it.');
  const engine=createAstraeusRouter({database,env:process.env,ask:async(instructions,data)=>{
    const key=process.env.OPENROUTER_API_KEY||process.env.OPEN_ROUTER_TOKEN;if(!key)throw Error('Reviewer unavailable');
    const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENROUTER_CHAT_MODEL||process.env.B2C_OPENROUTER_MODEL||'openai/gpt-4o-mini',messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(data)}],response_format:{type:'json_object'},max_tokens:5000,temperature:0}),signal:AbortSignal.timeout(60000)});
    const d=await r.json();if(!r.ok)throw Error(`Reviewer HTTP ${r.status}`);return JSON.parse(d.choices?.[0]?.message?.content||'{}');
  }});
  for(const sourceId of args){
    const source=await database('lead_requests').where({id:sourceId,provider:'apify'}).first();
    if(!source||!source.created_by||!source.organization_id)throw Error('Confirmed tenant-scoped company request required');
    const wallet=await database('wallets').where({organization_id:source.organization_id}).first();
    if(Number(wallet?.balance_halalas||0)<100)throw Error('Insufficient existing credit for one delivered lead');
    const criteria={...parse(source.criteria),billing_mode:'per_fetched_lead',qa_source_request:sourceId};
    const stamp=new Date().toISOString(),id=randomUUID();
    const request={id,organization_id:source.organization_id,created_by:source.created_by,query:source.query,criteria:JSON.stringify(criteria),provider:'apify',status:'queued',target_count:1,result_count:0,idempotency_key:`model-repair-${id}`,created_at:stamp,updated_at:stamp};
    await database('lead_requests').insert(request);
    console.log(JSON.stringify({phase:'started',requestId:id,model:criteria.model,target:1}));
    try{
      const result=await engine.execute(request,{onBatch:async(leads,runId)=>{
        const r=await fetch(`http://127.0.0.1:${process.env.PORT||8055}/lead-agent/integrations/leads`,{method:'POST',headers:{'Content-Type':'application/json','x-waslah-workflow-secret':process.env.N8N_WEBHOOK_SECRET},body:JSON.stringify({request_id:id,provider_job_id:runId,leads,sourcing_in_progress:true}),signal:AbortSignal.timeout(30000)});
        const d=await r.json();if(!r.ok||!Array.isArray(d.data?.accepted_indices))throw Error('Ingestion not confirmed');return d.data.accepted_indices;
      }});
      const status=result.fulfillment.complete?'sourced':result.fulfillment.delivered?'partial':'failed';
      await database('lead_requests').where({id}).update({status,criteria:JSON.stringify({...criteria,fulfillment:result.fulfillment}),error_message:result.fulfillment.complete?null:`Model test shortfall: ${result.fulfillment.stop_reason}. Saved results are kept.`,updated_at:new Date().toISOString()});
      console.log(JSON.stringify({phase:'finished',requestId:id,model:criteria.model,status,delivered:result.fulfillment.delivered,reviewed:result.fulfillment.raw_records,sources:result.fulfillment.sources_tried,stopReason:result.fulfillment.stop_reason}));
    }catch(e){
      const saved=await database('lead_requests').where({id}).first();
      await database('lead_requests').where({id}).update({status:Number(saved.result_count)>0?'partial':'failed',error_message:'Model verification stopped. Check the protected source audit; do not replay automatically.',updated_at:new Date().toISOString()});
      console.log(JSON.stringify({phase:'stopped',requestId:id,model:criteria.model,error:String(e.message).replace(/Bearer\s+\S+|\beyJ[A-Za-z0-9_.-]+/gi,'[REDACTED]').slice(0,200)}));
    }
  }
}finally{await database.destroy();}
