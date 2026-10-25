import assert from 'node:assert/strict';
import { classifyListingIntent, cleanListingText, englishProductCategory, listingPreviewFromEvidence, productFromListingTitle } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-listing-intent.js';

const cases = [
  ['للبيع لابتوب Asus Vivobook', 'للبيع بحالة ممتازة', 'offering_for_sale'],
  ['شقة للبيع في حطين', '3 غرف نوم', 'offering_for_sale'],
  ['للإيجار شقة حي العارض', 'شقة مؤثثة', 'offering_for_rent'],
  ['مطلوب سيارة كامري', 'أبحث عن كامري نظيفة', 'seeking_to_buy'],
  ['Looking to buy a used MacBook', 'Need to buy this month', 'seeking_to_buy'],
  ['ابغى سواق', 'I am looking for work. Private Driver.', 'seeking_work'],
  ['مخزن أودي', 'تم البيع / تم البيع بارك الله للجميع', 'sold_or_closed'],
  ['خدمات تصميم متاجر', 'نقدم لكم خدمات تصميم', 'offering_service'],
  ['ثلاجة زجاج', 'جديد ضمان 5 سنوات', 'not_stated'],
  ['Original Nissan trunk', 'متوفر لدينا شنطة صني أصلية', 'product_listed'],
  ['تاجير سماعات بارتي', 'تاجير سماعات الرياض', 'offering_for_rent'],
  ['تصميم شيت اكسل', 'نحن نقدم تصميم شيتات إكسل', 'offering_service'],
];
for (const [title, body, expected] of cases) {
  assert.equal(classifyListingIntent(title, body).intent, expected, title);
}
assert.equal(cleanListingText('شقة &amp;ndash; جديدة &bull; <b>ممتازة</b>'), 'شقة – جديدة • ممتازة');
assert.deepEqual(listingPreviewFromEvidence([{ title: 'للبيع هاتف', bodyText: 'هاتف بحالة ممتازة' }], 'OWNER'), { intent: 'offering_for_sale', product: 'هاتف', productCategoryEn: 'Phone', ownership: 'likely_owner' });
assert.deepEqual(listingPreviewFromEvidence([{ title: 'بوكلين للبيع كتر بلر', bodyText: 'بوكلين موديل 2006' }], 'PRODUCT_PROSPECT'), { intent: 'offering_for_sale', product: 'بوكلين كتر بلر', productCategoryEn: 'Excavator', ownership: 'unverified' });
assert.equal(productFromListingTitle('بيع آيفون 15 | اتصل 0501234567'), 'آيفون 15');
assert.equal(englishProductCategory('قطع غيار بوكلين'), 'Spare parts');
assert.equal(listingPreviewFromEvidence([]), null);
console.log(`Lite listing intent: ${cases.length} classification cases and text cleanup passed.`);
