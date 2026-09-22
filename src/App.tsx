import { DashboardOverview } from "./components/DashboardOverview";
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
  Gift,
  LayoutDashboard,
  LogIn,
  LogOut,
  Lock,
  MessageSquare,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  UserPlus,
  WalletCards,
  History,
  X,
} from "lucide-react";
import { Badge, Button, Card, Chip, ProgressBar } from "@heroui/react";
import { ThinkingOrb } from "thinking-orbs";
import type { OrbState } from "thinking-orbs";
import { BorderBeam } from "border-beam";
import { liquidMetalFragmentShader, ShaderMount } from "@paper-design/shaders";
import { useCallback, useEffect, useRef, useState } from "react";
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
  startLeadGeneration,
  getLeadResearch,
  fetchWorkspaceResearch,
  getAccount,
  hasDirectus,
  isLeadSearchRequest,
  researchLead,
  logoutAccount,
} from "./lib/directus";
import type { AdminLead } from "./lib/directus";
import type { CompanyResearch, IntakeState, Lead } from "./types";
import { LeadFlowVisual } from "./components/LeadFlowVisual";
import { WaslaBrand } from "./components/WaslaBrand";
import { AuthDialog } from "./components/AuthDialog";
import { ProductTour } from "./components/ProductTour";
import { CoreLeadsWorkspace } from "./components/CoreLeadsWorkspace";
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
  { to: "/console/persona", labelKey: "console.persona", icon: BrainCircuit },
  { to: "/console/researched", labelKey: "console.researched", icon: Sparkles },
];

const storedAuthKey = "waslah-auth-user";

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
};

function scanFriendlyAssistantText(text: string) {
  const value = String(text || "").trim();
  if (
    !value ||
    value.length < 220 ||
    /\n|^\s*(?:[-*•#]|\d+[.)])\s/m.test(value)
  )
    return value;
  const sentences =
    value
      .match(/[^.!?؟]+(?:[.!?؟]+|$)/g)
      ?.map((item) => item.trim())
      .filter(Boolean) || [];
  if (sentences.length < 3) return value;
  const lastIsQuestion = /[?؟]$/.test(sentences.at(-1) || "");
  const question = lastIsQuestion ? sentences.pop() : null;
  const intro = sentences.shift();
  const bullets = sentences.map((sentence) => `- ${sentence}`).join("\n");
  return [intro, bullets, question].filter(Boolean).join("\n\n");
}

type DealIntent = "buy" | "sell";
type LeadTypeChoice = "b2c" | "b2b" | "unsure";
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
    if (active) return active.messages?.length || active.intent ? active : null;
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
  const { isTransitioning: languageIsTransitioning } = useLanguage();
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
  const [routeLoading, setRouteLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const previousRoute = useRef<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
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

  function openAuth(mode: "signup" | "login" = "signup") {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  function showCelebration(message: { title: string; body: string }) {
    notify.success(message.title, { description: message.body, timeout: 6500 });
  }

  function enterWorkspace(user: AuthUser) {
    setAuthUser(user);
    setAuthReady(true);
    navigate("/console");
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
                  <ConsoleShell
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
      <div id="wasla-modal-root" />
    </>
  );
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
        : location.pathname.includes("persona")
          ? "persona"
          : location.pathname.includes("researched")
            ? "researched"
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
  const lastLeadErrorToast = useRef("");
  useEffect(() => {
    if (
      !leadWorkspace.error ||
      leadWorkspace.error === lastLeadErrorToast.current
    )
      return;
    lastLeadErrorToast.current = leadWorkspace.error;
    notify.danger(
      language === "ar"
        ? `تعذر إكمال البحث: ${leadWorkspace.error}`
        : `Lead search could not complete: ${leadWorkspace.error}`,
    );
  }, [leadWorkspace.error, language]);
  const generationLock = useRef(false);
  const [researchingLeadId, setResearchingLeadId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    setActiveTab(
      location.pathname.endsWith("/console") ||
        location.pathname.includes("overview")
        ? "overview"
        : location.pathname.includes("admin")
          ? "admin"
          : location.pathname.includes("persona")
            ? "persona"
            : location.pathname.includes("researched")
              ? "researched"
              : location.pathname.includes("leads")
                ? "leads"
                : "agent",
    );
  }, [location.pathname]);
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
  const [leadTypePickerOpen, setLeadTypePickerOpen] = useState(
    !restoredChat && initialTab === "agent",
  );
  const [dealDirectionPickerOpen, setDealDirectionPickerOpen] = useState(false);
  const [selectedLeadType, setSelectedLeadType] = useState<
    "b2c" | "b2b" | null
  >(restoredChat?.leadType || restoredChat?.intake?.channel || null);
  const [availableLeadTypes, setAvailableLeadTypes] = useState<
    Array<"b2b" | "b2c">
  >(["b2b", "b2c"]);
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
        if (!cancelled) setAvailableLeadTypes(capabilities.lead_types);
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
    if (
      availableLeadTypes.length !== 1 ||
      !leadTypePickerOpen ||
      consoleMessages.length ||
      dealIntent
    )
      return;
    setSelectedLeadType(availableLeadTypes[0]);
    setLeadTypePickerOpen(false);
    setDealDirectionPickerOpen(true);
  }, [
    availableLeadTypes,
    leadTypePickerOpen,
    consoleMessages.length,
    dealIntent,
  ]);
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
            body: "اختر B2B أو B2C، ثم الشراء أو البيع. اشرح طلبك لوصلة لنحدد الجمهور والموقع والمعايير معاً.",
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
            body: "ستظهر النتائج تلقائياً في جدول بسيط. يمكنك البحث فيها وفتح البحث التفصيلي لعملاء B2B فقط.",
          },
        ]
      : [
          {
            target: "agent",
            eyebrow: "1 of 3",
            title: "Start with a conversation",
            body: "Choose B2B or B2C, then Buy or Sell. Tell Wasla your goal and refine your audience, location, and criteria together.",
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
            body: "Results appear automatically in a simple table. Search your inventory and open detailed company research for B2B leads.",
          },
        ];

  function selectTab(key: string) {
    const tab =
      key === "overview"
        ? "overview"
        : key === "admin" && user?.isAdmin
          ? "admin"
          : key === "persona"
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
      !dealDirectionPickerOpen
    ) {
      if (availableLeadTypes.length === 1) {
        setSelectedLeadType(availableLeadTypes[0]);
        setLeadTypePickerOpen(false);
        setDealDirectionPickerOpen(true);
      } else setLeadTypePickerOpen(availableLeadTypes.length > 1);
    }
    setActiveTab(tab);
    navigate("/console/" + tab);
  }

  function startNewChat() {
    if (busy) return;
    setActiveChatId(newChatId());
    setChatInput("");
    setConsoleMessages([]);
    setDealIntent(null);
    setLeadTypePickerOpen(availableLeadTypes.length > 1);
    setDealDirectionPickerOpen(availableLeadTypes.length === 1);
    setLeadCountPickerOpen(false);
    setSelectedLeadType(
      availableLeadTypes.length === 1 ? availableLeadTypes[0] : null,
    );
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
    selectTab("agent");
    window.setTimeout(
      () =>
        document
          .querySelector<HTMLInputElement>(".ops-chat-composer input")
          ?.focus(),
      100,
    );
  }

  function openChat(thread: ChatThread) {
    if (busy) return;
    setActiveChatId(thread.id);
    setConsoleMessages(thread.messages);
    setIntake(thread.intake);
    setDealIntent(savedChatIntent(thread));
    setSelectedLeadType(thread.leadType ?? thread.intake.channel ?? null);
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
    intake,
    selectedLeadType,
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
    if (!dealIntent) {
      notify.info(
        language === "ar"
          ? "اختر أولاً: هل تريد الشراء أم البيع؟"
          : "Choose Buy or Sell before starting the chat.",
      );
      return;
    }
    setLeadCountPickerOpen(false);
    const nextMessages: ChatMessage[] = [
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
    if (intake.confidence === 100 && isLeadLaunchConfirmation(text)) {
      setLeadCountPickerOpen(true);
      return;
    }
    setBusy(true);
    setActivityMode(
      dealIntent === "sell" || isLeadSearchRequest(text)
        ? "thinking"
        : "answering",
    );
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
      ),
      new Promise((resolve) => window.setTimeout(resolve, 420)),
    ]);
    window.clearInterval(phaseTimer);
    setResearchPhase(3);
    if (result.mode === "lead") {
      setIntake(result.intake);
      setLeadCountPickerOpen(result.intake.confidence === 100);
    }
    setConsoleMessages([
      ...nextMessages,
      {
        role: "assistant",
        text: result.text,
      },
    ]);
    setBusy(false);
    setActivityMode("idle");
  }

  async function runConsoleFetch(
    mission = intake,
    targetLeadCount = 30,
    leadType: "b2c" | "b2b" = mission.channel === "b2c" ? "b2c" : "b2b",
  ) {
    if (busy || generationLock.current || mission.confidence < 100) return;
    if (leadWorkspace.running) {
      selectTab("leads");
      return;
    }
    generationLock.current = true;
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
      );
      // The server is the source of truth for quantity. Using its confirmed
      // value prevents a stale picker/render from saying 50 while a 200-lead
      // campaign is actually running.
      const confirmedTargetLeadCount = Math.max(
        1,
        Number(job.target_count || targetLeadCount),
      );
      leadWorkspace.acceptJob(job);
      notify.success(
        language === "ar"
          ? "بدأت وصلة البحث عن عملائك."
          : "Wasla is finding your leads.",
        {
          description:
            language === "ar"
              ? `سنضيف العملاء المؤهلين تلقائياً حتى نصل إلى ${confirmedTargetLeadCount}.`
              : `Qualified leads will appear automatically as Wasla works toward ${confirmedTargetLeadCount}.`,
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
              ? "بدأ بحث عن " + confirmedTargetLeadCount + " عميلاً."
              : "Started a search for " + confirmedTargetLeadCount + " leads.",
        },
        {
          role: "assistant",
          text:
            language === "ar"
              ? "بدأ البحث. ستجد النتائج في قسم العملاء فور وصولها. يمكنك متابعة المحادثة معي أثناء البحث."
              : "Your search has started. Results will appear in Leads as they arrive. You can keep chatting with me while it runs.",
        },
      ]);
      setWorkspaceStarted(true);
      if (user)
        window.localStorage.setItem(
          "wasla:first-request:" + user.id,
          "created",
        );
      selectTab("leads");
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
          style={{ "--sidebar-width": "248px" } as React.CSSProperties}
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
            collapsible="offcanvas"
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
                  {language === "ar" ? "محادثة جديدة" : "New conversation"}
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
                          data-tour={key}
                          aria-current={activeTab === key ? "page" : undefined}
                        >
                          <Icon size={17} />
                          <span>{tabLabels[key]}</span>
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
                    <SidebarMenuButton onClick={() => setTourOpen(true)}>
                      <Sparkles size={16} />
                      <span>
                        {language === "ar"
                          ? "كيف تستخدم وصلة"
                          : "Getting started"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setSettingsOpen(true)}>
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
                  onClick={() => setSettingsOpen(true)}
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
                <div
                  className="hconsole-context"
                  style={{ paddingRight: "36px", paddingLeft: "36px" }}
                >
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
                                  <small>
                                    {new Date(
                                      thread.updatedAt,
                                    ).toLocaleDateString(
                                      language === "ar" ? "ar-SA" : "en-GB",
                                    )}
                                  </small>
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
                <TabsTrigger value="persona">{tabLabels.persona}</TabsTrigger>
                <TabsTrigger value="researched">
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
                  intake={intake}
                  language={language}
                  availableCredits={leadWorkspace.credits}
                  leadCountPickerOpen={leadCountPickerOpen}
                  leadTypePickerOpen={leadTypePickerOpen}
                  dealDirectionPickerOpen={dealDirectionPickerOpen}
                  selectedLeadType={selectedLeadType}
                  availableLeadTypes={availableLeadTypes}
                  onInputChange={setChatInput}
                  intent={dealIntent}
                  onRun={(targetLeadCount) =>
                    runConsoleFetch(
                      intake,
                      targetLeadCount,
                      selectedLeadType ?? "b2b",
                    )
                  }
                  onLeadCountPickerChange={setLeadCountPickerOpen}
                  onLeadTypeSelect={(leadType) => {
                    setSelectedLeadType(
                      leadType === "unsure" ? null : leadType,
                    );
                    setLeadTypePickerOpen(false);
                    setDealDirectionPickerOpen(true);
                  }}
                  onDirectionSelect={(intent) => {
                    setDealIntent(intent);
                    setDealDirectionPickerOpen(false);
                    setConsoleMessages([
                      {
                        role: "assistant",
                        text: openingMissionQuestion(
                          selectedLeadType,
                          intent,
                          language,
                        ),
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
                    });
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
                  <AdminLeadExplorer onInventoryLoaded={handleAdminInventoryLoaded} />
                ) : (
                  <CoreLeadsWorkspace
                    leads={leads}
                    research={research}
                    language={language}
                    job={leadWorkspace.job}
                    loading={leadWorkspace.loading}
                    error={leadWorkspace.error}
                    focusedLeadId={focusedLeadId}
                    researchingLeadId={researchingLeadId}
                    onRefresh={leadWorkspace.refresh}
                    onChat={() => selectTab("agent")}
                    onResearch={handleResearch}
                  />
                )}
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
                className={`lead-type-indicator is-${/b2c/i.test(lead.source) ? "b2c" : "b2b"}`}
              >
                {/b2c/i.test(lead.source) ? (
                  <UserPlus size={13} />
                ) : (
                  <Building2 size={13} />
                )}
                {/b2c/i.test(lead.source) ? "B2C" : "B2B"}
              </span>
              <span>
                <strong>{lead.name}</strong>
                <small>
                  {lead.title} · {lead.company}
                </small>
              </span>
              <span>
                <b>{lead.fitScore}%</b>
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
  intake,
  intent,
  language,
  leadCountPickerOpen,
  leadTypePickerOpen,
  dealDirectionPickerOpen,
  selectedLeadType,
  availableLeadTypes,
  onInputChange,
  onRun,
  onLeadCountPickerChange,
  onLeadTypeSelect,
  onDirectionSelect,
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
  intake: IntakeState;
  intent: DealIntent | null;
  language: "ar" | "en";
  leadCountPickerOpen: boolean;
  leadTypePickerOpen: boolean;
  dealDirectionPickerOpen: boolean;
  selectedLeadType: "b2c" | "b2b" | null;
  availableLeadTypes: Array<"b2b" | "b2c">;
  onInputChange: (value: string) => void;
  onRun: (targetLeadCount: number) => void;
  onLeadCountPickerChange: (open: boolean) => void;
  onLeadTypeSelect: (leadType: LeadTypeChoice) => void;
  onDirectionSelect: (intent: DealIntent) => void;
  onInsufficientCredits: (targetLeadCount: number) => void;
  onSend: () => void;
  researchPhase: number;
  user: AuthUser | null;
}) {
  const ready = intake.confidence === 100;
  const [promptIndex, setPromptIndex] = useState(0);
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

  return (
    <section className="ops-agent-page" data-tour="agent">
      <div className="ops-agent-page__top">
        <div>
          <span />{" "}
          {busy
            ? language === "ar"
              ? "البحث جارٍ"
              : "Research in progress"
            : language === "ar"
              ? "جاهز للمحادثة"
              : "Ready to chat"}
        </div>
        <strong>
          {language === "ar" ? "محادثة جديدة" : "New conversation"}
        </strong>
      </div>

      <div
        className={`ops-chat-stage${consoleMessages.length ? " has-conversation" : ""}`}
      >
        {intent ? (
          <span className={`ops-intent-badge is-${intent ?? "sell"}`}>
            <i />
            {selectedLeadType === "b2c"
              ? language === "ar"
                ? "عملاء أفراد B2C"
                : "B2C leads"
              : selectedLeadType === "b2b"
                ? language === "ar"
                  ? "عملاء شركات B2B"
                  : "B2B leads"
                : language === "ar"
                  ? "سأحدد نوع العميل معك"
                  : "Lead type will be inferred"}
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
                ? "من تريد أن تصل إليه؟"
                : "Who do you want to reach?"
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
              <div className="ops-chat-message__content">
                <ReactMarkdown
                  components={{
                    a: ({ children, ...props }) => (
                      <a {...props} target="_blank" rel="noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {message.role === "assistant"
                    ? scanFriendlyAssistantText(message.text)
                    : message.text}
                </ReactMarkdown>
              </div>
            </div>
          ))}
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
                    ? "10 أرصدة = عميل واحد"
                    : "10 credits = 1 fetched lead"}
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

          {busy ? (
            <ResearchActivity
              language={language}
              mode={activityMode}
              phase={researchPhase}
            />
          ) : null}
        </div>

        <BorderBeam className="ops-chat-composer-beam" size="md" colorVariant="colorful" strength={0.7} theme="dark" active={!busy}>
          <div className="ops-chat-composer">
            <input
              value={chatInput}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSend();
                }
              }}
              placeholder={
                !intent
                  ? language === "ar"
                    ? "اختر الشراء أو البيع أولاً"
                    : "Choose Buy or Sell first"
                  : `${language === "ar" ? "مثال" : "Example"}: ${promptExamples[0]}`
              }
              aria-label={
                language === "ar" ? "اكتب رسالة إلى وصلة" : "Message Wasla"
              }
              disabled={!intent}
            />
            <span className="ops-chat-composer__sparkle" aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <LiquidMetalSubmitButton
              onClick={onSend}
              disabled={busy || !intent}
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

        {leadTypePickerOpen ? (
          <LeadSetupModal
            title={
              language === "ar"
                ? "من تريد الوصول إليه؟"
                : "Who do you want to reach?"
            }
            description={
              language === "ar"
                ? "اختر نوع العملاء لهذه المحادثة الجديدة."
                : "Choose the lead type for this new conversation."
            }
            choices={[
              {
                id: "b2c",
                icon: UserPlus,
                title: "B2C",
                body:
                  language === "ar"
                    ? "أفراد ومستهلكون"
                    : "People and consumers",
              },
              {
                id: "b2b",
                icon: Building2,
                title: "B2B",
                body:
                  language === "ar"
                    ? "شركات وصناع قرار"
                    : "Companies and decision-makers",
              },
              ...(availableLeadTypes.length > 1
                ? [
                    {
                      id: "unsure",
                      icon: Sparkles,
                      title: language === "ar" ? "لست متأكداً" : "Not sure",
                      body:
                        language === "ar"
                          ? "سأفهم طلبك وأحدد النوع"
                          : "I’ll understand your need and infer it",
                    },
                  ]
                : []),
            ].filter(
              (choice) =>
                choice.id === "unsure" ||
                availableLeadTypes.includes(choice.id as "b2b" | "b2c"),
            )}
            onChoose={(id) => onLeadTypeSelect(id as LeadTypeChoice)}
          />
        ) : null}

        {dealDirectionPickerOpen ? (
          <LeadSetupModal
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
                title: language === "ar" ? "أريد أن أبيع" : "I want to sell",
                body:
                  language === "ar"
                    ? "اعثر على مشترين مناسبين"
                    : "Find matched buyers",
              },
              {
                id: "buy",
                icon: Building2,
                title: language === "ar" ? "أريد أن أشتري" : "I want to buy",
                body:
                  language === "ar"
                    ? "اعثر على موردين وفرص"
                    : "Find suppliers and opportunities",
              },
            ]}
            onChoose={(id) => onDirectionSelect(id as DealIntent)}
          />
        ) : null}
      </div>
    </section>
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
  const activity: { state: OrbState; label: string } =
    mode === "sourcing"
      ? {
          state: "working",
          label: language === "ar" ? "جارٍ العمل…" : "Working…",
        }
      : phase === 0
        ? {
            state: "working",
            label: language === "ar" ? "جارٍ التفكير…" : "Thinking…",
          }
        : phase === 1 && mode === "thinking"
          ? {
              state: "searching",
              label: language === "ar" ? "جارٍ البحث…" : "Searching…",
            }
          : {
              state: "solving",
              label: language === "ar" ? "جارٍ الحل…" : "Solving…",
            };
  return (
    <div className="ops-chat-message is-assistant is-research">
      <div className="research-activity is-orb-status rounded-full">
        <span className="research-activity__orb ">
          <ThinkingOrb
            state={activity.state}
            size={64}
            theme="dark"
            aria-label={activity.label}
          />
        </span>
        <strong>{activity.label}</strong>
      </div>
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
      onClick={onClick}
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

function MetallicChoiceCard({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  body: string;
  onClick: () => void;
}) {
  const shaderRef = useLiquidMetalShader();
  return (
    <button className="metallic-choice-card" type="button" onClick={onClick}>
      <span
        className="metallic-choice-card__shader"
        ref={shaderRef}
        aria-hidden="true"
      />
      <span className="metallic-choice-card__veil" aria-hidden="true" />
      <span className="metallic-choice-card__content">
        <i>
          <Icon size={25} />
        </i>
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
    </button>
  );
}

function LeadSetupModal({
  title,
  description,
  choices,
  onChoose,
}: {
  title: string;
  description: string;
  choices: Array<{
    id: string;
    icon: React.ComponentType<{ size?: number }>;
    title: string;
    body: string;
  }>;
  onChoose: (id: string) => void;
}) {
  return createPortal(
    <div className="lead-setup-overlay" role="presentation">
      <section
        className="lead-setup-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-setup-title"
      >
        <span className="lead-setup-window__eyebrow">
          <Sparkles size={14} /> Wasla AI
        </span>
        <h2 id="lead-setup-title">{title}</h2>
        <p>{description}</p>
        <div className={`lead-setup-cards is-${choices.length}`}>
          {choices.map((choice) => (
            <MetallicChoiceCard
              key={choice.id}
              icon={choice.icon}
              title={choice.title}
              body={choice.body}
              onClick={() => onChoose(choice.id)}
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
                onClick={() => {
                  onNavigate?.(key);
                  setOpen(false);
                }}
              >
                <Icon size={17} />
                <span>{label}</span>
                {language === "ar" ? (
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
          <span>{language === "ar" ? "لغة الواجهة" : "Interface language"}</span>
          <LanguageToggle inverse />
          {!user ? (
            <button type="button" onClick={() => { setOpen(false); onAuthOpen("login"); }}>
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
  onAuthOpen: (mode?: "signup" | "login") => void;
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
    if (user?.verifiedPhone) navigate("/console/agent");
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
            "مدير مبيعات B2B",
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
            "B2B Sales Manager",
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
          <source src="/Video.mp4" type="video/mp4" />
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

          <BorderBeam className="wasla-command__beam" size="md" colorVariant="colorful" strength={0.7} theme="dark" borderRadius={999}>
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
              onClick={() => submitAsk(input || examples[exampleIndex].request)}
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
              ? "ابدأ بعملاء مثرين وبحث عميق، ثم ارتقِ إلى وكيل يتصل ويحجز الاجتماعات."
              : "Start with enriched leads and deep research, then scale into an agent that calls and books meetings."}
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
              </header>
              <button
                onClick={
                  user ? () => navigate("/console") : () => onAuthOpen("signup")
                }
              >
                {language === "ar" ? "ابدأ الآن" : "Get started"}{" "}
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
  const [card, setCard] = useState({
    name: "",
    number: "",
    expiry: "",
    cvc: "",
  });
  return (
    <section className="payment-page">
      <header>
        <span>
          <CreditCard size={15} />{" "}
          {language === "ar" ? "الفوترة والرصيد" : "Billing & credits"}
        </span>
        <h1>{language === "ar" ? "طرق الدفع" : "Payment methods"}</h1>
        <p>
          {language === "ar"
            ? "أضف بيانات بطاقتك لتكون جاهزاً عند إطلاق الدفع الإلكتروني."
            : "Add your card details so your account is ready when online payments launch."}
        </p>
      </header>
      <div className="payment-page__grid">
        <div className="payment-card-preview">
          <WaslaBrand variant="symbol" inverse />
          <span>{card.number || "•••• •••• •••• ••••"}</span>
          <div>
            <strong>
              {card.name ||
                (language === "ar" ? "اسم حامل البطاقة" : "CARDHOLDER NAME")}
            </strong>
            <small>{card.expiry || "MM/YY"}</small>
          </div>
        </div>
        <Card className="hconsole-card payment-form">
          <Card.Header>
            <Card.Title>
              {language === "ar" ? "إضافة بطاقة" : "Add a card"}
            </Card.Title>
            <Badge>
              <Badge.Label>
                {language === "ar" ? "قريباً" : "Coming soon"}
              </Badge.Label>
            </Badge>
          </Card.Header>
          <Card.Content>
            <label>
              <span>
                {language === "ar" ? "الاسم على البطاقة" : "Name on card"}
              </span>
              <input
                value={card.name}
                onChange={(event) =>
                  setCard({ ...card, name: event.target.value })
                }
              />
            </label>
            <label>
              <span>{language === "ar" ? "رقم البطاقة" : "Card number"}</span>
              <input
                dir="ltr"
                inputMode="numeric"
                maxLength={19}
                value={card.number}
                onChange={(event) =>
                  setCard({
                    ...card,
                    number: event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 16)
                      .replace(/(.{4})/g, "$1 ")
                      .trim(),
                  })
                }
                placeholder="4242 4242 4242 4242"
              />
            </label>
            <div>
              <label>
                <span>{language === "ar" ? "الانتهاء" : "Expiry"}</span>
                <input
                  dir="ltr"
                  value={card.expiry}
                  onChange={(event) =>
                    setCard({ ...card, expiry: event.target.value.slice(0, 5) })
                  }
                  placeholder="MM/YY"
                />
              </label>
              <label>
                <span>CVC</span>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={4}
                  value={card.cvc}
                  onChange={(event) =>
                    setCard({
                      ...card,
                      cvc: event.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="•••"
                />
              </label>
            </div>
          </Card.Content>
          <Card.Footer>
            <Button
              onClick={() =>
                notify.info(
                  language === "ar"
                    ? "حفظ البطاقات سيُتاح قريباً — لم يتم إرسال أو تخزين أي بيانات."
                    : "Card saving is coming soon — no payment data was sent or stored.",
                )
              }
            >
              <Lock size={14} />{" "}
              {language === "ar" ? "حفظ البطاقة" : "Save card"}
            </Button>
          </Card.Footer>
        </Card>
      </div>
      <small className="payment-page__notice">
        <ShieldCheck size={14} />{" "}
        {language === "ar"
          ? "بوابة الدفع قيد التجهيز. لن نحفظ بيانات البطاقة قبل تفعيل مزود دفع معتمد."
          : "Payment gateway coming soon. Card data will not be stored until a certified payment provider is enabled."}
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
