import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routedChatModel, FRIENDLY_CHAT_TONE, smallTalkReply } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/chat-model.js';
import { qualifyCandidates } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import { isSmallTalkTurn } from '../src/lib/chatBehavior.ts';
for(const model of [undefined,'gpt-4','gpt-4o-mini','gpt-4.1-mini','openai/gpt-4.1','openai/gpt-4o-mini'])assert.equal(routedChatModel(model),'openrouter/free');
assert.equal(routedChatModel('openrouter/free'),'openrouter/free');
assert.equal(routedChatModel('explicit/custom-model'),'explicit/custom-model');
for(const text of ['Hi','Hello Wasla!','هلا','السلام عليكم','شكراً','كيف حالك؟']){assert.equal(isSmallTalkTurn(text),true,text);assert.ok(smallTalkReply(text));}
for(const text of ['Hi, find me 30 leads','ابي كاميرات','احتاج عملاء','30','hello cameras','thanks, change city to Jeddah']){assert.equal(isSmallTalkTurn(text),false,text);assert.equal(smallTalkReply(text),null);}
assert.ok(FRIENDLY_CHAT_TONE.includes('Never invent progress'));
const original=globalThis.fetch;let calls=0;
globalThis.fetch=async(url,options)=>{
 calls++;assert.equal(new URL(url).hostname,'openrouter.ai','no paid primary call');const body=JSON.parse(options.body);
 assert.equal(body.model,'openrouter/free');assert.equal(body.provider.require_parameters,true);assert.equal(body.response_format.type,'json_schema');
 return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({items:[{postId:1,scoreScale:100,verdict:'STRONG',score:80,identityConfidence:80,purchasePropensity:75,evidenceStrength:80,marketplaceRole:'OWNER',matchedSignals:['coffee equipment'],negativeSignals:[],competitorProbability:5,irrelevantProbability:5,explanation:'Relevant coffee equipment.'}]})}}]})};
};
try {await qualifyCandidates({OPENAI_API_KEY:'must-not-use',OPENROUTER_API_KEY:'fixture',B2C_OPENROUTER_QUALIFICATION_MODEL:'openai/gpt-4.1-mini'},[{postId:1,title:'Home espresso machine',bodyText:'Personal household equipment',matchedStrategy:{pathId:'test',searchTerm:'coffee',strategyType:'OWNER_FALLBACK'}}],{product:'Coffee',dealIntent:'sell',qualification:{minimumLeadScore:65}});assert.equal(calls,1);}finally{globalThis.fetch=original;}
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
assert.ok(app.includes('responseMs: Math.round(performance.now() - replyStarted)'));
assert.ok(app.includes('replyEpoch !== replyRequestEpoch.current'));
assert.ok(app.includes('result.mode === "lead" && !isSmallTalkTurn(text)'));
assert.equal(app.includes('`The search stopped: ${leadWorkspace.error}'),false,'job errors never become assistant transcript');
const reveal=readFileSync(new URL('../src/components/RevealedChatReply.tsx',import.meta.url),'utf8');
assert.ok(reveal.includes('prefers-reduced-motion'));assert.ok(reveal.includes('sessionStorage'));assert.ok(reveal.includes('clearInterval(timer)'));
console.log('PASS: free routing with old model settings, no paid GPT primary, structured output, greetings vs actual asks, context preservation, response timing, stale-reply guard, reduced-motion/history-safe reveal. No provider traffic sent.');
