import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, Bot, Braces, Building2, Coins, DatabaseZap, ExternalLink, ListFilter, MessageSquareText, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { notify } from "../lib/notify";
import {
  adjustAdminCredits,
  apiErrorMessage,
  createAdminProvider,
  deleteAdminProvider,
  fetchAdminAccounts,
  fetchAdminB2CCampaigns,
  fetchAdminB2CCampaignActivity,
  fetchAdminB2CCampaignLeads,
  fetchAdminChatLogs,
  fetchAdminFeatures,
  fetchAdminMemory,
  fetchAdminProviders,
  updateAdminFeature,
  updateAdminFeatureOverride,
  updateAdminProvider,
} from "../lib/directus";
import type { AdminAccount, AdminB2CActivity, AdminB2CCampaign, AdminB2CLeadEvidence, AdminChatLog, AdminFeature, AdminMemory, AdminProvider } from "../lib/directus";
import "./admin-control.css";
import "./admin-ready-brief.css";

type Section = "access" | "accounts" | "providers" | "conversations" | "memory" | "sourcing";

export function AdminControlCenter({ language }: { language: "ar" | "en" }) {
  const ar = language === "ar";
  const [section, setSection] = useState<Section>("access");
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [features, setFeatures] = useState<AdminFeature[]>([]);
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [logs, setLogs] = useState<AdminChatLog[]>([]);
  const [memories, setMemories] = useState<AdminMemory[]>([]);
  const [campaigns, setCampaigns] = useState<AdminB2CCampaign[]>([]);
  const [campaignView, setCampaignView] = useState<AdminB2CCampaign | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [accountFeatures, setAccountFeatures] = useState<AdminFeature[]>([]);
  const [creditDelta, setCreditDelta] = useState("100");
  const [creditScope, setCreditScope] = useState<"account" | "global">("account");
  const [creditReason, setCreditReason] = useState("Beta access adjustment");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [providerDraft, setProviderDraft] = useState({ key: "", name: "", actor_id: "", token: "", channel: "b2b" as "b2b" | "b2c", priority: 100 });

  async function load() {
    setLoading(true);
    try {
      const [accountRows, featureData, providerRows, chatRows, memoryRows, campaignRows] = await Promise.all([
        fetchAdminAccounts(), fetchAdminFeatures(), fetchAdminProviders(), fetchAdminChatLogs(), fetchAdminMemory(), fetchAdminB2CCampaigns(),
      ]);
      setAccounts(accountRows); setFeatures(featureData.features); setProviders(providerRows); setLogs(chatRows); setMemories(memoryRows); setCampaigns(campaignRows);
    } catch (error) { notify.danger(apiErrorMessage(error, ar ? "تعذر تحميل لوحة الإدارة." : "Could not load the admin console.")); }
    finally { setLoading(false); }
  }

  // Load once on entry; subsequent refreshes are explicit so admin edits never race a poll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const matchingAccounts = useMemo(() => {
    const needle = accountQuery.trim().toLowerCase();
    return accounts.filter((account) => !needle || [account.email, account.first_name, account.last_name, account.phone_e164, account.organization_name].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [accounts, accountQuery]);
  const readyB2CBriefs = useMemo(
    () => logs.filter((log) => log.lead_type === "b2c" && log.outcome === "ready_for_quantity"),
    [logs],
  );

  async function inspectAccount(identifier: string) {
    setSelectedAccount(identifier);
    if (!identifier) { setAccountFeatures([]); return; }
    try { setAccountFeatures((await fetchAdminFeatures(identifier)).features); }
    catch (error) { notify.danger(apiErrorMessage(error)); }
  }

  async function toggleGlobal(feature: AdminFeature) {
    setBusyKey(feature.key);
    try {
      await updateAdminFeature(feature.key, !feature.enabled_global);
      setFeatures((current) => current.map((item) => item.key === feature.key ? { ...item, enabled_global: !feature.enabled_global, enabled: !feature.enabled_global } : item));
      notify.success(ar ? "تم تطبيق التغيير فوراً." : "The change is live now.");
    } catch (error) { notify.danger(apiErrorMessage(error)); }
    finally { setBusyKey(null); }
  }

  async function setOverride(feature: AdminFeature, value: boolean | null) {
    if (!selectedAccount) return;
    setBusyKey(`override:${feature.key}`);
    try {
      const result = await updateAdminFeatureOverride(feature.key, selectedAccount, value);
      setAccountFeatures(result.features);
      notify.success(ar ? "تم تحديث صلاحية الحساب." : "Account access updated.");
    } catch (error) { notify.danger(apiErrorMessage(error)); }
    finally { setBusyKey(null); }
  }

  async function applyCredits() {
    const delta = Number(creditDelta);
    if (!Number.isInteger(delta) || delta === 0 || (creditScope === "account" && !selectedAccount)) return;
    setBusyKey("credits");
    try {
      const result = await adjustAdminCredits({ scope: creditScope, account: selectedAccount || undefined, credits_delta: delta, reason: creditReason });
      notify.success(ar ? `تم تحديث ${result.affected_accounts} حساب.` : `Updated ${result.affected_accounts} account${result.affected_accounts === 1 ? "" : "s"}.`);
      await load();
    } catch (error) { notify.danger(apiErrorMessage(error)); }
    finally { setBusyKey(null); }
  }

  async function addProvider() {
    if (!providerDraft.key || !providerDraft.name || !providerDraft.actor_id || !providerDraft.token) return;
    setBusyKey("provider:new");
    try {
      const row = await createAdminProvider(providerDraft);
      setProviders((current) => [...current, row].sort((a, b) => a.priority - b.priority));
      setProviderDraft({ key: "", name: "", actor_id: "", token: "", channel: "b2b", priority: 100 });
      notify.success(ar ? "تمت إضافة مزود جديد." : "Sourcing route added.");
    } catch (error) { notify.danger(apiErrorMessage(error)); }
    finally { setBusyKey(null); }
  }

  async function toggleProvider(provider: AdminProvider) {
    setBusyKey(provider.id);
    try { const next = await updateAdminProvider(provider.id, { enabled: !provider.enabled }); setProviders((current) => current.map((item) => item.id === provider.id ? next : item)); }
    catch (error) { notify.danger(apiErrorMessage(error)); }
    finally { setBusyKey(null); }
  }

  async function removeProvider(provider: AdminProvider) {
    if (!window.confirm(ar ? `إزالة ${provider.name}؟` : `Remove ${provider.name}?`)) return;
    setBusyKey(provider.id);
    try { await deleteAdminProvider(provider.id); setProviders((current) => current.filter((item) => item.id !== provider.id)); }
    catch (error) { notify.danger(apiErrorMessage(error)); }
    finally { setBusyKey(null); }
  }

  const nav: Array<{ key: Section; label: string; icon: typeof ShieldCheck }> = [
    { key: "access", label: ar ? "الوصول والميزات" : "Access & features", icon: ShieldCheck },
    { key: "accounts", label: ar ? "الحسابات والأرصدة" : "Accounts & credits", icon: Users },
    { key: "providers", label: ar ? "مصادر العملاء" : "Sourcing routes", icon: DatabaseZap },
    { key: "conversations", label: ar ? "المحادثات" : "Conversations", icon: MessageSquareText },
    { key: "memory", label: ar ? "ذاكرة الذكاء" : "AI memory", icon: Bot },
    { key: "sourcing", label: ar ? "منطق B2C" : "B2C rationale", icon: Braces },
  ];

  return <div className="admin-control">
    <header className="admin-control__hero"><div><span><ShieldCheck size={14}/>{ar ? "مركز تحكم وصلة" : "WASLA CONTROL PLANE"}</span><h1>{ar ? "تحكم كامل. أثر فوري." : "Control every account. Instantly."}</h1><p>{ar ? "ميزات، أرصدة، مصادر، محادثات وذاكرة الأعمال من مساحة واحدة." : "Feature access, credits, sourcing, conversations and learned business context in one place."}</p></div><button onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "is-spinning" : ""}/>{ar ? "تحديث" : "Refresh"}</button></header>
    <div className="admin-control__stats"><Metric icon={Users} label={ar ? "الحسابات" : "Accounts"} value={accounts.length}/><Metric icon={Activity} label={ar ? "محادثات مسجلة" : "Logged conversations"} value={logs.length}/><Metric icon={DatabaseZap} label={ar ? "مسارات نشطة" : "Active routes"} value={providers.filter((item) => item.enabled).length}/><Metric icon={Building2} label={ar ? "حملات B2C" : "B2C campaigns"} value={campaigns.length}/></div>
    <nav className="admin-control__nav">{nav.map(({ key, label, icon: Icon }) => <button key={key} className={section === key ? "is-active" : ""} onClick={() => setSection(key)}><Icon size={16}/>{label}</button>)}</nav>

    {section === "access" && <section className="admin-control__panel"><PanelHead title={ar ? "الوصول للمنتج" : "Product access"} body={ar ? "المفتاح العام يطبق على الجميع؛ إعداد الحساب يتغلب عليه فوراً." : "Global policy applies to everyone; an account override wins immediately."}/><div className="admin-feature-grid">{features.map((feature) => <article key={feature.key}><div><i className={feature.enabled_global ? "is-on" : ""}/><span><strong>{feature.name}</strong><small>{feature.description || feature.key}</small></span></div><button className={`admin-switch ${feature.enabled_global ? "is-on" : ""}`} onClick={() => void toggleGlobal(feature)} disabled={busyKey === feature.key} aria-label={`Toggle ${feature.name}`}><span/></button></article>)}</div><AccountPicker accounts={accounts} value={selectedAccount} onChange={inspectAccount} ar={ar}/>{selectedAccount && <div className="admin-overrides"><div><strong>{ar ? "تجاوزات هذا الحساب" : "Account overrides"}</strong><small>{ar ? "اختر موروث، متاح أو محظور." : "Choose inherited, enabled, or disabled."}</small></div>{accountFeatures.map((feature) => <article key={feature.key}><span><strong>{feature.name}</strong><small>{feature.overridden ? (ar ? "إعداد خاص" : "Account override") : (ar ? "موروث من العام" : "Inherited globally")}</small></span><select value={feature.overridden ? String(feature.enabled) : "inherit"} disabled={busyKey === `override:${feature.key}`} onChange={(event) => void setOverride(feature, event.target.value === "inherit" ? null : event.target.value === "true")}><option value="inherit">{ar ? "موروث" : "Inherit"}</option><option value="true">{ar ? "متاح" : "Enabled"}</option><option value="false">{ar ? "محظور" : "Disabled"}</option></select></article>)}</div>}</section>}

    {section === "accounts" && <section className="admin-control__panel"><PanelHead title={ar ? "الحسابات والأرصدة" : "Accounts & credits"} body={ar ? "ابحث بالبريد أو الاسم أو الجوال، ثم أضف أو اسحب الأرصدة." : "Find by email, name or phone, then add or remove credits."}/><div className="admin-credit-tool"><select value={creditScope} onChange={(event) => setCreditScope(event.target.value as "account" | "global")}><option value="account">{ar ? "حساب محدد" : "Specific account"}</option><option value="global">{ar ? "كل الحسابات" : "Every account"}</option></select>{creditScope === "account" && <AccountPicker accounts={accounts} value={selectedAccount} onChange={inspectAccount} ar={ar} compact/>}<input type="number" value={creditDelta} onChange={(event) => setCreditDelta(event.target.value)} placeholder="+100 / -100"/><input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} placeholder={ar ? "سبب التعديل" : "Reason for adjustment"}/><button onClick={() => void applyCredits()} disabled={busyKey === "credits"}><Coins size={16}/>{ar ? "تطبيق" : "Apply"}</button></div><label className="admin-search"><Search size={15}/><input value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} placeholder={ar ? "ابحث في الحسابات…" : "Search accounts…"}/></label><div className="admin-table"><div className="admin-table__head"><span>{ar ? "الحساب" : "Account"}</span><span>{ar ? "المنشأة" : "Workspace"}</span><span>{ar ? "الرصيد" : "Credits"}</span><span>{ar ? "العملاء" : "Leads"}</span><span>{ar ? "المحادثات" : "Chats"}</span></div>{matchingAccounts.map((account) => <button key={account.user_id} onClick={() => void inspectAccount(account.email)}><span><strong>{[account.first_name, account.last_name].filter(Boolean).join(" ") || account.email}</strong><small>{account.email}<br/>{account.phone_e164 || "—"}</small></span><span>{account.organization_name}</span><span><b>{account.credits.toLocaleString()}</b></span><span>{account.generated_leads}</span><span>{account.chat_turns}</span></button>)}</div></section>}

    {section === "providers" && <section className="admin-control__panel"><PanelHead title={ar ? "مسارات جلب العملاء" : "Lead sourcing routes"} body={ar ? "أضف Apify Actor جديداً، رتّب الأولوية، وأوقف أي مسار بدون نشر جديد." : "Add Apify actors, prioritize routes, and stop any source without a redeploy."}/><div className="admin-provider-form"><input placeholder={ar ? "المعرّف مثل google-maps-sa" : "Key, e.g. google-maps-sa"} value={providerDraft.key} onChange={(e) => setProviderDraft({ ...providerDraft, key: e.target.value })}/><input placeholder={ar ? "اسم المسار" : "Route name"} value={providerDraft.name} onChange={(e) => setProviderDraft({ ...providerDraft, name: e.target.value })}/><input placeholder="Apify actor ID" value={providerDraft.actor_id} onChange={(e) => setProviderDraft({ ...providerDraft, actor_id: e.target.value })}/><input type="password" placeholder="Apify API token" value={providerDraft.token} onChange={(e) => setProviderDraft({ ...providerDraft, token: e.target.value })}/><select value={providerDraft.channel} onChange={(e) => setProviderDraft({ ...providerDraft, channel: e.target.value as "b2b" | "b2c" })}><option value="b2b">B2B</option><option value="b2c">B2C</option></select><input type="number" value={providerDraft.priority} onChange={(e) => setProviderDraft({ ...providerDraft, priority: Number(e.target.value) })}/><button onClick={() => void addProvider()} disabled={busyKey === "provider:new"}><Plus size={16}/>{ar ? "إضافة المسار" : "Add route"}</button></div><div className="admin-provider-list">{providers.map((provider) => <article key={provider.id}><div className="admin-provider-list__icon"><DatabaseZap size={18}/></div><div><strong>{provider.name}</strong><small>{provider.actor_id} · {provider.channel.toUpperCase()} · {provider.token_hint || "no token"}</small></div><span>Priority {provider.priority}</span><button className={`admin-switch ${provider.enabled ? "is-on" : ""}`} onClick={() => void toggleProvider(provider)} disabled={busyKey === provider.id}><span/></button><button className="is-danger" onClick={() => void removeProvider(provider)} disabled={busyKey === provider.id}><Trash2 size={15}/></button></article>)}</div></section>}

    {section === "conversations" && <section className="admin-control__panel"><PanelHead title={ar ? "سجل محادثات الذكاء" : "AI conversation log"} body={ar ? "ما طلبه العميل، ماذا فهمت وصلة، والنتيجة التجارية لكل محادثة." : "What the client asked, what Wasla understood, and the commercial outcome."}/><div className="admin-log-list">{logs.map((log) => <details key={log.id}><summary><span className={`admin-kind is-${log.lead_type || "chat"}`}>{log.lead_type?.toUpperCase() || "CHAT"}</span><span><strong>{log.user_email || "Unknown account"}</strong><small>{log.deal_intent || "discovery"} · {new Date(log.created_at).toLocaleString()}</small></span><p>{log.message}</p><span className="admin-status">{log.outcome || log.status}</span></summary><div><section><small>USER</small><p>{log.message}</p></section><section><small>WASLA AI</small><p>{log.response || log.error_message || "—"}</p></section>{Object.keys(log.understood_data || {}).length > 0 && <pre>{JSON.stringify(log.understood_data, null, 2)}</pre>}</div></details>)}</div></section>}

    {section === "memory" && <section className="admin-control__panel"><PanelHead title={ar ? "ذاكرة الأعمال لكل مستخدم" : "Per-account business memory"} body={ar ? "ملف حيّ يتطور مع كل محادثة ويمكن لصاحب الحساب تثبيت شخصيته التجارية." : "A living profile that grows with every conversation and supports an owner-confirmed persona."}/><div className="admin-memory-grid">{memories.map((memory) => <article key={memory.id}><header><div className="admin-memory-avatar">{(memory.user_email || "W").slice(0, 1).toUpperCase()}</div><span><strong>{memory.user_email || "Unknown"}</strong><small>{memory.organization_name || "Wasla account"}</small></span><b>{memory.confidence}%</b></header><p>{memory.last_summary || "No summary yet."}</p><footer><span>{memory.source_turn_count} {ar ? "إشارة" : "signals"}</span><span>{memory.last_outcome || "learning"}</span><time>{new Date(memory.updated_at).toLocaleDateString()}</time></footer>{memory.understood_data.latest && <details><summary>{ar ? "آخر فهم" : "Latest understanding"}</summary><pre>{JSON.stringify(memory.understood_data.latest, null, 2)}</pre></details>}</article>)}</div></section>}

    {section === "sourcing" && (campaignView
      ? <B2CCampaignDetail campaign={campaignView} ar={ar} onBack={() => setCampaignView(null)}/>
      : <section className="admin-control__panel"><PanelHead title={ar ? "سجل تدقيق B2C الكامل" : "Complete B2C query audit"} body={ar ? "كل طلب، صاحب الحساب، الخطة، استدعاءات API، الكلمات المستخدمة، الخوارزمية والنتيجة." : "Every request, account owner, strategy, API route, query variable, algorithm stage and result."}/>{readyB2CBriefs.length > 0 && <div className="admin-ready-briefs"><header><div><strong>{ar ? "طلبات جاهزة ولم تبدأ بعد" : "Briefs ready for launch"}</strong><small>{ar ? "فهمت وصلة الطلب، لكن المستخدم لم يختر العدد ويبدأ البحث بعد." : "Wasla understood these requests, but the user has not selected a quantity and launched sourcing yet."}</small></div><b>{readyB2CBriefs.length}</b></header>{readyB2CBriefs.map((log) => <B2CReadyBrief key={log.id} log={log} ar={ar}/>)}</div>}<div className="admin-rationale-list">{campaigns.map((campaign) => <B2CCampaignAudit key={campaign.id} campaign={campaign} ar={ar} onOpen={() => setCampaignView(campaign)}/>)}</div></section>)}
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) { return <article><span><Icon size={16}/>{label}</span><strong>{value.toLocaleString()}</strong></article>; }
function PanelHead({ title, body }: { title: string; body: string }) { return <header className="admin-panel-head"><div><h2>{title}</h2><p>{body}</p></div></header>; }
function AccountPicker({ accounts, value, onChange, ar, compact = false }: { accounts: AdminAccount[]; value: string; onChange: (value: string) => void; ar: boolean; compact?: boolean }) { return <label className={`admin-account-picker ${compact ? "is-compact" : ""}`}><span>{ar ? "الحساب" : "Account"}</span><select value={value} onChange={(event) => void onChange(event.target.value)}><option value="">{ar ? "اختر بالبريد أو الجوال" : "Select by email or phone"}</option>{accounts.map((account) => <option key={account.user_id} value={account.email}>{account.email} · {account.organization_name} · {account.phone_e164 || "—"}</option>)}</select></label>; }

function B2CReadyBrief({ log, ar }: { log: AdminChatLog; ar: boolean }) {
  const understood = log.understood_data || {};
  return <details className="admin-ready-brief">
    <summary><span className="admin-kind is-b2c">B2C</span><div><strong>{log.user_email || (ar ? "حساب غير معروف" : "Unknown account")}</strong><small>{log.deal_intent || "sell"} · {new Date(log.created_at).toLocaleString()}</small><p>{log.message}</p></div><b>{ar ? "بانتظار البدء" : "AWAITING LAUNCH"}</b></summary>
    <div><section><small>{ar ? "فهم وصلة" : "WASLA UNDERSTOOD"}</small><p>{log.response || "—"}</p></section><section><small>{ar ? "الخطة المستخرجة" : "EXTRACTED PLAN"}</small><pre>{JSON.stringify(understood, null, 2)}</pre></section><p className="admin-ready-brief__note">{ar ? "لم تُنشأ حملة ولم يُستدعَ مصدر العملاء لهذا الطلب؛ لذلك لا توجد استعلامات API أو نتائج حتى يختار المستخدم العدد ويبدأ." : "No campaign or sourcing API call exists for this request yet. Query and result auditing begins after the user selects a quantity and launches the run."}</p></div>
  </details>;
}

function B2CCampaignAudit({ campaign, ar, onOpen }: { campaign: AdminB2CCampaign; ar: boolean; onOpen: () => void }) {
  return <details className="admin-b2c-audit">
    <summary><span className="admin-kind is-b2c">B2C</span><div><strong>{campaign.name}</strong><small>{campaign.username} · {campaign.user_email} · {campaign.organization_name}</small><small>{campaign.deal_intent} · {new Date(campaign.created_at).toLocaleString()}</small></div><b>{campaign.delivered_count}/{campaign.target_count}</b></summary>
    <div className="admin-b2c-audit__body">
      <section><small>{ar ? "طلب العميل الأصلي" : "ORIGINAL CLIENT REQUEST"}</small><p>{campaign.original_prompt}</p></section>
      <section><small>{ar ? "كيف فهمته وصلة" : "WASLA'S INTERPRETATION"}</small><p>{campaign.public_explanation?.thinking}</p><p>{campaign.public_explanation?.understanding}</p><p>{campaign.public_explanation?.sourcing}</p></section>
      <section><small>{ar ? "الخوارزمية" : "ALGORITHM"}</small><strong>{campaign.internal_audit.algorithm}</strong><ol>{campaign.internal_audit.stages.map((stage) => <li key={stage}>{stage}</li>)}</ol></section>
      <section><small>{ar ? "واجهات API الداخلية" : "INTERNAL API ROUTES"}</small><code>{campaign.internal_audit.source_api || "Not configured"}</code><code>{campaign.internal_audit.contact_api || "Not configured"}</code><p>{campaign.internal_audit.api_operations.join(" · ")}</p></section>
      <section className="is-wide"><small>{ar ? "عقد العدد وقواعد التنفيذ" : "EXACT-COUNT CONTRACT & EXECUTION RULES"}</small><div className="admin-b2c-rule-grid"><article><b>{campaign.internal_audit.exact_count_contract?.delivered || 0}/{campaign.internal_audit.exact_count_contract?.requested || campaign.target_count}</b><span>{ar ? "تم التسليم / المطلوب" : "delivered / requested"}</span><small>{campaign.internal_audit.exact_count_contract?.remaining || 0} {ar ? "متبقي" : "remaining"}</small></article>{(campaign.internal_audit.execution_rules || []).map((rule) => <article key={rule.id}><b>✓</b><span>{rule.label}</span><small>{rule.id}</small></article>)}</div></section>
      <section className="is-wide"><small>{ar ? "الاستعلامات الفعلية" : "EXACT QUERY VARIABLES"}</small><div className="admin-b2c-query-grid">{campaign.internal_audit.api_queries.map((query, index) => <article key={`${query.tag}-${index}`}><b>{query.tag}</b><span>{query.strategy_type} · {query.phase || "primary"} · weight {query.weight}</span><span>{query.cities?.join(", ") || "All Saudi cities"}</span><code>{JSON.stringify({ tag: query.tag, mode: query.mode, cities: query.cities, configured_pages: query.pages, limit: query.results_per_page, live_progress: query.progress }, null, 2)}</code></article>)}</div></section>
      <section className="is-wide"><small>{ar ? "سجل قرارات البحث والاسترداد" : "QUERY & RECOVERY DECISION LEDGER"}</small><p>{ar ? "يعرض كل صفحة جديدة، ومسار احتياطي، ومحاولة اتصال، وقرار إكمال أو توقف." : "Every fresh page, recovery expansion, contact failure, continuation and completion decision."}</p><pre>{JSON.stringify({ recovery: campaign.internal_audit.recovery, events: campaign.internal_audit.execution_ledger || [] }, null, 2)}</pre></section>
      <section className="is-wide"><small>{ar ? "الخطة الخام والحدود" : "RAW PLAN & THRESHOLDS"}</small><pre>{JSON.stringify({ qualification: campaign.internal_audit.qualification_thresholds, acquisition_plan: campaign.acquisition_plan, stats: campaign.internal_audit.stats }, null, 2)}</pre></section>
      <section className="is-wide admin-b2c-open"><div><small>{ar ? "نتائج الجولة وسجل API" : "RUN RESULTS & API ACTIVITY"}</small><p>{ar ? "افتح صفحة مستقلة لعرض كل عميل وإعلان واستجابة اتصال." : "Open a focused page with every lead, advertisement and contact response."}</p></div><button type="button" onClick={onOpen}><ListFilter size={15}/>{ar ? "كل العملاء" : "All leads"}</button></section>
    </div>
  </details>;
}

function B2CCampaignDetail({ campaign, ar, onBack }: { campaign: AdminB2CCampaign; ar: boolean; onBack: () => void }) {
  const [leads, setLeads] = useState<AdminB2CLeadEvidence[]>([]);
  const [activity, setActivity] = useState<AdminB2CActivity | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchAdminB2CCampaignLeads(campaign.id), fetchAdminB2CCampaignActivity(campaign.id)])
      .then(([leadRows, audit]) => { if (active) { setLeads(leadRows); setActivity(audit); } })
      .catch((error) => notify.danger(apiErrorMessage(error, ar ? "تعذر تحميل تفاصيل الجولة." : "Could not load campaign details.")))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campaign.id, ar]);

  return <section className="admin-control__panel admin-b2c-detail">
    <header className="admin-b2c-detail__head"><button type="button" onClick={onBack}><ArrowLeft size={16}/>{ar ? "رجوع" : "Back"}</button><div><span>B2C RUN AUDIT</span><h2>{campaign.name}</h2><p>{campaign.username} · {campaign.user_email} · {campaign.organization_name}</p></div><b>{campaign.status}</b></header>
    {loading ? <div className="admin-b2c-detail__loading"><RefreshCw className="is-spinning" size={18}/>{ar ? "جاري تحميل السجل الكامل…" : "Loading complete audit…"}</div> : <>
      <div className="admin-b2c-detail__metrics"><Metric icon={DatabaseZap} label={ar ? "إعلانات API" : "API ads"} value={activity?.summary.ads_returned || 0}/><Metric icon={Users} label={ar ? "بائعون فريدون" : "Unique sellers"} value={activity?.summary.unique_sellers || 0}/><Metric icon={Activity} label={ar ? "طلبات اتصال" : "Contact calls"} value={activity?.summary.contact_attempts || 0}/><Metric icon={Coins} label={ar ? "أرقام موثقة" : "Phones resolved"} value={activity?.summary.phones_resolved || 0}/></div>
      <section className="admin-b2c-detail__section"><header><div><span>{ar ? "العملاء المؤهلون" : "DELIVERED LEADS"}</span><h3>{leads.length} {ar ? "عميل" : "leads"}</h3></div></header>{leads.length === 0 ? <p className="admin-b2c-empty">{ar ? "لم تُسلّم أي سجلات بأرقام جوال موثقة في هذه الجولة." : "This run delivered no records with verified mobile numbers."}</p> : <div className="admin-b2c-leads">{leads.map((lead) => <article className="admin-b2c-lead" key={lead.id}><header><div><strong>{lead.display_name}</strong><span>{lead.phone}</span></div><div><b>{lead.tier} · {lead.score}</b><span>{lead.city || "—"} · {lead.marketplace_role}</span></div></header><p>{lead.explanation}</p><div className="admin-b2c-ad-list">{lead.advertisements.map((ad, index) => <section className="admin-b2c-ad" key={`${ad.post_id || "ad"}-${index}`}><div className="admin-b2c-ad__title"><div><strong>{ad.title || (ar ? "إعلان بدون عنوان" : "Untitled advertisement")}</strong><small>{ad.city || lead.city || "Saudi Arabia"} · {ad.strategy_type}</small></div>{ad.url && <a href={ad.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{ar ? "فتح الإعلان" : "Open ad"}</a>}</div><p>{ad.body}</p><div className="admin-b2c-ad__signals">{[...ad.tags, ...ad.matched_signals].map((item, signalIndex) => <span key={`${item}-${signalIndex}`}>{item}</span>)}</div></section>)}</div></article>)}</div>}</section>
      <section className="admin-b2c-detail__section"><header><div><span>{ar ? "سجل استجابات API" : "API RESPONSE LOG"}</span><h3>{activity?.activity.length || 0} {ar ? "إعلان محلل" : "analyzed ads"}</h3></div></header><div className="admin-b2c-activity">{activity?.activity.map((item) => <details key={item.id}><summary><span className={`admin-api-outcome is-${item.contact_call.outcome}`}>{item.contact_call.outcome.replaceAll("_", " ")}</span><div><strong>{item.fetched_ad.title || (ar ? "إعلان بدون عنوان" : "Untitled advertisement")}</strong><small>{item.request.tag} · {item.fetched_ad.author_username || "Unknown seller"} · score {item.qualification.score}</small></div>{item.fetched_ad.url && <a href={item.fetched_ad.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><ExternalLink size={14}/></a>}</summary><div className="admin-b2c-activity__body"><section><small>FetchAds request</small><code>{JSON.stringify(item.request, null, 2)}</code></section><section><small>PostContactQuery response</small><code>{JSON.stringify(item.contact_call, null, 2)}</code></section><section className="is-wide"><small>{ar ? "الإعلان الفعلي" : "ACTUAL ADVERTISEMENT"}</small><p>{item.fetched_ad.body || "—"}</p><div className="admin-b2c-ad__signals">{[...item.fetched_ad.tags, ...item.qualification.matched_signals].map((signal, index) => <span key={`${signal}-${index}`}>{signal}</span>)}</div></section><section className="is-wide"><small>{ar ? "قرار التأهيل" : "QUALIFICATION DECISION"}</small><p>{item.qualification.explanation || item.qualification.status}</p>{item.qualification.rejection_reasons.length > 0 && <p>{item.qualification.rejection_reasons.join(" · ")}</p>}</section></div></details>)}</div></section>
    </>}
  </section>;
}
