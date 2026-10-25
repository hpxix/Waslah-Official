import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { Lead } from "../types";
import { apiErrorMessage, fetchBusinessPersona, fetchLeadPipeline, moveLeadPipelineCard, subscribeLeadPipeline } from "../lib/directus";
import type { GrowthBrandProfile, LeadPipeline } from "../lib/directus";
import "./compact-lead-crm.css";
import { LeadPhoneNumbers } from './LeadPhoneNumbers';

export function leadInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase() || "—";
}

function gradeLabel(lead: Lead, ar: boolean) {
  const grade = lead.liteGrade || (/b2c/i.test(lead.source) ? lead.fitScore >= 95 ? 'EXCELLENT' : lead.fitScore >= 90 ? 'VERY_HIGH' : lead.fitScore >= 85 ? 'HIGH' : 'MEDIUM' : '');
  return ({ EXCELLENT: ar ? 'ممتاز' : 'Excellent', VERY_HIGH: ar ? 'عالٍ جداً' : 'Very high', HIGH: ar ? 'عالٍ' : 'High', MEDIUM: ar ? 'متوسط' : 'Medium' } as Record<string,string>)[grade] || '';
}

function DossierCRMControls({ lead, ar }: { lead: Lead; ar: boolean }) {
  const [pipeline, setPipeline] = useState<LeadPipeline | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let revision = 0;
    async function sync() {
      const current = ++revision;
      try { const next = await fetchLeadPipeline(); if (active && current === revision) { setPipeline(next); setError(""); } }
      catch (failure) { if (active) setError(apiErrorMessage(failure, ar ? "تعذر تحميل بيانات CRM" : "Could not load CRM details")); }
    }
    void sync();
    const stop = subscribeLeadPipeline(() => void sync());
    return () => { active = false; stop(); };
  }, [ar, lead.id]);
  const card = pipeline?.cards.find(item => item.lead_id === lead.id);
  const stageId = card?.stage_id || pipeline?.stages[0]?.id || "";
  async function save(stage: string, interest?: "interest" | "hot" | "not_interested") {
    if (!stage || saving) return;
    setSaving(true);
    setError("");
    try {
      const next = await moveLeadPipelineCard(lead.id, stage, interest);
      setPipeline(previous => previous ? { ...previous, cards: [...previous.cards.filter(item => item.lead_id !== lead.id), next] } : previous);
    } catch (failure) { setError(apiErrorMessage(failure, ar ? "تعذر حفظ التغيير" : "Could not save change")); }
    finally { setSaving(false); }
  }
  return <section className="crm-dossier-controls">
    <label>{ar ? "الاهتمام" : "Interest"}<select disabled={!pipeline || saving} value={card?.interest || ""} onChange={event => void save(stageId, event.target.value as "interest" | "hot" | "not_interested")}>
      <option value="" disabled>{ar ? "غير محدد" : "Not set"}</option><option value="interest">{ar ? "مهتم" : "Interested"}</option><option value="hot">{ar ? "مهتم جداً" : "Interested – Hot"}</option><option value="not_interested">{ar ? "غير مهتم" : "Not interested"}</option>
    </select></label>
    <label>{ar ? "مرحلة CRM" : "CRM stage"}<select disabled={!pipeline || saving} value={stageId} onChange={event => void save(event.target.value)}>{!pipeline && <option value="">…</option>}{pipeline?.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
    {saving && <small role="status">{ar ? "جارٍ الحفظ…" : "Saving…"}</small>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function LeadDossier({ lead, ar, onClose }: { lead: Lead | null; ar: boolean; onClose: () => void }) {
  const [persona, setPersona] = useState<GrowthBrandProfile | null>(null);
  useEffect(() => {
    if (!lead) return;
    let active = true;
    setPersona(null);
    fetchBusinessPersona().then(({ profile }) => { if (active) setPersona(profile); }).catch(() => {});
    return () => { active = false; };
  }, [lead?.id]);
  const product = lead?.listing?.productCategoryEn && !ar ? lead.listing.productCategoryEn : lead?.listing?.product;
  return <Dialog.Root open={!!lead} onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="crm-dossier-overlay" />
    <Dialog.Content className="crm-dossier" dir={ar ? "rtl" : "ltr"}>
      <Dialog.Close className="crm-dossier-close" aria-label={ar ? "إغلاق" : "Close"}><X size={18} /></Dialog.Close>
      <span className="crm-initials">{leadInitials(lead?.name || "")}</span>
      <Dialog.Title>{lead?.name}</Dialog.Title>
      <Dialog.Description>{ar ? "معلومات العميل وخطة المحادثة" : "Contact details and conversation plan"}</Dialog.Description>
      {lead && <>
        <DossierCRMControls key={lead.id} lead={lead} ar={ar} />
        {gradeLabel(lead, ar) && <p>{ar ? 'درجة الدليل' : 'Evidence grade'}: {gradeLabel(lead, ar)}</p>}
        {lead.buyerComment && <section><h3>{ar ? 'دليل الاهتمام العام' : 'Public interest evidence'}</h3><blockquote dir="auto">{lead.buyerComment.body}</blockquote><p>{new Date(lead.buyerComment.date * 1000).toLocaleDateString(ar ? 'ar-SA' : 'en-GB')}</p><p>{ar ? 'سوق الإعلان، وليس محل الإقامة المؤكد' : 'Listing market, not verified residence'}: {lead.buyerComment.marketCity}</p>{lead.buyerComment.profileCity && <p>{ar ? 'مدينة إعلان جهة الاتصال' : 'Contact listing city'}: {lead.buyerComment.profileCity}</p>}{lead.buyerComment.sourcePostUrl && <a href={lead.buyerComment.sourcePostUrl} target="_blank" rel="noreferrer">{ar ? 'عرض الإعلان الأصلي' : 'View source listing'}</a>}</section>}
        <dl>{[
          [ar ? "المدينة" : "City", lead.location], [ar ? "الهاتف" : "Phone", lead.phone],
          [ar ? "البريد" : "Email", lead.email], [ar ? "الشركة" : "Company", lead.company],
          [ar ? "المنصب" : "Role", lead.title], [ar ? "القطاع" : "Industry", lead.industry],
          [ar ? "الموقع" : "Website", lead.website], ["LinkedIn", lead.linkedinUrl],
          [ar ? "المنتج المرتبط" : "Related product", product],
        ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl>
        {!!lead.phoneNumbers?.length && <section><h3>{ar ? 'كل أرقام التواصل' : 'All contact numbers'}</h3><LeadPhoneNumbers lead={lead} ar={ar}/></section>}
        {lead.contactKind && lead.contactKind !== 'business_contact' && <small>{ar ? 'جهة اتصال إعلان أو عقار؛ الملكية غير مؤكدة.' : 'Listing/property contact; ownership is not verified.'}</small>}
        <section><h3>{ar ? "سبب الملاءمة" : "Why this lead fits"}</h3><p dir="auto">{lead.qualificationReason || (ar ? "راجع النشاط المرتبط لتأكيد الملاءمة." : "Review the related activity to confirm fit.")}</p></section>
        <section><h3>{ar ? "كيف تبدأ البيع" : "How to approach"}</h3>
          {persona && (persona.products_services?.length || persona.description) ? <>
            <p dir="auto">{ar ? `ابدأ بعرض ${persona.products_services?.join("، ") || persona.description}.` : `Introduce ${persona.products_services?.join(", ") || persona.description}.`}</p>
            {persona.value_proposition && <p dir="auto">{persona.value_proposition}</p>}
          </> : <p>{ar ? "أضف عرضك في شخصية النشاط لتحديد زاوية البيع المناسبة." : "Add your offer in Business Persona to define a relevant sales angle."}</p>}
          <p>{ar ? "اسأل أولاً عن احتياجه الحالي، ثم اربط خدمتك بما أكّده وناقش الخطوة التالية." : "Ask about their current needs, connect your service to what they confirm, then agree on a next step."}</p>
          <small>{ar ? "النشاط العام لا يؤكد الملكية أو نية الشراء." : "Public activity does not confirm ownership or buying intent."}</small>
        </section>
      </>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

export function CompactLeadCRM({ leads, ar }: { leads: Lead[]; ar: boolean }) {
  const [pipeline, setPipeline] = useState<LeadPipeline | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let revision = 0;
    const sync = async () => {
      const current = ++revision;
      try { const next = await fetchLeadPipeline(); if (active && current === revision) { setPipeline(next); setError(""); } }
      catch (failure) { if (active) setError(apiErrorMessage(failure, ar ? "تعذر تحميل CRM" : "Could not load CRM")); }
    };
    void sync();
    const stop = subscribeLeadPipeline(() => void sync());
    return () => { active = false; stop(); };
  }, [ar]);
  return <div className="compact-crm" dir={ar ? "rtl" : "ltr"}>
    <p className="compact-crm-hint">{ar ? "انقر مرتين على العميل لتعديل الاهتمام والمرحلة وعرض خطة البيع." : "Double-click a lead to edit interest, stage, and view the sales approach."}</p>
    {error && <p role="alert">{error}</p>}
    <div className="compact-crm-scroll"><table><thead><tr>{(ar ? ["العميل", "المدينة", "الهاتف", "سبب الملاءمة", "الاهتمام", "مرحلة CRM"] : ["Lead", "City", "Phone", "Reasoning", "Interest", "CRM stage"]).map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{leads.map(lead => {
        const card = pipeline?.cards.find(item => item.lead_id === lead.id);
        const stageId = card?.stage_id || pipeline?.stages[0]?.id || "";
        const stage = pipeline?.stages.find(item => item.id === stageId);
        return <tr key={lead.id} id={lead.id} onDoubleClick={event => { if (!(event.target as HTMLElement).closest("select,a,button")) setSelected(lead); }}>
          <td><button className="compact-crm-identity" onDoubleClick={() => setSelected(lead)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(lead); } }} aria-label={ar ? `تفاصيل ${lead.name}` : `Details for ${lead.name}`}><span className="crm-initials">{leadInitials(lead.name)}</span><span><strong dir="auto">{lead.name || "—"}</strong><small>{/b2c/i.test(lead.source) ? "Lite" : "Astraeus"}</small></span></button></td>
          <td dir="auto">{lead.location || "—"}</td>
          <td><LeadPhoneNumbers lead={lead} ar={ar}/></td>
          <td>{gradeLabel(lead, ar) && <small>{gradeLabel(lead, ar)}</small>}<p className="compact-crm-reason" dir="auto" title={lead.qualificationReason}>{lead.qualificationReason || "—"}</p></td>
          <td><span className={`crm-status is-${card?.interest || "unset"}`}><i />{card?.interest === "not_interested" ? (ar ? "غير مهتم" : "Not interested") : card?.interest === "hot" ? (ar ? "مهتم جداً" : "Interested · Hot") : card?.interest === "interest" ? (ar ? "مهتم" : "Interested") : (ar ? "غير محدد" : "Not set")}</span></td>
          <td><span className="crm-stage-indicator">{stage?.name || "—"}</span></td>
        </tr>;
      })}</tbody></table></div>
    <LeadDossier lead={selected} ar={ar} onClose={() => setSelected(null)} />
  </div>;
}
