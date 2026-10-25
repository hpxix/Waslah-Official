// Run inside Directus. Restores account acquisition settings through the audited
// admin API only. Does not start/retry jobs, touch consent, reset provider limits,
// clear pauses, print contacts, or alter completed campaign records.
import knexFactory from '/directus/node_modules/.pnpm/knex@3.1.0_mysql2@3.15.3_pg@8.16.3_sqlite3@5.1.7_tedious@18.6.1/node_modules/knex/knex.js';
const db=knexFactory({client:'pg',connection:{host:process.env.DB_HOST,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD},pool:{min:0,max:1}});
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const base='http://127.0.0.1:8055';
let auth;
try{
  const reference=await db('b2c_campaigns').where({id:'db3f180d-01d1-49b5-8417-60d76c363f30'}).select('id','stats','target_lead_count','status').first();
  if(!reference)throw Error('Historical reference not found; refusing to guess.');
  const delivered=await db('b2c_candidates').where({campaign_id:reference.id,status:'DELIVERED'}).count('* as total').first();
  if(Number(delivered.total)!==200)throw Error('Historical reference differs; review before restoration.');
  const accounts=await db('customer_profiles').distinct('user_id');
  const flags=await db('feature_flags').where('feature_key','like','internal_lite_mode_%').select('feature_key','configuration');
  const before=Object.fromEntries(flags.map(row=>[row.feature_key.slice('internal_lite_mode_'.length),parse(row.configuration)?.mode]));
  const previousModes=accounts.reduce((counts,row)=>{const mode=before[row.user_id]||'mixed (live default)';counts[mode]=(counts[mode]||0)+1;return counts;},{});
  const active=await db('b2c_campaigns').whereIn('status',['RUNNING','QUEUED']).count('* as total').first();
  if(process.env.APPLY_LITE_REFERENCE!=='1'){
    const stats=parse(reference.stats)||{};
    console.log(JSON.stringify({reference:reference.id,historicalDelivered:Number(delivered.total),referenceStats:{postsFetched:stats.postsFetched,publicPhoneHits:stats.publicPhoneHits,remoteContactHits:stats.remoteContactHits,contactAttempts:stats.contactAttempts},accounts:accounts.length,previousModes,activeCampaigns:Number(active.total),apply:false}));
  }else{
    const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,mode:'json'}),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(`Admin authentication failed: ${response.status}`);
    auth=(await response.json()).data;
    let changed=0;
    for(const account of accounts){
      if(before[account.user_id]==='listings_only')continue;
      const saved=await fetch(base+'/lead-agent/admin/lite-search-mode',{method:'PUT',headers:{Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({account:account.user_id,mode:'listings_only'}),signal:AbortSignal.timeout(20000)});
      if(!saved.ok)throw Error(`Account mode restore failed: ${saved.status}; ${changed} earlier updates remain audited.`);
      if((await saved.json()).data.mode!=='listings_only')throw Error('Mode verification failed');
      changed++;
    }
    console.log(JSON.stringify({reference:reference.id,historicalDelivered:200,accounts:accounts.length,changed,previousModes,activeCampaigns:Number(active.total),mode:'listings_only',providerRequests:0,campaignsStarted:0,consentChanged:false,providerPausesChanged:false}));
  }
}finally{
  if(auth)await fetch(base+'/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth.refresh_token,mode:'json'}),signal:AbortSignal.timeout(5000)}).catch(()=>{});
  await db.destroy();
}
