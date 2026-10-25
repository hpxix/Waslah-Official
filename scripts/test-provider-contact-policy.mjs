import assert from 'node:assert/strict';
import {evaluateProviderContactPermission} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/provider-contact-policy.js';

const now=Date.parse('2026-10-25T12:00:00Z');
const record={id:'synthetic-permission',organization_id:'fixture',provider:'haraj',purpose:'lead_generation',subject_scope:'all_provider_subjects',contact_scope:'provider_contact_fields',actions:['lookup','save','reveal','download'],status:'active',evidence_reference:'synthetic-reviewed-agreement',evidence_digest:'a'.repeat(64),verified_by:'fixture-reviewer',verified_at:'2026-10-24',valid_from:'2026-10-24',expires_at:'2026-11-24'};
const evaluate=(row=record,scope={})=>evaluateProviderContactPermission(row,{organizationId:'fixture',provider:'haraj',action:'lookup',...scope},now);
assert.equal(evaluate().allowed,true,'lookup requires no individual consent when the provider permission covers it');
for(const action of ['save','reveal','download'])assert.equal(evaluate(record,{action,phone:'0555555001'}).allowed,true);
assert.equal(evaluate(record,{action:'call',phone:'0555555001'}).detail,'provider_action_not_authorized');
assert.equal(evaluate({...record,actions:['save']}).allowed,false,'provider save scope does not imply lookup');
assert.equal(evaluate(null).detail,'provider_permission_missing');
for(const change of [{organization_id:'other'},{provider:'mahally'},{purpose:'other'},{subject_scope:'some_subjects'},{contact_scope:'other'},{status:'revoked'},{revoked_at:'2026-10-25'},{evidence_reference:''},{evidence_digest:'bad'},{verified_by:''},{verified_at:'2026-12-01'},{valid_from:'2026-12-01'},{expires_at:'2026-10-01'},{actions:['export']},{actions:'broken'}])assert.equal(evaluate({...record,...change}).allowed,false,JSON.stringify(change));
assert.equal(evaluate(record,{action:'save',phone:'invalid'}).allowed,false);
for(const granted of ['lookup','save','reveal','download','call']){
  for(const requested of ['lookup','save','reveal','download','call']){
    assert.equal(evaluate({...record,actions:[granted]},{action:requested,phone:'0555555001'}).allowed,granted===requested,`${granted} must cover only ${granted}, not ${requested}`);
  }
  for(const state of [{status:'revoked'},{expires_at:'2026-10-01'}])assert.equal(evaluate({...record,actions:[granted],...state},{action:granted,phone:'0555555001'}).allowed,false,`${granted} must deny after expiry/revocation`);
}
console.log('PASS: explicit provider actions, reviewed evidence, workspace/provider isolation, expiry, revocation and phone validation. Synthetic evidence only.');
