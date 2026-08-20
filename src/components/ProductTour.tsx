import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

export type TourStep = {
  target: string;
  eyebrow: string;
  title: string;
  body: string;
};

export function ProductTour({ open, steps, onComplete }: { open: boolean; steps: TourStep[]; onComplete: () => void }) {
  const { direction, language } = useLanguage();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];

  useEffect(() => {
    if (!open || !step) return;
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!target) return setRect(null);
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      window.setTimeout(() => setRect(target.getBoundingClientRect()), 320);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [index, open, step]);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  if (!open || !step || !rect) return null;
  const popoverWidth = Math.min(360, window.innerWidth - 28);
  const left = Math.min(Math.max(14, rect.left + rect.width / 2 - popoverWidth / 2), window.innerWidth - popoverWidth - 14);
  const roomBelow = window.innerHeight - rect.bottom;
  const top = roomBelow > 260 ? rect.bottom + 16 : Math.max(14, rect.top - 224);
  const isLast = index === steps.length - 1;

  return (
    <div className="product-tour" dir={direction}>
      <div className="product-tour__focus" style={{ left: rect.left - 7, top: rect.top - 7, width: rect.width + 14, height: rect.height + 14 }} />
      <section className="product-tour__popover" style={{ left, top, width: popoverWidth }} role="dialog" aria-live="polite">
        <div className="product-tour__topline"><span>{step.eyebrow}</span><button onClick={onComplete} aria-label={language === "ar" ? "إنهاء الجولة" : "Close tour"}><X size={17} /></button></div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="product-tour__footer">
          <div className="product-tour__dots">{steps.map((item, itemIndex) => <span key={item.target} className={itemIndex === index ? "active" : ""} />)}</div>
          <div>
            {index > 0 && <button className="product-tour__back" onClick={() => setIndex(index - 1)}>{language === "ar" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />} {language === "ar" ? "السابق" : "Back"}</button>}
            <button className="product-tour__next" onClick={() => isLast ? onComplete() : setIndex(index + 1)}>{isLast ? (language === "ar" ? "ابدأ العمل" : "Start working") : (language === "ar" ? "التالي" : "Next")}{language === "ar" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
