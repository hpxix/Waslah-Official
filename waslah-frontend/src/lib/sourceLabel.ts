export function sourceLabel(source: string | null | undefined, language: "ar" | "en") {
  const value = String(source || "").trim();
  if (!value) return language === "ar" ? "مصدر أعمال موثوق" : "Verified business source";
  if (/google maps|places/i.test(value)) return language === "ar" ? "دليل أعمال محلي" : "Local business directory";
  if (/linkedin/i.test(value)) return language === "ar" ? "شبكة أعمال مهنية" : "Professional business network";
  if (/instagram|facebook|social/i.test(value)) return language === "ar" ? "ملف أعمال عام" : "Public business profile";
  if (/website|crawler/i.test(value)) return language === "ar" ? "موقع شركة موثّق" : "Verified company website";
  if (/apify|actor|scraper/i.test(value)) return language === "ar" ? "مصدر أعمال موثوق" : "Verified business source";
  return value;
}
