import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Layers3,
  LoaderCircle,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import type { CompanyResearch, Lead } from "../types";
import {
  apiErrorMessage,
  continueB2CCampaign,
  fetchLeadRunLeads,
  fetchLeadRuns,
  isLeadJobRunning,
} from "../lib/directus";
import type { LeadJob, LeadRun } from "../lib/directus";
import { exportLeadsCsv, exportLeadsXlsx } from "../lib/leadExport";
import { notify } from "../lib/notify";
import { B2BProspectTable } from "./LeadIntelligence";
import { B2CJourney } from "./B2CJourney";
import { WaslaBrand } from "./WaslaBrand";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import "./core-leads.css";

const isB2C = (lead: Lead) => /b2c/i.test(lead.source);

function matchesLeadSearch(lead: Lead, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  const searchable = [
    lead.name, lead.phone, lead.email, lead.company, lead.title, lead.location,
    lead.industry, lead.source, lead.status, lead.fitScore, lead.qualificationReason,
    lead.website, lead.linkedinUrl, ...lead.tags,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  if (searchable.includes(normalizedQuery)) return true;
  const queryDigits = normalizedQuery.replace(/\D/g, "");
  return queryDigits.length >= 3 && String(lead.phone || "").replace(/\D/g, "").includes(queryDigits);
}

function LeadKpis({ leads, ar }: { leads: Lead[]; ar: boolean }) {
  const b2c = leads.filter(isB2C).length;
  const phones = leads.filter((lead) => lead.phone).length;
  const highFit = leads.filter(
    (lead) => lead.status === "qualified" || lead.fitScore >= 80,
  ).length;
  const points = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(today);
      date.setDate(date.getDate() - 13 + index);
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      return {
        date: date.toISOString(),
        leads: leads.filter((lead) => {
          const time = Date.parse(lead.lastSeenUpdateAt);
          return time >= date.getTime() && time < next.getTime();
        }).length,
      };
    });
  }, [leads]);
  const metrics = [
    [
      ar ? "إجمالي العملاء" : "Total leads",
      leads.length,
      UsersRound,
      ar ? "كل الفرص المحفوظة" : "All saved opportunities",
    ],
    [
      ar ? "عملاء الأفراد" : "B2C leads",
      b2c,
      Target,
      ar ? "إشارات شراء فعلية" : "Observable buying signals",
    ],
    [
      ar ? "تغطية الهاتف" : "Phone coverage",
      `${leads.length ? Math.round((phones / leads.length) * 100) : 0}%`,
      Phone,
      ar ? `${phones} رقم متاح` : `${phones} callable contacts`,
    ],
    [
      ar ? "جاهزون للتواصل" : "High-fit leads",
      highFit,
      Sparkles,
      ar ? "أعلى ملاءمة للبيع" : "Best opportunities to contact",
    ],
  ] as const;
  return (
    <section className="lead-kpis">
      <div className="lead-kpis__cards">
        {metrics.map(([label, value, Icon, note]) => (
          <Card className="lead-kpi-card" key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <Badge variant="outline">
                <Icon size={12} />
                {ar ? "مباشر" : "Live"}
              </Badge>
              <CardTitle>
                {typeof value === "number"
                  ? value.toLocaleString(ar ? "ar-SA" : "en-US")
                  : value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span>{note}</span>
              <ArrowUpRight size={14} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="lead-kpis__chart">
        <CardHeader>
          <div>
            <CardTitle>{ar ? "نشاط العملاء" : "Lead activity"}</CardTitle>
            <CardDescription>
              {ar
                ? "آخر 14 يوماً حسب آخر تحديث"
                : "Last 14 days by recent activity"}
            </CardDescription>
          </div>
          <Badge variant="secondary">{leads.length}</Badge>
        </CardHeader>
        <CardContent>
          <div className="lead-kpis__chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={points}
                margin={{ top: 12, right: 4, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="coreLeadActivity"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#82f5a8" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="#82f5a8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#ffffff10" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString(ar ? "ar-SA" : "en-GB", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  axisLine={false}
                  tickLine={false}
                  minTickGap={42}
                  tick={{ fontSize: 10, fill: "#777" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#111",
                    border: "1px solid #ffffff1c",
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="#82f5a8"
                  strokeWidth={1.6}
                  fill="url(#coreLeadActivity)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function PitchModal({
  lead,
  offer,
  ar,
  onClose,
}: {
  lead: Lead | null;
  offer: string;
  ar: boolean;
  onClose: () => void;
}) {
  const [thinking, setThinking] = useState(true);
  useEffect(() => {
    if (!lead) return;
    setThinking(true);
    const timer = window.setTimeout(() => setThinking(false), 650);
    return () => window.clearTimeout(timer);
  }, [lead]);
  if (!lead) return null;
  const lastSeen = Date.parse(lead.lastSeenUpdateAt);
  const days = Number.isFinite(lastSeen)
    ? Math.max(0, Math.floor((Date.now() - lastSeen) / 86_400_000))
    : null;
  const recent =
    days === null
      ? ar
        ? "نشاط حديث"
        : "Recent activity"
      : days === 0
        ? ar
          ? "نشاط اليوم"
          : "Activity today"
        : ar
          ? `نشاط قبل ${days} يوم`
          : `Activity ${days} day${days === 1 ? "" : "s"} ago`;
  const signal =
    lead.qualificationReason ||
    lead.tags.slice(0, 3).join(", ") ||
    lead.industry;
  const pitch = ar
    ? `مرحباً ${lead.name}، لاحظت نشاطك الأخير المرتبط بـ ${lead.industry || "هذا المجال"} في ${lead.location || "السعودية"}. نحن نقدم ${offer}، ويبدو أنه مناسب لاحتياجك الحالي لأن ${signal}. هل يناسبك اتصال سريع لأشاركك الطريقة الأنسب للاستفادة منه؟`
    : `Hi ${lead.name || "there"}, I noticed your recent activity around ${lead.industry || "this category"} in ${lead.location || "Saudi Arabia"}. We provide ${offer}, and it looks relevant to what you may need right now because ${signal}. Would you be open to a quick call so I can show you the most useful option?`;
  return createPortal(
    <div
      className="b2c-pitch-modal"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="b2c-pitch-modal__panel" dir={ar ? "rtl" : "ltr"}>
        <Button
          variant="ghost"
          size="icon"
          className="b2c-pitch-modal__close"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
        <div className="b2c-pitch-modal__brand">
          <span>
            <WaslaBrand variant="symbol" inverse />
          </span>
          <i>B2C+</i>
          <strong>WASLA AI</strong>
        </div>
        <span className="b2c-pitch-modal__eyebrow">
          {ar ? "ذكاء المبيعات للأفراد" : "B2C SALES INTELLIGENCE"}
        </span>
        <h2>
          {ar
            ? `أفضل طريقة للتواصل مع ${lead.name}`
            : `The best way to approach ${lead.name}`}
        </h2>
        {thinking ? (
          <div className="b2c-pitch-modal__thinking">
            <LoaderCircle className="is-spinning" size={20} />
            <span>
              {ar
                ? "وصلة تحلل إشارة العميل وتبني عرضاً مناسباً…"
                : "Wasla is reading the lead signal and shaping your pitch…"}
            </span>
          </div>
        ) : (
          <>
            <div className="b2c-pitch-modal__context">
              <div>
                <span>{ar ? "الموقع" : "City"}</span>
                <strong>{lead.location || "—"}</strong>
              </div>
              <div>
                <span>{ar ? "حداثة الإشارة" : "Signal recency"}</span>
                <strong>{recent}</strong>
              </div>
              <div>
                <span>{ar ? "ما تبيعه" : "Your offer"}</span>
                <strong>{offer}</strong>
              </div>
            </div>
            <article className="b2c-pitch-modal__pitch">
              <span>
                <Sparkles size={15} />
                {ar ? "عرض مقترح" : "Suggested pitch"}
              </span>
              <p dir="auto">{pitch}</p>
            </article>
            <div className="b2c-pitch-modal__reason">
              <span>{ar ? "لماذا الآن" : "Why now"}</span>
              <p dir="auto">{signal}</p>
            </div>
            <footer>
              {lead.phone ? (
                <Button asChild>
                  <a
                    dir="ltr"
                    href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}
                  >
                    <Phone size={15} />
                    {lead.phone}
                  </a>
                </Button>
              ) : null}
              <Button variant="outline" onClick={onClose}>
                {ar ? "تم" : "Done"}
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function CoreLeadsWorkspace({
  leads,
  research,
  language,
  job,
  loading,
  error,
  focusedLeadId,
  researchingLeadId,
  onRefresh,
  onChat,
  onResearch,
}: {
  leads: Lead[];
  research: CompanyResearch[];
  language: "en" | "ar";
  job: LeadJob | null;
  loading: boolean;
  error: string;
  focusedLeadId: string | null;
  researchingLeadId: string | null;
  onRefresh: () => void | Promise<void>;
  onChat: () => void;
  onResearch: (lead: Lead) => void;
}) {
  const ar = language === "ar";
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [runs, setRuns] = useState<LeadRun[]>([]),
    [selectedRunId, setSelectedRunId] = useState<string | null>(null),
    [runLeads, setRunLeads] = useState<Lead[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(true),
    [runsError, setRunsError] = useState(""),
    [continuing, setContinuing] = useState(false),
    [pitchLead, setPitchLead] = useState<Lead | null>(null);
  const autoContinuedCampaign = useRef<string | null>(null);
  const running = isLeadJobRunning(job);
  const partialSearching = Boolean(
    job?.status.toLowerCase() === "partial" &&
    job.b2cCampaign &&
    !job.b2cCampaign.stats.sourceExhausted &&
    job.b2cCampaign.stats.uniqueLeads < job.b2cCampaign.targetLeadCount,
  );
  const activelySearching = running || continuing || partialSearching;
  const sourceLeads = runLeads ?? leads;
  const filtered = useMemo(() => sourceLeads.filter(
    (lead) =>
      (filter === "all" || (isB2C(lead) ? "b2c" : "b2b") === filter) &&
      matchesLeadSearch(lead, query),
  ), [filter, query, sourceLeads]);
  const visibleRuns =
      filter === "all" ? runs : runs.filter((item) => item.type === filter),
    selectedRun = runs.find((run) => run.id === selectedRunId);
  const pitchOffer =
    selectedRun?.title ||
    job?.b2cCampaign?.intent.productName ||
    (ar ? "عرضك الحالي" : "your current offer");

  useEffect(() => {
    let cancelled = false;
    setRunsLoading(true);
    fetchLeadRuns()
      .then((items) => {
        if (!cancelled) {
          setRuns(items);
          setRunsError("");
        }
      })
      .catch((failure) => {
        if (!cancelled)
          setRunsError(
            apiErrorMessage(
              failure,
              ar ? "تعذر تحميل عمليات البحث." : "Could not load lead runs.",
            ),
          );
      })
      .finally(() => {
        if (!cancelled) setRunsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job?.id, job?.result_count, ar]);
  useEffect(() => {
    const campaign = job?.b2cCampaign;
    if (
      !campaign ||
      job?.status.toLowerCase() !== "partial" ||
      campaign.stats.uniqueLeads >= campaign.targetLeadCount ||
      campaign.stats.sourceExhausted ||
      (Boolean(campaign.stats.maxAds) && campaign.stats.postsFetched >= Number(campaign.stats.maxAds)) ||
      autoContinuedCampaign.current === campaign.id
    )
      return;
    autoContinuedCampaign.current = campaign.id;
    setContinuing(true);
    const notice = notify.info(ar ? "نوسّع البحث عن عملاء إضافيين…" : "Expanding the search for more leads…", { loading: true, timeout: 0 });
    continueB2CCampaign(campaign.id)
      .then(async () => {
        await onRefresh();
        notify.close(notice);
        notify.success(ar ? "تم توسيع نطاق البحث." : "The lead search has been expanded.");
      })
      .catch((failure) => {
        notify.close(notice);
        notify.danger(apiErrorMessage(failure, ar ? "تعذر متابعة البحث الآن." : "The search could not continue right now."));
      })
      .finally(() => setContinuing(false));
  }, [job, onRefresh, ar]);

  async function refreshLeads() {
    const notice = notify.info(ar ? "جارٍ تحديث العملاء…" : "Refreshing leads…", { loading: true, timeout: 0 });
    try {
      await onRefresh();
      notify.close(notice);
      notify.success(ar ? "تم تحديث قائمة العملاء." : "Lead inventory refreshed.");
    } catch (failure) {
      notify.close(notice);
      notify.danger(apiErrorMessage(failure, ar ? "تعذر تحديث العملاء." : "Could not refresh leads."));
    }
  }

  function downloadCsv() {
    exportLeadsCsv(filtered);
    notify.success(ar ? "تم تجهيز ملف CSV." : "CSV export is ready.", { description: ar ? `تم تصدير ${filtered.length} عميل.` : `${filtered.length} leads were exported.` });
  }

  async function downloadXlsx() {
    try {
      await exportLeadsXlsx(filtered);
      notify.success(ar ? "تم تجهيز ملف Excel." : "Excel export is ready.", { description: ar ? `تم تصدير ${filtered.length} عميل.` : `${filtered.length} leads were exported.` });
    } catch (failure) {
      notify.danger(apiErrorMessage(failure, ar ? "تعذر تصدير ملف Excel." : "Could not export the Excel workbook."));
    }
  }
  async function selectRun(id: string | null) {
    setSelectedRunId(id);
    if (!id) {
      setRunLeads(null);
      return;
    }
    setRunsLoading(true);
    try {
      setRunLeads(await fetchLeadRunLeads(id));
      setRunsError("");
    } catch (failure) {
      setRunsError(
        apiErrorMessage(
          failure,
          ar ? "تعذر فتح هذه العملية." : "Could not open this lead run.",
        ),
      );
    } finally {
      setRunsLoading(false);
    }
  }
  const labels = ar
    ? ["الاسم", "المدينة", "رقم الهاتف", "سبب التأهل"]
    : ["Name", "City", "Phone number", "Reasoning"];

  return (
    <section className="core-leads">
      <header className="core-leads__heading">
        <div>
          <span className="core-eyebrow">
            {ar ? "من المحادثة إلى الفرصة" : "FROM CONVERSATION TO OPPORTUNITY"}
          </span>
          <h1>
            {ar ? "عملاؤك، في مكان واحد." : "Your leads, all in one place."}
          </h1>
          <p>
            {ar
              ? "إشارات فعلية، أرقام قابلة للتواصل، وسياق واضح للبيع."
              : "Real signals, callable contacts, and clear context for your next sale."}
          </p>
        </div>
        <Button className="core-button" onClick={onChat}>
          <Search size={16} />
          {ar ? "العودة للمحادثة" : "Back to chat"}
        </Button>
      </header>
      {activelySearching && job ? (
        <div className="core-run is-running">
          <LoaderCircle className="is-spinning" size={20} />
          <div>
            <strong>
              {ar
                ? "البحث جارٍ — ستظهر النتائج تلقائياً"
                : "Search in progress — results will appear automatically"}
            </strong>
            <p>
              {job.result_count} / {job.target_count}
            </p>
            <small>
              {ar
                ? "يمكنك متابعة المحادثة أو الرجوع لاحقاً."
                : "You can keep chatting or return later."}
            </small>
          </div>
        </div>
      ) : null}
      <B2CJourney job={job} language={language} />
      {!activelySearching ? <LeadKpis leads={leads} ar={ar} /> : null}
      {error ? (
        <div className="core-leads__error">
          <span>{error}</span>
          <Button onClick={onRefresh}>
            {ar ? "حاول مجدداً" : "Try again"}
          </Button>
        </div>
      ) : null}
      <div className="core-leads__surface">
        <div className="core-leads__toolbar">
          <div className="core-leads__filters">
            {[
              ["all", ar ? "الكل" : "All leads"],
              ["b2b", "B2B"],
              ["b2c", "B2C"],
            ].map(([value, label]) => (
              <Button
                key={value}
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  void selectRun(null);
                }}
              >
                {label}
                {value === "all" && <span>{leads.length}</span>}
              </Button>
            ))}
          </div>
          <div className="core-leads__search">
            <Search size={16} />
            <Input
              aria-label={ar ? "ابحث بالاسم أو الرقم أو أي معلومة" : "Search by name, phone, or any lead detail"}
              placeholder={ar ? "ابحث بالاسم، الرقم، الشركة…" : "Search name, phone, company…"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? <Button variant="ghost" size="icon-xs" aria-label={ar ? "مسح البحث" : "Clear search"} onClick={() => setQuery("")}><X size={13} /></Button> : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="core-export-button" disabled={!filtered.length}>
                <Download size={16} />
                {ar ? "تصدير" : "Export"}
                <ChevronDown size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={ar ? "start" : "end"} className="core-export-menu">
              <DropdownMenuLabel>{ar ? `تصدير ${filtered.length} عميل` : `Export ${filtered.length} leads`}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={downloadCsv}>
                <FileText size={16} />
                {ar ? "ملف CSV" : "CSV file"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void downloadXlsx()}>
                <FileSpreadsheet size={16} />
                {ar ? "ملف Excel (.xlsx)" : "Excel workbook (.xlsx)"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="core-icon-button" onClick={() => void refreshLeads()}>
            <RefreshCw size={17} />
          </Button>
        </div>
        <div className="core-lead-runs">
          <button
            className={!selectedRunId ? "is-active" : ""}
            onClick={() => void selectRun(null)}
          >
            <span>
              <Layers3 size={17} />
              <strong>
                {filter === "b2c"
                  ? "All B2C leads"
                  : filter === "b2b"
                    ? "All B2B leads"
                    : ar
                      ? "كل العملاء"
                      : "All leads"}
              </strong>
            </span>
            <small>
              {
                leads.filter(
                  (lead) =>
                    filter === "all" ||
                    (isB2C(lead) ? "b2c" : "b2b") === filter,
                ).length
              }
            </small>
          </button>
          {visibleRuns.map((run) => (
            <button
              key={run.id}
              className={selectedRunId === run.id ? "is-active" : ""}
              onClick={() => void selectRun(run.id)}
            >
              <span>
                <i className={`is-${run.type}`}>{run.type.toUpperCase()}</i>
                <strong>{run.title}</strong>
                <small>
                  {new Date(run.created_at).toLocaleDateString(
                    ar ? "ar-SA" : "en-GB",
                  )}{" "}
                  · {run.result_count}/{run.target_count}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
        {runsError ? (
          <div className="core-leads__error">
            <span>{runsError}</span>
          </div>
        ) : null}
        {(loading || runsLoading) && !sourceLeads.length ? (
          <div className="core-leads__empty">
            <LoaderCircle className="is-spinning" />
            <h2>{ar ? "جارٍ تحميل عملائك…" : "Loading your leads…"}</h2>
          </div>
        ) : !filtered.length ? (
          <div className="core-leads__empty">
            <Building2 />
            <h2>{ar ? "لا توجد نتائج مطابقة" : "No matching leads"}</h2>
            {!activelySearching && (
              <Button onClick={onChat}>
                {ar ? "افتح المحادثة" : "Open chat"}
              </Button>
            )}
          </div>
        ) : (
          <>
            {filtered.some((lead) => !isB2C(lead)) && (
              <B2BProspectTable
                leads={filtered.filter((lead) => !isB2C(lead))}
                research={research}
                language={language}
                researchingLeadId={researchingLeadId}
                focusedLeadId={focusedLeadId}
                onResearch={onResearch}
              />
            )}{" "}
            {filtered.some(isB2C) && (
              <div className="core-leads__table-wrap">
                <Table className="core-leads__table core-leads__table--b2c">
                  <TableHeader>
                    <TableRow>
                      {labels.map((label) => (
                        <TableHead key={label}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.filter(isB2C).map((lead) => (
                      <TableRow
                        id={lead.id}
                        key={lead.id}
                        className={
                          focusedLeadId === lead.id ? "is-search-focus" : ""
                        }
                      >
                        <TableCell data-label={labels[0]}>
                          <div className="core-lead-identity">
                            <span className="core-b2c-mark">
                              <WaslaBrand variant="symbol" inverse />
                              <i>B2C+</i>
                            </span>
                            <strong dir="auto">{lead.name || "—"}</strong>
                          </div>
                        </TableCell>
                        <TableCell data-label={labels[1]} dir="auto">
                          {lead.location || "—"}
                        </TableCell>
                        <TableCell data-label={labels[2]}>
                          {lead.phone ? (
                            <a
                              className="core-lead-phone"
                              dir="ltr"
                              href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}
                            >
                              <Phone size={15} />
                              <span>{lead.phone}</span>
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell data-label={labels[3]}>
                          <div className="core-lead-reason">
                            <p dir="auto">{lead.qualificationReason || "—"}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPitchLead(lead)}
                            >
                              <Sparkles size={14} />
                              {ar ? "ابنِ عرضاً بيعياً" : "Build sales pitch"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
        <footer className="core-leads__footer">
          {ar
            ? `${filtered.length} عميل · اضغط على الرقم للاتصال`
            : `${filtered.length} leads · Select a phone number to call`}
        </footer>
      </div>
      <PitchModal
        lead={pitchLead}
        offer={pitchOffer}
        ar={ar}
        onClose={() => setPitchLead(null)}
      />
    </section>
  );
}
