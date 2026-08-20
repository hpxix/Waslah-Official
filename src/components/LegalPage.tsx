import { ArrowLeft, ArrowRight, Check, Database, Eye, LockKeyhole, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Link } from "react-router";
import { LanguageToggle, useLanguage } from "../i18n";
import { WaslaBrand } from "./WaslaBrand";

type LegalPageProps = {
  page: "privacy" | "permissions";
};

const effectiveDate = "20 August 2026";

export function LegalPage({ page }: LegalPageProps) {
  const { direction, language } = useLanguage();
  const privacy = page === "privacy";
  const ar = language === "ar";

  const sections = privacy
    ? [
        { icon: Database, title: ar ? "البيانات التي نجمعها" : "Data we collect", body: ar ? "بيانات الحساب والشركة ورقم الجوال، وطلبات البحث، والعملاء المحتملون الذين تتم معالجتهم داخل مساحة العمل، وسجلات الاستخدام والأمان اللازمة لتشغيل الخدمة." : "Account, company, and phone details; search requests; leads processed in your workspace; and the usage and security records required to operate the service." },
        { icon: Eye, title: ar ? "كيف نستخدم البيانات" : "How we use data", body: ar ? "نستخدم البيانات لإنشاء مساحة العمل، وتنفيذ البحث والإثراء والتأهيل، ومنع إساءة الاستخدام، وتحسين موثوقية المنتج، وتقديم الدعم المطلوب." : "We use data to create your workspace, perform sourcing, enrichment and qualification, prevent abuse, improve product reliability, and provide requested support." },
        { icon: LockKeyhole, title: ar ? "الحفظ والمشاركة" : "Storage and sharing", body: ar ? "تُحفظ بيانات التشغيل في Directus والبنية المرتبطة بالخدمة. لا نبيع بياناتك. لا نشاركها إلا مع مزودي الخدمة اللازمين لتنفيذ الميزات التي تختارها أو عندما يقتضي النظام ذلك." : "Operational data is stored in Directus and the infrastructure connected to the service. We do not sell your data. We share it only with providers needed for features you choose or when legally required." },
        { icon: UserRoundCheck, title: ar ? "خياراتك وحقوقك" : "Your choices and rights", body: ar ? "يمكنك طلب نسخة من بيانات حسابك أو تصحيحها أو حذفها، وسحب الموافقات الاختيارية، والتواصل معنا بشأن أي استفسار متعلق بالخصوصية." : "You can request a copy, correction, or deletion of your account data, withdraw optional consent, and contact us with any privacy question." },
      ]
    : [
        { icon: Database, title: ar ? "بيانات العملاء المحتملين" : "Lead data", body: ar ? "تسمح لوصلة بحفظ العملاء المحتملين الذين تطلب جمعهم وإثراءهم داخل مساحة شركتك، وإظهارهم فقط للمستخدمين المخولين في تلك المساحة." : "You allow Wasla to store the leads you request to source and enrich inside your company workspace and show them only to authorized workspace users." },
        { icon: Eye, title: ar ? "المصادر والإثراء" : "Sources and enrichment", body: ar ? "تسمح للخدمة بالبحث في المصادر المفعلة، ودمج السجلات، والتحقق من معلومات الشركات والأفراد، وحساب درجة الملاءمة والإثراء." : "You allow the service to search enabled sources, merge records, verify company and person information, and calculate fit and enrichment scores." },
        { icon: UserRoundCheck, title: ar ? "التواصل والتأهيل" : "Outreach and qualification", body: ar ? "لن تبدأ مكالمة أو رسالة أو حملة إلا عند طلبك أو إعدادك لها. أنت مسؤول عن التأكد من وجود أساس مناسب ومحتوى مشروع لأي تواصل." : "A call, message, or campaign starts only when you request or configure it. You are responsible for ensuring an appropriate basis and lawful content for outreach." },
        { icon: LockKeyhole, title: ar ? "صلاحيات الحساب" : "Account permissions", body: ar ? "تسمح لنا باستخدام بيانات حسابك للمصادقة، وحماية الجلسة، وعزل مساحة شركتك، وتسجيل أحداث الأمان. لا تمنح الموافقة وصولاً عاماً إلى بياناتك." : "You allow us to use account data for authentication, session protection, workspace isolation, and security logging. Acceptance does not grant public access to your data." },
      ];

  return (
    <main className="legal-page" dir={direction}>
      <header className="legal-page__header">
        <Link to="/" aria-label={ar ? "العودة إلى وصلة" : "Back to Wasla"}><WaslaBrand variant="horizontal" /></Link>
        <div className="legal-page__actions"><LanguageToggle /><Link className="legal-page__account" to="/auth">{ar ? "إنشاء حساب" : "Create account"}</Link></div>
      </header>

      <section className="legal-page__hero">
        <div className="legal-page__eyebrow"><ShieldCheck size={16} /> {ar ? "الثقة والشفافية" : "Trust and transparency"}</div>
        <h1>{privacy ? (ar ? "سياسة الخصوصية" : "Privacy Policy") : (ar ? "صفحة الصلاحيات" : "Permissions")}</h1>
        <p>{privacy
          ? (ar ? "شرح واضح للبيانات التي تعالجها وصلة، وسبب استخدامها، وكيف تبقى تحت سيطرتك." : "A clear account of the data Wasla processes, why it is used, and how it remains under your control.")
          : (ar ? "الصلاحيات اللازمة لتشغيل وكيل العملاء المحتملين وما الذي يحدث عند تفعيل كل إجراء." : "The permissions needed to operate the lead agent and what happens when each action is enabled.")}</p>
        <span>{ar ? `سارية من ${effectiveDate}` : `Effective ${effectiveDate}`}</span>
      </section>

      <section className="legal-page__content">
        <div className="legal-page__summary">
          <strong>{ar ? "باختصار" : "In short"}</strong>
          <p>{privacy
            ? (ar ? "بيانات مساحة شركتك خاصة، ولا نبيعها. نستخدم الحد الأدنى اللازم لتشغيل الميزات التي تختارها." : "Your workspace data is private and is not sold. We use the minimum needed to operate the features you choose.")
            : (ar ? "الموافقة لا تبدأ تواصلاً تلقائياً ولا تكشف بياناتك للعامة. أنت تختار متى يعمل الوكيل وماذا ينفذ." : "Acceptance does not start automatic outreach or expose your data publicly. You choose when the agent runs and what it performs.")}</p>
        </div>
        <div className="legal-page__sections">
          {sections.map(({ icon: Icon, title, body }) => <article key={title}><Icon size={20} /><div><h2>{title}</h2><p>{body}</p></div></article>)}
        </div>
        <div className="legal-page__contact">
          <Check size={18} />
          <div><strong>{ar ? "لديك سؤال؟" : "Have a question?"}</strong><p>{ar ? "تواصل معنا على privacy@wasla.sa قبل إنشاء الحساب أو في أي وقت بعده." : "Contact us at privacy@wasla.sa before creating an account or at any time afterward."}</p></div>
        </div>
      </section>

      <footer className="legal-page__footer">
        <Link to={privacy ? "/permissions" : "/privacy"}>{privacy ? (ar ? "قراءة الصلاحيات" : "Read Permissions") : (ar ? "قراءة سياسة الخصوصية" : "Read Privacy Policy")}</Link>
        <Link to="/auth">{ar ? "متابعة إنشاء الحساب" : "Continue to account creation"} {ar ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</Link>
      </footer>
    </main>
  );
}
