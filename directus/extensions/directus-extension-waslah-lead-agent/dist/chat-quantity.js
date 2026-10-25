// One shared grammar for client launch consent and server policy recovery.
// A message that also changes the target is not a quantity-only authorization.
export function parseReadyLeadQuantity(message) {
  const value = String(message || '').normalize('NFKC').toLowerCase()
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[\u064b-\u065f\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا')
    .replace(/[،,!?.؟]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/(^|\s)(ب?)عميلين(?=\s|$)/gu, (_match, space, prefix) => `${space}${prefix}2 عميل`);
  const match = value.match(/^(?:(?:ok|okay|yes|please|sure|alright|great|تمام|طيب|اوكي|نعم|ايه|حلو|ممتاز|يلا)\s+)*(?:(?:i\s+(?:just\s+)?(?:want|need)|(?:find|get|give|send)(?:\s+me)?|can\s+i\s+(?:get|have)|can\s+we\s+(?:try|start\s+with)|let'?s\s+(?:try|start\s+with)|start(?:\s+(?:with|a\s+search\s+for))?|ابي|ابغى|اريد|اعطني|ممكن|جيب(?:\s+لي)?|ابدا(?:\s+ب)?)\s*)?(?:(?:just|only|بس|فقط)\s+)?(\d{1,3})(?:\s*(?:leads?|contacts?|prospects?|عملاء|عميل|جهات اتصال|ارقام))?(?:\s+(?:please|now|for\s+(?:a\s+)?(?:trial|test)|للتجربه|للتجربة|الحين|الان|بس|فقط|من فضلك))*$/u);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) && count >= 1 && count <= 200 ? count : null;
}
