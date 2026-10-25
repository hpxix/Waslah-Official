import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {compactRunTitle,leadRunStatus,leadRunModel,shortRunDate} from '../src/lib/leadRunPresentation.ts';
import {LeadRunSelector} from '../src/components/LeadRunSelector.tsx';
assert.equal(compactRunTitle('People likely to buy كاميرات مراقبة',false),'كاميرات مراقبة');
assert.equal(compactRunTitle('People likely to buy ',false),'Lead search');
assert.equal(leadRunStatus('FAILED',false).label,'Stopped');
assert.equal(leadRunStatus('running',true).tone,'live');
assert.equal(leadRunModel({type:'b2b',contact_route:'astraeus_ultra'}),'Ultra');
assert.equal(shortRunDate('invalid',false),'—');
assert.ok(shortRunDate('2026-10-22T22:30:00Z',false).includes('23'));
const run={id:'fixture',type:'b2c',title:'People likely to buy Security cameras',status:'failed',result_count:2,target_count:30,created_at:'2026-10-23T00:00:00Z',error_message:'PRIVATE_PROVIDER_ERROR_MUST_NOT_RENDER'};
for(const ar of [false,true]){
  const html=renderToStaticMarkup(createElement(LeadRunSelector,{runs:[run],selectedId:'fixture',total:500,ar,onSelect:()=>{}}));
  assert.ok(!html.includes(run.error_message));
  assert.ok(!html.includes('People likely to buy'));
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(html.includes('aria-haspopup="menu"'));
  assert.ok(!html.includes('lead-run-selector__rail'));
  assert.ok(html.includes('Security cameras'));
  assert.ok(html.includes(ar?'dir="rtl"':'dir="ltr"'));
}
console.log('PASS: compact query dropdown, selected title, accessible menu trigger, concise statuses, Riyadh dates, RTL/LTR, and no cards or provider-error paragraphs.');
