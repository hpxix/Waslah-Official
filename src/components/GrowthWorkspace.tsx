import {
  BarChart3,
  BrainCircuit,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Facebook,
  FileText,
  Globe2,
  Instagram,
  Lightbulb,
  MessageCircle,
  Music2,
  PenTool,
  Plus,
  Radar,
  RefreshCw,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  apiErrorMessage,
  createAudienceSegment,
  createGrowthCampaign,
  fetchGrowthInbox,
  fetchGrowthOverview,
  generateGrowthContent,
  publishGrowthContent,
  replyToGrowthConversation,
  saveGrowthBrand,
  suggestGrowthConversationReply,
  updateGrowthContent,
} from "../lib/directus";
import type {
  AudienceSegment,
  AudienceSegmentInput,
  GrowthBrandProfile,
  GrowthContentItem,
  GrowthOverview,
  InboxConversation,
  SocialChannelProvider,
} from "../lib/directus";
import type { Lead } from "../types";

type Language = "ar" | "en";
type GrowthView = "command" | "brand" | "audiences" | "content" | "inbox";

type GrowthWorkspaceProps = {
  language: Language;
  leads: Lead[];
  onOpenSocials: () => void;
  onStartTour: () => void;
};

const emptyBrand: GrowthBrandProfile = {
  id: null,
  company_name: "",
  website: "",
  industry: "",
  description: "",
  value_proposition: "",
  products_services: [],
  brand_voice: "",
  brand_values: [],
  target_markets: ["Saudi Arabia"],
  goals: [],
  tone_rules: [],
  colors: ["#0b0d0e", "#f4f5f2", "#a4ffcf"],
  logo_url: "",
  completion_score: 0,
  created_at: null,
  updated_at: null,
};

const growthViews: Array<{ id: GrowthView; icon: typeof Rocket; en: string; ar: string }> = [
  { id: "command", icon: Rocket, en: "Growth command", ar: "قيادة النمو" },
  { id: "brand", icon: BrainCircuit, en: "Business DNA", ar: "هوية النشاط" },
  { id: "audiences", icon: Users, en: "Audiences", ar: "الجماهير" },
  { id: "content", icon: PenTool, en: "Content studio", ar: "استوديو المحتوى" },
  { id: "inbox", icon: MessageCircle, en: "Unified inbox", ar: "صندوق المحادثات" },
];

const channelMeta = {
  instagram: { icon: Instagram, en: "Instagram", ar: "إنستغرام" },
  facebook: { icon: Facebook, en: "Facebook", ar: "فيسبوك" },
  tiktok: { icon: Music2, en: "TikTok", ar: "تيك توك" },
};

function csv(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asCsv(value: string[]) {
  return value.join(", ");
}

function CsvInput({ value, onChange, placeholder }: { value: string[]; onChange: (value: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(asCsv(value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (document.activeElement !== input.current) setText(asCsv(value)); }, [value]);
  return <input ref={input} value={text} placeholder={placeholder} onChange={(event) => { setText(event.target.value); onChange(csv(event.target.value)); }} />;
}

function compactNumber(value: number, language: Language) {
  return new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatDate(value: string | number | null, language: Language) {
  if (!value) return language === "ar" ? "الآن" : "Now";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return language === "ar" ? "الآن" : "Now";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function defaultAudience(): AudienceSegmentInput {
  return {
    name: "",
    type: "B2B",
    description: "",
    pains: [],
    triggers: [],
    jobs_to_be_done: [],
    channels: ["instagram"],
    geography: ["Saudi Arabia"],
    estimated_size: 0,
  };
}

function useGrowthModal(onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>(".growth-modal[role=dialog]");
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') || []).filter((element) => element.getClientRects().length > 0);
    if (!dialog?.contains(document.activeElement)) focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const targets = focusable();
      const first = targets[0];
      const last = targets.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, []);
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function GrowthWorkspace({
  language,
  leads,
  onOpenSocials,
  onStartTour,
}: GrowthWorkspaceProps) {
  const ar = language === "ar";
  const [view, setView] = useState<GrowthView>("command");
  const [overview, setOverview] = useState<GrowthOverview | null>(null);
  const [brand, setBrand] = useState<GrowthBrandProfile>(emptyBrand);
  const [inbox, setInbox] = useState<{ configured: boolean; conversations: InboxConversation[] }>({
    configured: false,
    conversations: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [audienceDraft, setAudienceDraft] = useState<AudienceSegmentInput | null>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const [reviewingContent, setReviewingContent] = useState<GrowthContentItem | null>(null);
  const [campaignDraft, setCampaignDraft] = useState({
    name: "",
    objective: "",
    audience_segment_id: "",
    channels: ["instagram"] as SocialChannelProvider[],
  });
  const [contentDraft, setContentDraft] = useState({
    brief: "",
    channel: "instagram" as GrowthContentItem["channel"],
    format: "post",
    audience_segment_id: "",
    connection_id: "",
    scheduled_for: "",
    media_urls: "",
  });
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await fetchGrowthOverview();
      setOverview(data);
      setBrand(data.brand);
      if (view === "inbox") {
        setInbox(await fetchGrowthInbox());
      }
    } catch (loadError) {
      setError(apiErrorMessage(loadError, ar ? "تعذر تحميل مركز النمو." : "Could not load the growth command center."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view !== "inbox") return;
    fetchGrowthInbox()
      .then(setInbox)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, [view]);

  const funnel = useMemo(() => {
    if (overview?.journeys.length) return overview.funnel;
    const stages: Array<{ stage: "engaged" | "matched" | "offered" | "won"; en: string; ar: string }> = [
      { stage: "engaged", en: "Lead engaged", ar: "تفاعل العميل" },
      { stage: "matched", en: "Product matched", ar: "تطابق المنتج" },
      { stage: "offered", en: "Offer delivered", ar: "تم تقديم العرض" },
      { stage: "won", en: "Closed won", ar: "تم الإغلاق" },
    ];
    return stages.map((definition, index) => {
      const rows = leads.filter((lead) => {
        if (definition.stage === "won") return lead.status === "won";
        if (definition.stage === "offered") return ["proposal", "contacted"].includes(lead.status);
        if (definition.stage === "matched") return ["qualified", "researching"].includes(lead.status);
        return lead.status === "new";
      });
      return {
        stage: definition.stage,
        order: index + 1,
        count: rows.length,
        value_halalas: rows.reduce((sum, lead) => sum + lead.revenueEstimate * 100, 0),
        customers: rows.slice(0, 8).map((lead) => ({
          id: lead.id,
          display_name: lead.company || lead.name,
          engagement_score: lead.fitScore,
          next_action: lead.status === "new" ? "Research fit" : "Continue relationship",
        })),
      };
    });
  }, [leads, overview]);

  async function saveBrand() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        company_name: brand.company_name,
        website: brand.website,
        industry: brand.industry,
        description: brand.description,
        value_proposition: brand.value_proposition,
        products_services: brand.products_services,
        brand_voice: brand.brand_voice,
        brand_values: brand.brand_values,
        target_markets: brand.target_markets,
        goals: brand.goals,
        tone_rules: brand.tone_rules,
        colors: brand.colors,
        logo_url: brand.logo_url,
      };
      const result = await saveGrowthBrand(payload);
      setBrand(result);
      setOverview((current) => (current ? { ...current, brand: result } : current));
      setNotice(ar ? "حفظت وصلة هوية نشاطك وحدثت ذاكرة الذكاء الاصطناعي." : "Business DNA saved. Wasla AI will use it across the workspace.");
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function saveAudience() {
    if (!audienceDraft) return;
    setSaving(true);
    try {
      await createAudienceSegment(audienceDraft);
      setAudienceDraft(null);
      setNotice(ar ? "تم إنشاء شريحة الجمهور." : "Audience segment created.");
      await load(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function saveCampaign() {
    setSaving(true);
    try {
      await createGrowthCampaign({
        ...campaignDraft,
        audience_segment_id: campaignDraft.audience_segment_id || null,
        strategy: { approval: "human", cadence: "weekly", timezone: "Asia/Riyadh" },
      });
      setCampaignOpen(false);
      setCampaignDraft({ name: "", objective: "", audience_segment_id: "", channels: ["instagram"] });
      setNotice(ar ? "تم إنشاء الحملة كمسودة آمنة." : "Campaign created as an approval-controlled draft.");
      await load(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function generateContent() {
    setSaving(true);
    setError("");
    try {
      const { media_urls: mediaUrls, ...draft } = contentDraft;
      await generateGrowthContent({
        ...draft,
        audience_segment_id: contentDraft.audience_segment_id || null,
        connection_id: contentDraft.connection_id || null,
        scheduled_for: contentDraft.scheduled_for ? new Date(contentDraft.scheduled_for).toISOString() : null,
        media: csv(mediaUrls).map((path) => ({ path })),
      });
      setContentOpen(false);
      setContentDraft({
        brief: "",
        channel: "instagram",
        format: "post",
        audience_segment_id: "",
        connection_id: "",
        scheduled_for: "",
        media_urls: "",
      });
      setNotice(ar ? "أنشأت وصلة مسودة مبنية على هوية نشاطك والجمهور." : "Wasla created a brand-aware content draft for review.");
      await load(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function approveOrPublish(item: GrowthContentItem) {
    setSaving(true);
    setError("");
    try {
      if (item.approval_status !== "approved") {
        await updateGrowthContent(item.id, { approval_status: "approved" });
        setNotice(ar ? "تم اعتماد المسودة. راجع الموعد ثم أرسلها إلى Postiz." : "Draft approved. Review its schedule, then send it to Postiz.");
      } else {
        await publishGrowthContent(item.id);
        setNotice(item.channel === "tiktok" ? (ar ? "تمت جدولة الرفع. أكمل النشر من تطبيق تيك توك عند استلام الإشعار." : "Upload scheduled. Finish publishing in TikTok when its notification arrives.") : (ar ? "تمت جدولة المحتوى عبر Postiz." : "Content scheduled through Postiz."));
      }
      await load(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  const activeAudiences = overview?.audiences.filter((item) => item.status === "active") || [];
  const connected = overview?.connections.filter((item) => item.status === "ready") || [];
  const content = overview?.content || [];
  const activeCampaigns = overview?.campaigns.filter((item) => item.status === "active" || item.status === "draft") || [];

  return (
    <div className="growth-workspace" dir={ar ? "rtl" : "ltr"} data-tour="growth">
      <header className="growth-hero">
        <div>
          <span className="growth-eyebrow"><Sparkles size={14} /> {ar ? "نظام وصلة للنمو" : "Wasla growth operating system"}</span>
          <h1>{ar ? "حوّل فهم السوق إلى إيراد." : "Turn market understanding into revenue."}</h1>
          <p>{ar ? "هوية النشاط والجمهور والمحتوى والمحادثات ومسار البيع في مكان واحد تديره وصلة بذكاء وموافقة بشرية." : "Business intelligence, audiences, content, conversations, and pipeline working as one approval-controlled system."}</p>
        </div>
        <div className="growth-hero__actions">
          <button type="button" onClick={onStartTour}><Lightbulb size={16} />{ar ? "كيف تعمل وصلة؟" : "How Wasla works"}</button>
          <button type="button" className="is-primary" onClick={() => setContentOpen(true)}><Wand2 size={16} />{ar ? "أنشئ محتوى" : "Create content"}</button>
        </div>
      </header>

      {error ? <div className="growth-alert is-error"><CircleAlert size={17} /><span>{error}</span><button type="button" onClick={() => setError("")}><X size={15} /></button></div> : null}
      {notice ? <div className="growth-alert is-success"><CheckCircle2 size={17} /><span>{notice}</span><button type="button" onClick={() => setNotice("")}><X size={15} /></button></div> : null}

      <nav className="growth-view-tabs" aria-label={ar ? "أقسام النمو" : "Growth workspace sections"}>
        {growthViews.map((item) => {
          const Icon = item.icon;
          return <button type="button" key={item.id} className={view === item.id ? "is-active" : ""} onClick={() => setView(item.id)} data-tour={item.id === "brand" ? "brand" : item.id === "audiences" ? "audiences" : item.id === "content" ? "content" : undefined}><Icon size={16} /><span>{ar ? item.ar : item.en}</span></button>;
        })}
      </nav>

      {loading ? <div className="growth-loading"><RefreshCw className="is-spinning" size={20} /><span>{ar ? "تبني وصلة مركز النمو…" : "Building your growth command center…"}</span></div> : null}
      {!loading && view === "command" ? <GrowthCommandView language={language} brand={brand} funnel={funnel} audiences={activeAudiences} campaigns={activeCampaigns.length} content={content} connections={connected.length} onView={setView} onCampaign={() => setCampaignOpen(true)} /> : null}
      {!loading && view === "brand" ? <BrandStudio language={language} brand={brand} setBrand={setBrand} saving={saving} onSave={saveBrand} /> : null}
      {!loading && view === "audiences" ? <AudienceStudio language={language} audiences={activeAudiences} onCreate={() => setAudienceDraft(defaultAudience())} /> : null}
      {!loading && view === "content" ? <ContentStudio language={language} items={content} postizReady={Boolean(overview?.infrastructure.postiz)} saving={saving} onCreate={() => setContentOpen(true)} onAction={approveOrPublish} onReview={setReviewingContent} /> : null}
      {!loading && view === "inbox" ? <InboxStudio language={language} inbox={inbox} onConnect={onOpenSocials} onOpen={setSelectedConversation} /> : null}

      {audienceDraft ? <AudienceModal error={error} language={language} value={audienceDraft} onChange={setAudienceDraft} saving={saving} onClose={() => { if (!saving) setAudienceDraft(null); }} onSave={saveAudience} /> : null}
      {campaignOpen ? <CampaignModal error={error} language={language} value={campaignDraft} audiences={activeAudiences} onChange={setCampaignDraft} saving={saving} onClose={() => { if (!saving) setCampaignOpen(false); }} onSave={saveCampaign} /> : null}
      {contentOpen ? <ContentModal error={error} language={language} value={contentDraft} audiences={activeAudiences} connections={overview?.connections || []} brandReady={brand.completion_score >= 40} onChange={setContentDraft} saving={saving} onClose={() => { if (!saving) setContentOpen(false); }} onGenerate={generateContent} onOpenBrand={() => { setContentOpen(false); setView("brand"); }} /> : null}
      {selectedConversation ? <ConversationModal language={language} conversation={selectedConversation} onClose={() => setSelectedConversation(null)} /> : null}
      {reviewingContent ? <ContentReviewModal language={language} item={reviewingContent} connections={overview?.connections || []} onClose={() => setReviewingContent(null)} onSaved={() => { setReviewingContent(null); setNotice(ar ? "تم حفظ المسودة. اعتمد النسخة المحدثة قبل الجدولة." : "Draft saved. Approve this updated version before scheduling."); void load(true); }} /> : null}
    </div>
  );
}

function GrowthCommandView({
  language,
  brand,
  funnel,
  audiences,
  campaigns,
  content,
  connections,
  onView,
  onCampaign,
}: {
  language: Language;
  brand: GrowthBrandProfile;
  funnel: GrowthOverview["funnel"];
  audiences: AudienceSegment[];
  campaigns: number;
  content: GrowthContentItem[];
  connections: number;
  onView: (view: GrowthView) => void;
  onCampaign: () => void;
}) {
  const ar = language === "ar";
  const totalPipeline = funnel.reduce((sum, stage) => sum + stage.value_halalas, 0) / 100;
  const scheduled = content.filter((item) => item.status === "scheduled").length;
  const metrics = [
    { icon: BrainCircuit, label: ar ? "اكتمال هوية النشاط" : "Business DNA", value: brand.completion_score + "%", hint: ar ? "ذاكرة وصلة الأساسية" : "Wasla's shared memory" },
    { icon: Users, label: ar ? "شرائح الجمهور" : "Audience segments", value: String(audiences.length), hint: ar ? "شرائح نشطة" : "Active segments" },
    { icon: Calendar, label: ar ? "المحتوى المجدول" : "Scheduled content", value: String(scheduled), hint: ar ? "عبر Postiz" : "Through Postiz" },
    { icon: BarChart3, label: ar ? "قيمة المسار" : "Pipeline value", value: compactNumber(totalPipeline, language) + " SAR", hint: ar ? "قيمة منسوبة" : "Attributed value" },
  ];
  const stageLabels: Record<string, { en: string; ar: string; letter: string }> = {
    engaged: { en: "Lead engaged", ar: "تفاعل العميل", letter: "C" },
    matched: { en: "Product matched", ar: "تطابق المنتج", letter: "B" },
    offered: { en: "Offer delivered", ar: "تم تقديم العرض", letter: "A" },
    won: { en: "Closed won", ar: "تم الإغلاق", letter: "S" },
  };

  return (
    <div className="growth-command">
      <section className="growth-metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return <article key={metric.label}><span><Icon size={16} />{metric.label}</span><strong>{metric.value}</strong><small>{metric.hint}</small></article>;
        })}
      </section>

      <div className="growth-command-grid">
        <section className="growth-panel growth-funnel-panel" data-tour="funnel">
          <div className="growth-panel__head">
            <div><span>{ar ? "رحلة الإيراد الحية" : "Live revenue journey"}</span><h2>{ar ? "كل عميل، والخطوة التالية." : "Every customer, every next move."}</h2></div>
            <span className="growth-live"><i />{ar ? "مباشر" : "Live"}</span>
          </div>
          <div className="growth-funnel">
            {funnel.map((stage, index) => {
              const meta = stageLabels[stage.stage];
              return (
                <article className={"growth-funnel__stage is-" + stage.stage} key={stage.stage} style={{ animationDelay: String(index * 120) + "ms" }}>
                  <div className="growth-funnel__identity"><span>{meta.letter}</span><div><strong>{ar ? meta.ar : meta.en}</strong><small>{stage.count} {ar ? "عميل" : stage.count === 1 ? "customer" : "customers"}</small></div></div>
                  <div className="growth-funnel__customers">
                    {stage.customers.length ? stage.customers.slice(0, 4).map((customer) => <span key={customer.id} title={customer.next_action || ""}>{customer.display_name.slice(0, 18)}<i>{customer.engagement_score}</i></span>) : <em>{ar ? "بانتظار الحركة" : "Waiting for movement"}</em>}
                  </div>
                  <strong className="growth-funnel__value">{compactNumber(stage.value_halalas / 100, language)}<small>SAR</small></strong>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="growth-command-side">
          <section className="growth-panel growth-readiness">
            <div className="growth-panel__head"><div><span>{ar ? "جاهزية النظام" : "System readiness"}</span><h2>{ar ? "ما الذي يحتاج انتباهك؟" : "What needs your attention?"}</h2></div></div>
            <button type="button" onClick={() => onView("brand")} className={brand.completion_score >= 70 ? "is-done" : ""}><span>{brand.completion_score >= 70 ? <Check size={16} /> : <BrainCircuit size={16} />}<strong>{ar ? "علّم وصلة عن نشاطك" : "Teach Wasla your business"}</strong></span><small>{brand.completion_score}%</small><ChevronRight size={15} /></button>
            <button type="button" onClick={() => onView("audiences")} className={audiences.length ? "is-done" : ""}><span>{audiences.length ? <Check size={16} /> : <Users size={16} />}<strong>{ar ? "عرّف جمهورك الأساسي" : "Define your core audience"}</strong></span><small>{audiences.length}</small><ChevronRight size={15} /></button>
            <button type="button" onClick={() => onView("inbox")} className={connections ? "is-done" : ""}><span>{connections ? <Check size={16} /> : <MessageCircle size={16} />}<strong>{ar ? "اربط محادثاتك" : "Connect conversations"}</strong></span><small>{connections}</small><ChevronRight size={15} /></button>
          </section>

          <section className="growth-panel growth-next-action">
            <span><Radar size={15} />{ar ? "أفضل خطوة الآن" : "Best next action"}</span>
            <h3>{brand.completion_score < 40 ? (ar ? "أكمل هوية النشاط قبل إنشاء الحملات." : "Complete Business DNA before generating campaigns.") : audiences.length === 0 ? (ar ? "أنشئ أول شريحة جمهور قابلة للاستهداف." : "Create your first actionable audience segment.") : (ar ? "حوّل هذه المعرفة إلى حملة متعددة القنوات." : "Turn this intelligence into a cross-channel campaign.")}</h3>
            <p>{ar ? "وصلة تبني كل توصية من بيانات نشاطك، لا من قوالب عامة." : "Wasla builds every recommendation from your business context—not generic templates."}</p>
            <button type="button" onClick={brand.completion_score < 40 ? () => onView("brand") : audiences.length === 0 ? () => onView("audiences") : onCampaign}>{brand.completion_score < 40 ? (ar ? "أكمل الهوية" : "Complete DNA") : audiences.length === 0 ? (ar ? "أنشئ جمهوراً" : "Create audience") : (ar ? "ابدأ حملة" : "Build campaign")}<ChevronRight size={15} /></button>
          </section>
        </aside>
      </div>

      <section className="growth-panel growth-campaign-strip">
        <div><span><Rocket size={16} />{ar ? "الحملات النشطة والمسودات" : "Active campaigns and drafts"}</span><strong>{campaigns}</strong><small>{ar ? "الاستراتيجية والمحتوى والمحادثات تبقى مرتبطة بهدف واحد." : "Strategy, content, and conversations stay connected to one commercial objective."}</small></div>
        <button type="button" onClick={onCampaign}><Plus size={16} />{ar ? "حملة جديدة" : "New campaign"}</button>
      </section>
    </div>
  );
}

function BrandStudio({
  language,
  brand,
  setBrand,
  saving,
  onSave,
}: {
  language: Language;
  brand: GrowthBrandProfile;
  setBrand: (brand: GrowthBrandProfile) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const ar = language === "ar";
  const update = (key: keyof GrowthBrandProfile, value: string | string[]) => setBrand({ ...brand, [key]: value });
  return (
    <section className="growth-studio brand-studio">
      <div className="growth-studio__intro">
        <div><span><BrainCircuit size={16} />{ar ? "ذاكرة وصلة الأساسية" : "Wasla's shared intelligence"}</span><h2>{ar ? "هوية نشاطك، مرة واحدة لكل الوكلاء." : "Your business DNA, understood once and used everywhere."}</h2><p>{ar ? "يستخدمها وكيل العملاء، ومنشئ المحتوى، وتحليل الجمهور، ومسودات الردود حتى تتصرف وصلة كعضو حقيقي في فريقك." : "The lead agent, content creator, audience intelligence, and reply drafts use this shared context so Wasla behaves like a real member of your team."}</p></div>
        <div className="brand-score"><strong>{brand.completion_score}%</strong><span>{ar ? "جاهزية" : "ready"}</span><i><b style={{ width: brand.completion_score + "%" }} /></i></div>
      </div>
      <div className="brand-form">
        <label><span>{ar ? "اسم النشاط" : "Company name"}</span><input value={brand.company_name} onChange={(event) => update("company_name", event.target.value)} /></label>
        <label><span>{ar ? "الموقع الإلكتروني" : "Website"}</span><input value={brand.website} onChange={(event) => update("website", event.target.value)} placeholder="https://" /></label>
        <label><span>{ar ? "القطاع" : "Industry"}</span><input value={brand.industry} onChange={(event) => update("industry", event.target.value)} /></label>
        <label><span>{ar ? "رابط الشعار" : "Logo URL"}</span><input value={brand.logo_url} onChange={(event) => update("logo_url", event.target.value)} placeholder="https://" /></label>
        <label className="is-wide"><span>{ar ? "ماذا يفعل نشاطك؟" : "What does your business do?"}</span><textarea value={brand.description} onChange={(event) => update("description", event.target.value)} placeholder={ar ? "اشرح النشاط والعميل والنتيجة التي تقدمها…" : "Explain the business, the customer, and the outcome you create…"} /></label>
        <label className="is-wide"><span>{ar ? "عرض القيمة" : "Core value proposition"}</span><textarea value={brand.value_proposition} onChange={(event) => update("value_proposition", event.target.value)} placeholder={ar ? "لماذا يختارك العميل بدلاً من البدائل؟" : "Why should a customer choose you over the alternatives?"} /></label>
        <label><span>{ar ? "المنتجات والخدمات" : "Products and services"}</span><CsvInput value={brand.products_services} onChange={(values) => update("products_services", values)} placeholder={ar ? "افصل بينها بفاصلة" : "Separate with commas"} /></label>
        <label><span>{ar ? "الأسواق المستهدفة" : "Target markets"}</span><CsvInput value={brand.target_markets} onChange={(values) => update("target_markets", values)} /></label>
        <label><span>{ar ? "شخصية العلامة" : "Brand voice"}</span><input value={brand.brand_voice} onChange={(event) => update("brand_voice", event.target.value)} placeholder={ar ? "خبير، دافئ، مباشر…" : "Expert, warm, direct…"} /></label>
        <label><span>{ar ? "قيم العلامة" : "Brand values"}</span><CsvInput value={brand.brand_values} onChange={(values) => update("brand_values", values)} /></label>
        <label className="is-wide"><span>{ar ? "أهداف النمو" : "Growth goals"}</span><CsvInput value={brand.goals} onChange={(values) => update("goals", values)} placeholder={ar ? "مثال: 20 اجتماعاً مؤهلاً شهرياً" : "Example: 20 qualified meetings per month"} /></label>
        <label className="is-wide"><span>{ar ? "قواعد الأسلوب" : "Tone guardrails"}</span><CsvInput value={brand.tone_rules} onChange={(values) => update("tone_rules", values)} placeholder={ar ? "لا تستخدم المبالغة، لا تذكر المنافسين…" : "No hype, never attack competitors…"} /></label>
      </div>
      <footer className="growth-studio__footer"><span><ShieldCheck size={15} />{ar ? "هذه البيانات خاصة بمساحة عملك." : "This intelligence remains tenant-isolated."}</span><button type="button" disabled={saving || !brand.company_name.trim()} onClick={onSave}>{saving ? <RefreshCw className="is-spinning" size={16} /> : <Check size={16} />}{ar ? "حفظ وتحديث وصلة" : "Save and teach Wasla"}</button></footer>
    </section>
  );
}

function AudienceStudio({ language, audiences, onCreate }: { language: Language; audiences: AudienceSegment[]; onCreate: () => void }) {
  const ar = language === "ar";
  return (
    <section className="growth-studio audience-studio">
      <div className="growth-studio__intro">
        <div><span><Users size={16} />{ar ? "ذكاء الجمهور" : "Audience intelligence"}</span><h2>{ar ? "شرائح تفهم الدافع، لا الديموغرافيا فقط." : "Segments built around motivation—not demographics alone."}</h2><p>{ar ? "اربط المشكلة، وإشارة الشراء، والهدف، والمكان، والقناة المناسبة حتى يبحث وكيل العملاء وينشئ المحتوى لنفس الشخص." : "Connect pains, buying triggers, jobs, geography, and channel fit so sourcing and content speak to the same customer."}</p></div>
        <button type="button" onClick={onCreate}><Plus size={16} />{ar ? "شريحة جديدة" : "New segment"}</button>
      </div>
      {audiences.length ? <div className="audience-grid">{audiences.map((audience) => (
        <article key={audience.id} className="audience-card">
          <header><span className={"is-" + audience.type.toLowerCase()}>{audience.type}</span><small>{compactNumber(audience.estimated_size, language)} {ar ? "متوقع" : "estimated"}</small></header>
          <h3>{audience.name}</h3>
          <p>{audience.description || (ar ? "أضف وصفاً يجعل هذه الشريحة قابلة للتنفيذ." : "Add a description that makes this segment actionable.")}</p>
          <div className="audience-card__signals">
            <span>{ar ? "الألم" : "Pain"}</span><strong>{audience.pains[0] || (ar ? "غير محدد" : "Not defined")}</strong>
            <span>{ar ? "إشارة الشراء" : "Trigger"}</span><strong>{audience.triggers[0] || (ar ? "غير محددة" : "Not defined")}</strong>
          </div>
          <footer><div>{audience.channels.slice(0, 3).map((channel) => <i key={channel}>{channel.slice(0, 2).toUpperCase()}</i>)}</div><span><Globe2 size={13} />{audience.geography.join(", ") || "Saudi Arabia"}</span></footer>
        </article>
      ))}</div> : <div className="growth-empty"><span><Radar size={25} /></span><h3>{ar ? "لا توجد شرائح بعد." : "No audience segments yet."}</h3><p>{ar ? "ابدأ بالجمهور الأكثر قيمة. ستستخدمه وصلة في البحث والمحتوى والرسائل." : "Start with your highest-value audience. Wasla will use it for sourcing, content, and conversations."}</p><button type="button" onClick={onCreate}>{ar ? "أنشئ أول شريحة" : "Create first segment"}</button></div>}
    </section>
  );
}

function ContentStudio({
  language,
  items,
  postizReady,
  saving,
  onCreate,
  onAction,
  onReview,
}: {
  language: Language;
  items: GrowthContentItem[];
  postizReady: boolean;
  saving: boolean;
  onCreate: () => void;
  onAction: (item: GrowthContentItem) => void;
  onReview: (item: GrowthContentItem) => void;
}) {
  const ar = language === "ar";
  return (
    <section className="growth-studio content-studio">
      <div className="growth-studio__intro">
        <div><span><PenTool size={16} />{ar ? "مصنع المحتوى" : "Brand-aware content engine"}</span><h2>{ar ? "من هدف تجاري إلى محتوى يستحق النشر." : "From commercial objective to content worth publishing."}</h2><p>{ar ? "كل مسودة تستخدم هوية النشاط والجمهور، ثم تمر بموافقة واضحة قبل أن يرسلها Postiz إلى القناة." : "Every draft uses Business DNA and audience context, then passes explicit approval before Postiz schedules it."}</p></div>
        <button type="button" onClick={onCreate}><Wand2 size={16} />{ar ? "أنشئ مع وصلة" : "Create with Wasla"}</button>
      </div>
      <div className={"content-readiness " + (postizReady ? "is-ready" : "")}><span>{postizReady ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}<strong>{postizReady ? (ar ? "Postiz جاهز للنشر" : "Postiz publishing") : (ar ? "وضع المسودة فقط" : "Draft-only mode")}</strong></span><small>{postizReady ? (ar ? "ستُنشر المسودات المعتمدة في موعدها." : "Approved drafts can be scheduled to connected channels.") : (ar ? "اربط Postiz من القنوات ثم زامن حساباتك وراجع المسودة واعتمدها." : "Connect Postiz in Socials, sync your accounts, then review and approve a draft.")}</small></div>
      {items.length ? <div className="content-list">{items.map((item) => {
        const meta = channelMeta[item.channel];
        const Icon = meta.icon;
        return (
          <article key={item.id} className={"content-card is-" + item.status}>
            <div className="content-card__channel"><Icon size={19} /><span>{ar ? meta.ar : meta.en}</span><small>{item.format}</small></div>
            <div className="content-card__copy"><span>{item.title}</span><p>{item.copy}</p>{item.visual_direction ? <em><Sparkles size={11} />{item.visual_direction}</em> : null}<small><Clock3 size={12} />{item.scheduled_for ? formatDate(item.scheduled_for, language) : (ar ? "لم يحدد موعد" : "Not scheduled")}{item.media.length ? ` · ${item.media.length} ${ar ? "وسائط" : "media"}` : ""}</small></div>
            <div className="content-card__state"><span className={"is-" + item.approval_status}>{item.approval_status === "approved" ? (ar ? "معتمد" : "Approved") : (ar ? "بانتظار المراجعة" : "Needs review")}</span><strong>{item.status === "unknown" ? (ar ? "تحقق من حالة الإرسال" : "Needs confirmation") : item.status}</strong><button type="button" onClick={() => onReview(item)}><FileText size={14} />{ar ? "مراجعة المسودة" : "Review draft"}</button><button type="button" disabled={saving || !["draft", "failed"].includes(item.status) || (item.approval_status === "approved" && (!postizReady || !item.connection_id || item.format === "video_script"))} onClick={() => onAction(item)}>{item.approval_status === "approved" ? (ar ? "جدولة عبر Postiz" : "Schedule with Postiz") : (ar ? "اعتماد" : "Approve")}<ChevronRight size={14} /></button></div>
          </article>
        );
      })}</div> : <div className="growth-empty"><span><FileText size={25} /></span><h3>{ar ? "تقويمك ينتظر أول فكرة." : "Your content calendar is ready for its first idea."}</h3><p>{ar ? "اكتب الهدف، واختر الجمهور والقناة، وستبني وصلة مسودة مخصصة." : "Give Wasla an objective, audience, and channel to create a tailored first draft."}</p><button type="button" onClick={onCreate}>{ar ? "أنشئ أول مسودة" : "Create first draft"}</button></div>}
    </section>
  );
}

function InboxStudio({
  language,
  inbox,
  onConnect,
  onOpen,
}: {
  language: Language;
  inbox: { configured: boolean; conversations: InboxConversation[] };
  onConnect: () => void;
  onOpen: (conversation: InboxConversation) => void;
}) {
  const ar = language === "ar";
  return (
    <section className="growth-studio inbox-studio">
      <div className="growth-studio__intro">
        <div><span><MessageCircle size={16} />{ar ? "المحادثات الموحدة" : "Unified customer conversations"}</span><h2>{ar ? "كل محادثة، بنفس فهم وصلة لنشاطك." : "Every conversation, grounded in the same business context."}</h2><p>{ar ? "يجمع Chatwoot الرسائل، بينما تقترح وصلة رداً مدروساً وتبقي الإنسان مسؤولاً عن القرارات الحساسة." : "Chatwoot centralizes the inbox while Wasla prepares thoughtful replies and keeps humans accountable for sensitive decisions."}</p></div>
        <span className={"inbox-status " + (inbox.configured ? "is-ready" : "")}><i />{inbox.configured ? (ar ? "Chatwoot متصل" : "Chatwoot connected") : (ar ? "غير متصل" : "Not connected")}</span>
      </div>
      {!inbox.configured ? <div className="growth-empty is-inbox"><span><MessageCircle size={25} /></span><h3>{ar ? "اربط صندوق المحادثات أولاً." : "Connect your customer inbox first."}</h3><p>{ar ? "اربط حساب Chatwoot من قسم القنوات. نُشفّر بيانات الدخول ولا نعيدها بعد الحفظ." : "Connect your Chatwoot account in Socials. Credentials are encrypted and never returned after saving."}</p><button type="button" onClick={onConnect}>{ar ? "افتح إعدادات القنوات" : "Open channel settings"}</button></div> : inbox.conversations.length ? <div className="inbox-list">{inbox.conversations.map((conversation) => (
        <button type="button" key={conversation.id} onClick={() => onOpen(conversation)}>
          <span className="inbox-avatar">{conversation.contact.avatar ? <img src={conversation.contact.avatar} alt="" /> : conversation.contact.name.slice(0, 2).toUpperCase()}</span>
          <span className="inbox-copy"><strong>{conversation.contact.name}</strong><small>{conversation.last_message || (ar ? "افتح المحادثة" : "Open conversation")}</small></span>
          <span className="inbox-meta"><small>{formatDate(conversation.last_activity_at, language)}</small>{conversation.unread_count ? <i>{conversation.unread_count}</i> : null}</span>
        </button>
      ))}</div> : <div className="growth-empty is-inbox"><span><CheckCircle2 size={25} /></span><h3>{ar ? "تمت قراءة كل المحادثات." : "You're all caught up."}</h3><p>{ar ? "ستظهر محادثات Chatwoot الجديدة هنا." : "New Chatwoot conversations will appear here."}</p></div>}
    </section>
  );
}

function AudienceModal({
  error,
  language,
  value,
  onChange,
  saving,
  onClose,
  onSave,
}: {
  error: string;
  language: Language;
  value: AudienceSegmentInput;
  onChange: (value: AudienceSegmentInput) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const ar = language === "ar";
  useGrowthModal(onClose);
  return createPortal(
    <div className="growth-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="growth-modal" role="dialog" aria-modal="true" aria-label={ar ? "إنشاء شريحة" : "Create audience segment"} dir={ar ? "rtl" : "ltr"}>
        <header><div><span>{ar ? "ذكاء الجمهور" : "Audience intelligence"}</span><h2>{ar ? "أنشئ شريحة قابلة للتنفيذ" : "Create an actionable segment"}</h2></div><button type="button" aria-label={ar ? "إغلاق" : "Close"} onClick={onClose}><X size={18} /></button></header>
        <div className="growth-modal__body growth-form-grid">
          {error ? <div className="growth-alert is-error is-wide" role="alert">{error}</div> : null}
          <label><span>{ar ? "اسم الشريحة" : "Segment name"}</span><input autoFocus value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder={ar ? "مثال: مزارع الألبان النامية" : "Example: Growth-stage dairy farms"} /></label>
          <label><span>{ar ? "النوع" : "Business model"}</span><select value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value as "B2B" | "B2C" })}><option value="B2B">B2B</option><option value="B2C">B2C</option></select></label>
          <label className="is-wide"><span>{ar ? "من هم؟" : "Who are they?"}</span><textarea value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} placeholder={ar ? "صف واقعهم، حجمهم، وسياق قرارهم…" : "Describe their reality, scale, and decision context…"} /></label>
          <label><span>{ar ? "المشاكل الأساسية" : "Core pains"}</span><CsvInput value={value.pains} onChange={(values) => onChange({ ...value, pains: values })} placeholder={ar ? "افصل بينها بفاصلة" : "Separate with commas"} /></label>
          <label><span>{ar ? "إشارات الشراء" : "Buying triggers"}</span><CsvInput value={value.triggers} onChange={(values) => onChange({ ...value, triggers: values })} /></label>
          <label><span>{ar ? "المهمة التي يريد إنجازها" : "Jobs to be done"}</span><CsvInput value={value.jobs_to_be_done} onChange={(values) => onChange({ ...value, jobs_to_be_done: values })} /></label>
          <label><span>{ar ? "الجغرافيا" : "Geography"}</span><CsvInput value={value.geography} onChange={(values) => onChange({ ...value, geography: values })} /></label>
          <label><span>{ar ? "حجم الجمهور المتوقع" : "Estimated audience size"}</span><input type="number" min={0} value={value.estimated_size} onChange={(event) => onChange({ ...value, estimated_size: Number(event.target.value) })} /></label>
          <fieldset className="growth-channel-picker is-wide"><legend>{ar ? "القنوات المناسبة" : "Best-fit channels"}</legend>{(["instagram", "facebook", "tiktok", "whatsapp", "snapchat"] as SocialChannelProvider[]).map((channel) => <label key={channel}><input type="checkbox" checked={value.channels.includes(channel)} onChange={(event) => onChange({ ...value, channels: event.target.checked ? [...value.channels, channel] : value.channels.filter((item) => item !== channel) })} /><span>{channel}</span></label>)}</fieldset>
        </div>
        <footer><button type="button" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button><button type="button" className="is-primary" onClick={onSave} disabled={saving || !value.name.trim()}>{saving ? <RefreshCw className="is-spinning" size={16} /> : <Users size={16} />}{ar ? "إنشاء الشريحة" : "Create segment"}</button></footer>
      </section>
    </div>,
    document.getElementById("wasla-modal-root") ?? document.body,
  );
}

type CampaignDraft = {
  name: string;
  objective: string;
  audience_segment_id: string;
  channels: SocialChannelProvider[];
};

function CampaignModal({
  error,
  language,
  value,
  audiences,
  onChange,
  saving,
  onClose,
  onSave,
}: {
  error: string;
  language: Language;
  value: CampaignDraft;
  audiences: AudienceSegment[];
  onChange: (value: CampaignDraft) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const ar = language === "ar";
  useGrowthModal(onClose);
  return createPortal(
    <div className="growth-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="growth-modal is-compact" role="dialog" aria-modal="true" aria-label={ar ? "إنشاء حملة" : "Create campaign"} dir={ar ? "rtl" : "ltr"}>
        <header><div><span>{ar ? "من الهدف إلى التنفيذ" : "Objective to execution"}</span><h2>{ar ? "ابنِ حملة نمو" : "Build a growth campaign"}</h2></div><button type="button" aria-label={ar ? "إغلاق" : "Close"} onClick={onClose}><X size={18} /></button></header>
        <div className="growth-modal__body growth-form-grid">
          {error ? <div className="growth-alert is-error is-wide" role="alert">{error}</div> : null}
          <label className="is-wide"><span>{ar ? "اسم الحملة" : "Campaign name"}</span><input autoFocus value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></label>
          <label className="is-wide"><span>{ar ? "ما النتيجة التجارية المطلوبة؟" : "What commercial outcome should this create?"}</span><textarea value={value.objective} onChange={(event) => onChange({ ...value, objective: event.target.value })} placeholder={ar ? "مثال: حجز 20 عرضاً تجريبياً مؤهلاً خلال 30 يوماً" : "Example: Book 20 qualified demos in 30 days"} /></label>
          <label className="is-wide"><span>{ar ? "الجمهور" : "Audience"}</span><select value={value.audience_segment_id} onChange={(event) => onChange({ ...value, audience_segment_id: event.target.value })}><option value="">{ar ? "اختر شريحة" : "Choose a segment"}</option>{audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}</option>)}</select></label>
          <fieldset className="growth-channel-picker is-wide"><legend>{ar ? "القنوات" : "Channels"}</legend>{(["instagram", "facebook", "tiktok", "whatsapp", "snapchat"] as SocialChannelProvider[]).map((channel) => <label key={channel}><input type="checkbox" checked={value.channels.includes(channel)} onChange={(event) => onChange({ ...value, channels: event.target.checked ? [...value.channels, channel] : value.channels.filter((item) => item !== channel) })} /><span>{channel}</span></label>)}</fieldset>
          <div className="growth-policy-note is-wide"><ShieldCheck size={17} /><p>{ar ? "تبدأ الحملة كمسودة. لن تنشر وصلة أو تراسل أحداً حتى تكتمل القنوات وتوافق على المحتوى." : "Every campaign begins as a draft. Wasla will not publish or message anyone until channels are ready and content is approved."}</p></div>
        </div>
        <footer><button type="button" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button><button type="button" className="is-primary" onClick={onSave} disabled={saving || !value.name.trim() || !value.objective.trim()}>{saving ? <RefreshCw className="is-spinning" size={16} /> : <Rocket size={16} />}{ar ? "إنشاء الحملة" : "Create campaign"}</button></footer>
      </section>
    </div>,
    document.getElementById("wasla-modal-root") ?? document.body,
  );
}

type ContentDraft = {
  brief: string;
  channel: GrowthContentItem["channel"];
  format: string;
  audience_segment_id: string;
  connection_id: string;
  scheduled_for: string;
  media_urls: string;
};

function ContentReviewModal({ language, item, connections, onClose, onSaved }: {
  language: Language;
  item: GrowthContentItem;
  connections: GrowthOverview["connections"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ar = language === "ar";
  const locked = !["draft", "failed"].includes(item.status);
  const [title, setTitle] = useState(item.title);
  const [copy, setCopy] = useState(item.copy);
  const [format, setFormat] = useState(item.format);
  const [connectionId, setConnectionId] = useState(item.connection_id || "");
  const [schedule, setSchedule] = useState(localDateTime(item.scheduled_for));
  const [mediaUrls, setMediaUrls] = useState(item.media.map((asset) => asset.path).filter(Boolean).join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useGrowthModal(() => { if (!saving) onClose(); });
  async function save() {
    setSaving(true);
    setError("");
    try {
      await updateGrowthContent(item.id, {
        title, copy, format, connection_id: connectionId || null,
        scheduled_for: schedule ? new Date(schedule).toISOString() : null,
        media: csv(mediaUrls).map((path) => item.media.find((asset) => asset.path === path) || { path }),
      });
      onSaved();
    } catch (saveError) { setError(apiErrorMessage(saveError)); }
    finally { setSaving(false); }
  }
  return createPortal(
    <div className="growth-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="growth-modal content-review-modal" role="dialog" aria-modal="true" aria-label={ar ? "مراجعة المحتوى" : "Review content"} dir={ar ? "rtl" : "ltr"}>
        <header><div><span>{ar ? "أنت صاحب القرار" : "Your brand. Your final say."}</span><h2>{ar ? "راجع، حسّن، ثم اعتمد." : "Review, refine, then approve."}</h2></div><button type="button" aria-label={ar ? "إغلاق" : "Close"} disabled={saving} onClick={onClose}><X size={18} /></button></header>
        <div className="growth-modal__body growth-form-grid">
          {error || item.error_message ? <div className="growth-alert is-error is-wide" role="alert"><CircleAlert size={16} /><span>{error || item.error_message}</span></div> : null}
          {locked ? <div className="growth-policy-note is-wide"><ShieldCheck size={17} /><p>{ar ? "هذه النسخة أُرسلت بالفعل. راجع الحالة أو عدّل الجدولة في Postiz." : "This version has already been submitted. Check its status or manage the schedule in Postiz."}</p></div> : null}
          <label className="is-wide"><span>{ar ? "عنوان المسودة" : "Draft title"}</span><input value={title} disabled={locked || saving} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="is-wide"><span>{ar ? "النص الكامل" : "Full copy"}</span><textarea className="content-review-copy" value={copy} disabled={locked || saving} onChange={(event) => setCopy(event.target.value)} /><small>{copy.length.toLocaleString()} {ar ? "حرف — راجع حدود القناة قبل النشر" : "characters — check the channel's limits before publishing"}</small></label>
          {item.rationale ? <div className="growth-agent-context is-wide"><Lightbulb size={18} /><div><strong>{ar ? "لماذا هذا الاتجاه؟" : "Why this approach?"}</strong><span>{item.rationale}</span></div></div> : null}
          {item.visual_direction ? <div className="growth-agent-context is-wide"><Sparkles size={18} /><div><strong>{ar ? "التوجه البصري" : "Visual direction"}</strong><span>{item.visual_direction}</span></div></div> : null}
          <label><span>{ar ? "الصيغة" : "Format"}</span><select value={format} disabled={locked || saving} onChange={(event) => setFormat(event.target.value)}><option value="post">{ar ? "منشور" : "Post"}</option><option value="carousel">{ar ? "كاروسيل" : "Carousel"}</option><option value="story">{ar ? "قصة" : "Story"}</option><option value="video_script">{ar ? "نص فيديو — مسودة فقط" : "Video script — draft only"}</option></select></label>
          <label><span>{ar ? "حساب النشر" : "Publishing account"}</span><select value={connectionId} disabled={locked || saving} onChange={(event) => setConnectionId(event.target.value)}><option value="">{ar ? "اختر حساباً" : "Choose an account"}</option>{connections.filter((connection) => connection.provider === item.channel).map((connection) => <option value={connection.id} key={connection.id}>{connection.display_name}</option>)}</select></label>
          <label className="is-wide"><span>{ar ? "موعد النشر — توقيت جهازك" : "Publishing time — your local timezone"}</span><input type="datetime-local" value={schedule} disabled={locked || saving} onChange={(event) => setSchedule(event.target.value)} /><small>{ar ? "إذا تركته فارغاً، ستكون الجدولة بعد عشر دقائق من الإرسال." : "Leave blank to schedule 10 minutes after submission."}</small></label>
          <label className="is-wide"><span>{ar ? "روابط الوسائط العامة HTTPS" : "Public HTTPS media URLs"}</span><textarea value={mediaUrls} disabled={locked || saving} onChange={(event) => setMediaUrls(event.target.value)} /><small>{ar ? "رابط لكل سطر. أضف وسائط تملك حق استخدامها؛ لم يتم إنشاء صور أو فيديو تلقائياً." : "One URL per line. Use media you have rights to; images and videos are not generated automatically."}</small></label>
          {item.channel === "tiktok" ? <div className="growth-policy-note is-wide"><CircleAlert size={17} /><p>{ar ? "تيك توك: نرفع المحتوى للمراجعة. يجب إكمال النشر من تطبيق تيك توك عند وصول الإشعار." : "TikTok uses inbox upload: you must finish publishing inside TikTok when its notification arrives."}</p></div> : null}
          {!locked ? <div className="growth-policy-note is-wide"><ShieldCheck size={17} /><p>{ar ? "الحفظ يعيد المسودة للمراجعة. اعتمد هذه النسخة أولاً، ثم اختر الجدولة بشكل منفصل." : "Saving resets approval. Approve this version first, then schedule it as a separate action."}</p></div> : null}
        </div>
        <footer><button type="button" disabled={saving} onClick={onClose}>{ar ? "إغلاق" : "Close"}</button>{!locked ? <button type="button" className="is-primary" disabled={saving || !title.trim() || !copy.trim()} onClick={save}>{saving ? <RefreshCw className="is-spinning" size={16} /> : <Check size={16} />}{ar ? "حفظ للمراجعة" : "Save for approval"}</button> : null}</footer>
      </section>
    </div>, document.getElementById("wasla-modal-root") ?? document.body,
  );
}

function ContentModal({
  error,
  language,
  value,
  audiences,
  connections,
  brandReady,
  onChange,
  saving,
  onClose,
  onGenerate,
  onOpenBrand,
}: {
  error: string;
  language: Language;
  value: ContentDraft;
  audiences: AudienceSegment[];
  connections: GrowthOverview["connections"];
  brandReady: boolean;
  onChange: (value: ContentDraft) => void;
  saving: boolean;
  onClose: () => void;
  onGenerate: () => void;
  onOpenBrand: () => void;
}) {
  const ar = language === "ar";
  useGrowthModal(onClose);
  const matchingConnections = connections.filter((item) => item.provider === value.channel);
  return createPortal(
    <div className="growth-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="growth-modal" role="dialog" aria-modal="true" aria-label={ar ? "إنشاء محتوى" : "Create content"} dir={ar ? "rtl" : "ltr"}>
        <header><div><span>{ar ? "وكيل المحتوى" : "Wasla content agent"}</span><h2>{ar ? "حوّل هدفاً إلى مسودة مدروسة" : "Turn an objective into a thoughtful draft"}</h2></div><button type="button" aria-label={ar ? "إغلاق" : "Close"} onClick={onClose}><X size={18} /></button></header>
        <div className="growth-modal__body growth-form-grid">
          {error ? <div className="growth-alert is-error is-wide" role="alert">{error}</div> : null}
          {!brandReady ? <div className="growth-policy-note is-warning is-wide"><CircleAlert size={17} /><p>{ar ? "تحتاج وصلة إلى 40٪ على الأقل من هوية النشاط قبل الكتابة. هذا يمنع المحتوى العام والرديء." : "Wasla needs at least 40% of Business DNA before writing. This prevents generic, low-quality content."}<button type="button" onClick={onOpenBrand}>{ar ? "أكمل الهوية" : "Complete Business DNA"}</button></p></div> : null}
          <label className="is-wide"><span>{ar ? "ماذا تريد أن يحقق المحتوى؟" : "What should this content accomplish?"}</span><textarea autoFocus value={value.brief} onChange={(event) => onChange({ ...value, brief: event.target.value })} placeholder={ar ? "مثال: وضّح تكلفة التأخير واجعل مدير العمليات يطلب تقييماً…" : "Example: Surface the cost of delay and make an operations leader request an assessment…"} /></label>
          <label><span>{ar ? "القناة" : "Channel"}</span><select value={value.channel} onChange={(event) => onChange({ ...value, channel: event.target.value as GrowthContentItem["channel"], connection_id: "" })}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option></select></label>
          <label><span>{ar ? "الصيغة" : "Format"}</span><select value={value.format} onChange={(event) => onChange({ ...value, format: event.target.value })}><option value="post">{ar ? "منشور" : "Post"}</option><option value="carousel">{ar ? "كاروسيل" : "Carousel"}</option><option value="story">{ar ? "قصة" : "Story"}</option><option value="video_script">{ar ? "نص فيديو" : "Video script"}</option></select></label>
          <label><span>{ar ? "الجمهور" : "Audience"}</span><select value={value.audience_segment_id} onChange={(event) => onChange({ ...value, audience_segment_id: event.target.value })}><option value="">{ar ? "الجمهور العام" : "General audience"}</option>{audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}</option>)}</select></label>
          <label><span>{ar ? "الحساب المتصل" : "Publishing account"}</span><select value={value.connection_id} onChange={(event) => onChange({ ...value, connection_id: event.target.value })}><option value="">{ar ? "اختر لاحقاً" : "Choose later"}</option>{matchingConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.display_name}</option>)}</select></label>
          <label className="is-wide"><span>{ar ? "موعد مقترح" : "Suggested publishing time"}</span><input type="datetime-local" value={value.scheduled_for} onChange={(event) => onChange({ ...value, scheduled_for: event.target.value })} /></label>
          <label className="is-wide"><span>{ar ? "روابط الصور أو الفيديو" : "Image or video URLs"}</span><textarea value={value.media_urls} onChange={(event) => onChange({ ...value, media_urls: event.target.value })} placeholder={ar ? "ألصق روابط HTTPS عامة، وافصل بينها بفاصلة أو سطر جديد" : "Paste public HTTPS URLs, separated by commas or new lines"} /><small>{ar ? "مطلوب لإنستغرام وتيك توك. ترفعها وصلة بأمان إلى Postiz عند الجدولة." : "Required for Instagram and TikTok. Wasla securely imports them into Postiz when scheduling."}</small></label>
          <div className="growth-agent-context is-wide"><Sparkles size={18} /><div><strong>{ar ? "سياق وصلة المستخدم" : "Context Wasla will use"}</strong><span>{ar ? "هوية النشاط · عرض القيمة · شخصية العلامة · الجمهور · الهدف · القناة" : "Business DNA · value proposition · brand voice · audience · objective · channel"}</span></div></div>
        </div>
        <footer><button type="button" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button><button type="button" className="is-primary" onClick={onGenerate} disabled={saving || !brandReady || !value.brief.trim()}>{saving ? <RefreshCw className="is-spinning" size={16} /> : <Wand2 size={16} />}{ar ? "إنشاء المسودة" : "Generate draft"}</button></footer>
      </section>
    </div>,
    document.getElementById("wasla-modal-root") ?? document.body,
  );
}

function ConversationModal({ language, conversation, onClose }: { language: Language; conversation: InboxConversation; onClose: () => void }) {
  const ar = language === "ar";
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useGrowthModal(() => { if (!sending && !drafting) onClose(); });
  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    setError("");
    try {
      await replyToGrowthConversation(conversation.id, reply);
      setSent(true);
      setReply("");
    } catch (sendError) {
      setError(apiErrorMessage(sendError));
    } finally {
      setSending(false);
    }
  }
  async function draftReply() {
    setDrafting(true);
    setError("");
    try {
      const result = await suggestGrowthConversationReply(conversation.id);
      setReply(result.suggestion);
    } catch (draftError) {
      setError(apiErrorMessage(draftError));
    } finally {
      setDrafting(false);
    }
  }
  return createPortal(
    <div className="growth-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="growth-modal conversation-modal" role="dialog" aria-modal="true" dir={ar ? "rtl" : "ltr"}>
        <header><div><span>{conversation.inbox.name}</span><h2>{conversation.contact.name}</h2></div><button type="button" aria-label={ar ? "إغلاق" : "Close"} onClick={onClose}><X size={18} /></button></header>
        <div className="growth-modal__body">
          <div className="conversation-contact"><span className="inbox-avatar">{conversation.contact.name.slice(0, 2).toUpperCase()}</span><div><strong>{conversation.contact.name}</strong><small>{conversation.contact.phone || conversation.contact.email || (ar ? "عميل عبر القناة" : "Channel customer")}</small></div><span className="conversation-status"><i />{conversation.status}</span></div>
          <div className="conversation-message"><small>{ar ? "آخر رسالة" : "Latest message"}</small><p>{conversation.last_message || (ar ? "لا يوجد نص للرسالة." : "No message text available.")}</p><span>{formatDate(conversation.last_activity_at, language)}</span></div>
          <div className="conversation-ai-note"><Sparkles size={17} /><div><strong>{ar ? "مسودة مدروسة بهوية نشاطك" : "A thoughtful draft grounded in your business"}</strong><p>{ar ? "تقرأ وصلة سياق المحادثة وهوية النشاط، ثم تكتب رداً للمراجعة. لن يُرسل شيء دون موافقتك." : "Wasla reads the conversation and Business DNA, then prepares a reply for review. Nothing is sent without your approval."}</p></div><button type="button" onClick={draftReply} disabled={drafting}>{drafting ? <RefreshCw className="is-spinning" size={14} /> : <Sparkles size={14} />}{ar ? "اقترح رداً" : "Draft with Wasla"}</button></div>
          {error ? <div className="growth-alert is-error"><CircleAlert size={16} /><span>{error}</span></div> : null}
          {sent ? <div className="growth-alert is-success"><Check size={16} /><span>{ar ? "تم إرسال الرد عبر Chatwoot." : "Reply sent through Chatwoot."}</span></div> : null}
          <label className="conversation-reply"><span>{ar ? "ردك" : "Your reply"}</span><textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder={ar ? "اكتب رداً واضحاً ومفيداً…" : "Write a clear, helpful response…"} /></label>
        </div>
        <footer><button type="button" onClick={onClose}>{ar ? "إغلاق" : "Close"}</button><button type="button" className="is-primary" onClick={sendReply} disabled={sending || !reply.trim()}>{sending ? <RefreshCw className="is-spinning" size={16} /> : <Send size={16} />}{ar ? "إرسال عبر Chatwoot" : "Send through Chatwoot"}</button></footer>
      </section>
    </div>,
    document.getElementById("wasla-modal-root") ?? document.body,
  );
}

export function WaslaTutorial({
  language,
  workspaceKey = "preview",
  onNavigate,
  onStartTour,
}: {
  language: Language;
  workspaceKey?: string;
  onNavigate: (section: "growth" | "agent" | "leads" | "socials") => void;
  onStartTour: () => void;
}) {
  const ar = language === "ar";
  const storageKey = `wasla:tutorial-progress:${workspaceKey}`;
  const [completed, setCompleted] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || "[]") as string[];
    } catch {
      return [];
    }
  });
  const steps = [
    { id: "dna", icon: BrainCircuit, title: ar ? "عرّف وصلة على نشاطك" : "Teach Wasla your business", body: ar ? "أدخل المنتج، عرض القيمة، شخصية العلامة، الأسواق، والهدف. هذه هي الذاكرة التي يستخدمها كل وكيل." : "Add your offer, value proposition, brand voice, markets, and goals. This becomes shared intelligence for every agent.", action: "growth" as const },
    { id: "audience", icon: Users, title: ar ? "قسّم جمهورك حسب الدافع" : "Segment by motivation", body: ar ? "أنشئ شرائح تربط المشكلة وإشارة الشراء والمهمة والمكان والقناة." : "Create segments that connect pains, buying triggers, jobs, geography, and channel fit.", action: "growth" as const },
    { id: "lead", icon: Radar, title: ar ? "ابحث عن العملاء المناسبين" : "Source the right leads", body: ar ? "ابدأ محادثة B2B أو B2C. وصلة تسأل فقط عما يحسن جودة النتيجة ثم تحفظ العملاء في المخزون." : "Start a B2B or B2C conversation. Wasla asks only what improves result quality, then saves matches to inventory.", action: "agent" as const },
    { id: "research", icon: Globe2, title: ar ? "ابحث قبل أن تتواصل" : "Research before outreach", body: ar ? "افتح بحث العميل لفهم الشركة والأشخاص والإشارات الحديثة وطريقة العرض المقترحة." : "Open lead research to understand the company, people, current signals, and recommended pitch.", action: "leads" as const },
    { id: "channels", icon: MessageCircle, title: ar ? "اربط القنوات بأمان" : "Connect channels safely", body: ar ? "اربط حسابات المنصات، واختر مستوى الاستقلالية وسياسة الموافقة. تبقى الأسرار مشفرة على الخادم." : "Connect platform accounts, then choose autonomy and approval policy. Secrets stay encrypted server-side.", action: "socials" as const },
    { id: "content", icon: PenTool, title: ar ? "أنشئ واعتمد وجدول" : "Create, approve, and schedule", body: ar ? "حوّل هدف الحملة إلى مسودة مبنية على العلامة والجمهور. اعتمدها ثم أرسلها إلى Postiz." : "Turn a campaign objective into a brand- and audience-aware draft. Approve it, then schedule through Postiz.", action: "growth" as const },
    { id: "close", icon: Target, title: ar ? "حوّل المحادثة إلى صفقة" : "Move conversation to revenue", body: ar ? "استخدم صندوق Chatwoot الموحد، تابع الخطوة التالية لكل عميل، وراقب انتقاله في مسار الإيراد حتى الإغلاق." : "Use the unified Chatwoot inbox, track each customer's next action, and watch the revenue journey move toward closed won.", action: "growth" as const },
  ];
  function toggle(id: string) {
    const next = completed.includes(id) ? completed.filter((item) => item !== id) : [...completed, id];
    setCompleted(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }
  const percent = Math.round((completed.length / steps.length) * 100);
  return (
    <div className="wasla-academy" dir={ar ? "rtl" : "ltr"}>
      <header className="academy-hero">
        <div><span><Sparkles size={14} />{ar ? "ابدأ بقوة" : "Wasla quickstart"}</span><h1>{ar ? "من أول دخول إلى أول صفقة." : "From first login to first closed deal."}</h1><p>{ar ? "مسار عملي يعلّم فريقك كيف تستخدم وصلة كنظام نمو كامل، لا كقائمة أدوات منفصلة." : "A practical path showing your team how Wasla works as one growth system—not a collection of disconnected tools."}</p></div>
        <button type="button" onClick={onStartTour}><Lightbulb size={16} />{ar ? "ابدأ الجولة التفاعلية" : "Start interactive tour"}</button>
      </header>
      <section className="academy-progress"><div><strong>{percent}%</strong><span>{ar ? "اكتمل الإعداد" : "setup complete"}</span></div><i><b style={{ width: percent + "%" }} /></i><small>{completed.length} / {steps.length} {ar ? "خطوات" : "steps"}</small></section>
      <section className="academy-steps">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const done = completed.includes(step.id);
          return (
            <article key={step.id} className={done ? "is-done" : ""}>
              <button type="button" className="academy-check" onClick={() => toggle(step.id)} aria-label={done ? "Mark incomplete" : "Mark complete"}>{done ? <Check size={16} /> : <span>{index + 1}</span>}</button>
              <div className="academy-step-icon"><Icon size={20} /></div>
              <div><span>{ar ? "الخطوة" : "Step"} {index + 1}</span><h2>{step.title}</h2><p>{step.body}</p></div>
              <button type="button" className="academy-open" onClick={() => onNavigate(step.action)}>{ar ? "افتح" : "Open"}<ChevronRight size={15} /></button>
            </article>
          );
        })}
      </section>
      <footer className="academy-finish"><ShieldCheck size={20} /><div><strong>{ar ? "قاعدة وصلة الذهبية" : "Wasla's golden rule"}</strong><p>{ar ? "الذكاء يقترح ويجهّز ويرتب الأولويات. الإنسان يحدد السياسة ويوافق على الإجراءات التي تمثل العلامة أمام الجمهور." : "AI recommends, prepares, and prioritizes. People define policy and approve actions that represent the brand in public."}</p></div></footer>
    </div>
  );
}
