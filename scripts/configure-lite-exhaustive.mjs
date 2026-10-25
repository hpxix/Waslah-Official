// Run inside waslah_directus. Uses its configured admin credentials in memory;
// all changes go through the audited admin API. Does not start a campaign.
const base='http://127.0.0.1:8055';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,mode:'json'}),signal:AbortSignal.timeout(20000)});
if(!login.ok)throw new Error(`Admin authentication failed: ${login.status}`);
const auth=(await login.json()).data;
const headers={Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'};
async function request(path,method='GET',body){
  const response=await fetch(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`${path} failed: ${response.status}`);
  return (await response.json()).data;
}
try{
  const current=await request('/lead-agent/admin/haraj-safety');
  if(current.paused&&current.reason!=='daily_request_budget_reached')throw new Error(`Provider/admin pause preserved: ${current.reason}`);
  const result=await request('/lead-agent/admin/haraj-safety','POST',{action:current.paused?'resume':'configure',confirmed:true,searchOnly:true,limits:{...current.limits,requestsPerDay:0}});
  const listing=await request('/lead-agent/admin/b2c-listing-limits','PUT',{limits:{30:0,50:0,200:0}});
  console.log(JSON.stringify({paused:result.paused,reason:result.reason,requests:result.requests,limits:result.limits,listingLimits:listing.limits,emergencyLimit:listing.emergency_limit}));
}finally{
  await fetch(base+'/auth/logout',{method:'POST',headers,body:JSON.stringify({refresh_token:auth.refresh_token,mode:'json'}),signal:AbortSignal.timeout(5000)}).catch(()=>{});
}
