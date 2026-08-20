import {
  Activity,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  BadgeCheck,
  ChevronDown,
  CircleDot,
  Clock3,
  Command,
  Database,
  FileText,
  Gift,
  LayoutDashboard,
  LogIn,
  Lock,
  Mail,
  Play,
  Plus,
  PhoneCall,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UserPlus,
  WalletCards,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, Chip, ProgressBar, Separator, Surface, Table, Tabs, Toast } from "@heroui/react";
import { liquidMetalFragmentShader, ShaderMount } from "@paper-design/shaders";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { emailTemplates, leads as demoLeads, productProfile, proposals, research as demoResearch } from "./data/demoData";
import {
  apiErrorMessage,
  fetchApifyLeads,
  fetchAdminLeads,
  getAccount,
  hasDirectus,
  researchLead,
  understandLeadAsk,
} from "./lib/directus";
import type { AdminLead } from "./lib/directus";
import type { CompanyResearch, IntakeState, Lead } from "./types";
import { LeadFlowVisual } from "./components/LeadFlowVisual";
import { WaslaBrand } from "./components/WaslaBrand";
import { AuthDialog } from "./components/AuthDialog";
import { ProductTour } from "./components/ProductTour";
import { CelebrationToast, EmptyWorkspace } from "./components/WorkspaceStates";
import { AdminLeadExplorer } from "./components/AdminLeadExplorer";
import { LegalPage } from "./components/LegalPage";
import { accountToAuthUser } from "./lib/authUser";
import type { AuthUser } from "./lib/authUser";
import { LanguageToggle, useLanguage } from "./i18n";

const navItems = [
  { to: "/console", labelKey: "console.overview", icon: LayoutDashboard },
  { to: "/console/agent", labelKey: "console.agent", icon: Sparkles },
  { to: "/console/leads", labelKey: "console.leads", icon: Building2 },
  { to: "/console/insights", labelKey: "console.insights", icon: BarChart3 },
  { to: "/console/proposals", labelKey: "console.proposals", icon: FileText },
  { to: "/console/email-templates", labelKey: "console.emails", icon: Mail },
];

const storedAuthKey = "waslah-auth-user";

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>(demoLeads);
  const [research, setResearch] = useState<CompanyResearch[]>(demoResearch);
  const [pendingLeadAsk, setPendingLeadAsk] = useState("ابغى عملاء مناسبين لخدمة وصلات المبيعات في الرياض");
  const [authOpen, setAuthOpen] = useState(location.pathname === "/auth" || location.pathname === "/secure" || location.pathname === "/auth/social");
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [celebration, setCelebration] = useState<{ title: string; body: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(storedAuthKey);
    return stored ? JSON.parse(stored) as AuthUser : null;
  });

  useEffect(() => {
    if (authUser) {
      localStorage.setItem(storedAuthKey, JSON.stringify(authUser));
    } else {
      localStorage.removeItem(storedAuthKey);
    }
  }, [authUser]);

  useEffect(() => {
    if (!hasDirectus) {
      setAuthReady(true);
      return;
    }
    getAccount()
      .then((account) => setAuthUser(accountToAuthUser(account)))
      .catch(() => setAuthUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (location.pathname === "/auth" || location.pathname === "/secure" || location.pathname === "/auth/social") setAuthOpen(true);
    setRouteLoading(true);
    const timer = window.setTimeout(() => setRouteLoading(false), 360);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  function closeAuth() {
    setAuthOpen(false);
    if (location.pathname === "/auth" || location.pathname === "/secure" || location.pathname === "/auth/social") navigate("/");
  }

  function openAuth(mode: "signup" | "login" = "signup") {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  function showCelebration(message: { title: string; body: string }) {
    setCelebration(message);
    window.setTimeout(() => setCelebration(null), 6500);
  }

  function enterWorkspace(user: AuthUser) {
    setAuthUser(user);
    setAuthReady(true);
    navigate("/console");
  }

  return (
    <>
      <div className={`route-loader${routeLoading ? " is-visible" : ""}`} aria-hidden="true"><span /></div>
      <div className="page-transition" key={location.pathname}>
        <Routes>
          <Route path="/" element={<LandingChat user={authUser} onLeadAsk={setPendingLeadAsk} onAuthOpen={openAuth} />} />
          <Route path="/secure" element={<LandingChat user={authUser} onLeadAsk={setPendingLeadAsk} onAuthOpen={openAuth} />} />
          <Route path="/auth" element={<LandingChat user={authUser} onLeadAsk={setPendingLeadAsk} onAuthOpen={openAuth} />} />
          <Route path="/auth/social" element={<LandingChat user={authUser} onLeadAsk={setPendingLeadAsk} onAuthOpen={openAuth} />} />
          <Route path="/privacy" element={<LegalPage page="privacy" />} />
          <Route path="/permissions" element={<LegalPage page="permissions" />} />
          <Route path="/console/*" element={authReady
            ? authUser
              ? <ConsoleShell user={authUser} initialAsk={pendingLeadAsk} leads={leads} research={research} setLeads={setLeads} setResearch={setResearch} onAuthOpen={() => openAuth("signup")} />
              : <Navigate to="/auth" replace />
            : <ConsoleSessionLoading />} />
        </Routes>
      </div>
      <AuthDialog initialMode={authMode} open={authOpen} user={authUser} onClose={closeAuth} onAuthenticated={(nextUser) => { setAuthUser(nextUser); setAuthReady(true); }} onCelebration={showCelebration} onReady={enterWorkspace} />
      <CelebrationToast message={celebration} onClose={() => setCelebration(null)} />
    </>
  );
}

function ConsoleSessionLoading() {
  return <main className="console-session-loading"><WaslaBrand variant="symbol" inverse /><RefreshCw className="is-spinning" size={18} /><span>Securing workspace</span></main>;
}

function ConsoleShell({
  user,
  initialAsk,
  leads,
  research,
  setLeads,
  setResearch,
  onAuthOpen,
}: {
  user: AuthUser | null;
  initialAsk: string;
  leads: Lead[];
  research: CompanyResearch[];
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  setResearch: Dispatch<SetStateAction<CompanyResearch[]>>;
  onAuthOpen: (mode?: "signup" | "login") => void;
}) {
  const { direction, language, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = location.pathname.includes("leads")
    ? "leads"
    : location.pathname.includes("agent")
      ? "agent"
      : location.pathname.includes("insights")
        ? "insights"
        : location.pathname.includes("proposals")
          ? "proposals"
          : location.pathname.includes("email-templates")
            ? "emails"
            : "overview";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [chatInput, setChatInput] = useState(initialAsk);
  const [consoleMessages, setConsoleMessages] = useState([
    { role: "assistant", text: language === "ar" ? "صف لي السوق، المدينة، وصانع القرار. سأحوّلها إلى مهمة واضحة قبل صرف أي رصيد." : "Describe the market, city, and decision maker. I will turn it into a clear mission before using any credit." },
  ]);
  const [intake, setIntake] = useState<IntakeState>({
    confidence: 0,
    summary: language === "ar" ? "بانتظار معايير العميل المطلوب." : "Waiting for target criteria.",
    missing: language === "ar" ? ["القطاع المستهدف", "المدينة أو السوق", "صانع القرار"] : ["target industry", "location or market", "buyer role or decision maker"],
    apifyActor: "",
    apifyInput: {},
  });
  const [busy, setBusy] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [leadRunTick, setLeadRunTick] = useState(0);
  const [workspaceStarted, setWorkspaceStarted] = useState(() => Boolean(user?.isAdmin || (user && window.localStorage.getItem(`wasla:first-request:${user.id}`))));

  const avgFit = leads.length ? Math.round(leads.reduce((sum, lead) => sum + lead.fitScore, 0) / leads.length) : 0;
  const potential = leads.reduce((sum, lead) => sum + lead.revenueEstimate, 0);
  const tabLabels: Record<string, string> = {
    overview: t("console.overview"),
    agent: t("console.agent"),
    leads: user?.isAdmin ? (language === "ar" ? "مخزون العملاء" : "Lead inventory") : t("console.leads"),
    insights: t("console.insights"),
    proposals: t("console.proposals"),
    emails: t("console.emails"),
  };
  const onboardingSteps = language === "ar" ? [
    { target: "agent", eyebrow: "1 من 4 · ابدأ من هنا", title: "صف العميل كما تصفه لزميلك", body: "اكتب القطاع والمدينة وصانع القرار. الوكيل يسألك فقط عن المعلومة الناقصة قبل تشغيل أي مصدر مدفوع." },
    { target: "pipeline", eyebrow: "2 من 4 · مسار واضح", title: "راقب كل مرحلة، لا صندوقاً أسود", body: "كل مهمة تمر بالفهم والجمع والتنقية والاتصال والتأهيل ثم كشف البيانات. الحالة محفوظة في Directus." },
    { target: "wallet", eyebrow: "3 من 4 · تحكم بالتكلفة", title: "رصيدك تحت سيطرتك", body: "رصيد البداية 30 ر.س يظهر هنا. لا تُكشف بيانات أي عميل ولا يُخصم رصيد من دون استحقاق واضح." },
    { target: "leads", eyebrow: "4 من 4 · النتيجة", title: "العملاء المؤهلون يعيشون هنا", body: "افتح سجل العميل لترى سبب التأهيل، ملخص المكالمة، الإجابات المنظمة، والخطوة التالية المقترحة." },
  ] : [
    { target: "agent", eyebrow: "1 of 4 · Start here", title: "Describe the buyer like you would to a colleague", body: "Name the industry, city, and decision maker. The agent asks only for missing criteria before using paid sources." },
    { target: "pipeline", eyebrow: "2 of 4 · Clear workflow", title: "See every stage, not a black box", body: "Each mission moves through understanding, sourcing, refinement, calling, qualification, and reveal. Directus stores every state." },
    { target: "wallet", eyebrow: "3 of 4 · Cost control", title: "Keep your credit under control", body: "Your 30 SAR welcome credit appears here. Lead details are revealed only when the result is useful and eligible." },
    { target: "leads", eyebrow: "4 of 4 · The outcome", title: "Qualified leads live here", body: "Open a lead to see why they qualified, the call summary, structured answers, and the recommended next step." },
  ];

  function selectTab(key: string) {
    setActiveTab(key);
    const paths: Record<string, string> = {
      overview: "/console",
      agent: "/console/agent",
      leads: "/console/leads",
      insights: "/console/insights",
      proposals: "/console/proposals",
      emails: "/console/email-templates",
    };
    navigate(paths[key] ?? "/console");
  }

  function startNewChat() {
    setChatInput("");
    setConsoleMessages([
      {
        role: "assistant",
        text: language === "ar"
          ? "صف لي السوق والمدينة وصانع القرار. سأفهم المطلوب معك ثم أبدأ بجلب العملاء."
          : "Tell me the market, location, and decision maker. I’ll shape the brief with you, then start finding leads.",
      },
    ]);
    setIntake({
      confidence: 0,
      summary: language === "ar" ? "بانتظار معايير العميل المطلوب." : "Waiting for target criteria.",
      missing: language === "ar" ? ["القطاع المستهدف", "المدينة أو السوق", "صانع القرار"] : ["target industry", "location or market", "buyer role or decision maker"],
      apifyActor: "",
      apifyInput: {},
    });
    setLeadRunTick(0);
    selectTab("agent");
    window.setTimeout(() => document.querySelector<HTMLInputElement>(".ops-chat-composer input")?.focus(), 100);
  }

  function focusWorkspaceSearch() {
    if (user?.isAdmin) {
      selectTab("leads");
      window.setTimeout(() => document.querySelector<HTMLInputElement>(".admin-inventory__search input")?.focus(), 80);
      return;
    }
    selectTab("agent");
    window.setTimeout(() => document.querySelector<HTMLInputElement>(".ops-chat-composer input")?.focus(), 80);
  }

  const syncAdminInventory = useCallback((items: AdminLead[]) => {
    setLeads(items.map(adminLeadToLead));
  }, [setLeads]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    fetchAdminLeads({ limit: 100, sort: "enrichment_score" })
      .then((result) => syncAdminInventory(result.data))
      .catch(() => undefined);
  }, [syncAdminInventory, user?.isAdmin]);

  useEffect(() => {
    if (!user?.verifiedPhone) return;
    const onboardingKey = `wasla:onboarding:${user.id}`;
    if (window.localStorage.getItem(onboardingKey) !== "pending") return;
    const timer = window.setTimeout(() => setTourOpen(true), 650);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    const focusMissionSearch = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      focusWorkspaceSearch();
    };
    window.addEventListener("keydown", focusMissionSearch);
    return () => window.removeEventListener("keydown", focusMissionSearch);
  });

  function completeTour() {
    if (user) window.localStorage.setItem(`wasla:onboarding:${user.id}`, "complete");
    setTourOpen(false);
  }

  async function sendConsoleMessage(text = chatInput) {
    if (!text.trim() || busy) return;
    const nextMessages = [...consoleMessages, { role: "user", text }];
    setConsoleMessages(nextMessages);
    setChatInput("");
    setBusy(true);
    Toast.toast.info(language === "ar" ? "جارٍ تحليل معايير العملاء..." : "Analyzing lead criteria...");
    const result = await understandLeadAsk(text, nextMessages.map((message) => `${message.role}: ${message.text}`));
    setIntake(result);
    setConsoleMessages([
      ...nextMessages,
      {
        role: "assistant",
        text: result.confidence === 100
          ? (language === "ar" ? `المهمة جاهزة: ${result.summary}` : `Ready: ${result.summary}`)
          : (language === "ar" ? `ما زلنا نحتاج: ${result.missing.join("، ")}.` : `Still missing ${result.missing.join(", ")}.`),
      },
    ]);
    Toast.toast.success(result.confidence === 100 ? (language === "ar" ? "موجز المهمة جاهز" : "Lead brief is ready") : (language === "ar" ? "تم تحديث الموجز" : "Lead brief updated"));
    setBusy(false);
  }

  async function runConsoleFetch() {
    if (user?.isAdmin) {
      focusWorkspaceSearch();
      return;
    }
    if (!user?.verifiedPhone) {
      onAuthOpen();
      return;
    }
    if (intake.confidence < 100) {
      Toast.toast.info("أكمل القطاع والمدينة وصانع القرار أولاً.");
      return;
    }
    setLeadRunTick((current) => current + 1);
    setBusy(true);
    Toast.toast.info(language === "ar" ? "جارٍ تشغيل مهمة العملاء..." : "Starting lead mission...");
    try {
      const fetched = await fetchApifyLeads(intake);
      setLeads((current) => [...fetched, ...current]);
      window.localStorage.setItem(`wasla:first-request:${user.id}`, "created");
      setWorkspaceStarted(true);
      Toast.toast.success(fetched.length ? (language === "ar" ? `تمت إضافة ${fetched.length} عملاء` : `Added ${fetched.length} leads`) : hasDirectus ? (language === "ar" ? "تم حفظ المهمة في Directus وإرسالها لمسار التنفيذ" : "Mission stored in Directus and sent to the execution workflow") : (language === "ar" ? "اربط Directus وApify للتشغيل الفعلي" : "Connect Directus and Apify to run live"));
    } catch (error) {
      Toast.toast.danger(apiErrorMessage(error, language === "ar" ? "تعذر بدء المهمة." : "Could not start the mission."));
    } finally {
      setBusy(false);
    }
  }

  async function handleResearch(lead: Lead) {
    setBusy(true);
    Toast.toast.info(language === "ar" ? `جارٍ بحث ${lead.company}...` : `Researching ${lead.company}...`);
    const entry = await researchLead(lead, productProfile.description) as CompanyResearch;
    setResearch((current) => [entry, ...current.filter((item) => item.leadId !== entry.leadId)]);
    Toast.toast.success(language === "ar" ? `تم تحديث بحث ${lead.company}` : `Research updated for ${lead.company}`);
    setBusy(false);
  }

  return (
    <>
      <Toast.Provider placement="top end" />
      <main className={`hconsole${language === "ar" ? " is-arabic" : ""}`} dir={direction}>
        <Surface className="hconsole-shell">
          <Card className="hconsole-sidebar">
            <Card.Content>
              <Link to="/" className="hconsole-brand">
                <WaslaBrand variant="horizontal" inverse />
                <small>{language === "ar" ? "عمليات العملاء" : "Lead Operations"}</small>
              </Link>
              <LanguageToggle inverse />
              <button className="hconsole-sidebar-search" onClick={focusWorkspaceSearch}>
                <Search size={15} />
                <span>{language === "ar" ? "ابحث في المساحة" : "Search workspace"}</span>
                <kbd><Command size={11} /> K</kbd>
              </button>
              <Separator />
              <div className="hconsole-nav">
                {navItems.map((item) => {
                  const key = item.to.split("/").at(-1) === "console" ? "overview" : item.to.split("/").at(-1)?.replace("email-templates", "emails") ?? "overview";
                  const Icon = item.icon;
                  return (
                    <Button key={item.to} data-tour={key === "leads" ? "leads" : key === "agent" ? "agent" : undefined} variant={activeTab === key ? "primary" : "secondary"} onClick={() => key === "agent" ? startNewChat() : selectTab(key)} className="hconsole-nav-button">
                      <Icon size={17} /> {user?.isAdmin && key === "leads" ? (language === "ar" ? "مخزون العملاء" : "Lead inventory") : t(item.labelKey)}
                    </Button>
                  );
                })}
              </div>
              <div className="hconsole-credit-card" data-tour="wallet">
                <div><WalletCards size={15} /><span>{language === "ar" ? "الرصيد المتاح" : "Available credit"}</span></div>
                <strong>{user?.verifiedPhone ? user.freeCreditSar : 30}<small>{language === "ar" ? "ر.س" : "SAR"}</small></strong>
                <span className="hconsole-credit-card__status"><i /> {user?.verifiedPhone ? (language === "ar" ? "محفظة موثقة" : "Verified wallet") : (language === "ar" ? "يوثّق بعد التسجيل" : "Unlocks after signup")}</span>
              </div>
              <div className="hconsole-profile-card">
                <AvatarMark user={user} />
                <div>
                  <strong>{user?.name ?? (language === "ar" ? "مساحة ضيف" : "Guest workspace")}</strong>
                  <small>{user?.business ?? (language === "ar" ? "وصلة التجريبية" : "Wasla demo")}</small>
                </div>
                <button aria-label={language === "ar" ? "إعدادات الحساب" : "Account settings"} data-tooltip={language === "ar" ? "الإعدادات" : "Settings"} onClick={() => Toast.toast.info(language === "ar" ? "إعدادات الحساب قيد التجهيز" : "Account settings are being prepared")}><Settings size={15} /></button>
              </div>
            </Card.Content>
          </Card>

          <section className="hconsole-main">
            <Card className="hconsole-topbar">
              <Card.Content>
                <div className="hconsole-context">
                  <span><CircleDot size={12} /> {user?.business ?? (language === "ar" ? "مساحة وصلة" : "Wasla workspace")}</span>
                  <strong>{tabLabels[activeTab] ?? "Overview"}</strong>
                </div>
                <div className="hconsole-actions">
                  <button className="hconsole-icon-button" aria-label={language === "ar" ? "الإشعارات" : "Notifications"} data-tooltip={language === "ar" ? "الإشعارات" : "Notifications"}><Bell size={16} /><i /></button>
                  <span className="hconsole-health"><i /> {language === "ar" ? "الأنظمة تعمل" : "Systems operational"}</span>
                  {!user && <Button variant="secondary" onClick={() => onAuthOpen("signup")}>{language === "ar" ? "إنشاء حساب" : "Create account"}</Button>}
                  <Button onClick={user?.isAdmin ? focusWorkspaceSearch : startNewChat}>{user?.isAdmin ? <Search size={16} /> : <Plus size={16} />} {user?.isAdmin ? (language === "ar" ? "بحث العملاء" : "Search leads") : t("console.agent")}<ChevronDown size={14} /></Button>
                </div>
              </Card.Content>
            </Card>

            <Tabs selectedKey={activeTab} onSelectionChange={(key) => selectTab(String(key))} className="hconsole-tabs">
              <Tabs.ListContainer>
                  <Tabs.List aria-label="Console sections">
                  <Tabs.Tab id="overview">{t("console.overview")}<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="agent">{t("console.agent")}<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="leads">{t("console.leads")}<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="insights">{t("console.insights")}<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="proposals">{t("console.proposals")}<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="emails">{t("console.emails")}<Tabs.Indicator /></Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>

              <Tabs.Panel id="overview">
                <div className="ops-dashboard">
                  <header className="ops-dashboard__heading">
                    <div>
                      <span><Activity size={14} /> {language === "ar" ? "غرفة عمليات العملاء" : "Lead operations room"}</span>
                      <h1>{language === "ar" ? "لوحة التحكم" : "Dashboard"}</h1>
                      <p>{language === "ar" ? "راقب البحث والتأهيل والاتصال من مكان واحد." : "Monitor sourcing, qualification, and outreach from one place."}</p>
                    </div>
                  </header>

                  <section className="ops-command-grid is-overview">
                    <div className="ops-panel ops-agent-launch" data-tour="agent">
                      <div className="ops-panel__head">
                        <div><Sparkles size={15} /><span>{t("console.agent")}</span></div>
                        <span className="ops-live"><i /> {language === "ar" ? "جاهز" : "Ready"}</span>
                      </div>
                      <div>
                        <h2>{language === "ar" ? "ابدأ محادثة، ثم شاهد العملاء يصلون." : "Start a conversation, then watch the leads arrive."}</h2>
                        <p>{language === "ar" ? "اكتب طلبك بطريقتك. المحادثة تضبط المعايير، ثم يظهر جدول العملاء واحداً بعد الآخر أثناء البحث." : "Ask in your own words. The chat sharpens the criteria, then reveals leads one by one while research runs."}</p>
                      </div>
                      <button onClick={startNewChat}>{t("console.agent")} {language === "ar" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</button>
                    </div>

                    <div className="ops-panel ops-usage" data-tour="wallet">
                      <div className="ops-panel__head"><div><WalletCards size={15} /><span>{language === "ar" ? "الاستخدام" : "Usage"}</span></div><small>{language === "ar" ? "أغسطس 2026" : "August 2026"}</small></div>
                      <strong>{user?.verifiedPhone ? user.freeCreditSar : 30}<small>{language === "ar" ? " ر.س" : " SAR"}</small></strong>
                      <p>{language === "ar" ? "الرصيد المتاح" : "Available balance"}</p>
                      <div className="ops-usage__chart" aria-hidden="true">{Array.from({ length: 42 }, (_, index) => <i key={index} className={index < 15 ? "is-used" : ""} />)}</div>
                      <footer><span>{language === "ar" ? "5.75 ر.س مستخدمة" : "5.75 SAR used"}</span>{language === "ar" ? <ArrowUpLeft size={14} /> : <ArrowUpRight size={14} />}</footer>
                    </div>

                    <div className="ops-panel ops-system">
                      <div className="ops-panel__head"><div><Zap size={15} /><span>{language === "ar" ? "محرك التأهيل" : "Qualification engine"}</span></div>{language === "ar" ? <ArrowUpLeft size={14} /> : <ArrowUpRight size={14} />}</div>
                      <h2>{language === "ar" ? "المصادر، الاتصال، وDirectus متصلة." : "Sourcing, calling, and Directus are connected."}</h2>
                      <div className="ops-system__services">
                        <span><Database size={14} /> Directus <i /></span>
                        <span><Search size={14} /> Apify <i /></span>
                        <span><PhoneCall size={14} /> Vapi <i /></span>
                      </div>
                    </div>
                  </section>

                  <section className="ops-work-grid">
                    <div className="ops-panel ops-recent">
                      <div className="ops-panel__head"><div><Clock3 size={15} /><span>{language === "ar" ? "آخر نشاط" : "Recent activity"}</span></div><button onClick={() => selectTab("leads")}>{language === "ar" ? "عرض الكل" : "View all"}{language === "ar" ? <ArrowUpLeft size={13} /> : <ArrowUpRight size={13} />}</button></div>
                      <div className="ops-recent__grid">
                        {leads.slice(0, 4).map((lead, index) => (
                          <button key={lead.id} onClick={() => selectTab("leads")}>
                            <span className="ops-company-mark">{lead.company.slice(0, 1)}</span>
                            <span><strong>{lead.company}</strong><small>{lead.industry} · {lead.location.split(",")[0]}</small></span>
                            <span className={`ops-status is-${lead.status}`}><i /> {leadStatusLabel(lead.status, language)}</span>
                            <small>{index + 2}{language === "ar" ? "س" : "h"}</small>
                            {language === "ar" ? <ArrowUpLeft size={14} /> : <ArrowUpRight size={14} />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="ops-panel ops-queue">
                      <div className="ops-panel__head"><div><PhoneCall size={15} /><span>{language === "ar" ? "قائمة التأهيل" : "Qualification queue"}</span></div><span className="ops-count">{leads.length}</span></div>
                      <div className="ops-queue__list">
                        {leads.slice(0, 3).map((lead, index) => (
                          <div key={lead.id}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <div><strong>{lead.name}</strong><small>{lead.title} · {lead.company}</small></div>
                            <b>{lead.fitScore}%</b>
                          </div>
                        ))}
                      </div>
                      <button className="ops-queue__action" onClick={() => selectTab("leads")}>{language === "ar" ? "فتح قائمة العملاء" : "Open lead queue"}{language === "ar" ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}</button>
                    </div>
                  </section>

                  {user && !workspaceStarted ? (
                    <EmptyWorkspace onStart={focusWorkspaceSearch} />
                  ) : (
                    <section className="ops-metrics" data-tour="pipeline">
                      <div><Target size={16} /><span>{language === "ar" ? "متوسط الملاءمة" : "Average fit"}</span><strong>{avgFit}%</strong><small>+8.4%</small></div>
                      <div><BriefcaseBusiness size={16} /><span>{language === "ar" ? "قيمة الفرص" : "Pipeline value"}</span><strong>{money(potential)}</strong><small>+12.7%</small></div>
                      <div><Search size={16} /><span>{language === "ar" ? "تغطية البحث" : "Research coverage"}</span><strong>{leads.length ? Math.round((research.length / leads.length) * 100) : 0}%</strong><small>+4.1%</small></div>
                      <div><BadgeCheck size={16} /><span>{language === "ar" ? "المؤهلون" : "Qualified"}</span><strong>{leads.filter((lead) => lead.status === "qualified").length}</strong><small>{language === "ar" ? "هذا الشهر" : "this month"}</small></div>
                    </section>
                  )}

                  <section className="ops-panel ops-pipeline" data-tour="pipeline">
                    <div className="ops-panel__head"><div><Activity size={15} /><span>{language === "ar" ? "مسار المهمة" : "Mission pipeline"}</span></div><span className="ops-live"><i /> {t("console.systemsReady")}</span></div>
                    <LeadFlowVisual compact />
                  </section>

                  <section className="ops-panel ops-runs" data-tour="leads">
                    <div className="ops-panel__head"><div><Database size={15} /><span>{language === "ar" ? "سجل العملاء" : "Lead activity"}</span></div><button onClick={() => selectTab("leads")}>{language === "ar" ? "عرض كل العملاء" : "View all leads"}{language === "ar" ? <ArrowUpLeft size={13} /> : <ArrowUpRight size={13} />}</button></div>
                    <div className="ops-runs__table">
                      <div className="ops-runs__row is-head"><span>{language === "ar" ? "الحالة" : "Status"}</span><span>{language === "ar" ? "العميل" : "Lead"}</span><span>{language === "ar" ? "الشركة" : "Company"}</span><span>{language === "ar" ? "الملاءمة" : "Fit"}</span><span>{language === "ar" ? "المصدر" : "Source"}</span><span /></div>
                      {leads.map((lead) => (
                        <button className="ops-runs__row" key={lead.id} onClick={() => selectTab("leads")}>
                          <span className={`ops-status is-${lead.status}`}><i /> {leadStatusLabel(lead.status, language)}</span>
                          <span><strong>{lead.name}</strong><small>{lead.title}</small></span>
                          <span>{lead.company}</span>
                          <span><b>{lead.fitScore}%</b></span>
                          <span>{lead.source.replace("Apify ", "")}</span>
                          <span>{language === "ar" ? <ArrowUpLeft size={14} /> : <ArrowUpRight size={14} />}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              </Tabs.Panel>

              <Tabs.Panel id="agent">
                <AgentMissionPage
                  busy={busy}
                  chatInput={chatInput}
                  consoleMessages={consoleMessages}
                  intake={intake}
                  language={language}
                  leads={leads}
                  leadRunTick={leadRunTick}
                  onInputChange={setChatInput}
                  onRun={runConsoleFetch}
                  onSend={sendConsoleMessage}
                  user={user}
                />
              </Tabs.Panel>

              <Tabs.Panel id="leads">
                {user?.isAdmin ? <AdminLeadExplorer onInventoryLoaded={syncAdminInventory} /> : <Card className="hconsole-card">
                  <Card.Header><Card.Title>{t("console.leads")}</Card.Title><Card.Description>{language === "ar" ? "ابحث، تواصل، وانقل كل عميل نحو العرض المناسب." : "Research, email, and move each account toward a proposal."}</Card.Description></Card.Header>
                  <Card.Content>
                    <Table className="hconsole-table">
                      <Table.ScrollContainer>
                        <Table.Content aria-label="Leads">
                          <Table.Header>
                            <Table.Column isRowHeader>{language === "ar" ? "العميل" : "Lead"}</Table.Column>
                            <Table.Column>{language === "ar" ? "الشركة" : "Company"}</Table.Column>
                            <Table.Column>{language === "ar" ? "الملاءمة" : "Fit"}</Table.Column>
                            <Table.Column>{language === "ar" ? "الحالة" : "Status"}</Table.Column>
                            <Table.Column>{language === "ar" ? "إجراءات" : "Actions"}</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {leads.map((lead) => (
                              <Table.Row key={lead.id} id={lead.id}>
                                <Table.Cell><strong>{lead.name}</strong><small>{lead.title}</small></Table.Cell>
                                <Table.Cell><strong>{lead.company}</strong><small>{lead.industry} · {lead.location}</small></Table.Cell>
                                <Table.Cell><ProgressBar value={lead.fitScore} maxValue={100} aria-label={`${lead.company} fit`}><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar></Table.Cell>
                                <Table.Cell><Chip><Chip.Label>{lead.status}</Chip.Label></Chip></Table.Cell>
                                <Table.Cell><Button variant="secondary" onClick={() => handleResearch(lead)} isDisabled={busy}><Search size={15} /> {language === "ar" ? "بحث" : "Research"}</Button></Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  </Card.Content>
                </Card>}
              </Tabs.Panel>

              <Tabs.Panel id="insights">
                <InsightDashboard leads={leads} research={research} language={language} />
              </Tabs.Panel>

              <Tabs.Panel id="proposals">
                  <Card className="hconsole-card">
                    <Card.Header><Card.Title>{proposals[0].title}</Card.Title><Card.Description>{leads.find((lead) => lead.id === proposals[0].leadId)?.company ?? leads[0]?.company ?? "-"}</Card.Description></Card.Header>
                  <Card.Content className="hconsole-proposal">
                    <p>{proposals[0].generatedCopy}</p>
                    <div className="hconsole-actions"><Chip><Chip.Label>{money(proposals[0].value)}</Chip.Label></Chip><Button onClick={() => Toast.toast.success(language === "ar" ? "تم إرسال العرض للمراجعة" : "Proposal queued for review")}>{language === "ar" ? "إرسال للمراجعة" : "Queue review"}</Button></div>
                  </Card.Content>
                </Card>
              </Tabs.Panel>

              <Tabs.Panel id="emails">
                <div className="hconsole-template-grid">
                  {emailTemplates.map((template) => (
                    <Card className="hconsole-card" key={template.id}>
                      <Card.Header>
                        <Card.Title>{template.name}</Card.Title>
                        {template.isPremium ? <Badge><Badge.Label>{language === "ar" ? "مدفوع" : "Premium"}</Badge.Label></Badge> : <Badge><Badge.Label>{language === "ar" ? "مجاني" : "Free"}</Badge.Label></Badge>}
                      </Card.Header>
                      <Card.Content>
                        <p>{template.subject}</p>
                        <ProgressBar value={template.performanceScore} maxValue={100} aria-label={`${template.name} performance`}><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar>
                      </Card.Content>
                      <Card.Footer><Button isDisabled={template.isPremium} onClick={() => Toast.toast.success(language === "ar" ? `تم اختيار ${template.name}` : `${template.name} selected`)}>{template.isPremium ? <Lock size={15} /> : <Send size={15} />} {language === "ar" ? "استخدام" : "Use"}</Button></Card.Footer>
                    </Card>
                  ))}
                </div>
              </Tabs.Panel>
            </Tabs>
          </section>
        </Surface>
        <WaslaNavCapsule
          mode="console"
          placement="bottom"
          user={user}
          onAuthOpen={onAuthOpen}
          onNavigate={(key) => key === "agent" ? startNewChat() : selectTab(key)}
        />
      </main>
      <ProductTour open={tourOpen} steps={onboardingSteps} onComplete={completeTour} />
    </>
  );
}

function AgentMissionPage({
  busy,
  chatInput,
  consoleMessages,
  intake,
  language,
  leads,
  leadRunTick,
  onInputChange,
  onRun,
  onSend,
  user,
}: {
  busy: boolean;
  chatInput: string;
  consoleMessages: Array<{ role: string; text: string }>;
  intake: IntakeState;
  language: "ar" | "en";
  leads: Lead[];
  leadRunTick: number;
  onInputChange: (value: string) => void;
  onRun: () => void;
  onSend: () => void;
  user: AuthUser | null;
}) {
  const ready = intake.confidence === 100;

  return (
    <section className="ops-agent-page" data-tour="agent">
      <div className="ops-agent-page__top">
        <div><span /> {busy ? (language === "ar" ? "وصلة تعمل الآن" : "Wasla is working") : (language === "ar" ? "جاهز للمحادثة" : "Ready to chat")}</div>
        <strong>{language === "ar" ? "ابدأ محادثة جديدة" : "Start a new chat"} <WaslaBrand variant="symbol" inverse /></strong>
      </div>

      <div className="ops-chat-stage">
        <header className="ops-chat-stage__intro">
          <WaslaBrand variant="symbol" inverse />
          <span>{language === "ar" ? "محادثة تحول الوصف إلى عملاء" : "A conversation that turns intent into leads"}</span>
          <h1>{language === "ar" ? "من تريد أن تصل إليه؟" : "Who do you want to reach?"}</h1>
          <p>{language === "ar" ? "اكتبها كما تقولها لفريقك. وصلة تسأل، تبحث، وتعرض النتائج هنا لحظة بلحظة." : "Say it the way you would to your team. Wasla asks, researches, and streams the results here in real time."}</p>
        </header>

        <div className="ops-agent-page__conversation" aria-live="polite">
          {consoleMessages.map((message, index) => (
            <div className={`ops-chat-message is-${message.role}`} key={`${message.role}-${index}-${message.text}`}>
              <span className="ops-chat-message__mark">{message.role === "assistant" ? <WaslaBrand variant="symbol" inverse /> : (user?.name?.slice(0, 1) ?? "Y")}</span>
              <p>{message.text}</p>
            </div>
          ))}
          {busy ? (
            <div className="ops-chat-message is-assistant is-thinking">
              <span className="ops-chat-message__mark"><WaslaBrand variant="symbol" inverse /></span>
              <p><i /><i /><i /><small>{language === "ar" ? "أفهم الطلب وأبني قائمة البحث" : "Understanding the request and building the search"}</small></p>
            </div>
          ) : null}
        </div>

        <div className="ops-chat-composer">
          <input
            value={chatInput}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSend()}
            placeholder={language === "ar" ? "مثال: شركات لوجستية في جدة ما زالت ترسل عروض الأسعار يدوياً" : "Example: Logistics companies in Jeddah still sending quotes manually"}
            aria-label={language === "ar" ? "اكتب رسالة إلى وصلة" : "Message Wasla"}
          />
          <span className="ops-chat-composer__sparkle" aria-hidden="true"><Sparkles size={22} /></span>
          <LiquidMetalSubmitButton onClick={onSend} disabled={busy} label={language === "ar" ? "إرسال الرسالة" : "Send message"}>
            {language === "ar" ? <ArrowUpLeft size={34} /> : <ArrowUpRight size={34} />}
          </LiquidMetalSubmitButton>
        </div>

        <div className="ops-chat-controls">
          <div className="ops-agent-page__readiness">
            <span>{language === "ar" ? "وضوح الطلب" : "Brief clarity"}</span>
            <i><b style={{ width: `${intake.confidence}%` }} /></i>
            <strong>{intake.confidence}%</strong>
          </div>
          <button className="ops-chat-run" onClick={onRun} disabled={busy || Boolean(user?.verifiedPhone && !ready)}>
            {busy ? <RefreshCw className="is-spinning" size={17} /> : <Play size={17} />}
            {language === "ar" ? "ابدأ جلب العملاء" : "Start finding leads"}
          </button>
        </div>
      </div>

      <div className="ops-chat-results">
        <div className="ops-agent-page__status">
          <span><i /> {busy ? (language === "ar" ? "تصل النتائج الآن" : "Results arriving now") : (language === "ar" ? "تدفق العملاء" : "Lead stream")}</span>
          <strong>{busy ? "···" : leads.slice(0, 5).length}</strong>
        </div>
        <AnimatedLeadPreview leads={leads} active={busy} runKey={leadRunTick} language={language} />
      </div>
    </section>
  );
}

function HeroUIBars({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  return (
    <Card className="hconsole-card">
      <Card.Header><Card.Title>{title}</Card.Title></Card.Header>
      <Card.Content className="hconsole-progress-stack">
        {items.map((item) => (
          <div className="hconsole-bar-line" key={item.label}>
            <span>{item.label}</span>
            <ProgressBar value={Math.min(item.value, 100)} maxValue={100} aria-label={item.label}>
              <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
            </ProgressBar>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}

function AnimatedLeadPreview({ leads, active, runKey, language }: { leads: Lead[]; active: boolean; runKey: number; language: "ar" | "en" }) {
  const previewLeads = leads.slice(0, 5);
  return (
    <div className={`lead-reveal${active ? " is-active" : ""}`} key={runKey} aria-live="polite">
      <div className="lead-reveal__scan" aria-hidden="true" />
      <header>
        <span><i /> {active ? (language === "ar" ? "يتم توليد العملاء الآن" : "Generating leads now") : (language === "ar" ? "معاينة التدفق" : "Lead stream preview")}</span>
        <strong>{previewLeads.length}</strong>
      </header>
      <div className="lead-reveal__table">
        <div className="lead-reveal__row is-head">
          <span>{language === "ar" ? "الشركة" : "Company"}</span>
          <span>{language === "ar" ? "صانع القرار" : "Decision maker"}</span>
          <span>{language === "ar" ? "الملاءمة" : "Fit"}</span>
        </div>
        {active ? Array.from({ length: 5 }, (_, index) => (
          <div className="lead-reveal__row is-skeleton" style={{ animationDelay: `${index * 90}ms` }} key={`skeleton-${index}`} aria-hidden="true">
            <span><b /><small /></span>
            <span><b /><small /></span>
            <span><strong /><i /></span>
          </div>
        )) : previewLeads.map((lead, index) => (
          <div className="lead-reveal__row" style={{ animationDelay: `${index * 140}ms` }} key={lead.id}>
            <span><b>{lead.company}</b><small>{lead.industry} · {lead.location.split(",")[0]}</small></span>
            <span>{lead.name}<small>{lead.title}</small></span>
            <span><strong>{lead.fitScore}%</strong><i style={{ width: `${lead.fitScore}%` }} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightDashboard({ leads, research, language }: { leads: Lead[]; research: CompanyResearch[]; language: "ar" | "en" }) {
  const totalPipeline = leads.reduce((sum, lead) => sum + lead.revenueEstimate, 0);
  const avgFit = leads.length ? Math.round(leads.reduce((sum, lead) => sum + lead.fitScore, 0) / leads.length) : 0;
  const qualified = leads.filter((lead) => lead.fitScore >= 80);
  const coverage = leads.length ? Math.round((research.length / leads.length) * 100) : 0;
  const topSegment = topGroup(leads, (lead) => lead.industry);
  const topCity = topGroup(leads, (lead) => lead.location.split(",")[0] || "Unknown");
  const topLeads = [...leads].sort((a, b) => b.fitScore - a.fitScore).slice(0, 4);
  const opportunities = research.flatMap((item) => item.opportunities).slice(0, 5);
  const weaknesses = research.flatMap((item) => item.weaknesses).slice(0, 4);
  const segmentItems = groupItems(leads, (lead) => lead.industry).slice(0, 5).map((item) => ({ label: item.label, value: Math.round((item.count / Math.max(leads.length, 1)) * 100) }));
  const cityItems = groupItems(leads, (lead) => lead.location.split(",")[0] || "Unknown").slice(0, 5).map((item) => ({ label: item.label, value: Math.round((item.count / Math.max(leads.length, 1)) * 100) }));
  const recommendations = language === "ar" ? [
    `ابدأ بـ ${topSegment.label}: يمثل ${topSegment.count} من السجلات ومتوسط الملاءمة أعلى من خط التشغيل.`,
    `ركّز أول 48 ساعة على ${topCity.label}: أعلى كثافة جغرافية وأسهل لتجربة الاتصال.`,
    `${qualified.length} عميل فوق 80% يستحق بحثاً عميقاً قبل أي حملة واسعة.`,
  ] : [
    `Start with ${topSegment.label}: it owns ${topSegment.count} records and sits above the operating fit line.`,
    `Focus the first 48 hours on ${topCity.label}: highest geographic density and easiest calling batch.`,
    `${qualified.length} leads above 80% deserve deep research before any broad campaign.`,
  ];

  return (
    <div className="insights-command">
      <header className="insights-command__hero">
        <span><BarChart3 size={15} /> {language === "ar" ? "تحليل مبني على بيانات العملاء" : "Analysis from your lead data"}</span>
        <h1>{language === "ar" ? "أين نربح؟ ومن نتصل به أولاً؟" : "Where do we win, and who gets called first?"}</h1>
        <p>{language === "ar" ? "القراءة هنا مبنية على القطاع، المدينة، الملاءمة، القيمة المتوقعة، وتغطية البحث العميق." : "This read combines segment, city, fit, expected value, and deep-research coverage."}</p>
      </header>

      <section className="insights-command__metrics">
        <div><span>{language === "ar" ? "قيمة الفرص" : "Pipeline value"}</span><strong>{money(totalPipeline)}</strong><small>{leads.length} {language === "ar" ? "عميل" : "leads"}</small></div>
        <div><span>{language === "ar" ? "متوسط الملاءمة" : "Average fit"}</span><strong>{avgFit}%</strong><small>{qualified.length} {language === "ar" ? "جاهزون" : "ready"}</small></div>
        <div><span>{language === "ar" ? "أقوى قطاع" : "Strongest segment"}</span><strong>{topSegment.label}</strong><small>{topSegment.count} {language === "ar" ? "سجلات" : "records"}</small></div>
        <div><span>{language === "ar" ? "تغطية البحث العميق" : "Deep research coverage"}</span><strong>{coverage}%</strong><small>{research.length}/{leads.length}</small></div>
      </section>

      <section className="insights-command__grid">
        <HeroUIBars title={language === "ar" ? "توزيع القطاعات" : "Segment concentration"} items={segmentItems} />
        <HeroUIBars title={language === "ar" ? "زخم المدن" : "City momentum"} items={cityItems} />
        <Card className="hconsole-card insights-command__moves">
          <Card.Header><Card.Title>{language === "ar" ? "قرارات التشغيل التالية" : "Next operating moves"}</Card.Title><Card.Description>{language === "ar" ? "ما يجب فعله الآن" : "What to do now"}</Card.Description></Card.Header>
          <Card.Content>
            {recommendations.map((item, index) => <p key={item}><strong>{String(index + 1).padStart(2, "0")}</strong>{item}</p>)}
          </Card.Content>
        </Card>
      </section>

      <section className="insights-command__grid is-wide">
        <Card className="hconsole-card insights-command__accounts">
          <Card.Header><Card.Title>{language === "ar" ? "أفضل الحسابات للبدء" : "Best accounts to start"}</Card.Title><Card.Description>{language === "ar" ? "مرتب حسب الملاءمة" : "Sorted by fit"}</Card.Description></Card.Header>
          <Card.Content>
            {topLeads.map((lead) => (
              <div key={lead.id}>
                <span><b>{lead.company}</b><small>{lead.name} · {lead.title}</small></span>
                <strong>{lead.fitScore}%</strong>
                <i style={{ width: `${lead.fitScore}%` }} />
              </div>
            ))}
          </Card.Content>
        </Card>
        <Card className="hconsole-card insights-command__signals">
          <Card.Header><Card.Title>{language === "ar" ? "إشارات البحث العميق" : "Deep research signals"}</Card.Title><Card.Description>{language === "ar" ? "فرص ومخاطر من البيانات المرسلة" : "Opportunities and risks from submitted data"}</Card.Description></Card.Header>
          <Card.Content className="hconsole-chip-list">
            {[...opportunities, ...weaknesses].map((item) => <Chip key={item}><Chip.Label>{item}</Chip.Label></Chip>)}
          </Card.Content>
        </Card>
      </section>
    </div>
  );
}

function useLiquidMetalShader() {
  const shaderRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!shaderRef.current) return;

    const shader = new ShaderMount(
      shaderRef.current,
      liquidMetalFragmentShader,
      {
        u_repetition: 1.5,
        u_softness: 0.5,
        u_shiftRed: 0.3,
        u_shiftBlue: 0.3,
        u_distortion: 0,
        u_contour: 0,
        u_angle: 100,
        u_scale: 1.5,
        u_shape: 1,
        u_offsetX: 0.1,
        u_offsetY: -0.1,
      },
      undefined,
      0.6,
    );

    return () => shader.dispose();
  }, []);

  return shaderRef;
}

function LiquidMetalSubmitButton({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  const shaderRef = useLiquidMetalShader();

  return (
    <button className="liquid-metal-submit" type="button" onClick={onClick} disabled={disabled} aria-label={label}>
      <span className="liquid-metal-submit__shader" ref={shaderRef} aria-hidden="true" />
      <span className="liquid-metal-submit__outline" aria-hidden="true" />
      <span className="liquid-metal-submit__icon" aria-hidden="true">{children}</span>
    </button>
  );
}

function LiquidMetalNavTrigger({ open, onClick, label, controls }: { open: boolean; onClick: () => void; label: string; controls: string }) {
  const shaderRef = useLiquidMetalShader();

  return (
    <button className="wasla-nav-capsule__trigger" type="button" onClick={onClick} aria-expanded={open} aria-controls={controls} aria-label={label}>
      <span className="wasla-nav-capsule__metal" ref={shaderRef} aria-hidden="true" />
      <span className="wasla-nav-capsule__trigger-core" aria-hidden="true" />
      <WaslaBrand variant="symbol" inverse />
    </button>
  );
}

function WaslaNavCapsule({
  mode,
  placement,
  user,
  onAuthOpen,
  onNavigate,
}: {
  mode: "landing" | "console";
  placement: "top" | "bottom";
  user: AuthUser | null;
  onAuthOpen: (mode?: "signup" | "login") => void;
  onNavigate?: (key: string) => void;
}) {
  const { direction, language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const capsuleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (capsuleRef.current && !capsuleRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const consoleLinks = [
    ["agent", language === "ar" ? "ابدأ محادثة جديدة" : "Start a new chat", Sparkles],
    ["overview", t("console.overview"), LayoutDashboard],
    ["leads", t("console.leads"), Building2],
    ["insights", t("console.insights"), BarChart3],
    ["proposals", t("console.proposals"), FileText],
    ["emails", t("console.emails"), Mail],
  ] as const;
  const sheetId = `wasla-nav-sheet-${mode}`;

  return (
    <nav ref={capsuleRef} className={`wasla-nav-capsule is-${placement} is-${mode}${open ? " is-open" : ""}`} dir={direction} aria-label={language === "ar" ? "قائمة وصلة" : "Wasla navigation"}>
      <div className="wasla-nav-capsule__bar">
        <LiquidMetalNavTrigger open={open} onClick={() => setOpen((current) => !current)} controls={sheetId} label={language === "ar" ? "فتح قائمة وصلة" : "Open Wasla menu"} />
        <div className="wasla-nav-capsule__essentials">
          {mode === "console" ? (
            <>
              <button type="button" onClick={() => onNavigate?.("agent")}><Sparkles size={14} /><span>{language === "ar" ? "محادثة جديدة" : "New chat"}</span></button>
              <button type="button" onClick={() => onNavigate?.("leads")}><Building2 size={14} /><span>{t("console.leads")}</span></button>
            </>
          ) : user ? (
            <>
              <a href="#pricing"><WalletCards size={14} /><span>{language === "ar" ? "الباقات" : "Pricing"}</span></a>
              <Link to="/console"><LayoutDashboard size={14} /><span>{language === "ar" ? "فتح المساحة" : "Open console"}</span></Link>
            </>
          ) : (
            <>
              <a href="#pricing"><WalletCards size={14} /><span>{language === "ar" ? "الباقات" : "Pricing"}</span></a>
              <button type="button" onClick={() => onAuthOpen("login")}><LogIn size={14} /><span>{language === "ar" ? "تسجيل الدخول" : "Log in"}</span></button>
              <button className="is-primary" type="button" onClick={() => onAuthOpen("signup")}><UserPlus size={14} /><span>{language === "ar" ? "إنشاء حساب" : "Create account"}</span></button>
              <Link to="/console"><LayoutDashboard size={14} /><span>{language === "ar" ? "فتح المساحة" : "Open console"}</span></Link>
            </>
          )}
        </div>
        <LanguageToggle inverse />
        <Link className="wasla-nav-capsule__brand" to="/" aria-label={language === "ar" ? "العودة إلى وصلة" : "Back to Wasla"}><WaslaBrand variant="horizontal" inverse /></Link>
      </div>

      <div id={sheetId} className="wasla-nav-capsule__sheet" aria-hidden={!open}>
        <header>
          <span>{language === "ar" ? "تنقل في وصلة" : "Explore Wasla"}</span>
          <strong>{user?.business ?? (language === "ar" ? "كل شيء من مكان واحد" : "Everything in one place")}</strong>
        </header>
        <div className="wasla-nav-capsule__links">
          {mode === "console" ? consoleLinks.map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => { onNavigate?.(key); setOpen(false); }}>
              <Icon size={17} /><span>{label}</span>{language === "ar" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
            </button>
          )) : (
            <>
              <a href="#agent" onClick={() => setOpen(false)}><Sparkles size={17} /><span>{t("nav.agent")}</span>{language === "ar" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</a>
              <a href="#workflow" onClick={() => setOpen(false)}><Activity size={17} /><span>{t("nav.workflow")}</span>{language === "ar" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</a>
              <a href="#pricing" onClick={() => setOpen(false)}><WalletCards size={17} /><span>{language === "ar" ? "الباقات" : "Pricing"}</span>{language === "ar" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</a>
              <Link to="/console" onClick={() => setOpen(false)}><LayoutDashboard size={17} /><span>{t("nav.workspace")}</span>{language === "ar" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</Link>
            </>
          )}
        </div>
        <footer>
          {user ? <Link to="/console" onClick={() => setOpen(false)}>{language === "ar" ? "فتح مساحتي" : "Open my workspace"}</Link> : <button type="button" onClick={() => { setOpen(false); onAuthOpen(); }}>{t("nav.start")}</button>}
          <span>{language === "ar" ? "وصلة تعمل الآن" : "Wasla is online"}<i /></span>
        </footer>
      </div>
    </nav>
  );
}

function LandingChat({ user, onLeadAsk, onAuthOpen }: { user: AuthUser | null; onLeadAsk: (ask: string) => void; onAuthOpen: (mode?: "signup" | "login") => void }) {
  const { direction, language, t } = useLanguage();
  const [input, setInput] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const navigate = useNavigate();

  const examples = language === "ar" ? [
    { request: "أبغى ملاك عيادات أسنان في الرياض عندهم أكثر من فرعين", response: "سأبحث عن المالك أو مدير التشغيل، وأتحقق من عدد الفروع قبل الاتصال." },
    { request: "شركات لوجستية في جدة ما زالت ترسل عروض الأسعار يدوياً", response: "سأعطي الأولوية لمديري المبيعات والعمليات مع إشارة واضحة للعمل اليدوي." },
    { request: "مطاعم راقية في الخبر تحتاج شراكات وحجوزات شركات", response: "سأستهدف المدير العام أو مسؤول الشراكات، ثم أؤهل الاحتياج والموسمية هاتفياً." },
  ] : [
    { request: "Dental clinic owners in Riyadh with more than two branches", response: "I will find the owner or operations director and verify branch count before calling." },
    { request: "Logistics companies in Jeddah still sending quotes manually", response: "I will prioritize sales and operations leaders with evidence of a manual quoting process." },
    { request: "Premium restaurants in Khobar seeking corporate bookings", response: "I will target general managers or partnerships leads, then qualify demand and seasonality by phone." },
  ];

  useEffect(() => {
    if (input) return;
    const timer = window.setInterval(() => setExampleIndex((current) => (current + 1) % examples.length), 4200);
    return () => window.clearInterval(timer);
  }, [examples.length, input]);

  function submitAsk(text = input) {
    const ask = text.trim();
    if (!ask) return;
    onLeadAsk(ask);
    if (user?.verifiedPhone) navigate("/console/agent");
    else onAuthOpen();
  }

  const promptChips = language === "ar" ? [
    "أصحاب عيادات في الرياض يحتاجون متابعة أسرع",
    "مطاعم في جدة تحتاج حجوزات وشراكات",
    "شركات لوجستية في السعودية عندها عروض أسعار يدوية",
  ] : [
    "Clinic owners in Riyadh who need faster follow-up",
    "Restaurants in Jeddah seeking corporate partnerships",
    "Saudi logistics companies with manual quoting",
  ];
  const bundles = language === "ar" ? [
    { name: "Launch", price: "2,999", leads: "3K", research: "1.5K", note: "للفرق التي تريد قوائم غنية وبحثاً عميقاً منتظماً.", features: ["3,000 عميل مثرى", "1,500 بحث عميق", "تصدير وتنقية داخل مساحة وصلة"] },
    { name: "Scale", price: "3,999", leads: "6K", research: "3K", note: "دفعة أكبر للفرق التي تختبر أكثر من قطاع.", features: ["6,000 عميل مثرى", "3,000 بحث عميق", "أولوية في تشغيل Apify وOpenRouter"] },
    { name: "Autopilot", price: "حسب الطلب", leads: "10K", research: "6K", note: "وكيل يثري أكثر، يتصل، ويحوّل الاهتمام إلى اجتماع Zoom.", features: ["10,000 عميل مثرى", "6,000 بحث عميق", "بوت اتصال وتأهيل وحجز اجتماعات"] },
  ] : [
    { name: "Launch", price: "2,999", leads: "3K", research: "1.5K", note: "For teams that need enriched lists plus steady deep research.", features: ["3,000 enriched leads", "1,500 deep researches", "Export and refinement inside Wasla"] },
    { name: "Scale", price: "3,999", leads: "6K", research: "3K", note: "A bigger batch for teams testing more than one segment.", features: ["6,000 enriched leads", "3,000 deep researches", "Priority Apify and OpenRouter runs"] },
    { name: "Autopilot", price: "Custom", leads: "10K", research: "6K", note: "An agent that enriches, calls, qualifies, and books Zoom meetings.", features: ["10,000 enriched leads", "6,000 deep researches", "Calling bot with meeting handoff"] },
  ];
  const testimonials = language === "ar" ? [
    ["نورة السبيعي", "مؤسسة وكالة نمو", "حولنا طلباً واحداً إلى قائمة حسابات واضحة. أكثر شيء فرق معنا أن كل عميل جاء بسبب مقنع للتواصل."],
    ["عبدالله الحربي", "مدير مبيعات B2B", "البحث العميق اختصر ساعات من التجهيز قبل المكالمات، والفريق صار يعرف من يتصل ولماذا."],
    ["ريم العيسى", "شريكة في عيادات", "بدل ملفات مبعثرة، صارت الفرص مرتبة حسب الملاءمة والخطوة التالية."],
    ["فهد الدوسري", "مؤسس SaaS", "أفضل جزء أن الوكيل يسأل قبل ما يصرف الرصيد. حسّيت أنه يفهم السوق مو بس يسحب بيانات."],
    ["Maha Kareem", "Growth Lead", "The table animation is not just pretty. It makes the lead run feel alive and auditable."],
    ["Omar Haddad", "Founder", "Deep research gave our outreach a reason to exist. Replies improved because the message had context."],
    ["سارة القحطاني", "تطوير أعمال", "أخيراً لوحة تقول لي وين أبدأ، مو بس عدد عملاء كبير بلا معنى."],
    ["Khalid Mansour", "Agency Owner", "Wasla made our ICP tests faster. We could compare sectors in one afternoon."],
    ["ليان باوزير", "مديرة تسويق", "المكالمات المؤهلة وفرت علينا وقت الفريق، والاجتماعات وصلت أنظف بكثير."],
  ] : [
    ["Noura Alsubaie", "Agency Founder", "One request turned into a clear account list. Every lead came with a reason to reach out."],
    ["Abdullah Alharbi", "B2B Sales Manager", "Deep research cut hours of call prep, and the team finally knew who to call and why."],
    ["Reem Alessa", "Clinic Partner", "Instead of scattered files, opportunities were ranked by fit and next step."],
    ["Fahad Aldossari", "SaaS Founder", "The agent asks before spending credit. It feels like it understands the market, not just data scraping."],
    ["Maha Kareem", "Growth Lead", "The table animation is not just pretty. It makes the lead run feel alive and auditable."],
    ["Omar Haddad", "Founder", "Deep research gave our outreach a reason to exist. Replies improved because the message had context."],
    ["Sara Alqahtani", "Business Development", "Finally, an insights page that tells me where to start, not just how many rows I have."],
    ["Khalid Mansour", "Agency Owner", "Wasla made our ICP tests faster. We could compare sectors in one afternoon."],
    ["Layan Bawazir", "Marketing Director", "Qualified calls saved the team time, and the meetings came in much cleaner."],
  ];
  const pricingGroups = language === "ar" ? [
    { title: "توليد العملاء", rows: [["عملاء مثرون", "3,000", "6,000", "10,000"], ["مصادر Apify", true, true, true], ["تنقية وتصدير", true, true, true], ["أولوية تشغيل", false, true, true]] },
    { title: "البحث العميق", rows: [["أبحاث عميقة", "1,500", "3,000", "6,000"], ["OpenRouter + Perplexity", true, true, true], ["ملخص فرص ومخاطر", true, true, true], ["تحديث بحث حسب الحساب", false, true, true]] },
    { title: "التأهيل والاتصال", rows: [["بوت إثراء إضافي", false, false, true], ["مكالمات تأهيل", false, false, true], ["حجز Zoom معك", false, false, true], ["مساحة Directus", true, true, true]] },
  ] : [
    { title: "Lead generation", rows: [["Enriched leads", "3,000", "6,000", "10,000"], ["Apify sourcing", true, true, true], ["Refinement and export", true, true, true], ["Priority runs", false, true, true]] },
    { title: "Deep research", rows: [["Deep researches", "1,500", "3,000", "6,000"], ["OpenRouter + Perplexity", true, true, true], ["Opportunity and risk briefs", true, true, true], ["Account research refresh", false, true, true]] },
    { title: "Qualification", rows: [["Extra enrichment bot", false, false, true], ["Qualification calls", false, false, true], ["Zoom meeting booking", false, false, true], ["Directus workspace", true, true, true]] },
  ];

  return (
    <main className={`wasla-home ${language === "ar" ? "arabic-ui" : "is-english"}`} dir={direction}>
      <WaslaNavCapsule mode="landing" placement="top" user={user} onAuthOpen={onAuthOpen} />

      <section className="wasla-command" id="agent">
        <div className="wasla-command__status"><span /> {t("landing.live")}</div>
        <WaslaBrand variant="symbol" className="wasla-command__symbol" />
        <h1>{t("landing.title")}</h1>
        <p>{t("landing.description")}</p>
        <div className="wasla-command__experience">
          <div className="wasla-command__experience-top">
            <span><i /> {t("landing.listening")}</span>
            <small>{t("landing.noForm")}</small>
          </div>
          {!input && (
            <div className="wasla-command__example" key={`${language}-${exampleIndex}`}>
              <span>{t("landing.example")}</span>
              <strong>{examples[exampleIndex].request}</strong>
              <div><WaslaBrand variant="symbol" /><p>{examples[exampleIndex].response}</p></div>
            </div>
          )}
          <div className="wasla-command__input">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submitAsk()}
              placeholder={t("landing.placeholder")}
              aria-label={language === "ar" ? "اكتب نوع العملاء المطلوب" : "Describe the leads you need"}
            />
            <span className="wasla-command__sparkles" aria-hidden="true"><Sparkles size={24} /></span>
            <LiquidMetalSubmitButton onClick={() => submitAsk(input || examples[exampleIndex].request)} label={language === "ar" ? "ابدأ البحث" : "Start search"}>
              {language === "ar" ? <ArrowUpLeft size={39} /> : <ArrowUpRight size={39} />}
            </LiquidMetalSubmitButton>
          </div>
        </div>
        <div className="wasla-command__prompts" aria-label={language === "ar" ? "طلبات مقترحة" : "Suggested requests"}>
          {promptChips.map((prompt) => <button key={prompt} onClick={() => submitAsk(prompt)}>{prompt}</button>)}
        </div>
        <div className="wasla-command__trust">
          <span><ShieldCheck size={15} /> {t("landing.protected")}</span>
          <span><Gift size={15} /> {t("landing.credit")}</span>
          <span><BadgeCheck size={15} /> {t("landing.qualified")}</span>
        </div>
      </section>

      <section className="wasla-workflow" id="workflow">
        <div className="wasla-workflow__heading">
          <span>{t("workflow.eyebrow")}</span>
          <h2>{t("workflow.title")}</h2>
          <p>{t("workflow.body")}</p>
        </div>
        <LeadFlowVisual />
      </section>

      <section className="wasla-pricing" id="pricing">
        <div className="wasla-pricing__heading">
          <span>{language === "ar" ? "الباقات" : "Pricing"}</span>
          <h2>{language === "ar" ? "باقات وصلة" : "Pricing plans"}</h2>
          <p>{language === "ar" ? "ابدأ بعملاء مثرين وبحث عميق، ثم ارتقِ إلى وكيل يتصل ويحجز الاجتماعات." : "Start with enriched leads and deep research, then scale into an agent that calls and books meetings."}</p>
        </div>
        <div className="wasla-pricing__shelf">
          {bundles.map((bundle, index) => (
            <article className={index === 1 ? "is-featured" : ""} key={bundle.name}>
              <span className={`wasla-pricing__icon is-${index + 1}`} aria-hidden="true"><i /></span>
              <header>
                <span>{bundle.name}</span>
                <strong>{bundle.price === "Custom" || bundle.price === "حسب الطلب" ? bundle.price : `${bundle.price} SAR`}</strong>
                <p>{bundle.note}</p>
              </header>
              <button onClick={user ? () => navigate("/console") : () => onAuthOpen("signup")}>{language === "ar" ? "ابدأ الآن" : "Get started"} {language === "ar" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</button>
            </article>
          ))}
        </div>
        <div className="wasla-pricing__matrix">
          {pricingGroups.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              {group.rows.map(([label, launch, scale, autopilot]) => (
                <div className="wasla-pricing__row" key={String(label)}>
                  <span>{label}</span>
                  {[launch, scale, autopilot].map((value, index) => (
                    <strong className={value === true ? "is-check" : value === false ? "is-empty" : ""} key={`${label}-${index}`}>
                      {value === true ? <BadgeCheck size={18} /> : value === false ? "—" : value}
                    </strong>
                  ))}
                </div>
              ))}
            </section>
          ))}
          <footer>
            {bundles.map((bundle) => <button key={bundle.name} onClick={user ? () => navigate("/console") : () => onAuthOpen("signup")}>{language === "ar" ? "ابدأ" : "Get started"}</button>)}
          </footer>
        </div>
      </section>

      <section className="wasla-testimonials">
        <div className="wasla-testimonials__heading">
          <span>{language === "ar" ? "أصوات العملاء" : "Customer proof"}</span>
          <h2>{language === "ar" ? "شهادات كثيرة، لأن الثقة لا تأتي من بطاقة واحدة." : "Lots of testimonials, because trust should not hang on one card."}</h2>
        </div>
        <div className="wasla-testimonials__grid">
          {testimonials.map(([name, role, quote]) => (
            <article key={`${name}-${role}`}>
              <p>{quote}</p>
              <footer><strong>{name}</strong><span>{role}</span></footer>
            </article>
          ))}
        </div>
      </section>

      <footer className="wasla-home__footer">
        <WaslaBrand variant="english" inverse />
        <span>{language === "ar" ? "بسيط · متصل · ذكي" : "Simple · Connected · Smart"}</span>
        <strong>{language === "ar" ? "منتج سعودي يبني اتصالاً ذا قيمة" : "A Saudi product creating valuable connections"}</strong>
      </footer>
    </main>
  );
}

function AvatarMark({ user, size = "md" }: { user: AuthUser | null; size?: "md" | "lg" }) {
  const initials = (user?.name ?? "وصلة")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <div className={`avatar-mark ${user?.avatarTone ?? "cedar"} ${size}`}>
      <span>{initials || "و"}</span>
      {user?.verifiedPhone && <BadgeCheck size={size === "lg" ? 22 : 16} />}
    </div>
  );
}

function leadStatusLabel(status: Lead["status"], language: "ar" | "en") {
  const labels: Record<Lead["status"], { ar: string; en: string }> = {
    new: { ar: "جديد", en: "New" },
    qualified: { ar: "مؤهل", en: "Qualified" },
    researching: { ar: "قيد البحث", en: "Researching" },
    proposal: { ar: "عرض", en: "Proposal" },
    contacted: { ar: "تم التواصل", en: "Contacted" },
    won: { ar: "مكتسب", en: "Won" },
    lost: { ar: "مغلق", en: "Closed" },
  };
  return labels[status][language];
}

function adminLeadToLead(lead: AdminLead): Lead {
  const status: Lead["status"] = lead.qualification_status === "qualified"
    ? "qualified"
    : lead.qualification_status === "contacted"
      ? "contacted"
      : lead.qualification_status === "proposal"
        ? "proposal"
        : lead.enrichment_status === "enriched"
          ? "researching"
          : "new";
  const revenue = Number(String(lead.annual_revenue || "0").replace(/[^0-9.-]/g, ""));
  return {
    id: lead.id,
    name: lead.name || lead.company,
    title: lead.title || lead.seniority || "Company record",
    company: lead.company,
    email: lead.email || "",
    phone: lead.phone || undefined,
    location: lead.location || "Saudi Arabia",
    source: lead.source,
    status,
    fitScore: lead.fit_score,
    revenueEstimate: Number.isFinite(revenue) ? revenue : 0,
    employees: lead.company_size || 0,
    industry: lead.industry || "Unclassified",
    companySlug: lead.company.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    lastSeenUpdateAt: lead.last_enriched_at || lead.updated_at || lead.created_at,
    tags: lead.enrichment_signals || [],
  };
}

function groupItems<T>(items: T[], getLabel: (item: T) => string) {
  const grouped = new Map<string, { label: string; count: number }>();
  items.forEach((item) => {
    const label = getLabel(item) || "Unknown";
    grouped.set(label, { label, count: (grouped.get(label)?.count || 0) + 1 });
  });
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

function topGroup<T>(items: T[], getLabel: (item: T) => string) {
  return groupItems(items, getLabel)[0] ?? { label: "No data", count: 0 };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(value);
}

export default App;
