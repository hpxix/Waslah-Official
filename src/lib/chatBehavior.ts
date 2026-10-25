export function isSmallTalkTurn(value: string) {
  const text = value.normalize('NFKC').toLowerCase().replace(/\bhey{2,}\b/g,'hey').replace(/\bhi{2,}\b/g,'hi').replace(/[أإآ]/g, 'ا').replace(/[\u064b-\u065fـ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().replace(/\s+/g, ' ');
  return /^(?:(?:hi|hello|hey|hiya|thanks|thank you|how are you|good morning|good evening|مرحبا|هلا|اهلا|اهلا وسهلا|السلام عليكم|وعليكم السلام|سلام|شكرا|شكراً|كيفك|كيف حالك|صباح الخير|مساء الخير)(?:\s+(?:wasla|وصلة|وصله|there|again|you|يا وصله))?\s*)+$/u.test(text);
}
