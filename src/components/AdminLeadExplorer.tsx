import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  ExternalLink,
  Grid2X2,
  LayoutList,
  Linkedin,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  Rows3,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiErrorMessage, fetchAdminLeads } from "../lib/directus";
import type { AdminLead, AdminLeadResponse } from "../lib/directus";
import { useLanguage } from "../i18n";

type ViewMode = "grid" | "list" | "table";

const emptyResponse: AdminLeadResponse = {
  data: [],
  meta: { page: 1, limit: 24, total: 0, pages: 1, enrichment: {}, sources: [] },
};

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function LeadImage({ lead, company = false }: { lead: AdminLead; company?: boolean }) {
  const src = company ? lead.company_image_url : lead.person_image_url;
  const label = company ? lead.company : lead.name || lead.company;
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={`admin-lead-image${company ? " is-company" : ""}`}>{initials(label)}</span>;
  return <img className={`admin-lead-image${company ? " is-company" : ""}`} src={src} alt="" onError={() => setFailed(true)} />;
}

export function AdminLeadExplorer({ onInventoryLoaded }: { onInventoryLoaded?: (leads: AdminLead[], total: number) => void }) {
  const { language } = useLanguage();
  const [response, setResponse] = useState<AdminLeadResponse>(emptyResponse);
  const [search, setSearch] = useState("");
  const [enrichment, setEnrichment] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("enrichment_score");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ViewMode>("grid");
  const [selected, setSelected] = useState<AdminLead | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setPage(1), [enrichment, search, sort, source]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError("");
      fetchAdminLeads({ search, enrichment, source, sort, page, limit: 24 })
        .then((result) => {
          if (controller.signal.aborted) return;
          setResponse(result);
          onInventoryLoaded?.(result.data, result.meta.total);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(apiErrorMessage(cause, language === "ar" ? "تعذر تحميل مخزون العملاء." : "Could not load the lead inventory."));
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 260);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [enrichment, language, onInventoryLoaded, page, search, sort, source]);

  const sourceOptions = useMemo(() => response.meta.sources, [response.meta.sources]);
  const enrichedCount = response.meta.enrichment.enriched || 0;

  return (
    <section className="admin-inventory" aria-label={language === "ar" ? "مخزون العملاء الإداري" : "Admin lead inventory"}>
      <header className="admin-inventory__heading">
        <div>
          <span><BadgeCheck size={14} /> {language === "ar" ? "وصول إداري" : "Admin access"}</span>
          <h1>{language === "ar" ? "مخزون العملاء" : "Lead inventory"}</h1>
          <p>{language === "ar" ? `${response.meta.total} سجل في Directus · ${enrichedCount} مكتمل الإثراء` : `${response.meta.total} records in Directus · ${enrichedCount} fully enriched`}</p>
        </div>
        <div className="admin-inventory__stats">
          <span><strong>{response.meta.total}</strong>{language === "ar" ? "كل العملاء" : "All leads"}</span>
          <span><strong>{enrichedCount}</strong>{language === "ar" ? "مثرى" : "Enriched"}</span>
          <span><strong>{response.meta.enrichment.partial || 0}</strong>{language === "ar" ? "جزئي" : "Partial"}</span>
        </div>
      </header>

      <div className="admin-inventory__toolbar">
        <label className="admin-inventory__search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "ar" ? "ابحث بالاسم، الشركة، البريد، الجوال، القطاع أو المدينة" : "Search name, company, email, phone, industry, or city"} />
          {search && <button onClick={() => setSearch("")} aria-label={language === "ar" ? "مسح البحث" : "Clear search"}><X size={14} /></button>}
        </label>
        <select value={enrichment} onChange={(event) => setEnrichment(event.target.value)} aria-label={language === "ar" ? "حالة الإثراء" : "Enrichment status"}>
          <option value="all">{language === "ar" ? "كل حالات الإثراء" : "All enrichment"}</option>
          <option value="enriched">{language === "ar" ? "مثرى بالكامل" : "Enriched"}</option>
          <option value="partial">{language === "ar" ? "إثراء جزئي" : "Partial"}</option>
          <option value="raw">{language === "ar" ? "بيانات خام" : "Raw"}</option>
        </select>
        <select value={source} onChange={(event) => setSource(event.target.value)} aria-label={language === "ar" ? "المصدر" : "Source"}>
          <option value="all">{language === "ar" ? "كل المصادر" : "All sources"}</option>
          {sourceOptions.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label={language === "ar" ? "الترتيب" : "Sort leads"}>
          <option value="enrichment_score">{language === "ar" ? "الأعلى إثراء" : "Highest enrichment"}</option>
          <option value="fit_score">{language === "ar" ? "الأعلى ملاءمة" : "Highest fit"}</option>
          <option value="newest">{language === "ar" ? "الأحدث" : "Newest"}</option>
          <option value="company">{language === "ar" ? "اسم الشركة" : "Company name"}</option>
        </select>
        <div className="admin-inventory__views" role="group" aria-label={language === "ar" ? "طريقة العرض" : "View mode"}>
          <button className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")} data-tooltip={language === "ar" ? "شبكة" : "Grid"} aria-label={language === "ar" ? "عرض شبكة" : "Grid view"}><Grid2X2 size={15} /></button>
          <button className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} data-tooltip={language === "ar" ? "قائمة" : "List"} aria-label={language === "ar" ? "عرض قائمة" : "List view"}><LayoutList size={15} /></button>
          <button className={view === "table" ? "is-active" : ""} onClick={() => setView("table")} data-tooltip={language === "ar" ? "جدول" : "Table"} aria-label={language === "ar" ? "عرض جدول" : "Table view"}><Rows3 size={15} /></button>
        </div>
      </div>

      {error && <div className="admin-inventory__error">{error}</div>}
      {busy && !response.data.length ? <div className="admin-inventory__loading"><LoaderCircle className="is-spinning" size={22} /> {language === "ar" ? "تحميل المخزون..." : "Loading inventory..."}</div> : null}
      {!busy && !response.data.length ? <div className="admin-inventory__loading"><Search size={22} /> {language === "ar" ? "لا توجد نتائج مطابقة." : "No matching leads found."}</div> : null}

      <div className={`admin-leads is-${view}${busy ? " is-loading" : ""}`}>
        {view === "table" && (
          <div className="admin-lead-row is-head" aria-hidden="true">
            <span>{language === "ar" ? "الشخص" : "Person"}</span><span>{language === "ar" ? "الشركة" : "Company"}</span><span>{language === "ar" ? "التواصل" : "Contact"}</span><span>{language === "ar" ? "الإثراء" : "Enrichment"}</span><span>{language === "ar" ? "المصدر" : "Source"}</span><span />
          </div>
        )}
        {response.data.map((lead) => view === "grid"
          ? <LeadCard key={lead.id} lead={lead} language={language} onOpen={() => setSelected(lead)} />
          : <LeadRow key={lead.id} lead={lead} language={language} onOpen={() => setSelected(lead)} table={view === "table"} />)}
      </div>

      <footer className="admin-inventory__pagination">
        <span>{language === "ar" ? `صفحة ${response.meta.page} من ${response.meta.pages}` : `Page ${response.meta.page} of ${response.meta.pages}`}</span>
        <div>
          <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} aria-label={language === "ar" ? "الصفحة السابقة" : "Previous page"}>{language === "ar" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</button>
          <strong>{page}</strong>
          <button onClick={() => setPage((current) => Math.min(response.meta.pages, current + 1))} disabled={page >= response.meta.pages} aria-label={language === "ar" ? "الصفحة التالية" : "Next page"}>{language === "ar" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</button>
        </div>
      </footer>

      {selected && <LeadDetail lead={selected} language={language} onClose={() => setSelected(null)} />}
    </section>
  );
}

function LeadCard({ lead, language, onOpen }: { lead: AdminLead; language: "ar" | "en"; onOpen: () => void }) {
  return (
    <article className="admin-lead-card" onClick={onOpen}>
      <header>
        <div className="admin-lead-card__identity"><LeadImage lead={lead} /><span className="admin-company-image"><LeadImage lead={lead} company /></span></div>
        <span className={`admin-enrichment is-${lead.enrichment_status}`}><i /> {lead.enrichment_score}%</span>
      </header>
      <div className="admin-lead-card__name"><strong>{lead.name || (language === "ar" ? "سجل شركة" : "Company record")}</strong><span>{lead.title || lead.seniority || (language === "ar" ? "صانع قرار غير محدد" : "Decision maker not identified")}</span></div>
      <div className="admin-lead-card__company"><Building2 size={13} /><span><strong>{lead.company}</strong><small>{lead.industry || (language === "ar" ? "قطاع غير مصنف" : "Unclassified industry")}</small></span></div>
      <div className="admin-lead-card__signals">
        {lead.email && <span><Mail size={12} /> {lead.email}</span>}
        {lead.phone && <span><Phone size={12} /> {lead.phone}</span>}
        {lead.location && <span><MapPin size={12} /> {lead.location}</span>}
      </div>
      <footer><span><Sparkles size={12} /> {lead.enrichment_status}</span><button onClick={(event) => { event.stopPropagation(); onOpen(); }}>{language === "ar" ? "فتح" : "Open"}{language === "ar" ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}</button></footer>
    </article>
  );
}

function LeadRow({ lead, language, onOpen, table }: { lead: AdminLead; language: "ar" | "en"; onOpen: () => void; table: boolean }) {
  return (
    <button className={`admin-lead-row${table ? " is-table" : ""}`} onClick={onOpen}>
      <span className="admin-lead-row__person"><LeadImage lead={lead} /><span><strong>{lead.name || (language === "ar" ? "سجل شركة" : "Company record")}</strong><small>{lead.title || lead.seniority || "-"}</small></span></span>
      <span className="admin-lead-row__company"><LeadImage lead={lead} company /><span><strong>{lead.company}</strong><small>{lead.industry || "-"}</small></span></span>
      <span className="admin-lead-row__contact"><strong>{lead.email || lead.phone || "-"}</strong><small>{lead.location || "-"}</small></span>
      <span className={`admin-enrichment is-${lead.enrichment_status}`}><i /> {lead.enrichment_score}%</span>
      <span className="admin-lead-row__source">{lead.source}</span>
      {language === "ar" ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
    </button>
  );
}

function LeadDetail({ lead, language, onClose }: { lead: AdminLead; language: "ar" | "en"; onClose: () => void }) {
  return (
    <div className="admin-lead-detail" role="dialog" aria-modal="true" aria-label={lead.name || lead.company}>
      <button className="admin-lead-detail__backdrop" onClick={onClose} aria-label={language === "ar" ? "إغلاق" : "Close"} />
      <aside>
        <header><span>{language === "ar" ? "ملف العميل" : "Lead profile"}</span><button onClick={onClose} aria-label={language === "ar" ? "إغلاق" : "Close"}><X size={17} /></button></header>
        <div className="admin-lead-detail__hero">
          <div><LeadImage lead={lead} /><span className="admin-company-image"><LeadImage lead={lead} company /></span></div>
          <h2>{lead.name || lead.company}</h2>
          <p>{lead.title || lead.seniority || (language === "ar" ? "سجل شركة" : "Company record")}</p>
          <span className={`admin-enrichment is-${lead.enrichment_status}`}><i /> {lead.enrichment_status} · {lead.enrichment_score}%</span>
        </div>
        <section><h3>{language === "ar" ? "الشركة" : "Company"}</h3><div className="admin-detail-company"><LeadImage lead={lead} company /><span><strong>{lead.company}</strong><small>{lead.industry || "-"}</small></span></div></section>
        <section className="admin-detail-grid">
          <div><Mail size={13} /><span>{language === "ar" ? "البريد" : "Email"}</span><strong>{lead.email || "-"}</strong></div>
          <div><Phone size={13} /><span>{language === "ar" ? "الجوال" : "Phone"}</span><strong>{lead.phone || "-"}</strong></div>
          <div><MapPin size={13} /><span>{language === "ar" ? "الموقع" : "Location"}</span><strong>{lead.location || "-"}</strong></div>
          <div><Users size={13} /><span>{language === "ar" ? "حجم الشركة" : "Company size"}</span><strong>{lead.company_size || "-"}</strong></div>
        </section>
        <section><h3>{language === "ar" ? "ملخص الإثراء" : "Enrichment summary"}</h3><p>{lead.enrichment_summary}</p><div className="admin-detail-signals">{lead.enrichment_signals.map((signal) => <span key={signal}>{signal.replaceAll("_", " ")}</span>)}</div></section>
        <footer>
          {lead.linkedin_url && <a href={lead.linkedin_url} target="_blank" rel="noreferrer"><Linkedin size={14} /> LinkedIn<ExternalLink size={12} /></a>}
          {lead.website && <a href={lead.website} target="_blank" rel="noreferrer"><Building2 size={14} /> {language === "ar" ? "الموقع" : "Website"}<ExternalLink size={12} /></a>}
        </footer>
      </aside>
    </div>
  );
}
