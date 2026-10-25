import assert from 'node:assert/strict';
import {liteRoutePolicy,liteWorkRemaining} from '../directus/extensions/directus-extension-waslah-lead-agent/dist/lite-search-mode.js';
const pending={complete:false,stopReason:'time_budget'};
for(const mode of ['comments_only','mixed'])assert.equal(liteWorkRemaining(liteRoutePolicy(mode),{sourceExhausted:true,commentDiscovery:pending}),true,`${mode} must finish the comment queue even after listing routes end`);
for(const mode of ['mixed','listings_only'])assert.equal(liteWorkRemaining(liteRoutePolicy(mode),{sourceExhausted:false,commentDiscovery:{complete:true}}),true,`${mode} must keep scanning fresh listings`);
for(const mode of ['mixed','listings_only','comments_only'])assert.equal(liteWorkRemaining(liteRoutePolicy(mode),{sourceExhausted:true,commentDiscovery:{complete:true}}),false,`${mode} must stop on exhausted permitted sources`);
assert.equal(liteWorkRemaining(liteRoutePolicy('listings_only'),{sourceExhausted:true,commentDiscovery:pending}),false,'admin-selected source exclusions remain respected');
console.log('PASS: all Lite source modes continue until their permitted queues and listing routes are exhausted.');
