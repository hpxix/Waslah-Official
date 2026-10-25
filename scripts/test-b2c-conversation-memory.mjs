import assert from 'node:assert/strict';
import { scopeB2CConversationMemory,mergeConversationTranscript } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-memory.js';
import { audienceQuestion,audienceRoute } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-audience.js';
import { createB2CAudienceTurn } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import { cleanAssistantReply,chatQuestionReply } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/chat-model.js';

const stored = {
  observations: [
    {
      conversation_id: 'old-chat',
      summary: 'iPhones and laptops in Riyadh',
      known_facts: ['iPhones', 'Riyadh'],
      answered_topics: ['product', 'location'],
      missing: [],
      outcome: 'ready_for_quantity',
    },
    {
      conversation_id: 'current-chat',
      summary: 'Pet grooming in Jeddah',
      known_facts: ['pet grooming'],
      answered_topics: ['product'],
      missing: ['location'],
      outcome: 'discovery',
    },
  ],
};

const fresh = scopeB2CConversationMemory(stored, 'brand-new-chat');
assert.deepEqual(fresh.cumulative_summaries, []);
assert.deepEqual(fresh.known_facts, []);
assert.deepEqual(fresh.answered_topics, []);
assert.deepEqual(fresh.remaining_questions, []);
assert.equal(fresh.last_outcome, null);

const existing = scopeB2CConversationMemory(stored, 'current-chat');
assert.deepEqual(existing.cumulative_summaries, ['Pet grooming in Jeddah']);
assert.deepEqual(existing.known_facts, ['pet grooming']);
assert.deepEqual(existing.remaining_questions, ['location']);
assert.equal(existing.last_outcome, 'discovery');

const missingId = scopeB2CConversationMemory(stored, null);
assert.deepEqual(missingId.cumulative_summaries, []);

console.log('B2C conversation memory is isolated by chat ID.');
const question=`assistant: ${audienceQuestion('en')}`;
const product='user: I want to find people to sell security cameras and cctv in Riyadh Saudi Arabia';
const server=[product,question];
const startup=['user: Mission context: sell to consumers','assistant: Let’s build a real audience. What product do you sell?'];
for(const answer of ["no they wouldn't","they wouldn't use shopify or such things",'NO','no thanks','لا ما عندهم متجر','ما يستخدمون سلة']){
 const merged=mergeConversationTranscript(server,[...startup,product,question,...startup,`user: ${answer}`]);
 assert.deepEqual(merged,[...server,`user: ${answer}`]);
 assert.equal(audienceRoute(answer,merged),'marketplace',answer);
 const turn=await createB2CAudienceTurn({}, {message:answer,transcript:merged,language:'en',reasoningMode:'fast'});
 assert.equal(turn.ready,true,answer);assert.equal(turn.audienceRoute,'marketplace');assert.doesNotMatch(turn.reply,/could your ideal customer/);
}
assert.equal(audienceRoute('no thanks',['assistant: Would you like a greeting?']),null);
assert.deepEqual(mergeConversationTranscript([...server,'user: no',question],[...startup,'user: NO']),[...server,'user: no',question,'user: NO'],'repeated stored turns are preserved');
assert.deepEqual(mergeConversationTranscript(['user: old','assistant: old reply'],['assistant: stale startup','user: newest']),['user: old','assistant: old reply','user: newest']);
assert.equal(cleanAssistantReply('Sure!\n\nready=false\nconfidence=80\n'), 'Sure!');
assert.doesNotMatch(cleanAssistantReply('Missing `consent_record_missing`'),/consent_record_missing/);
assert.doesNotMatch(chatQuestionReply('well what does lite do to start with','en'),/\*\*Astraeus/,'answer the selected model question specifically');
const clarification=await createB2CAudienceTurn({}, {message:'what',transcript:[product,question,"user: no they wouldn't"],language:'en',reasoningMode:'fast'});
assert.equal(clarification.conversational,true);assert.match(clarification.reply,/don’t need to repeat/);assert.doesNotMatch(clarification.reply,/Choose your lead count/);
console.log('PASS: exact failed chat replay, chronological context, natural negative answers, no repeated audience question, model-specific answers, metadata redaction and clarification without losing the brief.');
