import {randomUUID} from 'node:crypto';
import {saveCandidate} from './b2c.js';
import {createContactAuthorizer} from './contact-authorization.js';
import {recordContactAuthorization} from './contact-diagnostics.js';
import {PROVIDER_CONTACT_POLICY_TABLE} from './provider-contact-policy.js';

// Admin-only deployment verification. Executes the real candidate writer and
// centralized policy inside a transaction that is always rolled back. Uses no
// provider transport, consent creation, lead delivery, wallet or campaign job.
export async function runDeploymentSmoke(database){
  if(!await database.schema.hasTable(PROVIDER_CONTACT_POLICY_TABLE))throw Error('Provider permission migration is absent.');
  const campaign=await database('b2c_campaigns').select('id','organization_id').orderBy('created_at','desc').first();
  if(!campaign)throw Error('A campaign is required to verify the existing candidate schema.');
  const marker=`deployment-smoke-${randomUUID()}`;
  const candidateKey=`${campaign.id}:-1:${marker}`;
  const syntheticPhone='0555555001';
  const rollback=new Error('DEPLOYMENT_SMOKE_ROLLBACK');
  let result;
  try{
    await database.transaction(async trx=>{
      const candidate={postId:-1,authorId:-1,authorUsername:'synthetic-deployment-smoke',title:'Synthetic phone-free discovery',bodyText:`Synthetic contact ${syntheticPhone}`,tags:[],matchedStrategy:{searchTerm:marker,strategyType:'DEPLOYMENT_SMOKE'}};
      await saveCandidate(trx,campaign,candidate,{isQualified:true,score:80,explanation:'Synthetic deployment verification'});
      const row=await trx('b2c_candidates').where({candidate_key:candidateKey}).first();
      if(!row||row.status!=='QUALIFIED'||JSON.stringify(row).includes(syntheticPhone)||JSON.stringify(row).includes('+966555555001'))throw Error('Phone-free candidate audit verification failed.');
      const decision=await createContactAuthorizer(trx,campaign.organization_id)({authorId:-1,action:'lookup'});
      const diagnostics={candidatesDiscovered:1,uniqueQualifiedBuyers:1,eligiblePhoneLookups:0,successfulAuthorizedLookups:0,persistedDeliverableLeads:0};
      recordContactAuthorization(diagnostics,decision,{lookup:true});
      result={candidateAuditSaved:true,syntheticPhoneRedacted:true,candidateStatus:row.status,providerPermissionTableExists:true,centralizedPolicyLoaded:Boolean(decision.providerAuthorization),authorizationDiagnostics:diagnostics,providerRequests:0,deliverableLeadsCreated:0};
      if(!result.centralizedPolicyLoaded)throw Error('Centralized provider policy is absent.');
      throw rollback;
    });
  }catch(error){if(error!==rollback)throw error;}
  if(await database('b2c_candidates').where({candidate_key:candidateKey}).first())throw Error('Deployment smoke data was not rolled back.');
  return {...result,syntheticRowsRolledBack:true};
}
