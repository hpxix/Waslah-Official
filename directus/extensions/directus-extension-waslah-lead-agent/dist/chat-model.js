export const FREE_CHAT_MODEL = "openrouter/free";
export function isLegacyGpt4(model) {
  return /^(?:openai\/)?gpt-4(?:[.o-]|$)/i.test(String(model || ""));
}
export function routedChatModel(model) {
  return !model || isLegacyGpt4(model) ? FREE_CHAT_MODEL : model;
}
export function smallTalkReply(message, language = "en") {
  if (
    /^(?:yo|yo what's up|what's up|هلا وش اخبارك)[?!.\s]*$/i.test(
      String(message || "").trim(),
    )
  )
    return language === "ar"
      ? "هلا والله! 👋 حيّاك، وش ودّك نسولف عنه أو نشتغل عليه؟"
      : "Hey! 👋 What’s on your mind—want to explore Wasla or talk through your business?";
  const text = String(message || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\bhey{2,}\b/g, "hey")
    .replace(/\bhi{2,}\b/g, "hi")
    .replace(/[أإآ]/g, "ا")
    .replace(/[\u064b-\u065fـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (
    !/^(?:(?:hi|hello|hey|hiya|thanks|thank you|how are you|good morning|good evening|مرحبا|هلا|اهلا|اهلا وسهلا|السلام عليكم|وعليكم السلام|سلام|شكرا|كيفك|كيف حالك|صباح الخير|مساء الخير)(?:\s+(?:wasla|وصلة|وصله|there|again|you|يا وصله))?\s*)+$/u.test(
      text,
    )
  )
    return null;
  if (/thanks|thank you|شكرا/u.test(text))
    return language === "ar"
      ? "العفو! سعيد إني أساعدك 🙌 أنا معك متى ما ودّك نكمل."
      : "Anytime! Happy to help 🙌 I’m here whenever you’re ready to continue.";
  if (/how are you|كيفك|كيف حالك/u.test(text))
    return language === "ar"
      ? "بخير وجاهز أساعدك 😄 وأنت كيفك؟ نكمل شغلنا متى ما تحب."
      : "Doing great and ready to help 😄 How are you? We can pick things up whenever you’re ready.";
  return language === "ar"
    ? "هلا والله! 👋 حيّاك في وصلة. وش ودّك نشتغل عليه اليوم؟"
    : "Hey! 👋 Great to see you. What would you like to work on today?";
}
export function chatQuestionReply(message, language = "en") {
  const ar = language === "ar",
    text = String(message || "").trim();
  if (
    /^(?:well[,\s]*)?(?:can|could) you (?:bring|find|get)(?: me)? (?:clients|customers|leads|prospects)[?!.\s]*$/iu.test(
      text,
    )
  )
    return ar
      ? "أكيد، أساعدك نحدد العملاء اللي يناسبون عرضك ونبحث عن فرص تقدر تتواصل معها 👌 وش المنتج أو الخدمة اللي تبيعها؟"
      : "Yes 👌 I can help you find prospects who fit what you sell. What product or service do you offer?";
  const overview = waslaModelReply(text, language);
  if (overview) return overview;
  if (
    /^(?:what are you|who are you|what (?:can|do) you do|من انت|من أنت|وش تسوي|ايش تسوي)[\s?!؟.]*$/iu.test(
      text,
    )
  )
    return ar
      ? "أنا وصلة 👋 أساعدك أفهم منتجك، أحدد العملاء الأنسب له، وأبحث عن فرص مناسبة ثم أنظمها في العملاء وCRM. تقدر ترسل رابط موقعك ونفهم نشاطك منه أولاً، أو تحكي لي عن فكرتك."
      : "I’m Wasla 👋 Your partner for figuring out who to sell to—and finding relevant leads you can manage in your CRM. Send your website and we can start with your business, or just talk me through what you’re building.";
  if (
    !/https?:\/\//i.test(text) &&
    /(?:website|web site|موقع)/iu.test(text) &&
    /(?:can you|could you|if i|if sent|if i sent|understand|read|identify|هل|تقدر|تفهم|اقرا|اقرأ)/iu.test(
      text,
    )
  )
    return ar
      ? "أكيد—أرسل رابط موقعك 👌 سأقرأ الصفحات العامة وأوضح ما فهمته عن منتجك وقيمته وعملائه. بعدها أقترح شرائح تستحق الاستهداف والنموذج الأنسب مع السبب، وأميّز بين الدليل من الموقع والاقتراحات التي تحتاج تأكيدك. ما أبدأ بحث عملاء بدون موافقتك."
      : "Absolutely—send it over 👌 I’ll read the public pages, map out what you sell and why someone would buy it, then recommend audiences worth targeting and the Wasla model that fits—with the reasoning. I’ll separate what the site actually says from recommendations and anything we still need to confirm. No lead search starts just from sharing a link.";
  return null;
}
export function waslaModelReply(text, language = "en") {
  if (
    !/wasla|وصلة|وصله|astraeus|استرايوس|استريوس|\blite\b|\bultra\b|لايت|الترا/iu.test(
      text,
    ) ||
    !/what|who|how|difference|use case|which|explain|tell me|can.*help|وش|ايش|ما هي|فرق|شرح|تشرح|يناسب|يفيد|استخدام/iu.test(
      text,
    ) ||
    /^\s*(?:find|get)\b/iu.test(text)
  )
    return null;
  const compare =
    /difference|compare|فرق|مقارن|\band\b|\bversus\b|\bvs\b/iu.test(text);
  if (!compare && /\blite\b|لايت/iu.test(text))
    return language === "ar"
      ? "لايت يناسبك إذا تبيع منتجات، معدات، أو خدمات مرتبطة فيها 👌 مثل كاميرات المراقبة، قطع السيارات، الأثاث أو بضائع الجملة. نقدر نركز على أصحاب إعلانات لها علاقة بمنتجك، أو متاجر ممكن تشتري منك أو تعيد بيعه.\n\nمثلاً: مورد عطور يستهدف محلات العطور، أو شركة كاميرات تستهدف جهات مرتبطة بالكاميرات. نحدد الفئة حسب عرضك، وما نعتبر أي شخص مشتري مؤكد لمجرد أنه ظهر في النتائج.\n\nوش تبيع أنت؟"
      : "Lite fits physical products, equipment, and related services 👌 Think security cameras, car parts, furniture, or wholesale stock. We can focus on relevant advertisers or stores that could buy or resell your products.\n\nFor example, a perfume distributor could target perfume retailers, while a camera supplier could target relevant camera businesses. These are prospects to assess, rather than guaranteed buyers.\n\nWhat do you sell?";
  if (!compare && /\bultra\b|الترا/iu.test(text))
    return language === "ar"
      ? "ألترا يناسب مبيعات الشركات لما وجود رقم تواصل أساسي عندك. تحدد القطاع والمدينة وحجم الشركة والمنصب، ونشترط وجود رقم قبل تسليم العميل. مناسب لحجز الاجتماعات، مبيعات البرامج، والاستشارات والعقود التجارية. الرقم ما يضمن أنه جوال شخصي أو أن الشخص مهتم بالشراء.\n\nأي نوع شركات تبي توصل له؟"
      : "Ultra is for targeted B2B prospecting when a phone number is essential. You define industry, location, company size and role; a usable phone is required before delivery. It suits appointment setting, software sales and commercial services. That does not guarantee a personal mobile or buying interest.\n\nWhat kinds of companies do you want to reach?";
  if (!compare && /astraeus|استرايوس|استريوس/iu.test(text))
    return language === "ar"
      ? "أسترايوس يناسبك إذا تبيع لشركات وتبي توصل للجهة أو المنصب المناسب، مثل مدير تسويق، مسؤول عمليات أو مؤسس. نحدد القطاع والمدينة وحجم الشركة حسب عرضك. مناسب للوكالات، البرامج، التوظيف والاستشارات؛ بيانات التواصل حسب المتاح.\n\nوش الخدمة اللي تقدمها للشركات؟"
      : "Astraeus helps you target companies and relevant roles—such as founders, marketing managers or operations leaders—by industry, location and company size. It suits agencies, software, recruitment and consulting. Contact details depend on availability.\n\nWhat do you offer those businesses?";
  return language === "ar"
    ? "أكيد، خلّني أوضحها لك 👌 أنا وصلة، أساعدك تحدد العملاء المناسبين لعرضك وتلقى فرص تقدر تتابعها.\n\n**Lite:** للمنتجات والمعدات والخدمات المرتبطة فيها، مثل الكاميرات، قطع السيارات، الأثاث والجملة. تقدر تستهدف أصحاب إعلانات مرتبطة بمنتجك، أو متاجر ممكن تشتري منك أو تعيد بيع منتجاتك.\n\n**Astraeus:** إذا عميلك شركة وتحتاج تستهدف قطاع، حجم شركة، مدينة أو منصب معيّن. مناسب للتسويق، البرامج، التوظيف والاستشارات. بيانات التواصل حسب المتاح.\n\n**Ultra:** نفس استهداف الشركات، مع اشتراط وجود رقم تواصل قبل تسليم العميل. مناسب لفرق المبيعات وحجز الاجتماعات. وجود الرقم ما يضمن أنه جوال شخصي مباشر أو أن صاحبه مهتم بالشراء.\n\nوش تبيع ومن تتمنى يكون عميلك؟ أعطيك اقتراح يناسب نشاطك مع السبب."
    : "Of course 👌 I’m Wasla—here to help you identify relevant prospects and organize your follow-up.\n\n**Lite:** physical products, equipment and related services—cameras, car parts, furniture and wholesale stock. Reach relevant marketplace advertisers or stores that could buy or resell your products.\n\n**Astraeus:** target businesses by industry, company size, city and job role. Useful for agencies, software, recruitment and consulting. Contact details depend on availability.\n\n**Ultra:** the same business targeting, with an available phone required before delivery. Useful for sales teams and appointment setting. A phone does not guarantee a direct personal mobile or buying interest.\n\nWhat do you sell, and who would you like to reach? I’ll help you choose and explain why.";
}
export function cleanAssistantReply(value) {
  return String(value || "")
    .replace(/\[LITE_AUDIENCE_(?:MERCHANTS|MARKETPLACE)\]/g, "")
    .replace(
      /(?:^|\n)\s*(?:ready|confidence|missing|reasoning_mode)\s*[:=]\s*(?:true|false|[\d.]+|\[[^\n]*\]|fast|high)\s*(?=\n|$)/gi,
      "",
    )
    .replace(/`?consent_record_missing`?/g, "contact permission required")
    .trim();
}
export const FRIENDLY_CHAT_TONE =
  "Keep the exact business context, grounded facts, readiness rules and structured output contract. Answer the actual latest question FIRST, including questions about yourself, website reading, model choices, corrections and explanations. Do not redirect a capability question into product/city intake. Match the user’s energy: relaxed and warm for casual messages; thoughtful, specific and more detailed for substantial requests. No arbitrary one-sentence cap. Acknowledge mistakes and use prior context instead of repeating a checklist. For greetings or small talk, answer that first without pretending to search or interrogating the user. Never invent progress, buying intent, results or a completed action. Resume the existing brief naturally when the user returns. Avoid repetitive greetings, excessive emojis and sales hype.";
