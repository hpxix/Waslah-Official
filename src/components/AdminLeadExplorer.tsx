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
  Target,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiErrorMessage, fetchAdminAccounts, fetchAdminLeads } from "../lib/directus";
import type { AdminAccount, AdminLead, AdminLeadResponse } from "../lib/directus";
import { useLanguage } from "../i18n";
import { sourceLabel } from "../lib/sourceLabel";

type ViewMode = "grid" | "list" | "table";

const emptyResponse: AdminLeadResponse = {
  data: [],
  meta: { page: 1, limit: 100, total: 0, pages: 1, enrichment: {}, sources: [], queries: [] },
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

export function AdminLeadExplorer({ onInventoryLoaded, onResearch }: { onInventoryLoaded?: (leads: AdminLead[], total: number) => void; onResearch?: (lead: AdminLead) => void }) {
  const { language } = useLanguage();
  const [response, setResponse] = useState<AdminLeadResponse>(emptyResponse);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [account, setAccount] = useState("all");
  const [request, setRequest] = useState("all");
  const [search, setSearch] = useState("");
  const [enrichment, setEnrichment] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("enrichment_score");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<AdminLead | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setPage(1), [account, enrichment, request, search, sort, source]);

  useEffect(() => {
    fetchAdminAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError("");
      fetchAdminLeads({ account, request, search, enrichment, source, sort, page, limit: 100 })
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
  }, [account, enrichment, language, onInventoryLoaded, page, request, search, sort, source]);

  const sourceOptions = useMemo(() => response.meta.sources, [response.meta.sources]);
  const enrichedCount = response.meta.enrichment.enriched || 0;
  const selectedAccount = useMemo(() => accounts.find((item) => item.user_id === account), [account, accounts]);

  return (
    <section className="admin-inventory" aria-label={language === "ar" ? "مخزون العملاء الإداري" : "Admin lead inventory"}>
      <header className="admin-inventory__heading">
        <div>
          <span><BadgeCheck size={14} /> {language === "ar" ? "وصول إداري" : "Admin access"}</span>
          <h1>{language === "ar" ? "مخزون العملاء" : "Lead inventory"}</h1>
          <p>{selectedAccount
            ? language === "ar"
              ? `${response.meta.total} عميلاً تم تسليمهم إلى ${selectedAccount.email}`
              : `${response.meta.total} leads delivered to ${selectedAccount.email}`
            : language === "ar"
              ? `${response.meta.total} عملية تسليم عبر كل الحسابات · ${enrichedCount} مكتمل الإثراء`
              : `${response.meta.total} deliveries across every account · ${enrichedCount} fully enriched`}</p>
        </div>
        <div className="admin-inventory__stats">
          <span><strong>{response.meta.total}</strong>{language === "ar" ? "كل العملاء" : "All leads"}</span>
          <span><strong>{enrichedCount}</strong>{language === "ar" ? "مثرى" : "Enriched"}</span>
          <span><strong>{response.meta.enrichment.partial || 0}</strong>{language === "ar" ? "جزئي" : "Partial"}</span>
        </div>
      </header>

      <div className="admin-inventory__toolbar">
        <select className="admin-inventory__account" value={account} onChange={(event) => { setAccount(event.target.value); setRequest("all"); }} aria-label={language === "ar" ? "تصفية حسب الحساب" : "Filter by account"}>
          <option value="all">{language === "ar" ? "كل الحسابات" : "All accounts"}</option>
          {accounts.filter((item) => item.generated_leads > 0).map((item) => (
            <option key={item.user_id} value={item.user_id}>{[item.first_name, item.last_name].filter(Boolean).join(" ") || item.email} · {item.organization_name} · {item.generated_leads} {language === "ar" ? "عميل" : "leads"}</option>
          ))}
        </select>
        <select className="admin-inventory__query" value={request} onChange={(event) => setRequest(event.target.value)} disabled={account === "all"} aria-label={language === "ar" ? "اختر طلباً من الحساب" : "Choose a query from this account"}>
          <option value="all">{account === "all" ? (language === "ar" ? "اختر الحساب أولاً" : "Choose an account first") : (language === "ar" ? "كل طلبات هذا الحساب" : "All queries from this account")}</option>
          {response.meta.queries.map((item) => (
            <option key={item.id} value={item.id}>{item.campaign_name || item.prompt} · {item.delivered_count}/{item.requested_count}</option>
          ))}
        </select>
        <label className="admin-inventory__search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "ar" ? "ابحث بالعميل، الحساب، طلب العميل، البريد أو الجوال" : "Search lead, account, prompt, email, or phone"} />
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
          {sourceOptions.map((item) => <option key={item.value} value={item.value}>{sourceLabel(item.value, language)} ({item.count})</option>)}
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
            <span>{language === "ar" ? "العميل" : "Lead"}</span><span>{language === "ar" ? "الحساب" : "Account"}</span><span>{language === "ar" ? "طلب العميل" : "Prompt"}</span><span>{language === "ar" ? "التواصل" : "Contact"}</span><span>{language === "ar" ? "المصدر" : "Source"}</span><span />
          </div>
        )}
        {response.data.map((lead) => view === "grid"
          ? <LeadCard key={lead.delivery_id} lead={lead} language={language} onOpen={() => setSelected(lead)} onResearch={onResearch} />
          : <LeadRow key={lead.delivery_id} lead={lead} language={language} onOpen={() => setSelected(lead)} onResearch={onResearch} table={view === "table"} />)}
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

function LeadCard({ lead, language, onOpen, onResearch }: { lead: AdminLead; language: "ar" | "en"; onOpen: () => void; onResearch?: (lead: AdminLead) => void }) {
  return (
    <article className="admin-lead-card" id={lead.id} onClick={onOpen}>
      <header>
        <div className="admin-lead-card__identity"><LeadImage lead={lead} /><span className="admin-company-image"><LeadImage lead={lead} company /></span></div>
        <span className={`admin-enrichment is-${lead.enrichment_status}`}><i /> {lead.enrichment_score}%</span>
      </header>
      <div className="admin-lead-card__name"><strong>{lead.name || (language === "ar" ? "سجل شركة" : "Company record")}</strong><span>{lead.title || lead.seniority || (language === "ar" ? "صانع قرار غير محدد" : "Decision maker not identified")}</span></div>
      <div className="admin-lead-card__company"><Building2 size={13} /><span><strong>{lead.company}</strong><small>{lead.industry || (language === "ar" ? "قطاع غير مصنف" : "Unclassified industry")}</small></span></div>
      <div className="admin-lead-card__assignment">
        <span><Users size={12} /><strong>{[lead.account_first_name, lead.account_last_name].filter(Boolean).join(" ") || lead.user_email || "—"}</strong><small>{lead.user_email}</small></span>
        <span><Target size={12} /><strong>{lead.campaign_name || (language === "ar" ? "طلب العميل" : "Lead prompt")}</strong><small>{lead.purpose || "—"}</small></span>
      </div>
      <div className="admin-lead-card__signals">
        {lead.email && <span><Mail size={12} /> {lead.email}</span>}
        {lead.phone && <span><Phone size={12} /> {lead.phone}</span>}
        {lead.location && <span><MapPin size={12} /> {lead.location}</span>}
      </div>
      <footer><span className={`lead-type-indicator is-${/b2c/i.test(lead.source) ? "b2c" : "b2b"}`}>{/b2c/i.test(lead.source) ? "B2C" : "B2B"}</span><button disabled={/b2c/i.test(lead.source)} onClick={(event) => { event.stopPropagation(); onResearch?.(lead); }}><Search size={13} />{language === "ar" ? "بحث" : "Research"}</button><button onClick={(event) => { event.stopPropagation(); onOpen(); }}>{language === "ar" ? "فتح" : "Open"}{language === "ar" ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}</button></footer>
    </article>
  );
}

function LeadRow({ lead, language, onOpen, onResearch, table }: { lead: AdminLead; language: "ar" | "en"; onOpen: () => void; onResearch?: (lead: AdminLead) => void; table: boolean }) {
  return (
    <div className={`admin-lead-row${table ? " is-table" : ""}`} id={lead.id} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
      <span className="admin-lead-row__person"><LeadImage lead={lead} /><span><strong>{lead.name || (language === "ar" ? "سجل شركة" : "Company record")}</strong><small>{lead.title || lead.seniority || "-"}</small></span></span>
      <span className="admin-lead-row__account"><strong>{[lead.account_first_name, lead.account_last_name].filter(Boolean).join(" ") || lead.user_email || "-"}</strong><small>{lead.user_email || lead.organization_name || "-"}</small></span>
      <span className="admin-lead-row__purpose"><strong>{lead.campaign_name || (language === "ar" ? "طلب العميل" : "Lead prompt")}</strong><small>{lead.purpose || "-"}</small></span>
      <span className="admin-lead-row__contact"><strong>{lead.email || lead.phone || "-"}</strong><small>{lead.location || "-"}</small></span>
      <span className={`admin-enrichment is-${lead.enrichment_status}`}><i /> {lead.enrichment_score}%</span>
      <span className="admin-lead-row__source"><span className={`lead-type-indicator is-${/b2c/i.test(lead.source) ? "b2c" : "b2b"}`}>{/b2c/i.test(lead.source) ? "B2C" : "B2B"}</span></span>
      <button className="admin-lead-row__research" disabled={/b2c/i.test(lead.source)} onClick={(event) => { event.stopPropagation(); onResearch?.(lead); }} aria-label={language === "ar" ? "بحث العميل" : "Research lead"}><Search size={14} /></button>
    </div>
  );
}

function LeadDetail({ lead, language, onClose }: { lead: AdminLead; language: "ar" | "en"; onClose: () => void }) {
  const isB2C = /b2c/i.test(lead.source);
  const accountName = [lead.account_first_name, lead.account_last_name].filter(Boolean).join(" ") || lead.user_email || "-";
  const deliveredAt = lead.delivered_at ? new Date(lead.delivered_at).toLocaleString(language === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : "-";
  return createPortal(
    <div className="admin-lead-detail" role="dialog" aria-modal="true" aria-label={lead.name || lead.company}>
      <button className="admin-lead-detail__backdrop" onClick={onClose} aria-label={language === "ar" ? "إغلاق" : "Close"} />
      <aside>
        <header><span><small>{language === "ar" ? "سجل تم تسليمه" : "Delivered lead record"}</small><strong>{language === "ar" ? "تفاصيل العميل" : "Lead details"}</strong></span><button onClick={onClose} aria-label={language === "ar" ? "إغلاق" : "Close"}><X size={17} /></button></header>
        <div className="admin-lead-detail__hero">
          <div className="admin-lead-detail__identity"><div><LeadImage lead={lead} /><span className="admin-company-image"><LeadImage lead={lead} company /></span></div><span><h2>{lead.name || lead.company}</h2><p>{lead.title || lead.seniority || (language === "ar" ? "عميل محتمل" : "Qualified prospect")}</p><small>{lead.company} · {lead.location || (language === "ar" ? "الموقع غير محدد" : "Location unavailable")}</small></span></div>
          <div className="admin-lead-detail__badges"><span className={`lead-type-indicator is-${isB2C ? "b2c" : "b2b"}`}>{isB2C ? "B2C" : "B2B"}</span><span className={`admin-enrichment is-${lead.enrichment_status}`}><i /> {lead.enrichment_status} · {lead.enrichment_score}%</span></div>
        </div>
        <div className="admin-lead-detail__content">
          <section className="admin-lead-detail__prompt"><h3><Target size={14} />{language === "ar" ? "طلب العميل الأصلي" : "Original account prompt"}</h3><p>{lead.purpose || "-"}</p></section>
          <section><h3><Users size={14} />{language === "ar" ? "سياق التسليم" : "Delivery context"}</h3><dl className="admin-detail-list"><div><dt>{language === "ar" ? "الحساب" : "Account"}</dt><dd>{accountName}<small>{lead.user_email}</small></dd></div><div><dt>{language === "ar" ? "الحملة" : "Campaign"}</dt><dd>{lead.campaign_name || "-"}</dd></div><div><dt>{language === "ar" ? "الكمية المطلوبة" : "Requested"}</dt><dd>{lead.requested_leads || "-"}</dd></div><div><dt>{language === "ar" ? "تاريخ التسليم" : "Delivered"}</dt><dd>{deliveredAt}</dd></div></dl></section>
          <section><h3><Phone size={14} />{language === "ar" ? "بيانات التواصل" : "Contact details"}</h3><div className="admin-detail-contact"><a className={lead.phone ? "" : "is-disabled"} href={lead.phone ? `tel:${lead.phone}` : undefined}><Phone size={16} /><span><small>{language === "ar" ? "الجوال" : "Phone"}</small><strong>{lead.phone || "-"}</strong></span></a><a className={lead.email ? "" : "is-disabled"} href={lead.email ? `mailto:${lead.email}` : undefined}><Mail size={16} /><span><small>{language === "ar" ? "البريد" : "Email"}</small><strong>{lead.email || "-"}</strong></span></a><div><MapPin size={16} /><span><small>{language === "ar" ? "الموقع" : "Location"}</small><strong>{lead.location || "-"}</strong></span></div><div><Building2 size={16} /><span><small>{language === "ar" ? "القطاع" : "Industry"}</small><strong>{lead.industry || "-"}</strong></span></div></div></section>
          <section><h3><BadgeCheck size={14} />{language === "ar" ? "لماذا تم تأهيله" : "Why this lead qualified"}</h3><p>{lead.enrichment_summary || (language === "ar" ? "لا يوجد ملخص إضافي." : "No additional qualification summary.")}</p><div className="admin-detail-signals">{lead.enrichment_signals.map((signal) => <span key={signal}>{signal.replaceAll("_", " ")}</span>)}</div></section>
        </div>
        <footer>
          {lead.source_reference && <a href={lead.source_reference} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {language === "ar" ? "فتح دليل المصدر" : "Open source evidence"}</a>}
          {lead.linkedin_url && <a href={lead.linkedin_url} target="_blank" rel="noreferrer"><Linkedin size={14} /> LinkedIn<ExternalLink size={12} /></a>}
          {lead.website && <a href={lead.website} target="_blank" rel="noreferrer"><Building2 size={14} /> {language === "ar" ? "الموقع" : "Website"}<ExternalLink size={12} /></a>}
          <span>{sourceLabel(lead.source, language)}</span>
        </footer>
      </aside>
    </div>,
    document.getElementById("wasla-modal-root") ?? document.body,
  );
}
