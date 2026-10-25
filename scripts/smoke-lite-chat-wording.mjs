// Run inside waslah_directus. Exercises authenticated chat only; does not
// launch lead searches, reveal contacts, or spend lead credits.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:8055';
const request="find me people that are trying to buy security camera's cctvs in saudi arabia riyadh";
const failed='Your target details are saved, but I couldn’t prepare the search plan this time. Retry and I’ll use the same product and area without asking you to repeat your answers.';
const transcript=[
 'user: Mission context: the user wants to sell to consumers. Understand the offer, ideal customer, geography, observable intent or ownership signals, categories, keywords, and exclusions.',
 'assistant: Let’s build a real audience for your offer. What product or service are you selling, and what core outcome does the customer get?',
 `user: ${request}`,`assistant: ${failed}`,`user: ${request}`,`assistant: ${failed}`,'user: yo dumbass try again',
];
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,mode:'json'}),signal:AbortSignal.timeout(20000)});
assert.equal(login.status,200,'configured admin login');
const auth=(await login.json()).data;
const headers={Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'};
try{
 for(const [name,message,history] of [['exact_request',request,[]],['exact_retry_transcript','yo dumbass try again',transcript]]){
  const start=Date.now();
  const response=await fetch(base+'/lead-agent/b2c/chat',{method:'POST',headers,body:JSON.stringify({conversation_id:randomUUID(),deal_intent:'sell',language:'en',message,reasoning_mode:'fast',transcript:history}),signal:AbortSignal.timeout(20000)});
  const payload=await response.json();
  assert.equal(response.status,200,`${name}: ${JSON.stringify(payload)}`);
  const result=payload.data;
  assert.equal(result.ready,true,name);
  assert.equal(result.planning.intent.productName,'كاميرات مراقبة',name);
  assert.deepEqual(result.planning.intent.market.cities,['Riyadh'],name);
  assert.equal(result.planning.acquisitionPlan.primaryLeadRoute,'product_comments',name);
  console.log(JSON.stringify({name,http:response.status,ready:result.ready,route:result.planning.acquisitionPlan.primaryLeadRoute,product:result.planning.intent.productName,cities:result.planning.intent.market.cities,elapsedMs:Date.now()-start,text:result.text}));
 }
}finally{
 await fetch(base+'/auth/logout',{method:'POST',headers,body:JSON.stringify({refresh_token:auth.refresh_token,mode:'json'}),signal:AbortSignal.timeout(5000)}).catch(()=>{});
}
