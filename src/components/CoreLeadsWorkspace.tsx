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
  Download,
  FileSpreadsheet,
  FileText,
  Globe2,
  LoaderCircle,
  Mail,
  MessageCircle,
  Phone,
  PhoneCall,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import type { CompanyResearch, Lead, ListingPreview } from "../types";
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
import { LeadRunSelector } from './LeadRunSelector';
import { WaslaBrand } from "./WaslaBrand";
import { WhatsappDraft } from "./LeadPipelineBoard";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";
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
import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipProvider as UiTooltipProvider,
  TooltipTrigger as UiTooltipTrigger,
} from "./ui/tooltip";
import "./core-leads.css";
import { CompactLeadCRM } from "./CompactLeadCRM";

const isB2C = (lead: Lead) => /b2c/i.test(lead.source);

const listingIntentDisplay: Record<ListingPreview["intent"], { en: [string, string]; ar: [string, string] }> = {
  sold_or_closed: { en: ["Past product activity", "A related public item appears to be no longer available. Current interest is unconfirmed."], ar: ["نشاط سابق لمنتج", "نشاط عام متعلق بمنتج مشابه يبدو أنه انتهى. الاهتمام الحالي غير مؤكد."] },
  seeking_work: { en: ["Work-related activity", "Public wording suggests a work search, not a confirmed product purchase."], ar: ["نشاط متعلق بالعمل", "تشير الصياغة العامة إلى بحث عن عمل، وليس إلى شراء منتج مؤكّد."] },
  seeking_to_rent: { en: ["Rental interest", "Public wording suggests a search for something to rent in this category."], ar: ["اهتمام بالاستئجار", "تشير الصياغة العامة إلى بحث عن شيء للاستئجار ضمن هذه الفئة."] },
  seeking_to_buy: { en: ["Product search", "Public wording suggests a search for a product in this category. Purchase has not been confirmed."], ar: ["بحث عن منتج", "تشير الصياغة العامة إلى بحث عن منتج ضمن هذه الفئة، لكن الشراء غير مؤكد."] },
  offering_for_rent: { en: ["Related rental activity", "Public activity involved a related rental offer. This does not confirm buying demand."], ar: ["نشاط تأجير مرتبط", "ظهر نشاط عام متعلق بعرض تأجير مشابه. لا يؤكد ذلك وجود طلب للشراء."] },
  offering_for_sale: { en: ["Related product activity", "Public activity involved a product in this category. We have not confirmed buying interest."], ar: ["نشاط منتج مرتبط", "ظهر نشاط عام حول منتج ضمن هذه الفئة. لم نتأكد من وجود اهتمام بالشراء."] },
  offering_service: { en: ["Related service activity", "Public activity involved a service in this category. The person's current need is unconfirmed."], ar: ["نشاط خدمة مرتبط", "ظهر نشاط عام متعلق بخدمة ضمن هذه الفئة. الحاجة الحالية غير مؤكدة."] },
  product_listed: { en: ["Related product activity", "Public activity involved a product in this category. The person's current need is unconfirmed."], ar: ["نشاط منتج مرتبط", "ظهر نشاط عام حول منتج ضمن هذه الفئة. الحاجة الحالية غير مؤكدة."] },
  not_stated: { en: ["Related online activity", "A public activity signal matched this category, but its purpose is not clear enough to infer intent."], ar: ["نشاط رقمي مرتبط", "ظهر نشاط عام مرتبط بهذه الفئة، لكن هدفه غير واضح بما يكفي لاستنتاج النية."] },
};

function LiteListingHover({ lead, ar }: { lead: Lead; ar: boolean }) {
  const listing = lead.listing;
  const identity = <span className="core-lead-identity__text">
    <strong dir="auto">{lead.name || "—"}</strong>
    <small>{lead.title || (ar ? "مؤسس" : "Founder")}</small>
  </span>;
  if (!listing) return identity;
  const [label, summary] = listingIntentDisplay[listing.intent]?.[ar ? "ar" : "en"] || listingIntentDisplay.not_stated[ar ? "ar" : "en"];
  const product = listing.product?.trim();
  const likelyOwner = product && listing.ownership === "likely_owner";
  const salesContext = likelyOwner
    ? ar ? "يبدو أنه يملك هذا المنتج" : "Likely owns this product"
    : product && !["sold_or_closed", "seeking_work"].includes(listing.intent)
      ? ar ? "نشاط مرتبط بهذا المنتج" : "Activity involving this product"
      : summary;
  return <HoverCard openDelay={180} closeDelay={120}>
    <HoverCardTrigger asChild>
      <button type="button" className="core-lead-identity__preview-trigger" aria-label={ar ? `عرض ملخص النشاط لـ ${lead.name}` : `View activity summary for ${lead.name}`}>
        {identity}
      </button>
    </HoverCardTrigger>
    <HoverCardContent className="core-lead-listing-hover" side={ar ? "right" : "left"} align="start" collisionPadding={16} dir={ar ? "rtl" : "ltr"}>
      <div className="core-lead-listing-hover__eyebrow"><span>{ar ? "معلومات سريعة للمبيعات" : "Sales brief"}</span><span className={`is-${listing.intent}`}>{label}</span></div>
      <dl className="core-lead-listing-hover__facts">
        <div><dt>{ar ? "العميل" : "Lead"}</dt><dd dir="auto">{lead.name || "—"}</dd></div>
        {product && <div><dt>{ar ? "المنتج" : "Product"}</dt><dd>{!ar && listing.productCategoryEn && <strong>{listing.productCategoryEn}</strong>}<span dir="auto">{product}</span></dd></div>}
        <div><dt>{ar ? "ما نعرفه" : "Sales context"}</dt><dd>{salesContext}</dd></div>
      </dl>
      <small className="core-lead-listing-hover__caveat">{ar ? "استنتاج من نشاط عام؛ الملكية والحاجة الشرائية غير مؤكّدتين." : "Public activity only; ownership and buying need are not verified."}</small>
    </HoverCardContent>
  </HoverCard>;
}

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
  const astraeus = leads.length - b2c;
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
      ar ? "عملاء Wasla-Lite" : "Wasla-Lite leads",
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
      ar ? "عملاء Wasla-Astraeus" : "Wasla-Astraeus leads",
      astraeus,
      Building2,
      ar ? "شركات وصنّاع قرار" : "Companies and decision-makers",
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
                    <stop offset="0%" stopColor="var(--chart-1, #ffff51)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--chart-1, #ffff51)" stopOpacity={0} />
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
                  stroke="var(--chart-1, #ffff51)"
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
          <i>Lite</i>
          <strong>WASLA AI</strong>
        </div>
        <span className="b2c-pitch-modal__eyebrow">
          {ar ? "ذكاء مبيعات Wasla-Lite" : "WASLA-LITE SALES INTELLIGENCE"}
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
                <div className="b2c-pitch-modal__contact-actions">
                  <a
                    className="b2c-pitch-modal__contact-button is-call"
                    href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}
                    aria-label={ar ? `اتصل بـ ${lead.name}` : `Call ${lead.name}`}
                    title={ar ? "اتصال هاتفي" : "Call on your phone"}
                  >
                    <PhoneCall size={18} />
                  </a>
                  <a
                    className="b2c-pitch-modal__contact-button is-facetime"
                    href={`facetime:${lead.phone.replace(/[^+\d]/g, "")}`}
                    aria-label={ar ? `اتصال FaceTime مع ${lead.name}` : `FaceTime ${lead.name}`}
                    title="FaceTime"
                  >
                    <Video size={19} />
                  </a>
                </div>
              ) : null}
              <Button
                variant="outline"
                className="b2c-pitch-modal__done"
                onClick={onClose}
              >
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
  focusedLeadId,
  researchingLeadId,
  onRefresh,
  onChat,
  onResearch,
  onPersona,
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
  onPersona: () => void;
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
    [pitchLead, setPitchLead] = useState<Lead | null>(null),
    [messageLead, setMessageLead] = useState<Lead | null>(null);
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
      (Boolean(campaign.stats.maxAds) && Number(campaign.stats.listingsFetchedTotal ?? campaign.stats.postsFetched) >= Number(campaign.stats.maxAds)) ||
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

  async function downloadCsv() {
    try {
    await exportLeadsCsv(filtered);
    notify.success(ar ? "تم تجهيز ملف CSV." : "CSV export is ready.", { description: ar ? `تم تصدير ${filtered.length} عميل.` : `${filtered.length} leads were exported.` });
    } catch (failure) {
      notify.danger(apiErrorMessage(failure, ar ? "تعذر التحقق من صلاحية التصدير." : "Could not verify export permission."));
    }
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
    ? ["الاسم", "المدينة", "التواصل", "سبب التأهل", "العرض"]
    : ["Name", "City", "Contact", "Reasoning", "Pitch"];

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
      <B2CJourney job={job} language={language} />
      {!activelySearching ? <LeadKpis leads={leads} ar={ar} /> : null}
      <div className="core-leads__surface">
        <div className="core-leads__toolbar">
          <div className="core-leads__filters">
            {[
              ["all", ar ? "الكل" : "All leads"],
              ["b2b", "Wasla-Astraeus"],
              ["b2c", "Wasla-Lite"],
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
              <DropdownMenuItem onSelect={() => void downloadCsv()}>
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
        <LeadRunSelector runs={visibleRuns} selectedId={selectedRunId}
          total={leads.filter(lead => filter === 'all' || (isB2C(lead) ? 'b2c' : 'b2b') === filter).length}
          ar={ar} onSelect={id => void selectRun(id)} />
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
            <CompactLeadCRM leads={filtered} ar={ar} />
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
      {messageLead ? <WhatsappDraft lead={messageLead} ar={ar} onClose={() => setMessageLead(null)} onPersona={onPersona} /> : null}
    </section>
  );
}
