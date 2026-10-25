import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, GripVertical, LoaderCircle, MessageCircle, Plus, Smartphone, X } from "lucide-react";
import type { Lead } from "../types";
import {
  apiErrorMessage,
  createLeadPipelineStage,
  fetchBusinessPersona,
  fetchLeadPipeline,
  moveLeadPipelineCard,
  subscribeLeadPipeline,
} from "../lib/directus";
import type { GrowthBrandProfile, LeadPipeline } from "../lib/directus";
import { notify } from "../lib/notify";
import { Button } from "./ui/button";
import "./lead-pipeline.css";
import { LeadDossier, leadInitials } from "./CompactLeadCRM";

type Stage = LeadPipeline["stages"][number];

function withPendingMoves(value: LeadPipeline, pending: ReadonlyMap<string, string>): LeadPipeline {
  if (!pending.size) return value;
  return {
    ...value,
    cards: [
      ...value.cards.filter((card) => !pending.has(card.lead_id)),
      ...Array.from(pending, ([lead_id, stage_id]) => ({ ...value.cards.find(card => card.lead_id === lead_id), lead_id, stage_id })),
    ],
  };
}

function stageLabel(name: string, ar: boolean) {
  if (!ar) return name;
  return ({ New: "جديد", Interested: "مهتم", "Info sent": "تم إرسال المعلومات", Sold: "تم البيع" } as Record<string, string>)[name] || name;
}

function whatsappPhone(value: string | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

function draftMessage(lead: Lead, profile: GrowthBrandProfile, ar: boolean) {
  const firstName = (lead.name || "").trim().split(/\s+/)[0];
  const service = profile.products_services?.[0] || profile.description || "";
  const value = profile.value_proposition || "";
  const company = profile.company_name || (ar ? "فريقنا" : "our team");
  const context = lead.industry || lead.location;
  if (ar) return `مرحباً ${firstName || ""}، أنا من ${company}. نقدم ${service || "خدماتنا"}${value ? `، وقيمتنا هي ${value}` : ""}. أعتقد أن هذا قد يكون مناسباً لك${context ? ` في ${context}` : ""}. هل يناسبك أن أرسل لك التفاصيل؟`;
  return `Hi ${firstName || "there"}, I'm reaching out from ${company}. We offer ${service || "our services"}${value ? `, with a focus on ${value}` : ""}. I thought this might be relevant to you${context ? ` in ${context}` : ""}. Would you like a short overview?`;
}

export function WhatsappDraft({ lead, ar, onClose, onPersona }: { lead: Lead; ar: boolean; onClose: () => void; onPersona: () => void }) {
  const [profile, setProfile] = useState<GrowthBrandProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const phone = whatsappPhone(lead.phone);

  useEffect(() => {
    let active = true;
    fetchBusinessPersona()
      .then(({ profile: next }) => {
        if (!active) return;
        setProfile(next);
        if (next.id && (next.products_services?.length || next.description)) setMessage(draftMessage(lead, next, ar));
      })
      .catch((failure) => { if (active) setError(apiErrorMessage(failure, ar ? "تعذر تحميل شخصية النشاط." : "Could not load Business Persona.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [lead, ar]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="lead-wa-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="lead-wa-dialog" role="dialog" aria-modal="true" aria-labelledby="lead-wa-title" dir={ar ? "rtl" : "ltr"}>
        <header>
          <div><span className="lead-wa-dialog__eyebrow"><MessageCircle size={15} /> WhatsApp</span><h2 id="lead-wa-title">{ar ? `رسالة إلى ${lead.name}` : `Message ${lead.name}`}</h2></div>
          <button type="button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}><X size={18} /></button>
        </header>
        {loading ? <p className="lead-wa-dialog__state"><LoaderCircle className="is-spinning" size={18} /> {ar ? "نحضّر رسالتك…" : "Preparing your message…"}</p>
          : error ? <p className="lead-wa-dialog__error">{error}</p>
          : !profile?.id || !(profile.products_services?.length || profile.description) ? <div className="lead-wa-dialog__state"><p>{ar ? "أضف معلومات نشاطك وأكّدها أولاً حتى نصيغ رسالة تعكس خدمتك." : "Add and confirm your business information first, so the message reflects your service."}</p><Button onClick={() => { onClose(); onPersona(); }}>{ar ? "افتح شخصية النشاط" : "Open Business Persona"}</Button></div>
          : <>
            <p className="lead-wa-dialog__intro">{ar ? "هذه مسودة مبنية على معلومات نشاطك. راجعها وعدّلها قبل فتح واتساب." : "A draft based on your Business Persona. Review and edit it before opening WhatsApp."}</p>
            <label htmlFor="lead-wa-message">{ar ? "رسالتك" : "Your message"}</label>
            <textarea id="lead-wa-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={7} maxLength={2000} autoFocus />
            <small>{ar ? "لن تُرسل الرسالة تلقائياً. ستراجعها داخل واتساب قبل الإرسال." : "Nothing is sent automatically. You'll review it in WhatsApp before sending."}</small>
            <footer><span dir="ltr"><Smartphone size={15} /> {lead.phone || "—"}</span><a className="lead-wa-dialog__send" href={phone && message.trim() ? `https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}` : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!phone || !message.trim()} onClick={(event) => { if (!phone || !message.trim()) event.preventDefault(); }}><MessageCircle size={17} />{ar ? "افتح واتساب" : "Open WhatsApp"}<ArrowUpRight size={15} /></a></footer>
            {!phone ? <p className="lead-wa-dialog__error">{ar ? "لا يوجد رقم هاتف صالح لهذا العميل." : "This lead does not have a valid phone number."}</p> : null}
          </>}
      </section>
    </div>,
    document.body,
  );
}

export function LeadPipelineBoard({ leads, language, onPersona, onRefreshLeads }: { leads: Lead[]; language: "en" | "ar"; onPersona: () => void; onRefreshLeads?: () => void }) {
  const ar = language === "ar";
  const [pipeline, setPipeline] = useState<LeadPipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStage, setNewStage] = useState("");
  const [adding, setAdding] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const pendingMoves = useRef(new Map<string, string>());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number; width: number; name: string; phone: string } | null>(null);
  const dragSession = useRef<{ pointerId: number; lead: Lead; startX: number; startY: number; clientX: number; clientY: number; offsetX: number; offsetY: number; width: number; moved: boolean } | null>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const [messageLead, setMessageLead] = useState<Lead | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [detailLead, setDetailLead] = useState<Lead | null>(null);

  useEffect(() => {
    let active = true;
    let fetching = false;
    let queued = false;
    let initiallyLoaded = false;
    let hasConnected = false;
    async function sync() {
      if (fetching) { queued = true; return; }
      fetching = true;
      do {
        queued = false;
        try {
          const next = await fetchLeadPipeline();
          if (active) setPipeline(withPendingMoves(next, pendingMoves.current));
        } catch (failure) {
          if (active && !initiallyLoaded) notify.danger(apiErrorMessage(failure, ar ? "تعذر تحميل مسار العملاء." : "Could not load the pipeline."));
        } finally {
          if (active && !initiallyLoaded) { initiallyLoaded = true; setLoading(false); }
        }
      } while (queued && active);
      fetching = false;
    }
    const unsubscribe = subscribeLeadPipeline((event) => {
      if (event.type === "disconnected") { setLiveStatus("reconnecting"); return; }
      if (event.type === "connected") {
        setLiveStatus("live");
        if (hasConnected) onRefreshLeads?.();
        hasConnected = true;
      }
      if (event.type === "leads-changed") onRefreshLeads?.();
      void sync();
    });
    void sync();
    return () => { active = false; unsubscribe(); };
  }, [ar, onRefreshLeads]);

  useEffect(() => () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
  }, []);

  const stageByLead = useMemo(() => new Map(pipeline?.cards.map((card) => [card.lead_id, card.stage_id]) || []), [pipeline]);
  const stages = pipeline?.stages || [];

  function stopAutoScroll() {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
  }

  function autoScroll() {
    const session = dragSession.current;
    const columns = columnsRef.current;
    if (!session?.moved || !columns) { scrollFrame.current = null; return; }
    const bounds = columns.getBoundingClientRect();
    const inset = 58;
    if (session.clientX > bounds.left && session.clientX < bounds.right && session.clientY > bounds.top && session.clientY < bounds.bottom) {
      const leftProximity = Math.max(0, inset - (session.clientX - bounds.left));
      const rightProximity = Math.max(0, inset - (bounds.right - session.clientX));
      const delta = rightProximity ? Math.ceil(rightProximity / 5) : leftProximity ? -Math.ceil(leftProximity / 5) : 0;
      if (delta) {
        columns.scrollLeft += delta;
        const target = document.elementFromPoint(session.clientX, session.clientY)?.closest<HTMLElement>("[data-pipeline-stage]");
        setDropStageId(target?.dataset.pipelineStage || null);
      }
    }
    scrollFrame.current = requestAnimationFrame(autoScroll);
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, lead: Lead) {
    if (event.button !== 0) return;
    const card = event.currentTarget.closest<HTMLElement>(".lead-pipeline__card");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragSession.current = { pointerId: event.pointerId, lead, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function trackDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.clientX = event.clientX;
    session.clientY = event.clientY;
    if (!session.moved && Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 7) return;
    session.moved = true;
    if (scrollFrame.current === null) scrollFrame.current = requestAnimationFrame(autoScroll);
    setDraggingId(session.lead.id);
    setDragPreview({ id: session.lead.id, x: event.clientX - session.offsetX, y: event.clientY - session.offsetY, width: session.width, name: session.lead.name || session.lead.company, phone: session.lead.phone || "" });
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-pipeline-stage]");
    setDropStageId(target?.dataset.pipelineStage || null);
  }

  function finishDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.moved) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-pipeline-stage]");
      const stage = stages.find((item) => item.id === target?.dataset.pipelineStage);
      if (stage) void move(session.lead, stage);
    }
    dragSession.current = null;
    stopAutoScroll();
    setDragPreview(null);
    setDraggingId(null);
    setDropStageId(null);
  }

  function cancelDrag() {
    dragSession.current = null;
    stopAutoScroll();
    setDragPreview(null);
    setDraggingId(null);
    setDropStageId(null);
  }

  async function move(lead: Lead, stage: Stage) {
    if (!pipeline || pendingMoves.current.has(lead.id) || stageByLead.get(lead.id) === stage.id || (!stageByLead.has(lead.id) && stages[0]?.id === stage.id)) return;
    pendingMoves.current.set(lead.id, stage.id);
    setPipeline((current) => current ? { ...current, cards: [...current.cards.filter((card) => card.lead_id !== lead.id), { ...current.cards.find(card => card.lead_id === lead.id), lead_id: lead.id, stage_id: stage.id }] } : current);
    setAnnouncement(ar ? `تم نقل ${lead.name} إلى ${stageLabel(stage.name, true)}` : `Moved ${lead.name} to ${stage.name}`);
    try { await moveLeadPipelineCard(lead.id, stage.id); }
    catch (failure) {
      pendingMoves.current.delete(lead.id);
      notify.danger(apiErrorMessage(failure, ar ? "تعذر نقل العميل." : "Could not move the lead."));
      try { const latest = await fetchLeadPipeline(); setPipeline(withPendingMoves(latest, pendingMoves.current)); } catch { /* The stream will retry. */ }
    } finally { pendingMoves.current.delete(lead.id); }
  }

  async function addStage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newStage.trim();
    if (name.length < 2 || adding) return;
    setAdding(true);
    try {
      const stage = await createLeadPipelineStage(name);
      setPipeline((current) => current ? { ...current, stages: [...current.stages.filter((item) => item.id !== stage.id), stage].sort((a, b) => a.position - b.position) } : current);
      setNewStage("");
      setAnnouncement(ar ? `تمت إضافة مرحلة ${name}` : `Added ${name} stage`);
    } catch (failure) { notify.danger(apiErrorMessage(failure, ar ? "تعذر إضافة المرحلة." : "Could not add the stage.")); }
    finally { setAdding(false); }
  }

  if (loading) return <div className="lead-pipeline__loading"><LoaderCircle className="is-spinning" size={19} /> {ar ? "جارٍ تحميل مسار العملاء…" : "Loading pipeline…"}</div>;
  if (!pipeline) return <div className="lead-pipeline__loading">{ar ? "مسار العملاء غير متاح الآن." : "Pipeline unavailable right now."}</div>;

  return <section className="lead-pipeline" dir={ar ? "rtl" : "ltr"} aria-label={ar ? "مسار مبيعات العملاء" : "Lead sales pipeline"}>
    <div className="lead-pipeline__heading"><div><h2>{ar ? "مسار المبيعات" : "Sales pipeline"}</h2><p>{ar ? "اسحب العميل بين المراحل أو استخدم قائمة المرحلة في البطاقة." : "Drag leads between stages, or use the stage menu on each card."}</p></div><div className="lead-pipeline__heading-side"><span className={`lead-pipeline__live${liveStatus === "live" ? " is-live" : ""}`}><i />{liveStatus === "live" ? (ar ? "مزامنة مباشرة" : "Live sync") : liveStatus === "reconnecting" ? (ar ? "إعادة الاتصال" : "Reconnecting") : (ar ? "جارٍ الاتصال" : "Connecting")}</span><span className="lead-pipeline__total">{leads.length} {ar ? "عميل" : "leads"}</span></div></div>
    <div className={`lead-pipeline__columns${draggingId ? " is-dragging" : ""}`} ref={columnsRef}>
      {stages.map((stage, index) => {
        const stageLeads = leads.filter((lead) => (stageByLead.get(lead.id) || stages[0]?.id) === stage.id);
        return <section key={stage.id} data-pipeline-stage={stage.id} className={`lead-pipeline__column${dropStageId === stage.id ? " is-drop-target" : ""}`} aria-label={stageLabel(stage.name, ar)}>
          <header><span className="lead-pipeline__step">{String(index + 1).padStart(2, "0")}</span><h3>{stageLabel(stage.name, ar)}</h3><b>{stageLeads.length}</b></header>
          <div className="lead-pipeline__stack">{stageLeads.length ? stageLeads.map((lead) => <article key={lead.id} className={`lead-pipeline__card${draggingId === lead.id ? " is-dragging" : ""}`}>
            <div className="lead-pipeline__card-top"><button className="crm-card-open" onClick={() => setDetailLead(lead)}><span className="crm-initials">{leadInitials(lead.name)}</span><strong dir="auto">{lead.name || lead.company || (ar ? "عميل بلا اسم" : "Unnamed lead")}</strong></button><button type="button" className="lead-pipeline__drag-handle" aria-label={ar ? `اسحب ${lead.name} أو اضغط لاختيار مرحلة` : `Drag ${lead.name}, or press Enter to choose a stage`} onPointerDown={(event) => startDrag(event, lead)} onPointerMove={trackDrag} onPointerUp={finishDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetailLead(lead); } }}><GripVertical size={16} /></button></div>
            {lead.company && lead.company !== lead.name ? <small dir="auto">{lead.company}</small> : null}
            <small dir="auto">{lead.location || "—"}{pipeline.cards.find(card => card.lead_id === lead.id)?.interest ? ` · ${{ interest: ar ? "مهتم" : "Interest", hot: ar ? "مهتم جداً" : "Interested – Hot", not_interested: ar ? "غير مهتم" : "Not interested" }[pipeline.cards.find(card => card.lead_id === lead.id)!.interest!]}` : ""}</small>
            <small className="compact-crm-reason" dir="auto">{lead.qualificationReason}</small>
            <div className="lead-pipeline__contact">{whatsappPhone(lead.phone) ? <a href={`tel:${lead.phone?.replace(/[^+\d]/g, "")}`} dir="ltr" onDragStart={(event) => event.preventDefault()}>{lead.phone}</a> : <span>{ar ? "لا يوجد رقم" : "No phone number"}</span>}<button type="button" disabled={!whatsappPhone(lead.phone)} onClick={() => setMessageLead(lead)} title={ar ? "صياغة رسالة واتساب" : "Draft WhatsApp message"} aria-label={ar ? `راسل ${lead.name} عبر واتساب` : `Message ${lead.name} on WhatsApp`}><MessageCircle size={16} /></button></div>
            <span className="crm-stage-indicator">{stageLabel(stage.name, ar)}</span>
          </article>) : <p className="lead-pipeline__empty">{ar ? "اسحب عميلاً إلى هنا" : "Drop a lead here"}</p>}</div>
        </section>;
      })}
      <form className="lead-pipeline__add" onSubmit={(event) => void addStage(event)}><label htmlFor="lead-pipeline-stage">{ar ? "مرحلة جديدة" : "Add a stage"}</label><input id="lead-pipeline-stage" value={newStage} onChange={(event) => setNewStage(event.target.value)} maxLength={80} placeholder={ar ? "مثال: متابعة" : "e.g. Follow-up"} /><Button type="submit" disabled={adding || newStage.trim().length < 2 || stages.length >= 12}><Plus size={15} /> {ar ? "إضافة" : "Add stage"}</Button></form>
    </div>
    <LeadDossier lead={detailLead} ar={ar} onClose={() => setDetailLead(null)} />
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {dragPreview ? createPortal(<div className="lead-pipeline__drag-ghost" aria-hidden="true" style={{ left: dragPreview.x, top: dragPreview.y, width: dragPreview.width }}><strong dir="auto">{dragPreview.name}</strong><span dir="ltr">{dragPreview.phone}</span></div>, document.body) : null}
    {messageLead ? <WhatsappDraft lead={messageLead} ar={ar} onClose={() => setMessageLead(null)} onPersona={onPersona} /> : null}
  </section>;
}
