# Provider Setup

## Required For The First Live Run

| Provider | Environment variables | Purpose |
| --- | --- | --- |
| Directus | `DIRECTUS_PUBLIC_URL`, `DIRECTUS_ADMIN_EMAIL`, `DIRECTUS_ADMIN_PASSWORD`, `KEY`, `SECRET` | Identity, API, data, and bootstrap |
| n8n | `N8N_LEAD_AGENT_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_ENCRYPTION_KEY` | Workflow orchestration and callback authentication |
| Apify | `APIFY_TOKEN`, `APIFY_ACTOR_ID` | Lead sourcing |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_RESEARCH_MODEL` | Perplexity-backed deep research through one model gateway |
| Vapi | `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`, `VAPI_WEBHOOK_SECRET` | AI qualification calls and callbacks |
| Twilio Verify | `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Production phone OTP |
| Google Identity | `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | Google account creation and sign-in |
| Microsoft Identity | `AUTH_MICROSOFT_CLIENT_ID`, `AUTH_MICROSOFT_CLIENT_SECRET` | Microsoft account creation and sign-in |
| Sign in with Apple | `AUTH_APPLE_CLIENT_ID`, `AUTH_APPLE_CLIENT_SECRET` | Apple account creation and sign-in |

Add `OPENAI_API_KEY` for lead-intent parsing and qualification logic. For company research, prefer `OPENROUTER_API_KEY` with `OPENROUTER_RESEARCH_MODEL=perplexity/sonar-deep-research`; use `PERPLEXITY_API_KEY` only if you call Perplexity directly. SMTP or Resend is only needed for outreach. Tap or HyperPay is only needed when paid wallet top-ups are introduced.

Do not place OpenAI, OpenRouter, Perplexity, or Apify tokens in any `VITE_` variable. Browser-exposed variables are visible to users; these keys must stay in Directus or n8n environment files only.

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
