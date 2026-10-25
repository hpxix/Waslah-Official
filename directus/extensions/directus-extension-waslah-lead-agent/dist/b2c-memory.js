export function scopeB2CConversationMemory(stored, conversationId) {
  const observations = Array.isArray(stored?.observations) ? stored.observations : [];
  const id = String(conversationId || "").trim();
  const relevant = id
    ? observations.filter((item) => String(item?.conversation_id || "") === id).slice(-20)
    : [];

  return {
    cumulative_summaries: relevant.map((item) => item.summary).filter(Boolean),
    known_facts: [...new Set(relevant.flatMap((item) => Array.isArray(item.known_facts) ? item.known_facts : []))].slice(-40),
    answered_topics: [...new Set(relevant.flatMap((item) => Array.isArray(item.answered_topics) ? item.answered_topics : []))].slice(-30),
    remaining_questions: relevant.at(-1)?.missing || [],
    last_outcome: relevant.at(-1)?.outcome || null,
  };
}

const key=line=>String(line||'').replace(/\s+/g,' ').trim().toLowerCase();
const contextLine=line=>/^\s*(?:user\s*:\s*)?(?:mission context|business context|user context|سياق المهمة|سياق المستخدم)\s*:/i.test(line);
export function mergeConversationTranscript(serverTranscript=[],clientTranscript=[]){
  const clean=lines=>lines.map(String).map(s=>s.trim()).filter(s=>s&&!contextLine(s));
  const server=clean(serverTranscript),client=clean(Array.isArray(clientTranscript)?clientTranscript:[]);
  if(!server.length)return client.slice(-100);
  // Stored turns are authoritative and chronological. Never globally dedupe:
  // identical questions/answers can occur at different points in a conversation.
  // Append only client turns newer than the last stored turn, never onboarding
  // messages that the UI prepends to every request.
  const anchor=client.map(key).lastIndexOf(key(server.at(-1)));
  const tail=anchor>=0?client.slice(anchor+1):/^user\s*:/i.test(client.at(-1)||'')?[client.at(-1)]:[];
  return [...server,...tail.filter(line=>/^user\s*:/i.test(line))].slice(-100);
}
