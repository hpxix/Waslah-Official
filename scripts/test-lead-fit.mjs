import assert from 'node:assert/strict';
import { classifyUltraLead } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lead-fit.js';

const input = {
  companyIndustryIncludes: ['Real Estate Development'],
  personTitleIncludes: ['Founder'],
  personLocationCityIncludes: ['Riyadh'],
};
const exact = { companyName: 'Saudi Homes', companyIndustry: 'Real Estate Development', job_title: 'Founder', personCity: 'Riyadh' };
assert.equal(classifyUltraLead(exact, input), 'exact');
assert.equal(classifyUltraLead({ ...exact, companyIndustry: 'Construction Consulting' }, input), 'related');
assert.equal(classifyUltraLead({ ...exact, companyIndustry: 'Construction Consulting', companyDescription: 'We serve real estate development firms' }, input), 'related');
assert.equal(classifyUltraLead({ ...exact, job_title: 'Sales Director' }, input), 'related');
assert.equal(classifyUltraLead({ ...exact, personCity: 'Jeddah' }, input), 'related');
assert.equal(classifyUltraLead({ ...exact, companyDescription: 'Real Estate Development' }, { ...input, companyIndustryExcludes: ['Real Estate Development'] }), 'excluded');
console.log('PASS: exact matches retained; adjacent sector, role, city, and exclusions fail closed.');
