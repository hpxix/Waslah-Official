import { BadgeCheck, Database, Eye, PhoneCall, Search, Sparkles } from "lucide-react";
import { useLanguage } from "../i18n";

export function LeadFlowVisual({ compact = false }: { compact?: boolean }) {
  const { direction, language } = useLanguage();
  const stages = language === "ar" ? [
    { icon: Search, label: "فهم الطلب", note: "تحديد القطاع والمدينة" },
    { icon: Database, label: "جمع البيانات", note: "مصادر موثوقة ومتعددة" },
    { icon: Sparkles, label: "التنقية", note: "دمج وتقييم الملاءمة" },
    { icon: PhoneCall, label: "التأهيل", note: "تواصل صوتي ذكي" },
    { icon: BadgeCheck, label: "عميل مؤهل", note: "سبب واضح للترشيح" },
    { icon: Eye, label: "كشف البيانات", note: "بعد موافقة العميل" },
  ] : [
    { icon: Search, label: "Understand", note: "Industry, city, buyer role" },
    { icon: Database, label: "Source", note: "Trusted, diverse sources" },
    { icon: Sparkles, label: "Refine", note: "Merge and score relevance" },
    { icon: PhoneCall, label: "Qualify", note: "Intelligent voice outreach" },
    { icon: BadgeCheck, label: "Qualified", note: "Clear reason to engage" },
    { icon: Eye, label: "Reveal", note: "After qualification" },
  ];
  return (
    <div className={`lead-flow${compact ? " is-compact" : ""}`} aria-label={language === "ar" ? "مراحل وكيل وصلة للعملاء" : "Wasla lead agent stages"} dir={direction}>
      <div className="lead-flow__line" aria-hidden="true" />
      {stages.map(({ icon: Icon, label, note }, index) => (
        <div className="lead-flow__stage" key={label}>
          <div className="lead-flow__node">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <Icon size={compact ? 15 : 18} strokeWidth={1.8} />
          </div>
          <strong>{label}</strong>
          {!compact && <small>{note}</small>}
        </div>
      ))}
    </div>
  );
}
