import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const migrations=['directus/migrations/20261022_contact_authorizations.sql','directus/migrations/20261022_contact_consent_workflow.sql','directus/migrations/20261024_mahally_contact_provider.sql','directus/migrations/20261025_merchant_directory.sql'].map(path=>readFileSync(path,'utf8'));
const source=`const migrations=${JSON.stringify(migrations)};\n${readFileSync('scripts/test-contact-consent-postgres.mjs','utf8')}`;
const result=spawnSync('docker',['-H','unix:///Users/altahan/.docker/run/docker.sock','exec','-i','waslah_directus','node','--input-type=module'],{input:source,encoding:'utf8',timeout:60000});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.error)throw result.error;process.exitCode=result.status??1;
