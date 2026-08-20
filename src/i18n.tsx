/* eslint-disable react-refresh/only-export-components */
import { Languages } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Language = "ar" | "en";

const messages: Record<string, Record<Language, string>> = {
  "nav.agent": { ar: "محادثة جديدة", en: "New chat" },
  "nav.workflow": { ar: "آلية العمل", en: "Workflow" },
  "nav.workspace": { ar: "مساحة العملاء", en: "Client workspace" },
  "nav.login": { ar: "دخول", en: "Sign in" },
  "nav.start": { ar: "ابدأ مجاناً", en: "Start free" },
  "nav.open": { ar: "فتح المساحة", en: "Open workspace" },
  "landing.live": { ar: "وكيل العملاء يعمل الآن", en: "Lead agent is live" },
  "landing.title": { ar: "وكيل وصلة للعملاء", en: "Wasla Lead Agent" },
  "landing.description": { ar: "صف لنا العميل الذي تبحث عنه. وصلة تجمع، تنقّي، تتصل، وتعرض لك الفرص المؤهلة في مساحة واحدة.", en: "Describe the buyer you need. Wasla sources, cleans, calls, and delivers qualified opportunities in one workspace." },
  "landing.listening": { ar: "وصلة تستمع", en: "Wasla is listening" },
  "landing.noForm": { ar: "اكتب بطريقتك، لا تحتاج نموذجاً طويلاً", en: "Write naturally. No long form required." },
  "landing.example": { ar: "مثال يمكنك تجربته", en: "Try this example" },
  "landing.placeholder": { ar: "صف العميل أو السوق الذي تبحث عنه...", en: "Describe the buyer or market you need..." },
  "landing.protected": { ar: "بيانات محمية", en: "Protected data" },
  "landing.credit": { ar: "30 ر.س بعد توثيق الجوال", en: "30 SAR after phone verification" },
  "landing.qualified": { ar: "مؤهل قبل الكشف", en: "Qualified before reveal" },
  "workflow.eyebrow": { ar: "من السؤال إلى الفرصة", en: "From question to opportunity" },
  "workflow.title": { ar: "ست مراحل. قرار واحد أوضح.", en: "Six stages. One clearer decision." },
  "workflow.body": { ar: "تشاهد مسار كل طلب وسبب تأهيل كل عميل، بينما يحتفظ Directus بالسجل الكامل والصلاحيات.", en: "See every request stage and why each lead qualified, while Directus preserves the full record and permissions." },
  "auth.storyKicker": { ar: "مساحة عمل مبنية للنتيجة", en: "A workspace built for outcomes" },
  "auth.storyTitle": { ar: "من وصف العميل إلى محادثة مؤهلة.", en: "From buyer description to qualified conversation." },
  "auth.storyBody": { ar: "وصلة تحفظ كل طلب في Directus، تشغّل مسار البحث والتأهيل، وتعرض لفريقك سبب الترشيح قبل كشف بيانات التواصل.", en: "Wasla stores every request in Directus, runs sourcing and qualification, and shows why a lead fits before revealing contact details." },
  "auth.step1": { ar: "تصف العميل", en: "Describe buyer" },
  "auth.step2": { ar: "نتحقق ونتصل", en: "Verify and call" },
  "auth.step3": { ar: "تستلم المؤهل", en: "Receive qualified" },
  "auth.secure": { ar: "بياناتك معزولة داخل مساحة شركتك", en: "Your data is isolated inside your company workspace" },
  "auth.begin": { ar: "ابدأ مجاناً", en: "Start free" },
  "auth.welcome": { ar: "مرحباً بعودتك", en: "Welcome back" },
  "auth.createTitle": { ar: "أنشئ مساحة شركتك", en: "Create your company workspace" },
  "auth.loginTitle": { ar: "ادخل إلى مساحة وصلة", en: "Sign in to Wasla" },
  "auth.createBody": { ar: "لا بطاقة بنكية. وثّق جوالك واحصل على 30 ر.س لبدء أول طلب.", en: "No card required. Verify your phone and receive 30 SAR to launch your first request." },
  "auth.loginBody": { ar: "أكمل من حيث توقفت، بنفس الطلبات والرصيد والفريق.", en: "Continue with the same requests, wallet, and team." },
  "auth.signup": { ar: "حساب جديد", en: "Create account" },
  "auth.signin": { ar: "تسجيل الدخول", en: "Sign in" },
  "auth.name": { ar: "الاسم الكامل", en: "Full name" },
  "auth.company": { ar: "اسم الشركة", en: "Company name" },
  "auth.phone": { ar: "رقم الجوال السعودي", en: "Saudi mobile number" },
  "auth.email": { ar: "البريد الإلكتروني للعمل", en: "Work email" },
  "auth.password": { ar: "كلمة المرور", en: "Password" },
  "auth.createButton": { ar: "إنشاء مساحة العمل", en: "Create workspace" },
  "auth.loginButton": { ar: "دخول آمن", en: "Secure sign in" },
  "auth.socialDivider": { ar: "أو استخدم البريد الإلكتروني", en: "Or use email" },
  "auth.google": { ar: "المتابعة باستخدام Google", en: "Continue with Google" },
  "auth.microsoft": { ar: "Microsoft", en: "Microsoft" },
  "auth.apple": { ar: "Apple", en: "Apple" },
  "auth.socialFinish": { ar: "أكمل مساحة شركتك", en: "Complete your workspace" },
  "auth.socialBody": { ar: "تم توثيق هويتك. أضف بيانات الشركة والجوال لننشئ مساحة وصلة ونرسل رمز التحقق.", en: "Your identity is confirmed. Add your company and phone so we can create your Wasla workspace and send a verification code." },
  "auth.socialButton": { ar: "إنشاء المساحة وإرسال الرمز", en: "Create workspace and send code" },
  "auth.lastStep": { ar: "خطوة أخيرة", en: "One last step" },
  "auth.verifyTitle": { ar: "وثّق رقم جوالك", en: "Verify your phone" },
  "auth.verifyBody": { ar: "أرسلنا رمزاً إلى رقمك. يمنع التحقق الحسابات الوهمية ويحمي جودة شبكة وصلة.", en: "We sent a code to your number. Verification prevents fake accounts and protects the Wasla network." },
  "auth.code": { ar: "رمز التحقق", en: "Verification code" },
  "auth.verifyButton": { ar: "توثيق وتفعيل 30 ر.س", en: "Verify and activate 30 SAR" },
  "auth.resend": { ar: "إرسال رمز جديد", en: "Send a new code" },
  "console.overview": { ar: "نظرة عامة", en: "Overview" },
  "console.leads": { ar: "العملاء", en: "Leads" },
  "console.insights": { ar: "الرؤى", en: "Insights" },
  "console.proposals": { ar: "العروض", en: "Proposals" },
  "console.emails": { ar: "الرسائل", en: "Emails" },
  "console.agent": { ar: "ابدأ محادثة جديدة", en: "Start a new chat" },
  "console.agentTitle": { ar: "من تريد أن نتواصل معه؟", en: "Who should we reach?" },
  "console.agentBody": { ar: "ابدأ بوصف بسيط. سنثبت المعايير قبل تشغيل البحث والاتصال.", en: "Start with a simple description. We confirm criteria before sourcing or calling." },
  "console.analyze": { ar: "تحليل الطلب", en: "Analyze request" },
  "console.run": { ar: "تشغيل المهمة", en: "Run mission" },
  "console.createToRun": { ar: "أنشئ حساباً للتشغيل", en: "Create account to run" },
  "console.readiness": { ar: "جاهزية المهمة", en: "Mission readiness" },
  "console.model": { ar: "نموذج التشغيل المباشر", en: "LIVE OPERATING MODEL" },
  "console.modelTitle": { ar: "من سؤال عن السوق إلى محادثة مؤهلة.", en: "From a market question to a qualified conversation." },
  "console.modelBody": { ar: "يُحفظ كل طلب في Directus، ويثريه الوكيل، ولا تُكشف البيانات إلا عندما تكون مفيدة لفريقك.", en: "Every request is stored in Directus, enriched by the agent, and revealed only when useful to your team." },
  "console.systemsReady": { ar: "الأنظمة جاهزة", en: "Systems ready" },
  "empty.new": { ar: "مساحة جديدة", en: "New workspace" },
  "empty.title": { ar: "أطلق أول مهمة لوكيل وصلة.", en: "Launch your first Wasla mission." },
  "empty.body": { ar: "صف السوق وصانع القرار. سنحوّل كلامك إلى طلب محفوظ، ثم نبحث ونتحقق ونتصل قبل أن نعرض لك العميل المؤهل.", en: "Describe the market and decision maker. We turn it into a stored request, then source, verify, and call before presenting a qualified lead." },
  "empty.start": { ar: "ابدأ بأول طلب", en: "Start first request" },
};

type LanguageContextValue = {
  language: Language;
  direction: "rtl" | "ltr";
  setLanguage: (language: Language) => void;
  isTransitioning: boolean;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem("wasla:language") === "en" ? "en" : "ar");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const direction = language === "ar" ? "rtl" : "ltr";

  const changeLanguage = useCallback((nextLanguage: Language) => {
    if (nextLanguage === language || isTransitioning) return;
    setIsTransitioning(true);
    window.setTimeout(() => {
      setLanguage(nextLanguage);
      window.setTimeout(() => setIsTransitioning(false), 150);
    }, 120);
  }, [isTransitioning, language]);

  useEffect(() => {
    window.localStorage.setItem("wasla:language", language);
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  useEffect(() => {
    document.documentElement.classList.toggle("is-language-switching", isTransitioning);
    return () => document.documentElement.classList.remove("is-language-switching");
  }, [isTransitioning]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    direction,
    setLanguage: changeLanguage,
    isTransitioning,
    t: (key) => messages[key]?.[language] ?? key,
  }), [changeLanguage, direction, isTransitioning, language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageToggle({ inverse = false }: { inverse?: boolean }) {
  const { isTransitioning, language, setLanguage } = useLanguage();
  return (
    <div className={`language-toggle${inverse ? " is-inverse" : ""}`} role="group" aria-label={language === "ar" ? "تغيير اللغة" : "Change language"}>
      <Languages size={14} />
      <button className={language === "ar" ? "active" : ""} onClick={() => setLanguage("ar")} disabled={isTransitioning}>ع</button>
      <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} disabled={isTransitioning}>EN</button>
    </div>
  );
}
