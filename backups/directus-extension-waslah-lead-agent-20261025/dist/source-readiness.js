import { fold, routeIntent, sourcesFor } from './curated-sources.js';

// Conversational preflight only. This never changes the brief, chooses a wider
// audience, or replaces the router's own sourcesFor/record-level checks.
const messages = {
  website_condition_choice: {
    en: 'Those are two different checks: a company with no website, and one with a website that needs work. The available contact records don’t assess website quality. Should we focus on records with no website listed, or keep the website review as a separate step?',
    ar: 'هذول شرطين مختلفين: شركة ما عندها موقع، وشركة موقعها يحتاج تحسين. بيانات التواصل المتاحة ما تقيّم جودة المواقع. نركز على الجهات اللي ما لها موقع مسجل في البيانات، أو نخلي فحص المواقع خطوة منفصلة؟',
    missing: ['website_condition'],
  },
  website_review_required: {
    en: 'The available contact records don’t tell us whether a website is weak or outdated. We can find the right companies first and review their websites separately, but I won’t label them as having weak websites without checking. Would you like to do that, or remove the website-quality condition?',
    ar: 'بيانات التواصل المتاحة ما تثبت إن الموقع ضعيف أو قديم. نقدر نلقى الشركات المناسبة أولًا ونفحص مواقعها بشكل منفصل، لكن ما راح نصنفها كمواقع ضعيفة بدون فحص. يناسبك هذا، أو تفضّل تشيل شرط جودة الموقع؟',
    missing: ['website_review_consent'],
  },
  ownership_confirmation_required: {
    en: 'The available property records identify listing contacts, agents, or advertisers—not verified property owners. Are those contacts useful to you, or do you need confirmed owners only? I won’t switch the target without your approval.',
    ar: 'بيانات العقارات المتاحة تعطينا جهات الإعلان أو الوسطاء، مو إثبات إن الشخص مالك العقار. هالجهات تناسبك، أو تحتاج ملاك مؤكّدين فقط؟ ما راح أغيّر نوع العملاء بدون موافقتك.',
    missing: ['listing_contact_consent'],
  },
  ultra_rental_phones_unavailable: {
    en: 'Ultra needs a usable phone number for every lead. The available furnished-rental records don’t provide documented phone coverage or verify who owns each property. Would listing or agent contacts work for you, or do you need confirmed owners? No search has started.',
    ar: 'ألترا يحتاج رقم تواصل متاح لكل عميل. بيانات الوحدات المفروشة المتاحة ما تضمن أرقام تواصل ولا تثبت ملكية العقار. يناسبك نبحث عن جهات الإعلان أو الوسطاء، أو تحتاج ملاك مؤكّدين؟ البحث ما بدأ.',
    missing: ['rental_phone_source'],
  },
  saudi_source_unavailable: {
    en: 'That property-agent directory covers the United States, not Saudi Arabia. This search is currently limited to Saudi targets. Would you like to look for Saudi agents instead?',
    ar: 'دليل الوسطاء اللي طلبته يغطي الولايات المتحدة، مو السعودية. البحث هنا حاليًا مخصص للعملاء داخل السعودية. تبي نبحث عن وسطاء سعوديين بدلًا منه؟',
    missing: ['saudi_source_consent'],
  },
  rental_city_required: {
    en: 'Which Saudi city should we focus on for furnished rentals?',
    ar: 'في أي مدينة سعودية نركز على الوحدات المفروشة؟',
    missing: ['rental_city'],
  },
  source_unavailable: {
    en: 'I don’t have a compatible source for that exact target yet. Would you like to adjust the target? I won’t start a different search without your approval.',
    ar: 'ما عندي مصدر مناسب لهالطلب بنفس شروطه حاليًا. تبي نعدّل نوع العملاء؟ ما راح أبدأ بحث مختلف بدون موافقتك.',
    missing: ['compatible_source'],
  },
};

function outcome(code, language) {
  const message = messages[code];
  return { code, text: message[language === 'ar' ? 'ar' : 'en'], missing: [...message.missing] };
}

export function sourceReadiness(brief = {}, { ultra = false, language = 'en' } = {}) {
  const safeBrief = brief && typeof brief === 'object' && !Array.isArray(brief) ? brief : {};
  // fitSignal is a target requirement, unlike the seller's offer. Include it so
  // an unsupported constraint cannot disappear just because it lives there.
  const intent = routeIntent({ ...safeBrief, query: [safeBrief.query, safeBrief.business?.fitSignal].filter(Boolean).join(' ') });
  const target = fold(intent.target);
  const noWebsite = intent.noWebsite || /ما عند(?:ها|هم|ه) (?:موقع|مواقع)|بدون مواقع|(?:لا يوجد|لا توجد) (?:لها |لهم )?موقع/.test(target);
  const weakWebsite = intent.weakWebsite || /مواقع(?:ها|هم)? (?:ضعيفه|قديمه|سيئه)|موقع(?:ها|هم)? (?:ضعيف|قديم|سيئ)|(?:ضعف|جوده) الموقع|(?:poor|outdated|weak|bad) (?:websites|sites)|(?:website|site) quality/.test(target);
  if (noWebsite && weakWebsite) return outcome('website_condition_choice', language);
  if (weakWebsite) return outcome('website_review_required', language);

  // Match the same availability guards as the executable router. Calling
  // sourcesFor as well means a new catalog restriction cannot silently pass.
  if (intent.kind === 'us_agents') return outcome('saudi_source_unavailable', language);
  if (intent.kind === 'rentals' && ultra) return outcome('ultra_rental_phones_unavailable', language);
  if (intent.ownerOnly) return outcome('ownership_confirmation_required', language);
  if (intent.kind === 'rentals' && !intent.city) return outcome('rental_city_required', language);
  try {
    if (!sourcesFor(intent, ultra).length) return outcome('source_unavailable', language);
  } catch {
    return outcome('source_unavailable', language);
  }
  return null;
}
