const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/[\u064b-\u065fـ]/g,'').trim();
export const audienceQuestion=language=>language==='ar'
  ? 'عشان أوصلك للفئة الصح: عميلك المحتمل ممكن يكون عنده متجر إلكتروني يبيع فيه منتجاته، مثل سلة أو زد أو شوبيفاي؟ أو تستهدف أفراد وأصحاب إعلانات؟'
  : 'To pick the right audience: could your ideal customer run an online store, such as Salla, Zid, or Shopify, or are you targeting individuals and marketplace advertisers?';
const channelQuestion=s=>/could your ideal customer run an online store|عميلك المحتمل ممكن يكون عنده متجر الكتروني/.test(norm(s));
export function audienceRoute(message,transcript=[]){
  let route=null,lastAssistant='';
  for(const line of [...transcript,`user: ${message}`]){
    if(/^assistant\s*:/i.test(line)){lastAssistant=line;continue;}
    if(!/^user\s*:/i.test(line))continue;
    const s=norm(line.replace(/^user\s*:/i,''));
    const negative=/^(?:no|nope|nah|not really|لا|لأ|مو كذا|ابدا)(?:[.!،,\s]|$)|\b(?:wouldn.t|won.t|couldn.t|cannot|can.t|doesn.t|don.t|do not|not)\b.{0,55}(?:shopify|salla|zid|e.?commerce|online stores?)|(?:ما يستخدم|ما عند|ما عندهم|مو عند|بدون).{0,45}(?:سلة|سله|زد|شوبيفاي|متجر)/.test(s);
    if(negative&&(channelQuestion(lastAssistant)||/shopify|salla|zid|e.?commerce|online store|سلة|سله|زد|شوبيفاي|متجر/.test(s))){route='marketplace';continue;}
    if(/(?:couldn.t|cannot|can.t|doesn.t|don.t|not|no)\b.{0,45}(?:e.?commerce|online store)|(?:ما عند|مايكون|مو|ليس|بدون|ما يكون).{0,35}(?:متجر|الكتروني)|^(?:no|لا|لأ|لا ابدا)[.!\s]*$/.test(s)&&(channelQuestion(lastAssistant)||/e.?commerce|online store|متجر/.test(s)))route='marketplace';
    else if(/(?:target|find|want|need|customers?|clients?).{0,65}(?:e.?commerce|online stores?|shopify|salla|zid)|(?:e.?commerce|online store).{0,40}(?:owners?|merchants?|businesses)|(?:استهدف|عملائي|عميلي|ابي|ابغى).{0,60}(?:متاجر|متجر الكتروني|سله|سلة|شوبيفاي|زد)/.test(s))route='merchants';
    else if(/\bharaj\b|حراج|marketplace advertisers|individual buyers|استهدف افراد|اصحاب اعلانات/.test(s))route='marketplace';
    else if(channelQuestion(lastAssistant)&&/^(?:yes|yeah|yep|sure|of course|نعم|اي|ايه|ايوه|اكيد)(?:[.!،,\s]|$)/.test(s))route='merchants';
  }
  return route;
}
export const routeMarker=route=>route==='merchants'?'[LITE_AUDIENCE_MERCHANTS]':'[LITE_AUDIENCE_MARKETPLACE]';
export const routeFromPrompt=prompt=>String(prompt).includes('[LITE_AUDIENCE_MERCHANTS]')?'merchants':String(prompt).includes('[LITE_AUDIENCE_MARKETPLACE]')?'marketplace':null;
export const cameraKeywords=['كاميرات مراقبة','كميرات مراقبة','كميرات امن','كاميرات امن','CCTV','security cameras','هيك فيجن','Hikvision','داهوا','Dahua'];
