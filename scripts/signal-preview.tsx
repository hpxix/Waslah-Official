import React from "react";
import { createRoot } from "react-dom/client";
import { SignalWorkspace } from "../src/components/SignalWorkspace";
import type { SignalRun } from "../src/lib/directus";
const run: SignalRun = {
  id: "fixture", brief: "Revenue tools for Saudi companies", topics: ["Revenue operations", "أتمتة المبيعات", "CRM adoption"], phase: "finished", status: "partial", message: "Visual test complete. These are synthetic records.", target: 30, delivered: 3, updatedAt: new Date().toISOString(),
  spend: { tregMicro: 380000, reservedMicro: 0, budgetMicro: 1000000, jevMicro: 0, judge: "agent", aiCostUsd: null, inputTokens: 2600, outputTokens: 800 },
  posts: Array.from({ length: 6 }, (_, i) => ({ id: String(i), url: "https://www.linkedin.com/posts/example", content: "What changed when our sales team stopped updating three spreadsheets and started sharing one customer view? We reduced time spent on handoffs and found the conversations that mattered. Curious how other teams in Saudi Arabia are approaching revenue operations.", author: `Example author ${i + 1}`, headline: "Revenue operations · Saudi Arabia", likes: 48 + i * 9, comments: 12 + i, date: "", relevance: i < 4 ? .92 : .34, status: i < 4 ? "relevant" : "excluded", reason: "The discussion concerns sales operations and the customer's product category.", suggested: i === 0 })),
  people: Array.from({ length: 16 }, (_, i) => ({ id: String(i), name: `Example person ${i + 1}`, headline: i % 2 ? "Head of Revenue Operations" : "Founder & CEO", url: "https://www.linkedin.com/in/example", company: "Example company", location: "Riyadh, Saudi Arabia", fit: Math.max(.4, 1.96 - i * .06), role: i % 2 ? "gtm_ops" : "founder_exec", status: i < 3 ? "saved" : "qualified", reason: "Relevant operational responsibility with engagement on a matching topic. Purchase intent has not been established.", ...(i < 3 ? { email: `example${i}@example.com` } : {}), signals: [{ post: "https://www.linkedin.com/posts/example", kind: "comment", text: "We are evaluating tools for our team." }] })),
  events: [{ phase: "discovering", message: "Found relevant professional discussions", at: "1" }, { phase: "qualifying", message: "Reviewed fit against your offer", at: "2" }, { phase: "saving", message: "Saved verified contacts", at: "3" }],
};
const loadRun = async () => run;
createRoot(document.getElementById("root")!).render(<SignalWorkspace id="fixture" language={location.search.includes("ar") ? "ar" : "en"} onBack={() => history.back()} loadRun={loadRun} />);
