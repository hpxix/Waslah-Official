// Remove only Wasla's internal daily search-request budget through the audited
// admin API. Never resets usage or clears provider/admin/contact restrictions.
const base='http://127.0.0.1:8055';let auth;
try{
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,mode:'json'}),signal:AbortSignal.timeout(15000)});
  if(!login.ok)throw Error(`Admin authentication failed: ${login.status}`);
  auth=(await login.json()).data;
  const headers={Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'};
  async function request(method,body){
    const response=await fetch(base+'/lead-agent/admin/haraj-safety',{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`Request budget update failed: ${response.status}`);
    return (await response.json()).data;
  }
  const before=await request('GET');
  const limits={...before.limits,requestsPerDay:0};
  await request('POST',{action:'configure',confirmed:true,limits});
  if(before.paused&&before.reason==='daily_request_budget_reached'){
    await request('POST',{action:'resume',confirmed:true,searchOnly:true,limits});
  }
  const after=await request('GET');
  if(after.limits.requestsPerDay!==0||after.requests!==before.requests||after.contacts!==before.contacts||after.limits.intervalMs!==before.limits.intervalMs||after.limits.contactsPerDay!==before.limits.contactsPerDay||after.contactsPaused!==before.contactsPaused)throw Error('Unexpected setting/counter change; inspect admin audit.');
  console.log(JSON.stringify({requestsPerDay:after.limits.requestsPerDay,unlimited:true,paused:after.paused,reason:after.reason,requests:after.requests,contacts:after.contacts,intervalMs:after.limits.intervalMs,contactsPerDay:after.limits.contactsPerDay,contactsPaused:after.contactsPaused,providerRequests:0}));
}finally{
  if(auth)await fetch(base+'/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth.refresh_token,mode:'json'}),signal:AbortSignal.timeout(5000)}).catch(()=>{});
}
