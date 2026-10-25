import {execFileSync} from 'node:child_process';
const args=['-H','unix:///Users/altahan/.docker/run/docker.sock'];
let deploymentEnv=process.env;
const run=a=>execFileSync('docker',[...args,...a],{encoding:'utf8',env:deploymentEnv});
const live=JSON.parse(run(['inspect','waslah_directus']))[0].Config.Env;
const env=Object.fromEntries(live.map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));
// Preserve the deployed model choices; this release changes only Mahally.
const models=['B2C_OPENROUTER_MODEL','B2C_OPENROUTER_PLANNING_MODEL','B2C_OPENROUTER_QUALIFICATION_MODEL','OPENROUTER_CHAT_MODEL'];
deploymentEnv={...process.env,...Object.fromEntries(models.filter(k=>env[k]).map(k=>[k,env[k]]))};
const config=JSON.parse(run(['compose','--profile','mahally','config','--format','json'])).services.directus.environment;
const changedKeys=Object.keys(config).filter(k=>String(config[k])!==env[k]);
console.log(JSON.stringify({changedKeys}));
if(changedKeys.some(k=>!k.startsWith('MAHALLY_')))process.exitCode=1;
else if(process.argv.includes('--activate')){
  const active=run(['exec','waslah_postgres','psql','-U','waslah','-d','waslah','-Atc',"SELECT count(*) FROM b2c_campaigns WHERE status IN ('RUNNING','QUEUED');"]).trim();
  if(active!=='0')throw Error('Wait for active searches before backend recreation');
  console.log(run(['compose','--profile','mahally','up','-d','--no-deps','directus','mahally']));
}
