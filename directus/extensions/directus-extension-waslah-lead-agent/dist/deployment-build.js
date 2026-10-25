import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';

// Captured once when the extension is imported, so HTTP reports the source
// fingerprint loaded by this process, rather than a later filesystem change.
const files=readdirSync(new URL('.',import.meta.url)).filter(name=>name.endsWith('.js')).sort();
const digest=createHash('sha256');
for(const file of files)digest.update(file+'\n').update(readFileSync(new URL(file,import.meta.url)));
export const deploymentBuild=Object.freeze({
  id:'wasla-haraj-provider-policy-20261025-v1',
  sha256:digest.digest('hex'),
  loadedAt:new Date().toISOString(),
  sourceFiles:files.length,
  features:Object.freeze({centralizedProviderAuthorization:true,phoneFreeCandidateAudit:true,authorizationDiagnostics:true}),
});
