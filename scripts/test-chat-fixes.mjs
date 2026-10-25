import assert from 'node:assert/strict';
import {analyzeWebsite} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/website-analysis.js';
import {chatQuestionReply,smallTalkReply} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/chat-model.js';
import {createB2CDiscoveryTurn} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import {isSmallTalkTurn} from '../src/lib/chatBehavior.ts';
import {readWebsite} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/website-reader.js';
for(const text of ['Heyyyy','Hiiii!']){assert.ok(smallTalkReply(text));assert.ok(isSmallTalkTurn(text));}
assert.match(chatQuestionReply('what are you','en'),/I’m Wasla/);
assert.match(chatQuestionReply('can you identify the perfect market to target if i sent you a website of my company?','en'),/send it over/i);
assert.equal(chatQuestionReply('I sell cameras in Riyadh','en'),null);
let calls=0,retries=0;
const pages=[{url:'https://example.com/',text:'Example business provides office furniture.',title:'Example'}];
const result=await analyzeWebsite({OPENROUTER_API_KEY:'fixture'},pages,'en',undefined,{onRetry:async()=>retries++,fetcher:async(_url,options)=>{
 const body=JSON.parse(options.body);assert.equal(body.model,'openrouter/free');assert.ok(body.max_tokens>=6000);calls++;
 return {ok:true,json:async()=>({choices:[{message:{content:calls===1?'':JSON.stringify({facts:[],questions:['What do you sell?']})},finish_reason:calls===1?'length':'stop'}]})};
}});
assert.equal(calls,2);assert.equal(retries,1);assert.equal(result.questions.length,1);
calls=0;await assert.rejects(()=>analyzeWebsite({OPENROUTER_API_KEY:'fixture'},pages,'en',undefined,{fetcher:async()=>{calls++;return {ok:false,status:401,json:async()=>({})};}}),/401/);assert.equal(calls,1);
let savedPages;
await assert.rejects(()=>readWebsite({url:'https://example.com/',progress:async()=>{},fetchPage:async url=>({url,status:200,html:url.endsWith('robots.txt')?'':`<p>${'We provide office furniture. '.repeat(8)}</p>`}),onPages:async pages=>savedPages=pages,analyze:async()=>{throw new Error('provider unavailable');}}),/provider unavailable/);
assert.ok(savedPages[0].text.includes('office furniture'),'keep fetched evidence even if analysis fails');
const original=globalThis.fetch;
globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({reply:'Yes—send your website. I can explain the audiences it supports and what still needs confirming.',ready:false,summary:'Website capability question',missing:['offer'],knownFacts:[],answeredTopics:[],confidence:10,businessUnderstanding:{}})}}]})});
try{const turn=await createB2CDiscoveryTurn({OPENROUTER_API_KEY:'fixture'},{message:'Can you understand my website?',language:'en',reasoningMode:'high'});assert.match(turn.reply,/send your website/);assert.equal(turn.ready,false);}finally{globalThis.fetch=original;}
console.log('PASS: incomplete-analysis retry, free model only, no auth/quota retry, retained page evidence, energetic greetings, capability answers, and no qualification overwrite.');
