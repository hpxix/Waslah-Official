import { Avatar } from "@heroui/react";
import { Building2, ExternalLink, Linkedin, LoaderCircle, Mail, Phone, Sparkles, X, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CompanyResearch, Lead } from "../types";
import "./lead-intelligence.css";

function safeLink(value?: string) {
  try { const url = new URL(value || ""); return ["https:", "http:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
function hasProfile(lead: Lead) {
  try { const url = new URL(lead.linkedinUrl || ""); return url.protocol === "https:" && /^(?:[a-z]{2,3}\.)?linkedin\.com$/i.test(url.hostname) && /^\/in\/[^/]+\/?$/.test(url.pathname); } catch { return false; }
}
function CompanyAvatar({ lead }: { lead: Lead }) {
  return <Avatar className="intel-avatar"><Avatar.Image src={safeLink(lead.companyImageUrl)} alt={lead.company}/><Avatar.Fallback><Building2 size={17}/></Avatar.Fallback></Avatar>;
}
function Contacts({ lead }: { lead: Lead }) {
  return <div className="intel-contacts">
    {lead.email && !lead.email.includes("*") && <a href={`mailto:${lead.email}`} title={lead.email} aria-label={`Email ${lead.name || lead.company}`}><Mail size={15}/><span dir="ltr">{lead.email}</span></a>}
    {lead.phone && !lead.phone.includes("*") && <a href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`} title={lead.phone} aria-label={`Call ${lead.name || lead.company}`}><Phone size={15}/><span dir="ltr">{lead.phone}</span></a>}
    {hasProfile(lead) && <a href={safeLink(lead.linkedinUrl)} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><Linkedin size={15}/></a>}
  </div>;
}

export function B2BProspectTable({ leads, research, language, researchingLeadId, focusedLeadId, onResearch }: {
  leads: Lead[]; research: CompanyResearch[]; language: "en" | "ar"; researchingLeadId: string | null; focusedLeadId: string | null; onResearch: (lead: Lead) => void;
}) {
  const ar = language === "ar";
  const labels = ar ? ["العميل", "إجراءات سريعة", "المنصب", "الشركة", "الهاتف", "البريد", "الموقع", "الموظفون", "القطاع", "البحث"] : ["Lead", "Quick actions", "Title", "Company", "Phone", "Email", "Location", "Employees", "Industry", "Research"];
  return <div className="prospects-wrap" dir={ar ? "rtl" : "ltr"}><Table className="prospects-table"><TableHeader><TableRow>{labels.map((label, i) => <TableHead key={label} className={`prospect-col-${i}`}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
    {leads.map((lead) => {
      const report = research.find((item) => item.leadId === lead.id);
      const status = report?.status || lead.researchStatus;
      const running = status === "researching" || researchingLeadId === lead.id;
      const complete = status === "completed";
      const missing = !hasProfile(lead) && !complete;
      const title = missing ? (ar ? "لا يوجد رابط LinkedIn لهذا العميل" : "No LinkedIn profile is available for this lead") : running ? (ar ? "جارٍ البحث — يمكنك متابعة عملك" : "Researching — you can keep working") : complete ? (ar ? "فتح البحث المحفوظ" : "Open saved research") : status === "failed" ? (report?.errorMessage || (ar ? "فشل البحث، أعد المحاولة" : "Research failed. Retry")) : ar ? "بحث معمّق عن العميل" : "Deep research your lead";
      return <TableRow key={lead.id} id={lead.id} className={focusedLeadId === lead.id ? "is-search-focus" : ""}>
        <TableCell className="prospect-col-0"><strong dir="auto">{lead.name || "—"}</strong>{hasProfile(lead) && <a className="prospect-linkedin" href={safeLink(lead.linkedinUrl)} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><Linkedin size={13}/></a>}</TableCell>
        <TableCell className="prospect-col-1"><Contacts lead={lead}/></TableCell>
        <TableCell className="prospect-col-2" dir="auto">{lead.title || "—"}</TableCell>
        <TableCell className="prospect-col-3"><div className="intel-identity"><CompanyAvatar lead={lead}/><span><strong dir="auto">{lead.company || "—"}</strong><small className="mobile-title" dir="auto">{lead.title}</small></span></div></TableCell>
        <TableCell className="prospect-col-4" dir="ltr">{lead.phone || "—"}</TableCell>
        <TableCell className="prospect-col-5" dir="ltr">{lead.email || "—"}</TableCell>
        <TableCell className="prospect-col-6" dir="auto">{lead.location || "—"}</TableCell>
        <TableCell className="prospect-col-7">{lead.employees || "—"}</TableCell>
        <TableCell className="prospect-col-8" dir="auto">{lead.industry || "—"}</TableCell>
        <TableCell className="prospect-col-9"><span className="intel-tooltip" tabIndex={0} aria-label={title} data-tooltip={title}><Button type="button" className={`intel-research is-${status || "idle"}`} disabled={running || missing || (status === "failed" && report?.retryAllowed === false)} aria-label={title} onClick={() => onResearch(lead)}>{running ? <LoaderCircle className="is-spinning" size={16}/> : complete ? <ArrowUpRight size={16}/> : <Sparkles size={16}/>}</Button></span></TableCell>
      </TableRow>;
    })}
  </TableBody></Table></div>;
}

function reportSections(report: CompanyResearch) {
  if (report.sections?.length) return report.sections;
  const entries: Array<[string, string | undefined]> = [
    ["Executive summary", report.companyOverview || report.companyDescription],
    ["Market position", report.marketPosition], ["Performance", report.performanceSummary],
    ["Strengths", report.strengths.join("\n\n")], ["Opportunities", report.opportunities.join("\n\n")],
    ["Buying signals", report.hiringAndGrowthSignals?.join("\n\n")],
    ["Recent activity", report.recentNews?.map((item) => [item.title, item.summary, item.url].filter(Boolean).join("\n\n")).join("\n\n")],
    ["Risks", report.risks?.join("\n\n")], ["Outreach strategy", report.pitchStrategy?.executiveSummary],
    ["Conversation starters", report.pitchStrategy?.openingMessage],
  ];
  return entries.filter((entry) => entry[1]).map(([title, content], i) => ({ key: String(i), title, content: content! }));
}
function excerpt(value: string, max = 230) {
  const text = value.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, "") + "…" : text;
}

export function ResearchedLeads({ leads, research, language, onOpen }: { leads: Lead[]; research: CompanyResearch[]; language: "en" | "ar"; onOpen: (lead: Lead) => void }) {
  const ar = language === "ar";
  const [query, setQuery] = useState("");
  const completed = leads.flatMap((lead) => {
    const report = research.find((item) => item.leadId === lead.id && item.status === "completed");
    return report && !/b2c/i.test(lead.source) && [lead.name, lead.company, lead.title].join(" ").toLowerCase().includes(query.toLowerCase()) ? [{ lead, report }] : [];
  });
  return <section className="core-leads intelligence-library" dir={ar ? "rtl" : "ltr"}>
    <header className="core-leads__heading"><div><span className="core-eyebrow">{ar ? "معرفة تتحول إلى فرص" : "CONTEXT FOR YOUR NEXT CONVERSATION"}</span><h1>{ar ? "العملاء المبحوثون" : "Researched leads"}</h1><p>{ar ? "أبحاث محفوظة لعملائك. فتحها لا يبدأ بحثاً جديداً." : "Saved intelligence for your leads. Opening a report never starts another research run."}</p></div></header>
    <input className="intel-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث بالاسم أو الشركة…" : "Search name or company…"} aria-label={ar ? "البحث في التقارير" : "Search reports"}/>
    {!completed.length && <div className="core-leads__empty"><Sparkles size={26}/><h2>{ar ? "لا توجد أبحاث مكتملة بعد" : "No completed research yet"}</h2><p>{ar ? "ابدأ بحث عميل B2B من قسم العملاء. سيظهر تقريره هنا عند اكتماله." : "Research a B2B lead from Leads. Its completed report will appear here."}</p></div>}
    <div className="intel-grid">{completed.map(({ lead, report }) => {
      const sections = reportSections(report);
      const signals = sections.filter((section) => /signal|priorit|opportunit|pain|angle|buying|إشار|فرص|أولو/i.test(section.title)).slice(0, 3);
      return <article className="intel-card" key={lead.id}>
        <div className="intel-card-top"><div className="intel-identity"><CompanyAvatar lead={lead}/><div><h2 dir="auto">{lead.company || lead.name}</h2><p dir="auto">{[lead.name, lead.title].filter(Boolean).join(" · ")}</p></div></div><span className="intel-status">{ar ? "مكتمل" : "Ready"}</span></div>
        <Contacts lead={lead}/><p className="intel-excerpt" dir="auto">{excerpt(sections[0]?.content || report.markdown || "")}</p>
        {signals.map((section) => <div className="intel-signal" key={section.key} dir="auto"><strong>{section.title}</strong><p>{excerpt(section.content, 150)}</p></div>)}
        <footer><time>{new Date(report.updatedAt).toLocaleDateString(ar ? "ar-SA" : "en-GB")}</time><Button className="core-button" onClick={() => onOpen(lead)}>{ar ? "فتح التقرير" : "Open dossier"}<ArrowUpRight size={15}/></Button></footer>
      </article>;
    })}</div>
  </section>;
}

export function ResearchDossier({ lead, report, language, onClose }: { lead: Lead; report: CompanyResearch; language: "en" | "ar"; onClose: () => void }) {
  const ar = language === "ar", ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; ref.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]') || []);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);
  const sections = reportSections(report);
  const highlights = [
    { label: ar ? "أبرز النتائج" : "Strongest findings", section: sections.find((s) => /summary|overview|finding|ملخص|نظرة/i.test(s.title)) },
    { label: ar ? "الفرصة" : "Sales opportunity", section: sections.find((s) => /opportunit|signal|priorit|فرص|إشار/i.test(s.title)) },
    { label: ar ? "مدخل المحادثة" : "Conversation angle", section: sections.find((s) => /angle|starter|outreach|personaliz|تواصل|محادث/i.test(s.title)) },
  ].filter((item) => item.section);
  const sources = [...new Set(report.sources.map(safeLink).filter((url): url is string => Boolean(url)))];
  return <div className="intel-dossier-backdrop"><div className="intel-dossier" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={ar ? "بحث العميل" : "Lead research dossier"} dir={ar ? "rtl" : "ltr"}>
    <div className="intel-dossier-bar"><span><Sparkles size={15}/> {ar ? "ملف العميل" : "LEAD INTELLIGENCE"}</span><Button className="core-icon-button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}><X size={20}/></Button></div>
    <header className="intel-dossier-hero"><div className="intel-identity"><CompanyAvatar lead={lead}/><div><span className="intel-status">{ar ? "بحث محفوظ" : "Saved research"}</span><h1 dir="auto">{lead.company || lead.name}</h1><p dir="auto">{[lead.name, lead.title, lead.location].filter(Boolean).join(" · ")}</p></div></div><Contacts lead={lead}/><time>{new Date(report.updatedAt).toLocaleString(ar ? "ar-SA" : "en-GB")}</time></header>
    {highlights.length > 0 && <div className="intel-highlights">{highlights.map(({ label, section }) => <article key={label}><span>{label}</span><p dir="auto">{excerpt(section!.content, 320)}</p></article>)}</div>}
    <div className="intel-dossier-body">{sections.map((section, index) => <section className="intel-report-section" key={section.key}><span className="intel-section-number">{String(index + 1).padStart(2, "0")}</span><div><h2 dir="auto">{section.title}</h2><div dir="auto" className="intel-prose"><ReactMarkdown>{section.content}</ReactMarkdown></div></div></section>)}
      {report.markdown && <div className="intel-prose intel-markdown" dir="auto"><ReactMarkdown>{report.markdown}</ReactMarkdown></div>}
      {sources.length > 0 && <section className="intel-sources"><h2>{ar ? "المصادر" : "Sources"}</h2><div>{sources.map((url, i) => <a href={url} key={url} target="_blank" rel="noopener noreferrer"><span>{String(i + 1).padStart(2, "0")}</span><span dir="ltr">{new URL(url).hostname}<small>{url}</small></span><ExternalLink size={14}/></a>)}</div></section>}
    </div>
  </div></div>;
}
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
import { Button } from "./ui/button";
