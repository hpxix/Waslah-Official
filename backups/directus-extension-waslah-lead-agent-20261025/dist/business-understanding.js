// Shared high-reasoning preflight. These are facts about the customer's
// business, not search filters; a lead route is not ready until both are clear.
const FIELDS = ['offer', 'customer', 'customerOutcome', 'commercialModel', 'target', 'fitSignal', 'geography'];

export const BUSINESS_UNDERSTANDING_SCHEMA = {
  type: 'object', additionalProperties: false, required: FIELDS,
  properties: Object.fromEntries(FIELDS.map((field) => [field, { type: 'string' }])),
};

const UNSUPPORTED = /^(?:unknown|unspecified|not sure|n\/a|none|tbd|generic|any|all|غير محدد|لا اعرف|لا أدري|أي شيء|اي شيء)$/i;

export function cleanBusinessUnderstanding(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(FIELDS.map((field) => {
    const text = String(source[field] || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    return [field, text.length >= 3 && !UNSUPPORTED.test(text) && !/^(?:mission context|سياق المهمة)/i.test(text) ? text : ''];
  }));
}

export function missingBusinessUnderstanding(value) {
  const understood = cleanBusinessUnderstanding(value);
  return FIELDS.filter((field) => !understood[field]);
}

// An assistant's example size must not become an unrequested revenue cutoff.
export function groundTargetFilters(filters, customerWords = '') {
  const result = filters && typeof filters === 'object' && !Array.isArray(filters) ? { ...filters } : {};
  const words = String(customerWords || '');
  if (!/\brevenues?\b|\bturnover\b|ايرادات|إيرادات|دخل\s+(?:الشرك|المنش)/iu.test(words)) {
    delete result.annualRevenueIncludes; delete result.annualRevenueExcludes;
  }
  if (!/\bfunding\b|\bfunded\b|\bseed\b|\bseries\s+[a-e]\b|تمويل|تمويلية|مموله|مموّلة/iu.test(words)) {
    delete result.fundingStageIncludes; delete result.fundingStageExcludes;
  }
  return result;
}

// Recover explicit sales terms if the model leaves that field blank. This does
// not infer demand, intent, or benefits from a product alone.
export function groundBusinessUnderstanding(value, customerWords = '') {
  const understood = cleanBusinessUnderstanding(value);
  const words = String(customerWords || '');
  if (!understood.commercialModel) {
    const wholesale = /\bwholesale\b|\bwhole\s*sale\b|\bbulk\s+(?:sales?|orders?|supply)\b|بيع\s+ب?الجملة|توريد\s+بالجملة/iu.test(words);
    const retail = /\bretail\b|\bindividual\s+sales?\b|\bdirect\s+(?:to\s+consumer|sales?)\b|بيع\s+ب?التجزئة|بيع\s+للأفراد/iu.test(words);
    const subscription = /\bsubscriptions?\b|\bmonthly\s+plans?\b|اشتراك(?:ات)?\s+شهري/iu.test(words);
    const recurring = /\brecurring\s+(?:orders?|supply|sales?)\b|\bregular\s+(?:orders?|supply)\b|توريد\s+(?:دوري|مستمر)|طلبات\s+متكررة/iu.test(words);
    const projects = /\bproject[- ]based\b|\bper\s+project\b|بال?مشروع|حسب\s+المشروع/iu.test(words);
    const channels = [wholesale && 'wholesale', retail && 'retail/direct sales', subscription && 'subscription', recurring && 'recurring supply', projects && 'project-based sales'].filter(Boolean);
    if (channels.length) understood.commercialModel = channels.join(' and ');
  }
  return understood;
}

export function businessUnderstandingQuestion(field, language = 'en', dealIntent = 'sell', context = {}) {
  const buying = dealIntent === 'buy';
  const offer = String(context.offer || '').trim().slice(0, 70);
  const customer = String(context.customer || '').trim().slice(0, 70);
  const questions = language === 'ar'
    ? {
        offer: buying ? 'وش تحتاج تشتري، وكيف بتستخدمه؟' : 'وش تبيع بالضبط؟',
        customer: buying ? 'مين نوع البائع اللي يناسب طلبك؟' : offer ? `مين يشتري ${offer} منك عادةً: محلات وشركات، أفراد، أو الاثنين؟` : 'مين يشتري منك عادةً: شركات، أفراد، أو الاثنين؟',
        customerOutcome: buying ? 'وش النتيجة اللي تبي تحققها من هالشراء؟' : customer ? 'وش يستفيد هالعميل من منتجك؟' : 'وش يستفيد العميل من منتجك أو خدمتك؟',
        commercialModel: buying ? 'كيف تستخدم هالشراء في شغلك؟' : 'هل يطلبون منك بشكل مستمر، أو تكون صفقات منفصلة؟',
        target: buying ? 'أي نوع من الموردين تبي نركز عليه؟' : 'أي نوع من المشترين تبي نركز عليه أولاً؟',
        fitSignal: buying ? 'وش أهم شيء يثبت لك أن المورد مناسب؟' : 'وش الشيء اللي يخليك تقول إن هذا العميل مناسب لك الآن؟',
        geography: 'في أي مدينة أو منطقة نركز البحث؟',
      }
    : {
        offer: buying ? 'What are you looking to buy, and how will you use it?' : 'What do you sell?',
        customer: buying ? 'What kind of seller would work for you?' : offer ? `Who normally buys ${offer} from you—businesses, individuals, or both?` : 'Who normally buys from you—businesses, individuals, or both?',
        customerOutcome: buying ? 'What would a successful purchase help you do?' : customer ? 'What do those buyers get out of buying from you?' : 'What do customers get out of buying from you?',
        commercialModel: buying ? 'How will you use this purchase in your business?' : 'Are these usually repeat orders or one-off sales?',
        target: buying ? 'Which kind of supplier should we focus on?' : 'Which type of buyer should we focus on first?',
        fitSignal: buying ? 'What would make a seller a good fit for you?' : 'What would tell you a buyer is a good fit right now?',
        geography: 'Which city or area should we focus on?',
      };
  return questions[field] || questions.offer;
}
