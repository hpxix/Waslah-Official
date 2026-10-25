import assert from 'node:assert/strict';
import { CURATED_SOURCES, routeIntent, sourcesFor, curatedCost, buildSourceInput, schemaInput, recordPhones, normalizeSourceRecord, normalizeTender, currentPrice, recordMatchesIndustry, recordMatchesRole } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/curated-sources.js';
assert.equal(CURATED_SOURCES.length,12);
const source = key => CURATED_SOURCES.find(s=>s.key===key);
const intent = query => routeIntent({query});
assert.equal(intent('Find CEOs in Saudi Arabia').kind,'business');
assert.equal(intent('Find contacts on Bayut in Riyadh').kind,'property');
assert.equal(intent('Find real estate agents in Jeddah').kind,'agents');
assert.equal(intent('Gathern furnished apartments in Riyadh').kind,'rentals');
assert.equal(intent('OpenSooq marketplace sellers in Riyadh').kind,'marketplace');
assert.equal(intent('Show Etimad government tenders').kind,'tenders');
assert.throws(()=>sourcesFor(intent('Zillow agents'),false),/US agents/);
assert.throws(()=>sourcesFor(intent('Airbnb owners in Riyadh'),true),/owner phones/);
assert.throws(()=>sourcesFor(intent('property owners in Riyadh'),false),/not verified owners/);
assert.equal(sourcesFor(intent('Bayut listing contacts in Riyadh'),true)[0].key,'bayut');
const pricing={pricingModel:'PAY_PER_EVENT',pricingPerEvent:{actorChargeEvents:{'apify-actor-start':{eventPriceUsd:.05},leads:{isPrimaryEvent:true,eventTieredPricingUsd:{FREE:{tieredEventPriceUsd:.003},GOLD:{tieredEventPriceUsd:.001}}}}}};
assert.ok(Math.abs(curatedCost({currentPricingInfo:pricing},source('pipeline'),30,false).estimateUsd-.14)<1e-8);
assert.equal(curatedCost({currentPricingInfo:{pricingModel:'FLAT_PRICE_PER_MONTH'}},source('pipeline'),30,false),null);
assert.equal(curatedCost({currentPricingInfo:{pricingModel:'PRICE_PER_DATASET_ITEM'}},source('pipeline'),30,false),null);
assert.equal(curatedCost({currentPricingInfo:{pricingModel:'PAY_PER_EVENT',pricingPerEvent:{actorChargeEvents:{lead:{}}}}},source('pipeline'),30,false),null);
assert.equal(currentPrice({pricingInfos:[{startedAt:'2020-01-01',pricingModel:'FREE'},{startedAt:'2099-01-01',pricingModel:'PAID'}]}).pricingModel,'FREE');
assert.ok(curatedCost({currentPricingInfo:pricing},source('microworlds'),30,true).estimateUsd>.4);
assert.ok(curatedCost({currentPricingInfo:pricing},source('brave'),30,false).estimateUsd>.34);
assert.deepEqual(schemaInput({country:['السعودية'],role:['C-Level']},{properties:{country:{type:'array',items:{enum:['Saudi Arabia']}},role:{type:'array',items:{enum:['c_suite']}}}}),{country:['Saudi Arabia'],role:['c_suite']});
assert.throws(()=>schemaInput({industry:['made-up']},{properties:{industry:{items:{enum:['Construction']}}}}),/Unsupported/);
assert.deepEqual(schemaInput({region:'sa'},{properties:{region:{enum:['sa','ae']}}}),{region:'sa'});
const bayutSchema={properties:Object.fromEntries(['startUrls','maxItems','fullDetails','enrichEmails','instantDatabase','enrichDld','monitoringMode','maxConcurrency','maxRequestRetries'].map(k=>[k,{}]))};
const input=buildSourceInput(source('bayut'),{filters:{}},intent('Bayut listing contacts in Riyadh'),30,true,bayutSchema);
assert.equal(input.startUrls[0],'https://www.bayut.sa/en/for-sale/property/riyadh/');
assert.equal(input.instantDatabase,false);
assert.throws(()=>buildSourceInput(source('bayut'),{filters:{}},{...intent('Bayut'),sourceUrl:'https://www.bayut.com/for-sale/'},30,true,bayutSchema),/Saudi source/);
const phones=recordPhones({contactName:'A',id:966551234567,phoneNumber:{mobile:'0551234567',whatsapp:'+966551234567',proxyPhone:'+966112345678'},'Phone Reveal Key':'966599999999'});
assert.equal(phones.length,2); assert.equal(phones[0].number,'+966551234567'); assert.ok(phones.some(p=>p.label==='Listing relay'));
const record={contactName:'مكتب مثال',phoneNumber:{mobile:'0551234567',phone:'+966112345678'},location:[{name:'Saudi Arabia'},{name:'Riyadh'},{name:'Al Olaya'}]};
assert.equal(normalizeSourceRecord(record,source('bayut'),{city:'Riyadh',district:'Al Olaya'},true).phone_numbers.length,2);
assert.equal(normalizeSourceRecord(record,source('bayut'),{city:'Jeddah'},true),null);
assert.equal(normalizeSourceRecord({...record,phoneNumber:{}},source('bayut'),{},true),null);
assert.ok(normalizeSourceRecord({...record,phoneNumber:{}},source('bayut'),{},false));
assert.equal(normalizeSourceRecord({propertyTitle:'شقة مفروشة',city:'Riyadh'},source('gathern'),{city:'Riyadh'},false).name,'شقة مفروشة');
assert.equal(normalizeSourceRecord({member_display_name:'مثال',phone_number:'0555555001',phone_reveal_key:'966555555555',city_label:'Riyadh',post_url:'/search/123'},source('opensooq'),{city:'Riyadh'},true).source_reference,'https://sa.opensooq.com/search/123');
assert.equal(normalizeSourceRecord({name:'A',description:'Saudi Riyadh',country:'United States'},source('pipeline'),{},false),null);
assert.equal(normalizeSourceRecord({name:'A',country:'Saudi Arabia',website:'https://example.test'},source('pipeline'),{noWebsite:true},false),null);
const pipelineRecord = { fullName:'Example Founder',companyName:'Example Agency',companyCountry:'Saudi Arabia',companyCity:'Riyadh',companyDomain:'agency.example',companyIndustry:['Marketing & Advertising'],phone:'0551234567' };
const normalizedPipeline = normalizeSourceRecord(pipelineRecord,source('pipeline'),{},true);
assert.equal(normalizedPipeline.website,'https://agency.example');
assert.equal(normalizedPipeline.industry,'Marketing & Advertising');
assert.equal(normalizeSourceRecord(pipelineRecord,source('pipeline'),{noWebsite:true},true),null,'A companyDomain must never be mistaken for no website');
assert.equal(recordMatchesIndustry(pipelineRecord,{companyIndustryIncludes:['marketing_agency']}),true);
assert.equal(recordMatchesIndustry({...pipelineRecord,companyIndustry:['Agriculture']},{companyIndustryIncludes:['marketing_agency']}),false);
assert.equal(recordMatchesIndustry({...pipelineRecord,companyIndustry:undefined},{companyIndustryIncludes:['marketing_agency']}),false);
assert.equal(intent('وكالات التسويق بدون موقع أو بموقع ضعيف').weakWebsite,true);
assert.equal(normalizeSourceRecord(pipelineRecord,source('pipeline'),{weakWebsite:true},true),null,'Directories are not website quality assessments');
assert.equal(schemaInput({industry:['marketing_agency']},{properties:{industry:{items:{enum:['Marketing & Advertising']}}}}).industry[0],'Marketing & Advertising');
assert.equal(schemaInput({keywords:['marketing']},{properties:{keywords:{}}}).keywords[0],'marketing','Industry aliases must not rewrite keywords');
assert.deepEqual(schemaInput({personTitleIncludes:['مالك','مدير عام','المؤسس','المدير التنفيذي'],personLocationCityIncludes:['الرياض','جدة']},{properties:{personTitleIncludes:{items:{enum:['Owner','General Manager','Founder','CEO']}},personLocationCityIncludes:{items:{enum:['Riyadh','Jeddah']}}}}),{personTitleIncludes:['Owner','General Manager','Founder','CEO'],personLocationCityIncludes:['Riyadh','Jeddah']});
assert.deepEqual(schemaInput({keywords:['مالك','السعودية','مدير عام'],companyNameIncludes:['مالك'],companyDomainIncludes:['sa']},{properties:{keywords:{},companyNameIncludes:{},companyDomainIncludes:{}}}),{keywords:['مالك','السعودية','مدير عام'],companyNameIncludes:['مالك'],companyDomainIncludes:['sa']},'Only typed filters may be canonicalized; names/domains/keywords stay literal');
assert.deepEqual(schemaInput({companyIndustryIncludes:['عيادات الأسنان'],companyIndustryExcludes:['مستشفى']},{properties:{companyIndustryIncludes:{items:{enum:['Dentistry','Medical Practice']}},companyIndustryExcludes:{items:{enum:['Hospital']}}}}),{companyIndustryIncludes:['Dentistry'],companyIndustryExcludes:['Hospital']});
const dentalFilters={personTitleIncludes:['مالك','مدير عام'],companyIndustryIncludes:['عيادات الأسنان'],companyIndustryExcludes:['مستشفى','سلسلة'],companyLocationCityIncludes:['الرياض']};
const dentalSchema={properties:{companyLocationCountryIncludes:{items:{enum:['Saudi Arabia']}},companyLocationCityIncludes:{items:{enum:['Riyadh']}},personTitleIncludes:{items:{enum:['Owner','General Manager']}},companyIndustryIncludes:{items:{enum:['Medical Practice','Hospital & Health Care']}},companyIndustryExcludes:{items:{enum:['Medical Practice','Hospital & Health Care']}},totalResults:{},hasPhone:{},hasEmail:{},roleMatchMode:{},companyMatchMode:{}}};
const dentalPostFilters=[];
const dentalInput=buildSourceInput(source('pipeline'),{filters:dentalFilters},intent('عيادات الأسنان في الرياض'),30,true,dentalSchema,dentalPostFilters);
assert.deepEqual(dentalInput.personTitleIncludes,['Owner','General Manager']);assert.deepEqual(dentalInput.companyLocationCityIncludes,['Riyadh']);
assert.equal(dentalInput.companyIndustryIncludes,undefined,'Never widen dentistry into generic Medical Practice or healthcare');
assert.equal(dentalInput.companyIndustryExcludes,undefined,'Excluding hospitals must not exclude all healthcare, including dental clinics');
assert.ok(dentalPostFilters.some(f=>f.key==='companyIndustryIncludes'&&f.values.includes('عيادات الأسنان')),'Retain unsupported specific dental criteria for evidence review');
assert.ok(dentalPostFilters.some(f=>f.key==='companyIndustryExcludes'&&f.values.includes('سلسلة')),'Retain unsupported chain exclusions; missing chain evidence cannot be assumed');
for (const record of [
  {companyIndustry:'Dentistry'}, {companyIndustry:'Dental Practices'}, {companyIndustry:'Dentists'},
  {companyIndustry:'Medical Practice',companyName:'Riyadh Dental Clinic'},
  {companyIndustry:'Medical Practice',companySpecialties:['Dentistry']},
  {companyIndustry:'Medical Practice',companyDescription:'A private dental practice in Riyadh.'},
  {companyIndustry:'Medical Practice',companyName:'عيادات ابتسامة لطب الأسنان'},
]) assert.equal(recordMatchesIndustry(record,{companyIndustryIncludes:['عيادات الأسنان']}),true,'Explicit dental evidence must match the narrow dental target');
for (const record of [{companyIndustry:'Medical Practice'},{companyIndustry:'Hospital & Health Care'},{companyIndustry:'Healthcare',companyName:'Riyadh Medical Center'},{companyIndustry:'Medical Practice',companyDescription:'Confidential medical services'}]) assert.equal(recordMatchesIndustry(record,{companyIndustryIncludes:['عيادات الأسنان']}),false,'Generic medical evidence must not be sold as dental evidence');
assert.equal(recordMatchesIndustry({companyIndustry:'Hospital & Health Care',companyName:'Dental Hospital'},{companyIndustryIncludes:['عيادات الأسنان'],companyIndustryExcludes:['مستشفى']}),false,'Hospital exclusions survive Arabic canonicalization');
assert.equal(recordMatchesIndustry({companyIndustry:'Hospital & Health Care',companyName:'Riyadh Dental Clinic'},{companyIndustryIncludes:['عيادات الأسنان'],companyIndustryExcludes:['مستشفى']}),true,'A broad healthcare label is not evidence a dental clinic is a hospital');
assert.equal(recordMatchesIndustry(pipelineRecord,{companyIndustryIncludes:['Marketing and Advertising']}),true);
const partialEnumSchema={...dentalSchema,properties:{...dentalSchema.properties,companyKeywordIncludes:{type:'array'},companySizeIncludes:{items:{enum:['51-200','201-500']}}}};
const alternatives=[];
const partialInput=buildSourceInput(source('pipeline'),{filters:{companySizeIncludes:['51-200','5000+']}},intent('marketing companies in Riyadh'),10,true,partialEnumSchema,alternatives);
assert.equal(partialInput.companySizeIncludes,undefined,'Do not intersect supported and unsupported OR alternatives');
assert.deepEqual(alternatives.find(f=>f.key==='companySizeIncludes').values,['51-200','5000+']);
assert.equal(alternatives.find(f=>f.key==='companySizeIncludes').operator,'any');
const dentalHint=buildSourceInput(source('pipeline'),{filters:dentalFilters},intent('عيادات الأسنان في الرياض'),10,true,partialEnumSchema,[]);
assert.deepEqual(dentalHint.companyKeywordIncludes,['dental'],'Use documented dental keyword support, not an unfiltered city-wide search');
assert.equal(recordMatchesIndustry({companyName:'Example'},{companyIndustryExcludes:['مستشفى']}),false,'Missing industry evidence cannot establish an exclusion');
assert.equal(recordMatchesRole({title:'Founder & Chief Executive Officer'},{personTitleIncludes:['CEO']}),true);
assert.equal(recordMatchesRole({title:'CTO'},{personTitleIncludes:['CEO','Founder']}),false);
assert.equal(recordMatchesRole({title:'Co-Founder'},{personTitleIncludes:['Founder']}),true);
for (const title of ['CoFounder','cofounder','Co-Founder','المؤسس','الشريك المؤسس','مؤسس ومدير','الرئيس والمؤسس','الرئيس والشريك المؤسس']) {
  assert.equal(recordMatchesRole({title},{personTitleIncludes:['Founder']}),true,`Recognize founder title: ${title}`);
  assert.equal(recordMatchesRole({title},{personTitleExcludes:['Founder']}),false,`Founder exclusions use the same aliases: ${title}`);
}
for (const title of ['المدير التنفيذي','مدير تنفيذي','الرئيس التنفيذي والمؤسس','المؤسس والمدير التنفيذي','Founder & CEO']) {
  assert.equal(recordMatchesRole({title},{personTitleIncludes:['CEO']}),true,`Recognize CEO title: ${title}`);
}
for (const title of ['المالك','مالك الشركة','صاحب الشركة','صاحب المؤسسة','المؤسس ومالك المؤسسة','المدير وصاحب المنشأة']) {
  assert.equal(recordMatchesRole({title},{personTitleIncludes:['Owner']}),true,`Recognize owner title: ${title}`);
}
for (const title of ['CTO','Chief Technology Officer','SEO Specialist','Specialist','CEOperations','Foundering specialist','Ownership analyst','مؤسسات','مالكيات']) {
  assert.equal(recordMatchesRole({title},{personTitleIncludes:['CEO','Founder','Owner']}),false,`Do not match title substrings: ${title}`);
}
assert.equal(recordMatchesRole({title:'الشريك المؤسس'},{personTitleIncludes:['CoFounder']}),true);
assert.equal(recordMatchesRole({title:'Founder'},{personTitleIncludes:['CoFounder']}),false,'A co-founder request stays specific');
assert.equal(recordMatchesRole({title:'CEO'},{personTitleIncludes:['المدير التنفيذي']}),true,'Arabic role filters use the same precise alias group');
assert.equal(recordMatchesRole({title:'General Manager'},{personTitleIncludes:['مدير عام']}),true);
assert.equal(recordMatchesRole({title:'المدير العام'},{personTitleIncludes:['General Manager']}),true);
assert.equal(recordMatchesRole({title:'Owner'},{personTitleIncludes:['مالك','مدير عام']}),true);
assert.equal(recordMatchesRole({title:'Sales Manager'},{personTitleIncludes:['مدير عام']}),false,'General manager is not every manager');
assert.equal(recordMatchesRole({title:'Sales Manager'},{personTitleExcludes:['Manager']}),false);
assert.equal(normalizeTender({tender_url:'https://evil.test',submission_deadline:'2099-01-01T10:00:00'}),null);
assert.equal(normalizeTender({tender_url:'https://tenders.etimad.sa/Tender/DetailsForVisitor?id=1',submission_deadline:'2020-01-01T10:00:00'}),null);
assert.ok(normalizeTender({tender_url:'https://tenders.etimad.sa/Tender/DetailsForVisitor?id=1',submission_deadline:'2099-01-01T10:00:00'}));
console.log('Curated catalog, deterministic routing, FREE-tier costs, schema filters, multiple phones, location and tender checks passed. No external calls.');
