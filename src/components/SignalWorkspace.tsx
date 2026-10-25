import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Link2, Mail, MessageCircle, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { ThinkingOrb } from "thinking-orbs";
import { apiErrorMessage, cancelSignalRun, fetchSignalConfig, fetchSignalRun, fetchSignalRuns } from "../lib/directus";
import type { SignalRun } from "../lib/directus";
import type { IntakeState } from "../types";
import "./signal-workspace.css";

export function SignalSetup({ intake, language, onChange, onOpen }: { intake: IntakeState; language: "ar" | "en"; onChange: (patch: Partial<IntakeState>) => void; onOpen: (id: string) => void }) {
  const ar = language === "ar";
  const [config, setConfig] = useState<Awaited<ReturnType<typeof fetchSignalConfig>> | null>(null);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof fetchSignalRuns>>>([]);
  const [error, setError] = useState("");
  useEffect(() => { let gone = false; Promise.all([fetchSignalConfig(), fetchSignalRuns()]).then(([c, r]) => { if (!gone) { setConfig(c); setRuns(r); } }).catch(() => { if (!gone) setError(ar ? "تعذر تحميل إعدادات البحث" : "Could not load search settings"); }); return () => { gone = true; }; }, [ar]);
  return <div className="signal-setup" dir={ar ? "rtl" : "ltr"}>
    <div className="signal-setup__title"><Search size={16} /><strong>{ar ? "ابحث من خلال النقاشات" : "Find buyers through conversations"}</strong><span>LinkedIn · Saudi Arabia</span></div>
    <label>{ar ? "طريقة البحث" : "Search approach"}<select value={intake.signalSource || "signal"} onChange={(e) => onChange({ signalSource: e.target.value as "signal" | "business" })}>
      <option value="signal">{ar ? "إشارات مهنية · بريد عمل موثّق" : "Professional signals · verified work emails"}</option>
      <option value="business">{ar ? "البحث عن الشركات الحالي" : "Existing business discovery"}</option>
    </select></label>
    {intake.signalSource !== "business" && <>
      <label>{ar ? "المواضيع المقترحة — موضوع في كل سطر" : "Suggested topics — one per line"}<textarea rows={3} value={(intake.signalTopics || []).join("\n")} onChange={(e) => onChange({ signalTopics: e.target.value.split("\n").slice(0, 6) })} /></label>
      <label><Link2 size={14} />{ar ? "منشورات تقترحها (اختياري)" : "Suggest posts (optional)"}<textarea rows={2} placeholder="https://www.linkedin.com/posts/…" value={(intake.signalPostUrls || []).join("\n")} onChange={(e) => onChange({ signalPostUrls: e.target.value.split("\n").filter(Boolean).slice(0, 8) })} /></label>
      <p>{ar ? "سنبحث عن نقاشات مرتبطة بعملك، ونراجع الأدوار والموقع قبل حفظ بريد العمل. لا نضمن العدد الكامل أو أرقام الهاتف." : "We discover relevant posts and check business fit, Saudi location and work emails. Full counts and phone numbers are not guaranteed."}</p>
      {config && <small>{config.enabled ? (ar ? "جاهز للبدء · ١٠ أرصدة لكل عميل جديد محفوظ" : "Ready · 10 credits per newly saved lead") : (ar ? "البحث غير مفعّل بعد" : "Signal search is not configured yet")}</small>}
      {error && <small role="status">{error}</small>}
    </>}
    {!!runs.length && <label>{ar ? "افتح بحثاً سابقاً" : "Browse a previous run"}<select value="" onChange={(e) => { if (e.target.value) onOpen(e.target.value); }}><option value="">{ar ? "اختر البحث" : "Choose a run"}</option>{runs.map((r) => <option key={r.id} value={r.id}>{r.query.slice(0, 60)} · {r.delivered}/{r.target} · {r.status}</option>)}</select></label>}
  </div>;
}

export function SignalWorkspace({ id, language, onBack, loadRun = fetchSignalRun }: { id: string; language: "ar" | "en"; onBack: () => void; loadRun?: typeof fetchSignalRun }) {
  const ar = language === "ar";
  const [run, setRun] = useState<SignalRun | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState("all");
  const [role, setRole] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduceMotion(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => {
    let gone = false; let timer: ReturnType<typeof setTimeout>;
    setRun(null); setSelected(null);
    async function load() {
      try { const data = await loadRun(id); if (gone) return; setRun(data); setError(""); if (["queued", "sourcing"].includes(data.status)) timer = setTimeout(load, 2000); }
      catch (e) { if (!gone) { setError(apiErrorMessage(e, ar ? "انقطع التحديث المباشر. أعد المحاولة." : "Live updates disconnected. Retry to reconnect.")); } }
    }
    void load(); return () => { gone = true; clearTimeout(timer); };
  }, [id, retry, ar, loadRun]);
  const running = run && ["queued", "sourcing"].includes(run.status);
  const people = [...(run?.people || [])].filter((p) => (role === "all" || p.role === role) && (filter === "all" || (filter === "saved" ? p.status === "saved" : (p.fit || 0) >= 1.5))).sort((a, b) => (b.fit || 0) - (a.fit || 0));
  const person = run?.people.find((p) => p.id === selected);
  const stages = ar ? ["اكتشاف النقاشات", "تقييم الملاءمة", "التحقق من التواصل"] : ["Discover discussions", "Assess business fit", "Verify contacts"];
  const phaseText: Record<string, string> = ar ? { discovering: "البحث عن نقاشات مرتبطة بعملك", reviewing_posts: "تقييم صلة المنشورات بعرضك", reading_signals: "قراءة التفاعل المهني", qualifying: "تقييم الملاءمة والأدوار", checking_location: "التحقق من الموقع في السعودية", enriching: "البحث عن بريد العمل والتحقق منه", saving: "تم حفظ عميل جديد", finished: "اكتمل البحث", stopped: "توقف البحث" } : { discovering: "Finding relevant discussions", reviewing_posts: "Reviewing post relevance", reading_signals: "Reading professional engagement", qualifying: "Assessing business fit", checking_location: "Confirming Saudi locations", enriching: "Finding and verifying work emails", saving: "Saving a verified lead", finished: "Search finished", stopped: "Search stopped" };
  async function stop() { setStopping(true); try { await cancelSignalRun(id); setRetry((v) => v + 1); toast.info(ar ? "تم إيقاف البحث" : "Search stopped"); } catch (e) { toast.error(apiErrorMessage(e, "Could not stop search")); } finally { setStopping(false); } }
  return <section className="signal-workspace" dir={ar ? "rtl" : "ltr"}>
    <header className="signal-toolbar"><button onClick={onBack}>{ar ? <ArrowRight size={17} /> : <ArrowLeft size={17} />}{ar ? "المحادثة" : "Chat"}</button><div className="signal-path">{stages.map((s, i) => <span key={s}>{i > 0 && <span aria-hidden="true">→</span>}{s}</span>)}</div>{running && <button disabled={stopping} onClick={stop}>{ar ? "إيقاف البحث" : "Stop run"}</button>}</header>
    {error && <div role="alert" className="signal-reconnect">{error}<button onClick={() => setRetry((v) => v + 1)}>{ar ? "إعادة الاتصال" : "Reconnect"}</button></div>}
    <div className="signal-columns">
      <aside className="signal-summary">
        <div className="signal-orb-line"><span className="ops-chat-search-activity__orb" aria-hidden="true"><ThinkingOrb state={running ? "working" : "breathing"} paused={!running || reduceMotion} size={64} theme="dark" /></span><div><small>{ar ? "بحث مباشر" : "LIVE SEARCH"}</small><h2 aria-live="polite">{phaseText[run?.phase || "discovering"]}</h2></div></div>
        <strong className="signal-total">{run?.delivered || 0}<span> / {run?.target || "—"}</span></strong>
        <p>{ar ? "عملاء محفوظون" : "Leads saved"}</p>
        <progress value={run?.delivered || 0} max={run?.target || 1} aria-label={ar ? "العملاء المحفوظون" : "Saved leads"} />
        {[[ar ? "المنشورات" : "Posts explored", run?.posts.length || 0], [ar ? "منشورات مرتبطة" : "Relevant posts", run?.posts.filter((p) => p.status === "relevant").length || 0], [ar ? "أشخاص" : "People discovered", run?.people.length || 0], [ar ? "ملاءمة مرتفعة" : "Strong-fit people", run?.people.filter((p) => (p.fit || 0) >= 1.5).length || 0], [ar ? "بريد موثّق محفوظ" : "Verified emails saved", run?.delivered || 0]].map(([label, count]) => <div className="signal-stat" key={label}><span>{label}</span><strong>{count}</strong></div>)}
        <p className="signal-note">{ar ? "التقييم تقديري وليس احتمال شراء. التفاعل وحده لا يعني نية الشراء." : "Fit scores are estimates, not purchase probabilities. Engagement alone does not establish buying intent."}</p>
        {run && <div className="signal-spend"><div className="signal-stat"><span>{ar ? "استخدام البحث" : "Search usage"}</span><strong>${(run.spend.tregMicro / 1e6).toFixed(3)}</strong></div><div className="signal-stat"><span>{ar ? "دفعات المراجعة الإضافية" : "Additional review batches"}</span><strong>{run.spend.jevCalls || 0}</strong></div><p>{ar ? "حد بيانات البحث" : "Search data cap"}: ${(run.spend.budgetMicro / 1e6).toFixed(2)}{run.spend.reservedMicro > 0 && ` · $${(run.spend.reservedMicro / 1e6).toFixed(3)} pending`}</p><p>{ar ? "مراجعة الملاءمة بالذكاء الاصطناعي تُحتسب بشكل منفصل؛ التكلفة الإجمالية غير متاحة حالياً." : "AI fit review is billed separately; a complete cost total is not currently available."}</p></div>}
        {run && !running && <p role="status">{ar ? `انتهى البحث مع حفظ ${run.delivered} من ${run.target}. قد يتوقف البحث عند حدود البيانات أو الميزانية أو عند تعذر التحقق.` : run.message}</p>}
        <div className="signal-events">{run?.events.slice(-8).map((e, i) => <div key={`${e.at}-${i}`}><i /><span>{ar ? phaseText[e.phase] : e.message}</span></div>)}</div>
      </aside>
      <main className="signal-posts"><div className="signal-section-title"><h2>{ar ? "النقاشات ذات الصلة" : "Relevant conversations"}</h2><span>{run?.posts.length || 0}</span></div><div className="signal-topics">{run?.topics.map((t) => <span key={t}>{t}</span>)}</div>
        <div className="signal-post-grid">{run?.posts.map((p) => <article className={`signal-post is-${p.status}`} key={p.id}>
          <div className="signal-post__score">{p.relevance === null ? (ar ? "بانتظار المراجعة" : "Awaiting review") : `${ar ? "الملاءمة" : "Relevance"} ${Math.round(p.relevance * 100)}/100`}{p.suggested && <span>{ar ? "اقتراحك" : "Suggested by you"}</span>}</div>
          <div className="signal-author"><span>{p.author.slice(0, 1) || "in"}</span><div><strong>{p.author}</strong><small>{p.headline}</small></div></div>
          <details><summary>{p.content.slice(0, 240)}{p.content.length > 240 ? "…" : ""}</summary><p>{p.content}</p></details>
          {p.reason && <p className="signal-post__reason">{p.reason}</p>}
          <footer><span>♡ {p.likes} · <MessageCircle size={12} /> {p.comments}</span><a href={p.url} target="_blank" rel="noreferrer">{ar ? "المنشور" : "View post"}<ExternalLink size={12} /></a></footer>
        </article>)}</div>
        {!run?.posts.length && <div className="signal-empty"><Search /><p>{running || !run ? (ar ? "نبحث عن نقاشات مرتبطة بعرضك…" : "Looking for conversations relevant to your offer…") : (ar ? "لم يتم العثور على منشورات" : "No posts found")}</p></div>}
      </main>
      <aside className="signal-people"><div className="signal-section-title"><h2>{ar ? "الأشخاص والتواصل" : "People & contacts"}</h2><Users size={18} /></div>
        <div className="signal-filters"><select aria-label={ar ? "التصفية حسب المستوى" : "Filter by tier"} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">{ar ? "الجميع" : "All people"}</option><option value="qualified">{ar ? "ملاءمة مرتفعة" : "Strong fit"}</option><option value="saved">{ar ? "محفوظ" : "Saved leads"}</option></select><select aria-label={ar ? "الدور" : "Role"} value={role} onChange={(e) => setRole(e.target.value)}><option value="all">{ar ? "كل الأدوار" : "All roles"}</option>{[...new Set(run?.people.map((p) => p.role))].map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}</select></div>
        {people.map((p) => <button key={p.id} className={`signal-person${selected === p.id ? " is-selected" : ""}`} onClick={() => setSelected(p.id)}><span className="signal-fit">{p.fit === null ? "—" : p.fit.toFixed(2)}</span><span><strong>{p.name}</strong><small>{p.email || p.headline}</small></span>{p.status === "saved" && <Mail size={14} />}</button>)}
        {!people.length && <div className="signal-empty"><Users /><p>{ar ? "ستظهر الملفات المهنية هنا عند اكتشافها" : "Professional profiles will appear as they’re discovered"}</p></div>}
      </aside>
    </div>
    {person && <div className="signal-inspector" role="region" aria-label={ar ? "تفاصيل العميل" : "Lead details"}>
      <button className="signal-inspector__close" aria-label={ar ? "إغلاق" : "Close"} onClick={() => setSelected(null)}><X size={18} /></button>
      <h2>{person.name}</h2><p>{person.headline}</p><p>{person.company} · {person.location}</p>
      <strong>{ar ? "الملاءمة" : "Fit"}: {person.fit?.toFixed(2)} / 2</strong><p>{person.reason}</p>
      <small>{ar ? "تقييم ذكاء اصطناعي تقديري · ليس احتمالاً معايراً" : "AI estimate · not a calibrated probability"}</small>
      <h3>{ar ? "أدلة التفاعل" : "Engagement evidence"}</h3>
      {person.signals.map((s, i) => <blockquote key={i}><small>{s.kind}</small><p>{s.text}</p><a href={s.post} target="_blank" rel="noreferrer">{ar ? "المنشور المصدر" : "Source post"}</a></blockquote>)}
      {person.email && <a href={`mailto:${person.email}`}>{person.email}</a>}
      {person.provider && <p><small>{ar ? "مصدر التحقق" : "Enrichment provider"}: {person.provider} · {person.emailStatus}</small></p>}
      <p>{person.status.replaceAll("_", " ")}</p><a href={person.url} target="_blank" rel="noreferrer">LinkedIn ↗</a>
    </div>}
  </section>;
}
