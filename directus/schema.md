# Directus Backend Blueprint

## Collections

- `products`: name, description, audience, differentiators, pain_points, pricing_notes, created_at
- `leads`: name, title, company, email, phone, location, source, status, fit_score, revenue_estimate, employees, industry, company_slug, last_seen_update_at, created_at
- `lead_research`: lead, company_slug, strengths, weaknesses, opportunities, technology_stack, decision_makers, recent_updates, sources, raw_payload, created_at
- `lead_intake_sessions`: transcript, target_summary, required_fields, confidence, apify_actor, apify_input, status, created_at
- `proposals`: lead, title, pain_points, solution, scope, pricing, status, generated_copy, created_at
- `email_templates`: name, subject, body, category, is_premium, performance_score
- `email_campaigns`: lead, template, subject, body, status, sent_at

## Flow Endpoints

- `POST /flows/trigger/waslah-ai`: OpenAI clarification assistant. Return `{ confidence, summary, missing, apifyActor, apifyInput }`.
- `POST /flows/trigger/apify-leads`: Runs Apify actor only when `confidence === 100`. Inserts normalized `leads`.
- `POST /flows/trigger/perplexity-research`: Uses Perplexity to research one company/lead and inserts `lead_research`.
- `POST /flows/trigger/openai-proposal`: Generates proposal copy from product context, lead, and research.
- `POST /flows/trigger/email-campaign`: Sends or queues a campaign email through your mail provider.

Keep OpenAI, Apify, Perplexity, and mail-provider secrets in Directus environment variables.
