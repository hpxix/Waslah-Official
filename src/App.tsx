import { DashboardOverview } from "./components/DashboardOverview";
import { RevealedChatReply } from './components/RevealedChatReply';
import { isSmallTalkTurn } from './lib/chatBehavior';
import { websiteInputUrl } from './lib/websiteRead';
import { startWebsiteRead } from './lib/directus';
import type { WebsiteRead } from './lib/directus';
import { WebsiteReadProgress } from './components/WebsiteReadProgress';
import { parseReadyLeadQuantity } from './lib/leadQuantity';
import { ChatTenderResults } from './components/ChatTenderResults';
import {
  ChatModelSelector,
  type WaslaModelChoice,
} from "./components/ChatModelSelector";
import { LiquidMetalEdge } from "./components/LiquidMetalEdge";
import { useLiquidMetalShader } from "./lib/useLiquidMetalShader";
import { SignalSetup, SignalWorkspace } from "./components/SignalWorkspace";
import { AdminControlCenter } from "./components/AdminControlCenter";
import { AdminLeadExplorer } from "./components/AdminLeadExplorer";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  useSidebar,
} from "./components/ui/sidebar";
import { Button as UiButton } from "./components/ui/button";
import { Badge as UiBadge } from "./components/ui/badge";
import {
  Tabs as UiTabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs";
import {
  Card as UiCard,
  CardContent as UiCardContent,
} from "./components/ui/card";
import "./dashboard.css";
import {
  ResearchedLeads,
  ResearchDossier,
} from "./components/LeadIntelligence";
import { Avatar } from "@heroui/react";
import {
  Activity,
  AtSign,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BrainCircuit,
  Building2,
  BadgeCheck,
  CircleDot,
  Command,
  CreditCard,
  FileText,
  Facebook,
  Gamepad2,
  Gift,
  Ghost,
  Instagram,
  LayoutDashboard,
  LogIn,
  LogOut,
  Lock,
  Linkedin,
  MessageSquare,
  MessageCircle,
  Music2,
  PanelLeftClose,
  PhoneCall,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  SquareKanban,
  Store,
  Target,
  Twitch,
  UserPlus,
  WalletCards,
  History,
  X,
  Youtube,
} from "lucide-react";
import { Badge, Button, Card, Chip, ProgressBar } from "@heroui/react";
import { ThinkingOrb } from "thinking-orbs";
import type { OrbState } from "thinking-orbs";
import { BorderBeam } from "border-beam";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import ReactMarkdown from "react-markdown";
import {
  leads as demoLeads,
  proposals,
  research as demoResearch,
} from "./data/demoData";
import {
  apiErrorCode,
  apiErrorMessage,
  converseWithWasla,
  fetchCapabilities,
  fetchLeadJob,
  startLeadGeneration,
  stopB2CCampaign,
  getLeadResearch,
  fetchWorkspaceResearch,
  getAccount,
  hasDirectus,
  isLeadSearchRequest,
  researchLead,
  logoutAccount,
} from "./lib/directus";
import type { AdminLead, LeadJob } from "./lib/directus";
import type { CompanyResearch, IntakeState, Lead } from "./types";
import { LeadFlowVisual } from "./components/LeadFlowVisual";
import { WaslaBrand } from "./components/WaslaBrand";
import { AuthDialog } from "./components/AuthDialog";
import { ProductTour } from "./components/ProductTour";
import { CoreLeadsWorkspace } from "./components/CoreLeadsWorkspace";
import { LeadPipelineBoard } from "./components/LeadPipelineBoard";
import { useLeadWorkspace } from "./lib/useLeadWorkspace";
import { LegalPage } from "./components/LegalPage";
import { SocialsWorkspace } from "./components/SocialsWorkspace";
import { GrowthWorkspace, WaslaTutorial } from "./components/GrowthWorkspace";
import { BusinessPersonaWorkspace } from "./components/BusinessPersonaWorkspace";
import { accountToAuthUser } from "./lib/authUser";
import type { AuthUser } from "./lib/authUser";
import { LanguageToggle, useLanguage } from "./i18n";
import { notify } from "./lib/notify";

const navItems = [
  {
    to: "/console/overview",
    labelKey: "console.overview",
    icon: LayoutDashboard,
  },
  { to: "/console/agent", labelKey: "console.agent", icon: MessageSquare },
  { to: "/console/leads", labelKey: "console.leads", icon: Building2 },
  { to: "/console/crm", labelKey: "console.crm", icon: SquareKanban },
  { to: "/console/persona", labelKey: "console.persona", icon: BrainCircuit },
  { to: "/console/researched", labelKey: "console.researched", icon: Sparkles },
];
const LOCKED_CONSOLE_SECTIONS = new Set(["researched", "socials", "listings", "insights", "proposals", "payments"]);
function consoleSectionLocked(key: string, isAdmin = false) {
  return LOCKED_CONSOLE_SECTIONS.has(key) && !(isAdmin && key === 'researched');
}

const storedAuthKey = "waslah-auth-user";

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  tenderOffer?: import('./lib/directus').TenderOffer;
  responseMs?: number;
  repliedAt?: number;
  websiteRead?: WebsiteRead;
};

function scanFriendlyAssistantText(text: string) {
  const value = String(text || "")
    .replace(/\r\n?/g, "\n")
    // Repair malformed abbreviation bullets from older saved responses.
    .replace(/\(\s*e\.\s*\n\s*[-*•]\s*g\.\s*\n\s*[-*•]\s*,?\s*/gi, "(e.g., ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!value || value.includes("\n") || value.length < 170) return value;

  // Long plain-text answers get paragraph rhythm without inventing a list or
  // splitting abbreviations such as "e.g." into separate Markdown bullets.
  return value.replace(/([.!?؟])\s+(?=[A-Z\u0600-\u06ff])/g, "$1\n\n");
}

type DealIntent = "buy" | "sell";
type LeadTypeChoice = "b2c" | "b2b" | "ultra";
type ChatReasoningMode = "fast" | "high";
type AvatarPreference = { color: string; showInitial: boolean };

const avatarGradients: Record<string, string> = {
  ocean: "linear-gradient(135deg, #246bfe, #5bd6c7)",
  sunset: "linear-gradient(135deg, #ff6b6b, #ffb347)",
  violet: "linear-gradient(135deg, #7546e8, #d66efd)",
  forest: "linear-gradient(135deg, #087a4f, #7abf63)",
  graphite: "linear-gradient(135deg, #24282c, #777f87)",
};

type CompanyListing = {
  id: string;
  name: string;
  industry: string;
  location: string;
  website: string;
  askingPrice: string;
  summary: string;
  visibility: "for-sale" | "featured";
  createdAt: string;
};

type ChatThread = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  intake: IntakeState;
  intent?: DealIntent | null;
  leadType?: "b2c" | "b2b" | null;
  modelChoice?: WaslaModelChoice | null;
  reasoningMode?: ChatReasoningMode | null;
  showLeadOptions?: boolean;
};

type ChatActivityMode = "idle" | "thinking" | "answering" | "sourcing";

function newChatId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `chat-${Date.now()}`;
}

function restoreChat(userId?: string): ChatThread | null {
  if (!userId) return null;
  try {
    const threads = JSON.parse(
      localStorage.getItem(`wasla:chats:${userId}`) || "[]",
    ) as ChatThread[];
    const activeId = localStorage.getItem(`wasla:active-chat:${userId}`);
    const active = threads.find((thread) => thread.id === activeId);
    if (active) return active;
    return threads.find((thread) => thread.messages?.length) || null;
  } catch {
    return null;
  }
}

function savedChatIntent(thread: ChatThread): DealIntent {
  if (thread.intent) return thread.intent;
  const context = thread.messages
    .filter((message) => message.role === "user")
    .map((message) => message.text)
    .join(" ");
  return /(?:want|need|looking) to buy|procure|أريد شراء|اريد شراء|أشتري|اشتري/i.test(
    context,
  )
    ? "buy"
    : "sell";
}

function creditCount(sar: number) {
  return Math.round(sar * 10);
}

function isLeadLaunchConfirmation(message: string) {
  return /^(?:yes|yes[, ]+go ahead|go ahead|start|launch|confirm|do it|proceed|okay|ok|نعم|ابدأ|ابدا|توكل|نفذ|تأكيد|موافق)(?:[.!، ]*)$/i.test(
    message.trim(),
  );
}

function inferLeadTypeFromConversation(value: string): "b2c" | "b2b" | null {
  const text = value.toLowerCase();
  if (
    /\b(consumer|individual|people|famil(?:y|ies)|homeowner|pet owner|car owner|customer|shopper)\b|مستهلك|أفراد|افراد|عائلات|ملاك (?:سيارات|حيوانات|منازل)/i.test(
      text,
    )
  )
    return "b2c";
  if (
    /\b(company|companies|business|businesses|founder|ceo|manager|director|decision.?maker|employee|industry|b2b)\b|شركات|شركة|مؤسس|مدير|صانع قرار|قطاع/i.test(
      text,
    )
  )
    return "b2b";
  return null;
}

function openingMissionQuestion(
  leadType: "b2c" | "b2b" | null,
  intent: DealIntent,
  language: "ar" | "en",
) {
  const ar = language === "ar";
  if (leadType === "b2c" && intent === "buy")
    return ar
      ? "ممتاز — سنبحث عن بائعين أفراد مناسبين. ما الذي تريد شراءه تحديداً، وما أهم شرط لديك: المواصفات، الحالة، أم الميزانية؟"
      : "Great—we’ll look for suitable individual sellers. What exactly do you want to buy, and what matters most: specifications, condition, or budget?";
  if (leadType === "b2c" && intent === "sell")
    return ar
      ? "خلّنا نبني جمهوراً حقيقياً لعرضك. ما المنتج أو الخدمة التي تبيعها، وما النتيجة الأساسية التي يحصل عليها العميل؟"
      : "Let’s build a real audience for your offer. What product or service are you selling, and what core outcome does the customer get?";
  if (leadType === "b2b" && intent === "buy")
    return ar
      ? "ممتاز — سنعاملها كمهمة توريد. ما الذي تحتاج شراءه، وكيف ستقيّم المورد المناسب؟"
      : "Great—we’ll treat this as a procurement mission. What do you need to buy, and how will you judge the right supplier?";
  if (leadType === "b2b" && intent === "sell")
    return ar
      ? "لنحدد الحسابات التي لديها سبب حقيقي للشراء. ما الذي تبيعه للشركات، وما المشكلة المكلفة التي يحلها؟"
      : "Let’s identify accounts with a real reason to buy. What do you sell to companies, and what costly problem does it solve?";
  return ar
    ? "أخبرني بالنتيجة التجارية التي تريدها وما الذي تبيعه أو تشتريه؛ سأحدد معك هل الأنسب أفراد أم شركات."
    : "Tell me the business outcome you want and what you are selling or buying; I’ll help determine whether people or companies are the better route.";
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, isTransitioning: languageIsTransitioning } = useLanguage();
  const [leads, setLeads] = useState<Lead[]>(hasDirectus ? [] : demoLeads);
  const [research, setResearch] = useState<CompanyResearch[]>(
    hasDirectus ? [] : demoResearch,
  );
  const [pendingLeadAsk, setPendingLeadAsk] = useState("");
  const [authOpen, setAuthOpen] = useState(
    location.pathname === "/auth" ||
      location.pathname === "/secure" ||
      location.pathname === "/auth/social",
  );
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [requestedPlan, setRequestedPlan] = useState<"launch" | "scale" | "autopilot" | null>(() => {
    const saved = window.sessionStorage.getItem("wasla:requested-plan");
    return saved === "launch" || saved === "scale" || saved === "autopilot" ? saved : null;
  });
  const [salesStatusBusy, setSalesStatusBusy] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const previousRoute = useRef<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [modelLaunchOpen, setModelLaunchOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(storedAuthKey);
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  });

  useEffect(() => {
    if (!languageIsTransitioning) return;
    setShowSplash(true);
    window.setTimeout(() => setShowSplash(false), 760);
  }, [languageIsTransitioning]);

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
    if (
      location.pathname === "/auth" ||
      location.pathname === "/secure" ||
      location.pathname === "/auth/social"
    )
      setAuthOpen(true);
    const withinConsole =
      previousRoute.current?.startsWith("/console") &&
      location.pathname.startsWith("/console");
    previousRoute.current = location.pathname;
    if (withinConsole) {
      setShowSplash(false);
      setRouteLoading(false);
      return;
    }
    setShowSplash(true);
    setRouteLoading(true);
    const routeTimer = window.setTimeout(() => setRouteLoading(false), 360);
    const splashTimer = window.setTimeout(() => setShowSplash(false), 900);
    return () => {
      window.clearTimeout(routeTimer);
      window.clearTimeout(splashTimer);
    };
  }, [location.pathname]);

  function closeAuth() {
    setAuthOpen(false);
    if (
      location.pathname === "/auth" ||
      location.pathname === "/secure" ||
      location.pathname === "/auth/social"
    )
      navigate("/");
  }

  function openAuth(mode: "signup" | "login" = "signup", plan: "launch" | "scale" | "autopilot" | null = null) {
    setAuthMode(mode);
    setRequestedPlan(plan);
    if (plan) window.sessionStorage.setItem("wasla:requested-plan", plan);
    else window.sessionStorage.removeItem("wasla:requested-plan");
    setAuthOpen(true);
  }

  function showCelebration(
    message: { title: string; body: string },
    eventKey: string,
    accountId: string,
  ) {
    const noticeKey = `wasla:toast-seen:${accountId}:${eventKey}`;
    if (window.localStorage.getItem(noticeKey)) return;
    window.localStorage.setItem(noticeKey, "shown");
    notify.success(message.title, { description: message.body, timeout: 6500 });
  }

  function enterWorkspace(user: AuthUser) {
    setAuthUser(user);
    setAuthReady(true);
    setModelLaunchOpen(false);
    if (user.isAdmin || user.subscriptionStatus === "active") {
      void fetchCapabilities().then((capabilities) => {
        setModelLaunchOpen(Boolean(capabilities.features.lead_agent_b2b));
      }).catch(() => setModelLaunchOpen(false));
    }
    navigate("/console");
  }

  async function refreshSalesStatus() {
    setSalesStatusBusy(true);
    try {
      const account = accountToAuthUser(await getAccount());
      setAuthUser(account);
      if (account.subscriptionStatus === "active") {
        const capabilities = await fetchCapabilities();
        setModelLaunchOpen(Boolean(capabilities.features.lead_agent_b2b));
      }
    } catch (error) {
      notify.danger(apiErrorMessage(error));
    } finally {
      setSalesStatusBusy(false);
    }
  }

  async function handleLogout() {
    await logoutAccount();
    setAuthUser(null);
    setAuthReady(true);
    setAuthOpen(false);
    navigate("/");
  }

  return (
    <>
      <div
        className={`wasla-splash${showSplash ? " is-visible" : ""}`}
        aria-hidden={!showSplash}
        aria-label="Loading Waslah"
        role="status"
      >
        <div className="wasla-splash__content">
          <WaslaBrand variant="english" inverse />
          <div className="wasla-splash__track" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
      <div
        className={`route-loader${routeLoading ? " is-visible" : ""}`}
        aria-hidden="true"
      >
        <span />
      </div>
      <div
        className="page-transition"
        key={
          location.pathname.includes("/console") ? "console" : location.pathname
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <LandingChat
                user={authUser}
                onLeadAsk={setPendingLeadAsk}
                onAuthOpen={openAuth}
              />
            }
          />
          <Route
            path="/secure"
            element={
              <LandingChat
                user={authUser}
                onLeadAsk={setPendingLeadAsk}
                onAuthOpen={openAuth}
              />
            }
          />
          <Route
            path="/auth"
            element={
              <LandingChat
                user={authUser}
                onLeadAsk={setPendingLeadAsk}
                onAuthOpen={openAuth}
              />
            }
          />
          <Route
            path="/auth/social"
            element={
              <LandingChat
                user={authUser}
                onLeadAsk={setPendingLeadAsk}
                onAuthOpen={openAuth}
              />
            }
          />
          <Route path="/privacy" element={<LegalPage page="privacy" />} />
          <Route
            path="/permissions"
            element={<LegalPage page="permissions" />}
          />
          <Route
            path="/console/*"
            element={
              authReady ? (
                authUser ? (
                  !authUser.isAdmin && authUser.subscriptionStatus !== "active" ? (
                    <SalesQueueScreen user={authUser} busy={salesStatusBusy} onRefresh={refreshSalesStatus} onLogout={handleLogout} />
                  ) : <ConsoleShell
                    key={authUser?.id || "guest"}
                    user={authUser}
                    initialAsk={pendingLeadAsk}
                    leads={leads}
                    research={research}
                    setLeads={setLeads}
                    setResearch={setResearch}
                    onAuthOpen={() => openAuth("signup")}
                    onLogout={handleLogout}
                  />
                ) : (
                  <Navigate to="/auth" replace />
                )
              ) : (
                <ConsoleSessionLoading />
              )
            }
          />
        </Routes>
      </div>
      <AuthDialog
        initialMode={authMode}
        selectedPlan={requestedPlan}
        open={authOpen}
        user={authUser}
        onClose={closeAuth}
        onAuthenticated={(nextUser) => {
          setAuthUser(nextUser);
          setAuthReady(true);
        }}
        onCelebration={showCelebration}
        onReady={enterWorkspace}
      />
      {modelLaunchOpen && authUser ? (
        <ModelLaunchDialog
          language={language}
          onClose={() => setModelLaunchOpen(false)}
          onChoose={(model) => {
            window.localStorage.setItem(
              `wasla:preferred-model:${authUser.id}`,
              model,
            );
            window.dispatchEvent(
              new CustomEvent("wasla:model-preference", { detail: model }),
            );
            setModelLaunchOpen(false);
            navigate("/console/agent");
          }}
        />
      ) : null}
      <div id="wasla-modal-root" />
    </>
  );
}

function SalesQueueScreen({
  user, busy, onRefresh, onLogout,
}: {
  user: AuthUser;
  busy: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const { language, direction } = useLanguage();
  const ar = language === "ar";
  const plan = user.subscriptionPlan ? user.subscriptionPlan.charAt(0).toUpperCase() + user.subscriptionPlan.slice(1) : null;
  return <main className="wasla-sales-queue" dir={direction}>
    <div className="wasla-sales-queue__preview" aria-hidden="true">
      <span /><span /><span /><i /><i /><i />
    </div>
    <div className="wasla-sales-queue__scrim" />
    <section className="wasla-sales-queue__card" aria-labelledby="sales-queue-title">
      <span className="wasla-sales-queue__lock"><Lock size={30} strokeWidth={1.5} /></span>
      <span className="wasla-sales-queue__eyebrow">WASLA PRIVATE ACCESS</span>
      <h1 id="sales-queue-title">{ar ? "طلبك في قائمة فريق مبيعات وصلة" : "Queued with Wasla Sales"}</h1>
      <p>{ar
        ? "استلمنا بياناتك. سيتواصل فريقنا لترتيب الاشتراك. لن تُفتح مساحة العملاء أو يُضاف الرصيد إلا بعد تأكيد وصول الدفعة كاملة."
        : "We have your details. Our team will arrange your subscription. Lead access and plan credit unlock only after we confirm full payment."}</p>
      {plan && <div className="wasla-sales-queue__plan"><span>{ar ? "الباقة المطلوبة" : "Requested plan"}</span><strong>{plan}</strong></div>}
      <div className="wasla-sales-queue__actions">
        <button type="button" onClick={onRefresh} disabled={busy}><RefreshCw size={16} className={busy ? "is-spinning" : ""} />{ar ? "تحديث الحالة" : "Check status"}</button>
        <button type="button" onClick={onLogout}><LogOut size={16} />{ar ? "تسجيل الخروج" : "Sign out"}</button>
      </div>
    </section>
  </main>;
}

function SidebarMetalBridge({
  children,
}: {
  children: (collapsed: boolean, toggle: () => void) => ReactNode;
}) {
  const { open, openMobile, isMobile, toggleSidebar, setOpenMobile } =
    useSidebar();
  const location = useLocation();
  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);
  return children(isMobile ? !openMobile : !open, toggleSidebar);
}

function ConsoleSessionLoading() {
  return (
    <main className="console-session-loading">
      <WaslaBrand variant="symbol" inverse />
      <RefreshCw className="is-spinning" size={18} />
      <span>Securing workspace</span>
    </main>
  );
}

function ConsoleShell({
  user,
  initialAsk,
  leads,
  research,
  setLeads,
  setResearch,
  onAuthOpen,
  onLogout,
}: {
  user: AuthUser | null;
  initialAsk: string;
  leads: Lead[];
  research: CompanyResearch[];
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  setResearch: Dispatch<SetStateAction<CompanyResearch[]>>;
  onAuthOpen: (mode?: "signup" | "login") => void;
  onLogout: () => Promise<void>;
}) {
  const { direction, language, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab =
    location.pathname.endsWith("/console") ||
    location.pathname.includes("overview")
      ? "overview"
      : location.pathname.includes("admin")
        ? "admin"
        : location.pathname.includes("crm") ? "crm" : location.pathname.includes("persona")
          ? "persona"
          : location.pathname.includes("researched")
            ? "overview"
            : location.pathname.includes("leads")
              ? "leads"
              : "agent";
  const [restoredChat] = useState(() => restoreChat(user?.id));
  const [activeTab, setActiveTab] = useState(initialTab);
  const [adminLeadTotal, setAdminLeadTotal] = useState(0);
  const handleAdminInventoryLoaded = useCallback(
    (_items: AdminLead[], total: number) => setAdminLeadTotal(total),
    [],
  );
  const [chatInput, setChatInput] = useState(initialAsk);
  const [consoleMessages, setConsoleMessages] = useState<ChatMessage[]>(
    restoredChat?.messages || [],
  );
  const [intake, setIntake] = useState<IntakeState>(
    restoredChat?.intake || {
      confidence: 0,
      summary:
        language === "ar"
          ? "بانتظار معايير العميل المطلوب."
          : "Waiting for target criteria.",
      missing:
        language === "ar"
          ? ["القطاع المستهدف", "المدينة أو السوق", "صانع القرار"]
          : [
              "target industry",
              "location or market",
              "buyer role or decision maker",
            ],
      apifyActor: "",
      apifyInput: {},
    },
  );
  const [busy, setBusy] = useState(false);
  const replyRequestEpoch = useRef(0);
  useEffect(() => () => { replyRequestEpoch.current += 1; }, []);
  const [activityMode, setActivityMode] = useState<ChatActivityMode>("idle");
  const [dealIntent, setDealIntent] = useState<DealIntent | null>(
    restoredChat ? savedChatIntent(restoredChat) : null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const leadWorkspace = useLeadWorkspace(
    user?.id,
    creditCount(user?.freeCreditSar || 0),
    setLeads,
  );
  const settledLeadShortfall = Boolean(
    leadWorkspace.job &&
    Number(leadWorkspace.job.result_count) > 0 &&
    Number(leadWorkspace.job.result_count) <
      Number(leadWorkspace.job.target_count) &&
    (["failed", "error", "cancelled", "partial"].includes(
      String(leadWorkspace.job.status).toLowerCase(),
    ) ||
      Boolean(leadWorkspace.job.b2cCampaign?.stats.sourceExhausted)),
  );
  const lastLeadErrorToast = useRef("");
  const [activeLeadSessionJobId, setActiveLeadSessionJobId] = useState<
    string | null
  >(null);
  useEffect(() => {
    const toastIdentity = `${leadWorkspace.job?.id || "workspace"}:${leadWorkspace.error}`;
    if (!leadWorkspace.error || toastIdentity === lastLeadErrorToast.current)
      return;
    lastLeadErrorToast.current = toastIdentity;
    // Connection/job notices stay in job status/toasts, never in the transcript.
    if (!activeLeadSessionJobId || leadWorkspace.job?.id !== activeLeadSessionJobId) return;
    if (settledLeadShortfall && leadWorkspace.job) {
      const delivered = Number(leadWorkspace.job.result_count);
      const noticeKey = `wasla:lead-shortfall-toast:${user?.id || "workspace"}:${leadWorkspace.job.id}`;
      if (window.localStorage.getItem(noticeKey)) return;
      window.localStorage.setItem(noticeKey, "shown");
      notify.warning(
        language === "ar"
          ? "توقف البحث قبل اكتمال العدد"
          : "Search stopped before reaching your target",
        {
          description:
            language === "ar"
              ? `وجدنا لك ${delivered} عميلاً فقط لضمان أفضل جودة ممكنة.`
              : `We found ${delivered} leads for you to ensure the best possible quality.`,
          timeout: 4500,
        },
      );
      return;
    }
    const errorNoticeKey = `wasla:lead-error-toast:${user?.id || "workspace"}:${leadWorkspace.job?.id || "no-job"}:${leadWorkspace.error}`;
    if (window.localStorage.getItem(errorNoticeKey)) return;
    window.localStorage.setItem(errorNoticeKey, "shown");
    notify.danger(
      language === "ar"
        ? `تعذر إكمال البحث: ${leadWorkspace.error}`
        : `Lead search could not complete: ${leadWorkspace.error}`,
    );
  }, [
    leadWorkspace.error,
    leadWorkspace.job,
    settledLeadShortfall,
    language,
    user?.id,
    activeLeadSessionJobId,
  ]);
  const generationLock = useRef(false);
  const [startingLeadSearch, setStartingLeadSearch] = useState(false);
  const [researchingLeadId, setResearchingLeadId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if ([...LOCKED_CONSOLE_SECTIONS].some((section) => consoleSectionLocked(section, user?.isAdmin) && location.pathname.endsWith(`/console/${section}`))) {
      navigate("/console/overview", { replace: true });
      return;
    }
    setActiveTab(
      location.pathname.endsWith("/console") ||
        location.pathname.includes("overview")
        ? "overview"
        : location.pathname.includes("admin")
          ? "admin"
          : location.pathname.includes("crm") ? "crm" : location.pathname.includes("persona")
            ? "persona"
            : location.pathname.includes("researched")
              ? user?.isAdmin ? 'researched' : 'overview'
              : location.pathname.includes("leads")
                ? "leads"
                : "agent",
    );
  }, [location.pathname, navigate, user?.isAdmin]);
  useEffect(() => {
    setLeads([]);
    setResearch([]);
  }, [user?.id, setLeads, setResearch]);
  const [companyListings, setCompanyListings] = useState<CompanyListing[]>(
    () => {
      if (!user) return [];
      try {
        return JSON.parse(
          window.localStorage.getItem(`wasla:listings:${user.id}`) || "[]",
        ) as CompanyListing[];
      } catch {
        return [];
      }
    },
  );
  const [researchPhase, setResearchPhase] = useState(0);
  const [selectedResearch, setSelectedResearch] = useState<{
    lead: Lead;
    report: CompanyResearch;
  } | null>(null);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [activeChatId, setActiveChatId] = useState(
    () => restoredChat?.id || newChatId(),
  );
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(() => {
    if (!user) return [];
    try {
      return JSON.parse(
        window.localStorage.getItem(`wasla:chats:${user.id}`) || "[]",
      ) as ChatThread[];
    } catch {
      return [];
    }
  });
  const [tourOpen, setTourOpen] = useState(false);
  const [leadCountPickerOpen, setLeadCountPickerOpen] = useState(
    restoredChat?.showLeadOptions ?? restoredChat?.intake?.confidence === 100,
  );
  const [chatReasoningMode, setChatReasoningMode] =
    useState<ChatReasoningMode | null>(
      restoredChat ? (restoredChat.reasoningMode ?? "high") : null,
    );
  const [reasoningModePickerOpen, setReasoningModePickerOpen] = useState(
    !restoredChat && initialTab === "agent",
  );
  const [leadTypePickerOpen, setLeadTypePickerOpen] = useState(false);
  const [dealDirectionPickerOpen, setDealDirectionPickerOpen] = useState(false);
  const [leadTypeChosen, setLeadTypeChosen] = useState(
    Boolean(
      restoredChat?.leadType ||
      restoredChat?.intake?.channel ||
      restoredChat?.intent,
    ),
  );
  const [selectedLeadType, setSelectedLeadType] = useState<
    "b2c" | "b2b" | null
  >(restoredChat?.leadType || restoredChat?.intake?.channel || null);
  const [selectedWaslaModel, setSelectedWaslaModel] =
    useState<WaslaModelChoice | null>(
      restoredChat?.modelChoice ??
        restoredChat?.leadType ??
        restoredChat?.intake?.channel ??
        null,
    );
  const [customerAvailableModels, setAvailableModels] = useState<Record<WaslaModelChoice, boolean>>({ b2c: true, b2b: false, ultra: false });
  const availableModels = user?.isAdmin ? { b2c: true, b2b: true, ultra: true } : customerAvailableModels;
  const [creditAlert, setCreditAlert] = useState<{
    targetLeadCount: number;
    requiredCredits: number;
    availableCredits: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leadSearchOpen, setLeadSearchOpen] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const [focusedLeadId, setFocusedLeadId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const capabilities = await fetchCapabilities();
        if (!cancelled) {
          setAvailableModels({
            b2c: Boolean(capabilities.features.lead_agent_b2c),
            b2b: Boolean(capabilities.features.lead_agent_b2b),
            ultra: Boolean(capabilities.features.lead_agent_ultra),
          });
        }
      } catch {
        /* The server still enforces the latest policy if this refresh is interrupted. */
      }
    };
    void sync();
    const timer = window.setInterval(sync, 3000);
    window.addEventListener("focus", sync);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, [user?.id]);
  useEffect(() => {
    const applyModelPreference = (event: Event) => {
      const model = (event as CustomEvent<"b2c" | "b2b">).detail;
      if (model !== "b2c" && model !== "b2b") return;
      setSelectedLeadType(model);
      setSelectedWaslaModel(model);
      setLeadTypeChosen(true);
      setIntake((current) => ({ ...current, channel: model }));
    };
    window.addEventListener("wasla:model-preference", applyModelPreference);
    return () =>
      window.removeEventListener(
        "wasla:model-preference",
        applyModelPreference,
      );
  }, []);
  const [avatarPreference, setAvatarPreference] = useState<AvatarPreference>(
    () => {
      if (!user) return { color: "ocean", showInitial: true };
      try {
        return (
          JSON.parse(
            window.localStorage.getItem(`wasla:avatar:${user.id}`) || "null",
          ) || {
            color:
              user.avatarTone === "rose"
                ? "sunset"
                : user.avatarTone === "lime"
                  ? "forest"
                  : "ocean",
            showInitial: true,
          }
        );
      } catch {
        return { color: "ocean", showInitial: true };
      }
    },
  );

  useEffect(() => {
    if (user)
      window.localStorage.setItem(
        `wasla:avatar:${user.id}`,
        JSON.stringify(avatarPreference),
      );
  }, [avatarPreference, user]);
  const [, setWorkspaceStarted] = useState(() =>
    Boolean(
      user?.isAdmin ||
      (user && window.localStorage.getItem(`wasla:first-request:${user.id}`)),
    ),
  );

  const activeChatTitle =
    consoleMessages
      .find((message) => message.role === "user")
      ?.text.slice(0, 54) || (language === "ar" ? "محادثة جديدة" : "New chat");
  const tabLabels: Record<string, string> = {
    overview: t("console.overview"),
    growth: t("console.growth"),
    agent: language === "ar" ? "المحادثة" : "Chat",
    leads: language === "ar" ? "العملاء" : "Leads",
    crm: language === "ar" ? "لوحة العملاء · CRM" : "Kanban · CRM",
    persona: language === "ar" ? "شخصية النشاط" : "Business Persona",
    researched: language === "ar" ? "العملاء المبحوثون" : "Researched Leads",
    listings: language === "ar" ? "دليل الشركات" : "Company listings",
    socials: t("console.socials"),
    insights: t("console.insights"),
    proposals: t("console.proposals"),
    academy: t("console.academy"),
    payments: t("console.payments"),
    admin: language === "ar" ? "التحكم الإداري" : "Admin control",
  };
  const visibleNavItems = user?.isAdmin
    ? [
        ...navItems,
        { to: "/console/admin", labelKey: "console.admin", icon: ShieldCheck },
      ]
    : navItems;
  const onboardingSteps =
    language === "ar"
      ? [
          {
            target: "agent",
            eyebrow: "1 من 3",
            title: "ابدأ بمحادثة",
            body: "اختر Wasla-Astraeus أو Wasla-Lite، ثم الشراء أو البيع. اشرح طلبك لوصلة لنحدد الجمهور والموقع والمعايير معاً.",
          },
          {
            target: "wallet",
            eyebrow: "2 من 3",
            title: "اختر العدد داخل المحادثة",
            body: "اختر 30 أو 50 أو 200 عميلاً. كل عميل جديد يتم جلبه يكلف 10 أرصدة (1 ر.س). المحادثة لا تتطلب رصيداً.",
          },
          {
            target: "leads",
            eyebrow: "3 من 3",
            title: "نتائجك في قسم العملاء",
            body: "ستظهر النتائج تلقائياً في جدول بسيط. يمكنك البحث فيها وفتح البحث التفصيلي لعملاء Wasla-Astraeus فقط.",
          },
        ]
      : [
          {
            target: "agent",
            eyebrow: "1 of 3",
            title: "Start with a conversation",
            body: "Choose Wasla-Astraeus or Wasla-Lite, then Buy or Sell. Tell Wasla your goal and refine your audience, location, and criteria together.",
          },
          {
            target: "wallet",
            eyebrow: "2 of 3",
            title: "Choose your count inside chat",
            body: "Choose 30, 50, or 200 leads. Each newly fetched lead costs 10 credits (1 SAR). Chat does not require credits.",
          },
          {
            target: "leads",
            eyebrow: "3 of 3",
            title: "Your results live in Leads",
            body: "Results appear automatically in a simple table. Search your inventory and open detailed company research for Wasla-Astraeus leads.",
          },
        ];

  function selectTab(key: string) {
    if (consoleSectionLocked(key, user?.isAdmin)) return;
    const tab =
      key === "overview"
        ? "overview"
        : key === "admin" && user?.isAdmin
          ? "admin"
          : key === "crm" ? "crm" : key === "persona"
            ? "persona"
            : key === "researched"
              ? "researched"
              : key === "leads"
                ? "leads"
                : "agent";
    if (
      tab === "agent" &&
      !dealIntent &&
      !consoleMessages.length &&
      !dealDirectionPickerOpen &&
      !reasoningModePickerOpen
    ) {
      if (!chatReasoningMode) {
        setReasoningModePickerOpen(true);
        setLeadTypePickerOpen(false);
      } else if (!leadTypeChosen) {
        setLeadTypePickerOpen(true);
      } else {
        setDealDirectionPickerOpen(true);
      }
    }
    setActiveTab(tab);
    setSidebarCollapsed(true);
    navigate("/console/" + tab);
  }

  function startNewChat() {
    if (busy) return;
    const nextChatId = newChatId();
    if (user) {
      window.localStorage.setItem(`wasla:active-chat:${user.id}`, nextChatId);
    }
    setActiveChatId(nextChatId);
    setActiveLeadSessionJobId(null);
    setChatInput("");
    setConsoleMessages([]);
    setDealIntent(null);
    setChatReasoningMode(null);
    setReasoningModePickerOpen(true);
    setLeadTypePickerOpen(false);
    setDealDirectionPickerOpen(false);
    setLeadTypeChosen(false);
    setLeadCountPickerOpen(false);
    setSelectedLeadType(null);
    setSelectedWaslaModel(null);
    setIntake({
      confidence: 0,
      summary:
        language === "ar"
          ? "بانتظار معايير العميل المطلوب."
          : "Waiting for target criteria.",
      missing:
        language === "ar"
          ? ["القطاع المستهدف", "المدينة أو السوق", "صانع القرار"]
          : [
              "target industry",
              "location or market",
              "buyer role or decision maker",
            ],
      apifyActor: "",
      apifyInput: {},
    });
    setActivityMode("idle");
    setResearchPhase(0);
    setChatMenuOpen(false);
    // Navigate directly after the reset. Calling selectTab here would inspect the
    // previous render's intent/messages while React is still batching the reset.
    setActiveTab("agent");
    setSidebarCollapsed(true);
    navigate("/console/agent");
    window.setTimeout(
      () =>
        document
          .querySelector<HTMLTextAreaElement>(".ops-chat-composer textarea")
          ?.focus(),
      100,
    );
  }

  function openChat(thread: ChatThread) {
    if (busy) return;
    setActiveChatId(thread.id);
    setActiveLeadSessionJobId(null);
    setConsoleMessages(thread.messages);
    setIntake(thread.intake);
    setDealIntent(savedChatIntent(thread));
    setChatReasoningMode(thread.reasoningMode ?? "high");
    setReasoningModePickerOpen(false);
    setSelectedLeadType(thread.leadType ?? thread.intake.channel ?? null);
    setSelectedWaslaModel(
      thread.modelChoice ?? thread.leadType ?? thread.intake.channel ?? null,
    );
    setLeadTypeChosen(true);
    setLeadTypePickerOpen(false);
    setDealDirectionPickerOpen(false);
    setLeadCountPickerOpen(
      thread.showLeadOptions ?? thread.intake.confidence === 100,
    );
    setChatInput("");
    setActivityMode("idle");
    setResearchPhase(0);
    setChatMenuOpen(false);
    selectTab("agent");
  }

  function focusWorkspaceSearch() {
    setSidebarCollapsed(true);
    setLeadSearchQuery("");
    setLeadSearchOpen(true);
  }

  function openLeadFromSearch(lead: Lead) {
    setLeadSearchOpen(false);
    setFocusedLeadId(lead.id);
    selectTab("leads");
    window.setTimeout(() => {
      document
        .getElementById(lead.id)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 160);
    window.setTimeout(() => setFocusedLeadId(null), 2600);
  }

  useEffect(() => {
    if (!user?.verifiedPhone) return;
    const onboardingKey = `wasla:onboarding:${user.id}`;
    if (window.localStorage.getItem(onboardingKey) !== "pending") return;
    const timer = window.setTimeout(() => setTourOpen(true), 650);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const thread: ChatThread = {
      id: activeChatId,
      title: activeChatTitle,
      updatedAt: new Date().toISOString(),
      messages: consoleMessages,
      intake,
      intent: dealIntent,
      leadType: selectedLeadType,
      modelChoice: selectedWaslaModel,
      reasoningMode: chatReasoningMode,
      showLeadOptions: leadCountPickerOpen,
    };
    window.localStorage.setItem(`wasla:active-chat:${user.id}`, activeChatId);
    setChatThreads((current) => {
      const next = [
        thread,
        ...current.filter((item) => item.id !== activeChatId),
      ].slice(0, 12);
      window.localStorage.setItem(
        `wasla:chats:${user.id}`,
        JSON.stringify(next),
      );
      return next;
    });
  }, [
    activeChatId,
    activeChatTitle,
    consoleMessages,
    dealIntent,
    chatReasoningMode,
    intake,
    selectedLeadType,
    selectedWaslaModel,
    leadCountPickerOpen,
    user,
  ]);

  useEffect(() => {
    if (!user) return;
    window.localStorage.setItem(
      `wasla:listings:${user.id}`,
      JSON.stringify(companyListings),
    );
  }, [companyListings, user]);

  useEffect(() => {
    const focusMissionSearch = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k")
        return;
      event.preventDefault();
      focusWorkspaceSearch();
    };
    window.addEventListener("keydown", focusMissionSearch);
    return () => window.removeEventListener("keydown", focusMissionSearch);
  });

  function completeTour() {
    if (user)
      window.localStorage.setItem(`wasla:onboarding:${user.id}`, "complete");
    setTourOpen(false);
  }

  async function sendConsoleMessage(text = chatInput) {
    if (!text.trim() || busy) return;
    if (selectedWaslaModel && !availableModels[selectedWaslaModel]) {
      notify.info(language === "ar" ? "هذا النموذج يحتاج موافقة الإدارة قبل استخدامه." : "This model needs admin approval before you can use it.");
      return;
    }
    if (!chatReasoningMode) {
      setReasoningModePickerOpen(true);
      notify.info(
        language === "ar"
          ? "اختر سرعة المحادثة أولاً."
          : "Choose a conversation mode first.",
      );
      return;
    }
    if (!leadTypeChosen) {
      setLeadTypePickerOpen(true);
      notify.info(
        language === "ar"
          ? "اختر نموذج وصلة أولاً."
          : "Choose your Wasla model first.",
      );
      return;
    }
    if (!dealIntent) {
      setDealDirectionPickerOpen(true);
      notify.info(
        language === "ar"
          ? "اختر أولاً: هل تريد الشراء أم البيع؟"
          : "Choose Buy or Sell before starting the chat.",
      );
      return;
    }
    setLeadCountPickerOpen(false);
    const retryingLastMessage = consoleMessages.at(-1)?.role === 'user' && consoleMessages.at(-1)?.text === text;
    const nextMessages: ChatMessage[] = retryingLastMessage ? [...consoleMessages] : [
      ...consoleMessages,
      { role: "user", text },
    ];
    const effectiveLeadType =
      selectedLeadType ??
      inferLeadTypeFromConversation(
        nextMessages.map((item) => item.text).join(" "),
      );
    if (!selectedLeadType && effectiveLeadType)
      setSelectedLeadType(effectiveLeadType);
    setConsoleMessages(nextMessages);
    setChatInput("");
    const websiteUrl = websiteInputUrl(text);
    if (websiteUrl) {
      setBusy(true); setActivityMode('thinking');
      const epoch = ++replyRequestEpoch.current;
      try {
        const job = await startWebsiteRead(websiteUrl, activeChatId, language);
        if (epoch !== replyRequestEpoch.current) return;
        setConsoleMessages([...nextMessages,{role:'assistant',text:'',websiteRead:job}]);
        setLeadCountPickerOpen(false);
        setIntake(current=>({...current,confidence:Math.min(current.confidence,50),missing:[language==='ar'?'تأكيد ما فهمته من الموقع':'Confirm website understanding']}));
      } catch(error) { if(epoch===replyRequestEpoch.current){setChatInput(text);notify.warning(apiErrorMessage(error));} }
      finally {if(epoch===replyRequestEpoch.current){setBusy(false);setActivityMode('idle');}}
      return;
    }
    const requestedQuantity = parseReadyLeadQuantity(text);
    if (intake.confidence === 100 && requestedQuantity !== null) {
      await runConsoleFetch(intake, requestedQuantity);
      return;
    }
    if (intake.confidence === 100 && isLeadLaunchConfirmation(text)) {
      setLeadCountPickerOpen(true);
      return;
    }
    setBusy(true);
    setActivityMode("thinking");
    const replyStarted = performance.now();
    const replyEpoch = ++replyRequestEpoch.current;
    setResearchPhase(0);
    const phaseTimer = window.setInterval(
      () => setResearchPhase((current) => Math.min(current + 1, 3)),
      900,
    );
    const intentContext =
      effectiveLeadType === "b2c" && dealIntent === "buy"
        ? language === "ar"
          ? "سياق المهمة: يريد شراء شيء من بائعين أفراد. افهم السلعة والمواصفات والحالة والميزانية والموقع والاستعجال وإشارات البائع الموثوق."
          : "Mission context: the user wants to buy from individual sellers. Understand the item, specifications, condition, budget, location, urgency, and credible-seller signals."
        : effectiveLeadType === "b2c" && dealIntent === "sell"
          ? language === "ar"
            ? "سياق المهمة: يريد بيع عرضه لأفراد. افهم العرض والعميل المثالي والموقع وإشارات النية أو الملكية والفئات والكلمات والاستبعادات."
            : "Mission context: the user wants to sell to consumers. Understand the offer, ideal customer, geography, observable intent or ownership signals, categories, keywords, and exclusions."
          : effectiveLeadType === "b2b" && dealIntent === "buy"
            ? language === "ar"
              ? "سياق المهمة: يريد الشراء من شركات أو موردين. افهم المتطلبات والكمية والميزانية والنطاق وقدرات المورد والاعتمادات وموعد التسليم ومعايير الاختيار."
              : "Mission context: the user wants to buy from companies or suppliers. Understand requirements, volume, budget, geography, supplier capabilities, certifications, delivery timing, and selection criteria."
            : effectiveLeadType === "b2b" && dealIntent === "sell"
              ? language === "ar"
                ? "سياق المهمة: يريد بيع عرضه لشركات. افهم العرض والتميّز والقطاع والموقع وحجم الشركة وصانع القرار والألم وإشارة الشراء والاستبعادات."
                : "Mission context: the user wants to sell to companies. Understand the offer, differentiation, industry, geography, company size, decision-maker, pain, buying signal, and exclusions."
              : language === "ar"
                ? "سياق المهمة: لم يحدد نوع العملاء. افهم الهدف التجاري أولاً واستنتج المسار الأنسب بشكل طبيعي."
                : "Mission context: the lead type is undecided. Understand the commercial goal first and infer the best route naturally.";
    const listingContext = companyListings.length
      ? ` ${language === "ar" ? "الشركات المتاحة في دليل وصلة" : "Companies available in Wasla listings"}: ${companyListings.map((listing) => `${listing.name} (${listing.industry}, ${listing.location})`).join("; ")}.`
      : "";
    try {
    const [result] = await Promise.all([
      converseWithWasla(
        text,
        [
          `user: ${intentContext}${listingContext}`,
          ...nextMessages.map((message) => `${message.role}: ${message.text}`),
        ],
        language,
        dealIntent,
        activeChatId,
        effectiveLeadType,
        intake.b2cPlanning,
        chatReasoningMode,
        selectedWaslaModel,
      ),
      new Promise((resolve) => window.setTimeout(resolve, 420)),
    ]);
    window.clearInterval(phaseTimer);
    if (replyEpoch !== replyRequestEpoch.current) return;
    setResearchPhase(3);
    if (result.tenderOffer && result.mode !== 'lead') setLeadCountPickerOpen(false);
    if (result.mode === "lead" && !isSmallTalkTurn(text)) {
      setIntake((current) => ({
        ...result.intake,
        ...(result.intake.channel === "b2b" && result.intake.model !== "astraeus_ultra"
          ? {
              signalSource: current.signalSource,
              signalPostUrls: [
                ...new Set([
                  ...(current.signalPostUrls || []),
                  ...(result.intake.signalPostUrls || []),
                ]),
              ].slice(0, 8),
            }
          : {}),
      }));
      setLeadCountPickerOpen(result.intake.confidence === 100);
    }
    setConsoleMessages([
      ...nextMessages,
      {
        role: "assistant",
        text: result.text,
        tenderOffer: result.tenderOffer,
        responseMs: Math.round(performance.now() - replyStarted),
        repliedAt: Date.now(),
      },
    ]);
    setBusy(false);
    setActivityMode("idle");
    // The customer may ask for a count while the server recovers an already
    // confirmed brief (e.g. after reload). Honor that exact count, not a preset.
    if (requestedQuantity !== null && result.mode === 'lead' && result.intake.confidence === 100) {
      await runConsoleFetch(result.intake, requestedQuantity);
    }
    } catch (error) {
      if (replyEpoch === replyRequestEpoch.current) {
        setChatInput(text);
        notify.warning(apiErrorMessage(error, language === 'ar' ? 'تعذر الرد الآن. محادثتك وسياقك محفوظان؛ حاول مجدداً.' : 'Could not reply just now. Your conversation and context are kept; please retry.'));
      }
    } finally {
      window.clearInterval(phaseTimer);
      if (replyEpoch === replyRequestEpoch.current) { setBusy(false); setActivityMode('idle'); }
    }
  }

  async function runConsoleFetch(
    mission = intake,
    targetLeadCount = 30,
    leadType: "b2c" | "b2b" = mission.channel === "b2c" ? "b2c" : "b2b",
  ) {
    if (busy || generationLock.current || mission.confidence < 100) return;
    if (!availableModels[mission.model === "astraeus_ultra" ? "ultra" : leadType]) {
      notify.info(language === "ar" ? "هذا النموذج يحتاج موافقة الإدارة قبل بدء البحث." : "This model needs admin approval before starting a search.");
      return;
    }
    if (leadWorkspace.running) {
      setActiveLeadSessionJobId(leadWorkspace.job?.id || null);
      setLeadCountPickerOpen(false);
      notify.info(
        language === "ar"
          ? "البحث الحالي ما زال جارياً"
          : "Your current search is still running",
        {
          description:
            language === "ar"
              ? "يمكنك متابعة تقدمه هنا."
              : "You can follow its progress here.",
        },
      );
      selectTab("agent");
      return;
    }
    const launchReplyStarted = performance.now();
    generationLock.current = true;
    setStartingLeadSearch(true);
    setLeadCountPickerOpen(false);
    setBusy(true);
    setActivityMode("thinking");
    try {
      const account = await getAccount();
      const available = Math.floor(account.wallet.balance * 10);
      leadWorkspace.setCredits(available);
      if (available < targetLeadCount * 10) {
        setCreditAlert({
          targetLeadCount,
          requiredCredits: targetLeadCount * 10,
          availableCredits: available,
        });
        setLeadCountPickerOpen(true);
        return;
      }
      const job = await startLeadGeneration(
        { ...mission, channel: leadType },
        dealIntent ?? "sell",
        targetLeadCount,
        chatReasoningMode === "fast" ? "fast" : "high",
      );
      // The server is the source of truth for quantity. Using its confirmed
      // value prevents a stale picker/render from saying 50 while a 200-lead
      // campaign is actually running.
      const confirmedTargetLeadCount = Math.max(
        1,
        Number(job.target_count || targetLeadCount),
      );
      leadWorkspace.acceptJob(job);
      setActiveLeadSessionJobId(job.id);
      notify.info(
        language === "ar"
          ? "تم إدراج بحثك في قائمة التشغيل."
          : "Your lead search is queued.",
        {
          description:
            language === "ar"
              ? `العدد المطلوب ${confirmedTargetLeadCount}. تابع حالة البحث والنتائج هنا.`
              : `Requested: ${confirmedTargetLeadCount}. Follow the search status and results here.`,
          action: {
            label: language === "ar" ? "عرض العملاء" : "View leads",
            onAction: () => selectTab("leads"),
          },
        },
      );
      setLeadCountPickerOpen(false);
      setConsoleMessages((messages) => [
        ...messages,
        {
          role: "user",
          text:
            language === "ar"
              ? "طلب بحث عن " + confirmedTargetLeadCount + " عميلاً."
              : "Requested a search for " + confirmedTargetLeadCount + " leads.",
        },
        {
          role: "assistant",
          text:
            language === "ar"
              ? "تم إدراج بحثك للتشغيل. ستظهر حالة البحث والنتائج هنا؛ يمكنك متابعة المحادثة أثناء ذلك."
              : "Your search is queued. Its status and results will appear here; you can keep chatting while it runs.",
          responseMs: Math.round(performance.now() - launchReplyStarted),
          repliedAt: Date.now(),
        },
      ]);
      setWorkspaceStarted(true);
      if (user)
        window.localStorage.setItem(
          "wasla:first-request:" + user.id,
          "created",
        );
      selectTab("agent");
    } catch (error) {
      if (
        ["INSUFFICIENT_CREDITS", "INSUFFICIENT_CREDIT"].includes(
          apiErrorCode(error) || "",
        )
      ) {
        const account = await getAccount().catch(() => null);
        const available = account
          ? Math.floor(account.wallet.balance * 10)
          : leadWorkspace.credits;
        leadWorkspace.setCredits(available);
        setCreditAlert({
          targetLeadCount,
          requiredCredits: targetLeadCount * 10,
          availableCredits: available,
        });
      } else {
        notify.danger(
          apiErrorMessage(
            error,
            language === "ar"
              ? "تعذر بدء البحث. حاول مجدداً."
              : "Could not start the search. Please try again.",
          ),
        );
      }
      setLeadCountPickerOpen(true);
    } finally {
      setStartingLeadSearch(false);
      generationLock.current = false;
      setBusy(false);
      setActivityMode("idle");
    }
  }

  const hasPendingResearch = research.some(
    (entry) => entry.status === "researching",
  );
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    async function syncResearch() {
      if (inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      let pending = hasPendingResearch;
      try {
        const entries = await fetchWorkspaceResearch();
        if (cancelled) return;
        pending = entries.some((entry) => entry.status === "researching");
        setResearch(entries);
      } catch {
        /* Preserve saved reports during temporary connection failures. */
      } finally {
        inFlight = false;
      }
      if (!cancelled && pending) timer = setTimeout(syncResearch, 8000);
    }
    void syncResearch();
    window.addEventListener("focus", syncResearch);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", syncResearch);
    };
  }, [user?.id, setResearch, hasPendingResearch]);

  async function handleResearch(lead: Lead) {
    if (/b2c/i.test(lead.source)) return;
    const existing = research.find((item) => item.leadId === lead.id);
    if (existing?.status === "completed") {
      setSelectedResearch({ lead, report: existing });
      return;
    }
    if (existing?.status === "researching" || researchingLeadId === lead.id)
      return;
    setResearchingLeadId(lead.id);
    try {
      const saved = await getLeadResearch(lead);
      const entry =
        saved?.status === "completed" || saved?.status === "researching"
          ? saved
          : await researchLead(lead);
      setResearch((current) => [
        entry,
        ...current.filter((item) => item.leadId !== entry.leadId),
      ]);
      if (entry.status === "completed")
        setSelectedResearch({ lead, report: entry });
      else
        notify.info(
          language === "ar"
            ? "بدأ البحث. يمكنك متابعة عملك، وسيُحفظ التقرير تلقائياً."
            : "Research started. Keep working — your report will be saved automatically.",
        );
    } catch (error) {
      notify.danger(
        apiErrorMessage(
          error,
          language === "ar"
            ? "تعذر بدء البحث."
            : "Research could not be started.",
        ),
      );
    } finally {
      setResearchingLeadId(null);
    }
  }

  return (
    <>
      <div
        className={`hconsole${language === "ar" ? " is-arabic" : ""}${sidebarCollapsed ? " has-collapsed-sidebar" : ""}`}
        dir={direction}
      >
        <SidebarProvider
          open={!sidebarCollapsed}
          onOpenChange={(open) => setSidebarCollapsed(!open)}
          className="hconsole-shell wasla-dashboard dark"
          style={
            {
              "--sidebar-width": "248px",
              "--sidebar-width-icon": "64px",
            } as React.CSSProperties
          }
        >
          <SidebarMetalBridge>
            {(collapsed, toggle) => (
              <SidebarMetalToggle
                collapsed={collapsed}
                onClick={toggle}
                language={language}
              />
            )}
          </SidebarMetalBridge>
          <Sidebar
            side={language === "ar" ? "right" : "left"}
            variant="inset"
            collapsible="icon"
            closeOnAction
            className="dashboard-sidebar"
            dir={direction}
          >
            <SidebarHeader className="dashboard-sidebar-head">
              <Link to="/" className="dashboard-brand">
                <WaslaBrand variant="english" inverse />
                <span>{language === "ar" ? "مساحة العمل" : "Workspace"}</span>
              </Link>
              <button
                className="hconsole-sidebar-search"
                onClick={focusWorkspaceSearch}
              >
                <Search size={15} />
                <span>
                  {language === "ar" ? "ابحث في عملائك" : "Search your leads"}
                </span>
                <kbd>
                  <Command size={11} /> K
                </kbd>
              </button>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <UiButton className="dashboard-new-chat" onClick={startNewChat}>
                  <Plus size={16} />
                  <span>
                    {language === "ar" ? "محادثة جديدة" : "New conversation"}
                  </span>
                </UiButton>
                <SidebarGroupLabel>
                  {language === "ar" ? "مساحة العمل" : "Workspace"}
                </SidebarGroupLabel>
                <SidebarMenu>
                  {visibleNavItems.map((item) => {
                    const key = item.to.split("/").at(-1)!;
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={key}>
                        <SidebarMenuButton
                          isActive={activeTab === key}
                          onClick={() => selectTab(key)}
                          tooltip={tabLabels[key]}
                          data-tour={key}
                          aria-current={activeTab === key ? "page" : undefined}
                          disabled={consoleSectionLocked(key, user?.isAdmin)}
                        >
                          <Icon size={17} />
                          <span>{tabLabels[key]}</span>
                          {consoleSectionLocked(key, user?.isAdmin) && <Lock size={13} aria-hidden="true" />}
                          {key === "leads" && (
                            <small className="dashboard-nav-count">
                              {user?.isAdmin ? adminLeadTotal : leads.length}
                            </small>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
              <SidebarGroup className="dashboard-sidebar-bottom">
                <SidebarGroupLabel>
                  {language === "ar" ? "مساحتك" : "Your workspace"}
                </SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={
                        language === "ar"
                          ? "كيف تستخدم وصلة"
                          : "Getting started"
                      }
                      onClick={() => {
                        setSidebarCollapsed(true);
                        setTourOpen(true);
                      }}
                    >
                      <Sparkles size={16} />
                      <span>
                        {language === "ar"
                          ? "كيف تستخدم وصلة"
                          : "Getting started"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={language === "ar" ? "الإعدادات" : "Settings"}
                      onClick={() => {
                        setSidebarCollapsed(true);
                        setSettingsOpen(true);
                      }}
                    >
                      <Settings size={16} />
                      <span>
                        {language === "ar" ? "الإعدادات" : "Settings"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <UiCard className="dashboard-wallet" data-tour="wallet">
                <UiCardContent>
                  <div>
                    <WalletCards size={15} />
                    <span>
                      {language === "ar"
                        ? "الأرصدة المتاحة"
                        : "Available credits"}
                    </span>
                    <span className="dashboard-wallet-dot" />
                  </div>
                  <strong>
                    {leadWorkspace.credits.toLocaleString(
                      language === "ar" ? "ar-SA" : "en-US",
                    )}
                    <small>{language === "ar" ? "رصيد" : "credits"}</small>
                  </strong>
                  <p>
                    {language === "ar"
                      ? "10 أرصدة = 1 ر.س = عميل واحد"
                      : "10 credits = 1 SAR = 1 lead"}
                  </p>
                </UiCardContent>
              </UiCard>
              <div className="hconsole-profile-card">
                <AvatarMark user={user} preference={avatarPreference} />
                <div className="hconsole-profile-card__identity">
                  <strong>
                    {user?.name ??
                      (language === "ar" ? "مساحة ضيف" : "Guest workspace")}
                  </strong>
                  <small>
                    {user?.business ??
                      (language === "ar" ? "وصلة التجريبية" : "Wasla demo")}
                  </small>
                </div>
                <button
                  aria-label={
                    language === "ar" ? "إعدادات الحساب" : "Account settings"
                  }
                  data-tooltip={language === "ar" ? "الإعدادات" : "Settings"}
                  onClick={() => {
                    setSidebarCollapsed(true);
                    setSettingsOpen(true);
                  }}
                >
                  <Settings size={15} />
                </button>
                <button
                  className="hconsole-profile-card__logout"
                  aria-label={language === "ar" ? "تسجيل الخروج" : "Log out"}
                  data-tooltip={language === "ar" ? "تسجيل الخروج" : "Log out"}
                  onClick={() => void onLogout()}
                >
                  <LogOut size={15} />
                </button>
              </div>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="hconsole-main">
            <Card className="hconsole-topbar">
              <Card.Content>
                <div className="hconsole-context">
                  <span>
                    <CircleDot size={12} />{" "}
                    {user?.business ??
                      (language === "ar" ? "مساحة وصلة" : "Wasla workspace")}
                  </span>
                  <strong>{tabLabels[activeTab] ?? "Overview"}</strong>
                </div>
                <div className="hconsole-actions">
                  <button
                    className="hconsole-icon-button"
                    aria-label={
                      language === "ar" ? "الإشعارات" : "Notifications"
                    }
                    data-tooltip={
                      language === "ar" ? "الإشعارات" : "Notifications"
                    }
                  >
                    <Bell size={16} />
                    <i />
                  </button>
                  {!user && (
                    <Button
                      variant="secondary"
                      onClick={() => onAuthOpen("signup")}
                    >
                      {language === "ar" ? "إنشاء حساب" : "Create account"}
                    </Button>
                  )}
                  <div
                    className={`chat-switcher${chatMenuOpen ? " is-open" : ""}`}
                  >
                    <button
                      className="chat-switcher__trigger"
                      type="button"
                      onClick={() => setChatMenuOpen((current) => !current)}
                      aria-expanded={chatMenuOpen}
                    >
                      <MessageSquare size={15} />
                      <span>{activeChatTitle}</span>
                      <History size={14} />
                    </button>
                    {chatMenuOpen ? (
                      <div className="chat-switcher__menu">
                        <button
                          className="is-new"
                          type="button"
                          onClick={startNewChat}
                        >
                          <Plus size={15} />
                          <span>
                            {language === "ar"
                              ? "ابدأ محادثة جديدة"
                              : "Start a new chat"}
                          </span>
                        </button>
                        <div>
                          {chatThreads
                            .filter((thread) => thread.messages.length)
                            .slice(0, 6)
                            .map((thread) => (
                              <button
                                type="button"
                                key={thread.id}
                                onClick={() => openChat(thread)}
                                className={
                                  thread.id === activeChatId ? "is-active" : ""
                                }
                              >
                                <MessageSquare size={14} />
                                <span>
                                  <strong>{thread.title}</strong>
                                </span>
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card.Content>
            </Card>

            <UiTabs
              dir={direction}
              value={activeTab}
              onValueChange={selectTab}
              className="hconsole-tabs"
            >
              <TabsList
                className="dashboard-section-tabs"
                aria-label="Console sections"
              >
                <TabsTrigger value="overview">{tabLabels.overview}</TabsTrigger>
                <TabsTrigger value="agent">{tabLabels.agent}</TabsTrigger>
                <TabsTrigger value="leads">{tabLabels.leads}</TabsTrigger>
                <TabsTrigger value="crm">{tabLabels.crm}</TabsTrigger>
                <TabsTrigger value="persona">{tabLabels.persona}</TabsTrigger>
                <TabsTrigger value="researched" disabled={!user?.isAdmin}>
                  {tabLabels.researched}
                </TabsTrigger>
                {user?.isAdmin ? (
                  <TabsTrigger value="admin">{tabLabels.admin}</TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent value="overview">
                <DashboardOverview
                  leads={leads}
                  research={research}
                  language={language}
                  loading={leadWorkspace.loading}
                  onNavigate={selectTab}
                  onNewChat={startNewChat}
                  onRefresh={leadWorkspace.refresh}
                />
              </TabsContent>

              <TabsContent value="agent">
                <AgentMissionPage
                  activityMode={activityMode}
                  busy={busy}
                  chatInput={chatInput}
                  consoleMessages={consoleMessages}
                  onWebsiteReadUpdate={job=>setConsoleMessages(current=>current.map(item=>item.websiteRead?.id===job.id?{...item,websiteRead:job,...(job.status==='completed'?{text:job.text||'',responseMs:Date.now()-Date.parse(job.created_at),repliedAt:Date.now()}:{})}:item))}
                  intake={intake}
                  onSignalChange={(patch) =>
                    setIntake((current) => ({ ...current, ...patch }))
                  }
                  onOpenSignal={async (id) => {
                    try {
                      const job = await fetchLeadJob(id);
                      leadWorkspace.acceptJob(job);
                      setActiveLeadSessionJobId(id);
                    } catch (error) {
                      notify.danger(
                        apiErrorMessage(error, "Could not open this run"),
                      );
                    }
                  }}
                  language={language}
                  availableCredits={leadWorkspace.credits}
                  leadCountPickerOpen={leadCountPickerOpen}
                  reasoningModePickerOpen={reasoningModePickerOpen}
                  leadTypePickerOpen={leadTypePickerOpen}
                  dealDirectionPickerOpen={dealDirectionPickerOpen}
                  leadTypeChosen={leadTypeChosen}
                  reasoningMode={chatReasoningMode}
                  selectedLeadType={selectedLeadType}
                  selectedWaslaModel={selectedWaslaModel}
                  availableModels={availableModels}
                  leadJob={startingLeadSearch ? null : leadWorkspace.job}
                  leadStream={startingLeadSearch ? [] : leadWorkspace.jobLeads}
                  leadPanelActive={
                    startingLeadSearch ||
                    Boolean(
                      activeLeadSessionJobId &&
                      leadWorkspace.job?.id === activeLeadSessionJobId,
                    )
                  }
                  onInputChange={setChatInput}
                  intent={dealIntent}
                  onRun={(targetLeadCount) =>
                    runConsoleFetch(
                      intake,
                      targetLeadCount,
                      selectedLeadType ?? intake.channel ?? "b2b",
                    )
                  }
                  onLeadCountPickerChange={setLeadCountPickerOpen}
                  onReasoningModeSelect={(mode) => {
                    setChatReasoningMode(mode);
                    setReasoningModePickerOpen(false);
                    if (leadTypeChosen) {
                      setLeadTypePickerOpen(false);
                      setDealDirectionPickerOpen(true);
                    } else {
                      setLeadTypePickerOpen(true);
                    }
                  }}
                  onLeadTypeSelect={(leadType) => {
                    if (!availableModels[leadType]) return;
                    setSelectedLeadType(
                      leadType === "ultra" ? "b2b" : leadType,
                    );
                    setSelectedWaslaModel(leadType);
                    setLeadTypeChosen(true);
                    setLeadTypePickerOpen(false);
                    setDealDirectionPickerOpen(true);
                  }}
                  onDirectionSelect={(intent) => {
                    setDealIntent(intent);
                    setDealDirectionPickerOpen(false);
                    setConsoleMessages([
                      {
                        role: "assistant",
                        text: selectedWaslaModel === "ultra"
                          ? chatReasoningMode === "fast"
                            ? language === "ar"
                              ? "ما نوع الشركات التي تستهدفها في السعودية، ومن صاحب القرار الذي تريد التواصل معه؟"
                              : "Which kinds of companies in Saudi Arabia are you targeting, and which decision-maker role should I find?"
                            : language === "ar"
                              ? "ما المنتج أو الخدمة التي تقدمها، وما النتيجة الأساسية التي يحصل عليها عميلك؟"
                              : "What product or service do you offer, and what concrete result does a customer get from it?"
                          : openingMissionQuestion(selectedLeadType, intent, language),
                      },
                    ]);
                    setIntake({
                      confidence: 0,
                      summary:
                        intent === "buy"
                          ? language === "ar"
                            ? "أخبرني بما تريد شراءه وسأحدد معك البائع أو المورد المثالي."
                            : "Tell me what you want to buy and I’ll define the ideal seller or supplier with you."
                          : language === "ar"
                            ? "أخبرني بما تبيعه وسأحدد معك العميل المثالي."
                            : "Tell me what you sell and I’ll define the ideal buyer with you.",
                      missing: [
                        intent === "buy"
                          ? language === "ar"
                            ? "ما تريد شراءه"
                            : "what you want to buy"
                          : language === "ar"
                            ? "المنتج أو الخدمة"
                            : "product or service",
                      ],
                      apifyActor: "",
                      apifyInput: {},
                      channel: selectedLeadType ?? undefined,
                      ...(selectedWaslaModel === "ultra" ? { model: "astraeus_ultra" as const } : {}),
                    });
                  }}
                  onReasoningModePickerClose={() =>
                    setReasoningModePickerOpen(false)
                  }
                  onLeadTypePickerClose={() => setLeadTypePickerOpen(false)}
                  onDirectionPickerClose={() =>
                    setDealDirectionPickerOpen(false)
                  }
                  onModelChange={(modelChoice) => {
                    if (!availableModels[modelChoice]) return;
                    setSelectedWaslaModel(modelChoice);
                    const leadType =
                      modelChoice === "ultra" ? "b2b" : modelChoice;
                    setSelectedLeadType(leadType);
                    setLeadTypeChosen(true);
                    setIntake((current) => ({
                      ...current,
                      channel: leadType ?? undefined,
                      model: modelChoice === "ultra" ? "astraeus_ultra" : undefined,
                      confidence: 0,
                      apifyInput: {},
                      businessUnderstanding: undefined,
                    }));
                  }}
                  onReasoningModeChange={(mode) => {
                    setChatReasoningMode(mode);
                    setIntake((current) => ({
                      ...current,
                      confidence: 0,
                      businessUnderstanding: undefined,
                    }));
                  }}
                  onResumeSetup={() => {
                    if (!chatReasoningMode) {
                      setReasoningModePickerOpen(true);
                    } else if (!leadTypeChosen) {
                      setLeadTypePickerOpen(true);
                    } else if (!dealIntent) {
                      setDealDirectionPickerOpen(true);
                    }
                  }}
                  onInsufficientCredits={(targetLeadCount) => {
                    setCreditAlert({
                      targetLeadCount,
                      requiredCredits: targetLeadCount * 10,
                      availableCredits: leadWorkspace.credits,
                    });
                  }}
                  onSend={sendConsoleMessage}
                  researchPhase={researchPhase}
                  user={user}
                />
              </TabsContent>

              <TabsContent value="researched">
                <ResearchedLeads
                  leads={leads}
                  research={research}
                  language={language}
                  onOpen={handleResearch}
                />
              </TabsContent>
              <TabsContent value="leads">
                {user?.isAdmin ? (
                  <AdminLeadExplorer
                    onInventoryLoaded={handleAdminInventoryLoaded}
                  />
                ) : (
                  <CoreLeadsWorkspace
                    leads={leads}
                    research={research}
                    language={language}
                    job={leadWorkspace.job}
                    loading={leadWorkspace.loading}
                    error={settledLeadShortfall ? "" : leadWorkspace.error}
                    focusedLeadId={focusedLeadId}
                    researchingLeadId={researchingLeadId}
                    onRefresh={leadWorkspace.refresh}
                    onChat={() => selectTab("agent")}
                    onResearch={handleResearch}
                    onPersona={() => selectTab("persona")}
                  />
                )}
              </TabsContent>

              <TabsContent value="crm">
                <LeadPipelineBoard leads={leads} language={language} onPersona={() => selectTab("persona")} onRefreshLeads={leadWorkspace.refresh} />
              </TabsContent>
              <TabsContent value="persona">
                <BusinessPersonaWorkspace language={language} />
              </TabsContent>

              {user?.isAdmin ? (
                <TabsContent value="admin">
                  <AdminControlCenter language={language} />
                </TabsContent>
              ) : null}

              <TabsContent value="growth">
                <GrowthWorkspace
                  language={language}
                  leads={leads}
                  onOpenSocials={() => selectTab("socials")}
                  onStartTour={() => setTourOpen(true)}
                />
              </TabsContent>

              <TabsContent value="socials">
                <SocialsWorkspace language={language} />
              </TabsContent>

              <TabsContent value="listings">
                <CompanyListingsPage
                  listings={companyListings}
                  language={language}
                  onAdd={(listing) =>
                    setCompanyListings((current) => [listing, ...current])
                  }
                />
              </TabsContent>

              <TabsContent value="insights">
                <InsightDashboard
                  leads={leads}
                  research={research}
                  language={language}
                />
              </TabsContent>

              <TabsContent value="proposals">
                <Card className="hconsole-card">
                  <Card.Header>
                    <Card.Title>{proposals[0].title}</Card.Title>
                    <Card.Description>
                      {leads.find((lead) => lead.id === proposals[0].leadId)
                        ?.company ??
                        leads[0]?.company ??
                        "-"}
                    </Card.Description>
                  </Card.Header>
                  <Card.Content className="hconsole-proposal">
                    <p>{proposals[0].generatedCopy}</p>
                    <div className="hconsole-actions">
                      <Chip>
                        <Chip.Label>{money(proposals[0].value)}</Chip.Label>
                      </Chip>
                      <Button
                        onClick={() =>
                          notify.success(
                            language === "ar"
                              ? "تم إرسال العرض للمراجعة"
                              : "Proposal queued for review",
                          )
                        }
                      >
                        {language === "ar" ? "إرسال للمراجعة" : "Queue review"}
                      </Button>
                    </div>
                  </Card.Content>
                </Card>
              </TabsContent>

              <TabsContent value="academy">
                <WaslaTutorial
                  key={user?.id}
                  workspaceKey={user?.id || "guest"}
                  language={language}
                  onNavigate={(section) => selectTab(section)}
                  onStartTour={() => {
                    selectTab("growth");
                    window.setTimeout(() => setTourOpen(true), 180);
                  }}
                />
              </TabsContent>

              <TabsContent value="payments">
                <PaymentPage language={language} />
              </TabsContent>
            </UiTabs>
          </SidebarInset>
        </SidebarProvider>
        <WaslaNavCapsule
          mode="console"
          placement="bottom"
          user={user}
          onAuthOpen={onAuthOpen}
          onNavigate={(key) =>
            key === "agent" ? startNewChat() : selectTab(key)
          }
        />
      </div>
      {creditAlert
        ? createPortal(
            <div
              className="credit-alert"
              role="presentation"
              onMouseDown={() => setCreditAlert(null)}
            >
              <section
                className="credit-alert__window"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="credit-alert-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="credit-alert__icon">
                  <WalletCards size={28} />
                </div>
                <div className="credit-alert__copy">
                  <span>
                    {language === "ar" ? "رصيد المهمة" : "Mission credit"}
                  </span>
                  <h2 id="credit-alert-title">
                    {language === "ar"
                      ? "ليس لديك رصيد كافٍ"
                      : "You don’t have enough credits"}
                  </h2>
                  <p>
                    {language === "ar"
                      ? `تحتاج إلى ${creditAlert.requiredCredits.toLocaleString()} رصيد لتوليد ${creditAlert.targetLeadCount.toLocaleString()} عميلاً. رصيدك الحالي ${creditAlert.availableCredits.toLocaleString()}.`
                      : `You need ${creditAlert.requiredCredits.toLocaleString()} credits to generate ${creditAlert.targetLeadCount.toLocaleString()} leads. Your current balance is ${creditAlert.availableCredits.toLocaleString()}.`}
                  </p>
                </div>
                <div className="credit-alert__balance">
                  <div>
                    <span>{language === "ar" ? "المطلوب" : "Required"}</span>
                    <strong>
                      {creditAlert.requiredCredits.toLocaleString()}
                    </strong>
                  </div>
                  <i />
                  <div>
                    <span>{language === "ar" ? "المتاح" : "Available"}</span>
                    <strong>
                      {creditAlert.availableCredits.toLocaleString()}
                    </strong>
                  </div>
                </div>
                <small className="credit-alert__note">
                  {language === "ar"
                    ? "يمكنك متابعة المحادثة مجاناً. يُستخدم الرصيد فقط عند توليد العملاء."
                    : "You can keep chatting for free. Credits are only used when leads are generated."}
                </small>
                <div className="credit-alert__actions">
                  <button
                    type="button"
                    className="is-secondary"
                    onClick={() => {
                      setCreditAlert(null);
                      setLeadCountPickerOpen(true);
                    }}
                  >
                    {language === "ar"
                      ? "اختر عدداً آخر"
                      : "Choose another amount"}
                  </button>
                  <button type="button" onClick={() => setCreditAlert(null)}>
                    {language === "ar"
                      ? "متابعة المحادثة"
                      : "Continue chatting"}
                  </button>
                </div>
              </section>
            </div>,
            document.getElementById("wasla-modal-root") ?? document.body,
          )
        : null}
      {settingsOpen
        ? createPortal(
            <div
              className="credit-alert settings-dialog"
              role="presentation"
              onMouseDown={() => setSettingsOpen(false)}
            >
              <section
                className="credit-alert__window settings-dialog__window"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-dialog-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="settings-dialog__header">
                  <AvatarMark
                    user={user}
                    size="lg"
                    preference={avatarPreference}
                  />
                  <div>
                    <span>{language === "ar" ? "الحساب" : "Account"}</span>
                    <h2 id="settings-dialog-title">
                      {language === "ar"
                        ? "إعدادات الحساب"
                        : "Account settings"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    aria-label={language === "ar" ? "إغلاق" : "Close"}
                    onClick={() => setSettingsOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </header>
                <div className="settings-dialog__details">
                  <label>
                    <span>{language === "ar" ? "الاسم" : "Name"}</span>
                    <strong>{user?.name || "—"}</strong>
                  </label>
                  <label>
                    <span>
                      {language === "ar" ? "البريد الإلكتروني" : "Email"}
                    </span>
                    <strong>{user?.email || "—"}</strong>
                  </label>
                  <label>
                    <span>
                      {language === "ar" ? "المنشأة" : "Organization"}
                    </span>
                    <strong>{user?.business || "—"}</strong>
                  </label>
                  <label>
                    <span>
                      {language === "ar" ? "حالة الجوال" : "Phone status"}
                    </span>
                    <strong>
                      {user?.verifiedPhone
                        ? language === "ar"
                          ? "موثّق"
                          : "Verified"
                        : language === "ar"
                          ? "غير موثّق"
                          : "Not verified"}
                    </strong>
                  </label>
                </div>
                <div className="settings-dialog__preference">
                  <div>
                    <strong>
                      {language === "ar" ? "لغة الواجهة" : "Interface language"}
                    </strong>
                    <small>
                      {language === "ar"
                        ? "غيّر لغة مساحة العمل"
                        : "Change the workspace language"}
                    </small>
                  </div>
                  <LanguageToggle inverse />
                </div>
                <div className="settings-dialog__avatar-options">
                  <div>
                    <strong>
                      {language === "ar"
                        ? "لون الصورة الرمزية"
                        : "Avatar color"}
                    </strong>
                    <small>
                      {language === "ar"
                        ? "اختر تدرجاً يظهر في كل مساحة العمل"
                        : "Choose a gradient used across your workspace"}
                    </small>
                  </div>
                  <div className="settings-dialog__palette">
                    {Object.entries(avatarGradients).map(([key, gradient]) => (
                      <button
                        key={key}
                        type="button"
                        className={
                          avatarPreference.color === key ? "is-active" : ""
                        }
                        style={{ background: gradient }}
                        onClick={() =>
                          setAvatarPreference((current) => ({
                            ...current,
                            color: key,
                          }))
                        }
                        aria-label={key}
                      />
                    ))}
                  </div>
                  <label className="settings-dialog__initial-toggle">
                    <input
                      type="checkbox"
                      checked={avatarPreference.showInitial}
                      onChange={(event) =>
                        setAvatarPreference((current) => ({
                          ...current,
                          showInitial: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      {language === "ar"
                        ? "إظهار الأحرف الأولى"
                        : "Show initials"}
                    </span>
                  </label>
                </div>
                <div className="credit-alert__actions">
                  <button
                    className="is-secondary settings-dialog__logout"
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      void onLogout();
                    }}
                  >
                    <LogOut size={15} />{" "}
                    {language === "ar" ? "تسجيل الخروج" : "Log out"}
                  </button>
                  <button type="button" onClick={() => setSettingsOpen(false)}>
                    {language === "ar" ? "تم" : "Done"}
                  </button>
                </div>
              </section>
            </div>,
            document.getElementById("wasla-modal-root") ?? document.body,
          )
        : null}
      {leadSearchOpen
        ? createPortal(
            <WorkspaceLeadSearch
              leads={leads}
              language={language}
              query={leadSearchQuery}
              onQueryChange={setLeadSearchQuery}
              onClose={() => setLeadSearchOpen(false)}
              onOpenLead={openLeadFromSearch}
            />,
            document.getElementById("wasla-modal-root") ?? document.body,
          )
        : null}
      {selectedResearch ? (
        <LeadResearchPage
          lead={selectedResearch.lead}
          report={selectedResearch.report}
          language={language}
          onClose={() => setSelectedResearch(null)}
        />
      ) : null}
      <ProductTour
        open={tourOpen}
        steps={onboardingSteps}
        onComplete={completeTour}
      />
    </>
  );
}

function WorkspaceLeadSearch({
  leads,
  language,
  query,
  onQueryChange,
  onClose,
  onOpenLead,
}: {
  leads: Lead[];
  language: "ar" | "en";
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onOpenLead: (lead: Lead) => void;
}) {
  const leadIntentLabel = (lead: Lead) => {
    const intent =
      [lead.industry, ...lead.tags]
        .map((value) => String(value || "").trim())
        .find(
          (value) =>
            value &&
            !/^(b2b|b2c|wasla(?:-|\s)?lite|wasla(?:-|\s)?astraeus)$/i.test(
              value,
            ),
        ) || lead.company;

    return language === "ar"
      ? `يبحث عن · ${intent}`
      : `Looking for · ${intent}`;
  };

  const leadContactLabel = (lead: Lead) => {
    if (lead.phone && lead.email) {
      return language === "ar" ? "هاتف وبريد متاحان" : "Phone + email";
    }
    if (lead.phone) return language === "ar" ? "قابل للاتصال" : "Callable";
    if (lead.email)
      return language === "ar" ? "البريد متاح" : "Email available";
    if (lead.website)
      return language === "ar" ? "الموقع متاح" : "Website available";
    return language === "ar" ? "ملف العميل جاهز" : "Lead profile ready";
  };

  const normalized = query.trim().toLocaleLowerCase();
  const matches = leads
    .filter(
      (lead) =>
        !normalized ||
        [
          lead.name,
          lead.title,
          lead.company,
          lead.email,
          lead.phone,
          lead.location,
          lead.industry,
          lead.source,
          ...lead.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalized),
    )
    .slice(0, 12);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div
      className="workspace-lead-search"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={
          language === "ar" ? "البحث في العملاء" : "Search your leads"
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={
              language === "ar"
                ? "ابحث بالاسم، الشركة، القطاع، المدينة أو بيانات التواصل..."
                : "Search name, company, industry, city, or contact details..."
            }
            aria-label={
              language === "ar" ? "ابحث في عملائك" : "Search your leads"
            }
          />
          <kbd>ESC</kbd>
        </header>
        <div className="workspace-lead-search__meta">
          <span>
            {language === "ar"
              ? "عملاء هذه المساحة فقط"
              : "This workspace’s leads only"}
          </span>
          <strong>
            {leads.length.toLocaleString(language === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>
        <div className="workspace-lead-search__results">
          {matches.map((lead) => (
            <button
              type="button"
              key={lead.id}
              onClick={() => onOpenLead(lead)}
            >
              <span
                className={`workspace-lead-search__intent is-${/b2c/i.test(lead.source) ? "b2c" : "b2b"}`}
                title={leadIntentLabel(lead)}
              >
                {/b2c/i.test(lead.source) ? (
                  <UserPlus size={13} />
                ) : (
                  <Building2 size={13} />
                )}
                <span>{leadIntentLabel(lead)}</span>
              </span>
              <span>
                <strong>{lead.name}</strong>
                <small>
                  {lead.title} · {lead.company}
                </small>
              </span>
              <span className="workspace-lead-search__availability">
                <b>{leadContactLabel(lead)}</b>
                <small>{lead.location}</small>
              </span>
              {language === "ar" ? (
                <ArrowLeft size={15} />
              ) : (
                <ArrowRight size={15} />
              )}
            </button>
          ))}
          {!matches.length ? (
            <div className="workspace-lead-search__empty">
              <Search size={24} />
              <strong>
                {language === "ar" ? "لا يوجد عميل مطابق" : "No matching lead"}
              </strong>
              <small>
                {language === "ar"
                  ? "جرّب اسماً أو شركة أو قطاعاً أو مدينة مختلفة."
                  : "Try another name, company, industry, or city."}
              </small>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function LeadResearchPage(props: {
  lead: Lead;
  report: CompanyResearch;
  language: "ar" | "en";
  onClose: () => void;
}) {
  return <ResearchDossier {...props} />;
}

function AgentMissionPage({
  activityMode,
  availableCredits,
  busy,
  chatInput,
  consoleMessages,
  onWebsiteReadUpdate,
  intake,
  onSignalChange,
  onOpenSignal,
  intent,
  language,
  leadCountPickerOpen,
  reasoningModePickerOpen,
  leadTypePickerOpen,
  dealDirectionPickerOpen,
  leadTypeChosen,
  reasoningMode,
  selectedLeadType,
  selectedWaslaModel,
  availableModels,
  leadJob,
  leadStream,
  leadPanelActive,
  onInputChange,
  onRun,
  onLeadCountPickerChange,
  onReasoningModeSelect,
  onLeadTypeSelect,
  onDirectionSelect,
  onReasoningModePickerClose,
  onLeadTypePickerClose,
  onDirectionPickerClose,
  onModelChange,
  onReasoningModeChange,
  onResumeSetup,
  onInsufficientCredits,
  onSend,
  researchPhase,
  user,
}: {
  activityMode: ChatActivityMode;
  availableCredits: number;
  busy: boolean;
  chatInput: string;
  consoleMessages: ChatMessage[];
  onWebsiteReadUpdate: (job: WebsiteRead) => void;
  intake: IntakeState;
  onSignalChange: (patch: Partial<IntakeState>) => void;
  onOpenSignal: (id: string) => void;
  intent: DealIntent | null;
  language: "ar" | "en";
  leadCountPickerOpen: boolean;
  reasoningModePickerOpen: boolean;
  leadTypePickerOpen: boolean;
  dealDirectionPickerOpen: boolean;
  leadTypeChosen: boolean;
  reasoningMode: ChatReasoningMode | null;
  selectedLeadType: "b2c" | "b2b" | null;
  selectedWaslaModel: WaslaModelChoice | null;
  availableModels: Record<WaslaModelChoice, boolean>;
  leadJob: LeadJob | null;
  leadStream: Lead[];
  leadPanelActive: boolean;
  onInputChange: (value: string) => void;
  onRun: (targetLeadCount: number) => void;
  onLeadCountPickerChange: (open: boolean) => void;
  onReasoningModeSelect: (mode: ChatReasoningMode) => void;
  onLeadTypeSelect: (leadType: LeadTypeChoice) => void;
  onDirectionSelect: (intent: DealIntent) => void;
  onReasoningModePickerClose: () => void;
  onLeadTypePickerClose: () => void;
  onDirectionPickerClose: () => void;
  onModelChange: (model: WaslaModelChoice) => void;
  onReasoningModeChange: (mode: ChatReasoningMode) => void;
  onResumeSetup: () => void;
  onInsufficientCredits: (targetLeadCount: number) => void;
  onSend: () => void;
  researchPhase: number;
  user: AuthUser | null;
}) {
  const ready = intake.confidence === 100;
  const setupComplete = Boolean(reasoningMode && leadTypeChosen && intent);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = composerInputRef.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "0px";
      const maximum = Math.min(200, window.innerHeight * 0.28);
      input.style.height = `${Math.min(input.scrollHeight, maximum)}px`;
      input.style.overflowY = input.scrollHeight > maximum ? "auto" : "hidden";
    };
    resize();
    const observer = new ResizeObserver(resize);
    const composer = input.parentElement;
    if (composer) observer.observe(composer, { box: "border-box" });
    window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, [chatInput, language]);
  const setupModalOpen =
    reasoningModePickerOpen || leadTypePickerOpen || dealDirectionPickerOpen;
  const [promptIndex, setPromptIndex] = useState(0);
  const [showSignalRun, setShowSignalRun] = useState(true);
  useEffect(() => {
    setShowSignalRun(true);
  }, [leadJob?.id]);
  const conversationRef = useRef<HTMLDivElement>(null);
  const promptExamples =
    language === "ar"
      ? selectedLeadType === "b2c" && intent === "buy"
        ? [
            "أريد شراء سيارات مستعملة من ملاك أفراد في الرياض",
            "أبحث عن أجهزة ألعاب مستعملة بحالة ممتازة في جدة",
            "أريد شراء معدات زراعية مباشرة من ملاكها",
          ]
        : selectedLeadType === "b2b" && intent === "buy"
          ? [
              "أبحث عن مورد تغليف سعودي لكميات شهرية",
              "أريد شركات برمجيات تنفذ نظام حجوزات للعيادات",
              "ابحث عن مصنعين معتمدين لمعدات المطاعم",
            ]
          : selectedLeadType === "b2b" && intent === "sell"
            ? [
                "أبيع نظام CRM للعيادات متعددة الفروع",
                "أقدم أتمتة عروض الأسعار لشركات اللوجستيات",
                "أريد بيع خدمات الأمن السيبراني لشركات متوسطة",
              ]
            : [
                "أبيع اشتراكات بث وأريد عملاء محتملين في السعودية",
                "أقدم خدمات رعاية للحيوانات وأبحث عن ملاك حيوانات",
                "أبيع إكسسوارات سيارات وأريد الوصول إلى ملاك المركبات",
              ]
      : selectedLeadType === "b2c" && intent === "buy"
        ? [
            "I want to buy used cars from private owners in Riyadh",
            "Find excellent-condition used gaming consoles in Jeddah",
            "I want to buy farm equipment directly from owners",
          ]
        : selectedLeadType === "b2b" && intent === "buy"
          ? [
              "I need a Saudi packaging supplier for monthly volume",
              "Find software firms that build clinic booking systems",
              "Find certified manufacturers of restaurant equipment",
            ]
          : selectedLeadType === "b2b" && intent === "sell"
            ? [
                "I sell CRM software to multi-branch clinics",
                "I automate quoting for logistics companies",
                "I sell cybersecurity services to mid-market companies",
              ]
            : [
                "I sell streaming subscriptions in Saudi Arabia",
                "I offer pet-care services and want pet owners",
                "I sell car accessories and want vehicle owners",
              ];

  useEffect(() => {
    if (consoleMessages.length || chatInput) return;
    const timer = window.setInterval(
      () => setPromptIndex((current) => (current + 1) % promptExamples.length),
      3200,
    );
    return () => window.clearInterval(timer);
  }, [chatInput, consoleMessages.length, promptExamples.length]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    conversation.scrollTo({
      top: conversation.scrollHeight,
      behavior: "smooth",
    });
  }, [activityMode, busy, consoleMessages, leadCountPickerOpen]);

  if (leadPanelActive && leadJob?.provider === "signal" && showSignalRun) {
    return (
      <section className="ops-agent-page signal-page" data-tour="agent">
        <SignalWorkspace
          id={leadJob.id}
          language={language}
          onBack={() => setShowSignalRun(false)}
        />
      </section>
    );
  }
  return (
    <section
      className="ops-agent-page"
      data-tour="agent"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <div className="ops-agent-page__top">
        <div>
          <span />{" "}
          {leadPanelActive && searchActivity(leadJob, language).running
            ? language === "ar"
              ? "البحث عن العملاء جارٍ"
              : "Finding leads"
            : busy
              ? language === "ar"
                ? "جارٍ التفكير…"
                : "Thinking…"
              : language === "ar"
                ? "جاهز للمحادثة"
                : "Ready to chat"}
        </div>
        <strong>
          {language === "ar" ? "محادثة جديدة" : "New conversation"}
        </strong>
      </div>

      <div
        dir={language === "ar" ? "rtl" : "ltr"}
        className={`ops-chat-workspace${leadPanelActive && leadJob?.provider !== "signal" ? " is-sourcing" : ""}`}
      >
        {leadPanelActive && leadJob?.provider !== "signal" ? (
          <LiveLeadStream
            job={leadJob}
            leads={leadStream}
            language={language}
          />
        ) : null}
        <div
          className={`ops-chat-stage${consoleMessages.length ? " has-conversation" : ""}`}
        >
          {intent ? (
            <span className={`ops-intent-badge is-${intent ?? "sell"}`}>
              <i />
              {selectedWaslaModel === "ultra"
                ? language === "ar"
                  ? "عملاء Wasla-Astraeus Ultra"
                  : "Wasla-Astraeus Ultra leads"
                : selectedLeadType === "b2c"
                ? language === "ar"
                  ? "عملاء Wasla-Lite"
                  : "Wasla-Lite leads"
                : selectedLeadType === "b2b"
                  ? language === "ar"
                    ? "عملاء Wasla-Astraeus"
                    : "Wasla-Astraeus leads"
                  : language === "ar"
                    ? "سأحدد نوع العميل معك"
                    : "Lead type will be inferred"}
            </span>
          ) : null}
          {reasoningMode ? (
            <span className={`ops-reasoning-badge is-${reasoningMode}`}>
              {reasoningMode === "fast" ? (
                <Activity size={13} />
              ) : (
                <BrainCircuit size={13} />
              )}
              {reasoningMode === "fast"
                ? language === "ar"
                  ? "سريع 1.5×"
                  : "Fast 1.5×"
                : language === "ar"
                  ? "استدلال عميق"
                  : "High reasoning"}
            </span>
          ) : null}
          <header className="ops-chat-stage__intro">
            <span>
              {language === "ar"
                ? "محادثة تحول الوصف إلى عملاء"
                : "A conversation that turns intent into leads"}
            </span>
            <h1 key={`${language}-${promptIndex}`}>
              {consoleMessages.length
                ? language === "ar"
                  ? "اختر المودل المستحب"
                  : "Choose your Wasla Model"
                : promptExamples[promptIndex]}
            </h1>
            <p>
              {language === "ar"
                ? "اكتب طلبك كما تقوله لزميل. سأفهمه معك، ثم أنقل النتائج مباشرة إلى قسم العملاء."
                : "Ask the way you would ask a colleague. I’ll refine it with you, then stream verified results directly into Leads."}
            </p>
          </header>

          <div
            className="ops-agent-page__conversation"
            aria-live="polite"
            ref={conversationRef}
          >
            {consoleMessages.map((message, index) => (
              <div
                className={`ops-chat-message is-${message.role}`}
                key={`${message.role}-${index}-${message.text}`}
              >
                <span className="ops-chat-message__mark">
                  {message.role === "assistant" ? (
                    <WaslaBrand variant="symbol" inverse />
                  ) : (
                    (user?.name?.slice(0, 1) ?? "Y")
                  )}
                </span>
                <div className="ops-chat-message__content" dir={language==='ar'?'rtl':'ltr'}>
                  {message.role === 'assistant' && !message.websiteRead && message.responseMs != null && <details className="chat-work-summary" dir={language==='ar'?'rtl':'ltr'}><summary>{language==='ar'?'مدة العمل':'Worked for'} <bdi dir="ltr">{(message.responseMs/1000).toFixed(1)}s</bdi><span aria-hidden="true">›</span></summary><small className="chat-response-time" dir={language==='ar'?'rtl':'ltr'}>{language === 'ar' ? 'زمن الرد' : 'Response time'} <bdi dir="ltr">{(message.responseMs / 1000).toFixed(1)}s</bdi></small></details>}
                  {message.websiteRead && <WebsiteReadProgress job={message.websiteRead} ar={language==='ar'} onUpdate={onWebsiteReadUpdate}/>}
                  {message.websiteRead && message.websiteRead.status !== 'completed' ? null : message.role === 'assistant' ? <RevealedChatReply text={scanFriendlyAssistantText(message.text)} repliedAt={message.repliedAt}/> : <ReactMarkdown
                    components={{
                      a: ({ children, ...props }) => (
                        <a {...props} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {message.text}
                  </ReactMarkdown>
                  }
                  {message.tenderOffer && <ChatTenderResults offer={message.tenderOffer} ar={language === 'ar'}/>}
                </div>
              </div>
            ))}
            {leadPanelActive && leadJob?.provider !== "signal" ? (
              <ChatSearchActivity
                job={leadJob}
                language={language}
                showSocialLookup={
                  selectedWaslaModel === "b2c"
                }
              />
            ) : null}
            {leadPanelActive && leadJob?.provider === "signal" && (
              <button
                className="signal-open-run"
                onClick={() => setShowSignalRun(true)}
              >
                {language === "ar"
                  ? "افتح مساحة البحث المباشر"
                  : "Open live search workspace"}{" "}
                ↗
              </button>
            )}
            {leadCountPickerOpen && ready && !busy ? (
              <div
                className="chat-lead-options"
                role="group"
                aria-label={
                  language === "ar" ? "اختر عدد العملاء" : "Choose lead count"
                }
              >
                <div>
                  <strong>
                    {language === "ar"
                      ? "كم عميلاً تريد؟"
                      : "How many leads do you want?"}
                  </strong>
                  <small>
                    {language === "ar"
                      ? "10 أرصدة = عميل واحد · أو اكتب عدداً من 1 إلى 200"
                      : "10 credits = 1 fetched lead · Or type any number from 1 to 200"}
                  </small>
                </div>
                <div>
                  {[30, 50, 200].map((count) => {
                    const affordable = availableCredits >= count * 10;
                    return (
                      <button
                        key={count}
                        type="button"
                        className={affordable ? "" : "is-unaffordable"}
                        aria-disabled={!affordable}
                        data-disabled-reason={
                          affordable
                            ? undefined
                            : language === "ar"
                              ? "رصيدك غير كافٍ — اشترك لتوليد العملاء مجدداً"
                              : "You’re out of credits — subscribe to generate again"
                        }
                        onClick={() => {
                          if (!affordable) {
                            onInsufficientCredits(count);
                            return;
                          }
                          onLeadCountPickerChange(false);
                          onRun(count);
                        }}
                      >
                        {!affordable ? (
                          <X className="ops-lead-count-picker__x" size={17} />
                        ) : null}
                        <strong>{count}</strong>
                        <small>
                          {count * 10} {language === "ar" ? "رصيد" : "credits"}
                        </small>
                      </button>
                    );
                  })}
                  <button
                    className="ops-lead-count-picker__cancel"
                    type="button"
                    onClick={() => onLeadCountPickerChange(false)}
                  >
                    {language === "ar" ? "متابعة المحادثة" : "Keep chatting"}
                  </button>
                </div>
              </div>
            ) : null}

            {busy && (!leadPanelActive || activityMode === 'thinking') ? (
              <ResearchActivity
                language={language}
                mode={activityMode}
                phase={researchPhase}
              />
            ) : null}
          </div>

          {!setupComplete && !setupModalOpen ? (
            <div className="ops-chat-setup-lock" role="status">
              <div>
                <UiBadge
                  variant="outline"
                  className="ops-chat-setup-lock__badge"
                >
                  {language === "ar" ? "الإعداد مطلوب" : "Setup required"}
                </UiBadge>
                <strong>
                  {!reasoningMode
                    ? language === "ar"
                      ? "اختر سرعة التفكير للمتابعة"
                      : "Choose how Wasla should think"
                    : !leadTypeChosen
                      ? language === "ar"
                        ? "اختر نموذج وصلة للمتابعة"
                        : "Choose your Wasla model"
                      : language === "ar"
                        ? "حدد هل تريد الشراء أم البيع"
                        : "Choose whether you want to buy or sell"}
                </strong>
              </div>
              <UiButton type="button" variant="outline" onClick={onResumeSetup}>
                {language === "ar" ? "متابعة الإعداد" : "Continue setup"}
                {language === "ar" ? <ArrowLeft /> : <ArrowRight />}
              </UiButton>
            </div>
          ) : null}

          <BorderBeam
            className="ops-chat-composer-beam"
            size="md"
            colorVariant="colorful"
            strength={0.7}
            theme="dark"
            active={!busy}
          >
            <div className="ops-chat-composer">
              <textarea
                ref={composerInputRef}
                className="ops-chat-composer__input"
                rows={1}
                value={chatInput}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    if (!busy && setupComplete && chatInput.trim()) onSend();
                  }
                }}
                placeholder={
                  !reasoningMode
                    ? language === "ar"
                      ? "اختر سرعة المحادثة أولاً"
                      : "Choose a conversation mode first"
                    : !leadTypeChosen
                      ? language === "ar"
                        ? "اختر نموذج وصلة أولاً"
                        : "Choose your Wasla model first"
                      : !intent
                        ? language === "ar"
                          ? "اختر الشراء أو البيع أولاً"
                          : "Choose Buy or Sell first"
                        : `${language === "ar" ? "مثال" : "Example"}: ${promptExamples[0]}`
                }
                aria-label={
                  language === "ar" ? "اكتب رسالة إلى وصلة" : "Message Wasla"
                }
                disabled={!setupComplete}
              />
              <ChatModelSelector
                language={language}
                model={selectedWaslaModel}
                availableModels={availableModels}
                reasoningMode={reasoningMode ?? "high"}
                onModelChange={onModelChange}
                onReasoningModeChange={onReasoningModeChange}
              />
              <span className="ops-chat-composer__sparkle" aria-hidden="true">
                <Sparkles size={22} />
              </span>
              <LiquidMetalSubmitButton
                onClick={() => onSend()}
                disabled={busy || !setupComplete || !chatInput.trim()}
                label={language === "ar" ? "إرسال الرسالة" : "Send message"}
              >
                {language === "ar" ? (
                  <ArrowUpLeft size={34} />
                ) : (
                  <ArrowUpRight size={34} />
                )}
              </LiquidMetalSubmitButton>
            </div>
          </BorderBeam>

          {reasoningModePickerOpen ? (
            <LeadSetupModal
              language={language}
              title={
                language === "ar"
                  ? "كيف تريد أن تفكر وصلة؟"
                  : "How should Wasla think?"
              }
              description={
                language === "ar"
                  ? "اختر سرعة التأهيل قبل بدء هذه المحادثة."
                  : "Choose the qualification depth before this conversation starts."
              }
              choices={[
                {
                  id: "fast",
                  icon: Activity,
                  sticker: "FAST 1.5×",
                  title:
                    language === "ar"
                      ? "تلقين سريع 1.5×"
                      : "Fast prompting 1.5×",
                  body:
                    language === "ar"
                      ? "من 3 إلى 5 أسئلة ذكية كحد أقصى"
                      : "A maximum of 3–5 focused questions",
                },
                {
                  id: "high",
                  icon: BrainCircuit,
                  sticker: "DEEP",
                  title: language === "ar" ? "استدلال عميق" : "High reasoning",
                  body:
                    language === "ar"
                      ? "يفهم منطق النشاط وسلسلة القيمة قبل الاستهداف"
                      : "Understands the business logic and value chain first",
                },
              ]}
              onClose={onReasoningModePickerClose}
              onChoose={(id) => onReasoningModeSelect(id as ChatReasoningMode)}
            />
          ) : null}

          {leadTypePickerOpen ? (
            <LeadSetupModal
              language={language}
              title={language === "ar" ? "اختر نموذجك" : "Choose your model"}
              description={
                language === "ar"
                  ? "اختر نموذج وصلة الأنسب لهذه المحادثة."
                  : "Select the Wasla model for this conversation."
              }
              choices={[
                {
                  id: "b2c",
                  icon: UserPlus,
                  sticker: "LITE",
                  title: "Wasla-Lite",
                  body:
                    language === "ar"
                      ? "أفراد ومستهلكون"
                      : "People and consumers",
                },
                {
                  id: "b2b",
                  icon: Building2,
                  sticker: "ASTRAEUS",
                  title: "Wasla-Astraeus",
                  disabled: !availableModels.b2b,
                  body:
                    !availableModels.b2b
                      ? language === "ar" ? "مقفل — يتطلب موافقة الإدارة" : "Locked — admin approval required"
                    : language === "ar"
                      ? "عملاء مطابقون لطلبك، مع رقم هاتف أو بدونه"
                      : "Matching leads, with or without phone numbers",
                },
                {
                  id: "ultra",
                  icon: PhoneCall,
                  sticker: "ULTRA",
                  title: "Wasla-Astraeus Ultra",
                  disabled: !availableModels.ultra,
                  body: !availableModels.ultra
                    ? language === "ar" ? "مقفل — يتطلب موافقة الإدارة" : "Locked — admin approval required"
                    : language === "ar"
                      ? "عملاء مطابقون في السعودية مع أرقام هاتف"
                      : "Matching Saudi leads with phone numbers",
                },
              ]}
              onClose={onLeadTypePickerClose}
              onChoose={(id) => onLeadTypeSelect(id as LeadTypeChoice)}
            />
          ) : null}

          {dealDirectionPickerOpen ? (
            <LeadSetupModal
              language={language}
              title={
                language === "ar"
                  ? "ما هدفك من العملاء؟"
                  : "What do you want to do?"
              }
              description={
                language === "ar"
                  ? "هذا يساعدني على طرح الأسئلة الصحيحة."
                  : "This helps me ask the right qualification questions."
              }
              choices={[
                {
                  id: "sell",
                  icon: Target,
                  sticker: language === "ar" ? "بيع" : "SELL",
                  title: language === "ar" ? "أريد أن أبيع" : "I want to sell",
                  body:
                    language === "ar"
                      ? "اعثر على مشترين مناسبين"
                      : "Find matched buyers",
                },
                {
                  id: "buy",
                  icon: Building2,
                  sticker: language === "ar" ? "شراء" : "BUY",
                  title: language === "ar" ? "أريد أن أشتري" : "I want to buy",
                  body:
                    language === "ar"
                      ? "اعثر على موردين وفرص"
                      : "Find suppliers and opportunities",
                },
              ]}
              onClose={onDirectionPickerClose}
              onChoose={(id) => onDirectionSelect(id as DealIntent)}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function searchActivity(
  job: LeadJob | null,
  language: "ar" | "en",
): { state: OrbState; label: string; detail: string; running: boolean } {
  const ar = language === "ar";
  const stats = job?.b2cCampaign?.stats;
  const status = (job?.b2cCampaign?.status || job?.status || "").toLowerCase();
  const delivered = Number(job?.result_count || 0);
  const target = Number(job?.target_count || 0);
  const stopped = ["failed", "error", "cancelled", "partial"].includes(status);
  const complete = ["completed", "sourced"].includes(status);
  const event = stats?.executionLedger?.at(-1)?.code || "";
  const phase = String(stats?.activeStrategyPhase || "");
  if (stopped || complete)
    return {
      state: "breathing",
      running: false,
      label: ar
        ? status === 'partial' ? 'نتائج جزئية' : complete
          ? "اكتمل البحث"
          : "توقف البحث"
        : status === 'partial' ? 'Partial results' : complete
          ? "Search complete"
          : "Search stopped",
      detail: ar
        ? `تمت إضافة ${delivered} من أصل ${target} عميلاً. النتائج المحفوظة متاحة هنا.`
        : job?.error_message || `${delivered} of ${target} leads saved. Your results remain available here.`,
    };
  if (job?.provider === 'apify') return {
    state: 'searching', running: true,
    label: ar ? 'نبحث عبر المصادر المناسبة' : 'Searching compatible sources',
    detail: ar ? `تم حفظ ${delivered} من ${target}. نراجع نتائج إضافية ونستبعد التكرار ضمن ميزانية البحث.` : `${delivered} of ${target} saved. Reviewing more sources and removing duplicates within the search budget.`,
  };
  if (stats?.mahally && !stats.mahally.complete) return {
    state: 'searching', running: true,
    label: ar ? 'نبحث عن المتاجر في محلي' : 'Finding stores on Mahally',
    detail: ar
      ? `تم فحص ${stats.mahally.checked || 0} متجر. نراجع موقع المتجر وأرقام التواصل المتاحة، ثم نحفظ النتائج الفريدة.`
      : `${stats.mahally.checked || 0} stores checked. Reviewing merchant websites and available contact numbers, then saving distinct results.`,
  };
  if (!stats?.postsFetched)
    return {
      state: "breathing",
      running: true,
      label: ar ? "نجهّز بحثك" : "Preparing your search",
      detail: ar
        ? "نحوّل وصفك إلى عبارات بحث محلية تناسب العميل المطلوب."
        : "Turning your brief into local search terms that fit your audience.",
    };
  if (event === "PAGE_FETCHED")
    return {
      state: "working",
      running: true,
      label: ar ? "نفحص أرقام التواصل" : "Checking available phone numbers",
      detail: ar
        ? "نفحص بيانات التواصل المنشورة قبل مراجعة ملاءمة كل إعلان."
        : "Checking published contact details before reviewing each listing’s relevance.",
    };
  if (event === "PHONE_PREFLIGHT_COMPLETED")
    return {
      state: "solving",
      running: true,
      label: ar ? "نراجع مدى الملاءمة" : "Reviewing potential matches",
      detail: ar
        ? "نقارن الإعلانات بطلبك ونستبعد النتائج غير المناسبة."
        : "Comparing reachable advertisers with your brief and filtering unrelated results.",
    };
  if (event === "LEAD_DELIVERED" || event === "CONTACT_BATCH_COMPLETED")
    return {
      state: "working",
      running: true,
      label: ar ? "ننظّم النتائج" : "Organizing your results",
      detail: ar
        ? "نزيل التكرار ونضيف العملاء المناسبين مع أرقام التواصل المتاحة."
        : "Removing duplicates and saving relevant contacts with available phone numbers.",
    };
  return {
    state: "searching",
    running: true,
    label: ar
      ? phase.includes("fallback") || phase.includes("recovery")
        ? "نوسّع نطاق البحث"
        : "نبحث في الإعلانات العامة"
      : phase.includes("fallback") || phase.includes("recovery")
        ? "Broadening the search"
        : "Searching public listings",
    detail: ar
      ? "نراجع نتائج جديدة للعثور على أشخاص يناسبون طلبك، بما في ذلك إشارات الاهتمام والملكية."
      : "Exploring fresh listings for people who fit your brief, including buying-interest and ownership signals.",
  };
}

function ChatSearchActivity({
  job,
  language,
  showSocialLookup,
}: {
  job: LeadJob | null;
  language: "ar" | "en";
  showSocialLookup: boolean;
}) {
  const activity = searchActivity(job, language);
  return (
    <div className="ops-chat-search-activity" role="status">
      <span
        className={
          activity.running
            ? "ops-chat-search-activity__orb"
            : "ops-chat-search-activity__orb is-stopped"
        }
      >
        <ThinkingOrb
          state={activity.state}
          paused={!activity.running}
          size={64}
          theme="dark"
          aria-label={activity.label}
        />
      </span>
      <div>
        <strong>{activity.label}</strong>
        <p>{activity.detail}</p>
        <small>
          {language === "ar" ? "العملاء المحفوظون" : "Leads saved"} ·{" "}
          {Number(job?.result_count || 0)} / {Number(job?.target_count || 0)}
        </small>
      </div>
      {activity.running && showSocialLookup ? (
        <SocialNetworkScan language={language} />
      ) : null}
    </div>
  );
}

function LiveLeadStream({
  job,
  leads,
  language,
}: {
  job: LeadJob | null;
  leads: Lead[];
  language: "ar" | "en";
}) {
  const [stopping, setStopping] = useState(false);
  const [stoppedId, setStoppedId] = useState<string | null>(null);
  const stoppedLocally = Boolean(job && stoppedId === job.id);
  const stopRun = async () => {
    const campaignId = job?.b2cCampaign?.id || job?.provider_job_id;
    if (!job || !campaignId || stopping) return;
    setStopping(true);
    try {
      await stopB2CCampaign(campaignId);
      setStoppedId(job.id);
      notify.success(
        language === "ar"
          ? "تم إيقاف البحث. العملاء المحفوظون ما زالوا متاحين."
          : "Search stopped. Your saved leads are kept.",
      );
    } catch (error) {
      notify.danger(apiErrorMessage(error));
    } finally {
      setStopping(false);
    }
  };
  const delivered = Math.max(0, Number(job?.result_count || leads.length));
  const target = Math.max(delivered, Number(job?.target_count || 0));
  const running = !stoppedLocally && searchActivity(job, language).running;
  const stats = job?.b2cCampaign?.stats;
  // Use the same raw fetched-listing counter that the backend ceiling enforces.
  // postsFetched is deduplicated and made the admin limit look inconsistent.
  const companySearch = job?.provider === 'apify';
  const scanned = companySearch ? job.sourceProgress?.rawRecords ?? null : Number(stats?.listingsFetchedTotal ?? stats?.postsFetched ?? 0);
  const qualified = companySearch ? job.sourceProgress?.potentialMatches ?? null : Number(stats?.candidatesQualified || 0);
  const verified = companySearch ? job.sourceProgress?.phoneRecords ?? null : Number(stats?.contactsResolved || 0);
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    if (!running) {
      setVisibleCount(leads.length);
      return;
    }
    if (!leads.length) {
      setVisibleCount(0);
      return;
    }
    if (visibleCount >= leads.length) return;
    const timer = window.setTimeout(
      () => setVisibleCount((current) => Math.min(leads.length, current + 1)),
      360,
    );
    return () => window.clearTimeout(timer);
  }, [leads.length, visibleCount, running]);
  const visibleLeads = leads.slice(0, visibleCount);
  const skeletons = running
    ? Math.min(4, Math.max(1, Math.min(target - visibleLeads.length, 4)))
    : 0;
  const activity = searchActivity(
    stoppedLocally && job
      ? { ...job, status: "cancelled", b2cCampaign: null }
      : job,
    language,
  );
  const steps = [
    {
      label: companySearch ? language === 'ar' ? 'سجلات تم فحصها' : 'Records reviewed' : language === "ar" ? "إعلانات تم فحصها" : "Listings explored",
      value: scanned,
    },
    {
      label:
        companySearch ? language === 'ar' ? 'سجلات بأرقام تواصل' : 'Records with phones' : language === "ar" ? "أرقام تواصل متاحة" : "Available phone numbers",
      value: verified,
    },
    {
      label: language === "ar" ? "مطابقات محتملة" : "Potential matches",
      value: qualified,
    },
    {
      label: language === "ar" ? "عملاء فريدون محفوظون" : "Unique leads saved",
      value: delivered,
    },
  ];
  return (
    <aside className="ops-live-leads" aria-live="polite">
      <header>
        <div>
          <span className="ops-live-leads__orb">
            <ThinkingOrb
              state={activity.state}
              paused={!activity.running}
              size={64}
              theme="dark"
              aria-label={activity.label}
            />
          </span>
          <span>
            <strong>
              {language === "ar" ? "نتائج بحثك" : "Your search results"}
            </strong>
            <small>{activity.label}</small>
          </span>
        </div>
        <span>
          {delivered} / {target}
        </span>
        {running && job?.provider === "b2c" && (
          <UiButton
            type="button"
            variant="outline"
            size="sm"
            onClick={stopRun}
            disabled={stopping}
            aria-label={
              language === "ar" ? "إيقاف توليد العملاء" : "Stop lead generation"
            }
          >
            <span aria-hidden="true">■</span>{" "}
            {stopping
              ? language === "ar"
                ? "جارٍ الإيقاف…"
                : "Stopping…"
              : language === "ar"
                ? "إيقاف"
                : "Stop"}
          </UiButton>
        )}
      </header>
      <div className="ops-live-leads__progress" aria-hidden="true">
        <i
          style={{
            width: `${target ? Math.min(100, (delivered / target) * 100) : 0}%`,
          }}
        />
      </div>
      <ol className="ops-live-leads__trace">
        {steps.map((step, index) => (
          <li key={step.label}>
            <i>{index + 1}</i>
            <span>{step.label}</span>
            <b>{step.value === null ? '—' : step.value.toLocaleString()}</b>
          </li>
        ))}
      </ol>
      <div className="ops-live-leads__list">
        {visibleLeads.map((lead) => (
          <article className="ops-live-lead" key={lead.id}>
            <span className="ops-live-lead__avatar">
              {(lead.name || lead.company || "L").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{lead.name || lead.company}</strong>
              <small>
                {lead.location ||
                  (language === "ar" ? "السعودية" : "Saudi Arabia")}
              </small>
            </div>
            <span className="ops-live-lead__contact">
              {lead.phone || (language === "ar" ? "تم التحقق" : "Verified")}
            </span>
          </article>
        ))}
        {Array.from({ length: skeletons }, (_, index) => (
          <div
            className="ops-live-lead is-skeleton"
            key={`lead-skeleton-${index}`}
            aria-hidden="true"
          >
            <span className="ops-live-lead__avatar" />
            <div>
              <i />
              <i />
            </div>
            <i />
          </div>
        ))}
      </div>
      {running ? (
        <p>
          {language === "ar"
            ? "نراجع الدليل ومعلومات التواصل قبل إضافة كل عميل."
            : "Evidence and contact details are checked before each lead appears."}
        </p>
      ) : null}
    </aside>
  );
}

function CompanyListingsPage({
  listings,
  language,
  onAdd,
}: {
  listings: CompanyListing[];
  language: "ar" | "en";
  onAdd: (listing: CompanyListing) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    industry: "",
    location: "",
    website: "",
    askingPrice: "",
    summary: "",
    visibility: "for-sale" as CompanyListing["visibility"],
  });

  function submitListing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.industry.trim() || !form.location.trim())
      return;
    onAdd({
      ...form,
      id: `listing-${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
    setForm({
      name: "",
      industry: "",
      location: "",
      website: "",
      askingPrice: "",
      summary: "",
      visibility: "for-sale",
    });
    notify.success(
      language === "ar"
        ? "تمت إضافة الشركة إلى دليل وصلة مجاناً"
        : "Company added to Wasla listings for free",
    );
  }

  return (
    <div className="company-listings-page">
      <header>
        <span>
          <Store size={15} />{" "}
          {language === "ar"
            ? "الدليل مجاني الآن"
            : "Free while in early access"}
        </span>
        <h1>
          {language === "ar"
            ? "اعرض شركتك داخل محادثات وصلة"
            : "Put your company inside Wasla conversations"}
        </h1>
        <p>
          {language === "ar"
            ? "أضف شركة للبيع أو للظهور كخيار مناسب عندما يبحث مستخدم عن مورد أو فرصة شراء."
            : "List a company for sale or feature it when another user searches for a relevant supplier or buying opportunity."}
        </p>
      </header>
      <section className="company-listings-page__layout">
        <form onSubmit={submitListing}>
          <div className="company-listings-page__mode">
            <button
              type="button"
              className={form.visibility === "for-sale" ? "is-active" : ""}
              onClick={() =>
                setForm((current) => ({ ...current, visibility: "for-sale" }))
              }
            >
              {language === "ar" ? "للبيع" : "For sale"}
            </button>
            <button
              type="button"
              className={form.visibility === "featured" ? "is-active" : ""}
              onClick={() =>
                setForm((current) => ({ ...current, visibility: "featured" }))
              }
            >
              {language === "ar" ? "ظهور في المحادثة" : "Featured referral"}
            </button>
          </div>
          <label>
            <span>{language === "ar" ? "اسم الشركة" : "Company name"}</span>
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <div className="company-listings-page__fields">
            <label>
              <span>{language === "ar" ? "القطاع" : "Industry"}</span>
              <input
                required
                value={form.industry}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    industry: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>
                {language === "ar" ? "المدينة أو السوق" : "City or market"}
              </span>
              <input
                required
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    location: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="company-listings-page__fields">
            <label>
              <span>{language === "ar" ? "الموقع الإلكتروني" : "Website"}</span>
              <input
                value={form.website}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    website: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>
                {language === "ar" ? "السعر المطلوب" : "Asking price"}
              </span>
              <input
                value={form.askingPrice}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    askingPrice: event.target.value,
                  }))
                }
                placeholder={language === "ar" ? "اختياري" : "Optional"}
              />
            </label>
          </div>
          <label>
            <span>
              {language === "ar"
                ? "لماذا قد يهتم المشتري؟"
                : "Why should a buyer care?"}
            </span>
            <textarea
              rows={4}
              value={form.summary}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
            />
          </label>
          <button className="company-listings-page__submit" type="submit">
            <Plus size={16} />
            {language === "ar" ? "إضافة الشركة مجاناً" : "Add company for free"}
          </button>
        </form>
        <div className="company-listings-page__inventory">
          <div>
            <strong>{language === "ar" ? "شركاتك" : "Your companies"}</strong>
            <span>{listings.length}</span>
          </div>
          {listings.map((listing) => (
            <article key={listing.id}>
              <span>{listing.name.slice(0, 1)}</span>
              <div>
                <strong>{listing.name}</strong>
                <small>
                  {listing.industry} · {listing.location}
                </small>
                <p>
                  {listing.summary ||
                    (language === "ar"
                      ? "جاهزة للظهور عند تطابق طلب مستخدم."
                      : "Ready to appear when a user's request matches.")}
                </p>
              </div>
              <em>
                {listing.visibility === "for-sale"
                  ? language === "ar"
                    ? "للبيع"
                    : "For sale"
                  : language === "ar"
                    ? "موصى بها"
                    : "Featured"}
              </em>
            </article>
          ))}
          {!listings.length ? (
            <div className="company-listings-page__empty">
              <Store size={24} />
              <span>
                {language === "ar"
                  ? "أول شركة تضيفها ستظهر هنا."
                  : "Your first company will appear here."}
              </span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function HeroUIBars({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
}) {
  return (
    <Card className="hconsole-card">
      <Card.Header>
        <Card.Title>{title}</Card.Title>
      </Card.Header>
      <Card.Content className="hconsole-progress-stack">
        {items.map((item) => (
          <div className="hconsole-bar-line" key={item.label}>
            <span>{item.label}</span>
            <ProgressBar
              value={Math.min(item.value, 100)}
              maxValue={100}
              aria-label={item.label}
            >
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}

function ResearchActivity({
  language,
  mode,
  phase,
}: {
  language: "ar" | "en";
  mode: ChatActivityMode;
  phase: number;
}) {
  const [startedAt] = useState(Date.now);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const activity: { state: OrbState; label: string } =
    mode === "sourcing"
      ? {
          state: "working",
          label: language === "ar" ? "جارٍ العمل…" : "Working…",
        }
      : {
            state: "working",
            label: language === "ar" ? "جارٍ التفكير…" : "Thinking…",
          };
  return (
    <div className="ops-chat-message is-assistant is-research" data-phase={phase}>
      <div className="chat-tool-status">
        <BrainCircuit size={18} aria-hidden="true" />
        <strong>{activity.label}</strong>
        <span className="chat-response-time" aria-live="off" dir="ltr">{elapsed.toFixed(1)}s</span>
      </div>
      {mode === 'sourcing' && <div
        className="research-activity__steps"
        role="status"
        aria-live="polite"
      >
        <p>
          {mode === "sourcing"
            ? language === "ar"
              ? "أجهّز البحث وفق طلبك. ستظهر النتائج هنا بعد مراجعة ملاءمتها وبيانات التواصل."
              : "Preparing your search from your brief. Matches will appear here after relevance and contact checks."
            : language === "ar"
              ? "أراجع عرضك والجمهور والموقع لأحدد الخطوة التالية. عندما يصبح الطلب جاهزاً، ستختار عدد العملاء هنا."
              : "Reviewing your offer, audience, and location to determine the next step. Once your brief is ready, you’ll choose your lead count here."}
        </p>
        <small>
          {mode === "sourcing"
            ? language === "ar"
              ? "التالي: البحث عن المرشحين ← مراجعة الملاءمة ← التحقق من التواصل"
              : "Next: find candidates → review relevance → verify contact details"
            : language === "ar"
              ? "التالي: توضيح التفاصيل أو تجهيز خيارات العدد"
              : "Next: clarify any missing details or prepare your quantity choices"}
        </small>
      </div>}
    </div>
  );
}

const SOCIAL_NETWORKS = [
  { id: "instagram", name: "Instagram", color: "#ff4f9a" },
  { id: "facebook", name: "Facebook", color: "#5796ff" },
  { id: "x", name: "X", color: "#f5f5f5" },
  { id: "tiktok", name: "TikTok", color: "#4de8e8" },
  { id: "snapchat", name: "Snapchat", color: "#fff45c" },
  { id: "youtube", name: "YouTube", color: "#ff5b5b" },
  { id: "linkedin", name: "LinkedIn", color: "#69a9ff" },
  { id: "reddit", name: "Reddit", color: "#ff784b" },
  { id: "telegram", name: "Telegram", color: "#59b9f4" },
  { id: "whatsapp", name: "WhatsApp", color: "#a1a1aa" },
  { id: "pinterest", name: "Pinterest", color: "#f45d6f" },
  { id: "twitch", name: "Twitch", color: "#aa82ff" },
  { id: "discord", name: "Discord", color: "#8795ff" },
  { id: "threads", name: "Threads", color: "#f5f5f5" },
] as const;

type SocialNetworkId = (typeof SOCIAL_NETWORKS)[number]["id"];

function SocialNetworkMark({ id }: { id: SocialNetworkId }) {
  const common = { size: 19, strokeWidth: 2.15 };
  switch (id) {
    case "instagram":
      return <Instagram {...common} />;
    case "facebook":
      return <Facebook {...common} />;
    case "x":
      return <strong className="social-network-scan__x">𝕏</strong>;
    case "tiktok":
      return <Music2 {...common} />;
    case "snapchat":
      return <Ghost {...common} />;
    case "youtube":
      return <Youtube {...common} />;
    case "linkedin":
      return <Linkedin {...common} />;
    case "reddit":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.1 11.1c1.3-.8 3-1.3 4.9-1.3s3.6.5 4.9 1.3a2.2 2.2 0 1 1 1.5 3.8c-.3 3-3 5.2-6.4 5.2S5.9 18 5.6 15a2.2 2.2 0 1 1 1.5-3.9Z" />
          <circle cx="9.2" cy="14.4" r="1" />
          <circle cx="14.8" cy="14.4" r="1" />
          <path d="M9.1 17c1.7 1.1 4.1 1.1 5.8 0M12.8 9.9l1-4 3.1.7" />
          <circle cx="17.5" cy="6.8" r="1.4" />
        </svg>
      );
    case "telegram":
      return <Send {...common} />;
    case "whatsapp":
      return <MessageCircle {...common} />;
    case "pinterest":
      return <Pin {...common} />;
    case "twitch":
      return <Twitch {...common} />;
    case "discord":
      return <Gamepad2 {...common} />;
    case "threads":
      return <AtSign {...common} />;
  }
}

function SocialNetworkScan({ language }: { language: "ar" | "en" }) {
  const [networkIndex, setNetworkIndex] = useState(
    () => Math.floor(Math.random() * SOCIAL_NETWORKS.length),
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNetworkIndex((current) => {
        if (SOCIAL_NETWORKS.length < 2) return current;
        const offset = 1 + Math.floor(Math.random() * (SOCIAL_NETWORKS.length - 1));
        return (current + offset) % SOCIAL_NETWORKS.length;
      });
    }, 850);
    return () => window.clearInterval(timer);
  }, []);

  const network = SOCIAL_NETWORKS[networkIndex];
  return (
    <div className="social-network-lookup" aria-live="polite">
      <span
        className="social-network-scan"
        style={{ color: network.color }}
        title={network.name}
        role="img"
        aria-label={
          language === "ar"
            ? `تحليل أنماط الجمهور على ${network.name}`
            : `Analyzing ${network.name} audience patterns`
        }
      >
        <span className="social-network-scan__ring" aria-hidden="true" />
        <span
          className="social-network-scan__mark"
          key={network.id}
          aria-hidden="true"
        >
          <SocialNetworkMark id={network.id} />
        </span>
      </span>
      <span className="social-network-lookup__copy" key={`copy-${network.id}`}>
        <strong>
          {language === "ar"
            ? `نرسم خريطة الطلب حول ${network.name}`
            : `Mapping demand around ${network.name}`}
        </strong>
        <small>
          {language === "ar"
            ? "نقارن وصفك بأنماط الجمهور وإشارات السوق العامة لنقدّم لك فرصاً أوضح وأسهل في التواصل."
            : "Comparing your brief with audience patterns and public-market signals to surface clearer, reachable opportunities."}
        </small>
      </span>
    </div>
  );
}

function InsightDashboard({
  leads,
  research,
  language,
}: {
  leads: Lead[];
  research: CompanyResearch[];
  language: "ar" | "en";
}) {
  const totalPipeline = leads.reduce(
    (sum, lead) => sum + lead.revenueEstimate,
    0,
  );
  const avgFit = leads.length
    ? Math.round(
        leads.reduce((sum, lead) => sum + lead.fitScore, 0) / leads.length,
      )
    : 0;
  const qualified = leads.filter((lead) => lead.fitScore >= 80);
  const coverage = leads.length
    ? Math.round((research.length / leads.length) * 100)
    : 0;
  const topSegment = topGroup(leads, (lead) => lead.industry);
  const topCity = topGroup(
    leads,
    (lead) => lead.location.split(",")[0] || "Unknown",
  );
  const topLeads = [...leads]
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 4);
  const opportunities = research
    .flatMap((item) => item.opportunities)
    .slice(0, 5);
  const weaknesses = research.flatMap((item) => item.weaknesses).slice(0, 4);
  const segmentItems = groupItems(leads, (lead) => lead.industry)
    .slice(0, 5)
    .map((item) => ({
      label: item.label,
      value: Math.round((item.count / Math.max(leads.length, 1)) * 100),
    }));
  const cityItems = groupItems(
    leads,
    (lead) => lead.location.split(",")[0] || "Unknown",
  )
    .slice(0, 5)
    .map((item) => ({
      label: item.label,
      value: Math.round((item.count / Math.max(leads.length, 1)) * 100),
    }));
  const recommendations =
    language === "ar"
      ? [
          `ابدأ بـ ${topSegment.label}: يمثل ${topSegment.count} من السجلات ومتوسط الملاءمة أعلى من خط التشغيل.`,
          `ركّز أول 48 ساعة على ${topCity.label}: أعلى كثافة جغرافية وأسهل لتجربة الاتصال.`,
          `${qualified.length} عميل فوق 80% يستحق بحثاً عميقاً قبل أي حملة واسعة.`,
        ]
      : [
          `Start with ${topSegment.label}: it owns ${topSegment.count} records and sits above the operating fit line.`,
          `Focus the first 48 hours on ${topCity.label}: highest geographic density and easiest calling batch.`,
          `${qualified.length} leads above 80% deserve deep research before any broad campaign.`,
        ];

  return (
    <div className="insights-command">
      <header className="insights-command__hero">
        <span>
          <BarChart3 size={15} />{" "}
          {language === "ar"
            ? "تحليل مبني على بيانات العملاء"
            : "Analysis from your lead data"}
        </span>
        <h1>
          {language === "ar"
            ? "أين نربح؟ ومن نتصل به أولاً؟"
            : "Where do we win, and who gets called first?"}
        </h1>
        <p>
          {language === "ar"
            ? "القراءة هنا مبنية على القطاع، المدينة، الملاءمة، القيمة المتوقعة، وتغطية البحث العميق."
            : "This read combines segment, city, fit, expected value, and deep-research coverage."}
        </p>
      </header>

      <section className="insights-command__metrics">
        <div>
          <span>{language === "ar" ? "قيمة الفرص" : "Pipeline value"}</span>
          <strong>{money(totalPipeline)}</strong>
          <small>
            {leads.length} {language === "ar" ? "عميل" : "leads"}
          </small>
        </div>
        <div>
          <span>{language === "ar" ? "متوسط الملاءمة" : "Average fit"}</span>
          <strong>{avgFit}%</strong>
          <small>
            {qualified.length} {language === "ar" ? "جاهزون" : "ready"}
          </small>
        </div>
        <div>
          <span>{language === "ar" ? "أقوى قطاع" : "Strongest segment"}</span>
          <strong>{topSegment.label}</strong>
          <small>
            {topSegment.count} {language === "ar" ? "سجلات" : "records"}
          </small>
        </div>
        <div>
          <span>
            {language === "ar"
              ? "تغطية البحث العميق"
              : "Deep research coverage"}
          </span>
          <strong>{coverage}%</strong>
          <small>
            {research.length}/{leads.length}
          </small>
        </div>
      </section>

      <section className="insights-command__grid">
        <HeroUIBars
          title={language === "ar" ? "توزيع القطاعات" : "Segment concentration"}
          items={segmentItems}
        />
        <HeroUIBars
          title={language === "ar" ? "زخم المدن" : "City momentum"}
          items={cityItems}
        />
        <Card className="hconsole-card insights-command__moves">
          <Card.Header>
            <Card.Title>
              {language === "ar"
                ? "قرارات التشغيل التالية"
                : "Next operating moves"}
            </Card.Title>
            <Card.Description>
              {language === "ar" ? "ما يجب فعله الآن" : "What to do now"}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            {recommendations.map((item, index) => (
              <p key={item}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                {item}
              </p>
            ))}
          </Card.Content>
        </Card>
      </section>

      <section className="insights-command__grid is-wide">
        <Card className="hconsole-card insights-command__accounts">
          <Card.Header>
            <Card.Title>
              {language === "ar"
                ? "أفضل الحسابات للبدء"
                : "Best accounts to start"}
            </Card.Title>
            <Card.Description>
              {language === "ar" ? "مرتب حسب الملاءمة" : "Sorted by fit"}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            {topLeads.map((lead) => (
              <div key={lead.id}>
                <span>
                  <b>{lead.company}</b>
                  <small>
                    {lead.name} · {lead.title}
                  </small>
                </span>
                <strong>{lead.fitScore}%</strong>
                <i style={{ width: `${lead.fitScore}%` }} />
              </div>
            ))}
          </Card.Content>
        </Card>
        <Card className="hconsole-card insights-command__signals">
          <Card.Header>
            <Card.Title>
              {language === "ar"
                ? "إشارات البحث العميق"
                : "Deep research signals"}
            </Card.Title>
            <Card.Description>
              {language === "ar"
                ? "فرص ومخاطر من البيانات المرسلة"
                : "Opportunities and risks from submitted data"}
            </Card.Description>
          </Card.Header>
          <Card.Content className="hconsole-chip-list">
            {[...opportunities, ...weaknesses].map((item) => (
              <Chip key={item}>
                <Chip.Label>{item}</Chip.Label>
              </Chip>
            ))}
          </Card.Content>
        </Card>
      </section>
    </div>
  );
}

function LiquidMetalSubmitButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const shaderRef = useLiquidMetalShader();

  return (
    <button
      className="liquid-metal-submit"
      type="button"
      onClick={() => onClick()}
      disabled={disabled}
      aria-label={label}
    >
      <span
        className="liquid-metal-submit__shader"
        ref={shaderRef}
        aria-hidden="true"
      />
      <span className="liquid-metal-submit__outline" aria-hidden="true" />
      <span className="liquid-metal-submit__icon" aria-hidden="true">
        {children}
      </span>
    </button>
  );
}

function LiquidMetalChoiceButton({
  choice,
  onChoose,
  language,
}: {
  choice: { id: string; sticker?: string; title: string; body: string; disabled?: boolean };
  onChoose: (id: string) => void;
  language: "ar" | "en";
}) {
  return (
    <button
      type="button"
      className={`lead-setup-choice${choice.disabled ? " is-locked" : ""}`}
      disabled={choice.disabled}
      onClick={() => onChoose(choice.id)}
    >
      <LiquidMetalEdge className="lead-setup-choice__metal" />
      <span className="lead-setup-choice__core" aria-hidden="true" />
      <span className="lead-setup-choice__copy">
        <UiBadge
          variant="outline"
          className={`lead-setup-choice__sticker is-${choice.id}`}
        >
          {choice.sticker ?? choice.id.toUpperCase()}
        </UiBadge>
        <strong>{choice.title}</strong>
        <small>{choice.body}</small>
      </span>
      {choice.disabled ? <Lock className="lead-setup-choice__arrow" /> : language === "ar" ? (
        <ArrowLeft className="lead-setup-choice__arrow" />
      ) : (
        <ArrowRight className="lead-setup-choice__arrow" />
      )}
    </button>
  );
}

function ModelLaunchDialog({
  language,
  onClose,
  onChoose,
}: {
  language: "ar" | "en";
  onClose: () => void;
  onChoose: (model: "b2c" | "b2b") => void;
}) {
  const ar = language === "ar";
  return createPortal(
    <div className="model-launch-overlay" role="presentation">
      <section
        className="model-launch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-launch-title"
        dir={ar ? "rtl" : "ltr"}
      >
        <LiquidMetalEdge className="model-launch-dialog__edge" />
        <div className="model-launch-dialog__hero">
          <button
            type="button"
            onClick={onClose}
            aria-label={ar ? "إغلاق" : "Close"}
          >
            <X />
          </button>
        </div>
        <div className="model-launch-dialog__body">
          <span>{ar ? "نموذج جديد" : "New model"}</span>
          <h2 id="model-launch-title">
            {ar ? "نقدم لك Wasla Astraeus" : "Introducing Wasla Astraeus"}
          </h2>
          <p>
            {ar
              ? "اكتشف الشركات وصناع القرار وإشارات السوق بعمق أكبر مع أقوى نموذج أعمال من وصلة."
              : "Get deeper company insights, decision-makers, and market intelligence with our most advanced business model yet."}
          </p>
          <div>
            <button
              type="button"
              className="model-launch-dialog__secondary"
              onClick={() => onChoose("b2c")}
            >
              {ar ? "المتابعة باستخدام Wasla Lite" : "Continue with Wasla Lite"}
            </button>
            <button
              type="button"
              className="model-launch-dialog__primary"
              onClick={() => onChoose("b2b")}
            >
              <LiquidMetalEdge className="model-launch-dialog__button-edge" />
              <span>
                {ar ? "جرّب Wasla Astraeus الآن" : "Try Wasla Astraeus now"}
                {ar ? <ArrowLeft /> : <ArrowRight />}
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.getElementById("wasla-modal-root") ?? document.body,
  );
}

function LeadSetupModal({
  language,
  title,
  description,
  choices,
  onChoose,
  onClose,
}: {
  language: "ar" | "en";
  title: string;
  description: string;
  choices: Array<{
    id: string;
    icon: React.ComponentType<{ size?: number }>;
    sticker?: string;
    title: string;
    body: string;
    disabled?: boolean;
  }>;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="lead-setup-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="lead-setup-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-setup-title"
        dir={language === "ar" ? "rtl" : "ltr"}
      >
        <UiButton
          type="button"
          variant="ghost"
          size="icon"
          className="lead-setup-window__close"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </UiButton>
        <span className="lead-setup-window__eyebrow">
          <span /> Wasla AI
        </span>
        <h2 id="lead-setup-title">{title}</h2>
        <p>{description}</p>
        <div className={`lead-setup-cards is-${choices.length}`}>
          {choices.map((choice) => (
            <LiquidMetalChoiceButton
              key={choice.id}
              choice={choice}
              onChoose={onChoose}
              language={language}
            />
          ))}
        </div>
      </section>
    </div>,
    document.getElementById("wasla-modal-root") ?? document.body,
  );
}

function LiquidMetalNavTrigger({
  open,
  onClick,
  label,
  controls,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  controls: string;
}) {
  const shaderRef = useLiquidMetalShader();

  return (
    <button
      className="wasla-nav-capsule__trigger"
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
    >
      <span
        className="wasla-nav-capsule__metal"
        ref={shaderRef}
        aria-hidden="true"
      />
      <span className="wasla-nav-capsule__trigger-core" aria-hidden="true" />
      <WaslaBrand variant="symbol" inverse />
    </button>
  );
}

function SidebarMetalToggle({
  collapsed,
  onClick,
  language,
}: {
  collapsed: boolean;
  onClick: () => void;
  language: "ar" | "en";
}) {
  const shaderRef = useLiquidMetalShader();

  return (
    <button
      className={`hconsole-sidebar-toggle ${collapsed ? "is-closed" : "is-open"}`}
      type="button"
      onClick={onClick}
      aria-label={
        collapsed
          ? language === "ar"
            ? "فتح الشريط الجانبي"
            : "Open sidebar"
          : language === "ar"
            ? "إغلاق الشريط الجانبي"
            : "Close sidebar"
      }
      aria-expanded={!collapsed}
    >
      <span
        className="hconsole-sidebar-toggle__metal"
        ref={shaderRef}
        aria-hidden="true"
      />
      <span className="hconsole-sidebar-toggle__core" aria-hidden="true" />
      <span className="hconsole-sidebar-toggle__icon" aria-hidden="true">
        <PanelLeftClose size={16} />
      </span>
      <span className="hconsole-sidebar-toggle__logo" aria-hidden="true">
        <WaslaBrand variant="symbol" inverse />
      </span>
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
      if (
        capsuleRef.current &&
        !capsuleRef.current.contains(event.target as Node)
      )
        setOpen(false);
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
    [
      "agent",
      language === "ar" ? "ابدأ محادثة جديدة" : "Start a new chat",
      Sparkles,
    ],
    ["overview", t("console.overview"), LayoutDashboard],
    ["leads", t("console.leads"), Building2],
    [
      "researched",
      language === "ar" ? "العملاء المبحوثون" : "Researched Leads",
      Sparkles,
    ],
    ["socials", t("console.socials"), Share2],
    [
      "listings",
      language === "ar" ? "دليل الشركات" : "Company listings",
      Store,
    ],
    ["insights", t("console.insights"), BarChart3],
    ["proposals", t("console.proposals"), FileText],
    ["payments", t("console.payments"), CreditCard],
  ] as const;
  const sheetId = `wasla-nav-sheet-${mode}`;

  return (
    <nav
      ref={capsuleRef}
      className={`wasla-nav-capsule is-${placement} is-${mode}${open ? " is-open" : ""}`}
      dir={direction}
      aria-label={language === "ar" ? "قائمة وصلة" : "Wasla navigation"}
    >
      <div className="wasla-nav-capsule__bar">
        <LiquidMetalNavTrigger
          open={open}
          onClick={() => setOpen((current) => !current)}
          controls={sheetId}
          label={language === "ar" ? "فتح قائمة وصلة" : "Open Wasla menu"}
        />
        <div className="wasla-nav-capsule__essentials">
          {mode === "console" ? (
            <>
              <button type="button" onClick={() => onNavigate?.("agent")}>
                <Sparkles size={14} />
                <span>{language === "ar" ? "محادثة جديدة" : "New chat"}</span>
              </button>
              <button type="button" onClick={() => onNavigate?.("leads")}>
                <Building2 size={14} />
                <span>{t("console.leads")}</span>
              </button>
            </>
          ) : user ? (
            <>
              <a className="nav-priority-3" href="#pricing">
                <WalletCards size={14} />
                <span>{language === "ar" ? "الباقات" : "Pricing"}</span>
              </a>
              <Link className="nav-priority-1" to="/console">
                <LayoutDashboard size={14} />
                <span>
                  {language === "ar" ? "فتح المساحة" : "Open console"}
                </span>
              </Link>
            </>
          ) : (
            <>
              <a className="nav-priority-3" href="#pricing">
                <WalletCards size={14} />
                <span>{language === "ar" ? "الباقات" : "Pricing"}</span>
              </a>
              <button
                className="nav-priority-3"
                type="button"
                onClick={() => onAuthOpen("login")}
              >
                <LogIn size={14} />
                <span>{language === "ar" ? "تسجيل الدخول" : "Log in"}</span>
              </button>
              <button
                className="is-primary nav-priority-1"
                type="button"
                onClick={() => onAuthOpen("signup")}
              >
                <UserPlus size={14} />
                <span>
                  {language === "ar" ? "إنشاء حساب" : "Create account"}
                </span>
              </button>
              <Link className="nav-priority-2" to="/console">
                <LayoutDashboard size={14} />
                <span>
                  {language === "ar" ? "فتح المساحة" : "Open console"}
                </span>
              </Link>
            </>
          )}
        </div>
        <LanguageToggle inverse />
        <Link
          className="wasla-nav-capsule__brand"
          to="/"
          aria-label={language === "ar" ? "العودة إلى وصلة" : "Back to Wasla"}
        >
          <WaslaBrand variant="horizontal" inverse />
        </Link>
      </div>

      <div
        id={sheetId}
        className="wasla-nav-capsule__sheet"
        aria-hidden={!open}
      >
        <header>
          <span>{language === "ar" ? "تنقل في وصلة" : "Explore Wasla"}</span>
          <strong>
            {user?.business ??
              (language === "ar"
                ? "كل شيء من مكان واحد"
                : "Everything in one place")}
          </strong>
        </header>
        <div className="wasla-nav-capsule__links">
          {mode === "console" ? (
            consoleLinks.map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                disabled={consoleSectionLocked(key, user?.isAdmin)}
                className={consoleSectionLocked(key, user?.isAdmin) ? "is-locked" : undefined}
                aria-label={consoleSectionLocked(key, user?.isAdmin) ? `${label} — ${language === "ar" ? "قريباً" : "Coming soon"}` : label}
                onClick={() => {
                  onNavigate?.(key);
                  setOpen(false);
                }}
              >
                <Icon size={17} />
                <span>{label}{consoleSectionLocked(key, user?.isAdmin) && <small>{language === "ar" ? "قريباً" : "Coming soon"}</small>}</span>
                {consoleSectionLocked(key, user?.isAdmin) ? <Lock size={15} /> : language === "ar" ? (
                  <ArrowLeft size={15} />
                ) : (
                  <ArrowRight size={15} />
                )}
              </button>
            ))
          ) : (
            <>
              <a href="#agent" onClick={() => setOpen(false)}>
                <Sparkles size={17} />
                <span>{t("nav.agent")}</span>
                {language === "ar" ? (
                  <ArrowLeft size={15} />
                ) : (
                  <ArrowRight size={15} />
                )}
              </a>
              <a href="#workflow" onClick={() => setOpen(false)}>
                <Activity size={17} />
                <span>{t("nav.workflow")}</span>
                {language === "ar" ? (
                  <ArrowLeft size={15} />
                ) : (
                  <ArrowRight size={15} />
                )}
              </a>
              <a href="#pricing" onClick={() => setOpen(false)}>
                <WalletCards size={17} />
                <span>{language === "ar" ? "الباقات" : "Pricing"}</span>
                {language === "ar" ? (
                  <ArrowLeft size={15} />
                ) : (
                  <ArrowRight size={15} />
                )}
              </a>
              <Link to="/console" onClick={() => setOpen(false)}>
                <LayoutDashboard size={17} />
                <span>{t("nav.workspace")}</span>
                {language === "ar" ? (
                  <ArrowLeft size={15} />
                ) : (
                  <ArrowRight size={15} />
                )}
              </Link>
            </>
          )}
        </div>
        <footer>
          {user ? (
            <Link to="/console" onClick={() => setOpen(false)}>
              {language === "ar" ? "فتح مساحتي" : "Open my workspace"}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAuthOpen();
              }}
            >
              {t("nav.start")}
            </button>
          )}
          <span>
            {language === "ar" ? "وصلة تعمل الآن" : "Wasla is online"}
            <i />
          </span>
        </footer>
        <div className="wasla-nav-capsule__mobile-actions">
          <span>
            {language === "ar" ? "لغة الواجهة" : "Interface language"}
          </span>
          <LanguageToggle inverse />
          {!user ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAuthOpen("login");
              }}
            >
              {language === "ar" ? "تسجيل الدخول" : "Log in"}
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

function LandingChat({
  user,
  onLeadAsk,
  onAuthOpen,
}: {
  user: AuthUser | null;
  onLeadAsk: (ask: string) => void;
  onAuthOpen: (mode?: "signup" | "login", plan?: "launch" | "scale" | "autopilot" | null) => void;
}) {
  const { direction, language, t } = useLanguage();
  const [input, setInput] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const navigate = useNavigate();

  const examples =
    language === "ar"
      ? [
          {
            request: "أبغى ملاك عيادات أسنان في الرياض عندهم أكثر من فرعين",
            response:
              "سأبحث عن المالك أو مدير التشغيل، وأتحقق من عدد الفروع قبل الاتصال.",
          },
          {
            request: "شركات لوجستية في جدة ما زالت ترسل عروض الأسعار يدوياً",
            response:
              "سأعطي الأولوية لمديري المبيعات والعمليات مع إشارة واضحة للعمل اليدوي.",
          },
          {
            request: "مطاعم راقية في الخبر تحتاج شراكات وحجوزات شركات",
            response:
              "سأستهدف المدير العام أو مسؤول الشراكات، ثم أؤهل الاحتياج والموسمية هاتفياً.",
          },
        ]
      : [
          {
            request:
              "Dental clinic owners in Riyadh with more than two branches",
            response:
              "I will find the owner or operations director and verify branch count before calling.",
          },
          {
            request:
              "Logistics companies in Jeddah still sending quotes manually",
            response:
              "I will prioritize sales and operations leaders with evidence of a manual quoting process.",
          },
          {
            request: "Premium restaurants in Khobar seeking corporate bookings",
            response:
              "I will target general managers or partnerships leads, then qualify demand and seasonality by phone.",
          },
        ];

  useEffect(() => {
    if (input) return;
    const timer = window.setInterval(
      () => setExampleIndex((current) => (current + 1) % examples.length),
      4200,
    );
    return () => window.clearInterval(timer);
  }, [examples.length, input]);

  function submitAsk(text = input) {
    const ask = text.trim();
    if (!ask) return;
    onLeadAsk(ask);
    if (user) navigate(user.subscriptionStatus === "active" || user.isAdmin ? "/console/agent" : "/console");
    else onAuthOpen();
  }

  const promptChips =
    language === "ar"
      ? [
          "أصحاب عيادات في الرياض يحتاجون متابعة أسرع",
          "مطاعم في جدة تحتاج حجوزات وشراكات",
          "شركات لوجستية في السعودية عندها عروض أسعار يدوية",
        ]
      : [
          "Clinic owners in Riyadh who need faster follow-up",
          "Restaurants in Jeddah seeking corporate partnerships",
          "Saudi logistics companies with manual quoting",
        ];
  const bundles =
    language === "ar"
      ? [
          {
            name: "Launch",
            bonusSar: 200,
            price: "2,999",
            leads: "3K",
            research: "1.5K",
            note: "للفرق التي تريد قوائم غنية وبحثاً عميقاً منتظماً.",
            features: [
              "3,000 عميل مثرى",
              "1,500 بحث عميق",
              "تصدير وتنقية داخل مساحة وصلة",
            ],
          },
          {
            name: "Scale",
            bonusSar: 300,
            price: "3,999",
            leads: "6K",
            research: "3K",
            note: "دفعة أكبر للفرق التي تختبر أكثر من قطاع.",
            features: [
              "6,000 عميل مثرى",
              "3,000 بحث عميق",
              "أولوية في البحث والإثراء",
            ],
          },
          {
            name: "Autopilot",
            bonusSar: 500,
            price: "حسب الطلب",
            leads: "10K",
            research: "6K",
            note: "وكيل يثري أكثر، يتصل، ويحوّل الاهتمام إلى اجتماع Zoom.",
            features: [
              "10,000 عميل مثرى",
              "6,000 بحث عميق",
              "بوت اتصال وتأهيل وحجز اجتماعات",
            ],
          },
        ]
      : [
          {
            name: "Launch",
            bonusSar: 200,
            price: "2,999",
            leads: "3K",
            research: "1.5K",
            note: "For teams that need enriched lists plus steady deep research.",
            features: [
              "3,000 enriched leads",
              "1,500 deep researches",
              "Export and refinement inside Wasla",
            ],
          },
          {
            name: "Scale",
            bonusSar: 300,
            price: "3,999",
            leads: "6K",
            research: "3K",
            note: "A bigger batch for teams testing more than one segment.",
            features: [
              "6,000 enriched leads",
              "3,000 deep researches",
              "Priority sourcing and enrichment",
            ],
          },
          {
            name: "Autopilot",
            bonusSar: 500,
            price: "Custom",
            leads: "10K",
            research: "6K",
            note: "An agent that enriches, calls, qualifies, and books Zoom meetings.",
            features: [
              "10,000 enriched leads",
              "6,000 deep researches",
              "Calling bot with meeting handoff",
            ],
          },
        ];
  const testimonials =
    language === "ar"
      ? [
          [
            "نورة السبيعي",
            "مؤسسة وكالة نمو",
            "حولنا طلباً واحداً إلى قائمة حسابات واضحة. أكثر شيء فرق معنا أن كل عميل جاء بسبب مقنع للتواصل.",
          ],
          [
            "عبدالله الحربي",
            "مدير مبيعات",
            "البحث العميق اختصر ساعات من التجهيز قبل المكالمات، والفريق صار يعرف من يتصل ولماذا.",
          ],
          [
            "ريم العيسى",
            "شريكة في عيادات",
            "بدل ملفات مبعثرة، صارت الفرص مرتبة حسب الملاءمة والخطوة التالية.",
          ],
          [
            "فهد الدوسري",
            "مؤسس SaaS",
            "أفضل جزء أن الوكيل يسأل قبل ما يصرف الرصيد. حسّيت أنه يفهم السوق مو بس يسحب بيانات.",
          ],
          [
            "Maha Kareem",
            "Growth Lead",
            "The table animation is not just pretty. It makes the lead run feel alive and auditable.",
          ],
          [
            "Omar Haddad",
            "Founder",
            "Deep research gave our outreach a reason to exist. Replies improved because the message had context.",
          ],
          [
            "سارة القحطاني",
            "تطوير أعمال",
            "أخيراً لوحة تقول لي وين أبدأ، مو بس عدد عملاء كبير بلا معنى.",
          ],
          [
            "Khalid Mansour",
            "Agency Owner",
            "Wasla made our ICP tests faster. We could compare sectors in one afternoon.",
          ],
          [
            "ليان باوزير",
            "مديرة تسويق",
            "المكالمات المؤهلة وفرت علينا وقت الفريق، والاجتماعات وصلت أنظف بكثير.",
          ],
        ]
      : [
          [
            "Noura Alsubaie",
            "Agency Founder",
            "One request turned into a clear account list. Every lead came with a reason to reach out.",
          ],
          [
            "Abdullah Alharbi",
            "Sales Manager",
            "Deep research cut hours of call prep, and the team finally knew who to call and why.",
          ],
          [
            "Reem Alessa",
            "Clinic Partner",
            "Instead of scattered files, opportunities were ranked by fit and next step.",
          ],
          [
            "Fahad Aldossari",
            "SaaS Founder",
            "The agent asks before spending credit. It feels like it understands the market, not just data scraping.",
          ],
          [
            "Maha Kareem",
            "Growth Lead",
            "The table animation is not just pretty. It makes the lead run feel alive and auditable.",
          ],
          [
            "Omar Haddad",
            "Founder",
            "Deep research gave our outreach a reason to exist. Replies improved because the message had context.",
          ],
          [
            "Sara Alqahtani",
            "Business Development",
            "Finally, an insights page that tells me where to start, not just how many rows I have.",
          ],
          [
            "Khalid Mansour",
            "Agency Owner",
            "Wasla made our ICP tests faster. We could compare sectors in one afternoon.",
          ],
          [
            "Layan Bawazir",
            "Marketing Director",
            "Qualified calls saved the team time, and the meetings came in much cleaner.",
          ],
        ];
  const pricingGroups =
    language === "ar"
      ? [
          {
            title: "توليد العملاء",
            rows: [
              ["عملاء مثرون", "3,000", "6,000", "10,000"],
              ["مصادر أعمال متعددة", true, true, true],
              ["تنقية وتصدير", true, true, true],
              ["أولوية تشغيل", false, true, true],
            ],
          },
          {
            title: "البحث العميق",
            rows: [
              ["أبحاث عميقة", "1,500", "3,000", "6,000"],
              ["بحث ذكي متعدد المصادر", true, true, true],
              ["ملخص فرص ومخاطر", true, true, true],
              ["تحديث بحث حسب الحساب", false, true, true],
            ],
          },
          {
            title: "التأهيل والاتصال",
            rows: [
              ["بوت إثراء إضافي", false, false, true],
              ["مكالمات تأهيل", false, false, true],
              ["حجز Zoom معك", false, false, true],
              ["مساحة وصلة", true, true, true],
            ],
          },
        ]
      : [
          {
            title: "Lead generation",
            rows: [
              ["Enriched leads", "3,000", "6,000", "10,000"],
              ["Multi-source business discovery", true, true, true],
              ["Refinement and export", true, true, true],
              ["Priority runs", false, true, true],
            ],
          },
          {
            title: "Deep research",
            rows: [
              ["Deep researches", "1,500", "3,000", "6,000"],
              ["Multi-source intelligence", true, true, true],
              ["Opportunity and risk briefs", true, true, true],
              ["Account research refresh", false, true, true],
            ],
          },
          {
            title: "Qualification",
            rows: [
              ["Extra enrichment bot", false, false, true],
              ["Qualification calls", false, false, true],
              ["Zoom meeting booking", false, false, true],
              ["Wasla workspace", true, true, true],
            ],
          },
        ];

  return (
    <main
      className={`wasla-home ${language === "ar" ? "arabic-ui" : "is-english"}`}
      dir={direction}
    >
      <WaslaNavCapsule
        mode="landing"
        placement="top"
        user={user}
        onAuthOpen={onAuthOpen}
      />

      <section className="wasla-command" id="agent">
        <video
          className="wasla-command__bg-video"
          autoPlay
          aria-hidden="true"
          muted
          loop
          playsInline
          poster=""
          preload="metadata"
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>

        <div className="wasla-command__status">
          <span /> {t("landing.live")}
        </div>
        <WaslaBrand variant="symbol" className="wasla-command__symbol" />
        <h1>{t("landing.title")}</h1>
        <p>{t("landing.description")}</p>

        <div className="wasla-command__experience">
          <div className="wasla-command__experience-top">
            <span>
              <i /> {t("landing.listening")}
            </span>

            <small>{t("landing.noForm")}</small>
          </div>

          {!input && (
            <div
              className="wasla-command__example"
              key={`${language}-${exampleIndex}`}
            >
              <span>{t("landing.example")}</span>

              <strong>{examples[exampleIndex].request}</strong>

              <div>
                <WaslaBrand variant="symbol" />

                <p>{examples[exampleIndex].response}</p>
              </div>
            </div>
          )}

          <BorderBeam
            className="wasla-command__beam"
            size="md"
            colorVariant="colorful"
            strength={0.7}
            theme="dark"
            borderRadius={999}
          >
            <div className="wasla-command__input">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submitAsk()}
                placeholder={t("landing.placeholder")}
                aria-label={
                  language === "ar"
                    ? "اكتب نوع العملاء المطلوب"
                    : "Describe the leads you need"
                }
              />

              <span className="wasla-command__sparkles" aria-hidden="true">
                <Sparkles size={24} />
              </span>

              <LiquidMetalSubmitButton
                onClick={() =>
                  submitAsk(input || examples[exampleIndex].request)
                }
                label={language === "ar" ? "ابدأ البحث" : "Start search"}
              >
                {language === "ar" ? (
                  <ArrowUpLeft size={39} />
                ) : (
                  <ArrowUpRight size={39} />
                )}
              </LiquidMetalSubmitButton>
            </div>
          </BorderBeam>
        </div>

        <div
          className="wasla-command__prompts"
          aria-label={language === "ar" ? "طلبات مقترحة" : "Suggested requests"}
        >
          {promptChips.map((prompt) => (
            <button key={prompt} onClick={() => submitAsk(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <div className="wasla-command__trust">
          <span>
            <ShieldCheck size={15} />
            {t("landing.protected")}
          </span>

          <span>
            <Gift size={15} />
            {t("landing.credit")}
          </span>

          <span>
            <BadgeCheck size={15} />
            {t("landing.qualified")}
          </span>
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
          <p>
            {language === "ar"
              ? "خدمة خاصة تُفعّل مع فريق المبيعات. تحصل على رصيد الباقة فقط بعد استلام الدفعة كاملة."
              : "Private access, arranged with our sales team. Plan credit is added only after full payment is received."}
          </p>
        </div>
        <div className="wasla-pricing__shelf">
          {bundles.map((bundle, index) => (
            <article
              className={index === 1 ? "is-featured" : ""}
              key={bundle.name}
            >
              <span
                className={`wasla-pricing__icon is-${index + 1}`}
                aria-hidden="true"
              >
                <i />
              </span>
              <header>
                <span>{bundle.name}</span>
                <strong>
                  {bundle.price === "Custom" || bundle.price === "حسب الطلب"
                    ? bundle.price
                    : `${bundle.price} SAR`}
                </strong>
                <p>{bundle.note}</p>
                <p className="wasla-pricing__paid-credit">{language === "ar" ? `رصيد ${bundle.bonusSar} ر.س بعد الدفع الكامل` : `${bundle.bonusSar} SAR credit after full payment`}</p>
              </header>
              <button
                onClick={
                  user ? () => navigate("/console") : () => onAuthOpen("signup", bundle.name.toLowerCase() as "launch" | "scale" | "autopilot")
                }
              >
                {language === "ar" ? "اطلب الاشتراك" : "Request subscription"}{" "}
                {language === "ar" ? (
                  <ArrowLeft size={16} />
                ) : (
                  <ArrowRight size={16} />
                )}
              </button>
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
                    <strong
                      className={
                        value === true
                          ? "is-check"
                          : value === false
                            ? "is-empty"
                            : ""
                      }
                      key={`${label}-${index}`}
                    >
                      {value === true ? (
                        <BadgeCheck size={18} />
                      ) : value === false ? (
                        "—"
                      ) : (
                        value
                      )}
                    </strong>
                  ))}
                </div>
              ))}
            </section>
          ))}
          <footer>
            {bundles.map((bundle) => (
              <button
                key={bundle.name}
                onClick={
                  user ? () => navigate("/console") : () => onAuthOpen("signup")
                }
              >
                {language === "ar" ? "ابدأ" : "Get started"}
              </button>
            ))}
          </footer>
        </div>
      </section>

      <section className="wasla-testimonials">
        <div className="wasla-testimonials__heading">
          <span>{language === "ar" ? "أصوات العملاء" : "Customer proof"}</span>
          <h2>
            {language === "ar"
              ? "شهادات كثيرة، لأن الثقة لا تأتي من بطاقة واحدة."
              : "Lots of testimonials, because trust should not hang on one card."}
          </h2>
        </div>
        <div className="wasla-testimonials__grid">
          {testimonials.map(([name, role, quote]) => (
            <article key={`${name}-${role}`}>
              <p>{quote}</p>
              <footer>
                <strong>{name}</strong>
                <span>{role}</span>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <footer className="wasla-home__footer">
        <WaslaBrand variant="english" inverse />
        <span>
          {language === "ar"
            ? "بسيط · متصل · ذكي"
            : "Simple · Connected · Smart"}
        </span>
        <strong>
          {language === "ar"
            ? "منتج سعودي يبني اتصالاً ذا قيمة"
            : "A Saudi product creating valuable connections"}
        </strong>
      </footer>
    </main>
  );
}

function PaymentPage({ language }: { language: "ar" | "en" }) {
  return (
    <section className="payment-page">
      <header>
        <span>
          <Lock size={15} />{" "}
          {language === "ar" ? "الفوترة والرصيد" : "Billing & credits"}
        </span>
        <h1>{language === "ar" ? "اشتراك خاص" : "Private subscription"}</h1>
        <p>
          {language === "ar"
            ? "تتم الاشتراكات عبر فريق مبيعات وصلة. يُفعّل الاشتراك ويُضاف رصيد الخطة فقط بعد استلام المبلغ كاملاً وتأكيد الدفع."
            : "Subscriptions are arranged with Wasla Sales. Your plan is activated and its credit is added only after full payment reaches our account and is confirmed."}
        </p>
      </header>
      <div className="payment-page__private-note">
        <Lock size={24} strokeWidth={1.5} />
        <div>
          <strong>{language === "ar" ? "تواصل مع فريق مبيعات وصلة" : "Speak with Wasla Sales"}</strong>
          <p>{language === "ar"
            ? "لا ندخل بيانات الدفع هنا. يتولى فريقنا ترتيب الاشتراك والتحقق من وصول المبلغ قبل فتح مساحة العمل."
            : "We do not collect card details here. Our team arranges your subscription and verifies receipt of payment before opening your workspace."}</p>
        </div>
      </div>
      <small className="payment-page__notice">
        <ShieldCheck size={14} />{" "}
        {language === "ar"
          ? "رصيد الاشتراك: ٢٠٠ أو ٣٠٠ أو ٥٠٠ ريال حسب الخطة المدفوعة."
          : "Paid-plan credit: SAR 200, 300, or 500, depending on the selected plan."}
      </small>
    </section>
  );
}

function AvatarMark({
  user,
  size = "md",
  preference,
}: {
  user: AuthUser | null;
  size?: "md" | "lg";
  preference?: AvatarPreference;
}) {
  const initials = (user?.name ?? "وصلة")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const background =
    avatarGradients[preference?.color || "ocean"] || avatarGradients.ocean;

  return (
    <Avatar
      className="wasla-user-avatar"
      size={size === "lg" ? "lg" : "sm"}
      style={{
        background,
        color: "#fff",
        width: size === "lg" ? 48 : 32,
        height: size === "lg" ? 48 : 32,
        fontSize: size === "lg" ? 16 : 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Avatar.Fallback
        style={{
          background,
          color: "#fff",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "inherit",
        }}
      >
        {preference?.showInitial === false ? "" : initials || "و"}
      </Avatar.Fallback>
    </Avatar>
  );
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default App;
