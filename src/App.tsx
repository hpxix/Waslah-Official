import {
  ArrowRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Command,
  FileText,
  Gift,
  LayoutDashboard,
  Lock,
  Mail,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Target,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Badge, Breadcrumbs, Button, Card, Chip, Input, ProgressBar, Separator, Surface, Table, Tabs, Toast } from "@heroui/react";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router";
import { emailTemplates, leads as seedLeads, productProfile, proposals, research as seedResearch } from "./data/demoData";
import { fetchApifyLeads, researchLead, understandLeadAsk } from "./lib/directus";
import type { CompanyResearch, IntakeState, Lead } from "./types";

const navItems = [
  { to: "/console", label: "Overview", icon: LayoutDashboard },
  { to: "/console/lead-chat", label: "Lead Chat", icon: Bot },
  { to: "/console/leads", label: "Leads", icon: Building2 },
  { to: "/console/insights", label: "Insights", icon: BarChart3 },
  { to: "/console/proposals", label: "Proposals", icon: FileText },
  { to: "/console/email-templates", label: "Emails", icon: Mail },
];

type AuthUser = {
  id: string;
  name: string;
  business: string;
  phone: string;
  avatarTone: string;
  verifiedPhone: boolean;
  freeCreditSar: number;
  createdAt: string;
};

const storedAuthKey = "waslah-auth-user";

function createAvatarTone(name: string) {
  const tones = ["cedar", "sky", "rose", "lime"];
  const score = Array.from(name || "Waslah").reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return tones[score % tones.length];
}

function App() {
  const [leads, setLeads] = useState(seedLeads);
  const [research, setResearch] = useState(seedResearch);
  const [pendingLeadAsk, setPendingLeadAsk] = useState("ابغى عملاء مناسبين لخدمة وصلات المبيعات في الرياض");
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

  return (
    <Routes>
      <Route path="/" element={<LandingChat onLeadAsk={setPendingLeadAsk} />} />
      <Route
        path="/secure"
        element={
          <SecureLeadPage
            initialAsk={pendingLeadAsk}
            user={authUser}
            onAuthChange={setAuthUser}
            onLeadsFetched={(newLeads) => setLeads((current) => [...newLeads, ...current])}
          />
        }
      />
      <Route
        path="/auth"
        element={
          <SecureLeadPage
            initialAsk={pendingLeadAsk}
            user={authUser}
            onAuthChange={setAuthUser}
            onLeadsFetched={(newLeads) => setLeads((current) => [...newLeads, ...current])}
          />
        }
      />
      <Route path="/console/*" element={<ConsoleShell user={authUser} leads={leads} research={research} setLeads={setLeads} setResearch={setResearch} />} />
    </Routes>
  );
}

function ConsoleShell({
  user,
  leads,
  research,
  setLeads,
  setResearch,
}: {
  user: AuthUser | null;
  leads: Lead[];
  research: CompanyResearch[];
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  setResearch: Dispatch<SetStateAction<CompanyResearch[]>>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = location.pathname.includes("leads")
    ? "leads"
    : location.pathname.includes("insights")
      ? "insights"
      : location.pathname.includes("proposals")
        ? "proposals"
        : location.pathname.includes("email-templates")
          ? "emails"
          : location.pathname.includes("lead-chat")
            ? "chat"
            : "overview";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [chatInput, setChatInput] = useState("");
  const [consoleMessages, setConsoleMessages] = useState([
    { role: "assistant", text: "Tell me the lead segment. The console will turn it into a fetch-ready brief." },
  ]);
  const [intake, setIntake] = useState<IntakeState>({
    confidence: 0,
    summary: "Waiting for target criteria.",
    missing: ["target industry", "location or market", "buyer role or decision maker"],
    apifyActor: "",
    apifyInput: {},
  });
  const [busy, setBusy] = useState(false);

  const pipeline = buildPipeline(leads);
  const byIndustry = buildIndustryData(leads);
  const avgFit = Math.round(leads.reduce((sum, lead) => sum + lead.fitScore, 0) / leads.length);
  const potential = leads.reduce((sum, lead) => sum + lead.revenueEstimate, 0);
  const activeResearch = research[0];
  const tabLabels: Record<string, string> = {
    overview: "Overview",
    chat: "Lead Chat",
    leads: "Leads",
    insights: "Insights",
    proposals: "Proposals",
    emails: "Email Templates",
  };

  function selectTab(key: string) {
    setActiveTab(key);
    const paths: Record<string, string> = {
      overview: "/console",
      chat: "/console/lead-chat",
      leads: "/console/leads",
      insights: "/console/insights",
      proposals: "/console/proposals",
      emails: "/console/email-templates",
    };
    navigate(paths[key] ?? "/console");
  }

  async function sendConsoleMessage(text = chatInput) {
    if (!text.trim() || busy) return;
    const nextMessages = [...consoleMessages, { role: "user", text }];
    setConsoleMessages(nextMessages);
    setChatInput("");
    setBusy(true);
    Toast.toast.info("Analyzing lead criteria...");
    const result = await understandLeadAsk(text, nextMessages.map((message) => `${message.role}: ${message.text}`));
    setIntake(result);
    setConsoleMessages([
      ...nextMessages,
      {
        role: "assistant",
        text: result.confidence === 100
          ? `Ready: ${result.summary}`
          : `Still missing ${result.missing.join(", ")}.`,
      },
    ]);
    Toast.toast.success(result.confidence === 100 ? "Lead brief is ready" : "Lead brief updated");
    setBusy(false);
  }

  async function runConsoleFetch() {
    setBusy(true);
    Toast.toast.info("Starting capped lead fetch...");
    const fetched = await fetchApifyLeads(intake);
    setLeads((current) => [...fetched, ...current]);
    Toast.toast.success(fetched.length ? `Added ${fetched.length} leads` : "Fetch is ready. Connect Directus/Apify to run live.");
    setBusy(false);
  }

  async function handleResearch(lead: Lead) {
    setBusy(true);
    Toast.toast.info(`Researching ${lead.company}...`);
    const entry = await researchLead(lead, productProfile.description) as CompanyResearch;
    setResearch((current) => [entry, ...current.filter((item) => item.leadId !== entry.leadId)]);
    Toast.toast.success(`Research updated for ${lead.company}`);
    setBusy(false);
  }

  return (
    <>
      <Toast.Provider placement="top end" />
      <main className="hconsole">
        <Surface className="hconsole-shell">
          <Card className="hconsole-sidebar">
            <Card.Content>
              <Link to="/" className="hconsole-brand">
                <span>W</span>
                <div><strong>Waslah</strong><small>AI Lead CRM</small></div>
              </Link>
              <Separator />
              <div className="hconsole-nav">
                {navItems.map((item) => {
                  const key = item.to.split("/").at(-1) === "console" ? "overview" : item.to.split("/").at(-1)?.replace("email-templates", "emails").replace("lead-chat", "chat") ?? "overview";
                  const Icon = item.icon;
                  return (
                    <Button key={item.to} variant={activeTab === key ? "primary" : "secondary"} onClick={() => selectTab(key)} className="hconsole-nav-button">
                      <Icon size={17} /> {item.label}
                    </Button>
                  );
                })}
              </div>
              <Card className="hconsole-credit-card">
                <Card.Header>
                  <Card.Title>{user?.verifiedPhone ? "Verified wallet" : "Free limits"}</Card.Title>
                  <Badge><Badge.Label>{user?.verifiedPhone ? `${user.freeCreditSar} SAR` : "30 SAR"}</Badge.Label></Badge>
                </Card.Header>
                <Card.Content>
                  <p>{user?.verifiedPhone ? "Phone verified. The welcome credit is active on this account." : "20 leads per fetch. 30 free lead credits after phone verification."}</p>
                </Card.Content>
              </Card>
              <div className="hconsole-profile-card">
                <AvatarMark user={user} />
                <div>
                  <strong>{user?.name ?? "Guest workspace"}</strong>
                  <small>{user?.verifiedPhone ? "Phone verified" : "Create an account to unlock credit"}</small>
                </div>
              </div>
            </Card.Content>
          </Card>

          <section className="hconsole-main">
            <Card className="hconsole-topbar">
              <Card.Content>
                <Breadcrumbs>
                  <Breadcrumbs.Item href="/">Waslah</Breadcrumbs.Item>
                  <Breadcrumbs.Item href="/console">Console</Breadcrumbs.Item>
                  <Breadcrumbs.Item>{tabLabels[activeTab] ?? "Overview"}</Breadcrumbs.Item>
                </Breadcrumbs>
                <div className="hconsole-actions">
                  <Chip><Chip.Label>{avgFit}% avg fit</Chip.Label></Chip>
                  <Chip><Chip.Label>{user?.verifiedPhone ? `${user.freeCreditSar} SAR wallet` : "Guest mode"}</Chip.Label></Chip>
                  <Button variant="secondary" onClick={() => Toast.toast.info("Console saved as draft")}>Save view</Button>
                  <Button onClick={runConsoleFetch} isDisabled={busy || intake.confidence < 100}><Search size={16} /> Fetch 20</Button>
                </div>
              </Card.Content>
            </Card>

            <Tabs selectedKey={activeTab} onSelectionChange={(key) => selectTab(String(key))} className="hconsole-tabs">
              <Tabs.ListContainer>
                <Tabs.List aria-label="Console sections">
                  <Tabs.Tab id="overview">Overview<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="chat">Lead Chat<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="leads">Leads<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="insights">Insights<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="proposals">Proposals<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="emails">Emails<Tabs.Indicator /></Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>

              <Tabs.Panel id="overview">
                <div className="hconsole-metrics">
                  <HeroUIMetric icon={Target} label="Average fit" value={`${avgFit}%`} />
                  <HeroUIMetric icon={BriefcaseBusiness} label="Pipeline value" value={money(potential)} />
                  <HeroUIMetric icon={Search} label="Research coverage" value={`${Math.round((research.length / leads.length) * 100)}%`} />
                  <HeroUIMetric icon={Mail} label="Email templates" value="3 free" />
                </div>
                <div className="hconsole-grid two">
                  <HeroUIBars title="Pipeline by status" items={pipeline.map((item) => ({ label: item.status, value: item.count * 25 }))} />
                  <HeroUIBars title="Industry mix" items={byIndustry.map((item) => ({ label: item.name, value: item.value * 25 }))} />
                </div>
                <Card className="hconsole-card">
                  <Card.Header><Card.Title>Best next actions</Card.Title></Card.Header>
                  <Card.Content className="hconsole-chip-list">
                    <Chip><Chip.Label>Research Nakhla Clinics again</Chip.Label></Chip>
                    <Chip><Chip.Label>Move BluePalm proposal to review</Chip.Label></Chip>
                    <Chip><Chip.Label>Clarify ICP before next Apify run</Chip.Label></Chip>
                  </Card.Content>
                </Card>
              </Tabs.Panel>

              <Tabs.Panel id="chat">
                <div className="hconsole-grid two">
                  <Card className="hconsole-card">
                    <Card.Header>
                      <Card.Title>Lead Discovery Chat</Card.Title>
                      <Card.Description>The assistant clarifies before credits are spent.</Card.Description>
                    </Card.Header>
                    <Card.Content>
                      <div className="hconsole-chat-log">
                        {consoleMessages.map((message, index) => (
                          <Card key={index} className={`hconsole-bubble ${message.role}`}>
                            <Card.Content>{message.text}</Card.Content>
                          </Card>
                        ))}
                      </div>
                      <div className="hconsole-input-row">
                        <Input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendConsoleMessage()} placeholder="Example: clinic owners in Riyadh with outdated follow-up" />
                        <Button onClick={() => sendConsoleMessage()} isDisabled={busy}><Send size={16} /> Send</Button>
                      </div>
                    </Card.Content>
                  </Card>
                  <Card className="hconsole-card">
                    <Card.Header><Card.Title>Apify readiness</Card.Title></Card.Header>
                    <Card.Content className="hconsole-progress-stack">
                      <ProgressBar value={intake.confidence} maxValue={100} aria-label="Apify readiness">
                        <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
                      </ProgressBar>
                      <strong>{intake.confidence}% understood</strong>
                      <p>{intake.summary}</p>
                      <div className="hconsole-chip-list">
                        {(intake.missing.length ? intake.missing : ["Ready to fetch"]).map((item) => <Chip key={item}><Chip.Label>{item}</Chip.Label></Chip>)}
                      </div>
                      <Button onClick={runConsoleFetch} isDisabled={busy || intake.confidence < 100}><RefreshCw size={16} /> Start Apify fetch</Button>
                    </Card.Content>
                  </Card>
                </div>
              </Tabs.Panel>

              <Tabs.Panel id="leads">
                <Card className="hconsole-card">
                  <Card.Header><Card.Title>Leads</Card.Title><Card.Description>Research, email, and move each account toward a proposal.</Card.Description></Card.Header>
                  <Card.Content>
                    <Table className="hconsole-table">
                      <Table.ScrollContainer>
                        <Table.Content aria-label="Leads">
                          <Table.Header>
                            <Table.Column isRowHeader>Lead</Table.Column>
                            <Table.Column>Company</Table.Column>
                            <Table.Column>Fit</Table.Column>
                            <Table.Column>Status</Table.Column>
                            <Table.Column>Actions</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {leads.map((lead) => (
                              <Table.Row key={lead.id} id={lead.id}>
                                <Table.Cell><strong>{lead.name}</strong><small>{lead.title}</small></Table.Cell>
                                <Table.Cell><strong>{lead.company}</strong><small>{lead.industry} · {lead.location}</small></Table.Cell>
                                <Table.Cell><ProgressBar value={lead.fitScore} maxValue={100} aria-label={`${lead.company} fit`}><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar></Table.Cell>
                                <Table.Cell><Chip><Chip.Label>{lead.status}</Chip.Label></Chip></Table.Cell>
                                <Table.Cell><Button variant="secondary" onClick={() => handleResearch(lead)} isDisabled={busy}><Search size={15} /> Research</Button></Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  </Card.Content>
                </Card>
              </Tabs.Panel>

              <Tabs.Panel id="insights">
                <div className="hconsole-grid two">
                  <HeroUIBars title="Lead comparison by fit" items={leads.map((lead) => ({ label: lead.company, value: lead.fitScore }))} />
                  <Card className="hconsole-card">
                    <Card.Header><Card.Title>AI insight</Card.Title><Card.Description>{activeResearch?.companySlug ?? "demo analysis"}</Card.Description></Card.Header>
                    <Card.Content className="hconsole-chip-list">
                      {(activeResearch?.opportunities ?? ["Healthcare and logistics show the strongest near-term segment", "Recent updates improve outreach timing", "Fit above 80 should move to proposal"]).map((item) => <Chip key={item}><Chip.Label>{item}</Chip.Label></Chip>)}
                    </Card.Content>
                  </Card>
                </div>
              </Tabs.Panel>

              <Tabs.Panel id="proposals">
                <Card className="hconsole-card">
                  <Card.Header><Card.Title>{proposals[0].title}</Card.Title><Card.Description>{leads.find((lead) => lead.id === proposals[0].leadId)?.company ?? leads[0].company}</Card.Description></Card.Header>
                  <Card.Content className="hconsole-proposal">
                    <p>{proposals[0].generatedCopy}</p>
                    <div className="hconsole-actions"><Chip><Chip.Label>{money(proposals[0].value)}</Chip.Label></Chip><Button onClick={() => Toast.toast.success("Proposal queued for review")}>Queue review</Button></div>
                  </Card.Content>
                </Card>
              </Tabs.Panel>

              <Tabs.Panel id="emails">
                <div className="hconsole-template-grid">
                  {emailTemplates.map((template) => (
                    <Card className="hconsole-card" key={template.id}>
                      <Card.Header>
                        <Card.Title>{template.name}</Card.Title>
                        {template.isPremium ? <Badge><Badge.Label>Premium</Badge.Label></Badge> : <Badge><Badge.Label>Free</Badge.Label></Badge>}
                      </Card.Header>
                      <Card.Content>
                        <p>{template.subject}</p>
                        <ProgressBar value={template.performanceScore} maxValue={100} aria-label={`${template.name} performance`}><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar>
                      </Card.Content>
                      <Card.Footer><Button isDisabled={template.isPremium} onClick={() => Toast.toast.success(`${template.name} selected`)}>{template.isPremium ? <Lock size={15} /> : <Send size={15} />} Use</Button></Card.Footer>
                    </Card>
                  ))}
                </div>
              </Tabs.Panel>
            </Tabs>
          </section>
        </Surface>
      </main>
    </>
  );
}

function HeroUIMetric({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <Card className="hconsole-card hconsole-metric">
      <Card.Content>
        <Icon size={18} />
        <span>{label}</span>
        <strong>{value}</strong>
      </Card.Content>
    </Card>
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

function LandingChat({ onLeadAsk }: { onLeadAsk: (ask: string) => void }) {
  const [input, setInput] = useState("");
  const navigate = useNavigate();

  function submitAsk(text = input) {
    const ask = text.trim();
    if (!ask) return;
    onLeadAsk(ask);
    navigate("/secure");
  }

  const promptChips = [
    "أصحاب عيادات في الرياض يحتاجون متابعة أسرع",
    "مطاعم في جدة تحتاج حجوزات وشراكات",
    "شركات لوجستية في السعودية عندها عروض أسعار يدوية",
    "وكالات عقار في دبي تبحث عن مشترين جادين",
  ];

  return (
    <main className="openai-landing arabic-ui" dir="rtl">
      <header className="openai-nav">
        <div className="openai-nav-inner">
          <Link to="/" className="landing-brand">
            <span>و</span>
            <strong>وصلة</strong>
          </Link>
          <nav className="site-nav">
            <a href="#products">المنتج</a>
            <a href="#research">الذكاء</a>
            <a href="#business">للشركات</a>
            <a href="#pricing">الأسعار</a>
            <Link to="/console">الكونسول</Link>
          </nav>
          <div className="nav-actions">
            <Link to="/secure" className="login-pill">تسجيل الدخول</Link>
            <Link to="/secure" className="try-pill">جرّب وصلة</Link>
          </div>
        </div>
      </header>

      <section className="ask-hero">
        <h1>كيف نقدر نساعدك اليوم؟</h1>
        <div className="hero-search">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submitAsk()}
            placeholder="مثال: ابحث لي عن ملاك عيادات في الرياض يحتاجون نظام متابعة عملاء"
            aria-label="اكتب نوع العملاء المطلوب"
          />
          <button onClick={() => submitAsk()} aria-label="إرسال طلب العملاء">
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="landing-chip-row">
          {promptChips.map((prompt) => (
            <button key={prompt} onClick={() => submitAsk(prompt)}>{prompt}</button>
          ))}
        </div>
      </section>

      <section className="blog-section" id="products">
        <article className="main-blog">
          <div className="blog-meta">
            <span>15 أغسطس 2026</span>
            <span>منتج</span>
            <span>إطلاق</span>
          </div>
          <h2>وصلة تطلق تجربة البحث الذكي عن العملاء باللغة العربية</h2>
          <p>اسأل عن نوع العميل الذي تريده، ودع وصلة تحول الطلب إلى شريحة واضحة قبل جلب البيانات، حتى لا ينصرف الرصيد على أسماء غير مناسبة.</p>
          <div className="blog-actions">
            <button><MessageSquareText size={15} /> استمع للمقال</button>
            <span>04:30</span>
            <Link to="/secure"><ArrowRight size={15} /> ابدأ التجربة</Link>
          </div>
          <figure className="main-blog-media">
            <img src="/waslah-main-blog.avif" alt="شبكة ضوئية تمثل ذكاء وصلة في البحث عن العملاء" />
            <figcaption>واجهة بحث عربية تقرأ السوق قبل أن تبدأ عملية جلب العملاء.</figcaption>
          </figure>
          <div className="blog-copy">
            <p><strong>تحديث:</strong> النسخة المجانية تتيح جلب 20 عميل في كل عملية، مع رصيد ترحيبي بقيمة 30 ريال عند إنشاء الحساب.</p>
            <p>الفكرة بسيطة: لا تبدأ من قائمة خام. ابدأ من سؤال واضح، ثم اجعل النظام يثبت المجال، المدينة، صانع القرار، وإشارة الاهتمام قبل تشغيل الجلب.</p>
          </div>
        </article>
        <aside className="blog-sidebar">
          <article className="blog-card">
            <div className="story-art night" />
            <div>
              <span>تشغيل · 3 دقائق</span>
              <h3>كيف تحافظ وصلة على جودة نتائج الجلب المجاني؟</h3>
              <p>حد 20 عميل لكل عملية يجعل التجربة أسرع وأسهل للمراجعة.</p>
            </div>
          </article>
          <article className="blog-card">
            <div className="story-art phone" />
            <div>
              <span>حسابات · دقيقتان</span>
              <h3>رصيد 30 ريال: بداية عملية لاختبار قناة مبيعات جديدة</h3>
              <p>رصيد الترحيب يكفي لجلب 30 عميل مناسب كبداية.</p>
            </div>
          </article>
          <article className="blog-card">
            <div className="story-art health" />
            <div>
              <span>السوق · 5 دقائق</span>
              <h3>لماذا تحتاج فرق المبيعات العربية إلى بحث محلي؟</h3>
              <p>اللغة، المدينة، ونوع صانع القرار تغيّر جودة التواصل بالكامل.</p>
            </div>
          </article>
        </aside>
      </section>

      <section className="news-row" id="business">
        <div className="section-title">
          <h2>آخر ما يحدث في وصلة</h2>
          <Link to="/console">عرض الكونسول</Link>
        </div>
        <div className="news-grid">
          {[
            ["إطلاق صفحة البحث الآمن للنسخة المجانية", "منتج"],
            ["تحديد سقف 20 عميل لكل عملية للحفاظ على الجودة", "تشغيل"],
            ["رصيد ترحيبي 30 ريال عند إنشاء الحساب", "حسابات"],
            ["تجهيز قوالب تواصل عربية بعد جلب العملاء", "مبيعات"],
          ].map(([title, category]) => (
            <article key={title} className="news-item">
              <div />
              <h3>{title}</h3>
              <p>{category} · قراءة دقيقة</p>
            </article>
          ))}
        </div>
      </section>
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

function SecureLeadPage({
  initialAsk,
  user,
  onAuthChange,
  onLeadsFetched,
}: {
  initialAsk: string;
  user: AuthUser | null;
  onAuthChange: (user: AuthUser) => void;
  onLeadsFetched: (leads: Lead[]) => void;
}) {
  const [input, setInput] = useState(initialAsk);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "أهلاً بك في الصفحة الآمنة. قبل الجلب، سأثبت نوع العميل وأوضح حدود النسخة المجانية." },
    { role: "user", text: initialAsk },
  ]);
  const [authStep, setAuthStep] = useState<"signup" | "verify" | "complete">(user?.verifiedPhone ? "complete" : user ? "verify" : "signup");
  const [authForm, setAuthForm] = useState({
    name: user?.name ?? "",
    business: user?.business ?? "",
    phone: user?.phone ?? "",
  });
  const [otp, setOtp] = useState("");
  const [otpHint, setOtpHint] = useState("2468");
  const [intake, setIntake] = useState<IntakeState>({
    confidence: 68,
    summary: initialAsk,
    missing: ["تأكيد المدينة", "دور صانع القرار"],
    apifyActor: "apify/google-maps-scraper",
    apifyInput: { maxCrawledPlacesPerSearch: 20 },
  });
  const [busy, setBusy] = useState(false);

  const previewUser: AuthUser = user ?? {
    id: "preview",
    name: authForm.name || "ضيف وصلة",
    business: authForm.business || "فريق المبيعات",
    phone: authForm.phone || "+966 5X XXX XXXX",
    avatarTone: createAvatarTone(authForm.name),
    verifiedPhone: false,
    freeCreditSar: 0,
    createdAt: new Date().toISOString(),
  };

  function startAccount() {
    if (!authForm.name.trim() || !authForm.phone.trim()) {
      setMessages((current) => [...current, { role: "assistant", text: "اكتب الاسم ورقم الجوال أولاً، وبعدها نرسل رمز التحقق ونجهز الرصيد." }]);
      return;
    }

    const code = "2468";
    const nextUser: AuthUser = {
      id: `user-${Date.now()}`,
      name: authForm.name.trim(),
      business: authForm.business.trim() || "فريق جديد",
      phone: authForm.phone.trim(),
      avatarTone: createAvatarTone(authForm.name),
      verifiedPhone: false,
      freeCreditSar: 0,
      createdAt: new Date().toISOString(),
    };
    setOtpHint(code);
    onAuthChange(nextUser);
    setAuthStep("verify");
    setMessages((current) => [...current, { role: "assistant", text: `تم إنشاء الحساب. أدخل رمز التحقق ${code} لتفعيل رصيد 30 ريال.` }]);
  }

  function verifyPhone() {
    if (!user) return;
    if (otp.trim() !== otpHint) {
      setMessages((current) => [...current, { role: "assistant", text: "رمز التحقق غير صحيح. جرّب الرمز الظاهر في البطاقة التجريبية." }]);
      return;
    }

    const verifiedUser = {
      ...user,
      verifiedPhone: true,
      freeCreditSar: 30,
    };
    onAuthChange(verifiedUser);
    setAuthStep("complete");
    setMessages((current) => [
      ...current,
      { role: "assistant", text: "تم توثيق رقم الجوال. رصيد 30 ريال صار جاهز داخل محفظتك." },
    ]);
  }

  async function sendSecureMessage(text = input) {
    if (!text.trim() || busy) return;
    const nextMessages = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    const result = await understandLeadAsk(text, nextMessages.map((message) => `${message.role}: ${message.text}`));
    const cappedResult = {
      ...result,
      apifyInput: {
        ...result.apifyInput,
        maxCrawledPlacesPerSearch: 20,
      },
    };
    setIntake(cappedResult);
    setMessages([
      ...nextMessages,
      {
        role: "assistant",
        text: result.confidence === 100
          ? "ممتاز. الشريحة واضحة الآن، وبإمكانك جلب 20 عميل كحد أقصى في هذه العملية."
          : `نحتاج نضبط التالي قبل الجلب: ${result.missing.join("، ")}.`,
      },
    ]);
    setBusy(false);
  }

  async function fetchFreeLeads() {
    if (!user?.verifiedPhone) {
      setMessages((current) => [...current, { role: "assistant", text: "فعّل رقم الجوال أولاً حتى نضيف رصيد 30 ريال ونفتح الجلب المجاني." }]);
      return;
    }
    setBusy(true);
    const fetched = await fetchApifyLeads(intake);
    onLeadsFetched(fetched);
    setMessages((current) => [
      ...current,
      { role: "assistant", text: fetched.length ? `تمت إضافة ${fetched.length} عميل إلى الكونسول.` : "الطلب جاهز. اربط Directus و Apify لتفعيل الجلب الحقيقي." },
    ]);
    setBusy(false);
  }

  return (
    <main className="secure-page arabic-ui" dir="rtl">
      <aside className="secure-rail">
        <Link to="/" className="rail-logo">و</Link>
        <button aria-label="بحث"><Search size={22} /></button>
        <button aria-label="محادثة"><MessageSquareText size={22} /></button>
        <button aria-label="الكونسول"><Command size={22} /></button>
        <Link to="/console" className="rail-dot" aria-label="فتح الكونسول" />
      </aside>

      <section className="secure-workspace">
        <header className="secure-top">
          <div className="mode-toggle">
            <button className="active">بحث العملاء</button>
            <button>العمل</button>
          </div>
          <Link to="/" className="secure-help"><RefreshCw size={20} /></Link>
        </header>

        <div className="secure-main">
          <div className="secure-chat">
            {messages.map((message, index) => (
              <div key={index} className={`secure-message ${message.role}`}>
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <aside className="auth-panel">
            <div className="auth-orbit">
              <AvatarMark user={previewUser} size="lg" />
              <button aria-label="تغيير الصورة الرمزية"><Camera size={17} /></button>
            </div>
            <div className="lock-row"><ShieldCheck size={18} /> حساب محمي برقم الجوال</div>
            <h1>{authStep === "complete" ? "رصيدك جاهز" : "أنشئ حسابك خلال دقيقة"}</h1>
            <p>{authStep === "complete" ? "تم التحقق من رقم الجوال وتم إضافة رصيد الترحيب إلى المحفظة." : "أي شخص يقدر يبدأ مجاناً. بعد توثيق رقم الجوال تحصل على 30 ريال داخل وصلة."}</p>

            <div className="auth-status-strip">
              <span className={authStep !== "signup" ? "done" : "active"}><UserPlus size={15} /> الحساب</span>
              <span className={authStep === "complete" ? "done" : authStep === "verify" ? "active" : ""}><Smartphone size={15} /> التحقق</span>
              <span className={authStep === "complete" ? "done" : ""}><Gift size={15} /> 30 ر.س</span>
            </div>

            {authStep === "signup" && (
              <div className="auth-fields">
                <label>
                  <span>اسمك</span>
                  <input value={authForm.name} onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))} placeholder="مثال: عبدالعزيز" />
                </label>
                <label>
                  <span>اسم الشركة</span>
                  <input value={authForm.business} onChange={(event) => setAuthForm((current) => ({ ...current, business: event.target.value }))} placeholder="مثال: عيادة النمو" />
                </label>
                <label>
                  <span>رقم الجوال</span>
                  <input value={authForm.phone} onChange={(event) => setAuthForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+966 5X XXX XXXX" />
                </label>
                <button className="create-account" onClick={startAccount}><UserPlus size={17} /> إنشاء الحساب</button>
              </div>
            )}

            {authStep === "verify" && (
              <div className="auth-fields">
                <div className="otp-card">
                  <Smartphone size={18} />
                  <div><strong>{user?.phone}</strong><span>رمز التجربة: {otpHint}</span></div>
                </div>
                <label>
                  <span>رمز التحقق</span>
                  <input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" maxLength={4} placeholder="2468" />
                </label>
                <button className="create-account" onClick={verifyPhone}><CheckCircle2 size={17} /> توثيق وإضافة الرصيد</button>
              </div>
            )}

            <div className="limit-grid">
              <div><strong>20</strong><span>عميل كحد أقصى لكل جلب</span></div>
              <div><strong>{user?.verifiedPhone ? "30 ر.س" : "0 ر.س"}</strong><span>رصيد المحفظة الحالي</span></div>
              <div><strong>{user?.verifiedPhone ? "موثق" : "بانتظار"}</strong><span>حالة رقم الجوال</span></div>
            </div>
            <button className="fetch-button" onClick={fetchFreeLeads} disabled={busy || intake.confidence < 100 || !user?.verifiedPhone}>
              <Search size={17} /> جلب 20 عميل الآن
            </button>
            <Link to="/console" className="wallet-link"><Wallet size={16} /> فتح الكونسول والمحفظة</Link>
          </aside>
        </div>

        <div className="secure-composer">
          <button aria-label="إضافة"><Sparkles size={23} /></button>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && sendSecureMessage()}
            placeholder="اكتب تفاصيل أكثر عن العميل المثالي..."
          />
          <button onClick={() => sendSecureMessage()} aria-label="إرسال"><ArrowRight size={20} /></button>
        </div>
      </section>
    </main>
  );
}
function buildPipeline(items: Lead[]) {
  const counts = items.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.status] = (acc[lead.status] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}

function buildIndustryData(items: Lead[]) {
  const counts = items.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.industry] = (acc[lead.industry] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default App;
