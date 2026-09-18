import {
  ArrowLeft, ArrowRight, Bot, Check, Database, Eye, Globe2, LockKeyhole,
  MegaphoneOff, Scale, ShieldCheck, TimerReset, UserRoundCheck, UsersRound,
} from "lucide-react";
import { Link } from "react-router";
import { LanguageToggle, useLanguage } from "../i18n";
import { WaslaBrand } from "./WaslaBrand";

type LegalPageProps = { page: "privacy" | "permissions" };
type LegalSection = { icon: typeof Database; title: string; body: string; points?: string[] };

const effectiveDate = "18 September 2026";
const privacyEmail = "privacy@wasla.sa";

export function LegalPage({ page }: LegalPageProps) {
  const { direction, language } = useLanguage();
  const privacy = page === "privacy";
  const ar = language === "ar";

  const privacySections: LegalSection[] = [
    {
      icon: Scale,
      title: ar ? "1. من يتحكم في البيانات ونطاق هذه السياسة" : "1. Controller and scope",
      body: ar
        ? "وصلة للذكاء الاصطناعي (\"وصلة\") هي الجهة المشغلة للخدمة وجهة التحكم في بيانات الحساب والتشغيل التي تحدد أغراض معالجتها. قد تعمل وصلة كجهة معالجة نيابةً عن عميلها عندما تنفذ تعليماته الموثقة داخل مساحة العمل. تنطبق هذه السياسة على موقع وصلة، ومساحة العمل، ووكيل العملاء، وميزات البحث والإثراء والتواصل المتصلة بها."
        : "Wasla AI (\"Wasla\") operates the service and acts as controller for account and operational data whose purposes it determines. Wasla may act as a processor for a customer when processing data solely on that customer's documented instructions inside its workspace. This notice covers the Wasla website, workspace, lead agent, research, enrichment, and connected outreach features.",
      points: [
        ar ? `قناة الخصوصية وطلبات الحقوق: ${privacyEmail}` : `Privacy and rights-request channel: ${privacyEmail}`,
        ar ? "لا تمثل هذه السياسة موافقةً على التسويق نيابةً عن أي صاحب بيانات." : "This notice does not constitute marketing consent on behalf of any data subject.",
      ],
    },
    {
      icon: Database,
      title: ar ? "2. البيانات التي نعالجها" : "2. Data we process",
      body: ar ? "نعالج الحد الأدنى الذي يلزم لتشغيل الميزة التي يختارها المستخدم، وقد يشمل ما يلي:" : "We process the minimum information reasonably required for the feature selected by the user, which may include:",
      points: [
        ar ? "بيانات الحساب والشركة: الاسم، بريد العمل، رقم الجوال، الشركة، اللغة، العضوية وسجل الموافقات." : "Account and business data: name, work email, mobile number, company, language, membership, and consent records.",
        ar ? "بيانات طلبات العملاء: وصف الجمهور، الموقع، القطاع، المنتج، أهداف الشراء أو البيع، وعدد النتائج." : "Lead-request data: audience description, location, industry, product, buy/sell objective, and requested quantity.",
        ar ? "بيانات العملاء المحتملين: الاسم أو اسم النشاط، الصفة المهنية، المدينة، وسائل التواصل، الروابط العامة، مصدر السجل، إشارات الملاءمة وتاريخ التحقق." : "Prospect data: person or business name, professional role, city, contact details, public links, record source, relevance signals, and verification date.",
        ar ? "بيانات التشغيل والأمان: سجلات الدخول، الطلبات، الأخطاء، التدقيق، الرصيد، المعاملات، وإجراءات المشرفين." : "Operational and security data: authentication, requests, errors, audits, credits, transactions, and administrator actions.",
        ar ? "بيانات المحتوى والتواصل عند تفعيلها: محادثات، مسودات، ردود، نتائج مكالمات، ملخصات أو تسجيلات عندما تكون الميزة مفعلة ومسموحاً بها نظاماً." : "Content and outreach data when enabled: conversations, drafts, replies, call outcomes, summaries, or recordings where the feature is enabled and legally permitted.",
      ],
    },
    {
      icon: Eye,
      title: ar ? "3. مصادر البيانات" : "3. Sources of data",
      body: ar
        ? "قد نحصل على البيانات مباشرة من مستخدم الحساب، أو من مصادر أعمال متاحة للعموم تم الوصول إليها بصورة نظامية، أو من مزودي بيانات وتكاملات يفعّلها العميل، أو من بيانات يرفعها العميل إلى مساحته. نسجل المصدر أو المرجع المتاح وتاريخ الجمع أو التحديث حيثما كان ذلك ممكناً. وجود البيانات في مصدر عام لا يعني أن صاحبها وافق على تلقي التسويق المباشر."
        : "Data may come directly from an account user, lawfully accessed public business sources, providers and integrations enabled by the customer, or information uploaded by the customer. Where reasonably possible, we record the available source or reference and the collection or refresh date. Public availability does not mean that the person has consented to direct marketing.",
    },
    {
      icon: ShieldCheck,
      title: ar ? "4. الأغراض والمسوغات النظامية" : "4. Purposes and legal bases",
      body: ar
        ? "نعالج البيانات لأغراض محددة تشمل إنشاء الحساب، تنفيذ طلب البحث، إزالة التكرار، التحقق والإثراء، ترتيب الملاءمة، توفير السجل المطلوب للعميل، حماية الخدمة، منع الاحتيال، إدارة الرصيد، تقديم الدعم، والوفاء بالالتزامات النظامية. يعتمد المسوغ النظامي على العملية وقد يكون تنفيذ العقد، أو الموافقة، أو الالتزام النظامي، أو المصلحة المشروعة بعد توثيق موازنة الضرورة والتناسب وحقوق صاحب البيانات. لا نستخدم المصلحة المشروعة لمعالجة البيانات الحساسة."
        : "We process data for defined purposes including account creation, executing a requested search, deduplication, verification and enrichment, relevance ranking, delivering requested records, securing the service, preventing fraud, administering credits, providing support, and meeting legal obligations. The applicable legal basis depends on the activity and may include contract performance, consent, legal obligation, or legitimate interests following a documented necessity, proportionality, and rights-balancing assessment. We do not rely on legitimate interests for sensitive data.",
    },
    {
      icon: UsersRound,
      title: ar ? "5. الكشف عن بيانات العملاء المحتملين" : "5. Disclosure of prospect data",
      body: ar
        ? "عندما تعرض وصلة سجلاً محدداً لمستخدم مخول في مساحة عميل، فهذا يعد كشفاً للبيانات. تقيد وصلة الوصول بمساحة العميل وطلبه والغرض المسموح، وتستخدم إخفاء الحقول أو منح الوصول عند توفرها. لا تمنح وصلة العميل حقاً غير محدود في إعادة البيع أو إعادة النشر أو التصدير أو التواصل غير المشروع، ولا يعني الوصول إلى السجل وجود إذن بالتسويق إليه."
        : "When Wasla makes an identifiable record available to an authorized workspace user, that is a disclosure of data. Wasla limits access by workspace, request, and permitted purpose and uses field masking or access grants where available. Access does not create an unrestricted right to resell, republish, export, or unlawfully contact a person, and it does not mean the person has consented to marketing.",
    },
    {
      icon: MegaphoneOff,
      title: ar ? "6. التسويق المباشر والانسحاب" : "6. Direct marketing and opt-out",
      body: ar
        ? "لا يُعد إدراج شخص في نتائج وصلة موافقةً منه على التسويق. يتحمل العميل مسؤولية التحقق من وجود الموافقة أو المسوغ النظامي المطلوب قبل أي رسالة أو اتصال أو حملة. وعندما تنفذ وصلة تواصلاً بالنيابة عن العميل، يجب أن يكون المرسل معروفاً بوضوح، وأن تتوفر آلية سهلة ومجانية لإيقاف الرسائل، وأن يتوقف التواصل دون تأخير عند سحب الموافقة أو الاعتراض. لا يجوز استخدام وصلة للرسائل المزعجة أو الحملات العشوائية."
        : "A person's inclusion in Wasla results is not that person's consent to marketing. The customer must establish the consent or other permission required by law before any message, call, or campaign. Where Wasla performs outreach for a customer, the sender must be clearly identified, an easy and free opt-out must be provided, and outreach must stop without undue delay when consent is withdrawn or an objection is received. Wasla must not be used for spam or indiscriminate campaigns.",
    },
    {
      icon: Bot,
      title: ar ? "7. الذكاء الاصطناعي والترتيب الآلي" : "7. AI and automated ranking",
      body: ar
        ? "تستخدم وصلة أنظمة آلية لفهم الطلب، دمج الإشارات، إزالة التكرار، اقتراح الجمهور، حساب الملاءمة وصياغة التوصيات. هذه النتائج احتمالية وقد تكون غير دقيقة ولا تعد قراراً قانونياً أو ائتمانياً أو وظيفياً. يجب على المستخدم مراجعة النتائج قبل اتخاذ إجراء. لا تسمح وصلة باستخدام الخدمة لاتخاذ قرارات مؤثرة بالكامل بصورة آلية عن الأفراد أو لاستنتاج بيانات حساسة."
        : "Wasla uses automated systems to interpret requests, combine signals, deduplicate records, suggest audiences, score relevance, and draft recommendations. Outputs are probabilistic, may be inaccurate, and are not legal, credit, employment, or eligibility decisions. Users must review outputs before acting. Wasla must not be used for fully automated high-impact decisions about individuals or to infer sensitive data.",
    },
    {
      icon: Globe2,
      title: ar ? "8. المستلمون والنقل خارج المملكة" : "8. Recipients and international transfers",
      body: ar
        ? "قد نشارك الحد الأدنى اللازم مع مزودي الاستضافة والبنية السحابية والبحث والإثراء والذكاء الاصطناعي والاتصال والنشر والدعم الذين يساعدون في تقديم الميزة المختارة، أو مع الجهات المختصة عند وجود التزام نظامي. قبل نقل البيانات الشخصية إلى خارج المملكة، نحدد موقع المعالجة ونقيّم المتطلبات النظامية ونطبق الضمانات المناسبة، مثل البنود التعاقدية القياسية أو غيرها من الآليات المعتمدة، بحسب الحالة."
        : "We may share the minimum necessary information with hosting, infrastructure, search, enrichment, AI, calling, publishing, and support providers needed for a selected feature, or with competent authorities where legally required. Before transferring personal data outside Saudi Arabia, we identify the processing location, assess applicable requirements, and apply appropriate safeguards—such as approved standard contractual clauses or another recognized mechanism—where required.",
    },
    {
      icon: TimerReset,
      title: ar ? "9. الاحتفاظ والإتلاف" : "9. Retention and destruction",
      body: ar
        ? "نحتفظ بالبيانات فقط للمدة اللازمة للغرض المحدد، أو لتنفيذ العقد، أو للوفاء بمتطلب نظامي، أو لإثبات المعاملات والحقوق. تختلف المدة حسب نوع السجل والمصدر والعقد. عند انتهاء الغرض أو قبول طلب الإتلاف، نحذف البيانات أو نخفي هويتها بصورة آمنة، ونطلب من الجهات التي كُشف لها عنها تنفيذ ما يلزم، مع مراعاة النسخ الاحتياطية والالتزامات النظامية المشروعة."
        : "We retain data only for as long as necessary for the stated purpose, contract performance, a legal obligation, or the establishment and protection of transactions and rights. The period varies by record type, source, and contract. When the purpose ends or a valid destruction request is accepted, we securely delete or irreversibly anonymize the data and request appropriate action from recipients, subject to lawful backup and retention requirements.",
    },
    {
      icon: LockKeyhole,
      title: ar ? "10. أمن البيانات وحوادث التسرب" : "10. Security and breach response",
      body: ar
        ? "نطبق ضوابط تنظيمية وتقنية بحسب المخاطر، تشمل المصادقة، عزل مساحات العملاء، تقييد الصلاحيات، حماية مفاتيح المزودين، تشفير بيانات الاعتماد المدعومة، إخفاء الأسرار، سجلات التدقيق، والتحقق من طلبات التكامل. لا يوجد نظام آمن بصورة مطلقة. نقيم الحوادث، ونحتويها، ونوثقها، ونشعر الجهة المختصة وأصحاب البيانات عندما يوجب النظام ذلك."
        : "We apply risk-based organizational and technical controls including authentication, workspace isolation, restricted permissions, provider-key protection, supported credential encryption, secret masking, audit logs, and integration-request verification. No system is absolutely secure. We assess, contain, and document incidents and notify the competent authority and affected individuals where legally required.",
    },
    {
      icon: UserRoundCheck,
      title: ar ? "11. حقوق أصحاب البيانات" : "11. Data-subject rights",
      body: ar
        ? `وفقاً للنظام، قد يكون لصاحب البيانات الحق في العلم، والوصول، والحصول على نسخة، والتصحيح، والإتلاف، والعدول عن الموافقة. يمكن تقديم الطلب إلى ${privacyEmail}. نتحقق من الهوية ونوثق الطلب ونرد عادةً خلال ثلاثين يوماً، ويجوز التمديد وفق ما يسمح به النظام مع إشعار مقدم الطلب. قد نرفض أو نقيد الطلب عندما يسمح النظام بذلك، مع بيان السبب.`
        : `Subject to applicable law, a person may have rights to be informed, access data, obtain a copy, correct data, request destruction, and withdraw consent. Requests may be submitted to ${privacyEmail}. We verify identity, document the request, and ordinarily respond within 30 days; an extension may be used where legally permitted and communicated to the requester. A request may be restricted or refused where the law permits, with reasons provided.`,
      points: [
        ar ? "لطلب إيقاف التسويق، اذكر رقم الجوال أو البريد المستخدم في التواصل حتى نتمكن من إضافته إلى سجل المنع." : "For a marketing opt-out, identify the phone number or email used for outreach so it can be added to the suppression record.",
        ar ? "يمكن تقديم شكوى إلى سدايا أو الجهة المختصة وفق القنوات الرسمية المتاحة." : "A complaint may be submitted to SDAIA or the competent authority through its official channels.",
      ],
    },
    {
      icon: Check,
      title: ar ? "12. القيود والتحديثات" : "12. Limits and updates",
      body: ar
        ? "لا تسمح وصلة عمداً بمعالجة البيانات الحساسة لأغراض التسويق، ولا تستهدف الأطفال، ولا تضمن أن كل استخدام يقوم به العميل سيكون مشروعاً. على العميل استخدام الخدمة وفق النظام والعقد والتعليمات. قد نحدث هذه السياسة عند تغير الخدمة أو المتطلبات النظامية، وسنبيّن تاريخ السريان ونقدم إشعاراً مناسباً عند حدوث تغيير جوهري. تصميم الخدمة لدعم الالتزام لا يشكل شهادة أو ضماناً بالالتزام لكل استخدام."
        : "Wasla does not knowingly permit sensitive data to be processed for marketing, does not target children, and cannot guarantee that every customer use will be lawful. Customers must use the service in accordance with law, contract, and documented instructions. We may update this notice when the service or legal requirements change, will show the effective date, and will provide appropriate notice of material changes. Designing the service to support compliance is not a certification or guarantee that every use is compliant.",
    },
  ];

  const permissionsSections: LegalSection[] = [
    { icon: Database, title: ar ? "بيانات العملاء المحتملين" : "Lead data", body: ar ? "تسمح لوصلة بمعالجة طلبات البحث والنتائج داخل مساحة شركتك للأغراض التي اخترتها فقط. لا تمنح هذه الموافقة وصلة أو مستخدميها حقاً عاماً في التسويق للأفراد." : "You authorize Wasla to process search requests and results inside your workspace only for the purposes you select. This acceptance does not grant Wasla or its users a general right to market to individuals." },
    { icon: Eye, title: ar ? "المصادر والإثراء" : "Sources and enrichment", body: ar ? "تسمح بالبحث في المصادر المفعلة، ودمج السجلات، وإزالة التكرار، والتحقق من معلومات الأعمال، وإنتاج درجات وتوصيات خاضعة للمراجعة البشرية." : "You authorize searching enabled sources, merging and deduplicating records, verifying business information, and producing scores and recommendations subject to human review." },
    { icon: MegaphoneOff, title: ar ? "التواصل يحتاج إذناً مستقلاً" : "Outreach requires separate permission", body: ar ? "يجب ألا تبدأ أي رسالة أو اتصال أو حملة إلا بعد التأكد من توفر الموافقة والمسوغ النظامي المطلوبين. إدراج العميل المحتمل في النتائج أو توفر رقمه لا يعني موافقته على التسويق." : "No message, call, or campaign may begin until the required consent and legal permission have been established. A lead's inclusion in results or the availability of a phone number is not marketing consent." },
    { icon: UserRoundCheck, title: ar ? "مسؤوليات العميل" : "Customer responsibilities", body: ar ? "يلتزم العميل بعدم إعادة بيع البيانات أو نشرها أو استخدامها للرسائل المزعجة، وباحترام طلبات الانسحاب والتصحيح والإتلاف، وتأمين حساباته، وتقييد الوصول على الموظفين المخولين، والالتزام بنظام حماية البيانات الشخصية والأنظمة ذات العلاقة." : "The customer must not resell, republish, or use data for spam; must honor opt-out, correction, and destruction requests; must secure its accounts and limit access to authorized personnel; and must comply with the PDPL and other applicable rules." },
    { icon: LockKeyhole, title: ar ? "تعليق الاستخدام غير المشروع" : "Suspension of unlawful use", body: ar ? "يجوز لوصلة تقييد ميزة أو تعليق حساب أو منع تصدير أو تواصل عندما توجد مؤشرات معقولة على إساءة الاستخدام أو مخالفة النظام أو حقوق أصحاب البيانات، مع الاحتفاظ بالسجلات اللازمة للتحقيق وإثبات الامتثال." : "Wasla may restrict a feature, suspend an account, or block export or outreach where there are reasonable indicators of misuse, legal violations, or interference with data-subject rights, while retaining records necessary for investigation and compliance evidence." },
  ];

  const sections = privacy ? privacySections : permissionsSections;

  return (
    <main className="legal-page" dir={direction}>
      <header className="legal-page__header">
        <Link to="/" aria-label={ar ? "العودة إلى وصلة" : "Back to Wasla"}><WaslaBrand variant="horizontal" /></Link>
        <div className="legal-page__actions"><LanguageToggle /><Link className="legal-page__account" to="/auth">{ar ? "إنشاء حساب" : "Create account"}</Link></div>
      </header>
      <section className="legal-page__hero">
        <div className="legal-page__eyebrow"><ShieldCheck size={16} /> {ar ? "الخصوصية والشفافية" : "PRIVACY & TRANSPARENCY"}</div>
        <h1>{privacy ? (ar ? "سياسة الخصوصية" : "Privacy Policy") : (ar ? "صلاحيات استخدام وكيل العملاء" : "Lead Agent Permissions")}</h1>
        <p>{privacy
          ? (ar ? "توضح هذه السياسة كيف تجمع وصلة البيانات الشخصية وتستخدمها وتكشف عنها وتحميها، وكيف يمكن لأصحاب البيانات ممارسة حقوقهم." : "This notice explains how Wasla collects, uses, discloses, protects, and retains personal data and how individuals can exercise their rights.")
          : (ar ? "تحدد هذه الصفحة ما تسمح لوصلة بتنفيذه، وما لا تمثله موافقتك، والتزاماتك عند استخدام بيانات العملاء المحتملين." : "This page defines what you authorize Wasla to do, what your acceptance does not mean, and your obligations when using prospect data.")}</p>
        <span>{ar ? `تاريخ السريان: ${effectiveDate}` : `Effective: ${effectiveDate}`}</span>
      </section>
      <section className="legal-page__content">
        <div className="legal-page__summary">
          <strong>{ar ? "موقف وصلة" : "Wasla's position"}</strong>
          <p>{privacy
            ? (ar ? "صُممت وصلة لدعم الالتزام بنظام حماية البيانات الشخصية ولوائحه. نفصل بين جمع البيانات، وكشفها للعميل، والإذن بالتسويق المباشر؛ فكل منها يحتاج مسوغاً وضوابط مستقلة." : "Wasla is designed to support compliance with the Saudi PDPL and its regulations. Collection, disclosure to a customer, and permission for direct marketing are treated as separate activities, each requiring its own basis and controls.")
            : (ar ? "تشغيل البحث لا يساوي إذناً بالتواصل. يجب التحقق من مشروعية كل حملة واحترام المنع والانسحاب قبل التنفيذ." : "Running a search is not permission to contact a person. Every campaign must be validated for lawful use and respect suppression and opt-out instructions before execution.")}</p>
        </div>
        <div className="legal-page__sections is-detailed">
          {sections.map(({ icon: Icon, title, body, points }) => (
            <article key={title}><Icon size={20} /><div><h2>{title}</h2><p>{body}</p>{points?.length ? <ul>{points.map((point) => <li key={point}>{point}</li>)}</ul> : null}</div></article>
          ))}
        </div>
        <div className="legal-page__contact">
          <Check size={18} />
          <div><strong>{ar ? "الخصوصية والحقوق" : "Privacy and rights"}</strong><p>{ar ? <>للاستفسار أو طلب الوصول أو التصحيح أو الإتلاف أو إيقاف التسويق، تواصل معنا على <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</> : <>For privacy questions, access, correction, destruction, or marketing opt-out requests, contact <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</>}</p></div>
        </div>
      </section>
      <footer className="legal-page__footer">
        <Link to={privacy ? "/permissions" : "/privacy"}>{privacy ? (ar ? "قراءة صلاحيات الوكيل" : "Read Agent Permissions") : (ar ? "قراءة سياسة الخصوصية" : "Read Privacy Policy")}</Link>
        <Link to="/auth">{ar ? "متابعة إنشاء الحساب" : "Continue to account creation"} {ar ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</Link>
      </footer>
    </main>
  );
}
