import { ArrowLeft, ArrowRight, BadgeCheck, Database, PhoneCall, Radar, Search, Sparkles } from "lucide-react";
import { useLanguage } from "../i18n";

export function EmptyWorkspace({ onStart }: { onStart: () => void }) {
  const { direction, language, t } = useLanguage();
  return (
    <section className="workspace-empty" aria-labelledby="empty-title" dir={direction}>
      <div className="workspace-empty__visual" aria-hidden="true">
        <span className="workspace-empty__orbit one" />
        <span className="workspace-empty__orbit two" />
        <span className="workspace-empty__scan" />
        <div className="workspace-empty__core"><Radar size={30} /></div>
        <Search className="workspace-empty__satellite search" size={17} />
        <Database className="workspace-empty__satellite data" size={17} />
        <PhoneCall className="workspace-empty__satellite call" size={17} />
        <BadgeCheck className="workspace-empty__satellite qualified" size={17} />
      </div>
      <div className="workspace-empty__copy">
        <span><Sparkles size={14} /> {t("empty.new")}</span>
        <h2 id="empty-title">{t("empty.title")}</h2>
        <p>{t("empty.body")}</p>
        <button onClick={onStart}>{t("empty.start")} {language === "ar" ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}</button>
      </div>
      <div className="workspace-empty__steps">
        <div><strong>01</strong><span>{language === "ar" ? "حدد العميل" : "Define buyer"}</span></div>
        <div><strong>02</strong><span>{language === "ar" ? "راجع المعايير" : "Review criteria"}</span></div>
        <div><strong>03</strong><span>{language === "ar" ? "شغّل الوكيل" : "Run agent"}</span></div>
      </div>
    </section>
  );
}

export function CelebrationToast({ message, onClose }: { message: { title: string; body: string } | null; onClose: () => void }) {
  const { direction, language } = useLanguage();
  if (!message) return null;
  return (
    <div className="celebration-toast" role="status" dir={direction}>
      <div className="celebration-toast__mark"><BadgeCheck size={21} /></div>
      <div><strong>{message.title}</strong><p>{message.body}</p></div>
      <button onClick={onClose} aria-label={language === "ar" ? "إغلاق التنبيه" : "Close notification"}>×</button>
    </div>
  );
}
