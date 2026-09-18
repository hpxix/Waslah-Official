// Relevance's official SDK 3.1 task/agent protocol, without an extra runtime dependency.
// https://relevanceai.com/docs/build/agents/build-your-agent/agent-triggers/api-trigger
// https://relevanceai.mintlify.app/sdk/tasks
import { randomUUID } from "node:crypto";

const decode = (value) => typeof value === "string" ? JSON.parse(value) : value || {};
const now = () => new Date().toISOString();
export function linkedinProfile(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !/^(?:[a-z]{2,3}\.)?linkedin\.com$/i.test(url.hostname) || !/^\/in\/[^/]+\/?$/.test(url.pathname)) return null;
    return `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`;
  } catch { return null; }
}

export class ResearchError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function relevanceRequest(env, path, body, region = env.RELEVANCE_REGION) {
  if (!env.RELEVANCE_API_KEY || !env.RELEVANCE_PROJECT_ID || !env.RELEVANCE_AGENT_ID || !/^[a-z0-9]{6}$/.test(region || "")) {
    throw new ResearchError(503, "RESEARCH_NOT_CONFIGURED", "Deep research is not configured.");
  }
  const response = await fetch(`https://api-${region}.stack.tryrelevance.com/latest${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `${env.RELEVANCE_PROJECT_ID}:${env.RELEVANCE_API_KEY}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000), redirect: "error",
  });
  if (!response.ok) throw new ResearchError(502, `RELEVANCE_${response.status}`, `Research provider returned ${response.status}. ${response.status === 401 || response.status === 403 ? "The workspace administrator must check the research credentials." : "Please try again later."}`);
  return response.json();
}

function readable(value, depth = 0) {
  if (value == null || depth > 5) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return value.map((item) => readable(item, depth + 1)).filter(Boolean).map((text) => `- ${text}`).join("\n");
  return Object.entries(value).filter(([key]) => !/^(_|api.?key|token|secret)/i.test(key)).map(([key, item]) => {
    const content = readable(item, depth + 1);
    return content ? `**${key.replace(/[_-]/g, " ")}:** ${content}` : "";
  }).filter(Boolean).join("\n\n");
}

export function normalizeResearchOutput(text) {
  let data;
  try { data = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { data = null; }
  const sections = data && typeof data === "object" && !Array.isArray(data)
    ? Object.entries(data).filter(([key]) => !/^(_|api.?key|token|secret)/i.test(key)).map(([key, value]) => ({ key, title: key.replace(/[_-]/g, " "), content: readable(value) })).filter((section) => section.content)
    : [];
  const markdown = sections.length ? "" : (typeof data === "string" ? data : text);
  const sourceText = sections.map((section) => section.content).join("\n") || markdown;
  const sources = [...new Set((sourceText.match(/https?:\/\/[^\s<>\]\)"']+/g) || []).map((url) => url.replace(/[.,;]+$/, "")))].slice(0, 60);
  return { sections, markdown, sources };
}

export function publicResearch(row) {
  if (!row) return null;
  const report = decode(row.report);
  const { _relevance, ...content } = report;
  return { id: row.id, lead_id: row.lead_id, status: row.status, updated_at: row.updated_at,
    report: content, citations: decode(row.citations), model: row.model,
    error_message: row.error_message, started_at: _relevance?.started_at,
    completed_at: _relevance?.completed_at, retry_allowed: !_relevance?.submission_uncertain };
}

export async function startResearch(database, env, organizationId, userId, lead, refresh = false) {
  const key = `${organizationId}:${lead.id}`;
  // An insert + row lock protects against simultaneous tabs, requests, and server replicas.
  const claim = await database.transaction(async (trx) => {
    const timestamp = now();
    const id = randomUUID();
    await trx("lead_research_reports").insert({ id, report_key: key, organization_id: organizationId, lead_id: lead.id, requested_by: userId, status: "idle", created_at: timestamp, updated_at: timestamp }).onConflict("report_key").ignore();
    const row = await trx("lead_research_reports").where({ report_key: key }).forUpdate().first();
    if (row.status === "researching" || (row.status === "completed" && !refresh)) return { row, claimed: false };
    if (decode(row.report)._relevance?.submission_uncertain) throw new ResearchError(409, "RESEARCH_SUBMISSION_UNCERTAIN", "The provider may already be running this research. An administrator must reconcile the existing job before another paid run.");
    const linkedin = linkedinProfile(lead.linkedin_url);
    if (!linkedin) throw new ResearchError(400, "LINKEDIN_REQUIRED", "No LinkedIn profile URL is available for this lead.");
    if (!env.RELEVANCE_API_KEY || !env.RELEVANCE_AGENT_ID) throw new ResearchError(503, "RESEARCH_NOT_CONFIGURED", "Deep research is not configured.");
    const report = { _relevance: { agent_id: env.RELEVANCE_AGENT_ID, region: env.RELEVANCE_REGION, started_at: timestamp, linkedin, submission_uncertain: true } };
    const update = { status: "researching", report: JSON.stringify(report), citations: "[]", model: "relevance-ai", error_message: null, requested_by: userId, updated_at: timestamp };
    await trx("lead_research_reports").where({ id: row.id }).update(update);
    return { row: { ...row, ...update }, claimed: true, linkedin };
  });
  if (!claim.claimed) return claim.row;
  const report = decode(claim.row.report);
  try {
    // Only the public profile URL is sent. No workspace/customer data or contacts.
    const result = await relevanceRequest(env, "/agents/trigger", { agent_id: env.RELEVANCE_AGENT_ID, message: { role: "user", content: claim.linkedin } });
    if (!result.conversation_id) throw new Error("Provider did not return a task ID");
    report._relevance = { ...report._relevance, conversation_id: result.conversation_id, submission_uncertain: false };
    const update = { report: JSON.stringify(report), updated_at: now() };
    await database("lead_research_reports").where({ id: claim.row.id }).update(update);
    return { ...claim.row, ...update };
  } catch (error) {
    // A timeout/5xx may mean the paid request was accepted: never blindly resubmit.
    const definiteRejection = /^RELEVANCE_4\d\d$/.test(error.code || "");
    report._relevance.submission_uncertain = !definiteRejection;
    const message = definiteRejection ? error.message : "Research submission could not be confirmed. It will not be automatically retried to avoid duplicate charges.";
    await database("lead_research_reports").where({ id: claim.row.id }).update({ status: "failed", report: JSON.stringify(report), error_message: message, updated_at: now() });
    throw new ResearchError(502, definiteRejection ? error.code : "RESEARCH_SUBMISSION_UNCERTAIN", message);
  }
}

export async function observeResearch(database, env, row) {
  if (!row || row.status !== "researching") return row;
  const report = decode(row.report), job = report._relevance;
  if (!job?.conversation_id) {
    if (job?.submission_uncertain && Date.now() - Date.parse(job.started_at) > 60000) {
      const update = { status: "failed", error_message: "Research submission is unconfirmed. No automatic retry was made; ask your administrator to check the existing task.", updated_at: now() };
      await database("lead_research_reports").where({ id: row.id, status: "researching" }).update(update);
      return { ...row, ...update };
    }
    return row;
  }
  // CAS throttle: one metadata poll per job per six seconds across all clients.
  if (Date.now() - Date.parse(row.updated_at) < 6000) return row;
  const updatedAt = now();
  const claimed = await database("lead_research_reports").where({ id: row.id, status: "researching", updated_at: row.updated_at }).update({ updated_at: updatedAt });
  if (!claimed) return database("lead_research_reports").where({ id: row.id }).first();
  row = { ...row, updated_at: updatedAt };
  try {
    const path = `/agents/${encodeURIComponent(job.agent_id)}/tasks/${encodeURIComponent(job.conversation_id)}`;
    const result = await relevanceRequest(env, `${path}/metadata`, undefined, job.region);
    const state = result.metadata?.conversation?.state;
    if (["running", "starting-up", "waiting-for-capacity", "queued-for-rerun", "queued-for-approval"].includes(state)) return row;
    if (["paused", "pending-approval", "escalated"].includes(state)) {
      const update = { error_message: "Research is waiting for approval in the Relevance agent. Your administrator needs to review it." };
      await database("lead_research_reports").where({ id: row.id }).update(update);
      return { ...row, ...update };
    }
    if (["timed-out", "unrecoverable", "errored-pending-approval", "cancelled"].includes(state)) throw new ResearchError(502, "RESEARCH_FAILED", "The research task did not complete. You can retry this lead.");
    if (!["completed", "idle"].includes(state)) return row;
    const messages = await relevanceRequest(env, `${path}/view`, { page_size: 1000, cursor: { after: "1970-01-01T00:00:00.000Z" } }, job.region);
    const final = (messages.results || []).find((message) => message.content?.type === "agent-message" && !message.content.generating && !message.content.thought_about_tool_calls && typeof message.content.text === "string" && message.content.text.trim());
    if (!final) throw new ResearchError(502, "RESEARCH_EMPTY", "The research task finished without a report. Check the agent's output configuration.");
    const normalized = normalizeResearchOutput(final.content.text);
    const timestamp = now();
    const update = { status: "completed", report: JSON.stringify({ ...normalized, _relevance: { ...job, completed_at: timestamp } }), citations: JSON.stringify(normalized.sources), error_message: null, updated_at: timestamp };
    await database("lead_research_reports").where({ id: row.id }).update(update);
    return { ...row, ...update };
  } catch (error) {
    // Read failures do not cause another paid trigger. Keep observing the same task.
    const terminal = ["RESEARCH_FAILED", "RESEARCH_EMPTY"].includes(error.code);
    const update = { ...(terminal ? { status: "failed" } : {}), error_message: terminal ? error.message : "Research status is temporarily unavailable. We will check the same task again.", updated_at: now() };
    await database("lead_research_reports").where({ id: row.id }).update(update);
    return { ...row, ...update };
  }
}
