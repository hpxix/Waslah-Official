// Real SQL, mocked provider/AI. All fixtures/settings changes roll back.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import knexFactory from '/directus/node_modules/.pnpm/knex@3.1.0_mysql2@3.15.3_pg@8.16.3_sqlite3@5.1.7_tedious@18.6.1/node_modules/knex/knex.js';
import { createAstraeusRouter, ASTRAEUS_DEFAULTS } from '/directus/extensions/directus-extension-waslah-lead-agent/dist/astraeus-router.js';
const database = knexFactory({client:'pg',connection:{host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD},pool:{min:0,max:1}});
const rollback = new Error('ROLLBACK_TEST_FIXTURES'), accountId = `router-test-${randomUUID()}`;
let launches=[],usage=0,scenario='single',datasets=new Map(),validationCount=0;
const row=(id,eligible=true)=>({fullName:`Contact ${id}`,companyName:`Company ${id}`,phone:`+96655${String(id).padStart(7,'0')}`,companyCountry:'Saudi Arabia',companyCity:'Riyadh',eligible});
function reset(next){scenario=next;launches=[];datasets=new Map();validationCount=0;}
async function fetcher(url,options={}){
  assert.ok(url.startsWith('https://api.apify.com/v2/'));
  const parsed=new URL(url),path=parsed.pathname.replace('/v2',''); let body;
  if(path==='/users/me')body={data:{id:accountId,plan:{id:'FREE',monthlyBasePriceUsd:0,monthlyUsageCreditsUsd:5}}};
  else if(path==='/users/me/limits')body={data:{monthlyUsageCycle:{startAt:'test-cycle'},limits:{maxMonthlyUsageUsd:5},current:{monthlyUsageUsd:usage,activeActorJobCount:0}}};
  else if(path.startsWith('/acts/'))body={data:{id:path.split('/').at(-1),currentPricingInfo:{pricingModel:'PRICE_PER_DATASET_ITEM',pricePerUnitUsd:.001},stats:{actorReviewRating:5}}};
  else if(path.endsWith('/builds/default'))body={data:{buildNumber:'1.0.0',inputSchema:{type:'object',properties:{companyLocationCountryIncludes:{type:'array'},totalResults:{type:'integer'},hasPhone:{type:'boolean'},hasEmail:{type:'boolean'},roleMatchMode:{type:'string'},companyMatchMode:{type:'string'},customOffset:{type:'integer'},dontSaveProgress:{type:'boolean'}}}}};
  else if(path.endsWith('/validate-input')){
    validationCount++;
    if(scenario==='validation'&&validationCount===1)return new Response(JSON.stringify({error:{type:'invalid-input'}}),{status:400});
    body={valid:true};
  }else if(path.endsWith('/runs')){
    assert.equal(options.method,'POST');assert.equal(parsed.searchParams.get('forcePermissionLevel'),'LIMITED_PERMISSIONS');assert.equal(parsed.searchParams.get('restartOnError'),'false');assert.equal(parsed.searchParams.get('build'),'1.0.0');
    const input=JSON.parse(options.body),chargeCap=Number(parsed.searchParams.get('maxTotalChargeUsd'));
    launches.push({actor:path.split('/')[2],input,chargeCap});
    assert.equal(input.dontSaveProgress,true,'Request-local cursors, never shared between clients');
    const n=launches.length,id=`fixture-${n}`;
    if(scenario==='uncertain'||scenario==='partial-uncertain'&&n===2)throw new Error('Simulated lost launch response');
    let rows=[row(0)];
    if(scenario==='failed'&&n===1)rows=[];
    if(scenario==='fallback30')rows=n===1?Array.from({length:25},(_,i)=>row(i,i<2)):n===2?[row(0),...Array.from({length:14},(_,i)=>row(i+2))]:[row(0),row(16),...Array.from({length:14},(_,i)=>row(i+16))];
    if(scenario==='pagination')rows=n===1?[row(0),row(0),row(90,false),row(91,false)]:input.customOffset?[row(1)]:[];
    if(scenario==='duplicates')rows=[row(0),row(0)];
    if(scenario==='rejected')rows=[row(0,false),row(1,false)];
    if(scenario==='budget')rows=Array.from({length:input.totalResults},(_,i)=>row(i,false));
    if(scenario==='confirmation')rows=n===1?[row(0)]:[row(1)];
    if(scenario==='no-phone')rows=n===1?[{...row(0),phone:null}]:[row(1)];
    if(scenario==='diagnostic-row')rows=n===1?[{status:'no_results',rowType:'diagnostic',returnedThisRun:0}]:[row(1)];
    if(scenario==='overproduced-partial')rows=[...Array.from({length:10},(_,i)=>({...row(i),phone:null})),row(11)];
    if(scenario==='workspace-primary')rows=[row(0),row(1)];
    if(scenario==='workspace-secondary')rows=[row(2),row(1)];
    if(scenario==='workspace-duplicate-page')rows=input.customOffset?[row(1)]:Array.from({length:input.totalResults},()=>row(0));
    datasets.set(id,rows);
    body={data:{id,status:scenario==='failed'&&n===1?'FAILED':['partial-dataset','overproduced-partial'].includes(scenario)?'ABORTED':'SUCCEEDED',defaultDatasetId:id,usageTotalUsd:.001}};
  }else if(path.startsWith('/datasets/'))body=datasets.get(path.split('/')[2]);
  else throw new Error(`Unexpected mocked provider request: ${path}`);
  return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
}
async function ask(instructions,{records}){
  assert.ok(instructions.startsWith('Review relevance'));
  return{leads:records.map(r=>({index:r.index,accepted:JSON.parse(r.value).eligible,matches_requested_criteria:JSON.parse(r.value).eligible,reason:JSON.parse(r.value).eligible?'Fixture target and location supported':'Not relevant to the requested target'}))};
}
try{
  await database.transaction(async trx=>{
    const engine=createAstraeusRouter({database:trx,env:{APIFY_TOKEN:'fixture-not-a-real-token'},ask,fetcher});
    await engine.updateSettings(ASTRAEUS_DEFAULTS);
    const request=(count=1)=>({id:randomUUID(),query:'Test company Saudi Arabia',criteria:{model:'astraeus_ultra'},target_count:count});
    const basic=request();let result=await engine.execute(basic);
    assert.equal(result.leads.length,1);assert.equal(launches.length,1);assert.equal(result.fulfillment.stop_reason,'target_reached');
    await assert.rejects(engine.execute(basic),/already has a provider reservation/);assert.equal(launches.length,1);
    reset('fallback30');const batches=[];
    result=await engine.execute(request(30),{onBatch:async batch=>{batches.push(batch);return batch.map((_,i)=>i);}});
    assert.equal(result.leads.length,30);assert.equal(launches.length,3);assert.equal(new Set(result.leads.map(l=>l.phone)).size,30);
    assert.equal(result.fulfillment.sources_tried,3);assert.equal(result.fulfillment.rejected,23);assert.ok(result.fulfillment.duplicates>=2);assert.ok(batches.length>=3);
    assert.ok(launches.reduce((s,l)=>s+l.chargeCap,0)<=.5,'One shared cap across every source');
    reset('pagination');result=await engine.execute(request(2));
    assert.equal(result.leads.length,2);assert.equal(launches.length,4);assert.equal(launches[3].actor,launches[0].actor);assert.equal(launches[3].input.customOffset,4);
    assert.equal(new Set(launches.map(l=>`${l.actor}:${l.input.customOffset}`)).size,4);
    reset('duplicates');result=await engine.execute(request(3));assert.equal(result.leads.length,1);assert.equal(launches.length,3);assert.equal(result.fulfillment.stop_reason,'sources_exhausted');
    reset('rejected');result=await engine.execute(request(3));assert.equal(result.leads.length,0);assert.equal(result.fulfillment.stop_reason,'sources_exhausted');
    reset('failed');result=await engine.execute(request());assert.equal(result.leads.length,1);assert.equal(launches.length,2);
    reset('partial-dataset');result=await engine.execute(request());assert.equal(result.leads.length,1);assert.equal(launches.length,1,'Committed data from a cost-capped terminal run is reviewed and saved without relaunch');
    reset('overproduced-partial');result=await engine.execute(request());assert.equal(result.leads.length,1);assert.equal(launches.length,1);assert.equal(result.fulfillment.raw_records,11,'Inspect bounded already-paid rows beyond the requested source batch');
    reset('validation');result=await engine.execute(request());assert.equal(result.leads.length,1);assert.equal(launches.length,1);assert.equal(validationCount,2);
    reset('no-phone');result=await engine.execute(request());assert.equal(result.leads.length,1);assert.equal(launches.length,2);
    reset('diagnostic-row');result=await engine.execute(request());assert.equal(result.leads.length,1);assert.equal(launches.length,2);assert.equal(result.fulfillment.raw_records,1,'Provider diagnostics are not leads reviewed');
    reset('confirmation');let deliveries=0;
    result=await engine.execute(request(),{onBatch:async()=>++deliveries===1?[]:[0]});assert.equal(result.leads.length,1);assert.equal(launches.length,2,'Only confirmed new saves count');
    // Tenant-scoped existing delivery and secondary-phone exclusion.
    const orgA=randomUUID(),orgB=randomUUID(),leadId=randomUUID();
    const owner=await trx('directus_users').select('id').first();
    await trx('organizations').insert([orgA,orgB].map(id=>({id,name:'Router fixture',slug:`router-${id}`,owner_user:owner.id,status:'active',monthly_user_limit:25})));
    await trx('lead_inventory').insert({id:leadId,fingerprint:randomUUID().replaceAll('-','').padEnd(64,'0'),name:row(0).fullName,company:row(0).companyName,company_normalized:'company 0',phone:row(0).phone,source:'fixture',qualification_status:'qualified',enrichment_status:'raw',fit_score:0,enrichment_score:0,raw_payload:JSON.stringify({phone_numbers:[{number:row(2).phone}]})});
    await trx('lead_access_grants').insert({id:randomUUID(),grant_key:`${orgA}:${leadId}`,organization_id:orgA,lead_id:leadId,transaction_id:randomUUID(),grant_reason:'fixture'});
    reset('workspace-primary');result=await engine.execute({...request(),organization_id:orgA});assert.equal(result.leads[0].phone,row(1).phone,'Already delivered primary is excluded');
    reset('workspace-secondary');result=await engine.execute({...request(),organization_id:orgA});assert.equal(result.leads[0].phone,row(1).phone,'Already delivered secondary phone is excluded');
    reset('workspace-duplicate-page');const duplicatePageRequest={...request(),organization_id:orgA};result=await engine.execute(duplicatePageRequest);
    assert.equal(result.leads.length,1,'A full duplicate-only page must not hide fresh contacts on later pages');
    assert.equal(result.leads[0].phone,row(1).phone);assert.equal(launches.length,4);
    assert.equal(launches[3].actor,launches[0].actor,'Try other sources before advancing the first source');
    assert.equal(launches[3].input.customOffset,2,'Advance past every raw record, including duplicates');
    assert.equal(result.fulfillment.stop_reason,'target_reached');assert.equal(result.fulfillment.duplicates,6);
    const duplicatePageAudit=(await trx('wasla_astraeus_runs').where({request_id:duplicatePageRequest.id}).first()).audit;
    assert.ok(duplicatePageAudit.attempts.slice(0,3).every(attempt=>attempt.exhausted===false),'Duplicate-only pages are not source exhaustion');
    assert.ok(launches.reduce((sum,launch)=>sum+launch.chargeCap,0)<=.5,'Pagination keeps one shared authorization cap');
    reset('single');result=await engine.execute({...request(),organization_id:orgB});assert.equal(result.leads[0].phone,row(0).phone,'Other tenants do not reduce this client target');
    await engine.updateSettings({...ASTRAEUS_DEFAULTS,ultra:{...ASTRAEUS_DEFAULTS.ultra,maxRunUsd:.03}});
    reset('budget');result=await engine.execute(request(30));assert.equal(result.leads.length,0);assert.equal(launches.length,1);assert.equal(result.fulfillment.stop_reason,'budget_limit');assert.ok(launches.reduce((s,l)=>s+l.chargeCap,0)<=.03);
    await engine.updateSettings(ASTRAEUS_DEFAULTS);usage=4.99;await assert.rejects(engine.execute(request()),/credits are exhausted/);assert.equal(launches.length,1);usage=0;
    reset('partial-uncertain');result=await engine.execute(request(2),{onBatch:async batch=>batch.map((_,i)=>i)});
    assert.equal(result.leads.length,1);assert.equal(launches.length,2);assert.equal(result.fulfillment.stop_reason,'provider_reconciliation_required');
    reset('single');await assert.rejects(engine.execute(request()),/reconciliation/);assert.equal(launches.length,0);
    const rows=await trx('wasla_astraeus_runs').where({account_id:accountId});assert.ok(rows.some(r=>r.status==='uncertain'));assert.ok(rows.some(r=>r.status==='selection_failed'&&r.audit.error));
    throw rollback;
  });
}catch(error){if(error!==rollback)throw error;}finally{await database.destroy();}
console.log('Passed: 30 across 3 sources, pagination including duplicate-only pages, dedupe, strict rejection, streaming confirmation, Ultra phones, source failure, validation, shared budget, replay, uncertain launch. SQL rolled back; no external calls.');
