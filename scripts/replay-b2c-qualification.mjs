// Explicit opt-in paid diagnostic. Run inside Directus; never saves or charges leads.
import { createRequire } from 'node:module';
import { qualifyCandidates, publicSaudiPhone } from '/directus/extensions/directus-extension-waslah-lead-agent/dist/b2c.js';
import { shadowJev } from '/directus/extensions/directus-extension-waslah-lead-agent/dist/b2c-pipeline.js';
if (process.env.ALLOW_PAID_REPLAY !== 'yes') throw new Error('Set ALLOW_PAID_REPLAY=yes to run this bounded provider test.');
const require = createRequire(import.meta.url);
const knex = createRequire(require.resolve('@directus/api'))('knex');
const db = knex({ client: 'pg', connection: { host: process.env.DB_HOST, port: process.env.DB_PORT || 5432, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE } });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const budget = { limitUsd: 0.25, reservedUsd: 0, requests: 0, inputUsdPerMillion: 1, outputUsdPerMillion: 4 };
const env = { ...process.env, OPENAI_API_KEY: '', __b2cReviewBudget: budget, __b2cDiagnostics: [] };
try {
  const campaigns = await db('b2c_campaigns').whereIn('id', ['061045fd-0a8c-4a18-818a-13415be8f9d9', 'c8d70a76-48d8-4840-9101-7ce974f92c96']);
  for (const campaign of campaigns) {
    const rows = await db('b2c_candidates').where({ campaign_id: campaign.id, status: 'REJECTED' }).whereRaw("qualification->>'verdict' = 'STRONG'").orderBy('post_id').limit(6);
    const candidates = rows.map(row => ({ postId: row.post_id, title: row.title, bodyText: row.body_text || '', city: row.city, updateDate: row.update_date, matchedStrategy: parse(row.strategy) }));
    const started = Date.now();
    const reviews = await qualifyCandidates(env, candidates, parse(campaign.acquisition_plan));
    const shadow = await shadowJev(env, candidates, parse(campaign.acquisition_plan));
    console.log(JSON.stringify({ campaign: campaign.name, elapsedMs: Date.now() - started, examples: candidates.map((candidate, i) => ({ title: candidate.title, oldScore: parse(rows[i].qualification).score, verdict: reviews[i].verdict, score: reviews[i].score, qualified: reviews[i].isQualified, deferred: !!reviews[i].retryable, publicPhone: !!publicSaudiPhone(candidate), jev: shadow[i].decision, probability: shadow[i].probability, reason: reviews[i].explanation })), reviewBudget: budget }));
  }
} finally { await db.destroy(); }
