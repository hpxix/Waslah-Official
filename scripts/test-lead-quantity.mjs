import assert from 'node:assert/strict';
import {parseReadyLeadQuantity} from '../src/lib/leadQuantity.ts';
for (const [message,count] of [['2',2],['٢',2],['۲',2],['تمام، أبي بس ٢ للتجربة الحين.',2],['ابغى عميلين بس للتجربة.',2],['ابدأ بـ٢',2],['Can I have 2 leads please?',2],['I just want 2 leads please',2],['Find me 5 contacts',5],['200 leads',200],['start with 10 prospects now',10]]) assert.equal(parseReadyLeadQuantity(message),count,message);
for (const message of ['0','201','300','2.5','2,000','I sell subscriptions for 499 SAR','Find 2 clinics in Jeddah','2 leads but change the city','لا ابي 30','How much for 2 leads?','I have 2 employees','2 not 30','غيرها إلى ٢ في الدمام']) assert.equal(parseReadyLeadQuantity(message),null,message);
console.log('Quantity-only launch consent: Arabic/English numerals, small trials, valid range, no target edits or price questions.');
assert.equal(parseReadyLeadQuantity('تمام ابدأ بعميلين بس للتجربة.'), 2);
assert.equal(parseReadyLeadQuantity('ابدأ بعميلين في جدة'), null);
