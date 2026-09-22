import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrainCircuit, Check, SearchCheck, Target, X } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import type { LeadJob } from "../lib/directus";
import { Button } from "./ui/button";

const terminal = new Set(["completed", "failed"]);

export function B2CJourney({ job, language }: { job: LeadJob | null; language: "en" | "ar" }) {
  const campaign = job?.b2cCampaign;
  const ar = language === "ar";
  const [open, setOpen] = useState(false);
  const status = String(campaign?.status || job?.status || "").toLowerCase();
  const done = terminal.has(status);
  const partial = status === "partial";
  const active = ["queued", "running", "sourcing", "searching", "processing"].includes(status)
    || (partial && !campaign?.stats.sourceExhausted && Number(campaign?.stats.uniqueLeads || 0) < Number(campaign?.targetLeadCount || 0));

  useEffect(() => {
    if (!job?.id || !campaign || !done || campaign.stats.uniqueLeads < 1) return;
    const key = `wasla:b2c-journey:${job.id}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "shown");
      setOpen(true);
    }
  }, [campaign, done, job?.id]);

  if (!campaign) return null;
  const explanation = campaign.explanation;
  const stages = [
    { icon: BrainCircuit, label: ar ? "كيف فكرت وصلة" : "How Wasla thought", text: explanation?.thinking },
    { icon: Target, label: ar ? "كيف فهمت المهمة" : "How Wasla understood", text: explanation?.understanding },
    { icon: SearchCheck, label: ar ? "كيف بنت جمهورك" : "How Wasla built your audience", text: explanation?.sourcing },
  ];
  const progress = Math.min(100, Math.round((campaign.stats.uniqueLeads / Math.max(1, campaign.targetLeadCount)) * 100));

  const cards = <div className="b2c-journey__cards">{stages.map(({ icon: Icon, label, text }, index) => <article key={label} className={`b2c-journey__card is-${done ? "complete" : index === 0 ? "active" : "waiting"}`}>
    <div className="b2c-journey__step"><span>{done ? <Check size={15}/> : index + 1}</span><Icon size={20}/></div>
    <strong>{label}</strong><p dir="auto">{text}</p>
  </article>)}</div>;

  return <>
    {active ? <section className="b2c-journey is-working" aria-label={ar ? "وصلة تعمل" : "Wasla is working"}>
      <div className="b2c-journey__working">
        <ThinkingOrb state="working" size={64} theme="dark" aria-label={ar ? "جارٍ العمل" : "Working"}/>
        <div><span>{ar ? "تنفيذ وكيل العملاء" : "LEAD AGENT EXECUTION"}</span><strong>{ar ? "جارٍ العمل…" : "Working…"}</strong><small>{ar ? "وصلة تتابع البحث والتحقق تلقائياً حتى اكتمال العدد المطلوب." : "Wasla is searching and verifying continuously until your requested count is complete."}</small></div>
        <b>{campaign.stats.uniqueLeads}/{campaign.targetLeadCount}</b>
      </div>
      <div className="b2c-journey__progress"><i style={{ width: `${progress}%` }}/></div>
    </section> : null}
    {open ? createPortal(<div className="b2c-journey-modal" role="dialog" aria-modal="true" aria-labelledby="b2c-journey-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="b2c-journey-modal__panel">
        <Button type="button" className="b2c-journey-modal__close" onClick={() => setOpen(false)} aria-label={ar ? "إغلاق" : "Close"}><X size={18}/></Button>
        <span className="b2c-journey-modal__eyebrow">{ar ? "اكتمل بحث B2C" : "B2C SEARCH COMPLETE"}</span>
        <h2 id="b2c-journey-title">{ar ? "هكذا وجدت وصلة عملاءك" : "Here’s how Wasla found your audience"}</h2>
        <p>{ar ? `${campaign.stats.uniqueLeads} عميل جاهز الآن في لوحة العملاء.` : `${campaign.stats.uniqueLeads} matched leads are now ready in your Leads workspace.`}</p>
        {cards}
        <footer><div><strong>{campaign.stats.postsFetched.toLocaleString()}</strong><span>{ar ? "إشارة تم تحليلها" : "signals analyzed"}</span></div><div><strong>{campaign.stats.candidatesQualified.toLocaleString()}</strong><span>{ar ? "مرشحاً مؤهلاً" : "qualified candidates"}</span></div><div><strong>{campaign.stats.uniqueLeads.toLocaleString()}</strong><span>{ar ? "عميلاً فريداً" : "distinct leads"}</span></div><Button type="button" onClick={() => setOpen(false)}>{ar ? "عرض العملاء" : "View leads"}</Button></footer>
      </div>
    </div>, document.body) : null}
  </>;
}
