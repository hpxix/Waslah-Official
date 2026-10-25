// Narrow reviewed live recovery via audited admin API. Never clears provider denials,
// malformed responses, quotas, admin stops, counters, or contact restrictions.
const base='http://127.0.0.1:8055';let auth;
try{
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,mode:'json'}),signal:AbortSignal.timeout(15000)});
  if(!login.ok)throw Error(`Admin login failed: ${login.status}`);
  auth=(await login.json()).data;
  const headers={Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'};
  async function request(method,body){const response=await fetch(base+'/lead-agent/admin/haraj-safety',{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`Guard request failed: ${response.status}`);return (await response.json()).data;}
  const before=await request('GET');
  if(!before.paused){console.log(JSON.stringify({paused:false,changed:false,providerRequests:0}));}
  else{
    const failure=[...(before.events||[])].reverse().find(event=>event.outcome==='request_failed');
    const status=Number(failure?.status||0);
    const pause=[...(before.events||[])].reverse().find(event=>event.kind==='pause'&&event.reason===before.reason);
    const reviewedInterrupted=before.reason==='interrupted_request_review_required'&&Number(before.contacts)===0&&Number.isFinite(Date.parse(pause?.at))&&Date.now()-Date.parse(pause.at)>=65_000;
    const transient=before.reason==='request_failed'&&failure&&(status===0||status===408||status>=500&&status<=599);
    if(!transient&&!reviewedInterrupted)throw Error(`Pause preserved: ${before.reason}; no verified transient failure or reviewed expired lock.`);
    if(before.retryAt&&before.retryAt>Date.now())throw Error('Provider Retry-After preserved; wait until it expires.');
    if(before.inFlight)throw Error('In-flight request preserved; wait before recovery.');
    await request('POST',{action:'resume',confirmed:true,searchOnly:true,limits:before.limits});
    const after=await request('GET');
    if(after.paused||after.requests!==before.requests||after.contacts!==before.contacts)throw Error('Recovery verification failed; review administrative audit.');
    console.log(JSON.stringify({paused:after.paused,changed:true,priorReason:before.reason,failureStatus:failure?.status||null,reviewedInterrupted,requests:after.requests,contacts:after.contacts,contactsPaused:after.contactsPaused,providerRequests:0}));
  }
  // Deliberately invalid high-mode brief: validate that campaign submission
  // passes connection preflight, then fails before planning/insertion/billing.
  if(process.env.VERIFY_COUNT_PREFLIGHT==='1'){
    const response=await fetch(base+'/lead-agent/b2c/campaigns',{method:'POST',headers,body:JSON.stringify({prompt:'Diagnostic preflight only',targetLeadCount:30,reasoning_mode:'high',business_understanding:{}}),signal:AbortSignal.timeout(15000)});
    const result=await response.json();const code=result.error?.code||result.errors?.[0]?.extensions?.code;
    if(![400,402].includes(response.status)||!['BUSINESS_BRIEF_INCOMPLETE','INSUFFICIENT_CREDITS'].includes(code))throw Error(`Count preflight unexpected: ${response.status}/${code}; no valid campaign payload was sent.`);
    console.log(JSON.stringify({connectionPreflightPassed:true,validationStatus:response.status,validationCode:code,campaignCreated:false,providerRequests:0}));
  }
}finally{
  if(auth)await fetch(base+'/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth.refresh_token,mode:'json'}),signal:AbortSignal.timeout(5000)}).catch(()=>{});
}
