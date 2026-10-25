import assert from 'node:assert/strict';
import { buildAstraeusUltraInput, astraeusUltraMissing, isSaudiAstraeusUltraLead } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/astraeus-ultra.js';

const input = buildAstraeusUltraInput({
  personLocationCountryIncludes: ['United States'], hasPhone: false, totalResults: 50000,
  personTitleIncludes: ['CEO'], companyKeywordIncludes: ['software'], companySizeIncludes: ['11-50'],
  companyLocationCountryIncludes: ['United States'],
  roleMatchMode: 'any', companyMatchMode: 'any', resetProgress: true,
}, 30);
assert.deepEqual(input.personLocationCountryIncludes, ['Saudi Arabia']);
assert.equal(input.hasPhone, true);
assert.equal(input.hasEmail, true);
assert.equal(input.totalResults, 30);
assert.equal(input.roleMatchMode, 'all');
assert.equal(input.companyMatchMode, 'all');
assert.equal(input.companyKeywordMode, 'phrase');
assert.equal(input.companyLocationCountryIncludes, undefined);
assert.equal(input.resetProgress, false);
assert.deepEqual(astraeusUltraMissing(input, { fast: true }), []);
assert.deepEqual(astraeusUltraMissing(input, { fast: false }), ['product and customer outcome']);
assert.equal(isSaudiAstraeusUltraLead({ personCountry: 'Saudi Arabia', companyCountry: 'United States', phone: '+966500000000', email: 'ceo@example.com' }), true);
assert.equal(isSaudiAstraeusUltraLead({ personCountry: 'United States', companyCountry: 'Saudi Arabia', phone: '+966500000000', email: 'ceo@example.com' }), false);
assert.equal(isSaudiAstraeusUltraLead({ personCountry: 'Saudi Arabia', phone: '', email: 'ceo@example.com' }), false);
assert.equal(isSaudiAstraeusUltraLead({ personCountry: 'Saudi Arabia', phone: '+966500000000', email: '' }), false);
assert.equal(isSaudiAstraeusUltraLead({ rowType: 'diagnostic', personCountry: 'Saudi Arabia', phone: '+966500000000', email: 'ceo@example.com' }), false);
console.log('Astraeus Ultra filter and delivery checks passed.');
