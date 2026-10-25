import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLiteSearchMode, liteRoutePolicy, validateLiteSearchMode, LITE_MODE_PREFIX } from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-search-mode.js';
const rows=new Map([[`${LITE_MODE_PREFIX}a`,{configuration:JSON.stringify({mode:'comments_only'})}],[`${LITE_MODE_PREFIX}b`,{configuration:{mode:'listings_only'}}]]);
const database=table=>{assert.equal(table,'feature_flags');return {where:({feature_key})=>({first:async()=>rows.get(feature_key)})};};
assert.equal(await readLiteSearchMode(database,'a'),'comments_only');
assert.equal(await readLiteSearchMode(database,'b'),'listings_only');
assert.equal(await readLiteSearchMode(database,'c'),'mixed');
assert.deepEqual(liteRoutePolicy('comments_only'),{comments:true,listings:false});
assert.deepEqual(liteRoutePolicy('listings_only'),{comments:false,listings:true});
assert.deepEqual(liteRoutePolicy('mixed'),{comments:true,listings:true});
for(const value of ['',null,'excellent','COMMENTS_ONLY',{},true]) assert.throws(()=>validateLiteSearchMode(value));
const backend=readFileSync(new URL('../directus/extensions/directus-extension-waslah-lead-agent/dist/index.js',import.meta.url),'utf8');
for(const method of ['get','put']){
 const endpoint=backend.split(`router.${method}('/admin/lite-search-mode'`)[1]?.split('}, logger));')[0];
 assert.ok(endpoint);assert.ok(endpoint.indexOf('adminContext(database, req)')<endpoint.indexOf('resolveAdminAccount(database,'),'authorization before account access');
}
const runner=readFileSync(new URL('../directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js',import.meta.url),'utf8');
assert.ok(runner.includes('const configuredLiteSearchMode = await readLiteSearchMode(database, campaign.user_id)'),'current server account mode is read for legacy/procurement searches');
assert.ok(runner.includes("plan.dealIntent!=='buy' ? 'mixed' : configuredLiteSearchMode"),'explicit staged sales policy supersedes old source-only flags');
assert.ok(!runner.includes('previousStats.liteSearchMode ||'),'no stale comments-only override after restoration');
assert.ok(runner.includes('{ publicOnly: publicKeywordProfile }'),'reference listing search does not send bearer credentials');
assert.ok(runner.includes('const strategies = routePolicy.listings &&'));
assert.ok(runner.includes('if (routePolicy.comments &&'));
assert.ok(runner.includes("acquisitionStage==='product_comments'"),'mixed comments must wait for the ordered comments stage');
assert.ok(runner.includes('if (routePolicy.listings && !plan.keywordMatching'),'comments-only cannot queue listing fallbacks');
console.log('PASS: account isolation, defaults, strict mode validation, exclusive route policies, campaign snapshots and admin-only endpoints.');
