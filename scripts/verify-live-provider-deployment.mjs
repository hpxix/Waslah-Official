import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const expected=JSON.parse(readFileSync(process.argv[2],'utf8'));
const performSmoke=process.argv.includes('--smoke');
const source=`
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readdirSync} from 'node:fs';
const expected=${JSON.stringify({id:expected.id,sha256:expected.sha256})};
const performSmoke=${JSON.stringify(performSmoke)};
const require=createRequire(import.meta.url);
const folder=readdirSync('/directus/node_modules/.pnpm').find(name=>name.startsWith('knex@'));
const knex=require('/directus/node_modules/.pnpm/'+folder+'/node_modules/knex');
const db=knex({client:'pg',connection:{host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD},pool:{min:0,max:1}});
try{
  const direct=await fetch('http://127.0.0.1:8055/lead-agent/health');assert.equal(direct.status,200);
  const health=(await direct.json()).data;
  assert.equal(health.build.id,expected.id);assert.equal(health.build.sha256,expected.sha256);
  const proxied=await fetch('http://frontend/directus/lead-agent/health');assert.equal(proxied.status,200);
  const proxyHealth=(await proxied.json()).data;assert.equal(proxyHealth.build.sha256,expected.sha256);
  const denied=await fetch('http://127.0.0.1:8055/lead-agent/admin/deployment-smoke',{method:'POST'});
  assert.ok([401,403].includes(denied.status),'smoke endpoint must require an administrator');
  assert.equal(await db.schema.hasTable('wasla_provider_contact_permissions'),true);
  const permissionCount=Number((await db('wasla_provider_contact_permissions').count('* as n').first()).n);assert.equal(permissionCount,0,'No provider scopes may be activated');
  if(!performSmoke){console.log(JSON.stringify({instance:'waslah_directus',database:process.env.DB_DATABASE,liveBuild:health.build,frontendProxyMatches:true,adminAccessEnforced:true,providerPermissionTableExists:true,providerPermissionRecords:permissionCount,authenticatedSmoke:'pending'},null,2));}
  else{
  assert.ok(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD,'Configured administrator login is unavailable');
  const login=await fetch('http://127.0.0.1:8055/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
  assert.equal(login.status,200,'Configured administrator login failed');
  const accessToken=(await login.json()).data?.access_token;assert.ok(accessToken,'Administrator login returned no access token');
  const before=Number((await db('b2c_candidates').count('* as n').first()).n);
  const response=await fetch('http://127.0.0.1:8055/lead-agent/admin/deployment-smoke',{method:'POST',headers:{authorization:'Bearer '+accessToken}});
  assert.equal(response.status,200,'Authenticated production smoke failed: '+JSON.stringify(response.status===200?{}:await response.json()));
  const smoke=(await response.json()).data;
  assert.equal(smoke.build.sha256,expected.sha256);assert.equal(smoke.candidateAuditSaved,true);assert.equal(smoke.syntheticPhoneRedacted,true);assert.equal(smoke.centralizedPolicyLoaded,true);assert.equal(smoke.providerPermissionTableExists,true);assert.equal(smoke.syntheticRowsRolledBack,true);assert.equal(smoke.providerRequests,0);
  assert.equal(smoke.authorizationDiagnostics.providerDecisionsByReason.provider_permission_missing,1);
  assert.equal(smoke.authorizationDiagnostics.individualConsentByReason.consent_record_missing,1);
  const leftovers=Number((await db('b2c_candidates').where('candidate_key','like','%deployment-smoke-%').count('* as n').first()).n);assert.equal(leftovers,0);
  const after=Number((await db('b2c_candidates').count('* as n').first()).n);
  console.log(JSON.stringify({instance:'waslah_directus',database:process.env.DB_DATABASE,liveBuild:health.build,frontendProxyMatches:true,adminAccessEnforced:true,smoke,providerPermissionRecords:permissionCount,candidatesBefore:before,candidatesAfter:after,syntheticRowsRemaining:leftovers},null,2));
  }
}finally{await db.destroy();}
`;
const result=spawnSync('docker',['exec','-i','waslah_directus','node','--input-type=module'],{input:source,encoding:'utf8',timeout:60000});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.error)throw result.error;
process.exitCode=result.status??1;
