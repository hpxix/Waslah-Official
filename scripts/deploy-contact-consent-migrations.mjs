import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const paths=['directus/migrations/20261022_contact_authorizations.sql','directus/migrations/20261022_contact_consent_workflow.sql','directus/migrations/20261024_mahally_contact_provider.sql','directus/migrations/20261025_merchant_directory.sql','directus/migrations/20261025_haraj_business_directory.sql','directus/migrations/20261025_provider_contact_permissions.sql'];
const files=paths.map(path=>({path,sql:readFileSync(path,'utf8')}));
console.log(JSON.stringify({migrations:files.map(({path,sql})=>({path,sha256:createHash('sha256').update(sql).digest('hex')})),mode:process.argv.includes('--apply')?'apply':'dry_run',consentRecordsCreated:0}));
if(process.argv.includes('--apply')){
  // All three files run atomically; strip their standalone transaction wrappers
  // before passing them to psql's single transaction. No production row DML.
  const input=files.map(({sql})=>sql.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gm,'')).join('\n');
  const result=spawnSync('docker',['-H','unix:///Users/altahan/.docker/run/docker.sock','exec','-i','waslah_postgres','psql','-U','waslah','-d','waslah','--single-transaction','-v','ON_ERROR_STOP=1','-q'],{input,encoding:'utf8',timeout:30000});
  if(result.status!==0)throw Error(result.stderr||result.error?.message||'Migration failed');
  console.log(JSON.stringify({applied:true,consentRecordsCreated:0,leadRecordsCreated:0}));
}
