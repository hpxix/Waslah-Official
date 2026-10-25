// Read-only offline regression against the screenshot's actual 200/200 run.
// No HTTP, no campaign writes, no lead creation/billing, no contact output.
import assert from 'node:assert/strict';
import knexFactory from '/directus/node_modules/.pnpm/knex@3.1.0_mysql2@3.15.3_pg@8.16.3_sqlite3@5.1.7_tedious@18.6.1/node_modules/knex/knex.js';
import {qualifyKeywordCandidate,usesPublicKeywordProfile} from '/directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-keywords.js';
import {publicSaudiPhone,shouldAttemptRemoteContact} from '/directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
const db=knexFactory({client:'pg',connection:{host:process.env.DB_HOST,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD},pool:{min:0,max:1}});
const parse=v=>typeof v==='string'?JSON.parse(v):v;
try {
  const campaign=await db('b2c_campaigns').where({id:'db3f180d-01d1-49b5-8417-60d76c363f30'}).first();
  assert.ok(campaign,'Historical reference must exist; do not substitute fake fixtures.');
  const plan=parse(campaign.acquisition_plan);
  const rows=await db('b2c_candidates').where({campaign_id:campaign.id,status:'DELIVERED'}).select('title','body_text','strategy');
  let accepted=0,publicPhones=0;
  for(const row of rows){const candidate={title:row.title,bodyText:row.body_text||'',matchedStrategy:parse(row.strategy)};accepted+=Number(qualifyKeywordCandidate(candidate,plan).isQualified);publicPhones+=Number(Boolean(publicSaudiPhone(candidate)));}
  assert.equal(rows.length,200);assert.equal(accepted,200);assert.equal(publicPhones,200);
  assert.equal(usesPublicKeywordProfile(plan),true,'Existing saved plans receive the restored execution profile too.');
  assert.equal(shouldAttemptRemoteContact({contactLookupMode:'public_contacts_only',contactAttempts:0}),false);
  console.log(JSON.stringify({historicalDelivered:rows.length,replayAccepted:accepted,publicPhoneExamples:publicPhones,newSourceRequests:0,newLeads:0,billed:0}));
} finally {await db.destroy();}
