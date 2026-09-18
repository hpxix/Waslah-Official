# Provider Setup

## Required For The First Live Run

| Provider | Environment variables | Purpose |
| --- | --- | --- |
| Directus | `DIRECTUS_PUBLIC_URL`, `DIRECTUS_ADMIN_EMAIL`, `DIRECTUS_ADMIN_PASSWORD`, `KEY`, `SECRET` | Identity, API, data, and bootstrap |
| n8n | `N8N_LEAD_AGENT_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_ENCRYPTION_KEY` | Workflow orchestration and callback authentication |
| Apify | `APIFY_TOKEN`, `APIFY_ACTOR_ID` | Lead sourcing |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_RESEARCH_MODEL` | Perplexity-backed deep research through one model gateway |
| Haraj | `HARAJ_POSTS_URL`, `HARAJ_POST_CONTACT_URL`, `HARAJ_BEARER_TOKEN` | B2C marketplace retrieval and post contact resolution |
| Vapi | `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`, `VAPI_WEBHOOK_SECRET` | AI qualification calls and callbacks |
| Twilio Verify | `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Production phone OTP |
| Google Identity | `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | Google account creation and sign-in |
| Microsoft Identity | `AUTH_MICROSOFT_CLIENT_ID`, `AUTH_MICROSOFT_CLIENT_SECRET` | Microsoft account creation and sign-in |
| Sign in with Apple | `AUTH_APPLE_CLIENT_ID`, `AUTH_APPLE_CLIENT_SECRET` | Apple account creation and sign-in |
| Postiz | `POSTIZ_BASE_URL`; workspace API key entered in Socials | Approval-controlled social scheduling through a hosted or self-hosted Postiz instance |
| Chatwoot | `CHATWOOT_BASE_URL`; workspace token and account ID entered in Socials | Unified customer inbox, reply context, and operator-approved replies |

Add `OPENAI_API_KEY` for lead-intent parsing and qualification logic. B2B account intelligence now uses Relevance AI: set `RELEVANCE_API_KEY`, `RELEVANCE_PROJECT_ID`, `RELEVANCE_REGION`, and `RELEVANCE_AGENT_ID` in the server-only, ignored `.env.relevance` file. SMTP or Resend is only needed for outreach. Tap or HyperPay is only needed when paid wallet top-ups are introduced.

Research starts only through POST `/lead-agent/leads/:id/research`, with a valid person LinkedIn profile on the existing B2B lead. The Relevance trigger receives only that URL. Existing `lead_research_reports` rows persist the task ID and status inside private report metadata; API responses omit that metadata. GET `/lead-agent/research` and GET `/lead-agent/leads/:id/research` observe existing tasks, never start paid runs. Results are reconciled when the workspace is open or revisited. Completed reports are cached. Explicit `{ "refresh": true }` starts a new run; ambiguous submissions require administrator reconciliation instead of an automatic retry. Relevance agent approval pauses remain visible and require administrator action.

The Researched Leads view filters existing workspace leads with completed reports. Missing contact fields and LinkedIn URLs are never synthesized. Verification: `docker exec -i waslah_directus node --input-type=module < scripts/test-lead-core.mjs` uses rollback fixtures and a mocked Relevance protocol, with no paid research calls.

Do not place OpenAI, OpenRouter, Perplexity, or Apify tokens in any `VITE_` variable. Browser-exposed variables are visible to users; these keys must stay in Directus or n8n environment files only.

## Growth And Social Automation

Wasla integrates the open-source layers through server-side adapters instead of embedding credentials in the frontend:

- Postiz is the publishing transport. Each customer connects their own Postiz workspace key in Socials, then uses **Sync publishing accounts** to import Instagram, Facebook, and TikTok routing. Platform keys remain in Postiz. Wasla drafts content and requires explicit approval before scheduling.
- Chatwoot is the conversation transport. Each customer adds their own account ID and access token in Socials. Wasla reads that account's conversations, drafts replies using Business DNA, and sends only after an operator approves.
- Langfuse environment examples are reserved for a later telemetry release. Instrumentation is not implemented; adding keys alone does not activate tracing.

Recommended production topology is to deploy Postiz and Chatwoot as separate, independently scalable services on private networking. Their databases, workers, updates, webhooks, and provider OAuth credentials should remain owned by those services. Wasla stores only the tenant routing metadata it needs, such as `postiz_integration_id`; provider or workspace secrets remain encrypted or server-only.

Publishing setup:

1. Deploy or subscribe to Postiz and set `POSTIZ_BASE_URL` to the API root ending in `/public/v1`.
2. In Wasla Socials, configure **Postiz publishing** with a key scoped to that customer's Postiz workspace. Never reuse a cross-customer master key.
3. Connect social accounts in Postiz, then click **Sync publishing accounts** in Wasla. Manual `postiz_integration_id` routing remains available.
4. Complete Business DNA, generate a content draft, and open **Review draft** to edit its full text, media, account, format, and publishing time.
5. Save, approve the exact version, then schedule. Editing resets approval. Instagram/TikTok require public HTTPS media; Wasla does not generate image/video files in this release. Video scripts must be turned into a caption and produced video before scheduling.
6. TikTok currently uses inbox upload, requiring the user to complete publication in TikTok. A `scheduled` state confirms Postiz acceptance, not final publication. Manage cancellations and publishing outcomes in Postiz.

Inbox setup:

1. Deploy Chatwoot and connect the required WhatsApp, Instagram, Facebook, or other inboxes there.
2. Set `CHATWOOT_BASE_URL` on Directus. Each customer adds their Chatwoot account ID and scoped access token under Socials → Chatwoot inbox.
3. Open Growth Engine → Unified inbox. Use “Draft with Wasla,” review the response, and send it explicitly.

No integration can promise zero provider enforcement risk. Use official provider connections, conservative rate limits, human approval, accurate consent, and each channel's current policies.

### Isolation, deployment, and recovery

- Service base URLs are server-owned; customers cannot supply arbitrary servers to receive secrets. Customer credentials are encrypted with AES-256-GCM using `SOCIAL_TOKEN_ENCRYPTION_KEY` (or Directus `SECRET`), and are never returned in API responses. Back up this key securely; changing it without a migration requires reconnecting accounts.
- Legacy server keys work only when `POSTIZ_ORGANIZATION_ID` / `CHATWOOT_ORGANIZATION_ID` explicitly map them to one Wasla organization. There is no implicit shared service account. Use distinct provider workspaces/accounts per customer.
- Concurrent scheduling requests claim one approved version atomically. Submitted versions are locked. Timeouts after submission become `unknown`, not retryable failures; inspect Postiz first to avoid duplicate posts. An administrator may restore the item to `failed` only after confirming that no post was created.
- Postiz and Chatwoot adapters are implemented, but the services are not provisioned by the main Compose file. Deploy them separately and configure their URLs before enabling live use. External OAuth approvals, provider permissions, consent, and quota limits still apply.
- Campaigns and audience segments persist as planning records; no autonomous campaign runner, automated comment replies, Snapchat publishing, image/video generation, or Saudi trend ingestion is implemented in this release. Autonomy preferences are stored for future execution; current sends remain human-approved.
- Regression tests: `npm run test:growth`. Frontend checks in the sibling Green frontend: `npm run check`.

API references: [Postiz create post](https://docs.postiz.com/public-api/posts/create), [Postiz integrations](https://docs.postiz.com/public-api/integrations/list), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Haraj B2C

Keep live Haraj credentials in the ignored `.env.haraj` file. Directus reads it server-side in Docker; the frontend never receives the bearer token. The bundled taxonomy at `directus/extensions/directus-extension-waslah-lead-agent/dist/data/haraj_tags.json` is the only allowed tag source.

The B2C run first retrieves posts with a fixed query, stores and qualifies candidates, rejects likely sellers or competitors, and only then calls `postContact(postId)` for qualified HOT/WARM candidates. Tune page and scoring limits with the `HARAJ_*` and `B2C_*` settings documented in `.env.docker.example`.

## n8n

1. Start the optional service with `docker compose --env-file .env.docker --profile automation up -d`.
2. Open `http://localhost:5678` and create the owner account.
3. Import `n8n/workflows/lead-agent-directus.json`.
4. Confirm the webhook path is `waslah-lead-agent` and set `N8N_LEAD_AGENT_WEBHOOK_URL` to its production URL.
5. Test with one internal number before activating the workflow.

The template is inactive by default. It validates the incoming Directus bearer secret, stores leads through `X-Waslah-Workflow-Secret`, and rate-limits Vapi creation.

## Vapi

Configure the assistant or phone number server URL as:

```text
https://YOUR_DOMAIN/directus/lead-agent/webhooks/vapi
```

Create a Vapi custom credential that sends `X-Vapi-Secret` with the exact `VAPI_WEBHOOK_SECRET` value. Enable at least status and end-of-call report events.

Recommended structured analysis fields:

```json
{
  "qualification_status": "qualified | nurture | disqualified | review",
  "score": 0,
  "need": "string",
  "authority": "string",
  "budget": "string",
  "timeline": "string",
  "next_action": "string"
}
```

The workflow injects `organization_id`, `request_id`, and `lead_id` as trusted call metadata. Do not remove these fields.

## Social Account Creation

Directus handles the provider exchange and secure session. Wasla then asks only for the company name and phone number, creates the organization, membership, customer profile, and SAR wallet, and sends the normal phone OTP. Social authentication never grants the 30 SAR credit by itself.

1. Create a web OAuth/OpenID application with Google, Microsoft, or Apple.
2. Add the Directus callback URL to the provider. Locally these are `http://localhost:8055/auth/login/google/callback`, `http://localhost:8055/auth/login/microsoft/callback`, and `http://localhost:8055/auth/login/apple/callback`.
3. Fill the matching provider variables in `.env.docker`.
4. Set `AUTH_PROVIDERS` to the enabled comma-separated providers, such as `google,microsoft`.
5. Keep the frontend completion URL in each provider allow list: `http://localhost:3000/auth/social` locally, or the exact HTTPS production URL.
6. Recreate Directus with `docker compose --env-file .env.docker up -d --force-recreate directus`.

For production, set `DIRECTUS_PUBLIC_URL` to the externally reachable HTTPS Directus URL, set `SESSION_COOKIE_SECURE=true`, and configure the appropriate session cookie domain when the frontend and Directus use different subdomains. Apple requires a generated and periodically renewed client-secret JWT rather than a static secret.

Directus associates each user with one authentication provider. If an email already belongs to a password account, do not silently merge it with a new Google, Microsoft, or Apple identity; ask the user to sign in using the original method or handle a deliberate migration administratively.

## Phone Verification

Local development uses `SMS_PROVIDER=console` and exposes a random OTP only when `SMS_DEV_EXPOSE_CODE=true`. Production refuses console OTP unless that explicit development flag is present.

For live SMS, create a Twilio Verify Service and use `SMS_PROVIDER=twilio`. The API sends and checks OTP through Twilio; no plaintext code is stored in Directus.

## Secret Rotation

Rotate a secret by updating `.env.docker`, updating the corresponding provider credential, and recreating the affected services. Never commit `.env.docker`; only `.env.docker.example` belongs in Git.
