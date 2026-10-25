export const LITE_ACQUISITION_ORDER = ['buyer_intent','product_comments','product_ads'];
export const LITE_ACQUISITION_VERSION = 'buyer-comments-product-ads-v2-budgeted';
// Prospect units, not HTTP requests: listings / distinct commenter accounts / listings.
export function liteAcquisitionLimits(target) {
  const total=Math.ceil(Math.max(1,Number(target)||30)*1000/30);
  const quarter=Math.floor(total/4);
  return {total,buyer_intent:quarter,product_comments:quarter,product_ads:total-quarter*2};
}
export const liteStrategyKey = strategy => String(strategy.pathId || strategy.searchTerm || strategy.query);
export function orderedLiteStrategies(plan) {
  const original=Array.isArray(plan.strategies)?plan.strategies:[];
  const buyers=original.filter(strategy=>strategy.strategyType==='DIRECT_PURCHASE_INTENT');
  const cities=original[0]?.cities||[];
  // Third stage searches the actual product, not inferred ownership proxies.
  const terms=[...new Set((plan.keywordMatching?.productTerms||[]).map(value=>String(value).trim()).filter(Boolean))].slice(0,16);
  const ads=terms.map((term,index)=>({query:term,searchTerm:term,sourceMode:'search',requiresKeywordMatch:true,cities,weight:1,pathId:`product-ad-fallback-${index}-${term}`,phase:'product_ads',phaseIndex:2,strategyType:'PRODUCT_AD_FALLBACK',matchTerms:plan.keywordMatching.productTerms,reason:'Matching product advertisement with a phone; purchase intent not established'}));
  return [...buyers,...ads];
}
export function orderedLiteStage(strategies,progress,comments,preferred='buyer_intent',limits=null,usage={},stoppedStages={}) {
  const available={
    buyer_intent:strategies.some(strategy=>strategy.strategyType==='DIRECT_PURCHASE_INTENT'&&!progress[liteStrategyKey(strategy)]?.exhausted),
    product_comments:!comments?.complete,
    product_ads:strategies.some(strategy=>strategy.strategyType==='PRODUCT_AD_FALLBACK'&&!progress[liteStrategyKey(strategy)]?.exhausted),
  };
  const start=limits?0:Math.max(0,LITE_ACQUISITION_ORDER.indexOf(preferred));
  for(let offset=0;offset<LITE_ACQUISITION_ORDER.length;offset++){
    const stage=LITE_ACQUISITION_ORDER[(start+offset)%LITE_ACQUISITION_ORDER.length];
    if(!stoppedStages[stage]&&available[stage]&&(!limits||Number(usage[stage]||0)<limits[stage]))return stage;
  }
  return null;
}
export function nextLiteStage(stage){return LITE_ACQUISITION_ORDER[(LITE_ACQUISITION_ORDER.indexOf(stage)+1)%LITE_ACQUISITION_ORDER.length];}
