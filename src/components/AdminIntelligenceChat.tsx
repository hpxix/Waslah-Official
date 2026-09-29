import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { Bot, Database, LoaderCircle, MessageSquareText, Send, Sparkles, UserRound } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { apiErrorMessage, askAdminIntelligence } from "../lib/directus";
import type { AdminAccount, AdminIntelligenceMessage, AdminIntelligenceResponse } from "../lib/directus";
import { notify } from "../lib/notify";
import "./admin-intelligence.css";

type ChatEntry = AdminIntelligenceMessage & {
  id: string;
  evidence?: AdminIntelligenceResponse["evidence"];
  scopeLabel?: string;
};

export function AdminIntelligenceChat({ accounts, language }: { accounts: AdminAccount[]; language: "ar" | "en" }) {
  const ar = language === "ar";
  const [account, setAccount] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const selected = account || "dev@dev.com";
    return ar ? [
      `ماذا طلب حساب ${selected} وماذا نفذت وصلة؟`,
      `كم صفحة بحثت واجهاتنا لحساب ${selected}؟`,
      `ما نوع العملاء الذين استلمهم ${selected} ولماذا تأهلوا؟`,
      "ما الحملات المتوقفة أو التي لم تحقق العدد المطلوب؟",
    ] : [
      `What did ${selected} ask for, and what did Wasla execute?`,
      `How many result pages did our APIs search for ${selected}?`,
      `What kind of leads did ${selected} receive, and why did they qualify?`,
      "Which campaigns are stalled or below their requested lead count?",
    ];
  }, [account, ar]);

  async function sendMessage(value = draft) {
    const question = value.trim();
    if (!question || busy) return;
    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: "user", content: question };
    const nextMessages = [...messages, userEntry];
    setMessages(nextMessages);
    setDraft("");
    setBusy(true);
    queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    try {
      const transcript = nextMessages.slice(-12).map(({ role, content }) => ({ role, content }));
      const response = await askAdminIntelligence(question, transcript.slice(0, -1), account || undefined);
      const scopeLabel = response.scope.type === "account"
        ? response.scope.account?.email || account
        : ar ? "كل الحسابات" : "All accounts";
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.text,
        evidence: response.evidence,
        scopeLabel,
      }]);
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (error) {
      notify.danger(apiErrorMessage(error, ar ? "تعذر تحليل بيانات الإدارة." : "Could not analyze the admin data."));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return <section className="admin-intelligence" dir={ar ? "rtl" : "ltr"}>
    <header className="admin-intelligence__head">
      <div className="admin-intelligence__mark"><Sparkles size={20}/></div>
      <div>
        <span>{ar ? "ذكاء إداري مباشر" : "LIVE ADMIN INTELLIGENCE"}</span>
        <h2>{ar ? "اسأل وصلة عن أي حساب" : "Ask Wasla about any account"}</h2>
        <p>{ar ? "يفهم محادثات العميل، طلباته، جولات البحث، الصفحات، النتائج وأسباب التأهيل من السجل الفعلي." : "Understands client conversations, requests, search runs, pages, delivered leads, and qualification evidence from live records."}</p>
      </div>
      <label className="admin-intelligence__scope">
        <span>{ar ? "نطاق البيانات" : "DATA SCOPE"}</span>
        <select value={account} onChange={(event) => setAccount(event.target.value)}>
          <option value="">{ar ? "كل الحسابات" : "All accounts"}</option>
          {accounts.map((item) => <option key={item.user_id} value={item.email}>{item.email} · {item.organization_name}</option>)}
        </select>
      </label>
    </header>

    <div className="admin-intelligence__workspace">
      <div className="admin-intelligence__messages" aria-live="polite">
        {messages.length === 0 && <div className="admin-intelligence__empty">
          <div><Database size={24}/></div>
          <h3>{ar ? "السجل الكامل جاهز للسؤال" : "The full operational record is ready"}</h3>
          <p>{ar ? "اختر حساباً أو اذكر البريد داخل سؤالك. كل إجابة تُبنى من أحدث بيانات وصلة، وليست من ذاكرة عامة." : "Choose an account or mention its email in your question. Every answer is rebuilt from Wasla's latest records, not generic model memory."}</p>
          <div className="admin-intelligence__suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void sendMessage(suggestion)}>{suggestion}</button>)}</div>
        </div>}
        {messages.map((message) => <article key={message.id} className={`admin-intelligence__message is-${message.role}`}>
          <div className="admin-intelligence__avatar">{message.role === "assistant" ? <Bot size={17}/> : <UserRound size={17}/>}</div>
          <div className="admin-intelligence__bubble">
            <header><strong>{message.role === "assistant" ? (ar ? "محلل وصلة" : "Wasla analyst") : (ar ? "المشرف" : "Administrator")}</strong>{message.scopeLabel && <span>{message.scopeLabel}</span>}</header>
            <div className="admin-intelligence__markdown" dir="auto"><ReactMarkdown>{message.content}</ReactMarkdown></div>
            {message.evidence && <footer>
              <span>{message.evidence.b2c_campaigns} {ar ? "حملة" : "campaigns"}</span>
              <span>{message.evidence.pages_fetched} {ar ? "صفحة" : "pages"}</span>
              <span>{message.evidence.delivered_leads}/{message.evidence.requested_leads} {ar ? "عميل" : "leads"}</span>
            </footer>}
          </div>
        </article>)}
        {busy && <article className="admin-intelligence__message is-assistant">
          <div className="admin-intelligence__avatar"><Bot size={17}/></div>
          <div className="admin-intelligence__thinking"><LoaderCircle className="is-spinning" size={17}/><span>{ar ? "أراجع المحادثات والجولات والنتائج…" : "Reviewing conversations, runs, and results…"}</span></div>
        </article>}
        <div ref={bottomRef}/>
      </div>

      <form className="admin-intelligence__composer" onSubmit={submit}>
        <MessageSquareText size={19}/>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} rows={1} placeholder={ar ? "اسأل عن حساب، حملة، عدد الصفحات أو نوع العملاء…" : "Ask about an account, campaign, pages searched, or delivered leads…"}/>
        <button type="submit" disabled={busy || !draft.trim()} aria-label={ar ? "إرسال" : "Send"}><Send size={17}/></button>
      </form>
      <p className="admin-intelligence__note">{ar ? "الردود مبنية على بيانات الإدارة المباشرة. لا تُعرض مفاتيح أو رموز وصول." : "Answers use live admin records. Credentials and access tokens are never exposed."}</p>
    </div>
  </section>;
}
