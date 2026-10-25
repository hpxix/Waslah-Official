// Read-only aggregate funnel inspection; no contacts, raw ads or provider calls.
import knexFactory from '/directus/node_modules/.pnpm/knex@3.1.0_mysql2@3.15.3_pg@8.16.3_sqlite3@5.1.7_tedious@18.6.1/node_modules/knex/knex.js';
import {redactContactText} from '/directus/extensions/directus-extension-waslah-lead-agent/dist/contact-discovery.js';
const db=knexFactory({client:'pg',connection:{host:process.env.DB_HOST,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD},pool:{min:0,max:1}});
const parse=value=>typeof value==='string'?JSON.parse(value):value||{};
const clean=value=>redactContactText(String(value||'')).replace(/Bearer\s+\S+|\beyJ[A-Za-z0-9_.-]+/gi,'[REDACTED]').slice(0,900);
try{
  const runs=await db('b2c_campaigns').select('id','request_id','status','stats','created_at','error_message','acquisition_plan').orderBy('created_at','desc').limit(2);
  for(const run of runs){
    const stats=parse(run.stats),plan=parse(run.acquisition_plan);
    const request=await db('lead_requests').where({id:run.request_id}).select('status','result_count','target_count','error_message').first();
    const candidates=await db('b2c_candidates').where({campaign_id:run.id}).select('status').count('* as count').groupBy('status');
    const fields=['liteSearchMode','executionProfile','postsFetched','candidatesQualified','contactsResolved','contactCandidatesProcessed','contactAttempts','cachedContactHits','publicPhoneHits','contactErrors','remoteContactSkipped','uniqueLeads','localRejected','duplicateCandidatesSkippedTotal','searchPass','sourceExhausted','contactLookupMode','maxAds','contactSafetyPause'];
    console.log(JSON.stringify({id:run.id,createdAt:run.created_at,campaignStatus:run.status,requestStatus:request?.status,delivered:request?.result_count,target:request?.target_count,error:clean(request?.error_message||run.error_message),stats:Object.fromEntries(fields.filter(key=>stats[key]!==undefined).map(key=>[key,stats[key]])),candidateStatuses:candidates,strategyProgress:Object.values(stats.strategyProgress||{}).map(p=>({query:p.query,pages:p.pagesFetched,fetched:p.postsFetched,qualified:p.qualifiedCount,delivered:p.deliveredCount,exhausted:p.exhausted,exhaustedReason:p.exhaustedReason})),strategies:(plan.strategies||[]).map(strategy=>({term:strategy.searchTerm||strategy.query,type:strategy.strategyType})),lastEvents:(stats.executionLedger||[]).slice(-5)}));
  }
}finally{await db.destroy();}
