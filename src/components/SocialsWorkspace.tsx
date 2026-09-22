import {
  Activity,
  Check,
  ChevronRight,
  CircleAlert,
  Facebook,
  Ghost,
  Instagram,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  Music2,
  Pencil,
  PlugZap,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  apiErrorMessage,
  createSocialConnection,
  disconnectSocialConnection,
  fetchSocialActivity,
  fetchSocialConnections,
  fetchSocialProviders,
  setPreferredSocialConnection,
  syncGrowthPublishingConnections,
  updateSocialConnection,
  validateSocialConnection,
} from "../lib/directus";
import type {
  SaveSocialConnectionPayload,
  SocialActivity,
  SocialChannelProvider,
  SocialConnection,
  SocialProviderDefinition,
  SocialProviderOverview,
} from "../lib/directus";

type Language = "ar" | "en";

const providerIcons = {
  postiz: Send,
  chatwoot: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  whatsapp: MessageCircle,
  tiktok: Music2,
  snapchat: Ghost,
  custom: Webhook,
} as const;

const providerArabicNames: Record<SocialChannelProvider, string> = {
  postiz: "خدمة النشر Postiz",
  chatwoot: "صندوق Chatwoot",
  instagram: "إنستغرام",
  facebook: "فيسبوك",
  whatsapp: "واتساب للأعمال",
  tiktok: "تيك توك",
  snapchat: "سناب شات",
  custom: "واجهة مخصصة",
};

const eventLabels: Record<string, { en: string; ar: string }> = {
  connection_created: { en: "Connection created", ar: "تم إنشاء الاتصال" },
  connection_updated: { en: "Settings updated", ar: "تم تحديث الإعدادات" },
  credentials_rotated: { en: "Credentials rotated", ar: "تم تدوير بيانات الدخول" },
  preferred_route_changed: { en: "Preferred route changed", ar: "تم تغيير القناة المفضلة" },
  configuration_validated: { en: "Configuration checked", ar: "تم فحص الإعداد" },
  connection_disconnected: { en: "Channel disconnected", ar: "تم فصل القناة" },
};

function words(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function providerName(provider: SocialChannelProvider, language: Language, fallback?: string) {
  return language === "ar" ? providerArabicNames[provider] : fallback || words(provider);
}

function formatDate(value: string | null, language: Language) {
  if (!value) return language === "ar" ? "لم يتم الفحص بعد" : "Not checked yet";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: SocialConnection["status"], language: Language) {
  if (language === "en") return status === "ready" ? "Ready" : status === "needs_attention" ? "Needs attention" : "Configured";
  return status === "ready" ? "جاهز" : status === "needs_attention" ? "يحتاج انتباهاً" : "تم الإعداد";
}

type ConnectionForm = {
  displayName: string;
  autonomyLevel: SocialConnection["autonomy_level"];
  approvalPolicy: SocialConnection["approval_policy"];
  preferred: boolean;
  communicationPurpose: "leads" | "clients" | "both";
  defaultLanguage: "ar" | "en" | "both";
  postizIntegrationId: string;
  credentials: Record<string, string>;
};

function blankForm(provider: SocialProviderDefinition, connection?: SocialConnection | null): ConnectionForm {
  return {
    displayName: connection?.display_name || provider.name,
    autonomyLevel: connection?.autonomy_level || "draft_only",
    approvalPolicy: connection?.approval_policy || "always",
    preferred: connection?.is_preferred || false,
    communicationPurpose: (connection?.configuration.communication_purpose as ConnectionForm["communicationPurpose"]) || "both",
    defaultLanguage: (connection?.configuration.default_language as ConnectionForm["defaultLanguage"]) || "both",
    postizIntegrationId: String(connection?.configuration.postiz_integration_id || ""),
    credentials: Object.fromEntries(provider.credential_fields.map((field) => [field.key, ""])),
  };
}

export function SocialsWorkspace({ language }: { language: Language }) {
  const ar = language === "ar";
  const [overview, setOverview] = useState<SocialProviderOverview | null>(null);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [activity, setActivity] = useState<SocialActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<SocialProviderDefinition | null>(null);
  const [editingConnection, setEditingConnection] = useState<SocialConnection | null>(null);
  const [form, setForm] = useState<ConnectionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyConnection, setBusyConnection] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function syncPublishing() {
    setSyncing(true);
    setError("");
    try {
      const result = await syncGrowthPublishingConnections();
      setNotice(ar ? `تمت مزامنة ${result.synced} حسابات نشر.` : `${result.synced} publishing accounts synced. You can now select them in Content studio.`);
      await load(true);
    } catch (syncError) { setError(apiErrorMessage(syncError)); }
    finally { setSyncing(false); }
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [nextOverview, nextConnections, nextActivity] = await Promise.all([
        fetchSocialProviders(),
        fetchSocialConnections(),
        fetchSocialActivity(),
      ]);
      setOverview(nextOverview);
      setConnections(nextConnections);
      setActivity(nextActivity);
    } catch (loadError) {
      setError(apiErrorMessage(loadError, ar ? "تعذر تحميل مركز القنوات." : "Could not load the social command center."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Language only affects presentation; do not refetch when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preferred = connections.find((connection) => connection.is_preferred);
  const guardedCount = connections.filter((connection) => connection.autonomy_level === "guarded").length;
  const healthyCount = connections.filter((connection) => connection.status === "ready").length;
  const providerConnections = useMemo(() => {
    const grouped = new Map<SocialChannelProvider, SocialConnection[]>();
    connections.forEach((connection) => grouped.set(connection.provider, [...(grouped.get(connection.provider) || []), connection]));
    return grouped;
  }, [connections]);

  function openCreate(provider: SocialProviderDefinition) {
    setEditingConnection(null);
    setSelectedProvider(provider);
    setForm(blankForm(provider));
  }

  function openEdit(connection: SocialConnection) {
    const provider = overview?.providers.find((entry) => entry.id === connection.provider);
    if (!provider) return;
    setEditingConnection(connection);
    setSelectedProvider(provider);
    setForm(blankForm(provider, connection));
  }

  function closeEditor() {
    if (saving) return;
    setSelectedProvider(null);
    setEditingConnection(null);
    setForm(null);
  }

  async function saveConnection() {
    if (!selectedProvider || !form) return;
    setSaving(true);
    setError("");
    try {
      const enteredCredentials = Object.fromEntries(Object.entries(form.credentials).filter(([, value]) => value.trim()));
      const payload: SaveSocialConnectionPayload = {
        display_name: form.displayName,
        autonomy_level: form.autonomyLevel,
        approval_policy: form.approvalPolicy,
        is_preferred: form.preferred,
        configuration: {
          communication_purpose: form.communicationPurpose,
          default_language: form.defaultLanguage,
          timezone: "Asia/Riyadh",
          inbound_consent_required: true,
          postiz_integration_id: form.postizIntegrationId.trim(),
        },
      };
      if (editingConnection) {
        if (Object.keys(enteredCredentials).length) payload.credentials = enteredCredentials;
        await updateSocialConnection(editingConnection.id, payload);
        if (form.preferred && !editingConnection.is_preferred) await setPreferredSocialConnection(editingConnection.id);
      } else {
        await createSocialConnection({
          ...payload,
          provider: selectedProvider.id,
          credentials: enteredCredentials,
        });
      }
      setNotice(editingConnection
        ? (ar ? "تم تحديث القناة بأمان." : "Channel updated securely.")
        : (ar ? "تم ربط القناة بمساحة العمل." : "Channel connected to your workspace."));
      setSelectedProvider(null);
      setEditingConnection(null);
      setForm(null);
      await load(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError, ar ? "تعذر حفظ القناة." : "Could not save this channel."));
    } finally {
      setSaving(false);
    }
  }

  async function makePreferred(connection: SocialConnection) {
    setBusyConnection(connection.id);
    setError("");
    try {
      await setPreferredSocialConnection(connection.id);
      setNotice(ar ? "تم تحديث مسار التواصل المفضل." : "Preferred communication route updated.");
      await load(true);
    } catch (actionError) {
      setError(apiErrorMessage(actionError));
    } finally {
      setBusyConnection(null);
    }
  }

  async function validate(connection: SocialConnection) {
    setBusyConnection(connection.id);
    setError("");
    try {
      await validateSocialConnection(connection.id);
      setNotice(ar ? "اكتمل فحص الأمان والإعداد." : "Security and configuration check complete.");
      await load(true);
    } catch (actionError) {
      setError(apiErrorMessage(actionError));
    } finally {
      setBusyConnection(null);
    }
  }

  async function disconnect(connection: SocialConnection) {
    setBusyConnection(connection.id);
    setError("");
    try {
      await disconnectSocialConnection(connection.id);
      setConfirmDisconnect(null);
      setNotice(ar ? "تم فصل القناة وحذف حزمة بياناتها المشفرة." : "Channel disconnected and its encrypted credential package removed.");
      await load(true);
    } catch (actionError) {
      setError(apiErrorMessage(actionError));
    } finally {
      setBusyConnection(null);
    }
  }

  return (
    <div className="socials-command" dir={ar ? "rtl" : "ltr"}>
      <header className="socials-hero">
        <div className="socials-hero__copy">
          <span className="socials-eyebrow"><Sparkles size={14} /> {ar ? "مركز التواصل الذكي" : "Wasla channel intelligence"}</span>
          <h1>{ar ? "مركز قيادة القنوات" : "Social command center"}</h1>
          <p>{ar
            ? "اربط قنواتك، حدّد مسار التواصل المفضل، واضبط مستوى استقلالية الذكاء الاصطناعي من مساحة عمل واحدة آمنة."
            : "Connect every client-facing channel, choose your preferred route, and govern AI autonomy from one secure workspace."}</p>
        </div>
        <button className="socials-refresh" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "is-spinning" : ""} />
          {ar ? "تحديث" : "Refresh"}
        </button>
        <div className="socials-security-strip">
          <span><LockKeyhole size={14} /> {ar ? "تشفير آمن" : "Encrypted at rest"}</span>
          <span><ShieldCheck size={14} /> {ar ? "عزل كامل لكل مساحة" : "Tenant isolated"}</span>
          <span><KeyRound size={14} /> {ar ? "لا نعيد المفاتيح للمتصفح" : "Secrets never returned"}</span>
        </div>
      </header>

      {error ? <div className="socials-alert is-error"><CircleAlert size={18} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div> : null}
      {notice ? <div className="socials-alert is-success"><Check size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button></div> : null}
      <div className="socials-publishing-setup"><div><strong>{ar ? "اربط مرة واحدة. أدر كل شيء هنا." : "Connect once. Manage it all here."}</strong><p>{ar ? "أضف مفتاح مساحة Postiz ثم زامن حسابات النشر. أضف حساب Chatwoot لصندوق المحادثات. لا تحتاج نسخ مفاتيح المنصات مرة أخرى للحسابات المزامنة." : "Add your Postiz workspace key, then sync its publishing accounts. Add Chatwoot for your inbox. Synced accounts don't need duplicate platform keys."}</p></div><button type="button" onClick={syncPublishing} disabled={syncing || !connections.some((connection) => connection.provider === "postiz")}><RefreshCw size={16} className={syncing ? "is-spinning" : ""} />{ar ? "مزامنة حسابات النشر" : "Sync publishing accounts"}</button></div>

      <section className="socials-metrics" aria-label={ar ? "نظرة عامة" : "Connection overview"}>
        <article><span><PlugZap size={17} /> {ar ? "الحسابات المتصلة" : "Connected accounts"}</span><strong>{connections.length}</strong><small>{ar ? "عبر جميع القنوات" : "Across every channel"}</small></article>
        <article><span><Route size={17} /> {ar ? "المسار المفضل" : "Preferred route"}</span><strong className="is-text">{preferred ? providerName(preferred.provider, language) : (ar ? "لم يحدد" : "Not set")}</strong><small>{preferred?.display_name || (ar ? "يُختار تلقائياً مع أول اتصال" : "First connection becomes preferred")}</small></article>
        <article><span><ShieldCheck size={17} /> {ar ? "سياسات الأتمتة" : "Automation policies"}</span><strong>{guardedCount}</strong><small>{ar ? "إعداد محفوظ — الإرسال بموافقة بشرية" : "Saved preferences — sends require approval"}</small></article>
        <article><span><Activity size={17} /> {ar ? "القنوات الجاهزة" : "Ready channels"}</span><strong>{healthyCount}/{connections.length || 0}</strong><small>{ar ? "بحسب آخر فحص إعداد" : "From the latest configuration check"}</small></article>
      </section>

      <section className="socials-section">
        <div className="socials-section__heading">
          <div><span>{ar ? "قنواتك" : "Your channel stack"}</span><h2>{ar ? "أضف قناة تواصل" : "Connect a communication channel"}</h2></div>
          <p>{ar ? "استخدم واجهات المنصات الرسمية فقط لحماية الحساب وتقليل مخاطر الحظر." : "Use official platform APIs to protect account reputation and minimize enforcement risk."}</p>
        </div>
        <div className="socials-provider-grid">
          {(overview?.providers || []).map((provider) => {
            const Icon = providerIcons[provider.id];
            const connected = providerConnections.get(provider.id)?.length || 0;
            return (
              <article className={`socials-provider is-${provider.id}`} key={provider.id}>
                <div className="socials-provider__top">
                  <span className="socials-provider__icon"><Icon size={24} /></span>
                  <span className={`socials-readiness ${provider.oauth_ready ? "is-ready" : ""}`}><i />{provider.oauth_ready ? (ar ? "التطبيق جاهز" : "App ready") : (ar ? "الإعداد اليدوي" : "Manual setup")}</span>
                </div>
                <h3>{providerName(provider.id, language, provider.name)}</h3>
                <p>{ar ? providerDescriptionAr(provider.id) : provider.description}</p>
                <div className="socials-provider__footer">
                  <span>{connected} {ar ? "متصل" : connected === 1 ? "connection" : "connections"}</span>
                  <button type="button" onClick={() => openCreate(provider)} disabled={!overview?.security.encrypted_at_rest}>
                    {ar ? "إعداد" : "Configure"}<ChevronRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
          {loading && !overview ? Array.from({ length: 6 }).map((_, index) => <div className="socials-provider is-loading" key={index} />) : null}
        </div>
      </section>

      <div className="socials-lower-grid">
        <section className="socials-section socials-connections">
          <div className="socials-section__heading is-compact"><div><span>{ar ? "التوجيه" : "Routing"}</span><h2>{ar ? "الحسابات المتصلة" : "Connected accounts"}</h2></div></div>
          {!loading && connections.length === 0 ? (
            <div className="socials-empty"><span><PlugZap size={25} /></span><h3>{ar ? "اربط أول قناة" : "Connect your first channel"}</h3><p>{ar ? "ستظهر هنا صحة الاتصال والسياسات ومسار التواصل المفضل." : "Connection health, policies, and preferred routing will appear here."}</p></div>
          ) : (
            <div className="socials-connection-list">
              {connections.map((connection) => {
                const Icon = providerIcons[connection.provider];
                const deleting = confirmDisconnect === connection.id;
                return (
                  <article className="socials-connection" key={connection.id}>
                    <div className={`socials-connection__avatar is-${connection.provider}`}><Icon size={20} /></div>
                    <div className="socials-connection__main">
                      <div className="socials-connection__title"><h3>{connection.display_name}</h3>{connection.is_preferred ? <span><Star size={12} fill="currentColor" /> {ar ? "مفضلة" : "Preferred"}</span> : null}</div>
                      <p>{providerName(connection.provider, language)} · {connection.external_account_id ? `•••• ${connection.external_account_id.slice(-4)}` : (ar ? "حساب مشفر" : "Encrypted account")}</p>
                      <div className="socials-connection__meta">
                        <span className={`status-${connection.status}`}><i />{statusLabel(connection.status, language)}</span>
                        <span>{ar ? "الاستقلالية:" : "Autonomy:"} {autonomyLabel(connection.autonomy_level, language)}</span>
                        <span>{ar ? "آخر فحص:" : "Checked:"} {formatDate(connection.last_verified_at, language)}</span>
                      </div>
                    </div>
                    <div className="socials-connection__actions">
                      {deleting ? <>
                        <button className="is-danger-solid" type="button" onClick={() => void disconnect(connection)} disabled={busyConnection === connection.id}>{ar ? "تأكيد الفصل" : "Confirm disconnect"}</button>
                        <button type="button" onClick={() => setConfirmDisconnect(null)}>{ar ? "إلغاء" : "Cancel"}</button>
                      </> : <>
                        {!connection.is_preferred ? <button type="button" onClick={() => void makePreferred(connection)} disabled={Boolean(busyConnection)}><Star size={15} />{ar ? "اجعلها مفضلة" : "Set preferred"}</button> : null}
                        <button type="button" onClick={() => void validate(connection)} disabled={Boolean(busyConnection)}><RefreshCw size={15} className={busyConnection === connection.id ? "is-spinning" : ""} />{ar ? "فحص" : "Check"}</button>
                        <button type="button" onClick={() => openEdit(connection)}><Pencil size={15} />{ar ? "تعديل" : "Manage"}</button>
                        <button className="is-danger" type="button" onClick={() => setConfirmDisconnect(connection.id)}><Trash2 size={15} /><span className="sr-only">{ar ? "فصل" : "Disconnect"}</span></button>
                      </>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="socials-side-stack">
          <section className="socials-section socials-environment">
            <div className="socials-section__heading is-compact"><div><span>{ar ? "البنية التحتية" : "Infrastructure"}</span><h2>{ar ? "جاهزية التطبيق" : "Application readiness"}</h2></div></div>
            <p className="socials-environment__intro">{ar ? "تبقى أسرار التطبيق العامة على الخادم. يعرض وصلة حالتها فقط، ولا يسمح بقراءتها أو تعديلها من المتصفح." : "Global app secrets stay on the server. Wasla shows readiness only; values can never be read or edited in the browser."}</p>
            <div className="socials-system-list">
              {(overview?.orchestration || []).map((system) => <div key={system.id}><span><i className={system.ready ? "is-ready" : ""} />{system.name}</span><strong>{system.ready ? (ar ? "جاهز" : "Ready") : (ar ? "اختياري" : "Optional")}</strong></div>)}
            </div>
            {!overview?.security.dedicated_encryption_key ? <div className="socials-env-note"><CircleAlert size={16} /><span>{ar ? "أضف SOCIAL_TOKEN_ENCRYPTION_KEY مستقلاً في الإنتاج لتدوير المفاتيح بأمان." : "Add a dedicated SOCIAL_TOKEN_ENCRYPTION_KEY in production for safer key rotation."}</span></div> : <div className="socials-env-note is-good"><ShieldCheck size={16} /><span>{ar ? "مفتاح تشفير مخصص مفعّل." : "Dedicated credential encryption is active."}</span></div>}
          </section>

          <section className="socials-section socials-activity">
            <div className="socials-section__heading is-compact"><div><span>{ar ? "سجل المراجعة" : "Audit trail"}</span><h2>{ar ? "آخر النشاطات" : "Recent activity"}</h2></div></div>
            <div className="socials-timeline">
              {activity.length ? activity.slice(0, 6).map((event) => <div key={event.id}><i /><span><strong>{eventLabels[event.event_type]?.[language] || words(event.event_type)}</strong><small>{providerName(event.provider, language)} · {formatDate(event.created_at, language)}</small></span></div>) : <p>{ar ? "سيظهر نشاط إعداد القنوات هنا." : "Channel configuration activity will appear here."}</p>}
            </div>
          </section>
        </aside>
      </div>

      {selectedProvider && form ? createPortal(
        <div className="socials-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <section className={`socials-editor is-${selectedProvider.id}`} role="dialog" aria-modal="true" aria-labelledby="socials-editor-title" dir={ar ? "rtl" : "ltr"}>
            <header>
              <div className="socials-editor__identity">
                <span>{(() => { const Icon = providerIcons[selectedProvider.id]; return <Icon size={24} />; })()}</span>
                <div><small>{editingConnection ? (ar ? "إدارة اتصال" : "Manage connection") : (ar ? "اتصال جديد" : "New connection")}</small><h2 id="socials-editor-title">{providerName(selectedProvider.id, language, selectedProvider.name)}</h2></div>
              </div>
              <button type="button" onClick={closeEditor} aria-label={ar ? "إغلاق" : "Close"}><X size={19} /></button>
            </header>
            <div className="socials-editor__body">
              <div className="socials-editor__security"><LockKeyhole size={17} /><span><strong>{ar ? "بيانات دخول مشفرة" : "Encrypted credential vault"}</strong><small>{ar ? "تُشفّر على الخادم ولا تُعاد أبداً إلى هذا المتصفح." : "Values are encrypted server-side and are never returned to this browser."}</small></span></div>
              <label className="socials-field"><span>{ar ? "اسم الاتصال" : "Connection name"}</span><input value={form.displayName} maxLength={120} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder={selectedProvider.name} /></label>
              <fieldset className="socials-credentials">
                <legend>{editingConnection ? (ar ? "تدوير بيانات الدخول (اختياري)" : "Rotate credentials (optional)") : (ar ? "بيانات القناة" : "Channel credentials")}</legend>
                {editingConnection ? <p>{ar ? "اترك الحقول فارغة للاحتفاظ بالحزمة الحالية. عند التدوير، أدخل جميع الحقول من جديد." : "Leave blank to keep the current package. To rotate, enter every field again."}</p> : null}
                {selectedProvider.credential_fields.map((field) => <label className="socials-field" key={field.key}><span>{field.label}{field.required ? " *" : ""}</span><input type={field.kind === "secret" ? "password" : "text"} autoComplete="off" spellCheck={false} value={form.credentials[field.key] || ""} onChange={(event) => setForm({ ...form, credentials: { ...form.credentials, [field.key]: event.target.value } })} placeholder={editingConnection ? editingConnection.credential_hints.masked[field.key] || (ar ? "غير محفوظ" : "Not stored") : field.kind === "secret" ? "••••••••••••" : ""} /></label>)}
              </fieldset>
              <div className="socials-form-grid">
                <label className="socials-field"><span>{ar ? "مستوى استقلالية الذكاء الاصطناعي" : "AI autonomy level"}</span><select value={form.autonomyLevel} onChange={(event) => setForm({ ...form, autonomyLevel: event.target.value as ConnectionForm["autonomyLevel"] })}><option value="draft_only">{ar ? "مسودات فقط — موافقة بشرية دائماً" : "Draft only — human approval always"}</option><option value="scheduled">{ar ? "نشر المحتوى المعتمد تلقائياً" : "Auto-publish approved schedules"}</option><option value="guarded">{ar ? "ردود منخفضة المخاطر ضمن السياسة" : "Guarded low-risk responses"}</option></select></label>
                <label className="socials-field"><span>{ar ? "سياسة الموافقة" : "Approval policy"}</span><select value={form.approvalPolicy} onChange={(event) => setForm({ ...form, approvalPolicy: event.target.value as ConnectionForm["approvalPolicy"] })}><option value="always">{ar ? "موافقة على كل إجراء" : "Approve every action"}</option><option value="sensitive_only">{ar ? "موافقة على الإجراءات الحساسة" : "Approve sensitive actions"}</option><option value="policy_based">{ar ? "حسب سياسة مساحة العمل" : "Follow workspace policy"}</option></select></label>
                <label className="socials-field"><span>{ar ? "الاستخدام" : "Communication purpose"}</span><select value={form.communicationPurpose} onChange={(event) => setForm({ ...form, communicationPurpose: event.target.value as ConnectionForm["communicationPurpose"] })}><option value="both">{ar ? "العملاء الحاليون والمحتملون" : "Clients and leads"}</option><option value="leads">{ar ? "العملاء المحتملون" : "Leads only"}</option><option value="clients">{ar ? "العملاء الحاليون" : "Existing clients only"}</option></select></label>
                <label className="socials-field"><span>{ar ? "لغة التواصل" : "Default language"}</span><select value={form.defaultLanguage} onChange={(event) => setForm({ ...form, defaultLanguage: event.target.value as ConnectionForm["defaultLanguage"] })}><option value="both">{ar ? "العربية والإنجليزية" : "Arabic and English"}</option><option value="ar">العربية</option><option value="en">English</option></select></label>
                {["instagram", "facebook", "tiktok"].includes(selectedProvider.id) ? <label className="socials-field"><span>{ar ? "معرّف القناة في Postiz" : "Postiz integration ID"}</span><input value={form.postizIntegrationId} onChange={(event) => setForm({ ...form, postizIntegrationId: event.target.value })} placeholder={ar ? "من صفحة Integrations في Postiz" : "From Postiz Integrations"} /><small>{ar ? "يربط مسودات وصلة بالحساب الصحيح عند الجدولة." : "Routes approved Wasla drafts to the correct publishing account."}</small></label> : null}
              </div>
              <label className="socials-toggle"><input type="checkbox" checked={form.preferred} onChange={(event) => setForm({ ...form, preferred: event.target.checked })} /><span><strong>{ar ? "استخدم كمسار التواصل المفضل" : "Use as preferred communication route"}</strong><small>{ar ? "سيختار وصلة هذه القناة أولاً عندما تسمح السياسة." : "Wasla will prioritize this channel whenever workspace policy allows."}</small></span></label>
              <div className="socials-editor__policy"><ShieldCheck size={17} /><p>{ar ? "لن يرسل وصلة تواصلاً غير مرغوب فيه. يجب احترام الموافقات وسياسات المنصة، وتبدأ كل قناة بوضع المسودة الآمن." : "Wasla will not send unsolicited outreach. Consent and platform rules remain mandatory, and every channel starts in safe draft mode."}</p></div>
            </div>
            <footer><button type="button" onClick={closeEditor} disabled={saving}>{ar ? "إلغاء" : "Cancel"}</button><button className="is-primary" type="button" onClick={() => void saveConnection()} disabled={saving || !form.displayName.trim()}>{saving ? <RefreshCw size={16} className="is-spinning" /> : <PlugZap size={16} />}{editingConnection ? (ar ? "حفظ التغييرات" : "Save changes") : (ar ? "اتصال آمن" : "Connect securely")}</button></footer>
          </section>
        </div>,
        document.getElementById("wasla-modal-root") || document.body,
      ) : null}
    </div>
  );
}

function providerDescriptionAr(provider: SocialChannelProvider) {
  const descriptions: Record<SocialChannelProvider, string> = {
    postiz: "اربط مساحة النشر لاستيراد حساباتك وجدولة المحتوى المعتمد.",
    chatwoot: "اربط صندوق المحادثات لتجميع رسائل العملاء وصياغة الردود.",
    instagram: "انشر المحتوى، راقب التفاعل، وأدر الردود المعتمدة.",
    facebook: "اربط الصفحة للنشر والتعليقات والرسائل والتحليلات.",
    whatsapp: "تواصل مع العملاء الموافقين عبر القوالب وصندوق مشترك.",
    tiktok: "جهّز وانشر المقاطع المعتمدة مع تحليلات الحساب.",
    snapchat: "اربط الملف العام للمحتوى المدار وتحليلات الجمهور.",
    custom: "وجّه نشاط وصلة المعتمد إلى نقطة HTTPS خاصة بك.",
  };
  return descriptions[provider];
}

function autonomyLabel(level: SocialConnection["autonomy_level"], language: Language) {
  if (language === "en") return level === "guarded" ? "Guarded" : level === "scheduled" ? "Scheduled" : "Draft only";
  return level === "guarded" ? "محكومة" : level === "scheduled" ? "مجدولة" : "مسودة فقط";
}
